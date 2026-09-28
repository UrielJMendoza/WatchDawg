"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Command } from "cmdk";
import { Clock, Crosshair, Filter, Globe2, Layers, MapPin, RotateCcw, Search, ShieldCheck, Zap } from "lucide-react";
import type MiniSearch from "minisearch";
import type { Hotspot, Incident, WindowKey } from "@/lib/osint/types";
import { CATEGORIES, DOMAINS, domainOf } from "@/lib/osint/taxonomy";
import { hasFilters, matchesFilters, parseQuery } from "@/lib/osint/query";
import { buildPlaceIndex, searchHotspots, searchIncidents, searchPlaces, type PlaceHit, type PlaceIndex } from "@/lib/osint/search";
import type { GazetteerData } from "@/lib/osint/gazetteer";
import { ago } from "@/lib/console/format";
import { GradeBadge } from "./primitives";

export type PaletteCommand =
  | { type: "window"; window: WindowKey }
  | { type: "reset-view" }
  | { type: "clear-filters" }
  | { type: "basemap" }
  | { type: "tab"; tab: "sources" | "stats" | "hotspots" };

interface Props {
  open: boolean;
  onClose: () => void;
  initialQuery: string;
  incidents: Incident[];
  byId: Map<string, Incident>;
  hotspots: Hotspot[];
  index: MiniSearch | null;
  gazetteer: GazetteerData | null;
  countryName: (iso2: string | undefined) => string | undefined;
  now: number;
  onIncident: (i: Incident) => void;
  onHotspot: (h: Hotspot) => void;
  onPlace: (p: PlaceHit) => void;
  onApplyQuery: (q: string) => void;
  onCommand: (c: PaletteCommand) => void;
}

const EXAMPLES = ["cat:conflict sev>0.7", "Kharkiv", "earthquake multi", "country:SD", "src:acled fatal", "cat:crime Chicago"];

