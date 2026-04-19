"use client";

import { create } from "zustand";

import type { BackendStatus } from "@/components/status/status-pill";

interface StatusState {
  backendStatus: BackendStatus;
  failCount: number;
  lastCheckedAt: number | null;
  lastLatencyMs: number | null;

  markProbeSucceeded: (latencyMs: number) => void;
  markProbeFailed: () => void;
}

/**
 * Single source of truth for the LIVE/DEGRADED/OFFLINE pill.
 *
 * Rules (matching the Phase 1 acceptance):
 *   - initial:         unknown (booting)
 *   - probe succeeds:  live, failCount → 0
 *   - probe fails once or twice: degraded (amber)
 *   - probe fails three consecutive times: offline (red)
 */
export const useStatusStore = create<StatusState>((set) => ({
  backendStatus: "unknown",
  failCount: 0,
  lastCheckedAt: null,
  lastLatencyMs: null,
  markProbeSucceeded: (latencyMs) =>
    set({
      backendStatus: "live",
      failCount: 0,
      lastCheckedAt: Date.now(),
      lastLatencyMs: Math.round(latencyMs),
    }),
  markProbeFailed: () =>
    set((s) => {
      const failCount = s.failCount + 1;
      const backendStatus: BackendStatus = failCount >= 3 ? "offline" : "degraded";
      return {
        backendStatus,
        failCount,
        lastCheckedAt: Date.now(),
        lastLatencyMs: null,
      };
    }),
}));
