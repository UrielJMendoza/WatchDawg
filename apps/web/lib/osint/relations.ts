import type { Category, Relation, WindowKey } from "./types";
import type { RelationObs } from "./sources/types";
import { TIMELINE_BINS } from "./aggregate";

/**
 * Link analysis: fold actor-country observations inside a window into a
 * directed interaction graph. A pair must clear an evidence bar — enough
 * articles, from more than one outlet, across more than one coded event —
 * before it is drawn.
 */

const MIN_ARTICLES = 8;
const MIN_OUTLETS = 2;
const MIN_EVENTS = 2;
const MAX_RELATIONS = 60;

export function stanceOf(goldstein: number): Relation["stance"] {
  if (goldstein <= -2) return "hostile";
  if (goldstein >= 2) return "cooperative";
  return "mixed";
}

export function buildRelations(obs: RelationObs[], window: WindowKey, now: number, windowMs: number): Relation[] {
  const since = now - windowMs;
  const sparkBins = Math.min(24, TIMELINE_BINS[window][1]);
  const binMs = windowMs / sparkBins;
  const pairs = new Map<
    string,
    { from: string; to: string; events: number; articles: number; outlets: Set<string>; g: number; t: number; cats: Map<Category, number>; last: number; spark: number[] }
  >();
  for (const o of obs) {
    if (o.time < since || o.time > now + 60_000) continue;
    const key = `${o.from}>${o.to}`;
    let p = pairs.get(key);
    if (!p) {
      p = { from: o.from, to: o.to, events: 0, articles: 0, outlets: new Set(), g: 0, t: 0, cats: new Map(), last: 0, spark: new Array(sparkBins).fill(0) };
      pairs.set(key, p);
    }
    p.events++;
    p.articles += o.articles;
    p.outlets.add(o.outlet);
    p.g += o.goldstein * o.articles;
    p.t += o.tone * o.articles;
    p.cats.set(o.category, (p.cats.get(o.category) ?? 0) + o.articles);
    p.last = Math.max(p.last, o.time);
    const b = Math.min(sparkBins - 1, Math.floor((o.time - since) / binMs));
    if (b >= 0) p.spark[b] += o.articles;
  }
  const out: Relation[] = [];
  for (const [id, p] of pairs) {
    if (p.articles < MIN_ARTICLES || p.outlets.size < MIN_OUTLETS || p.events < MIN_EVENTS) continue;
    const goldstein = p.g / p.articles;
    out.push({
      id,
      from: p.from,
      to: p.to,
      events: p.events,
      articles: p.articles,
      outlets: p.outlets.size,
      goldstein: Number(goldstein.toFixed(2)),
      tone: Number((p.t / p.articles).toFixed(2)),
      stance: stanceOf(goldstein),
      category: [...p.cats.entries()].sort((a, b) => b[1] - a[1])[0][0],
      lastSeen: p.last,
      spark: p.spark,
    });
  }
  return out.sort((a, b) => b.articles - a.articles).slice(0, MAX_RELATIONS);
}
