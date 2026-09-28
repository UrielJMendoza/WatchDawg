import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import type { Category, GeoPrecision, Signal } from "../types";
import { CAMEO_ROOTS_KEPT, VIOLENCE_VOCAB, cameo, domainOf } from "../taxonomy";
import { countryByIso3, stripDiacritics, type GazetteerData } from "../gazetteer";
import {
  checkCoords,
  checkTime,
  clamp01,
  headlineFromUrl,
  hostOf,
  Ledger,
  safeUrl,
  titleCase,
} from "../validate";
import type { CollectContext, CollectResult, RelationObs, SourceAdapter, Transport } from "./types";

/**
 * GDELT 2.0 Event Database — machine-coded events from worldwide news,
 * published as a new export every 15 minutes.
 * http://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf
 *
 * Validation layers:
 *  1. Integrity   — the newest export's MD5 is checked against the manifest
 *                   in lastupdate.txt before it is parsed.
 *  2. Structure   — every row must have exactly 61 tab-separated columns.
 *  3. Values      — coordinates, timestamps and URLs are range-checked.
 *  4. Relevance   — only CAMEO roots that describe real-world activity.
 *  5. Evidence    — rows are grouped per place + category; a group needs at
 *                   least 3 articles or 2 independent outlets to surface.
 */

const HOSTS = ["http://data.gdeltproject.org", "https://data.gdeltproject.org"];
export const GDELT_LASTUPDATE_PATH = "/gdeltv2/lastupdate.txt";
const STEP_MS = 15 * 60_000;
const MAX_FILES_PER_PULL = 8;
const MAX_GROUPS = 1600;
const COLUMNS = 61;

interface Row {
  time: number;
  code: string;
  category: Category;
  label: string;
  severity: number;
  goldstein: number;
  articles: number;
  sources: number;
  tone: number;
  actor1: string;
  actor2: string;
  /** CAMEO actor country codes (ISO alpha-3 for states). */
  actor1Country: string;
  actor2Country: string;
  geoType: number;
  geoName: string;
  lat: number;
  lon: number;
  featureId: string;
  url: string;
  outlet: string;
}

interface FileEntry {
  stamp: string;
  rows: Row[];
  ledger: Ledger;
  md5: "passed" | "failed" | "unverified";
}

/** Immutable 15-minute exports, parsed once per process. */
const fileCache = new Map<string, FileEntry>();

