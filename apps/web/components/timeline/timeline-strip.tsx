/**
 * Bottom 32px placeholder strip. Phase 3 turns this into a real uPlot
 * scrubber driven by /events counts.
 */
export function TimelineStrip() {
  return (
    <div className="flex h-8 w-full items-center justify-center border-t border-border bg-surface-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        TIMELINE — AWAITING DATA
      </span>
    </div>
  );
}
