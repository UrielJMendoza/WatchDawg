import type {
  Category,
  Credibility,
  GeoPrecision,
  Incident,
  Reliability,
  Signal,
  SignalRef,
  SourceId,
} from "./types";
import { CATEGORIES } from "./taxonomy";
import { cellKey, haversineKm, neighbourKeys, weightedCentroid } from "./geo";
import { hashId } from "./validate";

/**
 * Multi-source fusion. Signals that describe the same happening — same kind
 * of event, close in space and time — are merged into one Incident, and the
 * incident's confidence rises with every *independent* source that agrees.
 */

type Family = "violence" | "unrest" | "political" | "humanitarian" | Category;

const FAMILY: Record<Category, Family> = {
  conflict: "violence",
  security: "violence",
  crime: "crime",
  unrest: "unrest",
  tension: "political",
  diplomacy: "political",
  humanitarian: "humanitarian",
  seismic: "seismic",
  volcanic: "volcanic",
  storm: "storm",
  flood: "flood",
  wildfire: "wildfire",
  hazard: "hazard",
};

const NATURAL = new Set<Family>(["seismic", "volcanic", "storm", "flood", "wildfire", "hazard"]);
/** Families where each record from one source is already a distinct event. */
const DISTINCT_PER_SOURCE = new Set<Family>([...NATURAL, "crime"]);

/** Merge radius (km) and time gap (ms) per family. */
const RULES: Record<string, { km: number; gapMs: number }> = {
  seismic: { km: 120, gapMs: 90 * 60_000 },
  volcanic: { km: 60, gapMs: 7 * 86_400_000 },
  storm: { km: 450, gapMs: 3 * 86_400_000 },
  flood: { km: 200, gapMs: 5 * 86_400_000 },
  wildfire: { km: 50, gapMs: 5 * 86_400_000 },
  hazard: { km: 250, gapMs: 7 * 86_400_000 },
  crime: { km: 2, gapMs: 12 * 3_600_000 },
  human: { km: 35, gapMs: 24 * 3_600_000 },
  humanRegion: { km: 120, gapMs: 24 * 3_600_000 },
};

/** How much a source's word is worth (Admiralty reliability → weight). */
export const RELIABILITY_WEIGHT: Record<Reliability, number> = {
  A: 0.95,
  B: 0.8,
  C: 0.6,
  D: 0.45,
  E: 0.3,
  F: 0.5,
};

export const SOURCE_RELIABILITY: Record<SourceId, Reliability> = {
  usgs: "A",
  eonet: "A",
  gdacs: "A",
  nws: "A",
  acled: "A",
  crime: "A",
  wire: "B",
  gdelt: "C",
};

const PRECISION_RANK: Record<GeoPrecision, number> = { exact: 4, city: 3, region: 2, country: 1 };
const PRECISION_WEIGHT: Record<GeoPrecision, number> = { exact: 10, city: 5, region: 2, country: 0.5 };

/** Title preference: authoritative instruments, then newsrooms, then machine coding. */
const TITLE_RANK: Record<SourceId, number> = { usgs: 6, gdacs: 5, nws: 5, eonet: 4, crime: 4, wire: 3, acled: 2, gdelt: 1 };

interface Draft {
  family: Family;
  signals: Signal[];
  lat: number;
  lon: number;
  precision: GeoPrecision;
  country?: string;
  lastSeen: number;
  sources: Set<SourceId>;
  keys: Set<string>;
  /** Content words of each member headline, for same-story matching. */
  stories: Story[];
}

interface Story {
  words: Set<string>;
  /** Located only to a country. */
  vague: boolean;
  /** That country is itself a guess (see Signal.geoWeak). */
  weak: boolean;
  country?: string;
}

const STOP = new Set([
  "the", "and", "for", "after", "with", "from", "into", "over", "says", "said", "least", "more", "than",
  "amid", "near", "about", "report", "new", "its", "has", "have", "are", "was", "were", "who", "that",
  "this", "what", "how", "why", "latest", "live", "update", "news", "photos", "video", "watch",
]);

