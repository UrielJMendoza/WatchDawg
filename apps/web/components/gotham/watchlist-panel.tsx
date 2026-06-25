"use client";

import { NATIONS } from "@/lib/intel/theaters";
import type { NationMetric, ThreatLevel } from "@/lib/intel/types";
import type { MapLayers } from "./intel-map";
import { cn } from "@/lib/utils";

const THREAT_COLOR: Record<ThreatLevel, string> = {
  low: "bg-muted-foreground",
  guarded: "bg-success",
  elevated: "bg-primary",
  high: "bg-warning",
  severe: "bg-danger",
  critical: "bg-danger",
};
const THREAT_TEXT: Record<ThreatLevel, string> = {
  low: "text-muted-foreground",
  guarded: "text-success",
  elevated: "text-primary",
  high: "text-warning",
  severe: "text-danger",
  critical: "text-danger",
};

const LAYER_KEYS: Array<{ key: keyof MapLayers; label: string }> = [
  { key: "events", label: "HOTSPOTS" },
  { key: "heat", label: "HEAT DENSITY" },
  { key: "arcs", label: "TENSION ARCS" },
  { key: "borders", label: "NATION GLOW" },
  { key: "labels", label: "LABELS" },
];

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="section-header border-y border-border bg-surface-2/40 px-3 py-2">
      {children}
    </div>
  );
}

export function WatchlistPanel({
  nations,
  layers,
  onToggleLayer,
  selectedNation,
  onSelectNation,
}: {
  nations: NationMetric[];
  layers: MapLayers;
  onToggleLayer: (k: keyof MapLayers) => void;
  selectedNation: NationMetric["code"] | null;
  onSelectNation: (code: NationMetric["code"]) => void;
}) {
  return (
    <nav className="flex h-full flex-col border-r border-border bg-surface">
      <div className="flex-1 overflow-y-auto">
        <Header>NATION WATCHLIST</Header>
        <div className="divide-y divide-border/60">
          {nations.map((n) => {
            const cfg = NATIONS[n.code];
            const active = selectedNation === n.code;
            return (
              <button
                key={n.code}
                type="button"
                onClick={() => onSelectNation(n.code)}
                className={cn(
                  "block w-full px-3 py-2.5 text-left transition-colors hover:bg-surface-2",
                  active && "bg-surface-2",
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-xs font-semibold tracking-wide text-foreground">
                    {cfg.name}
                  </span>
                  <span
                    className={cn(
                      "font-mono text-[9px] uppercase tracking-widest",
                      THREAT_TEXT[n.threat],
                      n.threat === "critical" && "animate-pulse",
                    )}
                  >
                    {n.threat}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between">
                  <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                    {cfg.callsign} · {n.events} EVT
                  </span>
                </div>
                <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-background">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      THREAT_COLOR[n.threat],
                    )}
                    style={{ width: `${Math.max(4, n.score * 100)}%` }}
                  />
                </div>
              </button>
            );
          })}
          {nations.length === 0 && (
            <div className="px-3 py-4 font-mono text-[10px] text-muted-foreground">
              — ACQUIRING TRACKS —
            </div>
          )}
        </div>

        <Header>MAP LAYERS</Header>
        <div className="px-3 py-2">
          {LAYER_KEYS.map(({ key, label }) => {
            const on = layers[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleLayer(key)}
                className="flex w-full items-center gap-2 py-1 text-left"
              >
                <span
                  className={cn(
                    "flex h-3 w-3 items-center justify-center rounded-[2px] border",
                    on
                      ? "border-primary bg-primary/80"
                      : "border-border bg-transparent",
                  )}
                >
                  {on && <span className="h-1 w-1 rounded-[1px] bg-background" />}
                </span>
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-widest",
                    on ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-border bg-surface-2 px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
        OSINT // UNCLASSIFIED
      </div>
    </nav>
  );
}
