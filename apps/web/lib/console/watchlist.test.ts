import { describe, expect, it } from "vitest";
import type { Incident } from "@/lib/osint/types";
import { newAlerts } from "./watchlist";

const inc = (id: string, country: string, severity: number) =>
  ({ id, country, severity, title: id, reliability: "B", credibility: 2 }) as Incident;

describe("watchlist alerts", () => {
  it("alerts once per new, severe incident in a watched country", () => {
    const list = [inc("a", "UA", 0.9), inc("b", "UA", 0.3), inc("c", "FR", 0.95), inc("d", "UA", 0.7)];
    const out = newAlerts(list, new Set(["UA"]), new Set(["d"]), 1);
    expect(out.map((a) => a.incidentId)).toEqual(["a"]);
    expect(out[0]).toMatchObject({ grade: "B2", read: false, country: "UA" });
  });
});
