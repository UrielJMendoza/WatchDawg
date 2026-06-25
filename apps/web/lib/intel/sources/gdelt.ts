import "server-only";
import type { FeedItem, IntelEvent, TimePoint } from "../types";
import { nationForPoint } from "../theaters";

/**
 * GDELT 2.0 client. Free, no API key. Called server-side only.
 *  - GEO API  -> geolocated mention density (map points)
 *  - DOC API  -> latest articles (live feed) + tone/volume timelines
 *
 * Docs: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
 *       https://blog.gdeltproject.org/gdelt-geo-2-0-api-debuts/
 */

const BASE = "https://api.gdeltproject.org/api/v2";
const UA = "WatchDawg-GOTHAM/1.0 (OSINT situational awareness)";

async function getJson<T>(url: string, timeoutMs = 12_000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`GDELT ${res.status}`);
    const text = await res.text();
    // GDELT occasionally returns an empty body or an HTML error page.
    if (!text || text.trimStart().startsWith("<")) {
      throw new Error("GDELT empty/non-JSON response");
    }
    return JSON.parse(text) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Parse GDELT's compact timestamp (YYYYMMDDTHHMMSSZ / YYYYMMDDHHMMSS) -> ISO. */
function parseGdeltDate(raw: string): string {
  const m = raw.replace(/[^0-9]/g, "");
  if (m.length < 8) return new Date().toISOString();
  const y = m.slice(0, 4);
  const mo = m.slice(4, 6);
  const d = m.slice(6, 8);
  const h = m.slice(8, 10) || "00";
  const mi = m.slice(10, 12) || "00";
  const s = m.slice(12, 14) || "00";
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? new Date().toISOString() : new Date(t).toISOString();
}

interface GeoFeature {
  geometry?: { type?: string; coordinates?: [number, number] };
  properties?: { name?: string; count?: number; shareimage?: string };
}
interface GeoResponse {
  features?: GeoFeature[];
}

/** Geolocated mention density for a query, clamped to a bbox, as IntelEvents. */
export async function fetchGeoEvents(
  query: string,
  bbox: [number, number, number, number],
  timespan = "1d",
): Promise<IntelEvent[]> {
  const url =
    `${BASE}/geo/geo?query=${encodeURIComponent(query)}` +
    `&format=GeoJSON&timespan=${encodeURIComponent(timespan)}`;
  const data = await getJson<GeoResponse>(url);
  const feats = Array.isArray(data.features) ? data.features : [];
  const [w, s, e, n] = bbox;

  const counts = feats
    .map((f) => f.properties?.count ?? 0)
    .filter((c) => c > 0);
  const max = counts.length ? Math.max(...counts) : 1;

  const out: IntelEvent[] = [];
  for (let i = 0; i < feats.length; i++) {
    const f = feats[i];
    const coords = f.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    const [lon, lat] = coords;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    const count = f.properties?.count ?? 0;
    out.push({
      id: `gd-${i}-${lon.toFixed(3)}-${lat.toFixed(3)}`,
      lat,
      lon,
      name: f.properties?.name ?? "Unknown",
      count,
      nation: nationForPoint(lon, lat),
      severity: Math.min(1, Math.sqrt(count / max)),
      source: "gdelt",
    });
  }
  return out;
}

interface Article {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  sourcecountry?: string;
}
interface ArtListResponse {
  articles?: Article[];
}

/** Latest articles for a query -> feed items for the live ticker. */
export async function fetchArticles(
  query: string,
  max = 60,
  timespan = "2d",
): Promise<FeedItem[]> {
  const url =
    `${BASE}/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=artlist&format=json&maxrecords=${max}` +
    `&sort=datedesc&timespan=${encodeURIComponent(timespan)}`;
  const data = await getJson<ArtListResponse>(url);
  const arts = Array.isArray(data.articles) ? data.articles : [];
  return arts
    .filter((a) => a.url && a.title)
    .map((a, i) => ({
      id: `art-${i}-${a.url}`,
      title: a.title as string,
      url: a.url as string,
      domain: a.domain ?? new URL(a.url as string).hostname,
      country: a.sourcecountry ?? "—",
      seen: a.seendate ? parseGdeltDate(a.seendate) : new Date().toISOString(),
      nation: null,
    }));
}

interface TimelineResponse {
  timeline?: Array<{ data?: Array<{ date?: string; value?: number }> }>;
}

/** Tone or volume timeline for a query. mode: "timelinetone" | "timelinevol". */
export async function fetchTimeline(
  query: string,
  mode: "timelinetone" | "timelinevol",
  timespan = "7d",
): Promise<TimePoint[]> {
  const url =
    `${BASE}/doc/doc?query=${encodeURIComponent(query)}` +
    `&mode=${mode}&format=json&timespan=${encodeURIComponent(timespan)}`;
  const data = await getJson<TimelineResponse>(url);
  const series = data.timeline?.[0]?.data ?? [];
  return series.map((p) => ({
    t: p.date ? parseGdeltDate(p.date) : new Date().toISOString(),
    v: typeof p.value === "number" ? p.value : 0,
  }));
}