function stampToMs(stamp: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(stamp);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

function msToStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

export function parseManifest(text: string): { stamp: string; md5: string; size: number; url: string } | null {
  for (const line of text.split(/\r?\n/)) {
    const [size, md5, url] = line.trim().split(/\s+/);
    if (!url?.endsWith(".export.CSV.zip")) continue;
    const stamp = /(\d{14})\.export\.CSV\.zip$/.exec(url)?.[1];
    if (!stamp || !/^[0-9a-f]{32}$/i.test(md5 ?? "")) return null;
    return { stamp, md5: md5.toLowerCase(), size: Number(size), url };
  }
  return null;
}

/** GDELT place names end with the country: "Kharkiv, Kharkivs'ka Oblast', Ukraine". */
const COUNTRY_QUIRKS: Record<string, string> = {
  "korea, south": "KR", "korea, north": "KP", "south korea": "KR", "north korea": "KP",
  "congo (kinshasa)": "CD", "congo (brazzaville)": "CG", "democratic republic of the congo": "CD",
  burma: "MM", "gaza strip": "PS", "west bank": "PS", "occupied palestinian territory": "PS",
  "ivory coast": "CI", "cote d'ivoire": "CI", "united kingdom": "GB", "czech republic": "CZ",
  "macedonia": "MK", "swaziland": "SZ", "east timor": "TL", "vatican city": "VA",
};

const countryMatchers = new WeakMap<GazetteerData, Array<[string, string]>>();

function countryFromPlace(gaz: GazetteerData, fullName: string): string | undefined {
  let list = countryMatchers.get(gaz);
  if (!list) {
    list = Object.entries(COUNTRY_QUIRKS);
    for (const c of gaz.countries) {
      list.push([c.name.toLowerCase(), c.iso2]);
      for (const a of c.aliases) if (a.length > 4) list.push([a.toLowerCase(), c.iso2]);
    }
    list.sort((a, b) => b[0].length - a[0].length);
    countryMatchers.set(gaz, list);
  }
  const s = stripDiacritics(fullName).toLowerCase();
  for (const [name, iso2] of list) {
    if (s === name || s.endsWith(`, ${name}`)) return iso2;
  }
  return undefined;
}

export function parseExport(tsv: string, now: number, horizonMs: number): { rows: Row[]; ledger: Ledger } {
  const ledger = new Ledger();
  const rows: Row[] = [];
  for (const line of tsv.split("\n")) {
    if (!line.trim()) continue;
    ledger.seen();
    const c = line.replace(/\r$/, "").split("\t");
    if (c.length !== COLUMNS) {
      ledger.reject("schema.columns");
      continue;
    }
    const root = c[28];
    if (!CAMEO_ROOTS_KEPT.has(root)) {
      ledger.filter("relevance.cameo_root");
      continue;
    }
    const geoType = Number(c[51]);
    if (!geoType || c[56] === "" || c[57] === "") {
      ledger.filter("geo.unresolved");
      continue;
    }
    const lat = Number(c[56]);
    const lon = Number(c[57]);
    const coordErr = checkCoords(lat, lon);
    if (coordErr) {
      ledger.reject(coordErr);
      continue;
    }
    const time = stampToMs(c[59]);
    const timeErr = checkTime(time, now, horizonMs);
    if (timeErr) {
      if (timeErr === "window.stale") ledger.filter(timeErr);
      else ledger.reject(timeErr);
      continue;
    }
    const url = safeUrl(c[60]);
    if (!url) {
      ledger.reject("url.invalid");
      continue;
    }
    const meta = cameo(c[26]);
    if (!meta) {
      ledger.reject("cameo.unknown");
      continue;
    }
    const articles = Number(c[33]);
    const sources = Number(c[32]);
    if (!Number.isFinite(articles) || articles < 1 || !Number.isFinite(sources)) {
      ledger.reject("value.counts");
      continue;
    }
    rows.push({
      time,
      code: c[26],
      category: meta.category,
      label: meta.label,
      severity: meta.severity,
      goldstein: Number(c[30]) || 0,
      articles,
      sources,
      tone: Number(c[34]) || 0,
      actor1: c[6],
      actor2: c[16],
      actor1Country: c[7],
      actor2Country: c[17],
      geoType,
      geoName: c[52],
      lat,
      lon,
      featureId: c[58],
      url,
      outlet: hostOf(url) ?? "unknown",
    });
    ledger.accept();
  }
  return { rows, ledger };
}

async function fetchFile(
  transport: Transport,
  stamp: string,
  expectMd5: string | null,
  now: number,
  horizonMs: number,
): Promise<FileEntry> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      const zip = await transport.bytes(`${host}/gdeltv2/${stamp}.export.CSV.zip`);
      let md5: FileEntry["md5"] = "unverified";
      if (expectMd5) {
        const got = createHash("md5").update(zip).digest("hex");
        if (got !== expectMd5) {
          // Corrupt or tampered download — refuse to parse it.
          const ledger = new Ledger();
          ledger.seen();
          ledger.reject("integrity.md5");
          return { stamp, rows: [], ledger, md5: "failed" };
        }
        md5 = "passed";
      }
      const files = unzipSync(zip);
      const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(".csv"));
      if (!name) throw new Error("GDELT archive has no CSV member");
      const tsv = new TextDecoder("utf-8").decode(files[name]);
      const { rows, ledger } = parseExport(tsv, now, horizonMs);
      return { stamp, rows, ledger, md5 };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("GDELT file fetch failed");
}

interface Group {
  rows: Row[];
  articles: number;
  outlets: Set<string>;
  urls: Set<string>;
}

function groupRows(rows: Row[]): Map<string, Group> {
  const groups = new Map<string, Group>();
  for (const r of rows) {
    const where = r.featureId || `${r.lat.toFixed(2)},${r.lon.toFixed(2)}`;
    const key = `${where}|${r.category}`;
    let g = groups.get(key);
    if (!g) {
      g = { rows: [], articles: 0, outlets: new Set(), urls: new Set() };
      groups.set(key, g);
    }
    g.rows.push(r);
    g.articles += r.articles;
    g.outlets.add(r.outlet);
    g.urls.add(r.url);
  }
  return groups;
}

