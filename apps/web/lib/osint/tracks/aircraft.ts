import { z } from "zod";
import { checkCoords, cleanText, Ledger } from "../validate";
import type { Transport } from "../sources/types";
import type { AirTrack, Emergency } from "./types";

/**
 * Live aircraft from community ADS-B networks (readsb "v2" JSON), queried
 * for two things an analyst cares about globally:
 *   - aircraft flagged military in the ADS-B database
 *   - aircraft squawking emergency codes (7500 hijack, 7600 radio, 7700 general)
 * adsb.lol is primary, airplanes.live the fallback; both are free and keyless.
 */

const HOSTS: Array<{ base: string; mil: string; squawk: (code: string) => string }> = [
  { base: "https://api.adsb.lol", mil: "/v2/mil", squawk: (c) => `/v2/sqk/${c}` },
  { base: "https://api.airplanes.live", mil: "/v2/mil", squawk: (c) => `/v2/squawk/${c}` },
];

export const EMERGENCY_SQUAWKS: Record<string, Emergency> = { "7500": "hijack", "7600": "radio", "7700": "general" };

const MAX_POSITION_AGE_S = 90;

const num = z.number().finite();

const Aircraft = z.object({
  hex: z.string().regex(/^~?[0-9a-f]{6}$/i),
  flight: z.string().optional(),
  r: z.string().optional(),
  t: z.string().optional(),
  desc: z.string().optional(),
  lat: num.optional(),
  lon: num.optional(),
  alt_baro: z.union([num, z.literal("ground")]).optional(),
  gs: num.optional(),
  track: num.optional(),
  squawk: z.string().optional(),
  emergency: z.string().optional(),
  dbFlags: z.number().int().optional(),
  seen_pos: num.optional(),
  seen: num.optional(),
});

const Payload = z.object({ ac: z.array(z.unknown()).nullable().default([]), now: z.number().optional() });

const EMERGENCY_FIELD: Record<string, Emergency> = {
  none: "none",
  general: "general",
  lifeguard: "medical",
  minfuel: "fuel",
  nordo: "radio",
  unlawful: "unlawful",
  downed: "downed",
};

export function parseAircraft(json: unknown, ledger: Ledger, forceMilitary = false): AirTrack[] {
  const payload = Payload.safeParse(json);
  if (!payload.success) throw new Error("ADS-B payload failed schema validation");
  const out: AirTrack[] = [];
  for (const raw of payload.data.ac ?? []) {
    ledger.seen();
    const r = Aircraft.safeParse(raw);
    if (!r.success) {
      ledger.reject("schema");
      continue;
    }
    const a = r.data;
    if (a.lat === undefined || a.lon === undefined) {
      ledger.filter("position.missing");
      continue;
    }
    const coordErr = checkCoords(a.lat, a.lon);
    if (coordErr) {
      ledger.reject(coordErr);
      continue;
    }
    const age = a.seen_pos ?? a.seen ?? 0;
    if (age > MAX_POSITION_AGE_S) {
      ledger.filter("position.stale");
      continue;
    }
    if (a.gs !== undefined && (a.gs < 0 || a.gs > 1300)) {
      ledger.reject("value.speed");
      continue;
    }
    const altitude = typeof a.alt_baro === "number" ? a.alt_baro : null;
    if (altitude !== null && (altitude < -2000 || altitude > 80_000)) {
      ledger.reject("value.altitude");
      continue;
    }
    const squawk = a.squawk && /^[0-7]{4}$/.test(a.squawk) ? a.squawk : undefined;
    const fromField = a.emergency ? EMERGENCY_FIELD[a.emergency] ?? "general" : "none";
    const emergency: Emergency = fromField !== "none" ? fromField : squawk ? EMERGENCY_SQUAWKS[squawk] ?? "none" : "none";
    out.push({
      id: a.hex.toLowerCase(),
      callsign: cleanText(a.flight ?? "", 12) || undefined,
      registration: cleanText(a.r ?? "", 16) || undefined,
      type: cleanText(a.t ?? "", 8) || undefined,
      description: cleanText(a.desc ?? "", 60) || undefined,
      lat: a.lat,
      lon: a.lon,
      altitude,
      onGround: a.alt_baro === "ground",
      speed: a.gs ?? null,
      heading: a.track !== undefined ? ((a.track % 360) + 360) % 360 : null,
      squawk,
      emergency,
      military: forceMilitary || ((a.dbFlags ?? 0) & 1) === 1,
      positionAge: Math.round(age),
    });
    ledger.accept();
  }
  return out;
}

/** Pull military + emergency aircraft; merge by ICAO address. */
export async function collectAircraft(transport: Transport): Promise<{ aircraft: AirTrack[]; ledger: Ledger; host: string }> {
  let lastErr: unknown;
  for (const host of HOSTS) {
    try {
      const ledger = new Ledger();
      const [mil, ...sq] = await Promise.all([
        transport.text(`${host.base}${host.mil}`),
        ...Object.keys(EMERGENCY_SQUAWKS).map((c) => transport.text(`${host.base}${host.squawk(c)}`).catch(() => '{"ac":[]}')),
      ]);
      const byId = new Map<string, AirTrack>();
      for (const a of parseAircraft(JSON.parse(mil), ledger, true)) byId.set(a.id, a);
      for (const body of sq) {
        for (const a of parseAircraft(JSON.parse(body), ledger)) {
          const prev = byId.get(a.id);
          byId.set(a.id, prev ? { ...a, military: prev.military || a.military } : a);
        }
      }
      return { aircraft: [...byId.values()], ledger, host: new URL(host.base).hostname };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("No ADS-B network reachable");
}
