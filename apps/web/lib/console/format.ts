/** Display formatting for the console. */

export function ago(ms: number, now: number): string {
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function utcClock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 19);
}

export function utcStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}Z`;
}

export function binLabel(start: number, binMs: number): string {
  const d = new Date(start);
  if (binMs >= 86_400_000) return d.toISOString().slice(5, 10);
  return `${d.toISOString().slice(5, 10)} ${d.toISOString().slice(11, 16)}Z`;
}

/** Zoom → rough camera altitude above the globe, for the HUD. */
export function altitudeKm(zoom: number, lat: number): number {
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
  return (metersPerPixel * 800) / 1000;
}

export const GRADE_TEXT: Record<string, string> = {
  A: "Completely reliable",
  B: "Usually reliable",
  C: "Fairly reliable",
  D: "Not usually reliable",
  E: "Unreliable",
  F: "Reliability cannot be judged",
  "1": "Confirmed by independent sources",
  "2": "Probably true",
  "3": "Possibly true",
  "4": "Doubtful",
  "5": "Improbable",
  "6": "Truth cannot be judged",
};

export const SOURCE_LABEL: Record<string, string> = {
  usgs: "USGS",
  eonet: "NASA EONET",
  gdacs: "GDACS",
  nws: "NWS",
  gdelt: "GDELT",
  acled: "ACLED",
  crime: "Police data",
  wire: "Newsrooms",
};
