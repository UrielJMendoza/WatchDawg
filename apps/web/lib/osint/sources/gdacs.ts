import { z } from "zod";
import type { Category, Signal } from "../types";
import { checkCoords, checkTime, clamp01, cleanText, Ledger, safeUrl } from "../validate";
import type { CollectContext, CollectResult, SourceAdapter } from "./types";

/**
 * GDACS — Global Disaster Alert and Coordination System (UN / EC JRC).
 * Alert levels are modelled from hazard intensity × exposed population.
 * https://www.gdacs.org/
 */
export const GDACS_API = "https://www.gdacs.org/gdacsapi/api/events/geteventlist";

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * GDACS exposes the same event list through several endpoints and has
 * changed which ones accept bare requests; try them in order of richness.
 */
export function gdacsUrls(now: number): string[] {
  const types = "EQ;TC;FL;VO;DR;WF";
  const from = ymd(now - 30 * 86_400_000);
  const to = ymd(now + 86_400_000);
  return [
    `${GDACS_API}/SEARCH?eventlist=${types}&fromDate=${from}&toDate=${to}&alertlevel=Green;Orange;Red`,
    `${GDACS_API}/EVENTS4APP`,
    `${GDACS_API}/MAP?eventtypes=${types}`,
  ];
}

const Feature = z.object({
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).nullable(),
  properties: z.object({
    eventtype: z.string(),
    eventid: z.union([z.number(), z.string()]),
    episodeid: z.union([z.number(), z.string()]).optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    htmldescription: z.string().optional(),
    alertlevel: z.string().optional(),
    alertscore: z.number().nullable().optional(),
    country: z.string().nullable().optional(),
    fromdate: z.string().optional(),
    todate: z.string().optional(),
    datemodified: z.string().optional(),
    iscurrent: z.union([z.string(), z.boolean()]).optional(),
    url: z.object({ report: z.string().optional(), details: z.string().optional() }).partial().optional(),
    affectedcountries: z.array(z.object({ iso2: z.string().optional(), countryname: z.string().optional() })).nullable().optional(),
    severitydata: z
      .object({ severity: z.number().nullable().optional(), severitytext: z.string().optional(), severityunit: z.string().optional() })
      .nullable()
      .optional(),
    source: z.string().optional(),
  }),
});

const Payload = z.object({ features: z.array(z.unknown()) });

const TYPE: Record<string, { category: Category; label: string }> = {
  EQ: { category: "seismic", label: "Earthquake" },
  TS: { category: "seismic", label: "Tsunami" },
  TC: { category: "storm", label: "Tropical cyclone" },
  FL: { category: "flood", label: "Flood" },
  VO: { category: "volcanic", label: "Volcano" },
  DR: { category: "hazard", label: "Drought" },
  WF: { category: "wildfire", label: "Wildfire" },
};

const ALERT: Record<string, number> = { green: 0.3, orange: 0.65, red: 0.92 };