/** Content words of a headline, lightly stemmed ("kills"/"killed" → "kill"). */
export function headlineWords(text: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  const norm = text.toLowerCase().replace(/\bair strike/g, "airstrike");
  for (let w of norm.split(/[^a-z0-9]+/)) {
    if (!w || STOP.has(w) || (w.length < 3 && !/^\d+$/.test(w))) continue;
    if (w.length > 5 && w.endsWith("ing")) w = w.slice(0, -3);
    else if (w.length > 4 && w.endsWith("ed")) w = w.slice(0, -2);
    else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    // "release"/"released" → "releas", "strike"/"strikes" → "strik".
    if (w.length > 4 && w.endsWith("e")) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

/** Live blogs and roundups cover many events under one URL and headline. */
const ROUNDUP = /\b(latest|live|updates?|roundup|as it happened|what we know|key events|day \d+|briefing|newsletter)\b/i;

/** Identity keys for the article behind a signal: its URL and its exact headline. */
function articleKeysOf(family: Family, s: Signal): string[] {
  const keys: string[] = [];
  if (ROUNDUP.test(s.headline ?? s.title)) return keys;
  if (s.url) keys.push(`${family}|u|${s.url.replace(/[?#].*$/, "").replace(/\/$/, "")}`);
  const words = headlineWords(s.headline);
  // Short headlines ("Explosion in Kyiv") are too generic to be identity.
  if (words.size >= 5) keys.push(`${family}|h|${[...words].sort().join(" ")}`);
  return keys;
}

/**
 * Two headlines tell the same story: at least three shared content words
 * covering most of the shorter one, including a number (a toll, a count)
 * or a fourth word.
 */
export function sameStory(a: Set<string>, b: Set<string>): boolean {
  if (a.size < 3 || b.size < 3) return false;
  let shared = 0;
  let numeric = false;
  for (const w of a) {
    if (!b.has(w)) continue;
    shared++;
    if (/^\d+$/.test(w)) numeric = true;
  }
  return shared >= 3 && shared / Math.min(a.size, b.size) >= 0.45 && (numeric || shared >= 4);
}

function ruleFor(d: { family: Family; precision: GeoPrecision }) {
  if (NATURAL.has(d.family) || d.family === "crime") return RULES[d.family];
  return d.precision === "exact" || d.precision === "city" ? RULES.human : RULES.humanRegion;
}

function compatible(d: Draft, s: Signal, family: Family): boolean {
  if (d.family !== family) return false;
  // A source never contradicts itself about natural hazards: two USGS
  // quakes are two quakes, not one.
  if (DISTINCT_PER_SOURCE.has(family) && d.sources.has(s.source)) return false;
  // Crime fuses block to block only. A news report placed at a city's
  // centre would otherwise attach to whichever police record sits nearest
  // it, lending a vehicle theft the severity of a mass shooting.
  if (family === "crime" && (d.precision !== "exact" || s.precision !== "exact")) return false;
  if (!NATURAL.has(family)) {
    if (d.country && s.country && d.country !== s.country) return false;
    // A fix that only names the country says nothing about *where*; such
    // reports fuse by story (see fuse), never by sharing a centroid.
    if (d.precision === "country" || s.precision === "country") return false;
  }
  const rule = ruleFor({ family, precision: s.precision });
  if (Math.abs(s.time - d.lastSeen) > rule.gapMs) return false;
  // A headline that only names a country ("quake strikes Japan") can still
  // corroborate a precisely located hazard somewhere inside that country.
  const vague = NATURAL.has(family) && (s.precision === "country" || d.precision === "country");
  return haversineKm(d.lat, d.lon, s.lat, s.lon) <= rule.km * (vague ? 6 : 1);
}

export function credibilityFor(confidence: number, independentSources: number): Credibility {
  if ((independentSources >= 2 && confidence >= 0.85) || confidence >= 0.94) return 1;
  if (confidence >= 0.75) return 2;
  if (confidence >= 0.5) return 3;
  if (confidence >= 0.3) return 4;
  return 5;
}

/** Noisy-OR over independent sources: each source's best evidence counts once. */
export function fuseConfidence(signals: Signal[]): number {
  const best = new Map<SourceId, number>();
  for (const s of signals) {
    const w = RELIABILITY_WEIGHT[SOURCE_RELIABILITY[s.source]] * s.quality;
    best.set(s.source, Math.max(best.get(s.source) ?? 0, w));
  }
  let miss = 1;
  for (const w of best.values()) miss *= 1 - w;
  return 1 - miss;
}

function finalize(d: Draft): Incident {
  const sig = d.signals;
  const lead = sig.reduce((a, b) => (b.severity * b.quality > a.severity * a.quality ? b : a));
  const titled = [...sig].sort(
    (a, b) =>
      TITLE_RANK[b.source] - TITLE_RANK[a.source] ||
      Number(!!b.headline) - Number(!!a.headline) ||
      b.reports - a.reports ||
      b.time - a.time,
  )[0];
  const title =
    titled.source === "gdelt" ? titled.headline ?? titled.title : titled.source === "wire" ? titled.title : titled.title;

  const precise = [...sig].sort(
    (a, b) => PRECISION_RANK[b.precision] - PRECISION_RANK[a.precision] || b.quality - a.quality,
  )[0];
  const pos = weightedCentroid(
    sig
      .filter((s) => PRECISION_RANK[s.precision] >= PRECISION_RANK[precise.precision] - 1)
      .map((s) => ({ lat: s.lat, lon: s.lon, w: PRECISION_WEIGHT[s.precision] * (0.2 + s.quality) })),
  );

  const confidence = fuseConfidence(sig);
  const sources = [...d.sources].sort();
  const reliability = sources
    .map((s) => SOURCE_RELIABILITY[s])
    .sort()[0] as Reliability;

  const outlets = new Set<string>();
  let extraOutlets = 0;
  let reports = 0;
  let firstSeen = Infinity;
  let lastSeen = 0;
  let severity = 0;
  const actors = new Map<string, number>();
  const tags = new Set<string>();
  const countries = new Map<string, number>();
  for (const s of sig) {
    if (s.outlet) outlets.add(s.outlet);
    if (s.source === "gdelt" && typeof s.metrics?.outlets === "number") extraOutlets += Math.max(0, s.metrics.outlets - 1);
    reports += s.reports;
    firstSeen = Math.min(firstSeen, s.firstTime ?? s.time);
    lastSeen = Math.max(lastSeen, s.time);
    severity = Math.max(severity, s.severity);
    for (const a of s.actors ?? []) actors.set(a, (actors.get(a) ?? 0) + s.reports);
    for (const t of s.tags ?? []) if (!t.startsWith("geo:") && !t.startsWith("outlet:")) tags.add(t);
    if (s.country) countries.set(s.country, (countries.get(s.country) ?? 0) + 1);
  }
  // Independent corroboration nudges severity up a little: many sources
  // reporting the same thing is itself a signal of scale.
  severity = Math.min(1, severity + 0.04 * (sources.length - 1));

  const refs: SignalRef[] = [...sig]
    .sort((a, b) => TITLE_RANK[b.source] - TITLE_RANK[a.source] || b.quality - a.quality || b.time - a.time)
    .slice(0, 6)
    .map((s) => ({
      source: s.source,
      title: s.headline ?? s.title,
      url: s.url,
      outlet: s.outlet,
      time: s.time,
    }));

  const anchor = [...sig].sort((a, b) => b.quality - a.quality || a.time - b.time || (a.key < b.key ? -1 : 1))[0];
  const label = lead.source === "gdelt" ? lead.title.split(" — ")[0] : CATEGORIES[lead.category].label;

  return {
    id: hashId(`${d.family}|${anchor.key}`),
    category: lead.category,
    title,
    label,
    summary: sig.find((s) => s.summary)?.summary,
    lat: pos.lat,
    lon: pos.lon,
    precision: precise.precision,
    place: precise.place,
    country: [...countries.entries()].sort((a, b) => b[1] - a[1])[0]?.[0],
    firstSeen,
    lastSeen,
    severity,
    confidence,
    reliability,
    credibility: credibilityFor(confidence, sources.length),
    sources,
    outlets: outlets.size + extraOutlets,
    reports,
    signals: refs,
    actors: actors.size ? [...actors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([a]) => a) : undefined,
    tags: tags.size ? [...tags].slice(0, 8) : undefined,
    metrics: { ...(sig.find((s) => s.source !== "gdelt" && s.metrics)?.metrics ?? lead.metrics) },
  };
}

/**
 * Fuse signals into incidents. Strongest evidence anchors first so weak
 * signals attach to strong ones rather than the other way round.
 */
export function fuse(signals: Signal[]): Incident[] {
  const CELL = 2; // degrees; neighbour scan covers ±2° ≈ 220 km, wider rules also check a ring
  const grid = new Map<string, Draft[]>();
  // Human-domain drafts by family and country, for same-story matching of
  // country-level reports that the distance rules can't reach.
  const byFamily = new Map<Family, Draft[]>();
  // One article is one story: GDELT codes an article once per place it
  // mentions, and syndicated copies repeat a headline word for word.
  const byArticle = new Map<string, Draft>();
  const drafts: Draft[] = [];
  const ordered = [...signals].sort(
    (a, b) =>
      RELIABILITY_WEIGHT[SOURCE_RELIABILITY[b.source]] * b.quality -
        RELIABILITY_WEIGHT[SOURCE_RELIABILITY[a.source]] * a.quality || b.time - a.time,
  );

  for (const s of ordered) {
    const family = FAMILY[s.category];
    const wide =
      ruleFor({ family, precision: s.precision }).km > 200 || (NATURAL.has(family) && s.precision === "country");
    const keys = wide ? neighbourKeys(s.lat, s.lon, CELL * 2).map((k) => `w${k}`) : neighbourKeys(s.lat, s.lon, CELL);
    const human = !NATURAL.has(family);
    const vague = s.precision === "country";
    const words = human ? headlineWords(s.headline) : new Set<string>();
    const story: Story = { words, vague, weak: !!s.geoWeak, country: s.country };
    const articleKeys = human ? articleKeysOf(family, s) : [];
    let best: Draft | null = null;
    for (const k of articleKeys) {
      const d = byArticle.get(k);
      if (d && !d.keys.has(s.key) && Math.abs(s.time - d.lastSeen) <= RULES.humanRegion.gapMs) {
        best = d;
        break;
      }
    }
    let bestKm = best ? 0 : Infinity;
    for (const k of best ? [] : keys) {
      for (const d of grid.get(k) ?? []) {
        if (d.keys.has(s.key) || !compatible(d, s, family)) continue;
        const km = haversineKm(d.lat, d.lon, s.lat, s.lon);
        if (km < bestKm) {
          best = d;
          bestKm = km;
        }
      }
    }
    if (!best && words.size) {
      // A report that only names the country joins the incident that tells
      // the same story in that country, or anywhere when either side's
      // country is only a guess. Two located reports never merge on
      // wording alone (two strikes, two cities, same phrasing).
      for (const d of byFamily.get(family) ?? []) {
        if (d.keys.has(s.key) || Math.abs(s.time - d.lastSeen) > RULES.humanRegion.gapMs) continue;
        const match = d.stories.some(
          (st) =>
            (vague || st.vague) &&
            ((!!s.country && st.country === s.country) || story.weak || st.weak) &&
            sameStory(words, st.words),
        );
        if (match) {
          best = d;
          break;
        }
      }
    }
    if (best) {
      if (words.size) best.stories.push(story);
      best.signals.push(s);
      best.sources.add(s.source);
      best.keys.add(s.key);
      best.lastSeen = Math.max(best.lastSeen, s.time);
      if (!best.country && s.country) best.country = s.country;
      for (const k of articleKeys) if (!byArticle.has(k)) byArticle.set(k, best);
      continue;
    }
    const d: Draft = {
      family,
      signals: [s],
      lat: s.lat,
      lon: s.lon,
      precision: s.precision,
      country: s.country,
      lastSeen: s.time,
      sources: new Set([s.source]),
      keys: new Set([s.key]),
      stories: words.size ? [story] : [],
    };
    drafts.push(d);
    for (const k of articleKeys) if (!byArticle.has(k)) byArticle.set(k, d);
    if (human) {
      const list = byFamily.get(family);
      if (list) list.push(d);
      else byFamily.set(family, [d]);
    }
    // Register in both the fine and the wide grid so either kind of lookup finds it.
    const fine = cellKey(s.lat, s.lon, CELL);
    const coarse = `w${cellKey(s.lat, s.lon, CELL * 2)}`;
    for (const k of [fine, coarse]) {
      const list = grid.get(k);
      if (list) list.push(d);
      else grid.set(k, [d]);
    }
  }

  return drafts.map(finalize);
}

/** Rank for display and payload trimming: bad, well-attested and recent first. */
export function rankIncident(i: Incident, now: number, windowMs: number): number {
  const age = Math.max(0, now - i.lastSeen) / windowMs;
  return i.severity * (0.35 + 0.65 * i.confidence) * (1 - 0.35 * age) + Math.log10(1 + i.reports) * 0.03;
}
