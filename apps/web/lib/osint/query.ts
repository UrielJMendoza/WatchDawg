import type { Category, Domain, Incident, Reliability, SourceId } from "./types";
import { CATEGORIES, domainOf } from "./taxonomy";

/**
 * Analyst query language. Free text plus structured operators:
 *
 *   cat:conflict  domain:hazard  src:usgs  grade:A  cred<=2
 *   country:UA  sev>0.6  conf>=0.8  multi (≥2 independent sources)
 *   fatal (fatalities reported)  precise (not country-level)
 *
 * Operators AND together; comma-separated values OR within one operator
 * (`cat:conflict,unrest`). Quoted phrases stay together in the text part.
 */

export interface QueryFilters {
  categories?: Set<Category>;
  domains?: Set<Domain>;
  sources?: Set<SourceId>;
  reliability?: Set<Reliability>;
  countries?: Set<string>;
  minSeverity?: number;
  minConfidence?: number;
  maxCredibility?: number;
  corroborated?: boolean;
  fatal?: boolean;
  precise?: boolean;
}

export interface ParsedQuery {
  text: string;
  filters: QueryFilters;
  /** Operator tokens that were understood, for echoing back as chips. */
  chips: string[];
  /** Tokens that looked like operators but weren't understood. */
  unknown: string[];
}

const CATEGORY_ALIASES: Record<string, Category> = {
  war: "conflict", fighting: "conflict", military: "conflict", attack: "conflict", strike: "conflict",
  terror: "security", terrorism: "security", crime: "security", arrest: "security",
  protest: "unrest", protests: "unrest", riot: "unrest", riots: "unrest",
  threat: "tension", sanctions: "tension", posture: "tension",
  talks: "diplomacy", politics: "diplomacy", election: "diplomacy", diplomatic: "diplomacy",
  aid: "humanitarian", refugees: "humanitarian", famine: "humanitarian", disease: "humanitarian",
  earthquake: "seismic", quake: "seismic", tsunami: "seismic",
  volcano: "volcanic", eruption: "volcanic",
  cyclone: "storm", hurricane: "storm", typhoon: "storm", weather: "storm",
  fire: "wildfire", fires: "wildfire", wildfires: "wildfire",
  drought: "hazard", ice: "hazard",
};

const DOMAIN_ALIASES: Record<string, Domain> = {
  security: "security", conflict: "security", violence: "security",
  civil: "civil", political: "civil", politics: "civil",
  hazard: "hazard", hazards: "hazard", natural: "hazard", disaster: "hazard", disasters: "hazard",
};

const SOURCE_ALIASES: Record<string, SourceId> = {
  usgs: "usgs", eonet: "eonet", nasa: "eonet", gdacs: "gdacs", gdelt: "gdelt",
  wire: "wire", news: "wire", rss: "wire", acled: "acled", crime: "crime", police: "crime",
  nws: "nws", noaa: "nws", weather: "nws",
};

function tokenize(q: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(q))) out.push(m[1] !== undefined ? `"${m[1]}"` : m[2]);
  return out;
}

function toCategory(v: string): Category | undefined {
  const k = v.toLowerCase();
  if (k in CATEGORIES) return k as Category;
  return CATEGORY_ALIASES[k];
}

