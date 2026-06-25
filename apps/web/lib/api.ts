/**
 * Typed fetch wrapper for the WatchDawg FastAPI backend.
 * Reads NEXT_PUBLIC_API_BASE_URL — set per environment.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!BASE_URL) {
    throw new ApiError(
      0,
      "NEXT_PUBLIC_API_BASE_URL is not configured. Set it in apps/web/.env.local.",
    );
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: init.cache ?? "no-store",
  });
  if (!res.ok) {
    let detail: unknown = undefined;
    try {
      detail = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, res.statusText, detail);
  }
  return (await res.json()) as T;
}

export interface HealthResponse {
  status: "ok" | "degraded" | "down";
  version: string;
  time: string;
}

export interface HealthDbResponse extends HealthResponse {
  latency_ms: number;
}

export interface EventListResponse {
  items: WatchdawgEvent[];
  total: number;
  next_cursor: string | null;
}

export interface WatchdawgEvent {
  id: string;
  source_id: string;
  source_key: string;
  event_time: string;
  title: string;
  summary: string | null;
  event_type: string;
  severity: number;
  fatalities: number | null;
  lon: number;
  lat: number;
  location_name: string | null;
  country_iso: string | null;
  source_url: string | null;
  confidence: number;
  classification: string;
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  healthDb: () => request<HealthDbResponse>("/health/db"),
  events: () => request<EventListResponse>("/events"),
};
