"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, BellRing, X } from "lucide-react";
import type { Watchlist } from "@/lib/console/watchlist";
import { ALERT_MIN_SEVERITY } from "@/lib/console/watchlist";
import { ago } from "@/lib/console/format";
import { cn } from "@/lib/utils";

/** Alert tray: watched countries and the new incidents they produced. */
export function AlertsButton({
  watch,
  countryName,
  now,
  onOpenIncident,
}: {
  watch: Watchlist;
  countryName: (iso2: string) => string | undefined;
  now: number;
  onOpenIncident: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  const Icon = watch.unread ? BellRing : Bell;
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (!open && watch.unread) watch.markAllRead();
        }}
        aria-label={watch.unread ? `${watch.unread} new alerts` : "Alerts and watchlist"}
        aria-expanded={open}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-sm border border-border text-muted-foreground transition-colors hover:text-foreground",
          watch.unread > 0 && "border-critical/50 text-critical",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
        {watch.unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-critical px-1 font-mono text-[9px] font-semibold leading-4 text-white">
            {watch.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="panel panel-solid absolute right-0 top-10 z-50 w-[340px] overflow-hidden rounded-md">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="section-header">Watchlist alerts</span>
            {watch.alerts.length > 0 && (
              <button type="button" onClick={watch.clear} className="text-[10px] text-muted-foreground hover:text-foreground">
                Clear
              </button>
            )}
          </div>
          <div className="border-b border-border px-3 py-2">
            {watch.countries.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Open any country (click it on the globe or search for it) and press <span className="text-foreground">Watch</span>. New
                incidents there with severity ≥ {Math.round(ALERT_MIN_SEVERITY * 100)} will appear here.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {watch.countries.map((c) => (
                  <span key={c} className="chip gap-1 normal-case tracking-normal text-foreground">
                    {countryName(c) ?? c}
                    <button type="button" aria-label={`Stop watching ${countryName(c) ?? c}`} onClick={() => watch.toggle(c)}>
                      <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {watch.permission === "default" && watch.countries.length > 0 && (
              <button type="button" onClick={watch.requestPermission} className="mt-2 text-[11px] text-primary hover:underline">
                Enable desktop notifications
              </button>
            )}
          </div>
          <ul className="max-h-[50vh] overflow-y-auto p-1">
            {watch.alerts.length === 0 ? (
              <li className="px-2 py-6 text-center text-xs text-muted-foreground">No alerts yet.</li>
            ) : (
              watch.alerts.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenIncident(a.incidentId);
                      setOpen(false);
                    }}
                    className="w-full rounded-sm px-2 py-1.5 text-left hover:bg-surface-2/60"
                  >
                    <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      <span>{countryName(a.country) ?? a.country}</span>
                      <span>· {ago(a.at, now || Date.now())}</span>
                      <span className="ml-auto">
                        sev {Math.round(a.severity * 100)} · {a.grade}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs leading-snug">{a.title}</div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
