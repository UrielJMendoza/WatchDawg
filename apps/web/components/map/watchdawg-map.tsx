"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  Layer,
  Map,
  NavigationControl,
  ScaleControl,
  Source,
  useControl,
} from "react-map-gl/maplibre";
import { MapboxOverlay, type MapboxOverlayProps } from "@deck.gl/mapbox";
import "maplibre-gl/dist/maplibre-gl.css";

import { INITIAL_VIEW, buildGraticule } from "./focus-region";

// CARTO dark-matter style is MIT and free of API keys; matches the Gotham
// palette and has no attribution tile that pins a vendor logo to the map.
const BASE_STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Hard-coded HSL string that mirrors `--primary` (tokens in app/globals.css).
// MapLibre paint properties cannot read CSS custom properties at render;
// if the theme primary changes, update this constant in lockstep.
const GRATICULE_STROKE = "hsl(199 89% 55%)";

type DeckGLOverlayProps = MapboxOverlayProps & {
  interleaved?: boolean;
};

/** deck.gl MapboxOverlay mounted as a MapLibre IControl. Interleaved mode
 * lets deck layers render between MapLibre's own style layers so later
 * phases can slot vessels under labels, icons over raster heatmaps, etc. */
function DeckOverlay(props: DeckGLOverlayProps) {
  const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));
  overlay.setProps(props);
  return null;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => false,
  );
}

function logMapReady(): void {
  // Structured log so Phase 2+ observability tooling can filter on event.
  // Console is the only transport we have on the client; JSON lines keep
  // the shape consistent with the backend's structlog output.
  console.info(
    JSON.stringify({
      event: "map_ready",
      ts: new Date().toISOString(),
      source: "watchdawg-map",
    }),
  );
}

export function WatchdawgMap() {
  const prefersReducedMotion = usePrefersReducedMotion();
  const graticule = useMemo(() => buildGraticule(), []);

  return (
    <div
      role="region"
      aria-label="Maritime situational map — Red Sea and Horn of Africa"
      className="relative h-full w-full"
      data-testid="watchdawg-map"
    >
      <Map
        initialViewState={{ ...INITIAL_VIEW }}
        mapStyle={BASE_STYLE_URL}
        attributionControl={{ compact: true }}
        dragRotate={false}
        touchPitch={false}
        touchZoomRotate
        fadeDuration={prefersReducedMotion ? 0 : 300}
        onLoad={logMapReady}
        style={{ position: "absolute", inset: 0 }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-left" unit="nautical" />

        <Source id="focus-graticule" type="geojson" data={graticule}>
          <Layer
            id="focus-graticule-lines"
            type="line"
            paint={{
              "line-color": GRATICULE_STROKE,
              "line-opacity": 0.1,
              "line-width": 0.5,
            }}
          />
        </Source>

        <DeckOverlay interleaved layers={[]} />
      </Map>
    </div>
  );
}
