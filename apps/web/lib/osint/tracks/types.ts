import type { Reliability, SourceStatus } from "../types";

/**
 * Tracks are moving assets (aircraft, satellites), not incidents: they are
 * refreshed on their own cadence and rendered as a separate layer.
 */

export type Emergency = "none" | "general" | "radio" | "hijack" | "medical" | "fuel" | "downed" | "unlawful";

export interface AirTrack {
  /** ICAO 24-bit address (hex). */
  id: string;
  callsign?: string;
  registration?: string;
  /** ICAO aircraft type designator, e.g. "C17". */
  type?: string;
  description?: string;
  lat: number;
  lon: number;
  /** Barometric altitude in feet; null when on the ground or unknown. */
  altitude: number | null;
  onGround: boolean;
  /** Ground speed, knots. */
  speed: number | null;
  /** True track over ground, degrees. */
  heading: number | null;
  squawk?: string;
  emergency: Emergency;
  military: boolean;
  /** Seconds since the position was received. */
  positionAge: number;
}

export interface SatElement {
  /** NORAD catalog number. */
  id: string;
  name: string;
  group: string;
  line1: string;
  line2: string;
  /** Epoch of the element set, epoch ms. */
  epoch: number;
  inclination: number;
  /** Revolutions per day. */
  meanMotion: number;
}

export interface FeedHealth {
  id: string;
  name: string;
  reliability: Reliability;
  homepage: string;
  description: string;
  coverage: string;
  status: SourceStatus;
  statusNote?: string;
  fetchedAt: number | null;
  latencyMs: number | null;
  received: number;
  accepted: number;
  rejected: number;
  filtered: number;
  reasons: Record<string, number>;
}

export interface AirPayload {
  generatedAt: number;
  aircraft: AirTrack[];
  health: FeedHealth;
}

export interface SpacePayload {
  generatedAt: number;
  satellites: SatElement[];
  health: FeedHealth;
}
