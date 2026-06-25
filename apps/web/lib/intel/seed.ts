import type { IntelEvent } from "./types";
import { nationForPoint } from "./theaters";

/**
 * Static fallback hotspots with REAL coordinates for well-known locations
 * across both theaters. Used only when the live uplink is degraded/offline so
 * the command center is never blank. These carry `source: "seed"` and the UI
 * flags the picture as DEGRADED when they are in play.
 */
const RAW: Array<{ name: string; lat: number; lon: number; w: number }> = [
  // Middle East
  { name: "Tehran, Iran", lat: 35.6892, lon: 51.389, w: 0.9 },
  { name: "Isfahan, Iran", lat: 32.6539, lon: 51.666, w: 0.7 },
  { name: "Natanz, Iran", lat: 33.7248, lon: 51.726, w: 0.85 },
  { name: "Bandar Abbas, Iran", lat: 27.1865, lon: 56.2808, w: 0.6 },
  { name: "Jerusalem, Israel", lat: 31.7683, lon: 35.2137, w: 0.85 },
  { name: "Tel Aviv, Israel", lat: 32.0853, lon: 34.7818, w: 0.8 },
  { name: "Haifa, Israel", lat: 32.7940, lon: 34.9896, w: 0.55 },
  { name: "Gaza", lat: 31.5017, lon: 34.4668, w: 0.95 },
  { name: "Beirut, Lebanon", lat: 33.8938, lon: 35.5018, w: 0.7 },
  { name: "Damascus, Syria", lat: 33.5138, lon: 36.2765, w: 0.65 },
  { name: "Strait of Hormuz", lat: 26.5667, lon: 56.25, w: 0.75 },
  // Eastern Europe
  { name: "Kyiv, Ukraine", lat: 50.4501, lon: 30.5234, w: 0.85 },
  { name: "Kharkiv, Ukraine", lat: 49.9935, lon: 36.2304, w: 0.8 },
  { name: "Bakhmut, Ukraine", lat: 48.5957, lon: 38.0, w: 0.9 },
  { name: "Avdiivka, Ukraine", lat: 48.1392, lon: 37.7428, w: 0.88 },
  { name: "Zaporizhzhia, Ukraine", lat: 47.8388, lon: 35.1396, w: 0.82 },
  { name: "Kherson, Ukraine", lat: 46.6354, lon: 32.6169, w: 0.78 },
  { name: "Odesa, Ukraine", lat: 46.4825, lon: 30.7233, w: 0.6 },
  { name: "Sevastopol, Crimea", lat: 44.6166, lon: 33.5254, w: 0.7 },
  { name: "Belgorod, Russia", lat: 50.5957, lon: 36.5873, w: 0.65 },
  { name: "Moscow, Russia", lat: 55.7558, lon: 37.6173, w: 0.7 },
  { name: "Rostov-on-Don, Russia", lat: 47.2357, lon: 39.7015, w: 0.6 },
];

export function seedEvents(): IntelEvent[] {
  return RAW.map((r, i) => ({
    id: `seed-${i}`,
    lat: r.lat,
    lon: r.lon,
    name: r.name,
    count: Math.round(r.w * 100),
    nation: nationForPoint(r.lon, r.lat),
    severity: r.w,
    source: "seed" as const,
  }));
}
