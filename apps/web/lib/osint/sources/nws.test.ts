import { describe, expect, it } from "vitest";
import { parseNws, parseVtec, polygonCenter } from "./nws";

const NOW = Date.UTC(2026, 8, 28, 6, 20);
const iso = (t: number) => new Date(t).toISOString();

function feature(o: { sent: number; vtec: string; area: string; lat: number }) {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[-96, o.lat], [-95, o.lat], [-95, o.lat + 1], [-96, o.lat + 1], [-96, o.lat]]] },
    properties: {
      id: `urn:${o.sent}`, areaDesc: o.area, sent: iso(o.sent), ends: iso(NOW + 3_600_000),
      status: "Actual", messageType: "Alert", severity: "Extreme", certainty: "Observed", urgency: "Immediate",
      event: "Tornado Warning", parameters: { VTEC: [o.vtec] },
    },
  };
}

describe("NWS alerts", () => {
  it("parses VTEC event identity and action", () => {
    expect(parseVtec("/O.NEW.KTSA.TO.W.0042.260928T0500Z-260928T0700Z/")).toEqual({ key: "KTSA.TO.W.0042", action: "NEW" });
    expect(parseVtec("/O.CAN.KJAN.TO.W.0017.000000T0000Z-260928T0700Z/")?.action).toBe("CAN");
    expect(parseVtec("not a vtec")).toBeNull();
    expect(parseVtec(undefined)).toBeNull();
  });

  it("centres a closed ring without double-counting the closing vertex", () => {
    const c = polygonCenter({ type: "Polygon", coordinates: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] });
    expect(c).toEqual({ lon: 1, lat: 1 });
    expect(polygonCenter({ type: "Polygon", coordinates: [[[0, 0], ["x", 1]]] })).toBeNull();
  });

  it("keeps only the latest message for one hazard event", () => {
    const vtec = "/O.NEW.KTSA.TO.W.0042.260928T0500Z-260928T0700Z/";
    const { signals, ledger } = parseNws(
      {
        type: "FeatureCollection",
        features: [
          feature({ sent: NOW - 30 * 60_000, vtec, area: "Tulsa, OK", lat: 36 }),
          feature({ sent: NOW - 5 * 60_000, vtec: vtec.replace("NEW", "CON"), area: "Tulsa, OK; Rogers, OK", lat: 36.2 }),
        ],
      },
      { now: NOW, horizonMs: 86_400_000 },
    );
    expect(signals).toHaveLength(1);
    expect(signals[0].title).toBe("Tornado Warning — Tulsa, OK; Rogers, OK");
    expect(signals[0].category).toBe("storm");
    expect(signals[0].severity).toBeGreaterThan(0.9);
    expect(ledger).toMatchObject({ received: 2, accepted: 1, filtered: 1 });
  });
});
