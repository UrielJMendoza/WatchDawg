import { describe, expect, it } from "vitest";
import { socrataLocal, zonedToUtc } from "./time";

describe("zoned time", () => {
  it("converts floating local times with DST", () => {
    expect(new Date(zonedToUtc("2026-07-01T12:00:00.000", "America/Los_Angeles")).toISOString()).toBe("2026-07-01T19:00:00.000Z");
    expect(new Date(zonedToUtc("2026-01-15T12:00:00", "America/Chicago")).toISOString()).toBe("2026-01-15T18:00:00.000Z");
  });
  it("round-trips through socrataLocal", () => {
    const t = Date.UTC(2026, 8, 28, 6, 20);
    expect(zonedToUtc(socrataLocal(t, "America/Chicago"), "America/Chicago")).toBe(t);
  });
});
