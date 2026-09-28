import { z } from "zod";
import type { Category, GeoPrecision, Signal } from "../types";
import { countryByName } from "../gazetteer";
import { checkCoords, checkTime, clamp01, cleanText, Ledger } from "../validate";
import type { CollectContext, CollectResult, SourceAdapter, Transport } from "./types";

/**
 * ACLED — Armed Conflict Location & Event Data. Human-coded, source-verified
 * records of battles, explosions, violence against civilians, riots and
 * protests worldwide. The gold standard for war data; updated weekly.
 *
 * Requires a (free for research) account: set ACLED_USERNAME and
 * ACLED_PASSWORD (OAuth), or ACLED_ACCESS_TOKEN. Legacy ACLED_KEY +
 * ACLED_EMAIL keys are also accepted.
 * https://acleddata.com/api-documentation/getting-started
 */

const API = "https://acleddata.com/api/acled/read";
const TOKEN_URL = "https://acleddata.com/oauth/token";
const LEGACY_API = "https://api.acleddata.com/acled/read";
const LOOKBACK_DAYS = 30;
const FIELDS = [
  "event_id_cnty", "event_date", "disorder_type", "event_type", "sub_event_type", "actor1", "actor2",
  "country", "admin1", "admin2", "location", "latitude", "longitude", "geo_precision", "source",
  "notes", "fatalities", "timestamp",
].join("|");

const num = z.union([z.number(), z.string()]).transform((v) => Number(v));

const Row = z.object({
  event_id_cnty: z.string().min(1),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  event_type: z.string(),
  sub_event_type: z.string().optional().default(""),
  actor1: z.string().optional().default(""),
  actor2: z.string().optional().default(""),
  country: z.string(),
  admin1: z.string().optional().default(""),
  location: z.string().optional().default(""),
  latitude: num,
  longitude: num,
  geo_precision: num.optional(),
  source: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  fatalities: num.optional(),
});

const Payload = z.object({ data: z.array(z.unknown()) });

const TYPES: Record<string, { category: Category; severity: number }> = {
  battles: { category: "conflict", severity: 0.8 },
  "explosions/remote violence": { category: "conflict", severity: 0.85 },
  "violence against civilians": { category: "security", severity: 0.8 },
  riots: { category: "unrest", severity: 0.55 },
  protests: { category: "unrest", severity: 0.32 },
  "strategic developments": { category: "tension", severity: 0.3 },
};

const PRECISION: Record<number, GeoPrecision> = { 1: "city", 2: "region", 3: "region" };

export function parseAcled(json: unknown, ctx: Pick<CollectContext, "now" | "gazetteer">): CollectResult {
  const payload = Payload.safeParse(json);
  if (!payload.success) throw new Error("ACLED payload failed schema validation");
  const ledger = new Ledger();
  const signals: Signal[] = [];
  for (const raw of payload.data.data) {
    ledger.seen();
    const r = Row.safeParse(raw);
    if (!r.success) {
      ledger.reject("schema");
      continue;
    }
    const e = r.data;
    const type = TYPES[e.event_type.toLowerCase()];
    if (!type) {
      ledger.reject("category.unknown");
      continue;
    }
    const coordErr = checkCoords(e.latitude, e.longitude);
    if (coordErr) {
      ledger.reject(coordErr);
      continue;
    }
    // ACLED dates are days; place them at local-agnostic midday UTC.
    const time = Date.parse(`${e.event_date.slice(0, 10)}T12:00:00Z`);
    const timeErr = checkTime(Math.min(time, ctx.now), ctx.now, (LOOKBACK_DAYS + 1) * 86_400_000);
    if (timeErr) {
      if (timeErr === "window.stale") ledger.filter(timeErr);
      else ledger.reject(timeErr);
      continue;
    }
    const fatalities = Number.isFinite(e.fatalities) ? Math.max(0, e.fatalities ?? 0) : 0;
    const sources = e.source.split(/;\s*/).filter(Boolean);
    const place = [e.location, e.admin1, e.country].filter(Boolean).join(", ");
    const iso2 = countryByName(ctx.gazetteer, e.country)?.iso2;
    const actors = [e.actor1, e.actor2].map((a) => cleanText(a, 80)).filter(Boolean);
    signals.push({
      key: `acled:${e.event_id_cnty}`,
      source: "acled",
      category: type.category,
      title: `${cleanText(e.sub_event_type || e.event_type, 60)} — ${cleanText(e.location || e.admin1, 60)}, ${cleanText(e.country, 60)}`,
      summary: cleanText(e.notes, 420) || undefined,
      url: "https://acleddata.com/data-export-tool/",
      outlet: "acleddata.com",
      lat: e.latitude,
      lon: e.longitude,
      precision: PRECISION[e.geo_precision ?? 2] ?? "region",
      place: cleanText(place, 140),
      country: iso2,
      time: Math.min(time, ctx.now),
      severity: clamp01(type.severity + Math.min(0.15, Math.log10(1 + fatalities) * 0.08)),
      quality: clamp01(0.8 + 0.05 * Math.min(4, sources.length)),
      reports: Math.max(1, sources.length),
      actors,
      tags: [e.event_type, ...(e.sub_event_type ? [e.sub_event_type] : [])],
      metrics: { ...(fatalities ? { reportedFatalities: fatalities } : {}), sources: sources.length },
    });
    ledger.accept();
  }
  return { signals, ledger };
}

