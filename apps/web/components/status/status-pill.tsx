"use client";

import { cn } from "@/lib/utils";

export type BackendStatus = "live" | "degraded" | "offline" | "unknown";

interface StatusPillProps {
  status: BackendStatus;
  variant?: "pill" | "dot";
  className?: string;
}

const LABELS: Record<BackendStatus, string> = {
  live: "LIVE",
  degraded: "DEGRADED",
  offline: "OFFLINE",
  unknown: "BOOTING",
};

const DOT_COLORS: Record<BackendStatus, string> = {
  live: "bg-success shadow-[0_0_6px_hsl(var(--success))]",
  degraded: "bg-warning shadow-[0_0_6px_hsl(var(--warning))]",
  offline: "bg-danger shadow-[0_0_6px_hsl(var(--danger))]",
  unknown: "bg-muted",
};

const PILL_COLORS: Record<BackendStatus, string> = {
  live: "border-success/40 bg-success/10 text-success",
  degraded: "border-warning/40 bg-warning/10 text-warning",
  offline: "border-danger/40 bg-danger/10 text-danger",
  unknown: "border-border bg-surface-2 text-muted",
};

/**
 * Real probe-backed status indicator. Receives `status` from the Zustand
 * store in Task 11 — never hardcoded, per the universal red-flag list.
 * Shape + color together convey severity (shape is the dot; color is the
 * token) so the signal is not color-only.
 */
export function StatusPill({ status, variant = "pill", className }: StatusPillProps) {
  const label = LABELS[status];
  if (variant === "dot") {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <span
          aria-hidden="true"
          className={cn("inline-block h-2 w-2 rounded-full", DOT_COLORS[status])}
        />
        <span className="font-mono text-xs uppercase tracking-widest text-muted">
          {label}
        </span>
        <span className="sr-only">backend status: {label.toLowerCase()}</span>
      </span>
    );
  }
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2 rounded-sm border px-2 py-0.5 font-mono text-[0.625rem] font-bold uppercase tracking-widest",
        PILL_COLORS[status],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("inline-block h-1.5 w-1.5 rounded-full", DOT_COLORS[status])}
      />
      {label}
    </span>
  );
}
