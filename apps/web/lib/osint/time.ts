/**
 * Convert a zone-less local timestamp ("2026-09-27T14:30:00.000", as Socrata
 * returns "floating" timestamps) in an IANA zone to epoch ms. Handles DST by
 * re-checking the offset at the candidate instant.
 */
export function zonedToUtc(local: string, tz: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) return NaN;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  const first = offsetMs(asUtc, tz);
  let t = asUtc - first;
  const second = offsetMs(t, tz);
  if (second !== first) t = asUtc - second;
  return t;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Local-minus-UTC offset of `tz` at instant `utcMs`. */
export function offsetMs(utcMs: number, tz: string): number {
  let dtf = formatters.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, dtf);
  }
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) p[part.type] = part.value;
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asLocal - Math.floor(utcMs / 1000) * 1000;
}

/** Socrata `$where` literal for "the local wall-clock time at `utcMs` in `tz`". */
export function socrataLocal(utcMs: number, tz: string): string {
  const local = new Date(utcMs + offsetMs(utcMs, tz));
  return local.toISOString().slice(0, 19);
}
