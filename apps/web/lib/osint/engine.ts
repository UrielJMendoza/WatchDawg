import "server-only";
import gazetteerJson from "./data/gazetteer.json";
import type { GazetteerData } from "./gazetteer";
import type { Signal, Snapshot, SourceHealth, SourceStatus, WindowKey } from "./types";
import { WINDOWS } from "./types";
import type { CollectResult, SourceAdapter, Transport } from "./sources/types";
import { usgs } from "./sources/usgs";
import { eonet } from "./sources/eonet";
import { gdacs } from "./sources/gdacs";
import { gdelt } from "./sources/gdelt";
import { acled } from "./sources/acled";
import { crime } from "./sources/crime";
import { wire } from "./sources/wire";
import { fuse, rankIncident } from "./fusion";
import { buildHotspots, buildStats, buildTimeline } from "./aggregate";
import { buildRelations } from "./relations";

/**
 * Ingestion orchestrator. Each source is pulled on its own TTL, in parallel,
 * with a hard timeout; failures fall back to the last-known-good pull (marked
 * stale) until it exceeds the source's max staleness. Snapshots for each time
 * window are views over the same pool of signals, memoised briefly so any
 * number of viewers cost one upstream pull per source TTL.
 */

export const gazetteer = gazetteerJson as unknown as GazetteerData;
export const ADAPTERS: SourceAdapter[] = [usgs, gdacs, eonet, acled, gdelt, wire, crime];

const HORIZON_MS = WINDOWS["30d"];
const PULL_TIMEOUT_MS = 25_000;
const SNAPSHOT_TTL_MS = 20_000;
const MAX_INCIDENTS = 3000;
const UA = "WatchDawg/1.0 (+https://github.com/UrielJMendoza/WatchDawg; OSINT situational awareness)";
const MAX_BYTES = 25 * 1024 * 1024;

async function request(url: string, timeoutMs: number, init?: Parameters<Transport["text"]>[1]): Promise<Response> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    body: init?.body,
    headers: { "User-Agent": UA, Accept: "*/*", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error(`Payload too large from ${new URL(url).hostname}`);
  return res;
}

