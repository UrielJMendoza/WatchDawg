import { propagate, twoline2satrec } from "satellite.js";
import { cleanText, Ledger } from "../validate";
import type { Transport } from "../sources/types";
import type { SatElement } from "./types";

/**
 * Orbital element sets (TLE) from CelesTrak, validated line by line before
 * any satellite is drawn:
 *   - three-line groups with "1 " / "2 " line numbers and 69 columns
 *   - the mod-10 checksum in column 69 of each line
 *   - matching catalogue numbers across both lines
 *   - a fresh epoch (stale element sets drift by hundreds of km)
 *   - an SGP4 propagation that succeeds at the current time
 */

export const SAT_GROUPS: Array<{ id: string; label: string }> = [
  { id: "stations", label: "Space stations" },
  { id: "military", label: "Military" },
  { id: "resource", label: "Earth observation" },
  { id: "weather", label: "Weather" },
];

const MAX_EPOCH_AGE_MS = 21 * 86_400_000;

export function celestrakUrl(group: string): string {
  return `https://celestrak.org/NORAD/elements/gp.php?GROUP=${encodeURIComponent(group)}&FORMAT=tle`;
}

/** TLE checksum: sum of digits, minus signs count as 1, modulo 10. */
export function tleChecksum(line: string): number {
  let sum = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= "0" && ch <= "9") sum += ch.charCodeAt(0) - 48;
    else if (ch === "-") sum += 1;
  }
  return sum % 10;
}

/** TLE epoch "YYDDD.DDDDDDDD" (columns 19–32 of line 1) → epoch ms. */
export function tleEpoch(line1: string): number {
  const yy = Number(line1.slice(18, 20));
  const day = Number(line1.slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(day)) return NaN;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return Date.UTC(year, 0, 1) + (day - 1) * 86_400_000;
}

export function parseTle(text: string, group: string, now: number, ledger: Ledger): SatElement[] {
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter(Boolean);
  const out: SatElement[] = [];
  for (let i = 0; i < lines.length; ) {
    const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (!l1 || !l2) break;
    ledger.seen();
    if (!l1.startsWith("1 ") || !l2.startsWith("2 ")) {
      ledger.reject("tle.structure");
      // Resynchronise on the next line that could be a name line.
      i += 1;
      continue;
    }
    i += 3;
    if (l1.length !== 69 || l2.length !== 69) {
      ledger.reject("tle.length");
      continue;
    }
    if (tleChecksum(l1) !== Number(l1[68]) || tleChecksum(l2) !== Number(l2[68])) {
      ledger.reject("tle.checksum");
      continue;
    }
    const norad = l1.slice(2, 7).trim();
    if (norad !== l2.slice(2, 7).trim()) {
      ledger.reject("tle.catalog_mismatch");
      continue;
    }
    const epoch = tleEpoch(l1);
    if (!Number.isFinite(epoch) || epoch > now + 86_400_000) {
      ledger.reject("tle.epoch");
      continue;
    }
    if (now - epoch > MAX_EPOCH_AGE_MS) {
      ledger.filter("tle.stale");
      continue;
    }
    try {
      const rec = twoline2satrec(l1, l2);
      const pv = propagate(rec, new Date(now));
      if (!pv || typeof pv.position !== "object") throw new Error("no position");
    } catch {
      ledger.reject("sgp4.error");
      continue;
    }
    out.push({
      id: norad,
      name: cleanText(name.replace(/^0 /, ""), 40) || `NORAD ${norad}`,
      group,
      line1: l1,
      line2: l2,
      epoch,
      inclination: Number(l2.slice(8, 16)),
      meanMotion: Number(l2.slice(52, 63)),
    });
    ledger.accept();
  }
  return out;
}

export async function collectSatellites(transport: Transport, now: number): Promise<{ satellites: SatElement[]; ledger: Ledger; groupsOk: number }> {
  const ledger = new Ledger();
  const results = await Promise.allSettled(
    SAT_GROUPS.map(async (g) => parseTle(await transport.text(celestrakUrl(g.id)), g.id, now, ledger)),
  );
  const byId = new Map<string, SatElement>();
  let groupsOk = 0;
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    groupsOk++;
    for (const s of r.value) if (!byId.has(s.id)) byId.set(s.id, s);
  }
  if (!groupsOk) throw new Error("CelesTrak unreachable");
  return { satellites: [...byId.values()], ledger, groupsOk };
}
