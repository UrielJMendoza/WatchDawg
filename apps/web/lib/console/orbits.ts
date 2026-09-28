import { degreesLat, degreesLong, eciToGeodetic, gstime, propagate, twoline2satrec, type SatRec } from "satellite.js";
import type { SatElement } from "@/lib/osint/tracks/types";

/** Client-side SGP4: element sets → live sub-satellite points and ground tracks. */

export interface SatState {
  lat: number;
  lon: number;
  altKm: number;
  speedKms: number;
}

const recs = new Map<string, SatRec>();

function recFor(s: SatElement): SatRec | null {
  const key = `${s.id}:${s.epoch}`;
  let r = recs.get(key);
  if (!r) {
    try {
      r = twoline2satrec(s.line1, s.line2);
    } catch {
      return null;
    }
    recs.set(key, r);
  }
  return r;
}

export function satState(s: SatElement, date: Date): SatState | null {
  const rec = recFor(s);
  if (!rec) return null;
  const pv = propagate(rec, date);
  if (!pv || typeof pv.position !== "object" || typeof pv.velocity !== "object") return null;
  const geo = eciToGeodetic(pv.position, gstime(date));
  const v = pv.velocity;
  const lat = degreesLat(geo.latitude);
  const lon = degreesLong(geo.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon, altKm: geo.height, speedKms: Math.hypot(v.x, v.y, v.z) };
}

export function satFeatures(sats: SatElement[], date: Date): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  for (const s of sats) {
    const st = satState(s, date);
    if (!st) continue;
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [st.lon, st.lat] },
      properties: { id: s.id, station: s.group === "stations" ? 1 : 0 },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Ground track ±`minutes` around `date`, split where it crosses the antimeridian. */
export function groundTrack(s: SatElement, date: Date, minutes = 50): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const lines: number[][][] = [[]];
  let prevLon: number | null = null;
  for (let m = -minutes; m <= minutes; m += 1) {
    const st = satState(s, new Date(date.getTime() + m * 60_000));
    if (!st) continue;
    if (prevLon !== null && Math.abs(st.lon - prevLon) > 180) lines.push([]);
    lines[lines.length - 1].push([st.lon, st.lat]);
    prevLon = st.lon;
  }
  return {
    type: "FeatureCollection",
    features: lines
      .filter((l) => l.length > 1)
      .map((coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates } })),
  };
}

/** Orbital period in minutes from mean motion (rev/day). */
export function periodMinutes(meanMotion: number): number {
  return meanMotion > 0 ? 1440 / meanMotion : NaN;
}
