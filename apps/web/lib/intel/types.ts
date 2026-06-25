/**
 * Shared types for the GOTHAM OSINT intelligence layer.
 *
 * Data provenance:
 *  - `gdelt` / `acled` events + feed items are REAL (pulled live, server-side).
 *  - `seed` events are a small static fallback so the map is never empty when
 *    the upstream uplink is degraded/offline.
 *  - Arcs are DERIVED visual relationships (tension axes) computed from real
 *    event clusters — never literal munition tracks.
 */

export type Theater = "middle-east" | "eastern-europe" | "global";

export type NationCode = "IR" | "IL" | "UA" | "RU";

export type ThreatLevel =
  | "low"
  | "guarded"
  | "elevated"
  | "high"
  | "severe"
  | "critical";

export type SourceStatus = "ok" | "degraded" | "offline";

export type IntelSource = "gdelt" | "acled" | "seed";

/** A geolocated event/hotspot rendered on the map. */
export interface IntelEvent {
  id: string;
  lat: number;
  lon: number;
  /** Human label, e.g. "Tehran, Iran". */
  name: string;
  /** Article-mention intensity / event count from the source. */
  count: number;
  /** Which focus nation's bbox this falls within, if any. */
  nation: NationCode | null;
  /** Normalised 0..1 severity used for colour + radius. */
  severity: number;
  source: IntelSource;
  url?: string;
}

/** A streaming news/alert item for the bottom ticker. */
export interface FeedItem {
  id: string;
  title: string;
  url: string;
  domain: string;
  country: string;
  /** ISO timestamp. */
  seen: string;
  nation: NationCode | null;
}

/** A DERIVED tension axis between two points (clearly labelled in the UI). */
export interface Arc {
  id: string;
  from: [number, number];
  to: [number, number];
  label: string;
  intensity: number;
  derived: true;
}

export interface TimePoint {
  /** ISO timestamp. */
  t: string;
  v: number;
}

export interface NationMetric {
  code: NationCode;
  /** Count of events attributed to this nation in the current window. */
  events: number;
  /** Normalised 0..1 pressure score. */
  score: number;
  threat: ThreatLevel;
}

export interface EventsPayload {
  status: SourceStatus;
  theater: Theater;
  events: IntelEvent[];
  arcs: Arc[];
  nations: NationMetric[];
  updatedAt: string;
  note?: string;
}

export interface FeedPayload {
  status: SourceStatus;
  theater: Theater;
  items: FeedItem[];
  updatedAt: string;
  note?: string;
}

export interface PulsePayload {
  status: SourceStatus;
  nation: NationCode;
  volume: TimePoint[];
  tone: TimePoint[];
  /** Latest average tone (negative = hostile coverage). */
  toneNow: number;
  updatedAt: string;
  note?: string;
}

export function threatFromScore(score: number): ThreatLevel {
  if (score >= 0.92) return "critical";
  if (score >= 0.75) return "severe";
  if (score >= 0.55) return "high";
  if (score >= 0.38) return "elevated";
  if (score >= 0.2) return "guarded";
  return "low";
}
