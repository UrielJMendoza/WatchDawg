"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { PanelLeft, PanelRight, X } from "lucide-react";
import type { Incident, Snapshot, WindowKey } from "@/lib/osint/types";
import { DOMAINS, DOMAIN_ORDER, CATEGORIES } from "@/lib/osint/taxonomy";
import { countryByIso2, type GazetteerData } from "@/lib/osint/gazetteer";
import { hasFilters, matchesFilters, parseQuery } from "@/lib/osint/query";
import { buildIncidentIndex, searchIncidents } from "@/lib/osint/search";
import { formatDms } from "@/lib/osint/geo";
import {
  DEFAULT_FILTERS,
  DEFAULT_LAYERS,
  passesFilters,
  readUrlState,
  writeUrlState,
  type FilterState,
  type LayerState,
  type Selection,
} from "@/lib/console/state";
import { altitudeKm, ago, compact } from "@/lib/console/format";
import type { Basemap } from "@/lib/map/style";
import { cn } from "@/lib/utils";
import type { CameraCommand, ViewInfo } from "./globe";
import { TopBar } from "./top-bar";
import { LeftRail, type RailTab } from "./left-rail";
import { Inspector } from "./inspector";
import { Timeline } from "./timeline";
import { SearchPalette, type PaletteCommand } from "./search-palette";
import { DomainSwatch, GradeBadge, Segmented } from "./primitives";

const Globe = dynamic(() => import("./globe"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 flex items-center justify-center">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Initialising globe…</span>
    </div>
  ),
});

const REFRESH_MS = 60_000;
const FRESH_MS = 5 * 60_000;

