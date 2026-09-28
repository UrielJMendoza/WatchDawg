"use client";

import { useMemo } from "react";
import { ArrowDownRight, ArrowUpRight, ExternalLink, Minus, RotateCcw, X } from "lucide-react";
import type { Category, Domain, Hotspot, Incident, SourceHealth, SourceId } from "@/lib/osint/types";
import type { FeedHealth } from "@/lib/osint/tracks/types";
import { CATEGORIES, CATEGORY_ORDER, DOMAINS, DOMAIN_ORDER, domainOf } from "@/lib/osint/taxonomy";
import type { FilterState, LayerState, Selection } from "@/lib/console/state";
import { DEFAULT_FILTERS, activeFilterCount, fatalitiesOf } from "@/lib/console/state";
import { ago, compact, pct, SOURCE_LABEL } from "@/lib/console/format";
import type { Basemap } from "@/lib/map/style";
import { cn } from "@/lib/utils";
import { DomainSwatch, SectionTitle, Segmented, Sparkline, StatusLabel, Toggle } from "./primitives";

export type RailTab = "filters" | "hotspots" | "stats" | "sources";

interface Props {
  tab: RailTab;
  onTab: (t: RailTab) => void;
  all: Incident[];
  visible: Incident[];
  hotspots: Hotspot[];
  sources: SourceHealth[];
  /** Health of the tracks feeds (aircraft, satellites). */
  feeds: FeedHealth[];
  filters: FilterState;
  onFilters: (f: FilterState) => void;
  layers: LayerState;
  onLayers: (l: LayerState) => void;
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  countryName: (iso2: string | undefined) => string | undefined;
  now: number;
}

const TABS: Array<{ id: RailTab; label: string }> = [
  { id: "filters", label: "Filters" },
  { id: "hotspots", label: "Hotspots" },
  { id: "stats", label: "Stats" },
  { id: "sources", label: "Sources" },
];

