import { z } from "zod";
import type { Signal } from "../types";
import { checkCoords, checkTime, cleanText, Ledger, titleCase } from "../validate";
import { socrataLocal, zonedToUtc } from "../time";
import type { CollectContext, SourceAdapter } from "./types";

/**
 * Police incident reports from city open-data portals (Socrata SODA API).
 * These are the most granular real crime records published anywhere, but
 * they are *reports*, published with a lag of one to eight days, and their
 * locations are generalised to the block. Sex offences and domestic
 * incidents are excluded to protect victims.
 *
 * An app token (SOCRATA_APP_TOKEN) is optional; it raises rate limits.
 */

interface City {
  id: string;
  name: string;
  country: string;
  tz: string;
  url: (sinceLocal: string) => string;
  parse: (raw: unknown) => Row | { reject: string } | { filter: string };
}

interface Row {
  id: string;
  local: string;
  type: string;
  detail: string;
  where: string;
  lat: number;
  lon: number;
  arrest?: boolean;
}

const LIMIT = 4000;
// Portals publish with a lag of up to ~8 days; look back far enough to always
// have the most recent published week.
const LOOKBACK_MS = 16 * 86_400_000;

/** Offence → severity. Anything unmatched is filtered as a minor offence. */
const SEVERITY: Array<[RegExp, number, string]> = [
  [/homicide|murder|manslaughter/i, 0.9, "Homicide"],
  [/kidnap|human trafficking|abduct/i, 0.75, "Kidnapping / trafficking"],
  [/shots? fired|shooting/i, 0.65, "Shots fired"],
  [/robbery/i, 0.55, "Robbery"],
  [/arson/i, 0.45, "Arson"],
  [/aggravated|assault/i, 0.45, "Assault"],
  // Mostly unlawful possession in Chicago's data, not a shooting.
  [/weapon|firearm/i, 0.4, "Weapons offence"],
  [/burglary/i, 0.3, "Burglary"],
  [/motor vehicle theft|vehicle theft|stolen vehicle/i, 0.25, "Vehicle theft"],
];

const PRIVATE = /sex|rape|sexual|prostitution|domestic|family|child|juvenile|offences against the family/i;

const num = z.union([z.number(), z.string()]).transform((v) => Number(v));

const SfRow = z.object({
  incident_id: z.union([z.string(), z.number()]).transform(String),
  incident_datetime: z.string(),
  incident_category: z.string().optional(),
  incident_subcategory: z.string().optional(),
  incident_description: z.string().optional(),
  intersection: z.string().optional(),
  analysis_neighborhood: z.string().optional(),
  latitude: num.optional(),
  longitude: num.optional(),
  resolution: z.string().optional(),
});

const ChiRow = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  date: z.string(),
  primary_type: z.string(),
  description: z.string().optional(),
  block: z.string().optional(),
  location_description: z.string().optional(),
  arrest: z.union([z.boolean(), z.string()]).optional(),
  domestic: z.union([z.boolean(), z.string()]).optional(),
  latitude: num.optional(),
  longitude: num.optional(),
});

const truthy = (v: unknown) => v === true || v === "true";

export const CITIES: City[] = [
  {
    id: "sf",
    name: "San Francisco",
    country: "US",
    tz: "America/Los_Angeles",
    url: (since) =>
      "https://data.sfgov.org/resource/wg3w-h783.json?" +
      new URLSearchParams({
        $select: "incident_id,incident_datetime,incident_category,incident_subcategory,incident_description,intersection,analysis_neighborhood,latitude,longitude,resolution",
        $where: `incident_datetime > '${since}' AND latitude IS NOT NULL`,
        $order: "incident_datetime DESC",
        $limit: String(LIMIT),
      }),
    parse(raw) {
      const r = SfRow.safeParse(raw);
      if (!r.success) return { reject: "schema" };
      const d = r.data;
      const type = `${d.incident_category ?? ""} ${d.incident_subcategory ?? ""}`;
      if (PRIVATE.test(`${type} ${d.incident_description ?? ""}`)) return { filter: "relevance.privacy" };
      if (d.latitude === undefined || d.longitude === undefined) return { reject: "coord.missing" };
      return {
        id: d.incident_id,
        local: d.incident_datetime,
        type,
        detail: d.incident_description ?? "",
        where: d.analysis_neighborhood ?? d.intersection ?? "",
        lat: d.latitude,
        lon: d.longitude,
        arrest: d.resolution ? /arrest/i.test(d.resolution) : undefined,
      };
    },
  },
  {
    id: "chi",
    name: "Chicago",
    country: "US",
    tz: "America/Chicago",
    url: (since) =>
      "https://data.cityofchicago.org/resource/ijzp-q8t2.json?" +
      new URLSearchParams({
        $select: "id,date,primary_type,description,block,location_description,arrest,domestic,latitude,longitude",
        $where: `date > '${since}' AND latitude IS NOT NULL`,
        $order: "date DESC",
        $limit: String(LIMIT),
      }),
    parse(raw) {
      const r = ChiRow.safeParse(raw);
      if (!r.success) return { reject: "schema" };
      const d = r.data;
      if (truthy(d.domestic) || PRIVATE.test(`${d.primary_type} ${d.description ?? ""}`)) return { filter: "relevance.privacy" };
      // Simple battery/assault are high-volume and low-severity; keep aggravated.
      if (/^(battery|assault)$/i.test(d.primary_type) && !/aggravated/i.test(d.description ?? "")) {
        return { filter: "relevance.minor_offense" };
      }
      if (d.latitude === undefined || d.longitude === undefined) return { reject: "coord.missing" };
      return {
        id: d.id,
        local: d.date,
        type: d.primary_type,
        detail: d.description ?? "",
        where: d.block ? titleCase(d.block.replace(/^0+/, "")) : "",
        lat: d.latitude,
        lon: d.longitude,
        arrest: truthy(d.arrest),
      };
    },
  },
];

