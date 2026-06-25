import "server-only";
import type { IntelEvent } from "../types";
import { nationForPoint } from "../theaters";

/**
 * ACLED (Armed Conflict Location & Event Data). Best-in-class conflict events
 * with precise lat/lon, type and fatalities. Requires registration:
 *   ACLED_API_KEY + ACLED_EMAIL in the environment.
 *
 * Entirely OPTIONAL — when keys are absent this returns [] and the rest of the
 * stack runs on GDELT alone. Docs: https://acleddata.com/resources/general-guides/
 */

const BASE = "https://api.acleddata.com/acled/read";

export function acledEnabled(): boolean {
  return Boolean(process.env.ACLED_API_KEY && process.env.ACLED_EMAIL);
}

interface AcledRow {
  latitude?: string;
  longitude?: string;
  event_type?: string;
  sub_event_type?: string;
  location?: string;
  fatalities?: string;
  event_date?: string;
}
interface AcledResponse {
  data?: AcledRow[];
}

/** Recent conflict events for a country (e.g. "Ukraine") as IntelEvents. */
export async function fetchAcledEvents(
  country: string,
  daysBack = 14,
  limit = 400,
): Promise<IntelEvent[]> {
  if (!acledEnabled()) return [];

  const since = new Date(Date.now() - daysBack * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const url =
    `${BASE}?key=${process.env.ACLED_API_KEY}` +
    `&email=${encodeURIComponent(process.env.ACLED_EMAIL as string)}` +
    `&country=${encodeURIComponent(country)}` +
    `&event_date=${since}&event_date_where=%3E%3D` +
    `&limit=${limit}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 14_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ACLED ${res.status}`);
    const data = (await res.json()) as AcledResponse;
    const rows = Array.isArray(data.data) ? data.data : [];
    const out: IntelEvent[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const fatalities = Number(r.fatalities) || 0;
      out.push({
        id: `acled-${i}-${lon.toFixed(3)}-${lat.toFixed(3)}`,
        lat,
        lon,
        name: `${r.sub_event_type ?? r.event_type ?? "Event"} — ${r.location ?? country}`,
        count: 1 + fatalities,
        nation: nationForPoint(lon, lat),
        severity: Math.min(1, 0.45 + Math.log10(1 + fatalities) / 2),
        source: "acled",
      });
    }
    return out;
  } finally {
    clearTimeout(timer);
  }
}
