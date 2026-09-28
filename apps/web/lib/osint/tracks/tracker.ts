import "server-only";
import type { Transport } from "../sources/types";
import type { Ledger } from "../validate";
import { liveTransport } from "../engine";
import { collectAircraft } from "./aircraft";
import { collectSatellites, SAT_GROUPS } from "./satellites";
import type { AirPayload, FeedHealth, SpacePayload } from "./types";

/**
 * Cached pullers for the tracks layers. Aircraft refresh every 15 s;
 * CelesTrak asks clients not to re-download a group more than every couple
 * of hours, so element sets are cached for three.
 */

interface Cache<T> {
  value?: T;
  fetchedAt?: number;
  latencyMs?: number;
  error?: string;
  attemptAt?: number;
  inflight?: Promise<void>;
}

function health(
  meta: Omit<FeedHealth, "status" | "statusNote" | "fetchedAt" | "latencyMs" | "received" | "accepted" | "rejected" | "filtered" | "reasons">,
  c: Cache<{ ledger: Ledger; note?: string }>,
  now: number,
  maxStaleMs: number,
): FeedHealth {
  const usable = c.value && c.fetchedAt && now - c.fetchedAt <= maxStaleMs;
  const l = usable ? c.value!.ledger : null;
  let status: FeedHealth["status"] = usable ? (c.error ? "degraded" : "ok") : "offline";
  if (l && l.received && l.rejected / l.received > 0.2) status = "degraded";
  return {
    ...meta,
    status,
    statusNote: c.error ? `Upstream error: ${c.error}` : c.value?.note,
    fetchedAt: c.fetchedAt ?? null,
    latencyMs: c.latencyMs ?? null,
    received: l?.received ?? 0,
    accepted: l?.accepted ?? 0,
    rejected: l?.rejected ?? 0,
    filtered: l?.filtered ?? 0,
    reasons: l?.reasons ?? {},
  };
}

async function refresh<T>(c: Cache<T>, ttlMs: number, now: number, run: () => Promise<T>): Promise<void> {
  const fresh = c.fetchedAt && now - c.fetchedAt < ttlMs;
  const cooling = c.error && c.attemptAt && now - c.attemptAt < Math.min(ttlMs, 60_000);
  if (fresh || cooling) return;
  if (!c.inflight) {
    const started = Date.now();
    c.attemptAt = now;
    c.inflight = run()
      .then((v) => {
        c.value = v;
        c.fetchedAt = now;
        c.error = undefined;
      })
      .catch((e: unknown) => {
        c.error = e instanceof Error ? e.message : String(e);
      })
      .finally(() => {
        c.latencyMs = Date.now() - started;
        c.inflight = undefined;
      });
  }
  await c.inflight;
}

export function createTracker(transport: Transport, clock: () => number = Date.now) {
  const air: Cache<{ aircraft: AirPayload["aircraft"]; ledger: Ledger; note?: string }> = {};
  const space: Cache<{ satellites: SpacePayload["satellites"]; ledger: Ledger; note?: string }> = {};

  return {
    async air(): Promise<AirPayload> {
      const now = clock();
      await refresh(air, 15_000, now, async () => {
        const r = await collectAircraft(transport);
        return { aircraft: r.aircraft, ledger: r.ledger, note: `via ${r.host}` };
      });
      return {
        generatedAt: now,
        aircraft: air.value && air.fetchedAt && now - air.fetchedAt < 5 * 60_000 ? air.value.aircraft : [],
        health: health(
          {
            id: "adsb",
            name: "ADS-B exchange networks",
            reliability: "B",
            homepage: "https://adsb.lol/",
            description: "Military-flagged aircraft and emergency squawks (7500/7600/7700) from community ADS-B receivers (adsb.lol, airplanes.live).",
            coverage: "Live · positions under 90 s old",
          },
          air,
          now,
          5 * 60_000,
        ),
      };
    },
    async space(): Promise<SpacePayload> {
      const now = clock();
      await refresh(space, 3 * 3_600_000, now, async () => {
        const r = await collectSatellites(transport, now);
        return { satellites: r.satellites, ledger: r.ledger, note: `${r.groupsOk} of ${SAT_GROUPS.length} groups` };
      });
      return {
        generatedAt: now,
        satellites: space.value?.satellites ?? [],
        health: health(
          {
            id: "celestrak",
            name: "CelesTrak orbital elements",
            reliability: "A",
            homepage: "https://celestrak.org/",
            description: "Two-line element sets for space stations, military, Earth-observation and weather satellites; positions computed with SGP4.",
            coverage: "Element sets under 21 days old · refreshed every 3 h",
          },
          space,
          now,
          24 * 3_600_000,
        ),
      };
    },
  };
}

let live: ReturnType<typeof createTracker> | null = null;

export function tracker() {
  live ??= createTracker(liveTransport);
  return live;
}
