"use client";

import { X } from "lucide-react";

export const SHORTCUTS: Array<[string[], string]> = [
  [["⌘", "K"], "Search places, incidents, actors"],
  [["/"], "Search"],
  [["1", "–", "5"], "Time window: 1h · 6h · 24h · 7d · 30d"],
  [["F"], "Filters panel"],
  [["H"], "Hotspots & country links"],
  [["S"], "Statistics"],
  [["D"], "Data sources & validation"],
  [["B"], "Toggle satellite imagery"],
  [["T"], "Toggle live aircraft & satellites"],
  [["R"], "Reset the globe view"],
  [["Esc"], "Close / clear selection"],
  [["?"], "This help"],
];

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="panel panel-solid brackets relative w-full max-w-md rounded-md p-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="section-header">
            Keyboard shortcuts
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label} className="contents">
              <dt className="flex gap-1">
                {keys.map((k, i) => (k === "–" ? <span key={i} className="text-muted-foreground">–</span> : <kbd key={i} className="kbd h-5 min-w-5 text-[10px]">{k}</kbd>))}
              </dt>
              <dd className="text-foreground/85">{label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
