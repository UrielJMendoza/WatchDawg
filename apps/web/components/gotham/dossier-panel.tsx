"use client";

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  YAxis,
} from "recharts";
import { ExternalLink } from "lucide-react";
import { NATIONS } from "@/lib/intel/theaters";
import { useNationPulse } from "@/lib/intel/client";
import type { IntelEvent, NationCode, NationMetric } from "@/lib/intel/types";
import { cn } from "@/lib/utils";

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="section-header border-b border-border bg-surface-2/40 px-3 py-2">
      {children}
    </div>
  );
}

function SourceBadge({ source }: { source: IntelEvent["source"] }) {
  const meta = {
    gdelt: { label: "GDELT · LIVE", cls: "border-primary/40 text-primary" },
    acled: { label: "ACLED · LIVE", cls: "border-danger/40 text-danger" },
    seed: { label: "REFERENCE", cls: "border-warning/40 text-warning" },
  }[source];
  return (
    <span
      className={cn(
        "rounded-sm border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

function EventDossier({ event }: { event: IntelEvent }) {
  return (
    <div className="animate-slide-in-right">
      <Header>SELECTED TRACK</Header>
      <div className="space-y-3 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-mono text-sm font-semibold leading-tight text-foreground">
            {event.name}
          </h2>
          <SourceBadge source={event.source} />
        </div>

        <div>
          <div className="section-header mb-1">THREAT INTENSITY</div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary via-warning to-danger transition-all"
              style={{ width: `${Math.max(5, event.severity * 100)}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 font-mono text-[10px] uppercase tracking-widest">
          <div>
            <dt className="text-muted-foreground">MENTIONS</dt>
            <dd className="text-foreground">{event.count}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">NATION</dt>
            <dd className="text-foreground">
              {event.nation ? NATIONS[event.nation].name : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">LAT</dt>
            <dd className="tabular-nums text-foreground">
              {event.lat.toFixed(3)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">LON</dt>
            <dd className="tabular-nums text-foreground">
              {event.lon.toFixed(3)}
            </dd>
          </div>
        </dl>

        {event.url && (
          <a
            href={event.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-primary hover:bg-primary/10"
          >
            OPEN SOURCE <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function ToneGauge({ tone }: { tone: number }) {
  // GDELT average tone ~[-10, +10]. Negative => hostile coverage.
  const clamped = Math.max(-10, Math.min(10, tone));
  const pct = ((clamped + 10) / 20) * 100;
  const color =
    clamped < -3 ? "bg-danger" : clamped < 1 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div className="section-header mb-1 flex justify-between">
        <span>MEDIA TONE</span>
        <span className="tabular-nums text-foreground">
          {clamped.toFixed(1)}
        </span>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-background">
        <div className="absolute left-1/2 top-1/2 h-2.5 w-px -translate-y-1/2 bg-border" />
        <div
          className={cn("absolute top-0 h-1.5 w-1.5 rounded-full", color)}
          style={{ left: `calc(${pct}% - 3px)` }}
        />
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-[8px] uppercase tracking-widest text-muted-foreground">
        <span>HOSTILE</span>
        <span>CALM</span>
      </div>
    </div>
  );
}

function NationDossier({ metric }: { metric: NationMetric }) {
  const cfg = NATIONS[metric.code];
  const { pulse, loading } = useNationPulse(metric.code);
  const data = (pulse?.volume ?? []).map((p) => ({
    t: p.t.slice(5, 10),
    v: p.v,
  }));

  return (
    <div className="animate-fade-in">
      <Header>NATION DOSSIER</Header>
      <div className="space-y-4 px-3 py-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-mono text-base font-bold tracking-wide text-foreground">
              {cfg.name}
            </h2>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {cfg.callsign} · {cfg.capital.name}
            </div>
          </div>
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-foreground">
            {metric.threat}
          </span>
        </div>

        <div>
          <div className="section-header mb-1 flex justify-between">
            <span>COVERAGE VOLUME · 14D</span>
            <span className="text-muted-foreground">
              {loading ? "SYNC…" : `${pulse?.volume.length ?? 0} PTS`}
            </span>
          </div>
          <div className="h-24 w-full">
            {data.length > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2AA8F2" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#2AA8F2" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={["dataMin", "dataMax"]} />
                  <Tooltip
                    contentStyle={{
                      background: "#121821",
                      border: "1px solid #262F3F",
                      borderRadius: 2,
                      fontFamily: "monospace",
                      fontSize: 10,
                    }}
                    labelStyle={{ color: "#646D7D" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#2AA8F2"
                    strokeWidth={1.5}
                    fill="url(#vol)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {loading ? "ACQUIRING TIMELINE…" : "NO TIMELINE — DEGRADED"}
              </div>
            )}
          </div>
        </div>

        <ToneGauge tone={pulse?.toneNow ?? 0} />

        <div className="rounded-sm border border-border bg-surface-2/40 px-2 py-1.5 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
          PRESSURE INDEX{" "}
          <span className="text-foreground">
            {(metric.score * 100).toFixed(0)}
          </span>{" "}
          / 100 · {metric.events} TRACKS
        </div>
      </div>
    </div>
  );
}

export function DossierPanel({
  event,
  nation,
}: {
  event: IntelEvent | null;
  nation: NationMetric | null;
}) {
  return (
    <aside className="flex h-full flex-col overflow-y-auto border-l border-border bg-surface">
      {event ? (
        <EventDossier event={event} />
      ) : nation ? (
        <NationDossier metric={nation} />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <div className="h-10 w-10 rounded-full border border-primary/30 animate-glow-pulse" />
          <div className="section-header">NO SELECTION</div>
          <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
            Select a nation from the watchlist or click a track on the map to
            open its dossier.
          </p>
        </div>
      )}
    </aside>
  );
}

export type { NationCode };