const PRECISION: Record<number, GeoPrecision> = { 1: "country", 2: "region", 3: "city", 4: "city", 5: "region" };

function topActors(rows: Row[]): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const a of [r.actor1, r.actor2]) {
      if (a && a.length > 1) counts.set(a, (counts.get(a) ?? 0) + r.articles);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([a]) => titleCase(a));
}

export function groupsToSignals(
  rows: Row[],
  gaz: GazetteerData,
  ledger: Ledger,
): Signal[] {
  const signals: Signal[] = [];
  for (const [key, g] of groupRows(rows)) {
    const lead = g.rows.reduce((a, b) => (b.severity * b.articles > a.severity * a.articles ? b : a));
    const precision = PRECISION[lead.geoType] ?? "region";
    if (precision === "country" && (lead.category === "diplomacy" || lead.category === "tension")) {
      ledger.filter("geo.country_level");
      continue;
    }
    if (g.articles < 3 && g.outlets.size < 2) {
      ledger.filter("evidence.insufficient");
      continue;
    }
    let time = 0, first = Infinity, goldstein = 0, toneSum = 0;
    let severity = 0;
    for (const r of g.rows) {
      time = Math.max(time, r.time);
      first = Math.min(first, r.time);
      goldstein = Math.min(goldstein, r.goldstein);
      toneSum += r.tone * r.articles;
      severity = Math.max(severity, r.severity);
    }
    // Cross-validate violent coding against the article's own words. CAMEO
    // assigns "assault" to court reporting and "fight" to sports and tax
    // disputes; a headline with no violent vocabulary vetoes the coding.
    const headline = headlineFromUrl(lead.url, [lead.geoName, ...topActors(g.rows)]);
    if (domainOf(lead.category) === "security") {
      if (headline && !VIOLENCE_VOCAB.test(headline)) {
        ledger.filter("relevance.headline_mismatch");
        continue;
      }
      if (!headline && g.outlets.size < 2) {
        ledger.filter("evidence.unverifiable");
        continue;
      }
    }
    const attention = Math.min(1, Math.log10(1 + g.articles) / 2);
    const geoName = lead.geoName.replace(/\s*\(general\)/gi, "");
    const place = geoName.split(",")[0].trim() || geoName;
    signals.push({
      key: `gdelt:${key}`,
      source: "gdelt",
      category: lead.category,
      title: `${lead.label} — ${place}`,
      headline,
      url: lead.url,
      outlet: lead.outlet,
      lat: lead.lat,
      lon: lead.lon,
      precision,
      place: geoName,
      country: countryFromPlace(gaz, geoName),
      time,
      firstTime: first,
      severity: clamp01(severity * (0.75 + 0.25 * attention) * (precision === "country" ? 0.85 : 1)),
      quality: clamp01(0.2 + 0.15 * Math.log2(1 + g.outlets.size) + 0.1 * Math.log10(1 + g.articles)),
      reports: g.articles,
      actors: topActors(g.rows),
      tags: [`cameo:${lead.code}`, ...(g.outlets.size > 1 ? ["multi-outlet"] : ["single-outlet"])],
      metrics: {
        articles: g.articles,
        outlets: g.outlets.size,
        goldstein: Number(goldstein.toFixed(1)),
        tone: Number((toneSum / Math.max(1, g.articles)).toFixed(2)),
        cameo: lead.code,
      },
    });
  }
  signals.sort((a, b) => b.severity * Math.log2(1 + b.reports) - a.severity * Math.log2(1 + a.reports));
  if (signals.length > MAX_GROUPS) {
    for (let i = MAX_GROUPS; i < signals.length; i++) ledger.filter("volume.cap");
    signals.length = MAX_GROUPS;
  }
  return signals;
}

