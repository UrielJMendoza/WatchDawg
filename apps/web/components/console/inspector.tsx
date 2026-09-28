"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, Check, Crosshair, ExternalLink, Filter, Link2, Plane, Satellite, Star, X } from "lucide-react";
import type { Hotspot, Incident, Relation, SourceHealth } from "@/lib/osint/types";
import type { AirTrack, SatElement } from "@/lib/osint/tracks/types";
import { periodMinutes, satState } from "@/lib/console/orbits";
import { CATEGORIES, DOMAINS, DOMAIN_ORDER, domainOf, severityLabel } from "@/lib/osint/taxonomy";
import { formatDms, haversineKm } from "@/lib/osint/geo";
import type { CountryRow } from "@/lib/osint/gazetteer";
import type { Selection } from "@/lib/console/state";
import { fatalitiesOf } from "@/lib/console/state";
import { ago, GRADE_TEXT, SOURCE_LABEL, utcStamp } from "@/lib/console/format";
import { cn } from "@/lib/utils";
import { CategoryTag, DomainSwatch, GradeBadge, Meter, SectionTitle, Sparkline } from "./primitives";

interface Props {
  selection: Selection | null;
  aircraft: AirTrack[];
  satellites: SatElement[];
  relations: Relation[];
  incidents: Incident[];
  byId: Map<string, Incident>;
  hotspots: Hotspot[];
  sources: SourceHealth[];
  country: (iso2: string | undefined) => CountryRow | undefined;
  now: number;
  freshIds: Set<string>;
  onSelect: (s: Selection | null) => void;
  onFlyTo: (lat: number, lon: number, zoom?: number) => void;
  onFilterCountry: (iso2: string) => void;
  watching: (iso2: string) => boolean;
  onToggleWatch: (iso2: string) => void;
}

export function Inspector(p: Props) {
  const sel = p.selection;
  if (sel?.kind === "incident") {
    const inc = p.byId.get(sel.id);
    if (inc) return <IncidentDossier inc={inc} {...p} />;
  }
  if (sel?.kind === "hotspot") {
    const h = p.hotspots.find((x) => x.id === sel.id);
    if (h) return <HotspotDossier h={h} {...p} />;
  }
  if (sel?.kind === "country") return <CountryDossier iso2={sel.iso2} {...p} />;
  if (sel?.kind === "air") {
    const a = p.aircraft.find((x) => x.id === sel.id);
    if (a) return <AirDossier a={a} {...p} />;
  }
  if (sel?.kind === "rel") {
    const rel = p.relations.find((x) => x.id === sel.id);
    if (rel) return <RelationDossier rel={rel} {...p} />;
  }
  if (sel?.kind === "sat") {
    const sat = p.satellites.find((x) => x.id === sel.id);
    if (sat) return <SatDossier sat={sat} {...p} />;
  }
  return <Feed {...p} />;
}

function Header({ kicker, title, onClose, children }: { kicker: React.ReactNode; title: string; onClose: () => void; children?: React.ReactNode }) {
  return (
    <header className="border-b border-border px-4 pb-3 pt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">{kicker}</div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-sm p-1 text-muted-foreground hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <h2 className="mt-2 text-[15px] font-semibold leading-snug tracking-tight">{title}</h2>
      {children}
    </header>
  );
}

function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="chip hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(window.location.href).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="h-3 w-3" /> : <Link2 className="h-3 w-3" />} {done ? "Copied" : "Link"}
    </button>
  );
}

// ─── Incident ─────────────────────────────────────────────────────────────

