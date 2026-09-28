import { describe, expect, it } from "vitest";
import { fuse, headlineWords, sameStory } from "./fusion";
import type { Signal } from "./types";

const T = Date.UTC(2026, 8, 28, 12);

function wire(o: Partial<Signal> & { headline: string; lat: number; lon: number }): Signal {
  return {
    key: `wire:${o.headline}`,
    source: "wire",
    category: "conflict",
    title: o.headline,
    precision: "region",
    place: "",
    country: "MM",
    time: T,
    severity: 0.7,
    quality: 0.8,
    reports: 1,
    ...o,
  };
}

describe("same-story fusion", () => {
  it("matches reworded headlines about one event", () => {
    const a = headlineWords("Myanmar airstrike kills 33 in Rohingya majority Rakhine State");
    const b = headlineWords("At least 33 killed after Myanmar military air strike hits market");
    expect(sameStory(a, b)).toBe(true);
    expect(sameStory(a, headlineWords("Myanmar junta announces election date"))).toBe(false);
  });

  it("folds a country-level report into the located incident it describes", () => {
    const incidents = fuse([
      wire({ headline: "Myanmar airstrike kills 33 in Rohingya majority Rakhine State", lat: 20.1, lon: 93.0, precision: "region" }),
      wire({ headline: "At least 33 killed after Myanmar military air strike hits market", lat: 21.9, lon: 95.9, precision: "country", time: T - 3_600_000 }),
    ]);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].precision).toBe("region");
  });

  it("joins the matching story even when unrelated country-level reports came first", () => {
    const incidents = fuse([
      wire({ headline: "Myanmar rebels seize border town after week of fighting", lat: 21.9, lon: 95.9, precision: "country", quality: 0.95 }),
      wire({ headline: "At least 33 killed after Myanmar military air strike hits market", lat: 21.9, lon: 95.9, precision: "country", quality: 0.9 }),
      wire({ headline: "Myanmar's military airstrike kills at least 33 in Rakhine State", lat: 20.1, lon: 93.0, precision: "region", quality: 0.85 }),
    ]);
    expect(incidents).toHaveLength(2);
    const strike = incidents.find((i) => i.signals.length === 2)!;
    expect(strike.precision).toBe("region");
  });

  it("treats one article coded at two places as one story", () => {
    const url = "https://news.example/2026/09/28/two-mass-shootings-in-south-africa-leave-28-dead";
    const incidents = fuse([
      wire({ source: "gdelt", key: "gdelt:a", headline: "Two mass shootings in South Africa leave 28 dead", url, country: "ZA", lat: -26.2, lon: 28.04, precision: "city" }),
      wire({ source: "gdelt", key: "gdelt:b", headline: "Two mass shootings in South Africa leave 28 dead", url, country: "ZA", lat: -33.92, lon: 18.42, precision: "city" }),
    ]);
    expect(incidents).toHaveLength(1);
  });

  it("keeps separate events from one live blog apart", () => {
    const url = "https://news.example/live/ukraine-war-latest";
    const incidents = fuse([
      wire({ source: "gdelt", key: "gdelt:kyiv", headline: "Ukraine war latest: Russia strikes Kyiv and Kharkiv overnight", url, country: "UA", lat: 50.45, lon: 30.52, precision: "city" }),
      wire({ source: "gdelt", key: "gdelt:kharkiv", headline: "Ukraine war latest: Russia strikes Kyiv and Kharkiv overnight", url, country: "UA", lat: 49.99, lon: 36.23, precision: "city" }),
    ]);
    expect(incidents).toHaveLength(2);
  });

  it("lets a report placed only by a demonym join the same story elsewhere", () => {
    const incidents = fuse([
      wire({ headline: "Lebanon says Israeli army set off large explosion in south", country: "LB", lat: 33.9, lon: 35.9, precision: "country", quality: 0.9 }),
      wire({ headline: "Israeli army set off large explosion in south, report says", country: "IL", lat: 31.5, lon: 34.8, precision: "country", geoWeak: true }),
    ]);
    expect(incidents).toHaveLength(1);
    // Without the weak flag the two countries stay apart.
    expect(
      fuse([
        wire({ headline: "Lebanon says Israeli army set off large explosion in south", country: "LB", lat: 33.9, lon: 35.9, precision: "country" }),
        wire({ headline: "Israeli army set off large explosion in south, report says", country: "IL", lat: 31.5, lon: 34.8, precision: "country" }),
      ]),
    ).toHaveLength(2);
  });

  it("never merges two precisely located events on wording alone", () => {
    const incidents = fuse([
      wire({ headline: "Russian drone strike kills 3 in Kharkiv", lat: 49.99, lon: 36.23, country: "UA", precision: "city" }),
      wire({ headline: "Russian drone strike kills 3 in Odesa", lat: 46.48, lon: 30.72, country: "UA", precision: "city" }),
    ]);
    expect(incidents).toHaveLength(2);
  });
});
