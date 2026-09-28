import { z } from "zod";
import type { Category, Signal } from "../types";
import { checkCoords, checkTime, clamp01, cleanText, Ledger, safeUrl } from "../validate";
import type { CollectContext, CollectResult, SourceAdapter } from "./types";

/**
 * USGS real-time earthquake feed (GeoJSON summary, M2.5+ past 7 days).
 * https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php
 */
export const USGS_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson";

const Feature = z.object({
  id: z.string().min(1),
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.array(z.number().nullable()).min(2),
  }),
  properties: z.object({
    mag: z.number().nullable(),
    place: z.string().nullable().optional(),
    time: z.number(),
    updated: z.number().nullable().optional(),
    url: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    alert: z.enum(["green", "yellow", "orange", "red"]).nullable().optional(),
    status: z.string().nullable().optional(),
    tsunami: z.number().nullable().optional(),
    sig: z.number().nullable().optional(),
    felt: z.number().nullable().optional(),
    type: z.string().nullable().optional(),
    magType: z.string().nullable().optional(),
    net: z.string().nullable().optional(),
    nst: z.number().nullable().optional(),
  }),
});

const Payload = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()),
});

const ALERT_BOOST = { green: 0, yellow: 0.15, orange: 0.3, red: 0.45 } as const;

export function parseUsgs(json: unknown, ctx: Pick<CollectContext, "now" | "horizonMs">): CollectResult {
  const ledger = new Ledger();
  const payload = Payload.safeParse(json);
  if (!payload.success) throw new Error("USGS payload failed schema validation");

  const signals: Signal[] = [];
  for (const raw of payload.data.features) {
    ledger.seen();
    const parsed = Feature.safeParse(raw);
    if (!parsed.success) {
      ledger.reject("schema");
      continue;
    }
    const f = parsed.data;
    const [lon, lat, depth] = f.geometry.coordinates;
    const p = f.properties;
    const coordErr = checkCoords(lat, lon);
    if (coordErr || lat == null || lon == null) {
      ledger.reject(coordErr ?? "coord.missing");
      continue;
    }
    const timeErr = checkTime(p.time, ctx.now, ctx.horizonMs);
    if (timeErr) {
      if (timeErr === "window.stale") ledger.filter(timeErr);
      else ledger.reject(timeErr);
      continue;
    }
    if (p.mag == null || p.mag < -1 || p.mag > 10) {
      ledger.reject("value.magnitude");
      continue;
    }
    // Only seismic events — quarry blasts and explosions are not quakes.
    if (p.type && p.type !== "earthquake") {
      ledger.filter("type.not_earthquake");
      continue;
    }

    const alertBoost = p.alert ? ALERT_BOOST[p.alert] : 0;
    const severity = clamp01((p.mag - 2.5) / 5.5 + alertBoost + (p.tsunami ? 0.15 : 0));
    const reviewed = p.status === "reviewed";
    const place = cleanText(p.place ?? "", 120) || "Unknown location";
    const category: Category = "seismic";
    const tags = [
      `M${p.mag.toFixed(1)}`,
      reviewed ? "reviewed" : "automatic",
      ...(p.tsunami ? ["tsunami-flag"] : []),
      ...(p.alert ? [`pager-${p.alert}`] : []),
    ];
    signals.push({
      key: `usgs:${f.id}`,
      source: "usgs",
      category,
      title: `M${p.mag.toFixed(1)} earthquake — ${place}`,
      headline: cleanText(p.title ?? "", 160) || undefined,
      url: safeUrl(p.url),
      outlet: "earthquake.usgs.gov",
      lat,
      lon,
      precision: "exact",
      place,
      time: p.time,
      severity,
      // Analyst-reviewed solutions are confirmed; automatic ones are strong
      // but can be revised or deleted.
      quality: reviewed ? 1 : 0.8,
      reports: 1,
      tags,
      metrics: {
        magnitude: Number(p.mag.toFixed(2)),
        ...(typeof depth === "number" ? { depthKm: Number(depth.toFixed(1)) } : {}),
        ...(p.felt ? { feltReports: p.felt } : {}),
        ...(p.sig != null ? { significance: p.sig } : {}),
        ...(p.nst != null ? { stations: p.nst } : {}),
      },
    });
    ledger.accept();
  }
  return { signals, ledger };
}

export const usgs: SourceAdapter = {
  meta: {
    id: "usgs",
    name: "USGS Earthquake Hazards",
    kind: "Seismic sensor network",
    reliability: "A",
    homepage: "https://earthquake.usgs.gov/earthquakes/map/",
    description: "Global M2.5+ earthquakes from the USGS real-time feed, with PAGER alert levels and review status.",
    ttlMs: 60_000,
    maxStaleMs: 6 * 3_600_000,
    coverage: "Past 7 days · published within minutes of a quake",
  },
  async collect(ctx) {
    const text = await ctx.transport.text(USGS_URL);
    return parseUsgs(JSON.parse(text), ctx);
  },
};
