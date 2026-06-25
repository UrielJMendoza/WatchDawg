import type { NationCode, Theater } from "./types";

export interface MapView {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface NationConfig {
  code: NationCode;
  name: string;
  /** Short callsign shown in the watchlist. */
  callsign: string;
  capital: { name: string; lat: number; lon: number };
  /** [west, south, east, north] used to attribute events to a nation. */
  bbox: [number, number, number, number];
  /** Primary adversary in this theater (used to derive tension arcs). */
  adversary: NationCode;
  /** GDELT free-text query that surfaces this nation. */
  query: string;
  /** Accent role from the Gotham palette. */
  accent: "primary" | "danger" | "warning";
  /** RGB triple matching the accent, for Deck.gl layers. */
  rgb: [number, number, number];
}

export interface TheaterConfig {
  id: Theater;
  name: string;
  label: string;
  nations: NationCode[];
  view: MapView;
  bbox: [number, number, number, number];
  /** Combined GDELT query for the whole theater. */
  query: string;
}

export const NATIONS: Record<NationCode, NationConfig> = {
  IR: {
    code: "IR",
    name: "Iran",
    callsign: "PERSIA",
    capital: { name: "Tehran", lat: 35.6892, lon: 51.389 },
    bbox: [44.0, 25.0, 63.3, 39.8],
    adversary: "IL",
    query: "Iran",
    accent: "warning",
    rgb: [242, 169, 34],
  },
  IL: {
    code: "IL",
    name: "Israel",
    callsign: "SHIELD",
    capital: { name: "Jerusalem", lat: 31.7683, lon: 35.2137 },
    bbox: [34.2, 29.4, 35.9, 33.4],
    adversary: "IR",
    query: "Israel",
    accent: "primary",
    rgb: [42, 168, 242],
  },
  UA: {
    code: "UA",
    name: "Ukraine",
    callsign: "TRIDENT",
    capital: { name: "Kyiv", lat: 50.4501, lon: 30.5234 },
    bbox: [22.1, 44.3, 40.2, 52.4],
    adversary: "RU",
    query: "Ukraine",
    accent: "primary",
    rgb: [42, 168, 242],
  },
  RU: {
    code: "RU",
    name: "Russia",
    callsign: "BEAR",
    capital: { name: "Moscow", lat: 55.7558, lon: 37.6173 },
    bbox: [27.0, 41.2, 69.0, 70.0],
    adversary: "UA",
    query: "Russia",
    accent: "danger",
    rgb: [224, 72, 72],
  },
};

export const THEATERS: Record<Theater, TheaterConfig> = {
  "middle-east": {
    id: "middle-east",
    name: "Middle East",
    label: "MIDDLE EAST // IRAN — ISRAEL",
    nations: ["IR", "IL"],
    view: { longitude: 43.5, latitude: 32.5, zoom: 4.6, pitch: 38, bearing: -12 },
    bbox: [33.0, 24.0, 64.0, 40.5],
    query: "(Iran OR Israel)",
  },
  "eastern-europe": {
    id: "eastern-europe",
    name: "Eastern Europe",
    label: "EASTERN EUROPE // RUSSIA — UKRAINE",
    nations: ["UA", "RU"],
    view: { longitude: 36.0, latitude: 51.5, zoom: 4.2, pitch: 38, bearing: 8 },
    bbox: [21.0, 43.0, 70.0, 70.5],
    query: "(Ukraine OR Russia)",
  },
  global: {
    id: "global",
    name: "Global",
    label: "GLOBAL THEATER // ALL FRONTS",
    nations: ["IR", "IL", "UA", "RU"],
    view: { longitude: 42.0, latitude: 44.0, zoom: 2.9, pitch: 30, bearing: 0 },
    bbox: [21.0, 24.0, 70.0, 70.5],
    query: "(Iran OR Israel OR Ukraine OR Russia)",
  },
};

export const ALL_THEATERS: Theater[] = [
  "middle-east",
  "eastern-europe",
  "global",
];

/** Resolve which focus nation (if any) a coordinate belongs to. */
export function nationForPoint(lon: number, lat: number): NationCode | null {
  for (const n of Object.values(NATIONS)) {
    const [w, s, e, nth] = n.bbox;
    if (lon >= w && lon <= e && lat >= s && lat <= nth) return n.code;
  }
  return null;
}
