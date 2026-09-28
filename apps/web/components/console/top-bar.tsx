"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import type { SourceHealth, WindowKey } from "@/lib/osint/types";
import { ago, utcClock } from "@/lib/console/format";
import { cn } from "@/lib/utils";
import { Segmented } from "./primitives";

interface Props {
  window: WindowKey;
  onWindow: (w: WindowKey) => void;
  onSearch: () => void;
  query: string;
  sources: SourceHealth[];
  generatedAt: number | null;
  now: number;
  loading: boolean;
}

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.2" />
      <path d="M16 3v5M16 24v5M3 16h5M24 16h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M16 16 25 7" stroke="hsl(var(--primary))" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2" fill="hsl(var(--primary))" />
    </svg>
  );
}

export function TopBar(p: Props) {
  const live = p.sources.filter((s) => s.status === "ok").length;
  const configured = p.sources.filter((s) => s.status !== "disabled").length;
  const worst = p.sources.some((s) => s.status === "offline") ? "offline" : p.sources.some((s) => s.status === "degraded") ? "degraded" : "ok";
  const allDown = p.sources.length > 0 && live === 0 && !p.sources.some((s) => s.status === "degraded");
  return (
    <header className="relative z-40 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface/85 px-3 backdrop-blur-md md:px-4">
      <Link href="/" className="flex shrink-0 items-center gap-2.5 text-foreground" aria-label="WatchDawg home">
        <Logo className="h-7 w-7" />
        <span className="flex flex-col leading-none">
          <span className="hidden font-mono text-[13px] font-bold tracking-[0.28em] min-[420px]:inline">WATCHDAWG</span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:block">Global situational awareness</span>
        </span>
      </Link>

      <button
        type="button"
        onClick={p.onSearch}
        className="group mx-auto flex h-8 w-full min-w-0 max-w-[520px] items-center gap-2 rounded-sm border border-border bg-background/60 px-2.5 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30"
        aria-label="Search places, incidents and actors"
      >
        <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className={cn("flex-1 truncate", p.query && "font-mono text-primary")}>
          {p.query || (
            <>
              <span className="sm:hidden">Search…</span>
              <span className="hidden sm:inline">Search places, incidents, actors, or filter…</span>
            </>
          )}
        </span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <kbd className="kbd">⌘</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>

      <Segmented
        className="hidden lg:inline-flex"
        label="Time window"
        value={p.window}
        onChange={p.onWindow}
        options={(["1h", "6h", "24h", "7d", "30d"] as WindowKey[]).map((w) => ({ value: w, label: w }))}
      />

      <div className="hidden items-center gap-3 md:flex">
        <div className="flex flex-col items-end leading-tight" title={p.sources.map((s) => `${s.name}: ${s.status}`).join("\n")}>
          <span
            className={cn(
              "flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-widest",
              allDown ? "text-critical" : worst === "ok" ? "text-good" : "text-warning",
            )}
          >
            <span className="relative flex h-1.5 w-1.5">
              {!allDown && <span className="animate-blip absolute inline-flex h-full w-full rounded-full bg-current" />}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-current" />
            </span>
            {allDown ? "Uplink down" : "Live"}
            <span className="text-muted-foreground">
              {live}/{configured}
            </span>
          </span>
          <span className="font-mono text-[9px] text-muted-foreground">
            {p.loading ? "refreshing…" : p.generatedAt && p.now ? `updated ${ago(p.generatedAt, p.now)}` : "connecting…"}
          </span>
        </div>
        <div className="border-l border-border pl-3 font-mono text-[11px] tabular-nums text-foreground/90" aria-label="UTC time">
          {p.now ? utcClock(p.now) : "--:--:--"}
          <span className="ml-1 text-[9px] text-muted-foreground">UTC</span>
        </div>
      </div>
    </header>
  );
}
