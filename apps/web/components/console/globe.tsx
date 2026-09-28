"use client";

import { useCallback, useEffect, useRef } from "react";
import maplibregl, {
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MLMap,
  type MapLayerMouseEvent,
  type SourceSpecification,
  type StyleImageInterface,
} from "maplibre-gl";
import type { Domain, Hotspot, Incident } from "@/lib/osint/types";
import { DOMAINS, DOMAIN_ORDER, domainOf } from "@/lib/osint/taxonomy";
import { buildStyle, type Basemap } from "@/lib/map/style";
import type { LayerState, Selection } from "@/lib/console/state";

export interface CameraCommand {
  key: number;
  lat?: number;
  lon?: number;
  zoom?: number;
  bbox?: [number, number, number, number];
  reset?: boolean;
}

export interface ViewInfo {
  zoom: number;
  lat: number;
  lon: number;
  bearing: number;
  pitch: number;
}

interface GlobeProps {
  incidents: Incident[];
  hotspots: Hotspot[];
  selection: Selection | null;
  layers: LayerState;
  basemap: Basemap;
  camera: CameraCommand | null;
  freshIds: Set<string>;
  now: number;
  onSelect: (sel: Selection | null) => void;
  onHover: (h: { id: string; x: number; y: number } | null) => void;
  onCursor: (ll: { lat: number; lon: number } | null) => void;
  onView: (v: ViewInfo) => void;
  onReady: (info: { attribution: string }) => void;
}

const DOMAIN_INDEX: Record<Domain, number> = { security: 0, civil: 1, hazard: 2 };
const DOMAIN_COLOR: ExpressionSpecification = [
  "match",
  ["get", "d"],
  0, DOMAINS.security.color,
  1, DOMAINS.civil.color,
  DOMAINS.hazard.color,
];
const DOMINANT: ExpressionSpecification = [
  "case",
  [">=", ["get", "sec"], ["max", ["get", "civ"], ["get", "haz"]]], DOMAINS.security.color,
  [">=", ["get", "civ"], ["get", "haz"]], DOMAINS.civil.color,
  DOMAINS.hazard.color,
];
const INITIAL_CENTER: [number, number] = [18, 24];

/** Zoom at which the globe's radius is ~42% of the smaller visible side. */
function fitZoom(w: number, h: number): number {
  const side = Math.max(240, Math.min(w, h));
  return Math.max(0.9, Math.min(2.6, Math.log2((side * 0.42 * 2 * Math.PI) / 512)));
}

/** Keep the globe centred in the gap between the floating panels. */
function panelPadding(w: number) {
  return w >= 1024 ? { left: 340, right: 400, top: 40, bottom: 130 } : { left: 0, right: 0, top: 40, bottom: 60 };
}
const RECENT_MS = 90 * 60_000;

function incidentFeatures(incidents: Incident[], fresh: Set<string>, now: number): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: incidents.map((i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [i.lon, i.lat] },
      properties: {
        id: i.id,
        d: DOMAIN_INDEX[domainOf(i.category)],
        sev: Number(i.severity.toFixed(3)),
        conf: Number(i.confidence.toFixed(3)),
        hot: fresh.has(i.id) || (now - i.lastSeen < RECENT_MS && i.severity >= 0.55) ? 1 : 0,
      },
    })),
  };
}

function circlePolygon(lat: number, lon: number, km: number, steps = 72): number[][] {
  const out: number[][] = [];
  const dLat = km / 110.574;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const la = lat + dLat * Math.sin(a);
    const lo = lon + (km / (111.32 * Math.cos((la * Math.PI) / 180))) * Math.cos(a);
    out.push([lo, la]);
  }
  return out;
}

function dominantDomain(h: Hotspot): Domain {
  return DOMAIN_ORDER.reduce((a, b) => (h.domains[b] > h.domains[a] ? b : a));
}

function hotspotFeatures(hotspots: Hotspot[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: hotspots.map((h) => ({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [circlePolygon(h.lat, h.lon, Math.max(60, h.radiusKm))] },
      properties: { id: h.id, d: DOMAIN_INDEX[dominantDomain(h)] },
    })),
  };
}