/** GDACS timestamps omit the zone; they are UTC. */
function parseUtc(s: string | undefined): number {
  if (!s) return NaN;
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

export function parseGdacs(json: unknown, ctx: Pick<CollectContext, "now" | "horizonMs">): CollectResult {
  const ledger = new Ledger();
  const payload = Payload.safeParse(json);
  if (!payload.success) throw new Error("GDACS payload failed schema validation");

  const seen = new Set<string>();
  const signals: Signal[] = [];
  for (const raw of payload.data.features) {
    const parsed = Feature.safeParse(raw);
    if (!parsed.success) {
      ledger.seen();
      ledger.reject("schema");
      continue;
    }
    const { geometry, properties: p } = parsed.data;
    // The MAP endpoint repeats each event as a point plus impact polygons;
    // only the point is a location fix.
    if (geometry?.type !== "Point") continue;
    const key = `${p.eventtype}:${p.eventid}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ledger.seen();

    const type = TYPE[p.eventtype];
    if (!type) {
      ledger.reject("category.unknown");
      continue;
    }
    const c = geometry.coordinates;
    const lon = Array.isArray(c) ? c[0] : undefined;
    const lat = Array.isArray(c) ? c[1] : undefined;
    const coordErr = checkCoords(lat, lon);
    if (coordErr || typeof lat !== "number" || typeof lon !== "number") {
      ledger.reject(coordErr ?? "coord.missing");
      continue;
    }
    const time = parseUtc(p.todate ?? p.datemodified ?? p.fromdate);
    const timeErr = checkTime(time, ctx.now, Math.max(ctx.horizonMs, 30 * 86_400_000));
    if (timeErr) {
      if (timeErr === "window.stale") ledger.filter(timeErr);
      else ledger.reject(timeErr);
      continue;
    }
    if (p.iscurrent === "false" || p.iscurrent === false) {
      ledger.filter("status.closed");
      continue;
    }

    const alert = (p.alertlevel ?? "green").toLowerCase();
    const base = ALERT[alert] ?? 0.3;
    const iso2 = p.affectedcountries?.find((a) => a.iso2)?.iso2?.toUpperCase();
    const countryName = cleanText(p.country ?? p.affectedcountries?.[0]?.countryname ?? "", 80);
    const title = cleanText(p.name || p.description || `${type.label}${countryName ? ` in ${countryName}` : ""}`, 160);
    signals.push({
      key: `gdacs:${key}`,
      source: "gdacs",
      category: type.category,
      title: `${alert === "green" ? "" : `${alert.toUpperCase()} alert · `}${title}`,
      summary: cleanText(p.htmldescription ?? p.severitydata?.severitytext ?? "", 280) || undefined,
      url: safeUrl(p.url?.report) ?? safeUrl(`https://www.gdacs.org/report.aspx?eventtype=${p.eventtype}&eventid=${p.eventid}`),
      outlet: "gdacs.org",
      lat,
      lon,
      precision: type.category === "seismic" || type.category === "volcanic" ? "exact" : "region",
      place: countryName || title,
      country: iso2 && iso2.length === 2 ? iso2 : undefined,
      time,
      firstTime: parseUtc(p.fromdate) || undefined,
      severity: clamp01(base + Math.min(0.08, (p.alertscore ?? 0) * 0.02)),
      quality: 0.9,
      reports: 1,
      tags: [`alert-${alert}`, p.eventtype, ...(p.source ? [`src:${p.source}`] : [])],
      metrics: {
        alert: alert.toUpperCase(),
        ...(p.severitydata?.severitytext ? { intensity: cleanText(p.severitydata.severitytext, 80) } : {}),
      },
    });
    ledger.accept();
  }
  return { signals, ledger };
}

export const gdacs: SourceAdapter = {
  meta: {
    id: "gdacs",
    name: "GDACS",
    kind: "UN / EC disaster alerting",
    reliability: "A",
    homepage: "https://www.gdacs.org/",
    description: "Earthquakes, cyclones, floods, volcanoes, droughts and wildfires with Green / Orange / Red impact alerts.",
    ttlMs: 5 * 60_000,
    maxStaleMs: 12 * 3_600_000,
    coverage: "Current alerts · updated every few minutes",
  },
  async collect(ctx) {
    const errors: string[] = [];
    for (const url of gdacsUrls(ctx.now)) {
      const endpoint = url.slice(GDACS_API.length + 1).split("?")[0];
      try {
        const result = parseGdacs(JSON.parse(await ctx.transport.text(url)), ctx);
        return {
          ...result,
          integrity: {
            check: "endpoint",
            passed: 1,
            total: 1,
            detail: `via ${endpoint}${errors.length ? ` (after ${errors.join("; ")})` : ""}`,
          },
        };
      } catch (err) {
        errors.push(`${endpoint}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(errors.join("; "));
  },
};
