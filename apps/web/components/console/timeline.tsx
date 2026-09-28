"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { Timeline as TimelineData } from "@/lib/osint/types";
import { DOMAINS, DOMAIN_ORDER } from "@/lib/osint/taxonomy";
import { binLabel } from "@/lib/console/format";
import { DomainSwatch } from "./primitives";

/**
 * Stacked activity histogram: signals per time bin, split by domain. Thin
 * columns with a surface gap between stacked segments, rounded tops, a
 * recessive baseline and a per-column hover readout. Drag across it (or
 * click a column) to filter the globe to that time range.
 */
export function Timeline({
  data,
  now,
  range,
  onRange,
}: {
  data: TimelineData | undefined;
  now: number;
  range: [number, number] | null;
  onRange: (r: [number, number] | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
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
  const span = data.binMs * data.bins;
  const nowX = ((now - data.start) / span) * W;
  const hc = hover !== null ? cols[hover] : null;

  const indexAt = (clientX: number) => {
    const r = wrap.current!.getBoundingClientRect();
    return Math.max(0, Math.min(data.bins - 1, Math.floor(((clientX - r.left) / r.width) * data.bins)));
  };
  const commit = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    onRange([data.start + lo * data.binMs, data.start + (hi + 1) * data.binMs]);
  };

  // Selection band, in bin units: live drag first, else the applied range.
  const band = drag
    ? { lo: Math.min(drag.a, drag.b), hi: Math.max(drag.a, drag.b) + 1 }
    : range
      ? { lo: (range[0] - data.start) / data.binMs, hi: (range[1] - data.start) / data.binMs }
      : null;

  return (
    <div className="flex h-full min-w-0 flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <span className="section-header flex items-center gap-2">
          Signal activity
          {range ? (
            <button
              type="button"
              onClick={() => onRange(null)}
              className="chip border-primary/40 normal-case tracking-normal text-primary hover:bg-primary/10"
              aria-label="Clear time range"
            >
              {binLabel(range[0], data.binMs)} → {binLabel(range[1], data.binMs)}
              <X className="h-3 w-3" />
            </button>
          ) : (
            <span className="hidden normal-case tracking-normal text-muted-foreground/70 xl:inline">drag to filter time</span>
          )}
        </span>
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
      <div
        ref={wrap}
        className="relative min-h-0 flex-1 cursor-crosshair touch-none select-none"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const i = indexAt(e.clientX);
          setDrag({ a: i, b: i });
        }}
        onPointerMove={(e) => {
          const i = indexAt(e.clientX);
          setHover(i);
          if (drag) setDrag({ ...drag, b: i });
        }}
        onPointerUp={() => {
          if (drag) commit(drag.a, drag.b);
          setDrag(null);
        }}
        onPointerLeave={() => {
          if (!drag) setHover(null);
        }}
        role="slider"
        aria-label="Time range filter"
        aria-valuemin={data.start}
        aria-valuemax={data.start + span}
        aria-valuenow={range?.[0] ?? data.start}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Escape") onRange(null);
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="pointer-events-none h-full w-full"
          role="img"
          aria-label={`Signals per ${Math.round(data.binMs / 60000)}-minute bin across the window, by domain`}
        >
          {band && (
            <rect x={band.lo * bw} y={0} width={Math.max(bw, (band.hi - band.lo) * bw)} height={H} fill="hsl(var(--primary))" fillOpacity={0.1} />
          )}
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="hsl(var(--border))" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {cols.map((c) => {
            let y = H - 1;
            const x = c.i * bw + gap / 2;
            const w = Math.max(1, bw - gap);
            const visible = c.parts.filter((p) => p.v > 0);
            const inBand = !band || (c.i >= Math.floor(band.lo) && c.i < Math.ceil(band.hi));
            return (
              <g key={c.i} opacity={hover === c.i ? 1 : inBand ? (hover === null ? 1 : 0.6) : 0.25}>
                {visible.map((p, k) => {
                  const h = Math.max(1.5, (p.v / max) * (H - 6));
                  y -= h;
                  const top = k === visible.length - 1;
                  const rect = (
                    <rect key={p.d} x={x} y={y} width={w} height={h - (top ? 0 : 1)} rx={top ? Math.min(2, w / 2) : 0} fill={DOMAINS[p.d].color} />
                  );
                  y -= 1;
                  return rect;
                })}
              </g>
            );
          })}
          {nowX > 0 && nowX <= W && (
            <line x1={nowX} x2={nowX} y1={0} y2={H} stroke="hsl(var(--primary))" strokeOpacity={0.6} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {hc && !drag && (
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
