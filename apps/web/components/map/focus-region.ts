import type { Feature, FeatureCollection, LineString } from "geojson";

/**
 * Focus region for WatchDawg. Every phase from 2 forward clips spatial
 * queries to this bounding box.
 *
 * Covers: Red Sea, Bab el-Mandeb, Gulf of Aden, Arabian Sea approaches,
 * Yemen, Somalia, Djibouti, Eritrea, Saudi / Egyptian Red Sea coasts.
 */
export const FOCUS_BBOX = {
  latMin: 10.0,
  latMax: 30.0,
  lonMin: 32.0,
  lonMax: 55.0,
} as const;

export const INITIAL_VIEW = {
  longitude: 43.5,
  latitude: 15.0,
  zoom: 4.5,
  pitch: 0,
  bearing: 0,
} as const;

/**
 * 1-degree graticule across the focus bbox. Visual only; no semantics.
 * 21 horizontal + 24 vertical = 45 line features.
 */
export function buildGraticule(): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  const { latMin, latMax, lonMin, lonMax } = FOCUS_BBOX;
  for (let lat = latMin; lat <= latMax; lat++) {
    features.push({
      type: "Feature",
      properties: { kind: "parallel", degree: lat },
      geometry: {
        type: "LineString",
        coordinates: [
          [lonMin, lat],
          [lonMax, lat],
        ],
      },
    });
  }
  for (let lon = lonMin; lon <= lonMax; lon++) {
    features.push({
      type: "Feature",
      properties: { kind: "meridian", degree: lon },
      geometry: {
        type: "LineString",
        coordinates: [
          [lon, latMin],
          [lon, latMax],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
