import { describe, expect, it } from "vitest";
import type { Incident } from "@/lib/osint/types";
import { DEFAULT_FILTERS, activeFilterCount, passesFilters, readUrlState, writeUrlState } from "./state";

const inc = (over: Partial<Incident>): Incident =>
  ({
    id: "x",
    category: "conflict",
    severity: 0.8,
    confidence: 0.7,
    sources: ["gdelt"],
    precision: "city",
    firstSeen: 1_000,
    lastSeen: 2_000,
    ...over,
  }) as Incident;

describe("console filters", () => {
  it("keeps incidents whose activity overlaps the brushed range", () => {
    const f = { ...DEFAULT_FILTERS, timeRange: [1_500, 3_000] as [number, number] };
    expect(passesFilters(inc({}), f)).toBe(true);
    expect(passesFilters(inc({ firstSeen: 3_500, lastSeen: 4_000 }), f)).toBe(false);
    expect(passesFilters(inc({ firstSeen: 100, lastSeen: 900 }), f)).toBe(false);
    expect(activeFilterCount(f)).toBe(1);
  });

  it("applies threshold and corroboration filters", () => {
    expect(passesFilters(inc({}), { ...DEFAULT_FILTERS, minSeverity: 0.9 })).toBe(false);
    expect(passesFilters(inc({}), { ...DEFAULT_FILTERS, corroboratedOnly: true })).toBe(false);
    expect(passesFilters(inc({ sources: ["gdelt", "wire"] }), { ...DEFAULT_FILTERS, corroboratedOnly: true })).toBe(true);
    expect(passesFilters(inc({}), { ...DEFAULT_FILTERS, domains: { security: false, civil: true, hazard: true } })).toBe(false);
  });

  it("round-trips URL state for every selection kind", () => {
    for (const sel of ["i:abc", "h:def", "c:UA", "a:ae1234", "s:25544", "r:RU>UA"]) {
      const u = readUrlState(`?sel=${sel}&w=7d&q=cat%3Aconflict`);
      expect(writeUrlState(u)).toBe(`?w=7d&q=cat%3Aconflict&sel=${encodeURIComponent(sel)}`);
    }
  });
});