export const gdelt: SourceAdapter = {
  meta: {
    id: "gdelt",
    name: "GDELT Event Database",
    kind: "Machine-coded global news",
    reliability: "C",
    homepage: "https://www.gdeltproject.org/",
    description: "Conflict, unrest and diplomatic events machine-coded (CAMEO) from worldwide news every 15 minutes.",
    ttlMs: 90_000,
    maxStaleMs: 6 * 3_600_000,
    coverage: "Rolling 24 hours · new export every 15 minutes",
  },
  async collect(ctx: CollectContext): Promise<CollectResult> {
    let manifestText: string | null = null;
    let lastErr: unknown;
    for (const host of HOSTS) {
      try {
        manifestText = await ctx.transport.text(`${host}${GDELT_LASTUPDATE_PATH}`);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (manifestText == null) throw lastErr instanceof Error ? lastErr : new Error("GDELT manifest unreachable");
    const manifest = parseManifest(manifestText);
    if (!manifest) throw new Error("GDELT manifest failed validation");

    const latest = stampToMs(manifest.stamp);
    const needed = Math.min(96, Math.ceil(ctx.horizonMs / STEP_MS));
    const wanted: string[] = [];
    for (let i = 0; i < needed; i++) wanted.push(msToStamp(latest - i * STEP_MS));

    // Newest first, bounded per pull; the window fills in over successive pulls.
    const missing = wanted.filter((s) => !fileCache.has(s)).slice(0, MAX_FILES_PER_PULL);
    const results = await Promise.allSettled(
      missing.map((stamp) =>
        fetchFile(ctx.transport, stamp, stamp === manifest.stamp ? manifest.md5 : null, ctx.now, ctx.horizonMs),
      ),
    );
    results.forEach((r) => {
      if (r.status === "fulfilled") fileCache.set(r.value.stamp, r.value);
    });

    // Evict exports that have aged out of the longest window.
    const keep = new Set(wanted);
    for (const stamp of fileCache.keys()) if (!keep.has(stamp)) fileCache.delete(stamp);

    const entries = wanted.map((s) => fileCache.get(s)).filter((e): e is FileEntry => !!e);
    if (!entries.length) throw new Error("No GDELT exports could be retrieved");

    const ledger = new Ledger();
    const rows: Row[] = [];
    let passed = 0, total = 0;
    for (const e of entries) {
      ledger.received += e.ledger.received;
      ledger.accepted += e.ledger.accepted;
      ledger.rejected += e.ledger.rejected;
      ledger.filtered += e.ledger.filtered;
      for (const [k, v] of Object.entries(e.ledger.reasons)) ledger.reasons[k] = (ledger.reasons[k] ?? 0) + v;
      if (e.md5 !== "unverified") {
        total++;
        if (e.md5 === "passed") passed++;
      }
      // Re-apply the window: cached rows may have aged out since parsing.
      for (const r of e.rows) if (r.time >= ctx.now - ctx.horizonMs) rows.push(r);
    }
    const signals = groupsToSignals(rows, ctx.gazetteer, ledger);
    return {
      signals,
      relations: relationObservations(rows, ctx.gazetteer),
      ledger,
      integrity: {
        check: "md5",
        passed,
        total,
        detail: `${entries.length} of ${needed} 15-min exports loaded; ${total} MD5-verified against the manifest, the rest schema-validated`,
      },
    };
  },
};

/**
 * Actor-country pairs: rows where both actors are identified with different
 * states. Regional pseudo-codes (AFR, EUR, …) don't resolve and are dropped.
 */
export function relationObservations(rows: Row[], gaz: GazetteerData): RelationObs[] {
  const out: RelationObs[] = [];
  for (const r of rows) {
    if (!r.actor1Country || !r.actor2Country || r.actor1Country === r.actor2Country) continue;
    const a = countryByIso3(gaz, r.actor1Country);
    const b = countryByIso3(gaz, r.actor2Country);
    if (!a || !b || a.iso2 === b.iso2) continue;
    out.push({
      from: a.iso2,
      to: b.iso2,
      time: r.time,
      articles: r.articles,
      outlet: r.outlet,
      goldstein: r.goldstein,
      tone: r.tone,
      category: r.category,
    });
  }
  return out;
}

/** Test hook. */
export function _resetGdeltCache(): void {
  fileCache.clear();
}
