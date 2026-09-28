import { XMLParser } from "fast-xml-parser";
import type { Signal } from "../types";
import { classifyText, TEXT_SEVERITY } from "../taxonomy";
import { geocodeText, type GazetteerData } from "../gazetteer";
import { checkTime, clamp01, cleanText, hashId, hostOf, Ledger, safeUrl } from "../validate";
import type { CollectContext, CollectResult, SourceAdapter } from "./types";

/**
 * International news wires (RSS / Atom / RDF). Headlines are validated,
 * classified by keyword rules and geocoded against the gazetteer. They are
 * the human-written counterpart to GDELT's machine coding: when both put the
 * same kind of event in the same place, the incident is corroborated.
 */
export const WIRE_FEEDS: Array<{ outlet: string; url: string }> = [
  { outlet: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  { outlet: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { outlet: "The Guardian", url: "https://www.theguardian.com/world/rss" },
  { outlet: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml" },
  { outlet: "France 24", url: "https://www.france24.com/en/rss" },
  { outlet: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-en-world" },
  { outlet: "UN News", url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml" },
  { outlet: "NPR", url: "https://feeds.npr.org/1004/rss.xml" },
  { outlet: "Sky News", url: "https://feeds.skynews.com/feeds/rss/world.xml" },
  { outlet: "CBC News", url: "https://www.cbc.ca/webfeed/rss/rss-world" },
  { outlet: "The Kyiv Independent", url: "https://kyivindependent.com/rss/" },
  { outlet: "The Times of Israel", url: "https://www.timesofisrael.com/feed/" },
  { outlet: "Africanews", url: "https://www.africanews.com/feed/rss" },
  { outlet: "Middle East Eye", url: "https://www.middleeasteye.net/rss" },
  { outlet: "NPR (US news)", url: "https://feeds.npr.org/1003/rss.xml" },
];

const MAX_AGE_MS = 48 * 3_600_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Entities are decoded by cleanText; never let the parser expand them.
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  trimValues: true,
});

type Node = Record<string, unknown>;

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") return text((v as Node)["#text"]);
  return "";
}

function link(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    const alt = v.find((l) => typeof l === "object" && l && ((l as Node)["@_rel"] ?? "alternate") === "alternate");
    return link(alt ?? v[0]);
  }
  if (v && typeof v === "object") return String((v as Node)["@_href"] ?? (v as Node)["#text"] ?? "");
  return "";
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

export interface WireItem {
  title: string;
  link: string;
  date: string;
  description: string;
}

export function parseFeedXml(xml: string): WireItem[] {
  const doc = parser.parse(xml) as Node;
  const rss = doc.rss as Node | undefined;
  const channel = rss?.channel as Node | undefined;
  const rdf = doc["rdf:RDF"] as Node | undefined;
  const feed = doc.feed as Node | undefined;
  const items = asArray((channel?.item ?? rdf?.item ?? feed?.entry) as Node | Node[] | undefined);
  return items.map((it) => ({
    title: text(it.title),
    link: link(it.link) || text(it.guid),
    date: text(it.pubDate ?? it["dc:date"] ?? it.published ?? it.updated),
    description: text(it.description ?? it.summary ?? it["content:encoded"] ?? it.content),
  }));
}

const FATALITIES = /\b(\d{1,5})\s+(?:people\s+|civilians\s+|soldiers\s+|migrants\s+|protesters\s+)?(?:killed|dead|die[sd]?|deaths)\b/i;

export function itemsToSignals(
  items: WireItem[],
  outlet: string,
  gaz: GazetteerData,
  now: number,
  ledger: Ledger,
  seen: Set<string>,
): Signal[] {
  const out: Signal[] = [];
  for (const it of items) {
    ledger.seen();
    const title = cleanText(it.title, 200);
    if (title.length < 12) {
      ledger.reject("text.empty");
      continue;
    }
    const url = safeUrl(it.link);
    if (!url) {
      ledger.reject("url.invalid");
      continue;
    }
    if (seen.has(url)) {
      ledger.filter("dedupe.url");
      continue;
    }
    const time = Date.parse(it.date);
    const timeErr = checkTime(time, now, MAX_AGE_MS);
    if (timeErr) {
      if (timeErr === "window.stale") ledger.filter(timeErr);
      else ledger.reject(timeErr);
      continue;
    }
    const summary = cleanText(it.description, 400);
    const cls = classifyText(title) ?? classifyText(`${title} ${summary}`);
    if (!cls) {
      ledger.filter("relevance.unclassified");
      continue;
    }
    const geo = geocodeText(gaz, title) ?? geocodeText(gaz, `${title}. ${summary}`);
    if (!geo) {
      ledger.filter("geo.unresolved");
      continue;
    }
    seen.add(url);
    const fatal = FATALITIES.exec(`${title} ${summary}`);
    const fatalities = fatal ? Number(fatal[1]) : 0;
    const severity = clamp01(
      TEXT_SEVERITY[cls.category] + (fatalities >= 50 ? 0.25 : fatalities >= 10 ? 0.15 : fatalities > 0 ? 0.06 : 0),
    );
    out.push({
      key: `wire:${hashId(url)}`,
      source: "wire",
      category: cls.category,
      title,
      headline: title,
      summary: summary || undefined,
      url,
      outlet: hostOf(url) ?? outlet,
      lat: geo.lat,
      lon: geo.lon,
      precision: geo.precision,
      place: geo.place,
      country: geo.country,
      time,
      severity,
      quality: 0.6,
      reports: 1,
      tags: [`outlet:${outlet}`, `geo:${geo.matched}`],
      metrics: fatalities ? { reportedFatalities: fatalities } : undefined,
    });
    ledger.accept();
  }
  return out;
}

export const wire: SourceAdapter = {
  meta: {
    id: "wire",
    name: "International news wires",
    kind: "Editorial newsrooms (RSS)",
    reliability: "B",
    homepage: "https://www.bbc.com/news/world",
    description: "Headlines from 15 newsrooms (BBC, Al Jazeera, NYT, Guardian, France 24, DW, UN News, NPR, Sky, CBC, Kyiv Independent, Times of Israel, Africanews, Middle East Eye) — classified and geocoded.",
    ttlMs: 4 * 60_000,
    maxStaleMs: 6 * 3_600_000,
    coverage: "Past 48 hours · polled every 4 minutes",
  },
  async collect(ctx: CollectContext): Promise<CollectResult> {
    const ledger = new Ledger();
    const seen = new Set<string>();
    const feeds = WIRE_FEEDS;
    const results = await Promise.allSettled(
      feeds.map(async (f) => ({ f, items: parseFeedXml(await ctx.transport.text(f.url)) })),
    );
    const signals: Signal[] = [];
    let ok = 0;
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      ok++;
      signals.push(...itemsToSignals(r.value.items, r.value.f.outlet, ctx.gazetteer, ctx.now, ledger, seen));
    }
    if (!ok) throw new Error("All news wire feeds unreachable");
    return {
      signals,
      ledger,
      integrity: {
        check: "feeds",
        passed: ok,
        total: feeds.length,
        detail: `${ok} of ${feeds.length} newsroom feeds parsed`,
      },
    };
  },
};