export function LeftRail(p: Props) {
  const nFilters = activeFilterCount(p.filters);
  const degraded = p.sources.filter((s) => s.status === "degraded" || s.status === "offline").length;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label="Console panels" className="grid grid-cols-4 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={p.tab === t.id}
            onClick={() => p.onTab(t.id)}
            className={cn(
              "relative py-2.5 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors",
              p.tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
            {t.id === "filters" && nFilters > 0 && <span className="ml-1 text-primary">{nFilters}</span>}
            {t.id === "sources" && degraded > 0 && <span className="ml-1 text-warning">!</span>}
            {p.tab === t.id && <span className="absolute inset-x-3 bottom-0 h-px bg-primary" />}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" role="tabpanel">
        {p.tab === "filters" && <FiltersTab {...p} />}
        {p.tab === "hotspots" && <HotspotsTab {...p} />}
        {p.tab === "stats" && <StatsTab {...p} />}
        {p.tab === "sources" && <SourcesTab {...p} />}
      </div>
    </div>
  );
}

// ─── Filters ──────────────────────────────────────────────────────────────

function FiltersTab({ all, visible, filters: f, onFilters, layers, onLayers, basemap, onBasemap, countryName }: Props) {
  const counts = useMemo(() => {
    const byCat = new Map<Category, number>();
    const byDomain = new Map<Domain, number>();
    const bySource = new Map<SourceId, number>();
    for (const i of all) {
      byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);
      byDomain.set(domainOf(i.category), (byDomain.get(domainOf(i.category)) ?? 0) + 1);
      for (const s of i.sources) bySource.set(s, (bySource.get(s) ?? 0) + 1);
    }
    return { byCat, byDomain, bySource };
  }, [all]);

  const set = (patch: Partial<FilterState>) => onFilters({ ...f, ...patch });
  const toggleCat = (c: Category) =>
    set({ hiddenCategories: f.hiddenCategories.includes(c) ? f.hiddenCategories.filter((x) => x !== c) : [...f.hiddenCategories, c] });
  const toggleSource = (s: SourceId) =>
    set({ hiddenSources: f.hiddenSources.includes(s) ? f.hiddenSources.filter((x) => x !== s) : [...f.hiddenSources, s] });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">
          <span className="text-foreground">{visible.length.toLocaleString()}</span> of {all.length.toLocaleString()} incidents shown
        </span>
        {activeFilterCount(f) > 0 && (
          <button type="button" onClick={() => onFilters(DEFAULT_FILTERS)} className="chip hover:text-foreground">
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      {f.country && (
        <div className="flex items-center justify-between rounded-sm border border-primary/40 bg-primary/5 px-2 py-1.5 text-xs">
          <span>
            Country: <span className="font-medium">{countryName(f.country) ?? f.country}</span>
          </span>
          <button type="button" aria-label="Clear country filter" onClick={() => set({ country: null })} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <section className="space-y-1.5">
        <SectionTitle>Event types</SectionTitle>
        {DOMAIN_ORDER.map((d) => (
          <div key={d}>
            <Toggle
              checked={f.domains[d]}
              onChange={(v) => set({ domains: { ...f.domains, [d]: v } })}
              label={<span className="font-medium">{DOMAINS[d].label}</span>}
              swatch={DOMAINS[d].color}
              hint={counts.byDomain.get(d) ?? 0}
            />
            {f.domains[d] && (
              <div className="ml-5 flex flex-wrap gap-1 pb-1 pt-0.5">
                {CATEGORY_ORDER.filter((c) => CATEGORIES[c].domain === d).map((c) => {
                  const on = !f.hiddenCategories.includes(c);
                  const n = counts.byCat.get(c) ?? 0;
                  return (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleCat(c)}
                      className={cn(
                        "rounded-sm border px-1.5 py-0.5 text-[10px] transition-colors",
                        on ? "border-foreground/25 text-foreground" : "border-border text-muted-foreground/60 line-through",
                      )}
                    >
                      {CATEGORIES[c].label} <span className="font-mono text-muted-foreground">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <SectionTitle>Thresholds</SectionTitle>
        <RangeRow label="Min severity" value={f.minSeverity} onChange={(v) => set({ minSeverity: v })} />
        <RangeRow label="Min confidence" value={f.minConfidence} onChange={(v) => set({ minConfidence: v })} />
        <div className="space-y-0.5">
          <Toggle checked={f.corroboratedOnly} onChange={(v) => set({ corroboratedOnly: v })} label="Corroborated only (2+ independent sources)" />
          <Toggle checked={f.preciseOnly} onChange={(v) => set({ preciseOnly: v })} label="Precise location only" />
          <Toggle
            checked={f.fatalOnly}
            onChange={(v) => set({ fatalOnly: v })}
            label="Reported fatalities"
            hint={all.filter((i) => fatalitiesOf(i) > 0).length}
          />
        </div>
      </section>

      <section className="space-y-1">
        <SectionTitle>Sources</SectionTitle>
        {(Object.keys(SOURCE_LABEL) as SourceId[]).map((s) => (
          <Toggle key={s} checked={!f.hiddenSources.includes(s)} onChange={() => toggleSource(s)} label={SOURCE_LABEL[s]} hint={counts.bySource.get(s) ?? 0} />
        ))}
      </section>

      <section className="space-y-2">
        <SectionTitle>Map</SectionTitle>
        <Segmented
          label="Basemap"
          value={basemap}
          onChange={onBasemap}
          options={[
            { value: "dark", label: "Vector" },
            { value: "imagery", label: "Satellite" },
          ]}
        />
        <div className="space-y-0.5">
          <Toggle checked={layers.clusters} onChange={(v) => onLayers({ ...layers, clusters: v })} label="Aggregate clusters" />
          <Toggle checked={layers.heat} onChange={(v) => onLayers({ ...layers, heat: v })} label="Activity heat" />
          <Toggle checked={layers.hotspots} onChange={(v) => onLayers({ ...layers, hotspots: v })} label="Hotspot zones" />
          <Toggle checked={layers.pulses} onChange={(v) => onLayers({ ...layers, pulses: v })} label="Live pulses (last 90 min)" />
          <Toggle checked={layers.rotate} onChange={(v) => onLayers({ ...layers, rotate: v })} label="Auto-rotate when idle" />
        </div>
      </section>

      <section className="space-y-1">
        <SectionTitle>Live tracks</SectionTitle>
        <Toggle checked={layers.air} onChange={(v) => onLayers({ ...layers, air: v })} label="Military & emergency aircraft (ADS-B)" />
        <Toggle checked={layers.sats} onChange={(v) => onLayers({ ...layers, sats: v })} label="Satellites (SGP4, live)" />
      </section>
    </div>
  );
}

function RangeRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-xs text-muted-foreground">
        {label}
        <span className="font-mono tabular-nums text-foreground">{Math.round(value * 100)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-surface-2 accent-[hsl(var(--foreground))]"
      />
    </label>
  );
}

// ─── Hotspots ─────────────────────────────────────────────────────────────

function HotspotsTab({ hotspots, selection, onSelect }: Props) {
  if (!hotspots.length) return <Empty>No hotspots in this window yet.</Empty>;
  const maxScore = Math.max(...hotspots.map((h) => h.score));
  return (
    <ol className="space-y-1.5">
      <p className="pb-1 text-[11px] leading-relaxed text-muted-foreground">
        Regions ranked by activity index — severity × confidence summed over incidents within ~300 km.
      </p>
      {hotspots.map((h, n) => {
        const active = selection?.kind === "hotspot" && selection.id === h.id;
        const TrendIcon = h.trend > 0.15 ? ArrowUpRight : h.trend < -0.15 ? ArrowDownRight : Minus;
        return (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => onSelect({ kind: "hotspot", id: h.id })}
              className={cn(
                "w-full rounded-sm border px-2 py-2 text-left transition-colors",
                active ? "border-primary/50 bg-primary/5" : "border-transparent hover:border-border hover:bg-surface-2/50",
              )}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">{String(n + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{h.name}</span>
                <span className="flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground" title="Recent activity vs. rest of window">
                  <TrendIcon className="h-3 w-3" aria-hidden />
                  {h.trend > 0 ? "+" : ""}
                  {Math.round(h.trend * 100)}%
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-foreground/70" style={{ width: `${(h.score / maxScore) * 100}%` }} />
                </div>
                <Sparkline values={h.spark} width={56} height={14} label={`Incidents over the window in ${h.name}`} />
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="font-mono">{h.incidents} inc</span>
                {DOMAIN_ORDER.filter((d) => h.domains[d] > 0).map((d) => (
                  <span key={d} className="flex items-center gap-1">
                    <DomainSwatch color={DOMAINS[d].color} className="h-2 w-2" />
                    {h.domains[d]}
                  </span>
                ))}
                <span className="ml-auto">{CATEGORIES[h.topCategory].label}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Stats (every bar is a filter) ────────────────────────────────────────

function StatsTab({ all, visible, filters: f, onFilters, countryName }: Props) {
  const s = useMemo(() => {
    const byCat = new Map<Category, number>();
    const byCountry = new Map<string, { n: number; sev: number }>();
    const bySource = new Map<SourceId, number>();
    const bands = [0, 0, 0, 0];
    let fatal = 0, corroborated = 0, critical = 0;
    for (const i of all) {
      byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);
      if (i.country) {
        const c = byCountry.get(i.country) ?? { n: 0, sev: 0 };
        c.n++;
        c.sev += i.severity * i.confidence;
        byCountry.set(i.country, c);
      }
      for (const src of i.sources) bySource.set(src, (bySource.get(src) ?? 0) + 1);
      bands[i.severity >= 0.8 ? 3 : i.severity >= 0.6 ? 2 : i.severity >= 0.35 ? 1 : 0]++;
      fatal += fatalitiesOf(i);
      if (i.sources.length >= 2) corroborated++;
      if (i.severity >= 0.8) critical++;
    }
    return {
      byCat: [...byCat.entries()].sort((a, b) => b[1] - a[1]),
      byCountry: [...byCountry.entries()].sort((a, b) => b[1].sev - a[1].sev).slice(0, 12),
      bySource: [...bySource.entries()].sort((a, b) => b[1] - a[1]),
      bands,
      fatal,
      corroborated,
      critical,
    };
  }, [all]);

  const set = (patch: Partial<FilterState>) => onFilters({ ...f, ...patch });
  const isolateCategory = (c: Category) => {
    const only = CATEGORY_ORDER.filter((x) => x !== c);
    const already = f.hiddenCategories.length === only.length && only.every((x) => f.hiddenCategories.includes(x));
    set({ hiddenCategories: already ? [] : only, domains: { security: true, civil: true, hazard: true } });
  };
  const isolateSource = (src: SourceId) => {
    const others = (Object.keys(SOURCE_LABEL) as SourceId[]).filter((x) => x !== src);
    const already = f.hiddenSources.length === others.length && others.every((x) => f.hiddenSources.includes(x));
    set({ hiddenSources: already ? [] : others });
  };
  const BANDS: Array<[string, number]> = [["Low", 0], ["Elevated", 0.35], ["High", 0.6], ["Critical", 0.8]];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Incidents" value={compact(all.length)} sub={`${compact(visible.length)} after filters`} />
        <Tile label="Critical" value={compact(s.critical)} sub="severity ≥ 80" onClick={() => set({ minSeverity: f.minSeverity >= 0.8 ? 0 : 0.8 })} active={f.minSeverity >= 0.8} />
        <Tile label="Corroborated" value={pct(all.length ? s.corroborated / all.length : 0)} sub="2+ independent sources" onClick={() => set({ corroboratedOnly: !f.corroboratedOnly })} active={f.corroboratedOnly} />
        <Tile label="Reported deaths" value={compact(s.fatal)} sub="as reported, unverified" onClick={() => set({ fatalOnly: !f.fatalOnly })} active={f.fatalOnly} />
      </div>

      <section className="space-y-1.5">
        <SectionTitle>By type</SectionTitle>
        <Bars
          rows={s.byCat.map(([c, n]) => ({
            key: c,
            label: CATEGORIES[c].label,
            value: n,
            color: DOMAINS[CATEGORIES[c].domain].color,
            dim: f.hiddenCategories.includes(c) || !f.domains[CATEGORIES[c].domain],
            onClick: () => isolateCategory(c),
          }))}
        />
      </section>

      <section className="space-y-1.5">
        <SectionTitle>Countries by activity index</SectionTitle>
        <Bars
          rows={s.byCountry.map(([iso2, v]) => ({
            key: iso2,
            label: countryName(iso2) ?? iso2,
            value: Number(v.sev.toFixed(1)),
            note: `${v.n}`,
            dim: !!f.country && f.country !== iso2,
            onClick: () => set({ country: f.country === iso2 ? null : iso2 }),
          }))}
        />
      </section>

      <section className="space-y-1.5">
        <SectionTitle>Severity</SectionTitle>
        <Bars
          rows={BANDS.map(([label, min], k) => ({
            key: label,
            label,
            value: s.bands[k],
            dim: f.minSeverity > min,
            onClick: () => set({ minSeverity: f.minSeverity === min ? 0 : min }),
          }))}
        />
      </section>

      <section className="space-y-1.5">
        <SectionTitle>Sources contributing</SectionTitle>
        <Bars
          rows={s.bySource.map(([src, n]) => ({
            key: src,
            label: SOURCE_LABEL[src],
            value: n,
            dim: f.hiddenSources.includes(src),
            onClick: () => isolateSource(src),
          }))}
        />
      </section>
      <p className="text-[10px] leading-relaxed text-muted-foreground">Click any bar or tile to filter the globe. Click again to clear.</p>
    </div>
  );
}

function Tile({ label, value, sub, onClick, active }: { label: string; value: string; sub: string; onClick?: () => void; active?: boolean }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-pressed={onClick ? !!active : undefined}
      className={cn(
        "rounded-sm border px-2.5 py-2 text-left",
        active ? "border-primary/50 bg-primary/5" : "border-border bg-surface-2/40",
        onClick && "transition-colors hover:border-foreground/30",
      )}
    >
      <div className="section-header">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tracking-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </Comp>
  );
}

function Bars({ rows }: { rows: Array<{ key: string; label: string; value: number; note?: string; color?: string; dim?: boolean; onClick?: () => void }> }) {
  if (!rows.length) return <Empty>No data in this window.</Empty>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            onClick={r.onClick}
            className={cn("group grid w-full grid-cols-[110px_1fr_auto] items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-surface-2/60", r.dim && "opacity-40")}
            title={r.note ? `${r.label}: ${r.value} (${r.note} incidents)` : `${r.label}: ${r.value}`}
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] text-foreground/90">
              {r.color && <DomainSwatch color={r.color} className="h-2 w-2" />}
              <span className="truncate">{r.label}</span>
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (r.value / max) * 100)}%`, background: r.color ?? "hsl(var(--foreground) / 0.7)" }} />
            </span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{r.value}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// ─── Sources (validation ledger) ──────────────────────────────────────────

type CardData = Pick<
  SourceHealth,
  "name" | "homepage" | "status" | "statusNote" | "reliability" | "received" | "accepted" | "filtered" | "rejected" | "reasons" | "fetchedAt" | "latencyMs" | "coverage"
> & { kind?: string; newest?: number | null };

function SourcesTab({ sources, feeds, now }: Props) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Every record is schema-checked, range-checked and time-checked before it can reach the map. Reliability is the NATO Admiralty
        source grade; incidents earn credibility only through independent corroboration.
      </p>
      {sources.map((s) => (
        <SourceCard key={s.id} s={s} now={now} />
      ))}
      {feeds.length > 0 && <SectionTitle className="pt-2">Live tracks</SectionTitle>}
      {feeds.map((f) => (
        <SourceCard key={f.id} s={f} now={now} />
      ))}
    </div>
  );
}

function SourceCard({ s, now }: { s: CardData; now: number }) {
  const total = Math.max(1, s.received);
  const reasons = Object.entries(s.reasons).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return (
    <article className="rounded-sm border border-border bg-surface-2/30 p-2.5">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <a href={s.homepage} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline">
            {s.name}
            <ExternalLink className="h-3 w-3 text-muted-foreground" aria-hidden />
          </a>
          {s.kind && <div className="text-[10px] text-muted-foreground">{s.kind}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusLabel status={s.status} />
          <span className="font-mono text-[10px] text-muted-foreground" title="Admiralty source reliability">
            Grade {s.reliability}
          </span>
        </div>
      </header>
      {s.statusNote && <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">{s.statusNote}</p>}
      {s.received > 0 && (
        <>
          <div className="mt-2 flex h-1.5 gap-px overflow-hidden rounded-full" aria-hidden>
            <span className="bg-good" style={{ width: `${(s.accepted / total) * 100}%` }} />
            <span className="bg-muted-foreground/40" style={{ width: `${(s.filtered / total) * 100}%` }} />
            <span className="bg-critical" style={{ width: `${(s.rejected / total) * 100}%` }} />
          </div>
          <dl className="mt-1.5 grid grid-cols-4 gap-1 font-mono text-[10px]">
            <Stat k="Received" v={s.received} />
            <Stat k="Accepted" v={s.accepted} />
            <Stat k="Filtered" v={s.filtered} />
            <Stat k="Rejected" v={s.rejected} />
          </dl>
          {reasons.length > 0 && (
            <ul className="mt-1.5 flex flex-wrap gap-1">
              {reasons.map(([k, v]) => (
                <li key={k} className="rounded-sm bg-surface-2 px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {k} · {v}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[9px] text-muted-foreground">
        {s.fetchedAt && <span>pulled {ago(s.fetchedAt, now)}</span>}
        {s.latencyMs != null && <span>{s.latencyMs} ms</span>}
        {s.newest && <span>newest {ago(s.newest, now)}</span>}
        {s.coverage && <span className="w-full">{s.coverage}</span>}
      </div>
    </article>
  );
}

function Stat({ k, v }: { k: string; v: number }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="tabular-nums text-foreground">{compact(v)}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs text-muted-foreground">{children}</p>;
}
