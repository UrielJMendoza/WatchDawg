import { countryByIso2 } from "@/lib/osint/gazetteer";
import gazetteerJson from "@/lib/osint/data/gazetteer.json";
import type { GazetteerData } from "@/lib/osint/gazetteer";
import { iso2FromSlug } from "@/lib/site";
import { OG_SIZE, ogCard } from "@/lib/seo/og";

export const alt = "Live events map for this country — WatchDawg";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const iso2 = iso2FromSlug(slug);
  const c = iso2 ? countryByIso2(gazetteerJson as unknown as GazetteerData, iso2) : undefined;
  return ogCard({
    kicker: "WATCHDAWG · LIVE",
    title: c ? `${c.name}: live events` : "Live events map",
    subtitle: "Conflict, security, unrest and natural hazards — updated continuously from validated sources.",
  });
}