export function parseCity(city: City, json: unknown, ctx: Pick<CollectContext, "now">, ledger: Ledger): Signal[] {
  if (!Array.isArray(json)) throw new Error(`${city.name} crime payload is not an array`);
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const raw of json) {
    ledger.seen();
    const row = city.parse(raw);
    if ("reject" in row) {
      ledger.reject(row.reject);
      continue;
    }
    if ("filter" in row) {
      ledger.filter(row.filter);
      continue;
    }
    // SF emits one row per offence code; one incident is one signal.
    if (seen.has(row.id)) {
      ledger.filter("dedupe.incident");
      continue;
    }
    seen.add(row.id);
    const coordErr = checkCoords(row.lat, row.lon);
    if (coordErr) {
      ledger.reject(coordErr);
      continue;
    }
    const time = zonedToUtc(row.local, city.tz);
    const timeErr = checkTime(time, ctx.now, LOOKBACK_MS);
    if (timeErr) {
      if (timeErr === "window.stale") ledger.filter(timeErr);
      else ledger.reject(timeErr);
      continue;
    }
    const sev = SEVERITY.find(([re]) => re.test(`${row.type} ${row.detail}`));
    if (!sev) {
      ledger.filter("relevance.minor_offense");
      continue;
    }
    const [, severity, label] = sev;
    const where = cleanText(row.where, 80);
    const detail = cleanText(titleCase(row.detail), 120);
    out.push({
      key: `crime:${city.id}:${row.id}`,
      source: "crime",
      category: "crime",
      title: `${label}${where ? ` — ${where}` : ""}, ${city.name}`,
      summary: detail ? `${detail}${row.arrest ? " · arrest made" : ""}` : undefined,
      outlet: city.id === "sf" ? "data.sfgov.org" : "data.cityofchicago.org",
      url: city.id === "sf" ? "https://data.sfgov.org/d/wg3w-h783" : "https://data.cityofchicago.org/d/ijzp-q8t2",
      lat: row.lat,
      lon: row.lon,
      precision: "exact",
      place: where ? `${where}, ${city.name}` : city.name,
      country: city.country,
      time,
      severity,
      quality: 0.9,
      reports: 1,
      tags: [`city:${city.name}`, label.toLowerCase(), ...(row.arrest ? ["arrest"] : [])],
      metrics: { offence: cleanText(titleCase(row.type), 60), ...(row.arrest !== undefined ? { arrest: row.arrest ? "yes" : "no" } : {}) },
    });
    ledger.accept();
  }
  return out;
}

export const crime: SourceAdapter = {
  meta: {
    id: "crime",
    name: "City police open data",
    kind: "Official police incident reports",
    reliability: "A",
    homepage: "https://data.sfgov.org/d/wg3w-h783",
    description: "Serious crime reports from San Francisco and Chicago police open-data portals, block-level. Sex offences and domestic incidents excluded.",
    ttlMs: 15 * 60_000,
    maxStaleMs: 24 * 3_600_000,
    coverage: "Past 16 days · portals publish with a 1–8 day lag",
  },
  async collect(ctx) {
    const ledger = new Ledger();
    const token = process.env.SOCRATA_APP_TOKEN;
    const results = await Promise.allSettled(
      CITIES.map(async (city) => {
        const since = socrataLocal(ctx.now - LOOKBACK_MS, city.tz);
        const text = await ctx.transport.text(city.url(since), token ? { headers: { "X-App-Token": token } } : undefined);
        const json = JSON.parse(text) as unknown;
        return { rows: Array.isArray(json) ? json.length : 0, signals: parseCity(city, json, ctx, ledger) };
      }),
    );
    const signals = results.flatMap((r) => (r.status === "fulfilled" ? r.value.signals : []));
    // A portal that answers with zero rows is as unusable as one that fails.
    const ok = results.filter((r) => r.status === "fulfilled" && r.value.rows > 0).length;
    const detail = CITIES.map((c, i) => {
      const r = results[i];
      return r.status === "fulfilled" ? `${c.name}: ${r.value.rows} rows, ${r.value.signals.length} kept` : `${c.name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`;
    }).join(" · ");
    if (!ok) throw new Error(detail);
    return { signals, ledger, integrity: { check: "portals", passed: ok, total: CITIES.length, detail } };
  },
};