export function SearchPalette(p: Props) {
  const [q, setQ] = useState(p.initialQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const placeIdx = useRef<PlaceIndex | null>(null);

  useEffect(() => {
    if (p.open) {
      setQ(p.initialQuery);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [p.open, p.initialQuery]);

  if (p.gazetteer && !placeIdx.current) placeIdx.current = buildPlaceIndex(p.gazetteer);

  const parsed = useMemo(() => parseQuery(q), [q]);
  const results = useMemo(() => {
    const filtered = hasFilters(parsed.filters) ? p.incidents.filter((i) => matchesFilters(i, parsed.filters)) : p.incidents;
    let incidents: Incident[];
    if (parsed.text) {
      const allowed = new Set(filtered.map((i) => i.id));
      incidents = (p.index ? searchIncidents(p.index as never, parsed.text, 200) : [])
        .filter((id) => allowed.has(id))
        .map((id) => p.byId.get(id))
        .filter((i): i is Incident => !!i);
    } else if (hasFilters(parsed.filters)) {
      incidents = [...filtered].sort((a, b) => b.severity * b.confidence - a.severity * a.confidence);
    } else {
      incidents = [...p.incidents].sort((a, b) => b.firstSeen - a.firstSeen).filter((i) => i.severity >= 0.6);
    }
    const places = parsed.text && placeIdx.current ? searchPlaces(placeIdx.current, parsed.text, 6) : [];
    const hotspots = parsed.text ? searchHotspots(p.hotspots, parsed.text) : q ? [] : p.hotspots.slice(0, 4);
    return { incidents, total: incidents.length, places, hotspots };
  }, [parsed, p.incidents, p.index, p.byId, p.hotspots, q]);

  if (!p.open) return null;

  const close = () => p.onClose();
  const commands: Array<{ id: string; label: string; icon: typeof Clock; run: () => void; keywords: string }> = [
    ...(["1h", "6h", "24h", "7d", "30d"] as WindowKey[]).map((w) => ({
      id: `w-${w}`,
      label: `Time window: last ${w}`,
      icon: Clock,
      keywords: `window time last ${w} hours days`,
      run: () => p.onCommand({ type: "window", window: w }),
    })),
    { id: "reset", label: "Reset globe view", icon: RotateCcw, keywords: "reset view home globe", run: () => p.onCommand({ type: "reset-view" }) },
    { id: "clear", label: "Clear all filters", icon: Filter, keywords: "clear reset filters", run: () => p.onCommand({ type: "clear-filters" }) },
    { id: "basemap", label: "Toggle satellite imagery", icon: Layers, keywords: "satellite imagery basemap map style", run: () => p.onCommand({ type: "basemap" }) },
    { id: "sources", label: "Open source health & validation", icon: ShieldCheck, keywords: "sources health validation feeds status", run: () => p.onCommand({ type: "tab", tab: "sources" }) },
    { id: "stats", label: "Open statistics", icon: Zap, keywords: "stats statistics charts breakdown", run: () => p.onCommand({ type: "tab", tab: "stats" }) },
  ];
  const cmdMatches = q ? commands.filter((c) => c.keywords.includes(q.toLowerCase().trim()) || c.label.toLowerCase().includes(q.toLowerCase().trim())) : commands;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/55 px-3 pt-[10vh] backdrop-blur-[2px]" onMouseDown={close}>
      <div className="panel brackets relative w-full max-w-[680px] overflow-hidden rounded-md" onMouseDown={(e) => e.stopPropagation()}>
        <Command shouldFilter={false} loop label="Search the globe" onKeyDown={(e) => e.key === "Escape" && close()}>
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <Command.Input
              ref={inputRef}
              autoFocus
              value={q}
              onValueChange={setQ}
              placeholder="Search places, incidents, actors — or filter: cat:conflict sev>0.7 src:gdelt"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            <kbd className="kbd">esc</kbd>
          </div>
          {(parsed.chips.length > 0 || parsed.unknown.length > 0) && (
            <div className="flex flex-wrap gap-1 border-b border-border px-3 py-1.5">
              {parsed.chips.map((c) => (
                <span key={c} className="chip border-primary/40 text-primary">
                  {c}
                </span>
              ))}
              {parsed.unknown.map((c) => (
                <span key={c} className="chip border-warning/40 text-warning" title="Unknown operator — treated as ignored">
                  ? {c}
                </span>
              ))}
            </div>
          )}
          <Command.List className="max-h-[56vh] overflow-y-auto p-1.5">
            {q.trim() && (
              <Command.Group heading="Apply">
                <Item
                  value="apply"
                  onSelect={() => {
                    p.onApplyQuery(q.trim());
                    close();
                  }}
                  icon={<Filter className="h-3.5 w-3.5" />}
                >
                  Filter the globe to <span className="font-mono text-primary">{q.trim()}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{results.total} match</span>
                </Item>
              </Command.Group>
            )}
            {results.places.length > 0 && (
              <Command.Group heading="Places">
                {results.places.map((pl) => {
                  const key = pl.kind === "country" ? `c-${pl.row.iso2}` : `t-${pl.row.name}-${pl.row.lat}`;
                  return (
                    <Item
                      key={key}
                      value={key}
                      onSelect={() => {
                        p.onPlace(pl);
                        close();
                      }}
                      icon={pl.kind === "country" ? <Globe2 className="h-3.5 w-3.5" /> : <MapPin className="h-3.5 w-3.5" />}
                    >
                      {pl.row.name}
                      <span className="text-muted-foreground">
                        {pl.kind === "country" ? ` · ${pl.row.subregion || pl.row.region}` : ` · ${p.countryName(pl.row.iso2) ?? pl.row.iso2}`}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-muted-foreground">
                        {pl.kind === "country" ? "country" : pl.row.cap ? "capital" : "city"}
                      </span>
                    </Item>
                  );
                })}
              </Command.Group>
            )}
            {results.hotspots.length > 0 && (
              <Command.Group heading="Hotspots">
                {results.hotspots.map((h) => (
                  <Item
                    key={h.id}
                    value={`h-${h.id}`}
                    onSelect={() => {
                      p.onHotspot(h);
                      close();
                    }}
                    icon={<Crosshair className="h-3.5 w-3.5" />}
                  >
                    {h.name}
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground">{h.incidents} incidents</span>
                  </Item>
                ))}
              </Command.Group>
            )}
            {results.incidents.length > 0 && (
              <Command.Group heading={q ? `Incidents · ${results.total}` : "Latest high-severity"}>
                {results.incidents.slice(0, 14).map((i) => (
                  <Item
                    key={i.id}
                    value={`i-${i.id}`}
                    onSelect={() => {
                      p.onIncident(i);
                      close();
                    }}
                    icon={<span className="h-2 w-2 rounded-[2px]" style={{ background: DOMAINS[domainOf(i.category)].color }} />}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{i.title}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {CATEGORIES[i.category].label} · {i.place} · {ago(i.firstSeen, p.now)}
                      </span>
                    </span>
                    <GradeBadge reliability={i.reliability} credibility={i.credibility} />
                  </Item>
                ))}
              </Command.Group>
            )}
            {cmdMatches.length > 0 && (
              <Command.Group heading="Commands">
                {cmdMatches.map((c) => (
                  <Item
                    key={c.id}
                    value={c.id}
                    onSelect={() => {
                      c.run();
                      close();
                    }}
                    icon={<c.icon className="h-3.5 w-3.5" />}
                  >
                    {c.label}
                  </Item>
                ))}
              </Command.Group>
            )}
            {q && !results.incidents.length && !results.places.length && !results.hotspots.length && !cmdMatches.length && (
              <div className="px-3 py-8 text-center text-sm text-muted-foreground">No matches. Try a place name or an operator like cat:unrest.</div>
            )}
          </Command.List>
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
            <span>Try</span>
            {EXAMPLES.map((e) => (
              <button key={e} type="button" onClick={() => setQ(e)} className="chip hover:text-foreground">
                {e}
              </button>
            ))}
          </div>
        </Command>
      </div>
    </div>
  );
}

function Item({ value, onSelect, icon, children }: { value: string; onSelect: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-sm text-foreground/90 data-[selected=true]:bg-surface-2 data-[selected=true]:text-foreground"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
      {children}
    </Command.Item>
  );
}
