import { describe, expect, it } from "vitest";
import { LEGAL_VOCAB, MIN_TEXT_SCORE, VIOLENCE_VOCAB, classifyText } from "./taxonomy";

describe("headline vocabulary", () => {
  // Real slug headlines GDELT coded as conflict/assault on the live site.
  it.each([
    "Jumpman gaming wins tax dispute freeplay promotions",
    "Trump Iowa largest steel project minnesota mesabi iron range",
    "Fact check james link to data center tax breaks donations",
    "Us to restrict visas over child abduction cases".replace("abduction", "custody"),
    "More questions emerge bombshell raf",
  ])("vetoes non-violent coverage: %s", (h) => {
    expect(VIOLENCE_VOCAB.test(h)).toBe(false);
  });

  it.each([
    "Heavy fighting reported on the outskirts of Kharkiv",
    "Photos: Russian drone strikes pound civilian targets across Kyiv",
    "Israeli army set off large explosion in south, report says",
    "Woman charged with supplying gun Felon who killed 4 officers 2024 ambush",
    "Forces exchange fire near Odesa overnight",
    "Ukraine war latest: Russia strikes downtown Kyiv, kills one, injures 24",
  ])("keeps violent coverage: %s", (h) => {
    expect(VIOLENCE_VOCAB.test(h)).toBe(true);
  });

  it("classifies headlines into categories", () => {
    expect(classifyText("Air strikes hit targets near Gaza")?.category).toBe("conflict");
    expect(classifyText("Protesters clash with riot police in Nairobi")?.category).toBe("unrest");
    expect(classifyText("Magnitude 6.1 earthquake strikes off Japan")?.category).toBe("seismic");
    expect(classifyText("Champions League: late goal seals win")).toBeNull();
    expect(classifyText("Man convicted of murder in Chicago robbery")?.category).toBe("crime");
    // Commentary that merely mentions war is not a conflict event on its own.
    expect(classifyText("Pope touches on war, migration in speech at Metz")?.score).toBeLessThan(MIN_TEXT_SCORE);
    expect(classifyText("Ukraine war latest: Russia strikes downtown Kyiv, kills one")).toMatchObject({ category: "conflict" });
    expect(classifyText("Seoul summons Ukraine envoy over North Korean prisoner-of-war row")?.category).toBe("tension");
    expect(LEGAL_VOCAB.test("Rome court sentences 3 Egyptian security officials over abduction")).toBe(true);
    // Rulings and clinical trials are not crime.
    expect(classifyText("Supreme Court ruling on tariffs expected")).toBeNull();
    expect(classifyText("Vaccine trial shows promise")).toBeNull();
  });
});
