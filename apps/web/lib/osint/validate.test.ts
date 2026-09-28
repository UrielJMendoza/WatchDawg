import { describe, expect, it } from "vitest";
import { checkCoords, checkTime, cleanText, headlineFromUrl, safeUrl } from "./validate";

describe("validation primitives", () => {
  it("rejects impossible and null-island coordinates", () => {
    expect(checkCoords(48.2, 37.1)).toBeNull();
    expect(checkCoords(91, 0)).toBe("coord.range");
    expect(checkCoords(0, 0)).toBe("coord.null_island");
    expect(checkCoords(Number.NaN, 3)).toBe("coord.nan");
    expect(checkCoords("48", 3)).toBe("coord.missing");
  });

  it("classifies timestamps", () => {
    const now = 1_800_000_000_000;
    expect(checkTime(now - 1000, now, 3_600_000)).toBeNull();
    expect(checkTime(now + 3_600_000, now, 3_600_000)).toBe("time.future");
    expect(checkTime(now - 7_200_000, now, 3_600_000)).toBe("window.stale");
    expect(checkTime(Number.NaN, now, 1)).toBe("time.invalid");
  });

  it("strips markup and decodes entities", () => {
    expect(cleanText("<p>Strikes &amp; shelling&#8217;s toll</p>")).toBe("Strikes & shelling’s toll");
    expect(cleanText("<![CDATA[Hello <b>world</b>]]>")).toBe("Hello world");
    expect(cleanText("<script>alert(1)</script>ok")).toBe("ok");
  });

  it("only keeps http(s) URLs", () => {
    expect(safeUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("not a url")).toBeUndefined();
  });

  it("drops numeric ids glued to the first slug word", () => {
    expect(headlineFromUrl("https://x.example/news/26588657.men-arrested-suspected-terror-plot-released-bail")).toBe(
      "Men arrested suspected terror plot released bail",
    );
  });

  it("turns a news slug into a headline and restores known names", () => {
    expect(headlineFromUrl("https://x.com/2026/09/28/russian-drone-strike-hits-kharkiv-apartment-block.html", ["Kharkiv"])).toBe(
      "Russian drone strike hits Kharkiv apartment block",
    );
    expect(headlineFromUrl("https://x.com/article/123456789")).toBeUndefined();
    expect(headlineFromUrl("https://x.com/world/britain-s-gaza-secrets-exposed-by-un-report")).toBe("Britain's gaza secrets exposed by UN report");
  });
});
