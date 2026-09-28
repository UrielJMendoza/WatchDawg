import type { Category, Domain, Incident, SourceId, WindowKey } from "@/lib/osint/types";
import { isWindowKey } from "@/lib/osint/types";
import { domainOf } from "@/lib/osint/taxonomy";
import type { Basemap } from "@/lib/map/style";

export type Selection =
  | { kind: "incident"; id: string }
  | { kind: "hotspot"; id: string }
  | { kind: "country"; iso2: string };

export interface LayerState {
  heat: boolean;
  clusters: boolean;
  hotspots: boolean;
  pulses: boolean;
  rotate: boolean;
}

export const DEFAULT_LAYERS: LayerState = {
  heat: true,
  clusters: true,
  hotspots: true,
  pulses: true,
  rotate: true,
};

/** Everything that narrows the incident set. Stats panels write into this. */
export interface FilterState {
  domains: Record<Domain, boolean>;
  hiddenCategories: Category[];
  hiddenSources: SourceId[];
  minSeverity: number;
  minConfidence: number;
  corroboratedOnly: boolean;
  preciseOnly: boolean;
  fatalOnly: boolean;
  country: string | null;
}

export const DEFAULT_FILTERS: FilterState = {
  domains: { security: true, civil: true, hazard: true },
  hiddenCategories: [],
  hiddenSources: [],
  minSeverity: 0,
  minConfidence: 0,
  corroboratedOnly: false,
  preciseOnly: false,
  fatalOnly: false,
  country: null,
};

export function fatalitiesOf(i: Incident): number {
  const v = i.metrics?.reportedFatalities;
  return typeof v === "number" ? v : 0;
}

export function passesFilters(i: Incident, f: FilterState): boolean {
  if (!f.domains[domainOf(i.category)]) return false;
  if (f.hiddenCategories.length && f.hiddenCategories.includes(i.category)) return false;
  if (f.hiddenSources.length && i.sources.every((s) => f.hiddenSources.includes(s))) return false;
  if (i.severity < f.minSeverity) return false;
  if (i.confidence < f.minConfidence) return false;
  if (f.corroboratedOnly && i.sources.length < 2) return false;
  if (f.preciseOnly && i.precision === "country") return false;
  if (f.fatalOnly && fatalitiesOf(i) <= 0) return false;
  if (f.country && i.country !== f.country) return false;
  return true;
}

export function activeFilterCount(f: FilterState): number {
  let n = 0;
  n += Object.values(f.domains).filter((v) => !v).length;
  n += f.hiddenCategories.length + f.hiddenSources.length;
  if (f.minSeverity > 0) n++;
  if (f.minConfidence > 0) n++;
  if (f.corroboratedOnly) n++;
  if (f.preciseOnly) n++;
  if (f.fatalOnly) n++;
  if (f.country) n++;
  return n;
}

/** Shareable URL state: ?w=24h&q=…&sel=i:abc&cc=UA */
export interface UrlState {
  window: WindowKey;
  query: string;
  selection: Selection | null;
  country: string | null;
}

export function readUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  const w = p.get("w");
  const sel = p.get("sel");
  let selection: Selection | null = null;
  if (sel?.startsWith("i:")) selection = { kind: "incident", id: sel.slice(2) };
  else if (sel?.startsWith("h:")) selection = { kind: "hotspot", id: sel.slice(2) };
  else if (sel?.startsWith("c:")) selection = { kind: "country", iso2: sel.slice(2).toUpperCase() };
  const cc = p.get("cc");
  return {
    window: isWindowKey(w) ? w : "24h",
    query: p.get("q") ?? "",
    selection,
    country: cc && /^[A-Za-z]{2}$/.test(cc) ? cc.toUpperCase() : null,
  };
}

export function writeUrlState(s: UrlState): string {
  const p = new URLSearchParams();
  if (s.window !== "24h") p.set("w", s.window);
  if (s.query) p.set("q", s.query);
  if (s.selection) {
    p.set(
      "sel",
      s.selection.kind === "incident" ? `i:${s.selection.id}` : s.selection.kind === "hotspot" ? `h:${s.selection.id}` : `c:${s.selection.iso2}`,
    );
  }
  if (s.country) p.set("cc", s.country);
  const q = p.toString();
  return q ? `?${q}` : "";
}

export type { Basemap };