function IncidentDossier({ inc, incidents, now, onSelect, onFlyTo, country }: Props & { inc: Incident }) {
  const nearby = useMemo(
    () =>
      incidents
        .filter((i) => i.id !== inc.id)
        .map((i) => ({ i, km: haversineKm(inc.lat, inc.lon, i.lat, i.lon) }))
        .filter((x) => x.km < 150)
        .sort((a, b) => a.km - b.km)
        .slice(0, 6),
    [incidents, inc],
  );
  const fatal = fatalitiesOf(inc);
  const sev = severityLabel(inc.severity);
  const c = country(inc.country);
  const metrics = Object.entries(inc.metrics ?? {}).filter(([k]) => k !== "reportedFatalities");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        kicker={
          <>
            <CategoryTag category={inc.category} />
            <GradeBadge reliability={inc.reliability} credibility={inc.credibility} />
          </>
        }
        title={inc.title}
        onClose={() => onSelect(null)}
      >
        <p className="mt-1 text-xs text-muted-foreground">
          {inc.label} · {inc.place}
          {c && !inc.place.includes(c.name) ? `, ${c.name}` : ""}
        </p>
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="section-header mb-1">Severity · {sev}</div>
            <Meter value={inc.severity} label="Severity" />
          </div>
          <div>
            <div className="section-header mb-1">Confidence</div>
            <Meter value={inc.confidence} label="Confidence" />
          </div>
        </div>

        <dl className="grid grid-cols-[88px_1fr] gap-x-3 gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Location</dt>
          <dd className="font-mono text-[11px]">
            {formatDms(inc.lat, inc.lon)} <span className="text-muted-foreground">· {inc.precision}</span>
          </dd>
          <dt className="text-muted-foreground">First seen</dt>
          <dd className="font-mono text-[11px]">
            {utcStamp(inc.firstSeen)} <span className="text-muted-foreground">({ago(inc.firstSeen, now)})</span>
          </dd>
          <dt className="text-muted-foreground">Last update</dt>
          <dd className="font-mono text-[11px]">
            {utcStamp(inc.lastSeen)} <span className="text-muted-foreground">({ago(inc.lastSeen, now)})</span>
          </dd>
          <dt className="text-muted-foreground">Reports</dt>
          <dd className="font-mono text-[11px]">
            {inc.reports} from {inc.outlets} outlet{inc.outlets === 1 ? "" : "s"}
          </dd>
          {fatal > 0 && (
            <>
              <dt className="text-muted-foreground">Fatalities</dt>
              <dd className="font-mono text-[11px]">{fatal} reported (unverified)</dd>
            </>
          )}
          {inc.actors?.length ? (
            <>
              <dt className="text-muted-foreground">Actors</dt>
              <dd className="text-[11px]">{inc.actors.join(" · ")}</dd>
            </>
          ) : null}
          {metrics.map(([k, v]) => (
            <FragmentRow key={k} k={k} v={String(v)} />
          ))}
        </dl>

        {inc.summary && <p className="rounded-sm border-l-2 border-border bg-surface-2/40 px-3 py-2 text-xs leading-relaxed text-foreground/85">{inc.summary}</p>}

        <section className="space-y-2">
          <SectionTitle>Assessment</SectionTitle>
          <div className="rounded-sm border border-border bg-surface-2/30 p-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">
              {inc.reliability}
              {inc.credibility}
            </span>{" "}
            — best source is <span className="text-foreground">{GRADE_TEXT[inc.reliability].toLowerCase()}</span>; the information is{" "}
            <span className="text-foreground">{GRADE_TEXT[String(inc.credibility)].toLowerCase()}</span>.{" "}
            {inc.sources.length > 1
              ? `${inc.sources.length} independent source types agree: ${inc.sources.map((s) => SOURCE_LABEL[s]).join(", ")}.`
              : `Single source type (${SOURCE_LABEL[inc.sources[0]]}); treat as unconfirmed until corroborated.`}
          </div>
        </section>

        <section className="space-y-1.5">
          <SectionTitle right={<span className="font-mono text-[10px] text-muted-foreground">{inc.signals.length}</span>}>Source reports</SectionTitle>
          <ul className="space-y-1">
            {inc.signals.map((s, k) => (
              <li key={k} className="rounded-sm border border-border/70 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  <span>
                    {SOURCE_LABEL[s.source]}
                    {s.outlet ? ` · ${s.outlet}` : ""}
                  </span>
                  <span>{ago(s.time, now)}</span>
                </div>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer nofollow" className="mt-0.5 flex items-start gap-1 text-xs leading-snug hover:underline">
                    <span className="flex-1">{s.title}</span>
                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                  </a>
                ) : (
                  <p className="mt-0.5 text-xs leading-snug">{s.title}</p>
                )}
              </li>
            ))}
          </ul>
        </section>

        {nearby.length > 0 && (
          <section className="space-y-1">
            <SectionTitle>Within 150 km</SectionTitle>
            <ul>
              {nearby.map(({ i, km }) => (
                <li key={i.id}>
                  <button type="button" onClick={() => onSelect({ kind: "incident", id: i.id })} className="flex w-full items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-surface-2/60">
                    <DomainSwatch color={DOMAINS[domainOf(i.category)].color} className="h-2 w-2" />
                    <span className="min-w-0 flex-1 truncate text-xs">{i.title}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{Math.round(km)} km</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <footer className="flex items-center gap-1.5 border-t border-border px-4 py-2">
        <button type="button" onClick={() => onFlyTo(inc.lat, inc.lon, inc.precision === "country" ? 4 : 8)} className="chip hover:text-foreground">
          <Crosshair className="h-3 w-3" /> Fly to
        </button>
        <CopyLink />
      </footer>
    </div>
  );
}

const METRIC_LABELS: Record<string, string> = {
  magnitude: "Magnitude",
  depthKm: "Depth (km)",
  feltReports: "Felt reports",
  significance: "USGS significance",
  stations: "Seismic stations",
  // GDELT's own counts for its coded event; the Reports row above totals
  // every source.
  articles: "GDELT articles",
  outlets: "GDELT outlets",
  goldstein: "Goldstein scale",
  tone: "Media tone (GDELT)",
  cameo: "CAMEO code",
  fixes: "Track fixes",
  alert: "GDACS alert",
  intensity: "Intensity",
  offence: "Offence",
  arrest: "Arrest made",
  sources: "Cited sources",
};

function FragmentRow({ k, v }: { k: string; v: string }) {
  const label = METRIC_LABELS[k] ?? k.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase());
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-[11px]">{v}</dd>
    </>
  );
}

// ─── Hotspot ──────────────────────────────────────────────────────────────

function HotspotDossier({ h, byId, now, onSelect, onFlyTo }: Props & { h: Hotspot }) {
  const members = h.incidentIds.map((id) => byId.get(id)).filter((i): i is Incident => !!i);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header kicker={<span className="chip">Hotspot</span>} title={h.name} onClose={() => onSelect(null)}>
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {h.incidents} incidents · radius {h.radiusKm} km · index {h.score.toFixed(1)}
        </p>
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
          {DOMAIN_ORDER.map((d) => (
            <div key={d} className="rounded-sm border border-border bg-surface-2/30 px-2 py-1.5">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <DomainSwatch color={DOMAINS[d].color} className="h-2 w-2" />
                {DOMAINS[d].label.split(" ")[0]}
              </div>
              <div className="text-lg font-semibold">{h.domains[d]}</div>
            </div>
          ))}
        </div>
        <section className="space-y-1">
          <SectionTitle right={<span className="font-mono text-[10px] text-muted-foreground">trend {h.trend > 0 ? "+" : ""}{Math.round(h.trend * 100)}%</span>}>
            Activity over window
          </SectionTitle>
          <Sparkline values={h.spark} width={320} height={40} className="w-full" label={`Incidents over time in ${h.name}`} />
        </section>
        <section className="space-y-1">
          <SectionTitle>Incidents</SectionTitle>
          <IncidentList items={members} now={now} onSelect={onSelect} />
        </section>
      </div>
      <footer className="flex items-center gap-1.5 border-t border-border px-4 py-2">
        <button type="button" onClick={() => onFlyTo(h.lat, h.lon, 6)} className="chip hover:text-foreground">
          <Crosshair className="h-3 w-3" /> Fly to
        </button>
        <CopyLink />
      </footer>
    </div>
  );
}

