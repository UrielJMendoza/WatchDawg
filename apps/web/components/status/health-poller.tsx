"use client";

import { useEffect } from "react";

import { api, ApiError } from "@/lib/api";
import { useStatusStore } from "@/lib/store/status-store";

const POLL_INTERVAL_MS = 30_000;

/**
 * Background poller that keeps the Zustand status store in sync with
 * the backend /health probe. Mounted once in the dashboard layout.
 *
 * Log lines are structured JSON so the browser console output matches
 * the backend's structlog shape.
 */
export function HealthPoller() {
  const markProbeSucceeded = useStatusStore((s) => s.markProbeSucceeded);
  const markProbeFailed = useStatusStore((s) => s.markProbeFailed);

  useEffect(() => {
    let cancelled = false;

    const probe = async () => {
      const start = performance.now();
      try {
        await api.health();
        const latency = performance.now() - start;
        if (!cancelled) markProbeSucceeded(latency);
      } catch (err) {
        if (cancelled) return;
        markProbeFailed();
        console.warn(
          JSON.stringify({
            event: "health_probe_failed",
            ts: new Date().toISOString(),
            status: err instanceof ApiError ? err.status : 0,
            message: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    };

    void probe();
    const interval = setInterval(probe, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [markProbeSucceeded, markProbeFailed]);

  return null;
}
