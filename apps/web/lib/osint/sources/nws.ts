import { z } from "zod";
import type { Category, Signal } from "../types";
import { checkCoords, checkTime, clamp01, cleanText, Ledger, safeUrl } from "../validate";
import type { CollectContext, CollectResult, SourceAdapter } from "./types";

/**
 * US National Weather Service active alerts (CAP as GeoJSON).
 * https://www.weather.gov/documentation/services-web-api
 *
 * Kept: Severe and Extreme warnings that carry their own storm-based polygon
 * (tornado, severe thunderstorm, flash flood, extreme wind, fire...). Alerts
 * issued only for forecast zones have no geometry of their own and are
 * counted as `geo.zone_only` rather than guessed at.
 */
export const NWS_API = "https://api.weather.gov/alerts/active";
export const NWS_URLS = [
  `${NWS_API}?status=actual&message_type=alert,update&severity=Extreme,Severe`,
  // Fallback if the filtered query is ever refused; severity is re-checked below.
  `${NWS_API}?status=actual`,
];

const Props = z.object({
  "@id": z.string().optional(),
  id: z.string().min(1),
  areaDesc: z.string().default(""),
  sent: z.string(),
  expires: z.string().nullable().optional(),
  ends: z.string().nullable().optional(),
  status: z.string(),
  messageType: z.string(),
  severity: z.string(),
  certainty: z.string().optional(),
  urgency: z.string().optional(),
  event: z.string().min(1),
  senderName: z.string().nullable().optional(),
  headline: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

const Feature = z.object({
  geometry: z
    .object({
      type: z.enum(["Polygon", "MultiPolygon"]),
      coordinates: z.array(z.unknown()),
    })
    .nullish(),
  properties: Props,
});

const Payload = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()),
});

const CATEGORY_RULES: Array<[RegExp, Category]> = [
  [/tornado|hurricane|typhoon|tropical storm|storm surge|thunderstorm|extreme wind|high wind|blizzard|ice storm|winter storm|snow squall|dust storm/i, "storm"],
  [/flood|tsunami/i, "flood"],
  [/fire|red flag/i, "wildfire"],
];

function categoryOf(event: string): Category {
  for (const [re, c] of CATEGORY_RULES) if (re.test(event)) return c;
  return "hazard";
}

const SEVERITY: Record<string, number> = { Extreme: 0.85, Severe: 0.65 };
const CERTAINTY_QUALITY: Record<string, number> = { Observed: 1, Likely: 0.9, Possible: 0.75 };

function param(p: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = p?.[key];
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return typeof v === "string" ? v : undefined;
}

/**
 * VTEC (Valid Time Event Code) identifies one hazard event across its
 * updates: office + phenomenon + significance + event number. Returns the
 * key and the action (NEW, CON, EXT, CAN, EXP...).
 */
export function parseVtec(vtec: string | undefined): { key: string; action: string } | null {
  const m = vtec && /\/[OTEX]\.([A-Z]{3})\.([A-Z]{4})\.([A-Z]{2})\.([A-Z])\.(\d{4})\./.exec(vtec);
  return m ? { key: `${m[2]}.${m[3]}.${m[4]}.${m[5]}`, action: m[1] } : null;
}

function ring(coords: unknown): Array<[number, number]> | null {
  if (!Array.isArray(coords)) return null;
  const out: Array<[number, number]> = [];
  for (const pt of coords) {
    if (!Array.isArray(pt) || typeof pt[0] !== "number" || typeof pt[1] !== "number") return null;
    out.push([pt[0], pt[1]]);
  }
  return out.length >= 3 ? out : null;
}

/** Vertex mean of the outer ring(s): warning polygons are small and convex-ish. */
export function polygonCenter(geom: { type: string; coordinates: unknown[] }): { lat: number; lon: number } | null {
  const rings = geom.type === "Polygon" ? [geom.coordinates[0]] : geom.coordinates.map((poly) => (Array.isArray(poly) ? poly[0] : null));
  let sx = 0, sy = 0, n = 0;
  for (const r of rings) {
    const pts = ring(r);
    if (!pts) return null;
    const closed = pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    for (const [lon, lat] of closed ? pts.slice(0, -1) : pts) {
      sx += lon;
      sy += lat;
      n++;
    }
  }
  return n ? { lon: sx / n, lat: sy / n } : null;
}

const STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  PR: "Puerto Rico", GU: "Guam", VI: "US Virgin Islands", AS: "American Samoa", MP: "Northern Mariana Islands",
};

/** "Lake, IL" → "Lake County, Illinois"; parishes and boroughs where those are the unit. */
function countyName(area: string): string {
  const m = /^(.+?),\s*([A-Z]{2})$/.exec(area);
  if (!m || !STATES[m[2]]) return area;
  const [, name, st] = m;
  const unit = /\b(county|parish|borough|city|census area|municipality)\b/i.test(name)
    ? ""
    : st === "LA" ? " Parish" : st === "AK" ? " Borough" : " County";
  return `${name}${unit}, ${STATES[st]}`;
}

export function placeOf(areaDesc: string): string {
  const parts = areaDesc.split(";").map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return "United States";
  return `${countyName(parts[0])}${parts.length > 1 ? ` +${parts.length - 1}` : ""}`;
}

