"use client";

import { useMemo, useRef, useState } from "react";
import type { Timeline as TimelineData } from "@/lib/osint/types";
import { DOMAINS, DOMAIN_ORDER } from "@/lib/osint/taxonomy";
import { binLabel } from "@/lib/console/format";
import { DomainSwatch } from "./primitives";

/**
 * Stacked activity histogram: signals per time bin, split by domain. Thin
 * columns with a 2px surface gap between stacked segments, rounded tops, a
 * recessive baseline and a per-column hover readout.
 */
export function Timeline({ data, now }: { data: TimelineData | undefined; now: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 56;

  const cols = useMemo(() => {
    if (!data) return [];
    return Array.from({ length: data.bins }, (_, i) => {
      const parts = DOMAIN_ORDER.map((d) => ({ d, v: data.series[d][i] ?? 0 }));
      return { i, parts, total: parts.reduce((s, p) => s + p.v, 0), start: data.start + i * data.binMs };
    });
  }, [data]);

  const max = Math.max(1, ...cols.map((c) => c.total));
  const totals = useMemo(
    () => Object.fromEntries(DOMAIN_ORDER.map((d) => [d, data ? data.series[d].reduce((a, b) => a + b, 0) : 0])),
    [data],
  );

  if (!data) return <div className="h-full animate-pulse rounded-sm bg-surface-2/40" />;

  const bw = W / data.bins;
  const gap = Math.min(3, bw * 0.25);
  const nowX = ((now - data.start) / (data.binMs * data.bins)) * W;
  const hc = hover !== null ? cols[hover] : null;

  return (
    <div className="flex h-full min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="section-header">Signal activity</span>
        <div className="flex items-center gap-3" aria-label="Legend">
          {DOMAIN_ORDER.map((d) => (
            <span key={d} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <DomainSwatch color={DOMAINS[d].color} />
              <span className="hidden md:inline">{DOMAINS[d].label}</span>
              <span className="font-mono tabular-nums text-foreground/80">{totals[d]}</span>
            </span>
          ))}
        </div>
      </div>
      <div ref={wrap} className="relative min-h-0 flex-1" onMouseLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-full w-full"
          role="img"
          aria-label={`Signals per ${Math.round(data.binMs / 60000)}-minute bin across the window, by domain`}
        >
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="hsl(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {cols.map((c) => {
            let y = H - 1;
            const x = c.i * bw + gap / 2;
            const w = Math.max(1, bw - gap);
            const visible = c.parts.filter((p) => p.v > 0);
            return (
              <g key={c.i} opacity={hover === null || hover === c.i ? 1 : 0.45}>
                {visible.map((p, k) => {
                  const h = Math.max(1.5, (p.v / max) * (H - 6));
                  y -= h;
                  const top = k === visible.length - 1;
                  const rect = (
                    <rect key={p.d} x={x} y={y} width={w} height={h - (top ? 0 : 1)} rx={top ? Math.min(2, w / 2) : 0} fill={DOMAINS[p.d].color} />
                  );
                  y -= 1; // 2px-equivalent surface gap between stacked segments
                  return rect;
                })}
              </g>
            );
          })}
          {nowX > 0 && nowX <= W && (
            <line x1={nowX} x2={nowX} y1={0} y2={H} stroke="hsl(var(--primary))" strokeOpacity={0.6} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {/* Oversized invisible hit targets per column. */}
        <div className="absolute inset-0 flex">
          {cols.map((c) => (
            <div key={c.i} className="h-full flex-1" onMouseEnter={() => setHover(c.i)} />
          ))}
        </div>
        {hc && (
          <div
            className="panel pointer-events-none absolute bottom-full z-20 mb-1 min-w-[150px] rounded-sm px-2 py-1.5"
            style={{ left: `clamp(0px, calc(${((hc.i + 0.5) / data.bins) * 100}% - 75px), calc(100% - 150px))` }}
          >
            <div className="font-mono text-[10px] text-muted-foreground">{binLabel(hc.start, data.binMs)}</div>
            {DOMAIN_ORDER.map((d) => (
              <div key={d} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <DomainSwatch color={DOMAINS[d].color} />
                  {DOMAINS[d].label}
                </span>
                <span className="font-mono tabular-nums text-foreground">{hc.parts.find((p) => p.d === d)?.v ?? 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
        <span>{binLabel(data.start, data.binMs)}</span>
        <span>now</span>
      </div>
    </div>
  );
}
