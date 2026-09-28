import type {
  Category,
  Domain,
  Hotspot,
  Incident,
  SnapshotStats,
  Signal,
  Timeline,
  WindowKey,
} from "./types";
import { CATEGORIES, domainOf } from "./taxonomy";
import { cellKey, haversineKm, neighbourKeys, weightedCentroid } from "./geo";
import { countryByIso2, type GazetteerData } from "./gazetteer";
import { hashId } from "./validate";

/** Timeline resolution per window: [bin size, bin count]. */
export const TIMELINE_BINS: Record<WindowKey, [number, number]> = {
  "1h": [5 * 60_000, 12],
  "6h": [15 * 60_000, 24],
  "24h": [30 * 60_000, 48],
  "7d": [3 * 3_600_000, 56],
  "30d": [86_400_000, 30],
};

const emptyDomains = (): Record<Domain, number> => ({ security: 0, civil: 0, hazard: 0 });

export function buildTimeline(signals: Signal[], window: WindowKey, now: number): Timeline {
  const [binMs, bins] = TIMELINE_BINS[window];
  const end = Math.ceil(now / binMs) * binMs;
  const start = end - binMs * bins;
  const series: Record<Domain, number[]> = {
    security: new Array(bins).fill(0),
    civil: new Array(bins).fill(0),
    hazard: new Array(bins).fill(0),
  };
  for (const s of signals) {
    const i = Math.floor((s.time - start) / binMs);
    if (i >= 0 && i < bins) series[domainOf(s.category)][i]++;
  }
  return { start, binMs, bins, series };
}

const HOTSPOT_KM = 300;
const PRECISION_FACTOR = { exact: 1, city: 1, region: 0.7, country: 0.3 } as const;

/**
 * Greedy density clustering of incidents into hotspots. Each incident weighs
 * severity × confidence (discounted for vague geolocation), so a hotspot is a
 * place with a lot of bad, well-attested things happening — not merely a
 * place that gets a lot of press.
 */
export function buildHotspots(
  incidents: Incident[],
  gaz: GazetteerData,
  window: WindowKey,
  now: number,
  windowMs: number,
  limit = 16,
): Hotspot[] {
  const weighted = incidents
    .map((i) => ({ i, w: i.severity * (0.3 + 0.7 * i.confidence) * PRECISION_FACTOR[i.precision] }))
    .filter((x) => x.w > 0.04)
    .sort((a, b) => b.w - a.w);

  const CELL = 3;
  const grid = new Map<string, number[]>();
  const clusters: Array<{ lat: number; lon: number; members: typeof weighted }> = [];
  for (const x of weighted) {
    let best = -1;
    let bestKm = Infinity;
    for (const k of neighbourKeys(x.i.lat, x.i.lon, CELL)) {
      for (const ci of grid.get(k) ?? []) {
        const c = clusters[ci];
        const km = haversineKm(c.lat, c.lon, x.i.lat, x.i.lon);
        if (km <= HOTSPOT_KM && km < bestKm) {
          best = ci;
          bestKm = km;
        }
      }
    }
    if (best >= 0) {
      clusters[best].members.push(x);
      continue;
    }
    clusters.push({ lat: x.i.lat, lon: x.i.lon, members: [x] });
    const k = cellKey(x.i.lat, x.i.lon, CELL);
    const list = grid.get(k);
    if (list) list.push(clusters.length - 1);
    else grid.set(k, [clusters.length - 1]);
  }

  const bins = TIMELINE_BINS[window][1];
  const sparkBins = Math.min(24, bins);
  const sparkMs = windowMs / sparkBins;
  const recentCut = now - windowMs * 0.25;

  const hotspots: Hotspot[] = [];
  for (const c of clusters) {
    if (c.members.length < 3) continue;
    const pos = weightedCentroid(c.members.map((m) => ({ lat: m.i.lat, lon: m.i.lon, w: m.w })));
    let score = 0, maxSeverity = 0, radius = 50, recent = 0;
    const domains = emptyDomains();
    const cats = new Map<Category, number>();
    const countries = new Map<string, number>();
    const places = new Map<string, number>();
    const spark = new Array(sparkBins).fill(0);
    for (const { i, w } of c.members) {
      score += w;
      maxSeverity = Math.max(maxSeverity, i.severity);
      if (i.precision !== "country") radius = Math.max(radius, haversineKm(pos.lat, pos.lon, i.lat, i.lon));
      domains[domainOf(i.category)]++;
      cats.set(i.category, (cats.get(i.category) ?? 0) + w);
      if (i.country) countries.set(i.country, (countries.get(i.country) ?? 0) + w);
      if (i.precision !== "country") {
        const short = i.place.split(",")[0].trim();
        if (short) places.set(short, (places.get(short) ?? 0) + w);
      }
      if (i.lastSeen >= recentCut) recent++;
      const b = Math.floor((i.lastSeen - (now - windowMs)) / sparkMs);
      if (b >= 0 && b < sparkBins) spark[b]++;
    }
    const n = c.members.length;
    const rateRecent = recent / 0.25;
    const rateOld = (n - recent) / 0.75;
    const trend = rateRecent + rateOld > 0 ? (rateRecent - rateOld) / (rateRecent + rateOld) : 0;
    const iso2 = [...countries.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const country = countryByIso2(gaz, iso2);
    const topPlace = [...places.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topCategory = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? c.members[0].i.category;
    const name = topPlace && country && topPlace !== country.name
      ? `${topPlace}, ${country.name}`
      : topPlace ?? country?.name ?? CATEGORIES[topCategory].label;
    hotspots.push({
      id: hashId(`hs|${c.members[0].i.id}`),
      name,
      country: iso2,
      lat: pos.lat,
      lon: pos.lon,
      radiusKm: Math.round(Math.min(radius, HOTSPOT_KM * 1.5)),
      incidents: n,
      score: Number(score.toFixed(3)),
      maxSeverity,
      domains,
      topCategory,
      trend: Number(trend.toFixed(3)),
      spark,
      incidentIds: c.members.slice(0, 60).map((m) => m.i.id),
    });
  }
  return hotspots.sort((a, b) => b.score - a.score).slice(0, limit);
}

export function buildStats(incidents: Incident[], signalCount: number): SnapshotStats {
  const byCategory: Partial<Record<Category, number>> = {};
  const byDomain = emptyDomains();
  const countries = new Set<string>();
  let corroborated = 0, critical = 0;
  for (const i of incidents) {
    byCategory[i.category] = (byCategory[i.category] ?? 0) + 1;
    byDomain[domainOf(i.category)]++;
    if (i.country) countries.add(i.country);
    if (i.sources.length >= 2) corroborated++;
    if (i.severity >= 0.8) critical++;
  }
  return {
    incidents: incidents.length,
    signals: signalCount,
    corroborated,
    critical,
    byCategory,
    byDomain,
    countries: countries.size,
  };
}
