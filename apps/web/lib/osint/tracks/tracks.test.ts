import { describe, expect, it } from "vitest";
import { Ledger } from "../validate";
import { parseTle, tleChecksum, tleEpoch } from "./satellites";
import { parseAircraft } from "./aircraft";

// The canonical ISS example element set.
const NAME = "ISS (ZARYA)";
const L1 = "1 25544U 98067A   08264.51782528 -.00002182  00000-0 -11606-4 0  2927";
const L2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391563537";
const EPOCH = tleEpoch(L1);

describe("TLE validation", () => {
  it("computes the mod-10 checksum and epoch", () => {
    expect(tleChecksum(L1)).toBe(7);
    expect(tleChecksum(L2)).toBe(7);
    expect(new Date(EPOCH).toISOString().slice(0, 10)).toBe("2008-09-20");
  });

  it("accepts a valid set and rejects a corrupted one", () => {
    const ledger = new Ledger();
    const bad = `${L2.slice(0, 20)}9${L2.slice(21)}`; // flip a digit, keep the old checksum
    const sats = parseTle([NAME, L1, L2, "BROKEN", L1, bad].join("\n"), "stations", EPOCH + 86_400_000, ledger);
    expect(sats).toHaveLength(1);
    expect(sats[0]).toMatchObject({ id: "25544", name: "ISS (ZARYA)", inclination: 51.6416 });
    expect(ledger.reasons["tle.checksum"]).toBe(1);
  });

  it("filters stale element sets", () => {
    const ledger = new Ledger();
    expect(parseTle([NAME, L1, L2].join("\n"), "stations", EPOCH + 60 * 86_400_000, ledger)).toHaveLength(0);
    expect(ledger.reasons["tle.stale"]).toBe(1);
  });
});

describe("ADS-B parsing", () => {
  it("validates positions and flags emergencies", () => {
    const ledger = new Ledger();
    const out = parseAircraft(
      {
        ac: [
          { hex: "ae1234", flight: "RCH123  ", t: "C17", lat: 50.1, lon: 8.6, alt_baro: 31000, gs: 440, track: 270, dbFlags: 1, seen_pos: 2 },
          { hex: "4ca5b6", flight: "EIN12", lat: 53.4, lon: -6.2, alt_baro: 12000, squawk: "7700", seen_pos: 1 },
          { hex: "abc123", lat: 10, lon: 10, seen_pos: 400 },
          { hex: "abc124" },
          { hex: "nothex", lat: 1, lon: 1 },
          { hex: "abc125", lat: 1, lon: 1, gs: 5000 },
        ],
      },
      ledger,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "ae1234", callsign: "RCH123", military: true, heading: 270 });
    expect(out[1]).toMatchObject({ emergency: "general", squawk: "7700", military: false });
    expect(ledger.reasons).toMatchObject({ "position.stale": 1, "position.missing": 1, schema: 1, "value.speed": 1 });
  });
});
