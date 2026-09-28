import Link from "next/link";
import type { Incident, Snapshot } from "@/lib/osint/types";
import { CATEGORIES } from "@/lib/osint/taxonomy";
import { countryByIso2 } from "@/lib/osint/gazetteer";
import { gazetteer } from "@/lib/osint/engine";
import { countrySlug } from "@/lib/site";
import { TopicNav } from "./site-header";

/**
 * Server-rendered situation brief: the same live data the globe shows, as
 * plain semantic HTML. It is what search engines index and what screen
 * readers read, and it sits right below the console for anyone who scrolls.
 */
export function SituationBrief({ snap, heading, incidents }: { snap: Snapshot | null; heading: string; incidents?: Incident[] }) {
  const list = (incidents ?? snap?.incidents ?? []).slice(0, 40);
  const updated = snap ? new Date(snap.generatedAt) : null;
  return (
    <section aria-labelledby="brief-heading" className="mx-auto max-w-5xl px-4 py-12 text-sm">
      <h1 id="brief-heading" className="text-2xl font-semibold tracking-tight">
        {heading}
      </h1>
      {updated && (
        <p className="mt-1 text-muted-foreground">
          Updated <time dateTime={updated.toISOString()}>{updated.toUTCString()}</time> · {snap!.stats.incidents} incidents across {snap!.stats.countries}{" "}
          countries in the last 24 hours · {snap!.stats.corroborated} corroborated by independent sources.
        </p>
      )}
      {snap && snap.hotspots.length > 0 && !incidents && (
        <>
          <h2 className="mt-8 text-lg font-semibold">Hotspots</h2>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            {snap.hotspots.slice(0, 10).map((h) => {
              const c = countryByIso2(gazetteer, h.country);
              return (
                <li key={h.id}>
                  <strong>{h.name}</strong> — {h.incidents} incidents, mostly {CATEGORIES[h.topCategory].label.toLowerCase()}
                  {c && (
                    <>
                      {" "}
                      (<Link href={`/region/${countrySlug(c.name, c.iso2)}`}>live events in {c.name}</Link>)
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <h2 className="mt-8 text-lg font-semibold">Latest incidents</h2>
      {list.length === 0 ? (
        <p className="mt-2 text-muted-foreground">No incidents reported in this window yet.</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {list.map((i) => {
            const c = countryByIso2(gazetteer, i.country);
            const link = i.signals.find((s) => s.url)?.url;
            return (
              <li key={i.id}>
                <article>
                  <h3 className="font-medium">
                    <Link href={`/?sel=i:${i.id}`}>{i.title}</Link>
                  </h3>
                  <p className="text-muted-foreground">
                    {CATEGORIES[i.category].label} · {i.place}
                    {c && !i.place.includes(c.name) ? `, ${c.name}` : ""} ·{" "}
                    <time dateTime={new Date(i.lastSeen).toISOString()}>{new Date(i.lastSeen).toUTCString()}</time> · grade {i.reliability}
                    {i.credibility} · {i.sources.join(", ")}
                    {link && (
                      <>
                        {" · "}
                        <a href={link} rel="nofollow noreferrer" target="_blank">
                          source
                        </a>
                      </>
                    )}
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-10 space-y-2">
        <h2 className="section-header">Live maps</h2>
        <TopicNav />
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Data: USGS, NASA EONET, GDACS, US National Weather Service, GDELT, ACLED, San Francisco &amp; Chicago police open data and international newsrooms. See the{" "}
        <Link href="/methodology">methodology</Link> for how sources are validated, fused and graded.
      </p>
    </section>
  );
}