// ─── Country ──────────────────────────────────────────────────────────────

function CountryDossier({ iso2, incidents, now, onSelect, country, onFilterCountry, onFlyTo, watching, onToggleWatch }: Props & { iso2: string }) {
  const c = country(iso2);
  const items = useMemo(() => incidents.filter((i) => i.country === iso2).sort((a, b) => b.severity * b.confidence - a.severity * a.confidence), [incidents, iso2]);
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.category, (m.get(i.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [items]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header kicker={<span className="chip">Country</span>} title={c?.name ?? iso2} onClose={() => onSelect(null)}>
        {c && (
          <p className="mt-1 text-xs text-muted-foreground">
            {c.subregion || c.region}
            {c.capital ? ` · capital ${c.capital}` : ""}
          </p>
        )}
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold">{items.length}</span>
          <span className="text-xs text-muted-foreground">incidents in window</span>
        </div>
        {byCat.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {byCat.map(([cat, n]) => (
              <span key={cat} className="chip">
                <DomainSwatch color={DOMAINS[CATEGORIES[cat as keyof typeof CATEGORIES].domain].color} className="h-2 w-2" />
                {CATEGORIES[cat as keyof typeof CATEGORIES].label} {n}
              </span>
            ))}
          </div>
        )}
        <IncidentList items={items.slice(0, 40)} now={now} onSelect={onSelect} />
      </div>
      <footer className="flex items-center gap-1.5 border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={() => onToggleWatch(iso2)}
          aria-pressed={watching(iso2)}
          className={cn("chip hover:text-foreground", watching(iso2) && "border-primary/50 text-primary")}
        >
          <Star className={cn("h-3 w-3", watching(iso2) && "fill-current")} /> {watching(iso2) ? "Watching" : "Watch"}
        </button>
        <button type="button" onClick={() => onFilterCountry(iso2)} className="chip hover:text-foreground">
          <Filter className="h-3 w-3" /> Filter globe
        </button>
        {c && (
          <button type="button" onClick={() => onFlyTo(c.lat, c.lon, 4)} className="chip hover:text-foreground">
            <Crosshair className="h-3 w-3" /> Fly to
          </button>
        )}
        <CopyLink />
      </footer>
    </div>
  );
}

