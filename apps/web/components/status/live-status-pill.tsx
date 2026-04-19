"use client";

import { useStatusStore } from "@/lib/store/status-store";
import { StatusPill } from "@/components/status/status-pill";

interface LiveStatusPillProps {
  variant?: "pill" | "dot";
  className?: string;
}

/**
 * Subscribes to the Zustand status store and renders the StatusPill
 * primitive. The pill's label reflects an actual /health probe — never
 * hardcoded — per the universal red-flag list.
 */
export function LiveStatusPill(props: LiveStatusPillProps) {
  const status = useStatusStore((s) => s.backendStatus);
  return <StatusPill status={status} {...props} />;
}

export function LastIngestLabel() {
  // "Last ingest" will be backed by a real ingestion-metadata endpoint in
  // Phase 2; for now we surface the last /health probe timestamp so the
  // label at least reflects real state.
  const lastCheckedAt = useStatusStore((s) => s.lastCheckedAt);
  const label = lastCheckedAt
    ? new Date(lastCheckedAt).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "—";
  return (
    <p className="font-mono text-[0.625rem] uppercase tracking-widest text-muted">
      Last probe: {label}
    </p>
  );
}
