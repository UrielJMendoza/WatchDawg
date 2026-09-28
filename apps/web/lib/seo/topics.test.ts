import { describe, expect, it } from "vitest";
import type { Incident } from "@/lib/osint/types";
import { parseQuery, matchesFilters } from "@/lib/osint/query";
import { TOPICS, topicBySlug } from "./topics";

const inc = (category: Incident["category"], sources: Incident["sources"] = ["gdelt"]) =>
  ({ category, sources, severity: 0.5, confidence: 0.5, reliability: "C", credibility: 3 }) as Incident;

describe("SEO topics", () => {
  it("have unique slugs and unique titles", () => {
    expect(new Set(TOPICS.map((t) => t.slug)).size).toBe(TOPICS.length);
    expect(new Set(TOPICS.map((t) => t.title)).size).toBe(TOPICS.length);
    for (const t of TOPICS) expect(t.description.length).toBeLessThanOrEqual(200);
  });

  it("each page's filter agrees with the console query it links to", () => {
    const samples = [inc("conflict"), inc("security"), inc("crime"), inc("unrest"), inc("seismic"), inc("flood"), inc("diplomacy", ["wire"])];
    for (const t of TOPICS) {
      const q = parseQuery(t.query);
      expect(q.unknown).toEqual([]);
      for (const s of samples) expect(matchesFilters(s, q.filters)).toBe(t.match(s));
    }
  });

  it("looks topics up by slug", () => {
    expect(topicBySlug("war")?.h1).toBe("Live war map");
    expect(topicBySlug("nope")).toBeUndefined();
  });
});