// ─── Relationship ─────────────────────────────────────────────────────────

const STANCE_TEXT: Record<Relation["stance"], string> = {
  hostile: "Hostile — coercion, threats or force dominate the coverage",
  mixed: "Mixed — neither cooperation nor conflict dominates",
  cooperative: "Cooperative — talks, agreements or aid dominate the coverage",
};

function RelationDossier({ rel, relations, incidents, now, country, onSelect }: Props & { rel: Relation }) {
  const from = country(rel.from);
  const to = country(rel.to);
  const reverse = relations.find((r) => r.from === rel.to && r.to === rel.from);
  const related = incidents
    .filter((i) => i.country === rel.to && (i.category === rel.category || domainOf(i.category) === domainOf(rel.category)))
    .sort((a, b) => b.severity * b.confidence - a.severity * a.confidence)
    .slice(0, 10);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header kicker={<span className="chip">Country link</span>} title={`${from?.name ?? rel.from} → ${to?.name ?? rel.to}`} onClose={() => onSelect(null)}>
        <p className="mt-1 text-xs text-muted-foreground">{STANCE_TEXT[rel.stance]}</p>
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <Rows
          rows={[
            ["Coded events", rel.events.toLocaleString()],
            ["Articles", rel.articles.toLocaleString()],
            ["Outlets", rel.outlets.toLocaleString()],
            ["Goldstein", `${rel.goldstein > 0 ? "+" : ""}${rel.goldstein.toFixed(2)} (−10 hostile … +10 cooperative)`],
            ["Media tone", rel.tone.toFixed(2)],
            ["Dominant type", CATEGORIES[rel.category].label],
            ["Last coded", ago(rel.lastSeen, now || Date.now())],
          ]}
        />
        <section className="space-y-1">
          <SectionTitle>Coverage over window</SectionTitle>
          <Sparkline values={rel.spark} width={320} height={40} className="w-full" label={`Articles over time, ${rel.id}`} />
        </section>
        {reverse && (
          <button
            type="button"
            onClick={() => onSelect({ kind: "rel", id: reverse.id })}
            className="w-full rounded-sm border border-border px-3 py-2 text-left text-xs hover:bg-surface-2/60"
          >
            Reverse link: {to?.name ?? rel.to} → {from?.name ?? rel.from}{" "}
            <span className="text-muted-foreground">
              · {reverse.stance} · {reverse.articles} articles
            </span>
          </button>
        )}
        {related.length > 0 && (
          <section className="space-y-1">
            <SectionTitle>Related incidents in {to?.name ?? rel.to}</SectionTitle>
            <IncidentList items={related} now={now} onSelect={onSelect} />
          </section>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          From GDELT&apos;s machine coding of actor nationality in news. A link needs 8+ articles from 2+ outlets across 2+ coded events in
          the window; it describes coverage, not a verified count of actions.
        </p>
      </div>
      <footer className="flex items-center gap-1.5 border-t border-border px-4 py-2">
        <CopyLink />
      </footer>
    </div>
  );
}

// ─── Tracks ───────────────────────────────────────────────────────────────

const EMERGENCY_TEXT: Record<string, string> = {
  general: "General emergency (7700)",
  radio: "Radio failure (7600)",
  hijack: "Unlawful interference (7500)",
  medical: "Medical / lifeguard",
  fuel: "Minimum fuel",
  downed: "Aircraft downed",
  unlawful: "Unlawful interference",
};

function Rows({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-xs">
      {rows.map(([k, v]) => (
        <FragmentPair key={k} k={k} v={v} />
      ))}
    </dl>
  );
}

function FragmentPair({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-mono text-[11px]">{v}</dd>
    </>
  );
}

function AirDossier({ a, onSelect, onFlyTo }: Props & { a: AirTrack }) {
  const title = a.callsign ?? a.registration ?? a.id.toUpperCase();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        kicker={
          <span className="chip">
            <Plane className="h-3 w-3" aria-hidden /> {a.military ? "Military aircraft" : "Aircraft"}
          </span>
        }
        title={title}
        onClose={() => onSelect(null)}
      >
        <p className="mt-1 text-xs text-muted-foreground">{[a.description, a.type].filter(Boolean).join(" · ") || "Type unknown"}</p>
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        {a.emergency !== "none" && (
          <div className="flex items-start gap-2 rounded-sm border border-critical/50 bg-critical/10 px-3 py-2 text-xs text-critical">
            <AlertOctagon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <div className="font-semibold uppercase tracking-wide">Emergency</div>
              <div className="text-foreground/85">{EMERGENCY_TEXT[a.emergency] ?? a.emergency}</div>
            </div>
          </div>
        )}
        <Rows
          rows={[
            ["ICAO address", a.id.toUpperCase()],
            ["Registration", a.registration ?? "—"],
            ["Position", formatDms(a.lat, a.lon)],
            ["Altitude", a.onGround ? "On ground" : a.altitude != null ? `${a.altitude.toLocaleString()} ft` : "—"],
            ["Ground speed", a.speed != null ? `${Math.round(a.speed)} kt` : "—"],
            ["Track", a.heading != null ? `${Math.round(a.heading)}°` : "—"],
            ["Squawk", a.squawk ?? "—"],
            ["Position age", `${a.positionAge} s`],
          ]}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Position from community ADS-B receivers. Aircraft that disable their transponders or aren&apos;t in range of a receiver are not shown.
        </p>
      </div>
      <footer className="flex items-center gap-1.5 border-t border-border px-4 py-2">
        <button type="button" onClick={() => onFlyTo(a.lat, a.lon, 7)} className="chip hover:text-foreground">
          <Crosshair className="h-3 w-3" /> Fly to
        </button>
        <a href={`https://adsb.lol/?icao=${a.id}`} target="_blank" rel="noreferrer" className="chip hover:text-foreground">
          <ExternalLink className="h-3 w-3" /> Track history
        </a>
        <CopyLink />
      </footer>
    </div>
  );
}

