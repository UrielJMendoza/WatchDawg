import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/console/top-bar";
import { ADAPTERS } from "@/lib/osint/engine";

export const metadata: Metadata = {
  title: "Methodology — sources, validation and grading",
  description:
    "How WatchDawg ingests live data from USGS, NASA, GDACS, GDELT, ACLED, police open data and newsrooms; how every record is validated; and how incidents are fused and graded with the NATO Admiralty system.",
  alternates: { canonical: "/methodology" },
};

export default function Methodology() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-surface/80">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-6 w-6" />
            <span className="font-mono text-xs font-bold tracking-[0.28em]">WATCHDAWG</span>
          </Link>
          <Link href="/" className="ml-auto font-mono text-[11px] uppercase tracking-wider text-primary">
            Open the globe →
          </Link>
        </div>
      </header>
      <main className="prose-sm mx-auto max-w-3xl space-y-6 px-4 py-10 text-sm leading-relaxed text-foreground/90">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Methodology</h1>
        <p>
          WatchDawg shows only live data pulled from the sources below. It never fabricates, simulates or back-fills events: if a source
          is unreachable, its data simply isn&apos;t on the map, and its status says so.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Sources</h2>
        <ul className="space-y-3">
          {ADAPTERS.map((a) => (
            <li key={a.meta.id}>
              <a href={a.meta.homepage} className="font-medium text-foreground underline-offset-2 hover:underline" rel="noreferrer" target="_blank">
                {a.meta.name}
              </a>{" "}
              <span className="text-muted-foreground">
                — {a.meta.kind}, reliability grade {a.meta.reliability}. {a.meta.description} <em>{a.meta.coverage}.</em>
              </span>
            </li>
          ))}
        </ul>

        <h2 className="text-lg font-semibold text-foreground">Validation</h2>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li><strong>Integrity.</strong> GDELT exports are checked against the MD5 published in their manifest before parsing.</li>
          <li><strong>Schema.</strong> Every record is parsed against a strict schema; malformed records are rejected, not repaired.</li>
          <li><strong>Values.</strong> Coordinates must be on Earth and not the (0,0) geocoder failure point; timestamps must parse and not be in the future; links must be http(s).</li>
          <li><strong>Relevance.</strong> Statements and appeals, minor offences, closed events and headlines that can&apos;t be classified or placed are filtered out.</li>
          <li><strong>Evidence.</strong> Machine-coded news events need at least three articles or two independent outlets.</li>
          <li><strong>Privacy.</strong> Sex offences and domestic incidents are excluded from police data.</li>
        </ol>
        <p>Every rejected or filtered record is counted by reason in the Sources panel, so the pipeline is auditable.</p>

        <h2 className="text-lg font-semibold text-foreground">Fusion and grading</h2>
        <p>
          Observations of the same kind of event, close in space and time, are merged into one incident. Confidence combines each
          independent source&apos;s reliability and evidence strength (noisy-OR), so corroboration by a second, independent source raises
          confidence far more than repetition within one source. Each incident carries a NATO Admiralty grade: a letter for the best
          source&apos;s reliability (A–F) and a number for the information&apos;s credibility (1 = confirmed by independent sources … 5 = improbable).
        </p>
        <p>
          Hotspots are regions where incidents concentrate, ranked by an activity index — severity × confidence summed across incidents
          within roughly 300 km — with a trend comparing the latest quarter of the window to the rest.
        </p>

        <h2 className="text-lg font-semibold text-foreground">Limitations</h2>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>GDELT is machine-coded from news and is noisy; its events are graded C until corroborated.</li>
          <li>ACLED is researched by analysts and released weekly, so its newest events are days old.</li>
          <li>Police open data covers San Francisco and Chicago, is generalised to the block, and is published with a lag of one to eight days.</li>
          <li>Reported fatality counts are as reported by sources and are not independently verified.</li>
        </ul>
      </main>
    </div>
  );
}
