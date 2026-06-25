"use client";

import { ALL_THEATERS, THEATERS } from "@/lib/intel/theaters";
import type { Theater } from "@/lib/intel/types";
import { cn } from "@/lib/utils";

export function TheaterSwitcher({
  theater,
  onChange,
}: {
  theater: Theater;
  onChange: (t: Theater) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-sm border border-border bg-surface-2 p-0.5">
      {ALL_THEATERS.map((t) => {
        const active = t === theater;
        return (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={cn(
              "rounded-[2px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
              active
                ? "bg-primary text-primary-foreground shadow-glow-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {THEATERS[t].name}
          </button>
        );
      })}
    </div>
  );
}
