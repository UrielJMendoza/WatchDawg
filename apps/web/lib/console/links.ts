import type { Relation } from "@/lib/osint/types";
import type { GazetteerData } from "@/lib/osint/gazetteer";
import { countryByIso2 } from "@/lib/osint/gazetteer";
import { greatCircle } from "@/lib/osint/geo";

/** Anchor a country at its capital when known, else its centroid. */
export function countryAnchor(gaz: GazetteerData, iso2: string): [number, number] | null {
  const cap = gaz.cities.find((c) => c.cap && c.iso2 === iso2);
  if (cap) return [cap.lon, cap.lat];
  const c = countryByIso2(gaz, iso2);
  return c ? [c.lon, c.lat] : null;
}

const STANCE_INDEX = { hostile: 0, mixed: 1, cooperative: 2 } as const;

/** Great-circle arcs for relations, split at the antimeridian. */
export function relationFeatures(relations: Relation[], gaz: GazetteerData): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const anchors = new Map<string, [number, number] | null>();
  const at = (iso2: string) => {
    if (!anchors.has(iso2)) anchors.set(iso2, countryAnchor(gaz, iso2));
    return anchors.get(iso2)!;
  };
  const max = Math.max(1, ...relations.map((r) => r.articles));
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const r of relations) {
    const a = at(r.from);
    const b = at(r.to);
    if (!a || !b) continue;
    // Offset reciprocal links slightly so A→B and B→A don't overlap exactly.
    const pts = greatCircle(a, b, 64);
    const seg: number[][] = [];
    let prev: number | null = null;
    const push = () => {
      if (seg.length > 1) {
        features.push({
          type: "Feature",
          properties: { id: r.id, s: STANCE_INDEX[r.stance], w: Math.log1p(r.articles) / Math.log1p(max) },
          geometry: { type: "LineString", coordinates: [...seg] },
        });
      }
      seg.length = 0;
    };
    for (const [lon, lat] of pts) {
      if (prev !== null && Math.abs(lon - prev) > 180) push();
      seg.push([lon, lat]);
      prev = lon;
    }
    push();
  }
  return { type: "FeatureCollection", features };
}
