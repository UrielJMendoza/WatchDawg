/**
 * Regenerate public/geo/focus-nations.geojson — simplified admin-0 borders for
 * the four focus nations (Iran, Israel, Ukraine, Russia), extracted from the
 * Natural Earth 50m TopoJSON shipped by `world-atlas`.
 *
 * Run:  node scripts/build-borders.mjs
 * Deps: world-atlas, topojson-client (devDependencies).
 */
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const topojson = require("topojson-client");
const topo = require("world-atlas/countries-50m.json");

const WANT = { "364": "IR", "376": "IL", "804": "UA", "643": "RU" };

const fc = topojson.feature(topo, topo.objects.countries);
const features = fc.features
  .filter((f) => WANT[String(f.id)])
  .map((f) => ({
    type: "Feature",
    properties: { code: WANT[String(f.id)], name: f.properties.name },
    geometry: f.geometry,
  }));

mkdirSync("public/geo", { recursive: true });
const path = "public/geo/focus-nations.geojson";
writeFileSync(path, JSON.stringify({ type: "FeatureCollection", features }));

console.log(
  `wrote ${features.length} features (${features
    .map((f) => f.properties.code)
    .join(", ")}) -> ${path} (${statSync(path).size} bytes)`,
);
