import MiniSearch from "minisearch";
import type { Hotspot, Incident } from "./types";
import { CATEGORIES } from "./taxonomy";
import type { CityRow, CountryRow, GazetteerData } from "./gazetteer";
import { stripDiacritics } from "./gazetteer";

/**
 * Client-side search. Two MiniSearch indexes: one over the live incident
 * set (rebuilt whenever the snapshot changes — a few ms for thousands of
 * docs) and one over the gazetteer (built once, lazily). Prefix + fuzzy
 * matching, field boosts, and population-weighted place ranking.
 */

interface IncidentDoc {
  id: string;
  title: string;
  place: string;
  label: string;
  actors: string;
  country: string;
  category: string;
  tags: string;
}

const processTerm = (t: string) => stripDiacritics(t).toLowerCase();

export function buildIncidentIndex(
  incidents: Incident[],
  countryName: (iso2: string | undefined) => string | undefined,
): MiniSearch<IncidentDoc> {
  const ms = new MiniSearch<IncidentDoc>({
    fields: ["title", "place", "label", "actors", "country", "category", "tags"],
    storeFields: [],
    processTerm,
    searchOptions: {
      boost: { title: 3, place: 2.5, country: 2, label: 1.5, category: 1.2 },
      prefix: true,
      fuzzy: 0.18,
      combineWith: "AND",
    },
  });
  const seen = new Set<string>();
  ms.addAll(
    incidents
      .filter((i) => !seen.has(i.id) && seen.add(i.id))
      .map((i) => ({
        id: i.id,
        title: i.title,
        place: i.place,
        label: i.label,
        actors: (i.actors ?? []).join(" "),
        country: `${countryName(i.country) ?? ""} ${i.country ?? ""}`,
        category: `${CATEGORIES[i.category].label} ${i.category}`,
        tags: (i.tags ?? []).join(" "),
      })),
  );
  return ms;
}

/** AND first for precision; fall back to OR so a typo never returns nothing. */
export function searchIncidents(index: MiniSearch<IncidentDoc>, text: string, limit = 50): string[] {
  if (!text.trim()) return [];
  let hits = index.search(text);
  if (!hits.length) hits = index.search(text, { combineWith: "OR" });
  return hits.slice(0, limit).map((h) => String(h.id));
}

export type PlaceHit =
  | { kind: "country"; row: CountryRow; score: number }
  | { kind: "city"; row: CityRow; score: number };

interface PlaceDoc {
  id: string;
  name: string;
  alt: string;
  pop: number;
}

export interface PlaceIndex {
  ms: MiniSearch<PlaceDoc>;
  byId: Map<string, PlaceHit>;
}

export function buildPlaceIndex(gaz: GazetteerData): PlaceIndex {
  const byId = new Map<string, PlaceHit>();
  const docs: PlaceDoc[] = [];
  for (const c of gaz.countries) {
    const id = `c:${c.iso2}`;
    byId.set(id, { kind: "country", row: c, score: 0 });
    docs.push({ id, name: c.name, alt: [c.iso2, c.iso3, ...c.aliases, ...c.demonyms].join(" "), pop: 5e8 });
  }
  gaz.cities.forEach((c, n) => {
    const id = `t:${n}`;
    byId.set(id, { kind: "city", row: c, score: 0 });
    docs.push({ id, name: c.name, alt: "", pop: c.pop * (c.cap ? 3 : 1) });
  });
  const ms = new MiniSearch<PlaceDoc>({
    fields: ["name", "alt"],
    storeFields: ["pop"],
    processTerm,
    searchOptions: {
      boost: { name: 3 },
      prefix: true,
      fuzzy: 0.2,
      boostDocument: (_id, _term, stored) => 1 + Math.log10(1 + Number(stored?.pop ?? 0)) / 6,
    },
  });
  ms.addAll(docs);
  return { ms, byId };
}

export function searchPlaces(idx: PlaceIndex, text: string, limit = 8): PlaceHit[] {
  if (text.trim().length < 2) return [];
  return idx.ms
    .search(text)
    .slice(0, limit)
    .map((h) => ({ ...(idx.byId.get(String(h.id)) as PlaceHit), score: h.score }));
}

export function searchHotspots(hotspots: Hotspot[], text: string): Hotspot[] {
  const q = processTerm(text.trim());
  if (!q) return [];
  return hotspots.filter((h) => processTerm(h.name).includes(q));
}
