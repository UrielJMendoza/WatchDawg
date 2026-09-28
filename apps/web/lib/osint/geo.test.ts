import { describe, expect, it } from "vitest";
import { formatDms, haversineKm, weightedCentroid } from "./geo";

describe("geo helpers", () => {
  it("formats DMS without a 60-second overflow", () => {
    expect(formatDms(53.2, -8.1)).toBe("53°12′00″N 8°06′00″W");
    expect(formatDms(-33.8688, 151.2093)).toBe("33°52′08″S 151°12′33″E");
  });
  it("measures great-circle distance", () => {
    expect(Math.round(haversineKm(51.5074, -0.1278, 48.8566, 2.3522))).toBe(344);
  });
  it("averages positions across the antimeridian", () => {
    const c = weightedCentroid([
      { lat: 0, lon: 179, w: 1 },
      { lat: 0, lon: -179, w: 1 },
    ]);
    expect(Math.abs(Math.abs(c.lon) - 180)).toBeLessThan(1e-6);
  });
});