/** Animated radar ping drawn on a canvas, re-rendered each frame. */
function pulseImage(map: MLMap, rgb: [number, number, number], size = 96): StyleImageInterface {
  let ctx: CanvasRenderingContext2D | null = null;
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return {
    width: size,
    height: size,
    data: new Uint8Array(size * size * 4),
    onAdd() {
      const c = document.createElement("canvas");
      c.width = size;
      c.height = size;
      ctx = c.getContext("2d", { willReadFrequently: true });
    },
    render() {
      if (!ctx) return false;
      const t = reduce ? 0.35 : (performance.now() % 1800) / 1800;
      const r = (size / 2) * (0.2 + 0.78 * t);
      ctx.clearRect(0, 0, size, size);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(1 - t) * 0.95})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(1 - t) * 0.45})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      this.data = ctx.getImageData(0, 0, size, size).data;
      if (!reduce) map.triggerRepaint();
      return true;
    },
  };
}

function dataSources(): Record<string, SourceSpecification> {
  const empty = { type: "FeatureCollection", features: [] } as GeoJSON.FeatureCollection;
  return {
    incidents: {
      type: "geojson",
      data: empty,
      cluster: true,
      clusterRadius: 44,
      clusterMaxZoom: 5,
      clusterProperties: {
        sec: ["+", ["case", ["==", ["get", "d"], 0], 1, 0]],
        civ: ["+", ["case", ["==", ["get", "d"], 1], 1, 0]],
        haz: ["+", ["case", ["==", ["get", "d"], 2], 1, 0]],
        sevmax: ["max", ["get", "sev"]],
      },
    },
    "incidents-raw": { type: "geojson", data: empty },
    hotspots: { type: "geojson", data: empty },
  };
}

function dataLayers(font: string[] | null): LayerSpecification[] {
  const unclustered: ExpressionSpecification = ["!", ["has", "point_count"]];
  const layers: LayerSpecification[] = [
    {
      id: "hotspot-fill",
      type: "fill",
      source: "hotspots",
      paint: { "fill-color": DOMAIN_COLOR, "fill-opacity": 0.05 },
    },
    {
      id: "hotspot-line",
      type: "line",
      source: "hotspots",
      paint: { "line-color": DOMAIN_COLOR, "line-opacity": 0.6, "line-width": 1, "line-dasharray": [3, 2] },
    },
    {
      id: "heat",
      type: "heatmap",
      source: "incidents-raw",
      paint: {
        "heatmap-weight": ["*", ["get", "sev"], ["+", 0.3, ["*", 0.7, ["get", "conf"]]]],
        "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 0.7, 6, 1.6],
        "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 12, 3, 20, 7, 38],
        // One-hue sequential ramp: density of activity, not its kind.
        "heatmap-color": [
          "interpolate", ["linear"], ["heatmap-density"],
          0, "rgba(16,66,129,0)",
          0.15, "rgba(28,92,171,0.28)",
          0.4, "rgba(57,135,229,0.45)",
          0.7, "rgba(134,182,239,0.6)",
          1, "rgba(205,226,251,0.8)",
        ],
        "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 6, 0.4, 9, 0],
      },
    },
    {
      id: "cluster-glow",
      type: "circle",
      source: "incidents",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": DOMINANT,
        "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 50, 25, 200, 31],
        "circle-blur": 0.9,
        "circle-opacity": ["interpolate", ["linear"], ["get", "sevmax"], 0, 0.15, 1, 0.45],
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "cluster-ring",
      type: "circle",
      source: "incidents",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "rgba(6,10,15,0.82)",
        "circle-radius": ["step", ["get", "point_count"], 10, 10, 13, 50, 17, 200, 22],
        "circle-stroke-color": DOMINANT,
        "circle-stroke-width": 1.6,
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "inc-glow",
      type: "circle",
      source: "incidents",
      filter: unclustered,
      paint: {
        "circle-color": DOMAIN_COLOR,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["+", 4, ["*", 10, ["get", "sev"]]], 8, ["+", 10, ["*", 18, ["get", "sev"]]]],
        "circle-blur": 1,
        "circle-opacity": ["*", 0.4, ["get", "sev"]],
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "inc-dot",
      type: "circle",
      source: "incidents",
      filter: unclustered,
      paint: {
        "circle-color": DOMAIN_COLOR,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["+", 2.2, ["*", 3.2, ["get", "sev"]]], 8, ["+", 4, ["*", 6, ["get", "sev"]]]],
        // Confidence → opacity: faint dots are thinly sourced.
        "circle-opacity": ["+", 0.4, ["*", 0.6, ["get", "conf"]]],
        "circle-stroke-color": "#04070a",
        "circle-stroke-width": 0.8,
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "inc-pulse",
      type: "symbol",
      source: "incidents",
      filter: ["all", unclustered, ["==", ["get", "hot"], 1]],
      layout: {
        "icon-image": ["match", ["get", "d"], 0, "pulse-0", 1, "pulse-1", "pulse-2"],
        "icon-size": ["interpolate", ["linear"], ["zoom"], 1, 0.38, 8, 0.8],
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "map",
      },
    },
    {
      id: "inc-selected-halo",
      type: "circle",
      source: "incidents-raw",
      filter: ["==", ["get", "id"], "__none__"],
      paint: {
        "circle-color": "#ffffff",
        "circle-radius": 18,
        "circle-blur": 1,
        "circle-opacity": 0.25,
        "circle-pitch-alignment": "map",
      },
    },
    {
      id: "inc-selected",
      type: "circle",
      source: "incidents-raw",
      filter: ["==", ["get", "id"], "__none__"],
      paint: {
        "circle-color": "rgba(0,0,0,0)",
        "circle-radius": 10,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-pitch-alignment": "map",
      },
    },
  ];
  if (font) {
    layers.splice(5, 0, {
      id: "cluster-count",
      type: "symbol",
      source: "incidents",
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": font,
        "text-size": 11,
        "text-allow-overlap": true,
      },
      paint: { "text-color": "#e6ecf2" },
    });
  }
  return layers;
}

