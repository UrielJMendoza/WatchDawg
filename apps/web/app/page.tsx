import { Suspense } from "react";
import CommandCenter from "@/components/console/command-center";
import { SituationBrief } from "@/components/seo/brief";
import { getSnapshot } from "@/lib/osint/engine";
import { SITE_NAME, siteUrl } from "@/lib/site";

// Live data: rendered per request. The console shell streams immediately and
// fetches its data from the edge-cached /api/v1/snapshot; the server brief
// below it (for crawlers and screen readers) streams in when ready.
export const dynamic = "force-dynamic";

async function LiveBrief() {
  const snap = await getSnapshot("24h").catch(() => null);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebApplication",
        name: SITE_NAME,
        url: siteUrl(),
        applicationCategory: "NewsApplication",
        operatingSystem: "Web",
        description: "Live 3D globe of world events: conflict, crime, unrest and natural hazards, validated and graded.",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
      {
        "@type": "Dataset",
        name: "WatchDawg live incident snapshot",
        description: "Fused, validated incidents from USGS, NASA EONET, GDACS, GDELT, ACLED, police open data and newsrooms.",
        url: `${siteUrl()}/api/v1/snapshot`,
        isAccessibleForFree: true,
        dateModified: snap ? new Date(snap.generatedAt).toISOString() : undefined,
        spatialCoverage: { "@type": "Place", name: "World" },
        distribution: { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: `${siteUrl()}/api/v1/snapshot` },
      },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <SituationBrief snap={snap} heading="Live world events — conflict, crime, unrest and disasters" />
    </>
  );
}

export default function Page() {
  return (
    <main>
      <CommandCenter initial={null} />
      <Suspense fallback={null}>
        <LiveBrief />
      </Suspense>
    </main>
  );
}