async function fetcher(url: string): Promise<Snapshot> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Snapshot request failed (${res.status})`);
  return res.json() as Promise<Snapshot>;
}

export default function CommandCenter({ initial }: { initial: Snapshot | null }) {
  // ─── URL-backed state ───────────────────────────────────────────────────
  const [window_, setWindow] = useState<WindowKey>("24h");
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const u = readUrlState(window.location.search);
    setWindow(u.window);
    setQuery(u.query);
    setSelection(u.selection);
    if (u.country) setFilters((f) => ({ ...f, country: u.country }));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const next = writeUrlState({ window: window_, query, selection, country: filters.country });
    if (next !== window.location.search) window.history.replaceState(null, "", `${window.location.pathname}${next}`);
  }, [hydrated, window_, query, selection, filters.country]);

  // ─── UI state ───────────────────────────────────────────────────────────
  const [layers, setLayers] = useState<LayerState>(DEFAULT_LAYERS);
  const [basemap, setBasemap] = useState<Basemap>("dark");
  const [tab, setTab] = useState<RailTab>("filters");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [camera, setCamera] = useState<CameraCommand | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const [view, setView] = useState<ViewInfo>({ zoom: 2, lat: 24, lon: 18, bearing: 0, pitch: 0 });
  const [mobilePanel, setMobilePanel] = useState<"none" | "rail" | "inspector">("none");
  // 0 until mounted, so server and client render identical markup.
  const [now, setNow] = useState(0);
  const [gaz, setGaz] = useState<GazetteerData | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    import("@/lib/osint/data/gazetteer.json").then((m) => alive && setGaz((m.default ?? m) as unknown as GazetteerData));
    return () => {
      alive = false;
    };
  }, []);

  const countryRow = useCallback((iso2: string | undefined) => (gaz ? countryByIso2(gaz, iso2) : undefined), [gaz]);
  const countryName = useCallback((iso2: string | undefined) => countryRow(iso2)?.name, [countryRow]);

  // ─── Live data ──────────────────────────────────────────────────────────
  const { data, error, isValidating } = useSWR<Snapshot>(`/api/v1/snapshot?window=${window_}`, fetcher, {
    refreshInterval: REFRESH_MS,
    revalidateOnFocus: true,
    keepPreviousData: true,
    fallbackData: initial && initial.window === window_ ? initial : undefined,
  });
  const snap = data ?? null;
  const all = useMemo(() => snap?.incidents ?? [], [snap]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);

  // Incidents that arrived since the previous refresh glow for a few minutes.
  const seen = useRef<{ window: WindowKey; ids: Set<string> } | null>(null);
  const freshAt = useRef(new Map<string, number>());
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!snap) return;
    const ids = new Set(snap.incidents.map((i) => i.id));
    const prev = seen.current;
    const t = Date.now();
    if (prev && prev.window === snap.window) {
      for (const id of ids) if (!prev.ids.has(id)) freshAt.current.set(id, t);
    }
    seen.current = { window: snap.window, ids };
    for (const [id, at] of freshAt.current) if (t - at > FRESH_MS || !ids.has(id)) freshAt.current.delete(id);
    setFreshIds(new Set(freshAt.current.keys()));
  }, [snap]);

  // ─── Search + filters ───────────────────────────────────────────────────
  const index = useMemo(() => (all.length ? buildIncidentIndex(all, countryName) : null), [all, countryName]);
  const parsed = useMemo(() => parseQuery(query), [query]);
  const textIds = useMemo(() => (parsed.text && index ? new Set(searchIncidents(index, parsed.text, 10_000)) : null), [parsed.text, index]);
  const visible = useMemo(
    () =>
      all.filter(
        (i) => passesFilters(i, filters) && (!hasFilters(parsed.filters) || matchesFilters(i, parsed.filters)) && (!textIds || textIds.has(i.id)),
      ),
    [all, filters, parsed.filters, textIds],
  );
  const visibleHotspots = useMemo(() => {
    const ids = new Set(visible.map((i) => i.id));
    return (snap?.hotspots ?? []).filter((h) => h.incidentIds.some((id) => ids.has(id)));
  }, [snap, visible]);

  // ─── Actions ────────────────────────────────────────────────────────────
  const flyTo = useCallback((lat: number, lon: number, zoom?: number) => setCamera({ key: Date.now(), lat, lon, zoom }), []);
  const select = useCallback(
    (s: Selection | null) => {
      setSelection(s);
      if (s) setMobilePanel("inspector");
      if (s?.kind === "incident") {
        const i = byId.get(s.id);
        if (i) setCamera({ key: Date.now(), lat: i.lat, lon: i.lon, zoom: i.precision === "country" ? 4 : 6 });
      } else if (s?.kind === "hotspot") {
        const h = snap?.hotspots.find((x) => x.id === s.id);
        if (h) setCamera({ key: Date.now(), lat: h.lat, lon: h.lon, zoom: 5 });
      } else if (s?.kind === "country") {
        const c = countryRow(s.iso2);
        if (c) setCamera({ key: Date.now(), lat: c.lat, lon: c.lon, bbox: c.bbox ?? undefined, zoom: 4 });
      }
    },
    [byId, snap, countryRow],
  );

  // Deep link: fly to the URL's selection once its target is resolvable.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current || !hydrated || !selection) return;
    const ready =
      (selection.kind === "incident" && byId.has(selection.id)) ||
      (selection.kind === "hotspot" && !!snap?.hotspots.some((h) => h.id === selection.id)) ||
      (selection.kind === "country" && !!gaz);
    if (!ready) return;
    deepLinked.current = true;
    select(selection);
  }, [hydrated, selection, byId, snap, gaz, select]);

  const onCommand = (c: PaletteCommand) => {
    if (c.type === "window") setWindow(c.window);
    else if (c.type === "reset-view") setCamera({ key: Date.now(), reset: true });
    else if (c.type === "clear-filters") {
      setFilters(DEFAULT_FILTERS);
      setQuery("");
    } else if (c.type === "basemap") setBasemap((b) => (b === "dark" ? "imagery" : "dark"));
    else if (c.type === "tab") {
      setTab(c.tab);
      setMobilePanel("rail");
    }
  };

  // Keyboard: ⌘K / Ctrl+K / "/" search, Esc to clear selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "Escape" && !paletteOpen) {
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen]);

  const hovered = hover ? byId.get(hover.id) : undefined;
  const sources = snap?.sources ?? [];
  const uplinkDown = !!snap && sources.every((s) => s.status === "offline" || s.status === "disabled");
  const critical = visible.filter((i) => i.severity >= 0.8).length;
  const countries = new Set(visible.map((i) => i.country).filter(Boolean)).size;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background">
      <div className="flex h-5 shrink-0 items-center justify-center bg-classification font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-black">
        Unclassified // Open-source intelligence
      </div>
      <TopBar
        window={window_}
        onWindow={setWindow}
        onSearch={() => setPaletteOpen(true)}
        query={query}
        sources={sources}
        generatedAt={snap?.generatedAt ?? null}
        now={now}
        loading={isValidating}
      />

      <div className="relative min-h-0 flex-1">
        {/* Globe fills the stage; panels float above it. */}
        <div className="space absolute inset-0">
          <Globe
            incidents={visible}
            hotspots={visibleHotspots}
            selection={selection}
            layers={layers}
            basemap={basemap}
            camera={camera}
            freshIds={freshIds}
            now={snap?.generatedAt ?? now}
            onSelect={select}
            onHover={setHover}
            onCursor={setCursor}
            onView={setView}
            onReady={() => undefined}
          />
          <div className="scanlines pointer-events-none absolute inset-0 opacity-40" aria-hidden />
        </div>

        {/* Map HUD */}
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 flex-col items-center gap-1.5 lg:left-[calc(50%+0px)]">
          <div className="panel pointer-events-auto flex items-center gap-3 whitespace-nowrap rounded-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider">
            <span>
              <span className="text-foreground">{compact(visible.length)}</span> <span className="text-muted-foreground">incidents</span>
            </span>
            <span className="h-3 w-px bg-border" />
            <span>
              <span className="text-foreground">{critical}</span> <span className="text-muted-foreground">critical</span>
            </span>
            <span className="hidden h-3 w-px bg-border sm:block" />
            <span className="hidden sm:inline">
              <span className="text-foreground">{countries}</span> <span className="text-muted-foreground">countries</span>
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="text-muted-foreground">last {window_}</span>
          </div>
          {query && (
            <div className="pointer-events-auto flex items-center gap-1 rounded-sm border border-primary/40 bg-surface/90 py-0.5 pl-2 pr-1 font-mono text-[10px] text-primary">
              filter: {query}
              <button type="button" aria-label="Clear search filter" onClick={() => setQuery("")} className="rounded-sm p-0.5 hover:bg-primary/10">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>

        {/* Center reticle */}
        <div
          className="pointer-events-none absolute left-1/2 top-[calc(50%-10px)] z-10 h-6 w-6 -translate-x-1/2 -translate-y-1/2 opacity-40 lg:left-[calc(50%-30px)] lg:top-[calc(50%-45px)]"
          aria-hidden
        >
          <span className="absolute left-1/2 top-0 h-2 w-px bg-primary" />
          <span className="absolute bottom-0 left-1/2 h-2 w-px bg-primary" />
          <span className="absolute left-0 top-1/2 h-px w-2 bg-primary" />
          <span className="absolute right-0 top-1/2 h-px w-2 bg-primary" />
        </div>

        {hovered && hover && (
          <div className="panel pointer-events-none absolute z-30 max-w-[300px] rounded-sm px-2.5 py-2" style={{ left: hover.x + 16, top: hover.y + 16 }}>
            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <DomainSwatch color={DOMAINS[CATEGORIES[hovered.category].domain].color} className="h-2 w-2" />
              {CATEGORIES[hovered.category].label} · {ago(hovered.lastSeen, now)}
              <GradeBadge reliability={hovered.reliability} credibility={hovered.credibility} className="ml-auto h-4 text-[9px]" />
            </div>
            <div className="mt-1 text-xs font-medium leading-snug">{hovered.title}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{hovered.place}</div>
          </div>
        )}

        {/* Left rail */}
        <aside
          className={cn(
            "panel absolute bottom-[132px] left-3 top-3 z-30 w-[320px] overflow-hidden rounded-md",
            "max-lg:bottom-16 max-lg:w-[min(340px,calc(100vw-24px))] max-lg:transition-transform",
            mobilePanel === "rail" ? "max-lg:translate-x-0" : "max-lg:-translate-x-[110%]",
          )}
          aria-label="Filters, hotspots, statistics and sources"
        >
          <LeftRail
            tab={tab}
            onTab={setTab}
            all={all}
            visible={visible}
            hotspots={snap?.hotspots ?? []}
            sources={sources}
            filters={filters}
            onFilters={setFilters}
            layers={layers}
            onLayers={setLayers}
            basemap={basemap}
            onBasemap={setBasemap}
            selection={selection}
            onSelect={select}
            countryName={countryName}
            now={now}
          />
        </aside>

        {/* Right inspector / feed */}
        <aside
          className={cn(
            "panel absolute bottom-[132px] right-3 top-3 z-30 w-[380px] overflow-hidden rounded-md",
            "max-lg:bottom-16 max-lg:w-[min(400px,calc(100vw-24px))] max-lg:transition-transform",
            mobilePanel === "inspector" ? "max-lg:translate-x-0" : "max-lg:translate-x-[110%]",
          )}
          aria-label="Incident details and live feed"
        >
          <Inspector
            selection={selection}
            incidents={visible}
            byId={byId}
            hotspots={snap?.hotspots ?? []}
            sources={sources}
            country={countryRow}
            now={now}
            freshIds={freshIds}
            onSelect={select}
            onFlyTo={flyTo}
            onFilterCountry={(iso2) => setFilters((f) => ({ ...f, country: iso2 }))}
          />
        </aside>

        {/* Bottom: timeline + HUD readouts */}
        <div className="panel absolute bottom-3 left-3 right-3 z-20 flex h-[112px] items-stretch gap-4 rounded-md px-4 py-2.5 lg:left-[344px] lg:right-[404px] max-lg:hidden">
          <div className="min-w-0 flex-1">
            <Timeline data={snap?.timeline} now={now} />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-[132px] left-[344px] z-20 hidden font-mono text-[10px] leading-relaxed text-muted-foreground lg:block">
          <div>{cursor ? formatDms(cursor.lat, cursor.lon) : formatDms(view.lat, view.lon)}</div>
          <div>
            Z {view.zoom.toFixed(1)} · ALT {compact(Math.round(altitudeKm(view.zoom, view.lat)))} km · BRG {Math.round(view.bearing)}°
          </div>
        </div>
        <div className="panel pointer-events-none absolute bottom-[132px] right-[404px] z-20 hidden rounded-sm px-2.5 py-1.5 lg:block">
          <div className="flex items-center gap-3">
            {DOMAIN_ORDER.map((d) => (
              <span key={d} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <DomainSwatch color={DOMAINS[d].color} />
                {DOMAINS[d].label}
              </span>
            ))}
          </div>
          <div className="mt-0.5 text-[9px] text-muted-foreground/80">Size = severity · brightness = confidence · rings = last 90 min</div>
        </div>

        {/* Mobile controls */}
        <div className="absolute bottom-3 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 lg:hidden">
          <button type="button" onClick={() => setMobilePanel(mobilePanel === "rail" ? "none" : "rail")} className="panel flex items-center gap-1.5 rounded-sm px-3 py-2 text-xs">
            <PanelLeft className="h-3.5 w-3.5" /> Filters
          </button>
          <Segmented
            label="Time window"
            value={window_}
            onChange={setWindow}
            className="panel"
            options={(["1h", "24h", "7d", "30d"] as WindowKey[]).map((w) => ({ value: w, label: w }))}
          />
          <button type="button" onClick={() => setMobilePanel(mobilePanel === "inspector" ? "none" : "inspector")} className="panel flex items-center gap-1.5 rounded-sm px-3 py-2 text-xs">
            <PanelRight className="h-3.5 w-3.5" /> Feed
          </button>
        </div>

        {(uplinkDown || (error && !snap)) && (
          <div className="absolute inset-x-0 top-16 z-40 mx-auto w-fit max-w-[92vw]">
            <div className="panel rounded-sm border-critical/40 px-4 py-3 text-center">
              <div className="font-mono text-[11px] font-semibold uppercase tracking-widest text-critical">Uplink down</div>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                No live source is reachable right now. WatchDawg never substitutes simulated data — the globe will populate as soon as feeds respond.
              </p>
            </div>
          </div>
        )}
      </div>

      <SearchPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        initialQuery={query}
        incidents={all}
        byId={byId}
        hotspots={snap?.hotspots ?? []}
        index={index as never}
        gazetteer={gaz}
        countryName={countryName}
        now={now}
        onIncident={(i: Incident) => select({ kind: "incident", id: i.id })}
        onHotspot={(h) => select({ kind: "hotspot", id: h.id })}
        onPlace={(pl) => {
          if (pl.kind === "country") select({ kind: "country", iso2: pl.row.iso2 });
          else flyTo(pl.row.lat, pl.row.lon, pl.row.pop > 1_000_000 ? 8 : 9);
        }}
        onApplyQuery={setQuery}
        onCommand={onCommand}
      />
    </div>
  );
}