let token: { value: string; expires: number } | null = null;

async function accessToken(transport: Transport, now: number): Promise<string | null> {
  if (process.env.ACLED_ACCESS_TOKEN) return process.env.ACLED_ACCESS_TOKEN;
  const user = process.env.ACLED_USERNAME;
  const pass = process.env.ACLED_PASSWORD;
  if (!user || !pass) return null;
  if (token && token.expires > now + 60_000) return token.value;
  const body = new URLSearchParams({ username: user, password: pass, grant_type: "password", client_id: "acled" }).toString();
  const res = JSON.parse(
    await transport.text(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }),
  ) as { access_token?: string; expires_in?: number };
  if (!res.access_token) throw new Error("ACLED authentication failed");
  token = { value: res.access_token, expires: now + (res.expires_in ?? 3600) * 1000 };
  return token.value;
}

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const acled: SourceAdapter = {
  meta: {
    id: "acled",
    name: "ACLED",
    kind: "Human-coded conflict events",
    reliability: "A",
    homepage: "https://acleddata.com/",
    description: "Battles, explosions, violence against civilians, riots and protests — researched, source-verified and geocoded by ACLED analysts.",
    ttlMs: 60 * 60_000,
    maxStaleMs: 48 * 3_600_000,
    coverage: "Past 30 days · weekly releases, typically 3–10 days behind",
  },
  disabled() {
    const configured =
      !!process.env.ACLED_ACCESS_TOKEN ||
      (!!process.env.ACLED_USERNAME && !!process.env.ACLED_PASSWORD) ||
      (!!process.env.ACLED_KEY && !!process.env.ACLED_EMAIL);
    return configured ? null : "Needs an ACLED account — set ACLED_USERNAME and ACLED_PASSWORD";
  },
  async collect(ctx) {
    const range = `${iso(ctx.now - LOOKBACK_DAYS * 86_400_000)}|${iso(ctx.now)}`;
    const params = new URLSearchParams({ _format: "json", event_date: range, event_date_where: "BETWEEN", fields: FIELDS, limit: "5000" });
    const bearer = await accessToken(ctx.transport, ctx.now);
    let text: string;
    if (bearer) {
      text = await ctx.transport.text(`${API}?${params}`, { headers: { Authorization: `Bearer ${bearer}` } });
    } else {
      params.set("key", process.env.ACLED_KEY ?? "");
      params.set("email", process.env.ACLED_EMAIL ?? "");
      text = await ctx.transport.text(`${LEGACY_API}?${params}`);
    }
    return parseAcled(JSON.parse(text), ctx);
  },
};
