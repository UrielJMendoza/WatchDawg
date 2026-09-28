/** Geodesy helpers. Coordinates are [lon, lat] degrees unless named otherwise. */

const R_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Coarse spatial bucket key (roughly `cellDeg` degrees square) used to avoid
 * O(n²) neighbour scans. Neighbour lookups check the 3×3 block around a cell.
 */
export function cellKey(lat: number, lon: number, cellDeg: number): string {
  return `${Math.floor(lat / cellDeg)}:${Math.floor(lon / cellDeg)}`;
}

export function neighbourKeys(lat: number, lon: number, cellDeg: number): string[] {
  const y = Math.floor(lat / cellDeg);
  const x = Math.floor(lon / cellDeg);
  const maxX = Math.floor(180 / cellDeg);
  const out: string[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      let nx = x + dx;
      // Wrap across the antimeridian.
      if (nx >= maxX) nx -= 2 * maxX;
      if (nx < -maxX) nx += 2 * maxX;
      out.push(`${y + dy}:${nx}`);
    }
  }
  return out;
}

/** Weighted mean position on the sphere (safe across the antimeridian). */
export function weightedCentroid(
  pts: Array<{ lat: number; lon: number; w: number }>,
): { lat: number; lon: number } {
  let x = 0, y = 0, z = 0, tw = 0;
  for (const p of pts) {
    const la = toRad(p.lat), lo = toRad(p.lon);
    x += Math.cos(la) * Math.cos(lo) * p.w;
    y += Math.cos(la) * Math.sin(lo) * p.w;
    z += Math.sin(la) * p.w;
    tw += p.w;
  }
  if (tw === 0) return { lat: pts[0]?.lat ?? 0, lon: pts[0]?.lon ?? 0 };
  x /= tw; y /= tw; z /= tw;
  return { lat: toDeg(Math.atan2(z, Math.hypot(x, y))), lon: toDeg(Math.atan2(y, x)) };
}

/** Great-circle interpolation, for drawing arcs that hug the globe. */
export function greatCircle(from: [number, number], to: [number, number], steps = 64): Array<[number, number]> {
  const [lo1, la1] = from.map(toRad) as [number, number];
  const [lo2, la2] = to.map(toRad) as [number, number];
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2,
  ));
  if (d === 0) return [from, to];
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    out.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.hypot(x, y)))]);
  }
  return out;
}

/** Degrees → "48.2912°N 37.1843°E". */
export function formatLatLon(lat: number, lon: number, digits = 4): string {
  const ns = lat >= 0 ? "N" : "S";
  const ew = lon >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(digits)}°${ns} ${Math.abs(lon).toFixed(digits)}°${ew}`;
}

/** Degrees → DMS, the way analysts read coordinates off a chart. */
export function formatDms(lat: number, lon: number): string {
  const part = (v: number, pos: string, neg: string) => {
    // Round once in whole seconds so 59.6″ carries into the minute, never "60″".
    const total = Math.round(Math.abs(v) * 3600);
    const d = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${d}°${String(m).padStart(2, "0")}′${String(s).padStart(2, "0")}″${v >= 0 ? pos : neg}`;
  };
  return `${part(lat, "N", "S")} ${part(lon, "E", "W")}`;
}
