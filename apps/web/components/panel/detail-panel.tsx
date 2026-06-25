/**
 * Right-pane detail panel. Phase 1: empty state only — content lands in
 * Phase 3 alongside the event/cluster/entity selection store.
 */
export function DetailPanel() {
  return (
    <aside
      aria-label="Detail panel"
      className="flex h-full flex-col border-l border-border bg-surface"
    >
      <div className="section-header border-b border-border px-3 py-2">
        DETAIL
      </div>
      <div className="flex flex-1 items-center justify-center px-4 text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          NO SELECTION
        </span>
      </div>
    </aside>
  );
}
