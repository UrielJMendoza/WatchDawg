"use client";

import { useEffect, useMemo, useRef } from "react";
import Map, {
  type MapRef,
  NavigationControl,
  ScaleControl,
  Source,
  Layer,
} from "react-map-gl/maplibre";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { useControl } from "react-map-gl/maplibre";
import type { Layer as DeckLayer } from "@deck.gl/core";
import type { FeatureCollection } from "geojson";

const CARTO_DARK_MATTER =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Red Sea / Horn of Africa focus bbox.
// lat: 10..30, lon: 32..55
const INITIAL_VIEW = {
  longitude: 43.5,
  latitude: 15.0,
  zoom: 4.5,
  bearing: 0,
  pitch: 0,
};

/**
 * Build a 1° graticule covering the focus bbox as a GeoJSON FeatureCollection.
 * Subtle 10% opacity primary stroke when rendered.
 */
function buildGraticule(): FeatureCollection {
  const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (let lat = 10; lat <= 30; lat += 1) {
    lines.push({
      type: "Feature",
      properties: { kind: "parallel" },
      geometry: {
        type: "LineString",
        coordinates: [
          [32, lat],
          [55, lat],
        ],
      },
    });
  }
  for (let lon = 32; lon <= 55; lon += 1) {
    lines.push({
      type: "Feature",
      properties: { kind: "meridian" },
      geometry: {
        type: "LineString",
        coordinates: [
          [lon, 10],
          [lon, 30],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features: lines };
}

function DeckGLOverlay({ layers }: { layers: DeckLayer[] }) {
  const overlay = useControl<MapboxOverlay>(
    () => new MapboxOverlay({ interleaved: true, layers }),
  );
  overlay.setProps({ layers });
  return null;
}

export function WatchDawgMap() {
  const mapRef = useRef<MapRef>(null);
  const graticule = useMemo(() => buildGraticule(), []);
  const layers: DeckLayer[] = useMemo(() => [], []);

  useEffect(() => {
    // Phase 1: data layers are empty. Just announce successful init.
    if (mapRef.current) {
      console.log("[WATCHDAWG] Map initialized");
    }
  }, []);

  return (
    <Map
      ref={mapRef}
      initialViewState={INITIAL_VIEW}
      mapStyle={CARTO_DARK_MATTER}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
    >
      <Source id="graticule" type="geojson" data={graticule}>
        <Layer
          id="graticule-line"
          type="line"
          paint={{
            "line-color": "hsl(199, 89%, 55%)",
            "line-opacity": 0.1,
            "line-width": 0.5,
          }}
        />
      </Source>

      <NavigationControl position="top-right" showCompass={false} />
      <ScaleControl position="bottom-left" unit="nautical" />
      <DeckGLOverlay layers={layers} />
    </Map>
  );
}