const GROUP_LABEL: Record<string, string> = {
  stations: "Space station",
  military: "Military",
  resource: "Earth observation",
  weather: "Weather",
};

function SatDossier({ sat, now, onSelect, onFlyTo }: Props & { sat: SatElement }) {
  const st = satState(sat, new Date(now || Date.now()));
  const period = periodMinutes(sat.meanMotion);
  const epochAgeDays = ((now || Date.now()) - sat.epoch) / 86_400_000;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Header
        kicker={
          <span className="chip">
            <Satellite className="h-3 w-3" aria-hidden /> {GROUP_LABEL[sat.group] ?? sat.group}
          </span>
        }
        title={sat.name}
        onClose={() => onSelect(null)}
      >
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">NORAD {sat.id}</p>
      </Header>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
        <Rows
          rows={[
            ["Sub-satellite point", st ? formatDms(st.lat, st.lon) : "—"],
            ["Altitude", st ? `${Math.round(st.altKm).toLocaleString()} km` : "—"],
            ["Velocity", st ? `${st.speedKms.toFixed(2)} km/s` : "—"],
            ["Inclination", `${sat.inclination.toFixed(2)}°`],
            ["Period", Number.isFinite(period) ? `${period.toFixed(1)} min` : "—"],
            ["Element set age", `${epochAgeDays.toFixed(1)} days`],
          ]}
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Position propagated live in your browser with SGP4 from a checksum-validated CelesTrak element set. The dashed line is the ground
          track ±50 minutes.
        </p>
      </div>
      <footer className="flex items-center gap-1.5 border-t border-border px-4 py-2">
        {st && (
          <button type="button" onClick={() => onFlyTo(st.lat, st.lon, 2.4)} className="chip hover:text-foreground">
            <Crosshair className="h-3 w-3" /> Fly to
          </button>
        )}
        <a href={`https://celestrak.org/satcat/table-satcat.php?CATNR=${sat.id}`} target="_blank" rel="noreferrer" className="chip hover:text-foreground">
          <ExternalLink className="h-3 w-3" /> SATCAT
        </a>
        <CopyLink />
      </footer>
    </div>
  );
}

