import { z } from "zod";
import type { Category, Signal } from "../types";
import { checkCoords, checkTime, clamp01, cleanText, Ledger, safeUrl } from "../validate";
import type { CollectContext, CollectResult, SourceAdapter } from "./types";

/**
 * NASA Earth Observatory Natural Event Tracker (EONET v3): open natural
 * events curated from satellite and agency sources.
 * https://eonet.gsfc.nasa.gov/docs/v3
 */
export const EONET_URL = "https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=30";

const Geometry = z.object({
  magnitudeValue: z.number().nullable().optional(),
  magnitudeUnit: z.string().nullable().optional(),
  date: z.string(),
  type: z.enum(["Point", "Polygon"]),
  coordinates: z.unknown(),
});

const Event = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  link: z.string().optional(),
  closed: z.string().nullable().optional(),
  categories: z.array(z.object({ id: z.string(), title: z.string().optional() })).min(1),
  sources: z.array(z.object({ id: z.string(), url: z.string().optional() })).default([]),
  geometry: z.array(Geometry).min(1),
});

const Payload = z.object({ events: z.array(z.unknown()) });

const CATEGORY: Record<string, Category> = {
  wildfires: "wildfire",
  severeStorms: "storm",
  volcanoes: "volcanic",
  floods: "flood",
  earthquakes: "seismic",
  landslides: "flood",
  drought: "hazard",
  dustHaze: "hazard",
  tempExtremes: "hazard",
  snow: "hazard",
  seaLakeIce: "hazard",
  waterColor: "hazard",
  manmade: "hazard",
};

/** Point, or the vertex-average of a polygon's outer ring. */
function position(g: z.infer<typeof Geometry>): [number, number] | null {
  const c = g.coordinates;
  if (g.type === "Point" && Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number") {
    return [c[0], c[1]];
  }
  if (g.type === "Polygon" && Array.isArray(c) && Array.isArray(c[0])) {
    const ring = c[0] as unknown[];
    let sx = 0, sy = 0, n = 0;
    for (const pt of ring) {
      if (Array.isArray(pt) && typeof pt[0] === "number" && typeof pt[1] === "number") {
        sx += pt[0];
        sy += pt[1];
        n++;
      }
    }
    return n ? [sx / n, sy / n] : null;
  }
  return null;
}

function severityFor(cat: Category, magnitude: number | null | undefined, unit: string | null | undefined, sourceId: string): number {
  if (cat === "storm" && magnitude != null && /kts|knots/i.test(unit ?? "")) {
    // 34 kt tropical storm → ~0.35, 137 kt category 5 → 1.
    return clamp01(0.35 + ((magnitude - 34) / 103) * 0.65);
  }
  if (cat === "wildfire" && magnitude != null && /acres/i.test(unit ?? "")) {
    return clamp01(0.25 + (Math.log10(Math.max(1, magnitude)) / 6) * 0.6);
  }
  if (cat === "volcanic") return 0.55;
  if (cat === "flood") return 0.5;
  if (cat === "storm") return 0.45;
  if (cat === "wildfire") return 0.35;
  if (sourceId === "seaLakeIce" || sourceId === "waterColor") return 0.08;
  return 0.3;
}

export function parseEonet(json: unknown, ctx: Pick<CollectContext, "now" | "horizonMs">): CollectResult {
  const ledger = new Ledger();
  const payload = Payload.safeParse(json);
  if (!payload.success) throw new Error("EONET payload failed schema validation");

  const signals: Signal[] = [];
  for (const raw of payload.data.events) {
    ledger.seen();
    const parsed = Event.safeParse(raw);
    if (!parsed.success) {
      ledger.reject("schema");
      continue;
    }
    const e = parsed.data;
    if (e.closed) {
      ledger.filter("status.closed");
      continue;
    }
    const catId = e.categories[0].id;
    const category = CATEGORY[catId];
    if (!category) {
      ledger.reject("category.unknown");
      continue;
    }

    // Geometry is a track; the newest valid fix is the current position.
    const fixes = e.geometry
      .map((g) => ({ g, t: Date.parse(g.date), pos: position(g) }))
      .filter((f) => f.pos && Number.isFinite(f.t))
      .sort((a, b) => b.t - a.t);
    const latest = fixes[0];
    if (!latest || !latest.pos) {
      ledger.reject("geometry.invalid");
      continue;
    }
    const [lon, lat] = latest.pos;
    const coordErr = checkCoords(lat, lon);
    if (coordErr) {
      ledger.reject(coordErr);
      continue;
    }
    // Long-running events (volcanoes, drought) keep an old last fix, so the
    // horizon here is generous; the window filter happens downstream.
    const timeErr = checkTime(latest.t, ctx.now, Math.max(ctx.horizonMs, 30 * 86_400_000));
    if (timeErr) {
      if (timeErr === "window.stale") ledger.filter(timeErr);
      else ledger.reject(timeErr);
      continue;
    }

    const sourceIds = e.sources.map((s) => s.id);
    const title = cleanText(e.title, 160);
    signals.push({
      key: `eonet:${e.id}`,
      source: "eonet",
      category,
      title,
      summary: cleanText(e.description ?? "", 280) || undefined,
      url: safeUrl(e.sources.find((s) => s.url)?.url) ?? safeUrl(e.link),
      outlet: "eonet.gsfc.nasa.gov",
      lat,
      lon,
      precision: latest.g.type === "Point" ? "exact" : "region",
      // "Lookout Fire, California" → the region is the useful place name.
      place: title.includes(", ") ? title.slice(title.lastIndexOf(", ") + 2) : title,
      time: latest.t,
      firstTime: fixes[fixes.length - 1].t,
      severity: severityFor(category, latest.g.magnitudeValue, latest.g.magnitudeUnit, catId),
      quality: clamp01(0.7 + 0.1 * Math.min(3, sourceIds.length - 1)),
      reports: Math.max(1, sourceIds.length),
      tags: [catId, ...sourceIds.map((s) => `src:${s}`)],
      metrics: {
        fixes: fixes.length,
        ...(latest.g.magnitudeValue != null
          ? { [`magnitude${latest.g.magnitudeUnit ? ` (${latest.g.magnitudeUnit})` : ""}`]: latest.g.magnitudeValue }
          : {}),
      },
    });
    ledger.accept();
  }
  return { signals, ledger };
}

export const eonet: SourceAdapter = {
  meta: {
    id: "eonet",
    name: "NASA EONET",
    kind: "Satellite & agency curation",
    reliability: "A",
    homepage: "https://eonet.gsfc.nasa.gov/",
    description: "Open natural events — wildfires, storms, volcanoes, floods, ice — curated by NASA from satellite and agency feeds.",
    ttlMs: 10 * 60_000,
    maxStaleMs: 24 * 3_600_000,
    coverage: "Open events · updated as agencies report",
  },
  async collect(ctx) {
    const text = await ctx.transport.text(EONET_URL);
    return parseEonet(JSON.parse(text), ctx);
  },
};
