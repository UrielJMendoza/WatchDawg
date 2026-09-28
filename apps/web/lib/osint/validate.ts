/**
 * Validation primitives shared by every source adapter.
 *
 * Every raw record ends up in exactly one bucket of a Ledger:
 *   accepted  — valid and relevant, becomes (part of) a Signal
 *   rejected  — invalid: failed schema, impossible coordinates, bad timestamp…
 *   filtered  — valid but dropped: outside the time window, below the
 *               evidence bar, or not geolocatable
 * Reasons are counted so the Sources panel can show exactly why data was
 * dropped, and a source whose reject ratio spikes is flagged as degraded.
 */

export class Ledger {
  received = 0;
  accepted = 0;
  rejected = 0;
  filtered = 0;
  reasons: Record<string, number> = {};

  seen(n = 1): void {
    this.received += n;
  }
  accept(n = 1): void {
    this.accepted += n;
  }
  reject(reason: string): void {
    this.rejected++;
    this.reasons[reason] = (this.reasons[reason] ?? 0) + 1;
  }
  filter(reason: string): void {
    this.filtered++;
    this.reasons[reason] = (this.reasons[reason] ?? 0) + 1;
  }
  /** Share of received records that were malformed. */
  get rejectRatio(): number {
    return this.received ? this.rejected / this.received : 0;
  }
}

/** Returns a reject reason, or null when the coordinate is plausible. */
export function checkCoords(lat: unknown, lon: unknown): string | null {
  if (typeof lat !== "number" || typeof lon !== "number") return "coord.missing";
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "coord.nan";
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return "coord.range";
  // (0,0) "Null Island" is the classic geocoder failure value.
  if (Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01) return "coord.null_island";
  return null;
}

const FUTURE_SLACK_MS = 15 * 60_000;

/**
 * Returns a reason when a timestamp is unusable ("time.invalid",
 * "time.future") or outside the window ("window.stale" — a filter, not a
 * reject).
 */
export function checkTime(
  t: number,
  now: number,
  maxAgeMs: number,
): "time.invalid" | "time.future" | "window.stale" | null {
  if (!Number.isFinite(t) || t <= 0) return "time.invalid";
  if (t > now + FUTURE_SLACK_MS) return "time.future";
  if (t < now - maxAgeMs) return "window.stale";
  return null;
}

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'",
  rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…",
};

/** Strip markup, decode common entities, collapse whitespace, cap length. */
export function cleanText(raw: unknown, max = 280): string {
  if (typeof raw !== "string") return "";
  let s = raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
      const k = e.toLowerCase();
      if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16) || 32);
      if (k.startsWith("#") && k !== "#39") return String.fromCodePoint(parseInt(k.slice(1), 10) || 32);
      return ENTITIES[k] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
  if (s.length > max) s = `${s.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  return s;
}

/** Only absolute http(s) URLs survive; everything else becomes undefined. */
export function safeUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || raw.length > 2048) return undefined;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
}

export function hostOf(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : Number.isFinite(n) ? n : 0);

/**
 * Turn a news URL's slug into a readable headline:
 * `/2026/09/28/russian-drone-strike-hits-kharkiv-apartment-block.html`
 *   → "Russian drone strike hits kharkiv apartment block".
 * Returns undefined when the slug doesn't look like words (ids, hashes).
 */
export function headlineFromUrl(url: string | undefined, properNouns: string[] = []): string | undefined {
  if (!url) return undefined;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const segs = path.split("/").filter(Boolean).map((s) => decodeURIComponentSafe(s));
  let best = "";
  for (const seg of segs) {
    const base = seg.replace(/\.(s?html?|php|aspx?|cms|ece)$/i, "");
    if (base.length > best.length && /[-_]/.test(base)) best = base;
  }
  if (!best) return undefined;
  const words = best
    .split(/[-_+]+/)
    .filter((w) => w && !/^\d{5,}$/.test(w) && !/^[0-9a-f]{8,}$/i.test(w) && !/^(amp|html|index|article|story|news)$/i.test(w));
  const alpha = words.filter((w) => /^[a-z']+$/i.test(w));
  if (alpha.length < 4 || alpha.length / words.length < 0.7) return undefined;
  // Slugs are lower-case; restore capitals on names we know from elsewhere.
  const proper = new Map<string, string>();
  for (const n of properNouns) {
    for (const w of n.split(/[\s,'’-]+/)) if (w.length > 2) proper.set(w.toLowerCase(), w);
  }
  const text = words
    .map((w) => proper.get(w.toLowerCase()) ?? w)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 20) return undefined;
  const capped = text.length > 140 ? `${text.slice(0, 139).replace(/\s+\S*$/, "")}…` : text;
  return capped.charAt(0).toUpperCase() + capped.slice(1);
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Title-case an ALL-CAPS actor name from GDELT ("UNITED STATES" → "United States"). */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Of|And|The|For|In|On)\b/g, (m) => m.toLowerCase())
    .replace(/^./, (m) => m.toUpperCase());
}

/** Small, fast, stable string hash (FNV-1a, base36). */
export function hashId(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
