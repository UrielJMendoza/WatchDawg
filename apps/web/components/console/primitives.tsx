"use client";

import { AlertTriangle, CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import type { Category, Credibility, Reliability, SourceStatus } from "@/lib/osint/types";
import { CATEGORIES, DOMAINS } from "@/lib/osint/taxonomy";
import { GRADE_TEXT } from "@/lib/console/format";
import { cn } from "@/lib/utils";

/** Admiralty grade badge, e.g. "B2", with the plain-language meaning on hover. */
export function GradeBadge({ reliability, credibility, className }: { reliability: Reliability; credibility: Credibility; className?: string }) {
  const strong = (reliability === "A" || reliability === "B") && credibility <= 2;
  return (
    <span
      title={`Source: ${GRADE_TEXT[reliability]} · Information: ${GRADE_TEXT[String(credibility)]}`}
      className={cn(
        "inline-flex h-[18px] items-center rounded-sm border px-1 font-mono text-[10px] font-semibold tracking-wider",
        strong ? "border-foreground/40 text-foreground" : "border-border text-muted-foreground",
        className,
      )}
    >
      {reliability}
      {credibility}
    </span>
  );
}

/** Category code chip with its domain colour as a leading swatch (never colour alone). */
export function CategoryTag({ category, className }: { category: Category; className?: string }) {
  const c = CATEGORIES[category];
  return (
    <span className={cn("chip gap-1.5", className)} title={c.blurb}>
      <span className="h-2 w-2 rounded-[2px]" style={{ background: DOMAINS[c.domain].color }} aria-hidden />
      {c.label}
    </span>
  );
}

export function DomainSwatch({ color, className }: { color: string; className?: string }) {
  return <span className={cn("inline-block h-2.5 w-2.5 shrink-0 rounded-[2px]", className)} style={{ background: color }} aria-hidden />;
}

/** Thin horizontal meter, 0..1, in ink tones. */
export function Meter({ value, label, className }: { value: number; label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)} role="meter" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-foreground/80" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
      <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">{Math.round(value * 100)}</span>
    </div>
  );
}

const STATUS: Record<SourceStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  ok: { label: "Live", cls: "text-good", Icon: CheckCircle2 },
  degraded: { label: "Degraded", cls: "text-warning", Icon: AlertTriangle },
  offline: { label: "Offline", cls: "text-critical", Icon: XCircle },
  disabled: { label: "Not configured", cls: "text-muted-foreground", Icon: CircleSlash },
};

/** Status is always icon + label, never colour alone. */
export function StatusLabel({ status, className }: { status: SourceStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider", s.cls, className)}>
      <s.Icon className="h-3 w-3" aria-hidden />
      {s.label}
    </span>
  );
}

/** Single-series sparkline in ink; the last point is marked. */
export function Sparkline({ values, width = 72, height = 18, className, label }: { values: number[]; width?: number; height?: number; className?: string; label: string }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => [i * step, height - 1 - (v / max) * (height - 3)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible text-foreground/70", className)} role="img" aria-label={label}>
      <title>{label}</title>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={1.8} fill="currentColor" />
    </svg>
  );
}

export function SectionTitle({ children, right, className }: { children: React.ReactNode; right?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-center justify-between gap-2", className)}>
      <h3 className="section-header">{children}</h3>
      {right}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint, swatch }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; hint?: React.ReactNode; swatch?: string }) {
  return (
    <label className="group flex cursor-pointer select-none items-center gap-2 rounded-sm px-1.5 py-1 hover:bg-surface-2/60">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        className={cn(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-primary",
          checked ? "border-foreground/70 bg-foreground/90" : "border-border bg-transparent",
        )}
        aria-hidden
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-background">
            <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {swatch && <DomainSwatch color={swatch} />}
      <span className={cn("flex-1 text-xs", checked ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      {hint !== undefined && <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label, className }: { value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-sm border border-border bg-surface-2/60 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-[3px] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition-colors",
            value === o.value ? "bg-foreground/90 text-background" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
