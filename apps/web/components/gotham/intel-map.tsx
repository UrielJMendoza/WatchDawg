"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, {
  type MapRef,
  NavigationControl,
  Source,
  Layer as MapLayer,
  useControl,
} from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  ScatterplotLayer,
  GeoJsonLayer,
  PathLayer,
  TextLayer,
} from "@deck.gl/layers";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import type { Layer as DeckLayer, PickingInfo } from "@deck.gl/core";
import type { FeatureCollection } from "geojson";
import { greatCircle } from "@/lib/intel/geo";
import { NATIONS, THEATERS } from "@/lib/intel/theaters";
import type { Arc, IntelEvent, Theater } from "@/lib/intel/types";

const CARTO_DARK_MATTER =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const BORDERS_URL = "/geo/focus-nations.geojson";

export interface MapLayers {
  borders: boolean;
  heat: boolean;
  events: boolean;
  arcs: boolean;
  labels: boolean;
}

interface IntelMapProps {
  theater: Theater;
  events: IntelEvent[];
  arcs: Arc[];
  selectedId: string | null;
  layers: MapLayers;
  onSelect: (e: IntelEvent | null) => void;
  onHover: (info: { event: IntelEvent; x: number; y: number } | null) => void;
}

/** Severity ramp: cool cyan -> amber -> hot red. */
function sevColor(sev: number, a = 255): [number, number, number, number] {
  if (sev < 0.5) {
    const t = sev / 0.5;
    return [42 + t * 200, 168, 242 - t * 60, a];
  }
  const t = (sev - 0.5) / 0.5;
  return [242, 168 - t * 120, 34, a];
}

type LL = [number, number];

/** Precompute great-circle rails for the derived tension arcs. */
function buildRails(arcs: Arc[]): Array<{ arc: Arc; path: LL[] }> {
  return arcs.map((arc) => ({
    arc,
    path: greatCircle(arc.from, arc.to, 64),
  }));
}

function buildGraticule(bbox: [number, number, number, number]): FeatureCollection {
  const [w, s, e, n] = bbox;
  const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  const step = 5;
  for (let lat = Math.ceil(s / step) * step; lat <= n; lat += step) {
    lines.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[w, lat], [e, lat]] },
    });
  }
  for (let lon = Math.ceil(w / step) * step; lon <= e; lon += step) {
    lines.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[lon, s], [lon, n]] },
    });
  }
  return { type: "FeatureCollection", features: lines };
}

/**
 * Deck.gl overlay that animates itself via requestAnimationFrame WITHOUT
 * forcing React re-renders — it rebuilds the layer list each frame from refs
 * holding the latest props and pushes them straight to the MapboxOverlay.
 */
