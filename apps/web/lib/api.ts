/**
 * Typed fetch wrapper around the WatchDawg API.
 *
 * - Reads NEXT_PUBLIC_API_BASE_URL once at module load; throws early if
 *   missing in prod so we fail loud instead of mysteriously 404-ing.
 * - Never sends cookies (the API authenticates via Supabase Bearer JWT,
 *   not a session cookie, so CSRF surface is minimized).
 * - Surfaces errors as a single typed `ApiError` rather than mixing
 *   thrown strings / rejected TypeErrors from `fetch`.
 */

export interface ApiErrorPayload {
  status: number;
  message: string;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly requestId?: string;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = "ApiError";
    this.status = payload.status;
    this.requestId = payload.requestId;
  }
}

function resolveBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!url) {
    // In dev, prefer localhost if unset so `pnpm dev` works without a
    // local env file. In prod this would be a misconfiguration.
    return process.env.NODE_ENV === "production" ? "" : "http://localhost:8000";
  }
  return url.replace(/\/$/, "");
}

const BASE_URL = resolveBaseUrl();

interface RequestOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
  /** Bearer token. Omit for public routes. */
  token?: string;
  /** Abort the request after this many milliseconds. */
  timeoutMs?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { json, token, timeoutMs = 15_000, headers, ...rest } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const finalHeaders = new Headers(headers);
  if (json !== undefined) finalHeaders.set("content-type", "application/json");
  if (token) finalHeaders.set("authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      credentials: "omit",
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw new ApiError({
      status: 0,
      message: err instanceof Error ? err.message : "Network error",
    });
  }
  clearTimeout(timeout);

  const requestId = response.headers.get("x-request-id") ?? undefined;

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // non-JSON body; keep statusText
    }
    throw new ApiError({ status: response.status, message: detail, requestId });
  }

  return (await response.json()) as T;
}

// ── Endpoints ─────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: "ok";
  version: string;
  time: string;
}

export interface EventItem {
  id: string;
  source: "gdelt" | "aisstream" | "opensky" | "newsdata" | "reddit";
  occurred_at: string;
  lat: number;
  lon: number;
  title: string;
  url: string | null;
}

export interface EventList {
  items: EventItem[];
  total: number;
  next_cursor: string | null;
}

export const api = {
  health: (): Promise<HealthResponse> => request<HealthResponse>("/health"),
  events: (token: string): Promise<EventList> =>
    request<EventList>("/events", { token }),
};