const TOGGLED: Record<keyof Omit<LayerState, "rotate">, string[]> = {
  heat: ["heat"],
  clusters: ["cluster-glow", "cluster-ring", "cluster-count"],
  hotspots: ["hotspot-fill", "hotspot-line"],
  pulses: ["inc-pulse"],
};

export default function Globe(props: GlobeProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const readyRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  const markers = useRef<maplibregl.Marker[]>([]);
  const interacting = useRef(false);
  const lastInteraction = useRef(0);
  const hoverCountry = useRef<string | number | null>(null);
  const pendingCamera = useRef<CameraCommand | null>(null);
  const loadedRef = useRef(false);

  const applyCamera = useCallback((map: MLMap, c: CameraCommand) => {
    pendingCamera.current = null;
    lastInteraction.current = Date.now();
    runCamera(map, c);
  }, []);

  // ─── Data sync helpers (read latest props from the ref) ─────────────────
  const syncData = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const p = propsRef.current;
    const fc = incidentFeatures(p.incidents, p.freshIds, p.now);
    (map.getSource("incidents") as GeoJSONSource | undefined)?.setData(fc);
    (map.getSource("incidents-raw") as GeoJSONSource | undefined)?.setData(fc);
    (map.getSource("hotspots") as GeoJSONSource | undefined)?.setData(hotspotFeatures(p.hotspots));
  }, []);

  const syncSelection = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const sel = propsRef.current.selection;
    const id = sel?.kind === "incident" ? sel.id : "__none__";
    map.setFilter("inc-selected", ["==", ["get", "id"], id]);
    map.setFilter("inc-selected-halo", ["==", ["get", "id"], id]);
    const iso2 = sel?.kind === "country" ? sel.iso2 : "__none__";
    map.setFilter("countries-selected", ["==", ["get", "iso2"], iso2]);
  }, []);

  const syncLayers = useCallback(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const L = propsRef.current.layers;
    for (const [k, ids] of Object.entries(TOGGLED)) {
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", L[k as keyof typeof TOGGLED] ? "visible" : "none");
      }
    }
    for (const m of markers.current) m.getElement().style.display = L.hotspots ? "" : "none";
  }, []);

  /** Hide lower-ranked hotspot labels that would overlap a higher-ranked one. */
  const declutter = useCallback(() => {
    const map = mapRef.current;
    if (!map || !propsRef.current.layers.hotspots) return;
    const placed: Array<{ x: number; y: number; w: number }> = [];
    for (const mk of markers.current) {
      const el = mk.getElement();
      const p = map.project(mk.getLngLat());
      const w = el.offsetWidth || 160;
      const clash = placed.some((q) => Math.abs(q.y - p.y) < 20 && p.x < q.x + q.w + 8 && q.x < p.x + w + 8);
      el.style.visibility = clash ? "hidden" : "visible";
      if (!clash) placed.push({ x: p.x, y: p.y, w });
    }
  }, []);

  const syncMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of markers.current) m.remove();
    markers.current = [];
    propsRef.current.hotspots.slice(0, 10).forEach((h, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "hotspot-marker";
      el.setAttribute("aria-label", `Hotspot ${i + 1}: ${h.name}, ${h.incidents} incidents`);
      const color = DOMAINS[dominantDomain(h)].color;
      el.innerHTML =
        `<span class="hm-rank" style="border-color:${color}">${String(i + 1).padStart(2, "0")}</span>` +
        `<span class="hm-name">${escapeHtml(h.name)}</span>` +
        `<span class="hm-count">${h.incidents}</span>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        propsRef.current.onSelect({ kind: "hotspot", id: h.id });
      });
      const marker = new maplibregl.Marker({ element: el, anchor: "left", offset: [10, 0], opacityWhenCovered: "0" })
        .setLngLat([h.lon, h.lat])
        .addTo(map);
      markers.current.push(marker);
    });
    syncLayers();
    requestAnimationFrame(declutter);
  }, [syncLayers, declutter]);

  const installImages = (map: MLMap) => {
    DOMAIN_ORDER.forEach((d, i) => {
      const name = `pulse-${i}`;
      if (!map.hasImage(name)) map.addImage(name, pulseImage(map, DOMAINS[d].rgb), { pixelRatio: 2 });
    });
  };

  // ─── Map lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let map: MLMap | null = null;

    buildStyle(propsRef.current.basemap, { sources: dataSources(), layers: dataLayers }).then(({ style, attribution }) => {
      if (cancelled || !container.current) return;
      const el = container.current;
      const pad = panelPadding(el.clientWidth);
      map = new maplibregl.Map({
        container: el,
        style,
        center: INITIAL_CENTER,
        zoom: fitZoom(el.clientWidth - pad.left - pad.right, el.clientHeight - pad.top - pad.bottom),
        minZoom: 0.8,
        maxZoom: 16,
        maxPitch: 70,
        attributionControl: { compact: true, customAttribution: attribution },
        canvasContextAttributes: { antialias: true },
        fadeDuration: 150,
      });
      mapRef.current = map;
      const m = map;
      m.setPadding(pad);
      const onResize = () => m.setPadding(panelPadding(el.clientWidth));
      m.on("resize", onResize);

      m.on("style.load", () => {
        installImages(m);
        readyRef.current = true;
        syncData();
        syncSelection();
        syncLayers();
        syncMarkers();
      });
      m.on("load", () => {
        loadedRef.current = true;
        propsRef.current.onReady({ attribution });
        // A camera command may have arrived while the style was loading.
        if (pendingCamera.current) applyCamera(m, pendingCamera.current);
      });
      m.on("styleimagemissing", () => installImages(m));

      // Clicks: cluster → zoom in; incident → select; country → select.
      m.on("click", "cluster-ring", async (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const src = m.getSource("incidents") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(f.properties.cluster_id as number);
        const [lon, lat] = (f.geometry as GeoJSON.Point).coordinates;
        m.easeTo({ center: [lon, lat], zoom: Math.min(zoom + 0.3, 9), duration: 900 });
      });
      m.on("click", (e: MapLayerMouseEvent) => {
        const hit = m.queryRenderedFeatures(e.point, { layers: ["inc-dot", "cluster-ring"].filter((l) => m.getLayer(l)) });
        if (hit.some((f) => f.layer.id === "cluster-ring")) return;
        const inc = hit.find((f) => f.layer.id === "inc-dot");
        if (inc) {
          propsRef.current.onSelect({ kind: "incident", id: String(inc.properties.id) });
          return;
        }
        const country = m.queryRenderedFeatures(e.point, { layers: ["countries-fill"] })[0];
        const iso2 = country?.properties?.iso2 as string | undefined;
        propsRef.current.onSelect(iso2 ? { kind: "country", iso2 } : null);
      });

      // Hover: incident tooltip + pointer cursor + country highlight.
      let raf = 0;
      m.on("mousemove", (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          propsRef.current.onCursor({ lat: e.lngLat.lat, lon: e.lngLat.lng });
          const layers = ["inc-dot", "cluster-ring"].filter((l) => m.getLayer(l));
          const hit = m.queryRenderedFeatures(e.point, { layers });
          const inc = hit.find((f) => f.layer.id === "inc-dot");
          m.getCanvas().style.cursor = hit.length ? "pointer" : "";
          propsRef.current.onHover(inc ? { id: String(inc.properties.id), x: e.point.x, y: e.point.y } : null);
          const c = hit.length ? undefined : m.queryRenderedFeatures(e.point, { layers: ["countries-fill"] })[0];
          const cid = c?.id ?? null;
          if (cid !== hoverCountry.current) {
            if (hoverCountry.current != null) m.setFeatureState({ source: "countries", id: hoverCountry.current }, { hover: false });
            if (cid != null) m.setFeatureState({ source: "countries", id: cid }, { hover: true });
            hoverCountry.current = cid;
          }
        });
      });
      m.on("mouseout", () => {
        propsRef.current.onCursor(null);
        propsRef.current.onHover(null);
      });

      const report = () => {
        const c = m.getCenter();
        propsRef.current.onView({ zoom: m.getZoom(), lat: c.lat, lon: c.lng, bearing: m.getBearing(), pitch: m.getPitch() });
      };
      m.on("move", report);
      let dq = 0;
      m.on("move", () => {
        cancelAnimationFrame(dq);
        dq = requestAnimationFrame(declutter);
      });

      // Idle auto-rotation, paused by any interaction for 20 s.
      const stop = () => {
        interacting.current = true;
        lastInteraction.current = Date.now();
      };
      const release = () => {
        interacting.current = false;
        lastInteraction.current = Date.now();
      };
      m.on("mousedown", stop);
      m.on("touchstart", stop);
      m.on("wheel", stop);
      m.on("mouseup", release);
      m.on("touchend", release);
      const spin = () => {
        const p = propsRef.current;
        if (!p.layers.rotate || interacting.current || m.isMoving()) return;
        if (Date.now() - lastInteraction.current < 20_000) return;
        if (m.getZoom() > 3.2 || p.selection) return;
        const c = m.getCenter();
        c.lng -= 3;
        m.easeTo({ center: c, duration: 1000, easing: (n) => n, essential: false });
      };
      m.on("moveend", spin);
      const kick = window.setInterval(spin, 1500);
      m.once("remove", () => window.clearInterval(kick));
    });

    return () => {
      cancelled = true;
      readyRef.current = false;
      loadedRef.current = false;
      for (const mk of markers.current) mk.remove();
      markers.current = [];
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; basemap changes are handled below.
  }, [syncData, syncSelection, syncLayers, syncMarkers, declutter, applyCamera]);

  // Basemap swap: rebuild the style, data is re-pushed on style.load.
  const firstBasemap = useRef(props.basemap);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || props.basemap === firstBasemap.current) return;
    firstBasemap.current = props.basemap;
    readyRef.current = false;
    buildStyle(props.basemap, { sources: dataSources(), layers: dataLayers }).then(({ style }) => {
      if (mapRef.current === map) map.setStyle(style, { diff: false });
    });
  }, [props.basemap]);

  useEffect(() => syncData(), [syncData, props.incidents, props.hotspots, props.freshIds, props.now]);
  useEffect(() => syncSelection(), [syncSelection, props.selection]);
  useEffect(() => syncLayers(), [syncLayers, props.layers]);
  useEffect(() => syncMarkers(), [syncMarkers, props.hotspots]);

  // Camera commands (queued until the map exists).
  useEffect(() => {
    const c = props.camera;
    if (!c) return;
    pendingCamera.current = c;
    const map = mapRef.current;
    if (map && loadedRef.current) applyCamera(map, c);
  }, [props.camera, applyCamera]);

  return <div ref={container} className="absolute inset-0" aria-label="Interactive 3D globe of live events" role="region" />;
}

/** Execute a camera command. Stateless so it can run on load or on demand. */
function runCamera(map: MLMap, c: CameraCommand) {
  if (c.reset) {
    const el = map.getContainer();
    const pad = panelPadding(el.clientWidth);
    map.flyTo({
      center: INITIAL_CENTER,
      zoom: fitZoom(el.clientWidth - pad.left - pad.right, el.clientHeight - pad.top - pad.bottom),
      pitch: 0,
      bearing: 0,
      duration: 1800,
      essential: true,
    });
    return;
  }
  if (c.bbox && c.bbox[2] - c.bbox[0] < 120) {
    map.fitBounds(
      [
        [c.bbox[0], c.bbox[1]],
        [c.bbox[2], c.bbox[3]],
      ],
      { padding: 80, duration: 1800, maxZoom: 7, essential: true },
    );
    return;
  }
  if (c.lat !== undefined && c.lon !== undefined) {
    map.flyTo({ center: [c.lon, c.lat], zoom: c.zoom ?? Math.max(map.getZoom(), 5), duration: 1800, essential: true, curve: 1.5 });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