function AnimatedOverlay(props: IntelMapProps) {
  const ref = useRef(props);
  ref.current = props;

  const rails = useMemo(() => buildRails(props.arcs), [props.arcs]);
  const railsRef = useRef(rails);
  railsRef.current = rails;

  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ interleaved: true, layers: [] }),
  );

  useEffect(() => {
    let raf = 0;
    const start = performance.now();

    const frame = () => {
      const t = (performance.now() - start) / 1000;
      const p = ref.current;
      const L = p.layers;
      const layers: DeckLayer[] = [];

      // --- Nation glow borders (two passes: wide halo + crisp edge) ---
      if (L.borders) {
        layers.push(
          new GeoJsonLayer({
            id: "borders-halo",
            data: BORDERS_URL,
            stroked: true,
            filled: true,
            getLineColor: (f: { properties?: { code?: string } }) => {
              const c = NATIONS[(f.properties?.code ?? "IL") as keyof typeof NATIONS]
                ?.rgb ?? [42, 168, 242];
              return [c[0], c[1], c[2], 40];
            },
            getFillColor: (f: { properties?: { code?: string } }) => {
              const c = NATIONS[(f.properties?.code ?? "IL") as keyof typeof NATIONS]
                ?.rgb ?? [42, 168, 242];
              return [c[0], c[1], c[2], 14];
            },
            lineWidthMinPixels: 6,
            getLineWidth: 6,
            lineWidthUnits: "pixels",
          }) as unknown as DeckLayer,
        );
        layers.push(
          new GeoJsonLayer({
            id: "borders-edge",
            data: BORDERS_URL,
            stroked: true,
            filled: false,
            getLineColor: (f: { properties?: { code?: string } }) => {
              const c = NATIONS[(f.properties?.code ?? "IL") as keyof typeof NATIONS]
                ?.rgb ?? [42, 168, 242];
              const pulse = 160 + Math.sin(t * 1.6) * 80;
              return [c[0], c[1], c[2], pulse];
            },
            lineWidthMinPixels: 1.4,
            updateTriggers: { getLineColor: Math.floor(t * 8) },
          }) as unknown as DeckLayer,
        );
      }

      // --- Heat density from real mention counts ---
      if (L.heat && p.events.length) {
        layers.push(
          new HeatmapLayer({
            id: "heat",
            data: p.events,
            getPosition: (e: IntelEvent) => [e.lon, e.lat],
            getWeight: (e: IntelEvent) => e.count,
            radiusPixels: 55,
            intensity: 1.1,
            threshold: 0.05,
            opacity: 0.35,
            colorRange: [
              [12, 32, 60],
              [20, 90, 160],
              [42, 168, 242],
              [242, 169, 34],
              [224, 72, 72],
              [255, 230, 200],
            ],
          }) as unknown as DeckLayer,
        );
      }

      // --- Derived tension rails + travelling pulse ---
      if (L.arcs) {
        for (const { arc, path } of railsRef.current) {
          const c = sevColor(arc.intensity);
          layers.push(
            new PathLayer({
              id: `rail-${arc.id}`,
              data: [{ path }],
              getPath: (d: { path: LL[] }) => d.path,
              getColor: [c[0], c[1], c[2], 70],
              getWidth: 2,
              widthUnits: "pixels",
              capRounded: true,
            }) as unknown as DeckLayer,
          );
          // Bright segment that travels along the rail.
          const n = path.length;
          const head = Math.floor(((t * 0.18 + arc.intensity) % 1) * n);
          const seg = path.slice(head, Math.min(n, head + 7));
          if (seg.length >= 2) {
            layers.push(
              new PathLayer({
                id: `pulse-${arc.id}`,
                data: [{ path: seg }],
                getPath: (d: { path: LL[] }) => d.path,
                getColor: [c[0], c[1], c[2], 255],
                getWidth: 3.5,
                widthUnits: "pixels",
                capRounded: true,
                updateTriggers: { getPath: head },
              }) as unknown as DeckLayer,
            );
          }
        }
      }

      // --- Radar-ping rings (pulse uniformly via time-driven scale) ---
      if (L.events && p.events.length) {
        const phase = (t % 2.4) / 2.4; // 0..1
        layers.push(
          new ScatterplotLayer({
            id: "ping",
            data: p.events,
            getPosition: (e: IntelEvent) => [e.lon, e.lat],
            stroked: true,
            filled: false,
            getLineColor: (e: IntelEvent) => sevColor(e.severity, 255),
            getRadius: (e: IntelEvent) => 6000 + e.severity * 26000,
            radiusScale: 1 + phase * 2.6,
            getLineWidth: 600,
            lineWidthMinPixels: 1,
            opacity: 1 - phase,
            updateTriggers: { getLineColor: 1 },
          }) as unknown as DeckLayer,
        );

        // --- Solid hotspot dots (pickable) ---
        layers.push(
          new ScatterplotLayer({
            id: "events",
            data: p.events,
            pickable: true,
            getPosition: (e: IntelEvent) => [e.lon, e.lat],
            getFillColor: (e: IntelEvent) =>
              e.id === p.selectedId
                ? [255, 255, 255, 255]
                : sevColor(e.severity, 230),
            getLineColor: [8, 12, 20, 255],
            stroked: true,
            getLineWidth: 200,
            lineWidthMinPixels: 1,
            getRadius: (e: IntelEvent) =>
              (e.id === p.selectedId ? 9000 : 4500) + e.severity * 9000,
            radiusMinPixels: 2.5,
            radiusMaxPixels: 22,
            onClick: (info: PickingInfo) =>
              ref.current.onSelect((info.object as IntelEvent) ?? null),
            onHover: (info: PickingInfo) =>
              ref.current.onHover(
                info.object
                  ? { event: info.object as IntelEvent, x: info.x, y: info.y }
                  : null,
              ),
            updateTriggers: { getFillColor: p.selectedId, getRadius: p.selectedId },
          }) as unknown as DeckLayer,
        );
      }

      // --- Capital labels ---
      if (L.labels) {
        const caps = THEATERS[p.theater].nations.map((code) => {
          const nn = NATIONS[code];
          return {
            name: nn.capital.name.toUpperCase(),
            coord: [nn.capital.lon, nn.capital.lat] as [number, number],
            rgb: nn.rgb,
          };
        });
        layers.push(
          new TextLayer({
            id: "labels",
            data: caps,
            getPosition: (d: { coord: [number, number] }) => d.coord,
            getText: (d: { name: string }) => d.name,
            getColor: (d: { rgb: [number, number, number] }) => [
              ...d.rgb,
              235,
            ],
            getSize: 12,
            getPixelOffset: [0, -14],
            fontFamily: "monospace",
            fontWeight: 700,
            background: true,
            getBackgroundColor: [8, 12, 20, 180],
            backgroundPadding: [4, 2],
            characterSet: "auto",
          }) as unknown as DeckLayer,
        );
      }

      overlay.setProps({ layers });
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [overlay]);

  return null;
}

export function IntelMap(props: IntelMapProps) {
  const mapRef = useRef<MapRef>(null);
  const view = THEATERS[props.theater].view;
  const graticule = useMemo(
    () => buildGraticule(THEATERS[props.theater].bbox),
    [props.theater],
  );

  // Cinematic camera fly between theaters.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    map.flyTo({
      center: [view.longitude, view.latitude],
      zoom: view.zoom,
      pitch: view.pitch,
      bearing: view.bearing,
      duration: 2600,
      essential: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.theater]);

  return (
    <Map
      ref={mapRef}
      initialViewState={view}
      mapStyle={CARTO_DARK_MATTER}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
      maxPitch={60}
    >
      <Source id="graticule" type="geojson" data={graticule}>
        <MapLayer
          id="graticule-line"
          type="line"
          paint={{
            "line-color": "hsl(199, 89%, 55%)",
            "line-opacity": 0.08,
            "line-width": 0.5,
          }}
        />
      </Source>

      <NavigationControl position="top-right" showCompass={false} />
      <AnimatedOverlay {...props} />
    </Map>
  );
}
