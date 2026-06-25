"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

function Section({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-b border-border">
      <div className="section-header border-b border-border px-3 py-2">
        {title}
      </div>
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {children ?? <span className="font-mono">— EMPTY —</span>}
      </div>
    </div>
  );
}

export function LeftNav() {
  const [healthy, setHealthy] = useState<boolean | null>(null);
  const [lastCheck, setLastCheck] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function tick() {
      try {
        const res = await api.health();
        if (!mounted) return;
        setHealthy(res.status === "ok");
        setLastCheck(new Date().toISOString().slice(0, 16).replace("T", " "));
      } catch {
        if (!mounted) return;
        setHealthy(false);
        setLastCheck(new Date().toISOString().slice(0, 16).replace("T", " "));
      }
    }
    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return (
    <nav
      aria-label="Primary"
      className="flex h-full flex-col border-r border-border bg-surface"
    >
      <div className="flex-1 overflow-y-auto">
        <Section title="FEEDS" />
        <Section title="FILTERS" />
        <Section title="ENTITIES" />
        <Section title="SAVED VIEWS" />
      </div>

      <div className="border-t border-border bg-surface-2 p-3">
        <div className="section-header mb-2">SYSTEM</div>
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              healthy === null
                ? "bg-muted"
                : healthy
                  ? "bg-success"
                  : "bg-danger"
            }`}
            aria-hidden
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-foreground">
            {healthy === null ? "···" : healthy ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <div className="mt-2 font-mono text-[10px] text-muted-foreground">
          LAST CHECK
          <div className="text-foreground">{lastCheck ?? "—"}Z</div>
        </div>
      </div>
    </nav>
  );
}