// ─── Live feed ────────────────────────────────────────────────────────────

type FeedTab = "all" | "news" | "war" | "crime" | "hazards";
const FEED_TABS: Array<{ id: FeedTab; label: string; test: (i: Incident) => boolean }> = [
  { id: "all", label: "All", test: () => true },
  { id: "news", label: "News", test: (i) => i.sources.includes("wire") },
  { id: "war", label: "War", test: (i) => i.category === "conflict" || i.category === "security" },
  { id: "crime", label: "Crime", test: (i) => i.category === "crime" },
  { id: "hazards", label: "Hazards", test: (i) => domainOf(i.category) === "hazard" },
];

function Feed({ incidents, now, onSelect, freshIds }: Props) {
  const [tab, setTab] = useState<FeedTab>("all");
  const [sort, setSort] = useState<"latest" | "severity">("latest");
  const [showWeak, setShowWeak] = useState(false);
  const { items, hidden } = useMemo(() => {
    const t = FEED_TABS.find((x) => x.id === tab)!;
    const all = incidents.filter(t.test);
    // Newest-first would otherwise lead with single-source reports graded
    // "improbable" (credibility 5); they stay on the globe and in search.
    const list = sort === "latest" && !showWeak ? all.filter((i) => i.credibility < 5) : all;
    // "Latest" means newest stories: ongoing ones are re-reported every few
    // minutes, so ordering by last sighting would pin old news to the top.
    list.sort((a, b) =>
      sort === "latest"
        ? b.firstSeen - a.firstSeen
        : b.severity * (0.4 + 0.6 * b.confidence) - a.severity * (0.4 + 0.6 * a.confidence),
    );
    return { items: list.slice(0, 150), hidden: all.length - list.length };
  }, [incidents, tab, sort, showWeak]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-b border-border px-4 pt-3">
        <div className="flex items-center justify-between">
          <h2 className="section-header flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-blip absolute inline-flex h-full w-full rounded-full bg-good" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
            </span>
            Live feed
          </h2>
          <button type="button" onClick={() => setSort(sort === "latest" ? "severity" : "latest")} className="chip hover:text-foreground">
            Sort: {sort}
          </button>
        </div>
        <div role="tablist" aria-label="Feed" className="mt-2 flex gap-3">
          {FEED_TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              type="button"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn("relative pb-2 text-xs transition-colors", tab === t.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {t.label}
              {tab === t.id && <span className="absolute inset-x-0 bottom-0 h-px bg-primary" />}
            </button>
          ))}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {(hidden > 0 || showWeak) && sort === "latest" && (
          <button
            type="button"
            onClick={() => setShowWeak(!showWeak)}
            className="mb-1 flex w-full items-center justify-between rounded-sm px-2.5 py-1.5 text-left font-mono text-[10px] text-muted-foreground hover:bg-surface-2/60 hover:text-foreground"
          >
            <span>
              {showWeak ? "Including unconfirmed single-source reports" : `${hidden} unconfirmed single-source reports hidden`}
            </span>
            <span className="text-primary">{showWeak ? "Hide" : "Show"}</span>
          </button>
        )}
        {items.length === 0 ? (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">Nothing in this window yet.</p>
        ) : (
          <IncidentList items={items} now={now} onSelect={onSelect} freshIds={freshIds} rich />
        )}
      </div>
    </div>
  );
}

