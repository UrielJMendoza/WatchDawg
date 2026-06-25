"use client";

import { useEffect, useState } from "react";
import type { SourceStatus } from "@/lib/intel/types";

function Corner({ pos }: { pos: string }) {
  return (
    <div
      className={`pointer-events-none absolute h-8 w-8 border-primary/50 ${pos}`}
    />
  );
}

/** Non-interactive sci-fi overlay drawn on top of the map. */
export function HudOverlay({
  theaterLabel,
  status,
  events,
  degraded,
}: {
  theaterLabel: string;
  status: SourceStatus;
  events: number;
  degraded: boolean;
}) {
  const [clock, setClock] = useState("--:--:--");

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toISOString().slice(11, 19) + "Z");
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {/* Scanline + reticle ambience */}
      <div className="scanlines absolute inset-0 opacity-20" />
      <div className="absolute left-1/2 top-1/2 h-px w-16 -translate-x-1/2 -translate-y-1/2 bg-primary/20" />
      <div className="absolute left-1/2 top-1/2 h-16 w-px -translate-x-1/2 -translate-y-1/2 bg-primary/20" />
      <div className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/20 animate-glow-pulse" />

      {/* Framing brackets */}
      <Corner pos="left-3 top-3 border-l-2 border-t-2" />
      <Corner pos="right-3 top-3 border-r-2 border-t-2" />
      <Corner pos="bottom-3 left-3 border-b-2 border-l-2" />
      <Corner pos="bottom-3 right-3 border-b-2 border-r-2" />

      {/* Top-left readout */}
      <div className="absolute left-6 top-6 font-mono text-[10px] uppercase tracking-widest text-primary/80">
        <div className="text-foreground">{theaterLabel}</div>
        <div className="mt-1 flex items-center gap-2 text-muted-foreground">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              status === "ok"
                ? "bg-success"
                : status === "degraded"
                  ? "bg-warning animate-pulse"
                  : "bg-danger animate-pulse"
            }`}
          />
          UPLINK {status.toUpperCase()} · {events} TRACKS
        </div>
      </div>

      {/* Top-right clock */}
      <div className="absolute right-6 top-6 text-right font-mono text-[10px] uppercase tracking-widest">
        <div className="text-2xl font-bold tabular-nums tracking-tight text-foreground">
          {clock}
        </div>
        <div className="text-muted-foreground">SYSTEM TIME · UTC</div>
      </div>

      {/* Degraded banner */}
      {degraded && (
        <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-sm border border-warning/50 bg-warning/10 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-warning animate-flicker">
          ⚠ UPLINK DEGRADED — REFERENCE PICTURE
        </div>
      )}

      {/* Bottom-left provenance */}
      <div className="absolute bottom-6 left-6 font-mono text-[9px] uppercase tracking-widest text-muted-foreground/70">
        SRC: GDELT 2.0 · RELIEFWEB · ACLED(OPT) — ARCS: DERIVED
      </div>
    </div>
  );
}