export const liveTransport: Transport = {
  async text(url, init) {
    const text = await (await request(url, init?.timeoutMs ?? 15_000, init)).text();
    if (text.length > MAX_BYTES) throw new Error("Payload too large");
    return text;
  },
  async bytes(url) {
    const buf = new Uint8Array(await (await request(url, 20_000)).arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error("Payload too large");
    return buf;
  },
};

interface PullState {
  result?: CollectResult;
  fetchedAt?: number;
  latencyMs?: number;
  lastError?: string;
  lastAttempt?: number;
  inflight?: Promise<void>;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function healthOf(adapter: SourceAdapter, st: PullState, now: number, disabled: string | null): SourceHealth {
  const m = adapter.meta;
  const r = st.result;
  const staleAge = st.fetchedAt ? now - st.fetchedAt : Infinity;
  const usable = !disabled && r && staleAge <= m.maxStaleMs;
  const stale = !!(usable && st.lastError);
  let status: SourceStatus = disabled ? "disabled" : "offline";
  let statusNote: string | undefined = disabled ?? (st.lastError ? `Upstream error: ${st.lastError}` : undefined);
  if (usable) {
    status = "ok";
    const rejectRatio = r.ledger.received ? r.ledger.rejected / r.ledger.received : 0;
    const partial = r.integrity && r.integrity.total > 0 ? r.integrity.passed / r.integrity.total : 1;
    if (stale) {
      status = "degraded";
      statusNote = `Serving last good pull from ${Math.round(staleAge / 60_000)} min ago — ${st.lastError}`;
    } else if (rejectRatio > 0.2) {
      status = "degraded";
      statusNote = `${Math.round(rejectRatio * 100)}% of records failed validation`;
    } else if (partial < (r.integrity?.check === "md5" ? 1 : 0.6)) {
      status = "degraded";
      statusNote = r.integrity?.detail;
    } else {
      statusNote = r.integrity?.detail;
    }
  } else if (!disabled && !st.lastAttempt) {
    statusNote = "Not yet pulled";
  }
  let newest: number | null = null;
  if (usable) for (const s of r.signals) newest = Math.max(newest ?? 0, s.time);
  return {
    id: m.id,
    name: m.name,
    kind: m.kind,
    reliability: m.reliability,
    homepage: m.homepage,
    description: m.description,
    coverage: m.coverage,
    status,
    statusNote,
    fetchedAt: st.fetchedAt ?? null,
    latencyMs: st.latencyMs ?? null,
    received: usable ? r.ledger.received : 0,
    accepted: usable ? r.ledger.accepted : 0,
    rejected: usable ? r.ledger.rejected : 0,
    filtered: usable ? r.ledger.filtered : 0,
    reasons: usable ? r.ledger.reasons : {},
    newest,
    integrity: usable ? r.integrity : undefined,
    stale,
  };
}

export interface Engine {
  getSnapshot(window: WindowKey): Promise<Snapshot>;
}

export function createEngine(
  transport: Transport,
  opts: { adapters?: SourceAdapter[]; clock?: () => number } = {},
): Engine {
  const adapters = opts.adapters ?? ADAPTERS;
  const clock = opts.clock ?? Date.now;
  const state = new Map<string, PullState>();
  const snapshots = new Map<WindowKey, { at: number; snap: Promise<Snapshot> }>();

  async function pull(adapter: SourceAdapter, now: number): Promise<PullState> {
    let st = state.get(adapter.meta.id);
    if (!st) {
      st = {};
      state.set(adapter.meta.id, st);
    }
    if (adapter.disabled?.()) return st;
    const fresh = st.fetchedAt && now - st.fetchedAt < adapter.meta.ttlMs;
    // After a failure, back off rather than hammering a dead upstream.
    const coolingDown = st.lastAttempt && st.lastError && now - st.lastAttempt < Math.min(adapter.meta.ttlMs, 60_000);
    if (fresh || coolingDown) return st;
    if (!st.inflight) {
      const s = st;
      const started = Date.now();
      s.lastAttempt = now;
      s.inflight = withTimeout(
        adapter.collect({ transport, now, horizonMs: HORIZON_MS, gazetteer }),
        PULL_TIMEOUT_MS,
        adapter.meta.name,
      )
        .then((result) => {
          s.result = result;
          s.fetchedAt = now;
          s.lastError = undefined;
        })
        .catch((err: unknown) => {
          s.lastError = err instanceof Error ? err.message : String(err);
        })
        .finally(() => {
          s.latencyMs = Date.now() - started;
          s.inflight = undefined;
        });
    }
    await st.inflight;
    return st;
  }

  async function build(window: WindowKey): Promise<Snapshot> {
    const now = clock();
    const states = await Promise.all(adapters.map((a) => pull(a, now)));
    const windowMs = WINDOWS[window];
    const sources = adapters.map((a, i) => healthOf(a, states[i], now, a.disabled?.() ?? null));

    const signals: Signal[] = [];
    const relationObs = states.flatMap((st, i) =>
      sources[i].status === "offline" || sources[i].status === "disabled" ? [] : st.result?.relations ?? [],
    );
    states.forEach((st, i) => {
      if (sources[i].status === "offline" || sources[i].status === "disabled") return;
      for (const s of st.result?.signals ?? []) {
        // EONET and GDACS list only *open* events; long-running ones (drought,
        // volcanoes, big fires) stay relevant on day-scale windows while open.
        const ongoing = (s.source === "eonet" || s.source === "gdacs") && windowMs >= WINDOWS["24h"];
        if (s.time >= now - windowMs || ongoing) signals.push(s);
      }
    });

    const seen = new Set<string>();
    const incidents = fuse(signals)
      .map((i) => ({ i, rank: rankIncident(i, now, windowMs) }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, MAX_INCIDENTS)
      .map(({ i }) => {
        // Hash collisions are astronomically rare but ids must be unique.
        let id = i.id;
        while (seen.has(id)) id = `${id}x`;
        seen.add(id);
        return id === i.id ? i : { ...i, id };
      });

    return {
      generatedAt: now,
      window,
      incidents,
      hotspots: buildHotspots(incidents, gazetteer, window, now, windowMs),
      relations: buildRelations(relationObs, window, now, windowMs),
      sources,
      stats: buildStats(incidents, signals.length),
      timeline: buildTimeline(signals, window, now),
    };
  }

  return {
    getSnapshot(window) {
      const hit = snapshots.get(window);
      const now = clock();
      if (hit && now - hit.at < SNAPSHOT_TTL_MS) return hit.snap;
      const snap = build(window);
      snapshots.set(window, { at: now, snap });
      snap.catch(() => snapshots.delete(window));
      return snap;
    },
  };
}

let live: Engine | null = null;

/** The production engine: live upstreams only. */
export function getSnapshot(window: WindowKey): Promise<Snapshot> {
  live ??= createEngine(liveTransport);
  return live.getSnapshot(window);
}
