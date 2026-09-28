import type { MetadataRoute } from "next";
import gazetteerJson from "@/lib/osint/data/gazetteer.json";
import type { GazetteerData } from "@/lib/osint/gazetteer";
import { countrySlug, siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();
  const gaz = gazetteerJson as unknown as GazetteerData;
  return [
    { url: base, lastModified: now, changeFrequency: "always", priority: 1 },
    { url: `${base}/methodology`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    ...gaz.countries.map((c) => ({
      url: `${base}/region/${countrySlug(c.name, c.iso2)}`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.6,
    })),
  ];
}
