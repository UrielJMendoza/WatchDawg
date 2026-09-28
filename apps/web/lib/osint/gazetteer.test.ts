import { describe, expect, it } from "vitest";
import data from "./data/gazetteer.json";
import { countryByName, geocodeText, type GazetteerData } from "./gazetteer";

const gaz = data as unknown as GazetteerData;

describe("headline geocoder", () => {
  it("prefers a named city", () => {
    const m = geocodeText(gaz, "Drone strike hits apartment block in Kharkiv, officials say");
    expect(m).toMatchObject({ precision: "city", country: "UA" });
  });
  it("places events in a named territory, not the actor's country", () => {
    const m = geocodeText(gaz, "Israeli strikes on Gaza kill 23");
    expect(m?.country).toBe("PS");
  });
  it("falls back to country level", () => {
    expect(geocodeText(gaz, "Floods displace thousands in Bangladesh")).toMatchObject({ precision: "country", country: "BD" });
  });
  it("ignores lower-case words and unknown text", () => {
    expect(geocodeText(gaz, "markets rally as inflation cools")).toBeNull();
  });
  it("looks up countries by name and alias", () => {
    expect(countryByName(gaz, "Democratic Republic of Congo")?.iso2 ?? countryByName(gaz, "DR Congo")?.iso2).toBe("CD");
    expect(countryByName(gaz, "Ukraine")?.iso2).toBe("UA");
  });
});