/**
 * Base severity by event: the CAP severity field rates a river flood and a
 * tornado alike ("Severe"), which would rank a slow river rise above a war.
 */
function baseSeverity(event: string, severity: string): number | undefined {
  const base = SEVERITY[severity];
  if (base == null) return undefined;
  if (/tornado|extreme wind|hurricane|typhoon|storm surge|tsunami/i.test(event)) return Math.max(base, 0.85);
  if (/^flood (warning|statement)|red flag|heat|freeze|frost|wind chill|cold/i.test(event)) return Math.min(base, 0.45);
  return base;
}

export function parseNws(json: unknown, ctx: Pick<CollectContext, "now" | "horizonMs">): CollectResult {
  const ledger = new Ledger();
  const payload = Payload.safeParse(json);
  if (!payload.success) throw new Error("NWS payload failed schema validation");

  // Latest message per hazard event (VTEC), so updates replace, not duplicate.
  const latest = new Map<string, Signal>();
  for (const raw of payload.data.features) {
    ledger.seen();
    const parsed = Feature.safeParse(raw);
    if (!parsed.success) {
      ledger.reject("schema");
      continue;
    }
    const { geometry, properties: p } = parsed.data;
    if (p.status !== "Actual" || p.messageType === "Cancel") {
      ledger.filter("status.not_actual");
      continue;
    }
    const base = baseSeverity(p.event, p.severity);
    if (base == null) {
      ledger.filter("relevance.minor");
      continue;
    }
    const vtec = parseVtec(param(p.parameters, "VTEC"));
    if (vtec && (vtec.action === "CAN" || vtec.action === "EXP")) {
      ledger.filter("status.ended");
      continue;
    }
    const time = Date.parse(p.sent);
    const timeErr = checkTime(time, ctx.now, ctx.horizonMs);
    if (timeErr) {
      if (timeErr === "window.stale") ledger.filter(timeErr);
      else ledger.reject(timeErr);
      continue;
    }
    const ends = Date.parse(p.ends ?? p.expires ?? "");
    if (Number.isFinite(ends) && ends < ctx.now) {
      ledger.filter("window.expired");
      continue;
    }
    if (!geometry) {
      ledger.filter("geo.zone_only");
      continue;
    }
    const c = polygonCenter(geometry);
    const coordErr = c ? checkCoords(c.lat, c.lon) : "coord.missing";
    if (coordErr || !c) {
      ledger.reject(coordErr ?? "coord.missing");
      continue;
    }

    const certainty = p.certainty ?? "Unknown";
    const damage = param(p.parameters, "tornadoDamageThreat") ?? param(p.parameters, "thunderstormDamageThreat");
    const severity = clamp01(
      base +
        (certainty === "Observed" ? 0.05 : 0) +
        (p.urgency === "Immediate" ? 0.05 : 0) +
        (damage === "CATASTROPHIC" ? 0.15 : damage === "DESTRUCTIVE" || damage === "CONSIDERABLE" ? 0.07 : 0),
    );
    const place = cleanText(placeOf(p.areaDesc), 90);
    const event = cleanText(p.event, 60);
    const office = cleanText(p.senderName ?? "", 60);
    const detection = param(p.parameters, "tornadoDetection");
    const key = vtec?.key ?? p.id;
    const signal: Signal = {
      key: `nws:${key}`,
      source: "nws",
      category: categoryOf(p.event),
      title: `${event} — ${place}`,
      headline: cleanText(p.headline ?? "", 200) || undefined,
      summary: cleanText(p.description ?? "", 400) || undefined,
      url: safeUrl(p["@id"]),
      outlet: "weather.gov",
      lat: c.lat,
      lon: c.lon,
      precision: "city",
      place,
      country: "US",
      time,
      severity,
      quality: CERTAINTY_QUALITY[certainty] ?? 0.8,
      reports: 1,
      tags: [
        event,
        p.severity.toLowerCase(),
        certainty.toLowerCase(),
        ...(detection ? [detection.toLowerCase()] : []),
        ...(damage ? [`damage-${damage.toLowerCase()}`] : []),
        ...(office ? [office] : []),
      ],
    };
    const prev = latest.get(key);
    if (prev) ledger.filter("dedupe.vtec");
    if (!prev || prev.time < signal.time) latest.set(key, signal);
  }
  const signals = [...latest.values()];
  ledger.accept(signals.length);
  return { signals, ledger };
}

export const nws: SourceAdapter = {
  meta: {
    id: "nws",
    name: "US National Weather Service",
    kind: "Official weather warnings (CAP)",
    reliability: "A",
    homepage: "https://www.weather.gov/",
    description:
      "Severe and extreme US warnings with storm-based polygons — tornado, severe thunderstorm, flash flood, extreme wind and fire — as issued by NWS forecast offices.",
    ttlMs: 90_000,
    maxStaleMs: 3_600_000,
    coverage: "Active warnings · issued within minutes",
  },
  async collect(ctx) {
    let last: unknown;
    for (const url of NWS_URLS) {
      try {
        const text = await ctx.transport.text(url, { headers: { Accept: "application/geo+json" }, timeoutMs: 12_000 });
        return parseNws(JSON.parse(text), ctx);
      } catch (err) {
        last = err;
      }
    }
    throw last instanceof Error ? last : new Error("NWS unreachable");
  },
};
