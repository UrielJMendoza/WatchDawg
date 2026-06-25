import "server-only";
import type { FeedItem, NationCode } from "../types";

/**
 * ReliefWeb API (UN OCHA). Free, no key required (an `appname` is requested by
 * their ToS). Returns humanitarian situation reports per country -> feed items.
 * Docs: https://apidoc.reliefweb.int/
 */

const BASE = "https://api.reliefweb.int/v1/reports";
const APP = "watchdawg-gotham";

interface RWItem {
  fields?: {
    title?: string;
    url?: string;
    source?: Array<{ shortname?: string; name?: string }>;
    date?: { created?: string };
    country?: Array<{ name?: string }>;
  };
}
interface RWResponse {
  data?: RWItem[];
}

export async function fetchSituationReports(
  country: string,
  nation: NationCode | null,
  limit = 12,
): Promise<FeedItem[]> {
  const url =
    `${BASE}?appname=${APP}&profile=list&preset=latest&limit=${limit}` +
    `&filter[field]=country&filter[value]=${encodeURIComponent(country)}` +
    `&fields[include][]=title&fields[include][]=url` +
    `&fields[include][]=source&fields[include][]=date.created` +
    `&fields[include][]=country.name`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`ReliefWeb ${res.status}`);
    const data = (await res.json()) as RWResponse;
    const rows = Array.isArray(data.data) ? data.data : [];
    return rows
      .filter((r) => r.fields?.title && r.fields?.url)
      .map((r, i) => {
        const f = r.fields!;
        return {
          id: `rw-${i}-${f.url}`,
          title: f.title as string,
          url: f.url as string,
          domain: f.source?.[0]?.shortname ?? "ReliefWeb",
          country: f.country?.[0]?.name ?? country,
          seen: f.date?.created ?? new Date().toISOString(),
          nation,
        } satisfies FeedItem;
      });
  } finally {
    clearTimeout(timer);
  }
}