export function parseQuery(q: string): ParsedQuery {
  const filters: QueryFilters = {};
  const chips: string[] = [];
  const unknown: string[] = [];
  const text: string[] = [];

  for (const tok of tokenize(q.trim())) {
    if (tok.startsWith('"')) {
      text.push(tok.slice(1, -1));
      continue;
    }
    const lower = tok.toLowerCase();
    if (lower === "multi" || lower === "corroborated") {
      filters.corroborated = true;
      chips.push("corroborated");
      continue;
    }
    if (lower === "fatal" || lower === "deadly") {
      filters.fatal = true;
      chips.push("fatalities reported");
      continue;
    }
    if (lower === "precise") {
      filters.precise = true;
      chips.push("precise location");
      continue;
    }
    const m = /^([a-z]+)(:|>=|<=|>|<|=)(.+)$/i.exec(tok);
    if (!m) {
      text.push(tok);
      continue;
    }
    const [, rawKey, op, rawVal] = m;
    const key = rawKey.toLowerCase();
    const values = rawVal.split(",").map((v) => v.trim()).filter(Boolean);
    const num = Number(rawVal);
    let ok = true;
    switch (key) {
      case "cat":
      case "category":
      case "type": {
        const cats = values.map(toCategory).filter((c): c is Category => !!c);
        if (cats.length) filters.categories = new Set([...(filters.categories ?? []), ...cats]);
        else ok = false;
        break;
      }
      case "domain": {
        const ds = values.map((v) => DOMAIN_ALIASES[v.toLowerCase()]).filter((d): d is Domain => !!d);
        if (ds.length) filters.domains = new Set([...(filters.domains ?? []), ...ds]);
        else ok = false;
        break;
      }
      case "src":
      case "source": {
        const ss = values.map((v) => SOURCE_ALIASES[v.toLowerCase()]).filter((s): s is SourceId => !!s);
        if (ss.length) filters.sources = new Set([...(filters.sources ?? []), ...ss]);
        else ok = false;
        break;
      }
      case "grade":
      case "rel":
      case "reliability": {
        const rs = values.map((v) => v.toUpperCase()).filter((v): v is Reliability => /^[A-F]$/.test(v));
        if (rs.length) filters.reliability = new Set(rs);
        else ok = false;
        break;
      }
      case "country":
      case "cc": {
        const cs = values.map((v) => v.toUpperCase()).filter((v) => /^[A-Z]{2}$/.test(v));
        if (cs.length) filters.countries = new Set([...(filters.countries ?? []), ...cs]);
        else ok = false;
        break;
      }
      case "sev":
      case "severity":
        if (Number.isFinite(num) && (op === ">" || op === ">=" || op === ":" || op === "=")) filters.minSeverity = num > 1 ? num / 100 : num;
        else ok = false;
        break;
      case "conf":
      case "confidence":
        if (Number.isFinite(num) && (op === ">" || op === ">=" || op === ":" || op === "=")) filters.minConfidence = num > 1 ? num / 100 : num;
        else ok = false;
        break;
      case "cred":
      case "credibility":
        if (Number.isFinite(num) && num >= 1 && num <= 6) filters.maxCredibility = op === "<" ? num - 1 : num;
        else ok = false;
        break;
      default:
        ok = false;
    }
    if (ok) chips.push(`${key}${op}${rawVal}`);
    else unknown.push(tok);
  }
  return { text: text.join(" ").trim(), filters, chips, unknown };
}

export function hasFilters(f: QueryFilters): boolean {
  return Object.values(f).some((v) => v !== undefined && !(v instanceof Set && v.size === 0));
}

export function matchesFilters(i: Incident, f: QueryFilters): boolean {
  if (f.categories && !f.categories.has(i.category)) return false;
  if (f.domains && !f.domains.has(domainOf(i.category))) return false;
  if (f.sources && !i.sources.some((s) => f.sources!.has(s))) return false;
  if (f.reliability && !f.reliability.has(i.reliability)) return false;
  if (f.countries && (!i.country || !f.countries.has(i.country))) return false;
  if (f.minSeverity !== undefined && i.severity < f.minSeverity) return false;
  if (f.minConfidence !== undefined && i.confidence < f.minConfidence) return false;
  if (f.maxCredibility !== undefined && i.credibility > f.maxCredibility) return false;
  if (f.corroborated && i.sources.length < 2) return false;
  if (f.fatal && !(typeof i.metrics?.reportedFatalities === "number" && i.metrics.reportedFatalities > 0)) return false;
  if (f.precise && i.precision === "country") return false;
  return true;
}
