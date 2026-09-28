import { describe, expect, it } from "vitest";
import { matchesFilters, parseQuery } from "./query";
import type { Incident } from "./types";

describe("query language", () => {
  it("separates operators from free text", () => {
    const q = parseQuery('cat:conflict,protest sev>0.6 "Kharkiv oblast" src:gdelt multi drones');
    expect(q.text).toBe("Kharkiv oblast drones");
    expect([...q.filters.categories!]).toEqual(["conflict", "unrest"]);
    expect(q.filters.minSeverity).toBe(0.6);
    expect([...q.filters.sources!]).toEqual(["gdelt"]);
    expect(q.filters.corroborated).toBe(true);
  });
  it("understands flag words", () => {
    const q = parseQuery("fatal precise gaza");
    expect(q.filters).toMatchObject({ fatal: true, precise: true });
    expect(q.text).toBe("gaza");
  });
  it("reports operators it does not understand", () => {
    expect(parseQuery("foo:bar").unknown).toEqual(["foo:bar"]);
  });
  it("matches incidents", () => {
    const inc = { category: "conflict", severity: 0.9, confidence: 0.8, sources: ["gdelt", "wire"], reliability: "B", credibility: 2, country: "UA" } as Incident;
    expect(matchesFilters(inc, parseQuery("country:ua sev>50 multi").filters)).toBe(true);
    expect(matchesFilters(inc, parseQuery("domain:hazard").filters)).toBe(false);
    expect(matchesFilters(inc, parseQuery("cred<=1").filters)).toBe(false);
  });
});
