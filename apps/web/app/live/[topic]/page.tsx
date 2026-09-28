import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSnapshot } from "@/lib/osint/engine";
import { CATEGORIES } from "@/lib/osint/taxonomy";
import { topicBySlug } from "@/lib/seo/topics";
import { SituationBrief } from "@/components/seo/brief";
import { SiteHeader, TopicNav } from "@/components/seo/site-header";
import { SITE_NAME, siteUrl } from "@/lib/site";

// Live data on every request (the engine memoises upstream pulls).
export const dynamic = "force-dynamic";

type Params = Promise<{ topic: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const t = topicBySlug((await params).topic);
  if (!t) return {};
  const url = `/live/${t.slug}`;
  return {
    title: t.title,
    description: t.description,
    keywords: t.keywords,
    alternates: { canonical: url },
    openGraph: { title: t.title, description: t.description, url },
    twitter: { card: "summary_large_image", title: t.title, description: t.description },
  };
}

export default async function TopicPage({ params }: { params: Params }) {
  const t = topicBySlug((await params).topic);
  if (!t) notFound();
  const snap = await getSnapshot(t.window).catch(() => null);
  // The snapshot is already ranked: severe, well-attested and recent first.
  const incidents = (snap?.incidents ?? []).filter(t.match);
  const byCat = new Map<string, number>();
  const countries = new Set<string>();
  for (const i of incidents) {
    byCat.set(i.category, (byCat.get(i.category) ?? 0) + 1);
    if (i.country) countries.add(i.country);
  }
  const globe = `/?q=${encodeURIComponent(t.query)}${t.window !== "24h" ? `&w=${t.window}` : ""}`;
  const base = siteUrl();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: t.title,
        description: t.description,
        url: `${base}/live/${t.slug}`,
        isPartOf: { "@type": "WebSite", name: SITE_NAME, url: base },
        dateModified: snap ? new Date(snap.generatedAt).toISOString() : undefined,
      },
      {
        "@type": "ItemList",
        name: `${t.h1}: latest incidents`,
        numberOfItems: Math.min(incidents.length, 20),
        itemListElement: incidents.slice(0, 20).map((i, n) => ({
          "@type": "ListItem",
          position: n + 1,
          name: i.title,
          url: `${base}/?sel=i:${i.id}`,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: base },
          { "@type": "ListItem", position: 2, name: t.h1, item: `${base}/live/${t.slug}` },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SiteHeader crumb={t.h1} cta={{ href: globe, label: "Open on the globe" }} />
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-8">
        <TopicNav current={t.slug} />
        <p className="max-w-3xl text-sm leading-relaxed text-foreground/85">{t.intro}</p>
        <div className="flex flex-wrap gap-2">
          <span className="chip">
            {incidents.length} incidents · last {t.window}
          </span>
          <span className="chip">{countries.size} countries</span>
          {[...byCat.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([cat, n]) => (
              <span key={cat} className="chip">
                {CATEGORIES[cat as keyof typeof CATEGORIES].label} · {n}
              </span>
            ))}
        </div>
      </div>
      <SituationBrief snap={snap} incidents={incidents} heading={`${t.h1}: most significant incidents`} />
      <div className="mx-auto max-w-5xl px-4 pb-12">
        <Link href={globe} className="text-sm text-primary hover:underline">
          Explore these incidents on the live 3D globe →
        </Link>
      </div>
    </div>
  );
}
