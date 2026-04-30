"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

type HealthStatus = "live" | "degraded" | "offline" | "unknown";

interface TopbarProps {
  email?: string | null;
}

export function Topbar({ email }: TopbarProps) {
  const router = useRouter();
  const [status, setStatus] = useState<HealthStatus>("unknown");
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    async function ping() {
      try {
        const t0 = performance.now();
        const res = await api.health();
        const t1 = performance.now();
        if (!mounted) return;
        setStatus(res.status === "ok" ? "live" : "degraded");
        setLatency(Math.round(t1 - t0));
      } catch (err) {
        if (!mounted) return;
        setStatus("offline");
        setLatency(null);
        if (!(err instanceof ApiError)) {
          // Network errors land here.
          console.warn("[WATCHDAWG] /health unreachable", err);
        }
      }
    }

    ping();
    const id = setInterval(ping, 30_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const statusMeta: Record<HealthStatus, { label: string; color: string }> = {
    live: { label: "LIVE", color: "bg-success" },
    degraded: { label: "DEGRADED", color: "bg-warning" },
    offline: { label: "OFFLINE", color: "bg-danger" },
    unknown: { label: "···", color: "bg-muted" },
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-surface px-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm font-semibold tracking-widest text-foreground">
          WATCHDAWG
        </span>
        <span className="h-4 w-px bg-primary" aria-hidden />
        <span className="section-header">
          MARITIME OSINT // RED SEA — HORN OF AFRICA
        </span>
      </div>

      <div className="flex items-center gap-3">
        {email ? (
          <>
            <div
              className="flex items-center gap-2 rounded-sm border border-border px-2 py-1"
              aria-live="polite"
            >
              <span
                className={`h-2 w-2 rounded-full ${statusMeta[status].color}`}
                aria-hidden
              />
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {statusMeta[status].label}
                {latency !== null ? (
                  <span className="ml-1 text-muted-foreground/80">
                    {latency}ms
                  </span>
                ) : null}
              </span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {email}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              aria-label="Sign out"
            >
              <LogOut />
            </Button>
          </>
        ) : (
          <span className="rounded-sm border border-warning/40 bg-warning/10 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-warning">
            NOT AUTHENTICATED
          </span>
        )}
      </div>
    </header>
  );
}
