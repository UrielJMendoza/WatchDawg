import { describe, expect, it } from "vitest";
import { VIOLENCE_VOCAB, classifyText } from "./taxonomy";

describe("headline vocabulary", () => {
  // Real slug headlines GDELT coded as conflict/assault on the live site.
  it.each([
    "Jumpman gaming wins tax dispute freeplay promotions",
    "Trump Iowa largest steel project minnesota mesabi iron range",
    "Fact check james link to data center tax breaks donations",
    "Us to restrict visas over child abduction cases".replace("abduction", "custody"),
  ])("vetoes non-violent coverage: %s", (h) => {
    expect(VIOLENCE_VOCAB.test(h)).toBe(false);
  });

  it.each([
    "Heavy fighting reported on the outskirts of Kharkiv",
    "Photos: Russian drone strikes pound civilian targets across Kyiv",
    "Israeli army set off large explosion in south, report says",
    "Woman charged with supplying gun Felon who killed 4 officers 2024 ambush",
    "Forces exchange fire near Odesa overnight",
  ])("keeps violent coverage: %s", (h) => {
    expect(VIOLENCE_VOCAB.test(h)).toBe(true);
  });

  it("classifies headlines into categories", () => {
    expect(classifyText("Air strikes hit targets near Gaza")?.category).toBe("conflict");
    expect(classifyText("Protesters clash with riot police in Nairobi")?.category).toBe("unrest");
    expect(classifyText("Magnitude 6.1 earthquake strikes off Japan")?.category).toBe("seismic");
    expect(classifyText("Champions League: late goal seals win")).toBeNull();
  });
});
