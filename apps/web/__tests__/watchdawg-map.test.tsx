import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import axe from "axe-core";

// MapLibre WebGL is unavailable in jsdom; mock react-map-gl + deck.gl
// to keep the component tree renderable so we can scan a11y attributes.
vi.mock("react-map-gl/maplibre", () => ({
  Map: ({ children }: { children?: React.ReactNode }) => (
    <div data-mock="map-canvas">{children}</div>
  ),
  NavigationControl: () => <div data-mock="nav-control" />,
  ScaleControl: () => <div data-mock="scale-control" />,
  Source: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Layer: () => <div data-mock="layer" />,
  useControl: () => ({ setProps: () => {} }),
}));

vi.mock("@deck.gl/mapbox", () => ({
  MapboxOverlay: class {
    setProps() {}
  },
}));

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

import { WatchdawgMap } from "@/components/map/watchdawg-map";
import { FOCUS_BBOX, buildGraticule } from "@/components/map/focus-region";

describe("WatchdawgMap", () => {
  it("renders a region with a Red Sea / Horn of Africa aria-label", () => {
    const { getByRole } = render(<WatchdawgMap />);
    const region = getByRole("region", {
      name: /maritime situational map/i,
    });
    expect(region).toBeInTheDocument();
  });

  it("passes axe with zero critical violations on the map container", async () => {
    const { container } = render(<WatchdawgMap />);
    const results = await axe.run(container, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    const critical = results.violations.filter((v) => v.impact === "critical");
    expect(critical, JSON.stringify(critical, null, 2)).toHaveLength(0);
  });
});

describe("focus-region graticule", () => {
  it("covers lat 10..30 and lon 32..55 with 1-degree lines", () => {
    const gc = buildGraticule();
    const parallels = gc.features.filter((f) => f.properties?.kind === "parallel");
    const meridians = gc.features.filter((f) => f.properties?.kind === "meridian");
    expect(parallels).toHaveLength(FOCUS_BBOX.latMax - FOCUS_BBOX.latMin + 1);
    expect(meridians).toHaveLength(FOCUS_BBOX.lonMax - FOCUS_BBOX.lonMin + 1);
  });
});
