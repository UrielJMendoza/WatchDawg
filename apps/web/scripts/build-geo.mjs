/**
 * Regenerate the static geo assets WatchDawg ships with:
 *
 *   public/geo/countries.geojson     admin-0 polygons (Natural Earth 110m via world-atlas)
 *   public/geo/countries-50m.geojson  detailed polygons, loaded when zoomed in (50m, simplified)
 *   lib/osint/data/gazetteer.json  countries + major cities for search, fly-to
 *                                  and headline geocoding
 *
 * Run:  pnpm build:geo
 * Deps: world-atlas, topojson-client, world-countries, all-the-cities (dev only).
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const topojson = require("topojson-client");
const topo = require("world-atlas/countries-110m.json");
const topo50 = require("world-atlas/countries-50m.json");
const countries = require("world-countries");
const cities = require("all-the-cities");

const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

function roundGeometry(g) {
  const ring = (r) => {
    const out = [];
    for (const [x, y] of r) {
      const pt = [round(x), round(y)];
      const prev = out[out.length - 1];
      if (!prev || prev[0] !== pt[0] || prev[1] !== pt[1]) out.push(pt);
    }
    return out.length >= 4 ? out : null;
  };
  if (g.type === "Polygon") {
    const rings = g.coordinates.map(ring).filter(Boolean);
    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }
  if (g.type === "MultiPolygon") {
    const polys = g.coordinates
      .map((p) => p.map(ring).filter(Boolean))
      .filter((p) => p.length);
    return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  return null;
}

/** Signed area of the outer ring, used to find a country's mainland polygon. */
function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  }
  return Math.abs(a / 2);
}

function mainlandBbox(g) {
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let best = polys[0];
  for (const p of polys) if (ringArea(p[0]) > ringArea(best[0])) best = p;
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of best[0]) {
    w = Math.min(w, x); e = Math.max(e, x);
    s = Math.min(s, y); n = Math.max(n, y);
  }
  return [round(w), round(s), round(e), round(n)];
}

/** Douglas–Peucker on a ring, tolerance in degrees. */
function simplifyRing(ring, tol) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    let best = -1, bestD = 0;
    for (let i = a + 1; i < b; i++) {
      // Closed rings start and end on the same point: fall back to point distance.
      const d = len < 1e-12
        ? Math.hypot(ring[i][0] - ax, ring[i][1] - ay)
        : Math.abs(dy * ring[i][0] - dx * ring[i][1] + bx * ay - by * ax) / len;
      if (d > bestD) { bestD = d; best = i; }
    }
    if (best > 0 && bestD > tol) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : null;
}

function simplifyGeometry(g, tol) {
  if (!g) return null;
  if (g.type === "Polygon") {
    const rings = g.coordinates.map((r) => simplifyRing(r, tol)).filter(Boolean);
    return rings.length ? { type: "Polygon", coordinates: rings } : null;
  }
  const polys = g.coordinates.map((p) => p.map((r) => simplifyRing(r, tol)).filter(Boolean)).filter((p) => p.length);
  return polys.length ? { type: "MultiPolygon", coordinates: polys } : null;
}

const byNumeric = new Map(countries.map((c) => [c.ccn3, c]));
const fc = topojson.feature(topo, topo.objects.countries);

const features = [];
const bboxes = new Map();
for (const f of fc.features) {
  const meta = byNumeric.get(String(f.id).padStart(3, "0"));
  const geometry = f.geometry && roundGeometry(f.geometry);
  if (!geometry) continue;
  const iso2 = meta?.cca2 ?? null;
  if (iso2) bboxes.set(iso2, mainlandBbox(geometry));
  features.push({
    type: "Feature",
    id: features.length,
    properties: { iso2: iso2 ?? "", name: meta?.name.common ?? f.properties.name },
    geometry,
  });
}

mkdirSync("public/geo", { recursive: true });
writeFileSync(
  "public/geo/countries.geojson",
  JSON.stringify({ type: "FeatureCollection", features }),
);

const features50 = [];
for (const f of topojson.feature(topo50, topo50.objects.countries).features) {
  const meta = byNumeric.get(String(f.id).padStart(3, "0"));
  const geometry = simplifyGeometry(roundGeometry(f.geometry), 0.02);
  if (!geometry) continue;
  features50.push({
    type: "Feature",
    id: features50.length,
    properties: { iso2: meta?.cca2 ?? "", name: meta?.name.common ?? f.properties.name },
    geometry,
  });
}
writeFileSync("public/geo/countries-50m.geojson", JSON.stringify({ type: "FeatureCollection", features: features50 }));

const countryRows = countries
  .filter((c) => c.latlng?.length === 2)
  .map((c) => {
    const demonyms = [...new Set(c.demonyms?.eng ? [c.demonyms.eng.m, c.demonyms.eng.f] : [])];
    const aliases = [...new Set([
      c.name.official,
      ...c.altSpellings.filter((a) => a.length > 3),
    ].filter((a) => a && a !== c.name.common))];
    return {
      iso2: c.cca2,
      iso3: c.cca3,
      name: c.name.common,
      aliases,
      demonyms,
      region: c.region,
      subregion: c.subregion,
      capital: c.capital?.[0] ?? null,
      lat: round(c.latlng[0]),
      lon: round(c.latlng[1]),
      bbox: bboxes.get(c.cca2) ?? null,
      area: c.area,
    };
  });

const knownIso2 = new Set(countryRows.map((c) => c.iso2));
const cityRows = cities
  .filter(
    (c) =>
      knownIso2.has(c.country) &&
      (c.population >= 250000 ||
        c.featureCode === "PPLC" ||
        (c.featureCode === "PPLA" && c.population >= 75000)),
  )
  .map((c) => ({
    name: c.name,
    iso2: c.country,
    lat: round(c.loc.coordinates[1], 3),
    lon: round(c.loc.coordinates[0], 3),
    pop: c.population,
    ...(c.featureCode === "PPLC" ? { cap: 1 } : {}),
  }))
  .sort((a, b) => b.pop - a.pop);

mkdirSync("lib/osint/data", { recursive: true });
writeFileSync(
  "lib/osint/data/gazetteer.json",
  JSON.stringify({ countries: countryRows, cities: cityRows }),
);

for (const p of ["public/geo/countries.geojson", "public/geo/countries-50m.geojson", "lib/osint/data/gazetteer.json"]) {
  console.log(`${p}: ${(statSync(p).size / 1024).toFixed(0)} KiB`);
}
console.log(`${features.length} country shapes, ${countryRows.length} countries, ${cityRows.length} cities`);
