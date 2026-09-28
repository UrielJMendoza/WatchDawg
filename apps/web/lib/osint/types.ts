/**
 * Core data model for the WatchDawg OSINT pipeline.
 *
 *   raw feed payload ──validate──▶ Signal ──fuse──▶ Incident ──aggregate──▶ Hotspot
 *
 * A Signal is one observation from one source. An Incident is one real-world
 * happening, corroborated by one or more signals. A Hotspot is a region where
 * incidents concentrate.
 */

export type SourceId = "usgs" | "eonet" | "gdacs" | "nws" | "gdelt" | "acled" | "crime" | "wire";

export type Category =
  | "conflict"
  | "security"
  | "crime"
  | "unrest"
  | "tension"
  | "diplomacy"
  | "humanitarian"
  | "seismic"
  | "volcanic"
  | "storm"
  | "flood"
  | "wildfire"
  | "hazard";

/** Map colour groups. Kept to three so every pair stays distinguishable. */
export type Domain = "security" | "civil" | "hazard";

/** How precisely a coordinate pins down where something happened. */
export type GeoPrecision = "exact" | "city" | "region" | "country";

/**
 * NATO Admiralty grading. Reliability rates the source (A = completely
 * reliable … E = unreliable, F = cannot be judged); credibility rates the
 * information (1 = confirmed by independent sources … 5 = improbable,
 * 6 = cannot be judged).
 */
export type Reliability = "A" | "B" | "C" | "D" | "E" | "F";
export type Credibility = 1 | 2 | 3 | 4 | 5 | 6;

export interface Signal {
  /** Source-scoped stable id, e.g. `usgs:us7000abcd`. */
  key: string;
  source: SourceId;
  category: Category;
  title: string;
  /** A human headline when the source has one (wire title, URL slug). */
  headline?: string;
  summary?: string;
  url?: string;
  /** Publishing outlet (domain) for news-derived signals. */
  outlet?: string;
  lat: number;
  lon: number;
  precision: GeoPrecision;
  place: string;
  /** ISO 3166-1 alpha-2, when known. */
  country?: string;
  /** Epoch ms of the observation. */
  time: number;
  /** Epoch ms of the earliest observation folded into this signal. */
  firstTime?: number;
  /**
   * The location is a guess (a demonym, or a country a machine coder
   * assigned), so the same story reported elsewhere may be the real place.
   */
  geoWeak?: boolean;
  /** 0..1 — how bad is it. */
  severity: number;
  /** 0..1 — how strong is the evidence within this one source. */
  quality: number;
  /** Number of underlying reports (articles, detections) in this signal. */
  reports: number;
  actors?: string[];
  tags?: string[];
  metrics?: Record<string, string | number>;
}

export interface SignalRef {
  source: SourceId;
  title: string;
  url?: string;
  outlet?: string;
  time: number;
}

export interface Incident {
  id: string;
  category: Category;
  title: string;
  /** Machine-generated description of the event type. */
  label: string;
  summary?: string;
  lat: number;
  lon: number;
  precision: GeoPrecision;
  place: string;
  country?: string;
  firstSeen: number;
  lastSeen: number;
  severity: number;
  /** 0..1 fused confidence across independent sources. */
  confidence: number;
  reliability: Reliability;
  credibility: Credibility;
  sources: SourceId[];
  /** Distinct publishing outlets behind the incident. */
  outlets: number;
  /** Total reports folded in. */
  reports: number;
  signals: SignalRef[];
  actors?: string[];
  tags?: string[];
  metrics?: Record<string, string | number>;
}

export interface Hotspot {
  id: string;
  name: string;
  country?: string;
  lat: number;
  lon: number;
  radiusKm: number;
  incidents: number;
  /** Activity index: severity × confidence, summed. */
  score: number;
  maxSeverity: number;
  domains: Record<Domain, number>;
  topCategory: Category;
  /** -1..1 — recent activity versus the rest of the window. */
  trend: number;
  /** Incident counts per time bin across the window, oldest first. */
  spark: number[];
  incidentIds: string[];
}

/**
 * A directed country→country interaction aggregated from machine-coded news:
 * "actor from A did something to actor from B", weighted by coverage.
 */
export interface Relation {
  id: string;
  from: string;
  to: string;
  events: number;
  articles: number;
  outlets: number;
  /** Article-weighted mean Goldstein score: −10 (hostile) … +10 (cooperative). */
  goldstein: number;
  tone: number;
  stance: "hostile" | "mixed" | "cooperative";
  category: Category;
  lastSeen: number;
  /** Articles per bin across the window, oldest first. */
  spark: number[];
}

export type SourceStatus = "ok" | "degraded" | "offline" | "disabled";

export interface SourceHealth {
  id: SourceId;
  name: string;
  kind: string;
  reliability: Reliability;
  homepage: string;
  description: string;
  status: SourceStatus;
  /** Why the status is what it is, in plain words. */
  statusNote?: string;
  fetchedAt: number | null;
  latencyMs: number | null;
  /** Records seen in the raw payload. */
  received: number;
  /** Records that passed validation and relevance filters. */
  accepted: number;
  /** Records that failed validation (malformed, out of range…). */
  rejected: number;
  /** Valid records dropped as out of window or below the evidence bar. */
  filtered: number;
  reasons: Record<string, number>;
  /** Epoch ms of the newest accepted record. */
  newest: number | null;
  integrity?: { check: string; passed: number; total: number; detail?: string };
  /** Served from last-known-good cache after an upstream failure. */
  stale: boolean;
  /** How far back this source's data reaches, and its typical publication lag. */
  coverage?: string;
}

export const WINDOWS = {
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000,
  "30d": 30 * 24 * 3_600_000,
} as const;

export type WindowKey = keyof typeof WINDOWS;

export function isWindowKey(v: unknown): v is WindowKey {
  return typeof v === "string" && v in WINDOWS;
}

export interface Timeline {
  start: number;
  binMs: number;
  bins: number;
  series: Record<Domain, number[]>;
}

export interface SnapshotStats {
  incidents: number;
  signals: number;
  corroborated: number;
  critical: number;
  byCategory: Partial<Record<Category, number>>;
  byDomain: Record<Domain, number>;
  countries: number;
}

export interface Snapshot {
  generatedAt: number;
  window: WindowKey;
  incidents: Incident[];
  hotspots: Hotspot[];
  relations: Relation[];
  sources: SourceHealth[];
  stats: SnapshotStats;
  timeline: Timeline;
}
