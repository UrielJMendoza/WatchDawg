import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { countryByIso2 } from "@/lib/osint/gazetteer";
import { gazetteer, getSnapshot } from "@/lib/osint/engine";
import { CATEGORIES } from "@/lib/osint/taxonomy";
import { SituationBrief } from "@/components/seo/brief";
import { SiteHeader } from "@/components/seo/site-header";
import { SITE_NAME, countrySlug, iso2FromSlug, siteUrl } from "@/lib/site";

// Reads live data on every request (the engine memoises upstream pulls).
export const dynamic = "force-dynamic";

type Params = Promise<{ slug: string }>;

function resolve(slug: string) {
  const iso2 = iso2FromSlug(slug);
  return iso2 ? countryByIso2(gazetteer, iso2) : undefined;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const c = resolve((await params).slug);
  if (!c) return {};
  const title = `${c.name}: live events map — conflict, protests, crime & disasters`;
  const description = `Real-time incidents in ${c.name}: armed conflict, security incidents, protests, natural hazards and breaking news, fused from validated open sources and updated continuously.`;
  const url = `/region/${countrySlug(c.name, c.iso2)}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

export default async function RegionPage({ params }: { params: Params }) {
  const { slug } = await params;
  const c = resolve(slug);
  if (!c) notFound();
  const canonical = countrySlug(c.name, c.iso2);
  if (slug !== canonical) permanentRedirect(`/region/${canonical}`);

  const snap = await getSnapshot("7d").catch(() => null);
  const incidents = (snap?.incidents ?? []).filter((i) => i.country === c.iso2).sort((a, b) => b.lastSeen - a.lastSeen);
  const byCat = new Map<string, number>();
  for (const i of incidents) byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `${c.name} — live events`,
    url: `${siteUrl()}/region/${canonical}`,
    about: { "@type": "Country", name: c.name, identifier: c.iso2 },
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: siteUrl() },
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: siteUrl() },
        { "@type": "ListItem", position: 2, name: c.name, item: `${siteUrl()}/region/${canonical}` },
      ],
    },
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SiteHeader crumb={c.name} cta={{ href: `/?sel=c:${c.iso2}&cc=${c.iso2}&w=7d`, label: "Open on the globe" }} />
      <div className="mx-auto max-w-5xl px-4 pt-8">
        <p className="section-header">
          {c.subregion || c.region}
          {c.capital ? ` · capital ${c.capital}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[...byCat.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cat, n]) => (
              <span key={cat} className="chip">
                {CATEGORIES[cat as keyof typeof CATEGORIES].label} · {n}
              </span>
            ))}
        </div>
      </div>
      <SituationBrief snap={snap} incidents={incidents} heading={`${c.name}: live events in the last 7 days`} />
    </div>
  );
}
