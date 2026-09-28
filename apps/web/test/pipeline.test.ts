import { beforeEach, describe, expect, it } from "vitest";
import { createEngine } from "@/lib/osint/engine";
import { _resetGdeltCache } from "@/lib/osint/sources/gdelt";
import type { Transport } from "@/lib/osint/sources/types";
import { fixtureTransport } from "./fixtures/upstreams";

const NOW = Date.UTC(2026, 8, 28, 6, 20);

describe("pipeline on fixture upstreams", () => {
  beforeEach(() => _resetGdeltCache());

  it("validates every source and reports why records were dropped", async () => {
    const snap = await createEngine(fixtureTransport(NOW), { clock: () => NOW }).getSnapshot("24h");
    const by = Object.fromEntries(snap.sources.map((s) => [s.id, s]));

    expect(by.usgs.status).toBe("ok");
    expect(by.usgs.reasons["coord.range"]).toBe(1);
    expect(by.usgs.reasons["value.magnitude"]).toBe(1);
    expect(by.usgs.reasons["type.not_earthquake"]).toBe(1);

    expect(by.eonet.reasons.schema).toBe(1);

    expect(by.gdelt.integrity).toMatchObject({ check: "md5", passed: 1, total: 1 });
    expect(by.gdelt.reasons["schema.columns"]).toBeGreaterThan(0);
    expect(by.gdelt.reasons["coord.null_island"]).toBeGreaterThan(0);
    expect(by.gdelt.reasons["relevance.cameo_root"]).toBeGreaterThan(0);

    expect(by.wire.reasons["url.invalid"]).toBeGreaterThan(0);
    expect(by.wire.reasons["time.future"]).toBeGreaterThan(0);
    expect(by.wire.reasons["relevance.unclassified"]).toBeGreaterThan(0);

    expect(by.crime.reasons["relevance.privacy"]).toBeGreaterThan(0);
    expect(by.crime.reasons["dedupe.incident"]).toBeGreaterThan(0);

    // No credentials in the test environment.
    expect(by.acled.status).toBe("disabled");
  });

  it("fuses independent sources into graded incidents", async () => {
    const snap = await createEngine(fixtureTransport(NOW), { clock: () => NOW }).getSnapshot("24h");
    const quake = snap.incidents.find((i) => i.category === "seismic" && i.severity >= 0.95);
    expect(quake).toBeDefined();
    expect(quake!.sources).toEqual(expect.arrayContaining(["usgs", "gdacs", "wire"]));
    expect(quake!.reliability).toBe("A");
    expect(quake!.credibility).toBe(1);

    const typhoon = snap.incidents.find((i) => /orion/i.test(i.title));
    expect(typhoon?.sources.length).toBeGreaterThanOrEqual(2);

    const kharkiv = snap.incidents.find((i) => i.place.startsWith("Kharkiv") && i.category === "conflict");
    expect(kharkiv?.sources).toEqual(expect.arrayContaining(["gdelt", "wire"]));

    // Two distinct quakes from one source never collapse into one incident.
    const usgsOnly = snap.incidents.filter((i) => i.sources.length === 1 && i.sources[0] === "usgs");
    expect(usgsOnly.length).toBeGreaterThan(5);

    expect(snap.hotspots.length).toBeGreaterThan(0);
    expect(new Set(snap.incidents.map((i) => i.id)).size).toBe(snap.incidents.length);
  });

  it("builds a directed, evidence-gated country interaction graph", async () => {
    const snap = await createEngine(fixtureTransport(NOW), { clock: () => NOW }).getSnapshot("24h");
    const ruUa = snap.relations.find((r) => r.id === "RU>UA");
    expect(ruUa).toBeDefined();
    expect(ruUa!.stance).toBe("hostile");
    expect(ruUa!.outlets).toBeGreaterThanOrEqual(2);
    // Same-country actor pairs (e.g. Sudanese forces vs Sudanese civilians) are not links.
    expect(snap.relations.every((r) => r.from !== r.to)).toBe(true);
    // Sorted by coverage.
    for (let i = 1; i < snap.relations.length; i++) expect(snap.relations[i - 1].articles).toBeGreaterThanOrEqual(snap.relations[i].articles);
  });

  it("windows are views: shorter windows hold fewer incidents", async () => {
    const engine = createEngine(fixtureTransport(NOW), { clock: () => NOW });
    const [h1, d1, d7] = await Promise.all([engine.getSnapshot("1h"), engine.getSnapshot("24h"), engine.getSnapshot("7d")]);
    expect(h1.incidents.length).toBeLessThan(d1.incidents.length);
    expect(d1.incidents.length).toBeLessThan(d7.incidents.length);
    for (const i of h1.incidents.filter((x) => x.sources.includes("gdelt"))) {
      expect(i.lastSeen).toBeGreaterThanOrEqual(NOW - 3_600_000);
    }
  });

  it("refuses a GDELT export whose MD5 does not match the manifest", async () => {
    const base = fixtureTransport(NOW);
    const tampered: Transport = {
      text: base.text,
      async bytes(url) {
        const b = new Uint8Array(await base.bytes(url));
        b[b.length - 5] ^= 0xff;
        return b;
      },
    };
    const snap = await createEngine(tampered, { clock: () => NOW }).getSnapshot("24h");
    const g = snap.sources.find((s) => s.id === "gdelt")!;
    expect(g.integrity?.passed).toBe(0);
    expect(g.reasons["integrity.md5"]).toBe(1);
    expect(g.status).toBe("degraded");
  });

  it("falls back across GDACS endpoints and says which one answered", async () => {
    const base = fixtureTransport(NOW);
    const t: Transport = {
      async text(url, init) {
        if (url.includes("/geteventlist/SEARCH")) throw new Error("HTTP 400 from www.gdacs.org");
        if (url.includes("/geteventlist/EVENTS4APP")) return base.text(url.replace("EVENTS4APP", "SEARCH?x=1"), init);
        return base.text(url, init);
      },
      bytes: base.bytes,
    };
    const snap = await createEngine(t, { clock: () => NOW }).getSnapshot("24h");
    const g = snap.sources.find((s) => s.id === "gdacs")!;
    expect(g.status).toBe("ok");
    expect(g.statusNote).toMatch(/via EVENTS4APP \(after SEARCH: HTTP 400/);
  });

  it("names crime portals that answer with nothing", async () => {
    const base = fixtureTransport(NOW);
    const t: Transport = {
      async text(url, init) {
        if (url.includes("cityofchicago")) return "[]";
        return base.text(url, init);
      },
      bytes: base.bytes,
    };
    const snap = await createEngine(t, { clock: () => NOW }).getSnapshot("24h");
    const c = snap.sources.find((s) => s.id === "crime")!;
    expect(c.integrity).toMatchObject({ passed: 1, total: 2 });
    expect(c.statusNote).toMatch(/Chicago: 0 rows/);
    expect(c.status).toBe("degraded");
  });

  it("serves the last good pull while a slow refresh is still running", async () => {
    const base = fixtureTransport(NOW);
    let t = NOW;
    let hold = false;
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const slow: Transport = {
      async text(url, init) {
        if (hold && url.includes("earthquake.usgs.gov")) await gate;
        return base.text(url, init);
      },
      bytes: base.bytes,
    };
    const engine = createEngine(slow, { clock: () => t });
    const quakes = (s: Awaited<ReturnType<typeof engine.getSnapshot>>) => s.incidents.filter((i) => i.sources.includes("usgs")).length;
    const first = await engine.getSnapshot("24h");
    hold = true;
    t = NOW + 10 * 60_000; // past every source TTL and the snapshot cache
    const second = await engine.getSnapshot("24h");
    expect(second.sources.find((s) => s.id === "usgs")!.status).toBe("ok");
    expect(quakes(second)).toBe(quakes(first));
    release();
  });

  it("marks a source offline when its upstream fails and nothing is cached", async () => {
    const base = fixtureTransport(NOW);
    const broken: Transport = {
      async text(url, init) {
        if (url.includes("earthquake.usgs.gov")) throw new Error("HTTP 503");
        return base.text(url, init);
      },
      bytes: base.bytes,
    };
    const snap = await createEngine(broken, { clock: () => NOW }).getSnapshot("24h");
    const u = snap.sources.find((s) => s.id === "usgs")!;
    expect(u.status).toBe("offline");
    expect(u.statusNote).toMatch(/503/);
    expect(snap.incidents.some((i) => i.sources.includes("usgs"))).toBe(false);
  });
});
