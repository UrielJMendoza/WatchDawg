import { describe, expect, it } from "vitest";
import { buildRelations, stanceOf } from "./relations";
import type { RelationObs } from "./sources/types";

const NOW = 1_800_000_000_000;
const obs = (over: Partial<RelationObs>): RelationObs => ({
  from: "RU",
  to: "UA",
  time: NOW - 3_600_000,
  articles: 5,
  outlet: "a.example",
  goldstein: -9,
  tone: -6,
  category: "conflict",
  ...over,
});

describe("relations", () => {
  it("classifies stance from Goldstein", () => {
    expect(stanceOf(-5)).toBe("hostile");
    expect(stanceOf(0.5)).toBe("mixed");
    expect(stanceOf(4)).toBe("cooperative");
  });

  it("requires articles, outlets and events before drawing a link", () => {
    const single = buildRelations([obs({ articles: 50 })], "24h", NOW, 86_400_000);
    expect(single).toHaveLength(0); // one event, one outlet
    const ok = buildRelations([obs({}), obs({ outlet: "b.example" })], "24h", NOW, 86_400_000);
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ id: "RU>UA", events: 2, articles: 10, outlets: 2, stance: "hostile" });
  });

  it("only counts observations inside the window", () => {
    const old = [obs({ time: NOW - 5 * 3_600_000 }), obs({ time: NOW - 5 * 3_600_000, outlet: "b.example" })];
    expect(buildRelations(old, "1h", NOW, 3_600_000)).toHaveLength(0);
    expect(buildRelations(old, "6h", NOW, 6 * 3_600_000)).toHaveLength(1);
  });
});
