import type {
  LayerSpecification,
  SkySpecification,
  SourceSpecification,
  StyleSpecification,
} from "maplibre-gl";

/**
 * Basemap styles for the globe.
 *
 * Every style starts from a self-hosted layer stack (ocean, country fills
 * from /geo/countries.geojson, graticule) so the globe renders even when no
 * tile server is reachable. The "dark" basemap then layers CARTO Dark Matter
 * vector tiles on top — recoloured to the console palette — for coastlines,
 * roads and labels as you zoom in; "imagery" adds Esri World Imagery.
 */

export type Basemap = "dark" | "imagery";

const CARTO_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

export const OCEAN = "#081018";
export const LAND = "#0f1822";
const BORDER = "#2a3d52";

export const SKY: SkySpecification = {
  "sky-color": "#0a1a2c",
  "horizon-color": "#1d4466",
  "fog-color": "#0a1422",
  "sky-horizon-blend": 0.7,
  "horizon-fog-blend": 0.6,
  "fog-ground-blend": 0.85,
  "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 4, 0.9, 7, 0],
};

function graticule(): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  for (let lat = -75; lat <= 75; lat += 15) {
    const coords: number[][] = [];
    for (let lon = -180; lon <= 180; lon += 5) coords.push([lon, lat]);
    features.push({ type: "Feature", properties: { eq: lat === 0 }, geometry: { type: "LineString", coordinates: coords } });
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const coords: number[][] = [];
    for (let lat = -85; lat <= 85; lat += 5) coords.push([lon, lat]);
    features.push({ type: "Feature", properties: { eq: false }, geometry: { type: "LineString", coordinates: coords } });
  }
  return { type: "FeatureCollection", features };
}

function baseSources(): Record<string, SourceSpecification> {
  return {
    countries: { type: "geojson", data: "/geo/countries.geojson" },
    graticule: { type: "geojson", data: graticule() },
  };
}

function baseLayers(): LayerSpecification[] {
  return [
    { id: "ocean", type: "background", paint: { "background-color": OCEAN } },
    {
      id: "countries-fill",
      type: "fill",
      source: "countries",
      paint: {
        "fill-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false], "#1a2a3c",
          ["boolean", ["feature-state", "hover"], false], "#152233",
          LAND,
        ],
        "fill-opacity": 1,
      },
    },
    {
      id: "graticule",
      type: "line",
      source: "graticule",
      paint: {
        "line-color": "#5fa8e8",
        "line-opacity": ["case", ["get", "eq"], 0.14, 0.06],
        "line-width": 0.6,
      },
    },
  ];
}

function borderLayers(): LayerSpecification[] {
  return [
    {
      id: "countries-line",
      type: "line",
      source: "countries",
      paint: {
        "line-color": BORDER,
        "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 5, 1.1],
        "line-opacity": 0.9,
      },
    },
    {
      id: "countries-selected",
      type: "line",
      source: "countries",
      filter: ["==", ["get", "iso2"], "__none__"],
      paint: { "line-color": "#7cc8f8", "line-width": 1.6, "line-opacity": 0.9 },
    },
  ];
}

/** Recolour a CARTO layer to the console palette without knowing its ids. */
function recolor(layer: LayerSpecification): LayerSpecification | null {
  const id = layer.id.toLowerCase();
  if (layer.type === "background") return null;
  const l = { ...layer, paint: { ...(layer as { paint?: Record<string, unknown> }).paint } } as LayerSpecification & {
    paint: Record<string, unknown>;
  };
  if (layer.type === "fill") {
    if (/water/.test(id)) l.paint["fill-color"] = OCEAN;
    else if (/building/.test(id)) l.paint["fill-color"] = "#14202d";
    else {
      // Land cover: fold into the land tone so the country fills show through.
      l.paint["fill-color"] = LAND;
      l.paint["fill-opacity"] = 0.35;
    }
  } else if (layer.type === "line") {
    if (/boundary|admin/.test(id)) l.paint["line-color"] = BORDER;
    else if (/water|river/.test(id)) l.paint["line-color"] = "#0d1b29";
    else l.paint["line-color"] = "#1b2837";
  } else if (layer.type === "symbol") {
    l.paint["text-color"] = /country/.test(id) ? "#9fb2c7" : /place|city|town/.test(id) ? "#8497ab" : "#5d6f82";
    l.paint["text-halo-color"] = "#05080b";
    l.paint["text-halo-width"] = 1.2;
    l.paint["icon-opacity"] = 0.6;
  }
  return l;
}

async function fetchJson(url: string, ms: number): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

let cartoPromise: Promise<StyleSpecification | null> | null = null;

function loadCarto(): Promise<StyleSpecification | null> {
  if (!cartoPromise) {
    cartoPromise = fetchJson(CARTO_STYLE, 3500)
      .then((j) => j as StyleSpecification)
      .catch(() => null);
  }
  return cartoPromise;
}

export interface BuiltStyle {
  style: StyleSpecification;
  /** A font stack the glyph server has, or null when no glyphs are available. */
  font: string[] | null;
  /** Human-readable basemap provenance for the HUD. */
  attribution: string;
}

/**
 * Build a complete style. `dataLayers` / `dataSources` are the console's own
 * overlay stack (incidents, hotspots…), inserted above the basemap.
 */
export async function buildStyle(
  basemap: Basemap,
  data: { sources: Record<string, SourceSpecification>; layers: (font: string[] | null) => LayerSpecification[] },
): Promise<BuiltStyle> {
  const sources: Record<string, SourceSpecification> = { ...baseSources() };
  const layers: LayerSpecification[] = [...baseLayers()];
  let glyphs: string | undefined;
  let sprite: StyleSpecification["sprite"];
  let attribution = "Natural Earth";
  let font: string[] | null = null;

  if (basemap === "imagery") {
    sources.imagery = {
      type: "raster",
      tiles: [ESRI_IMAGERY],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    };
    layers.push({
      id: "imagery",
      type: "raster",
      source: "imagery",
      paint: { "raster-opacity": 0.92, "raster-saturation": -0.35, "raster-brightness-max": 0.75, "raster-contrast": 0.1 },
    });
    attribution = "Esri World Imagery";
  }

  const carto = basemap === "dark" ? await loadCarto() : null;
  if (carto) {
    glyphs = carto.glyphs;
    sprite = carto.sprite;
    for (const [id, src] of Object.entries(carto.sources)) sources[`carto-${id}`] = src;
    for (const layer of carto.layers) {
      const tf = (layer as { layout?: Record<string, unknown> }).layout?.["text-font"];
      if (!font && Array.isArray(tf) && tf.every((x) => typeof x === "string")) font = tf as string[];
      const l = recolor(layer);
      if (!l) continue;
      const withSource = "source" in l && typeof l.source === "string" ? { ...l, source: `carto-${l.source}` } : l;
      layers.push({ ...withSource, id: `carto-${l.id}` } as LayerSpecification);
    }
    attribution = "© CARTO © OpenStreetMap contributors";
  }

  layers.push(...borderLayers());
  Object.assign(sources, data.sources);
  if (!glyphs) font = null;
  layers.push(...data.layers(font));

  return {
    style: {
      version: 8,
      projection: { type: "globe" },
      sky: SKY,
      ...(glyphs ? { glyphs } : {}),
      ...(sprite ? { sprite } : {}),
      sources,
      layers,
    },
    font,
    attribution,
  };
}