function IncidentList({ items, now, onSelect, freshIds, rich }: { items: Incident[]; now: number; onSelect: (s: Selection) => void; freshIds?: Set<string>; rich?: boolean }) {
  return (
    <ul className="space-y-0.5">
      {items.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            onClick={() => onSelect({ kind: "incident", id: i.id })}
            className={cn(
              "w-full rounded-sm border-l-2 px-2.5 py-2 text-left transition-colors hover:bg-surface-2/60",
              freshIds?.has(i.id) ? "bg-primary/[0.04]" : "",
            )}
            style={{ borderLeftColor: DOMAINS[domainOf(i.category)].color }}
          >
            <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
              <span>{CATEGORIES[i.category].label}</span>
              <span>·</span>
              <span title={`First reported ${ago(i.firstSeen, now)}, last reported ${ago(i.lastSeen, now)}`}>
                {ago(i.firstSeen, now)}
              </span>
              {i.lastSeen - i.firstSeen > 3_600_000 && now - i.lastSeen < 3_600_000 && (
                <span className="text-foreground/70">· updated</span>
              )}
              {freshIds?.has(i.id) && <span className="text-primary">new</span>}
              <GradeBadge reliability={i.reliability} credibility={i.credibility} className="ml-auto h-4 text-[9px]" />
            </div>
            <div className={cn("mt-0.5 leading-snug", rich ? "text-[13px]" : "text-xs")}>{i.title}</div>
            {rich && (
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {i.place} · {i.sources.map((s) => SOURCE_LABEL[s]).join(" + ")}
              </div>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
