import type { Category, Domain } from "./types";

/**
 * Map colours per domain. Validated as a set (all pairs, CVD + normal vision,
 * >= 3:1 contrast) against the #0b0f14 map surface. Category identity inside
 * a domain is carried by text labels and codes, never by extra hues.
 */
export const DOMAINS: Record<
  Domain,
  { label: string; color: string; rgb: [number, number, number] }
> = {
  security: { label: "Conflict & security", color: "#d95926", rgb: [217, 89, 38] },
  civil: { label: "Civil & political", color: "#3987e5", rgb: [57, 135, 229] },
  hazard: { label: "Natural hazards", color: "#199e70", rgb: [25, 158, 112] },
};

export const DOMAIN_ORDER: Domain[] = ["security", "civil", "hazard"];

export const CATEGORIES: Record<
  Category,
  { label: string; code: string; domain: Domain; blurb: string }
> = {
  conflict: { label: "Armed conflict", code: "CON", domain: "security", blurb: "Military force, armed clashes, strikes" },
  security: { label: "Terror & security", code: "SEC", domain: "security", blurb: "Bombings, attacks on civilians, detentions" },
  crime: { label: "Crime", code: "CRM", domain: "security", blurb: "Homicide, shootings, robbery, assault, trafficking" },
  unrest: { label: "Civil unrest", code: "UNR", domain: "civil", blurb: "Protests, riots, strikes, rallies" },
  tension: { label: "Tension", code: "TEN", domain: "civil", blurb: "Threats, force posture, sanctions, ultimatums" },
  diplomacy: { label: "Diplomacy", code: "DIP", domain: "civil", blurb: "Talks, agreements, summits, elections" },
  humanitarian: { label: "Humanitarian", code: "HUM", domain: "civil", blurb: "Aid, displacement, famine, outbreaks" },
  seismic: { label: "Earthquake", code: "EQK", domain: "hazard", blurb: "Seismic events and tsunami alerts" },
  volcanic: { label: "Volcano", code: "VOL", domain: "hazard", blurb: "Eruptions and volcanic unrest" },
  storm: { label: "Severe storm", code: "STM", domain: "hazard", blurb: "Cyclones, typhoons, severe weather" },
  flood: { label: "Flood", code: "FLD", domain: "hazard", blurb: "Riverine and flash flooding" },
  wildfire: { label: "Wildfire", code: "FIR", domain: "hazard", blurb: "Active wildfires" },
  hazard: { label: "Other hazard", code: "HAZ", domain: "hazard", blurb: "Drought, dust, ice, landslides, heat" },
};

export const CATEGORY_ORDER = Object.keys(CATEGORIES) as Category[];

export function domainOf(c: Category): Domain {
  return CATEGORIES[c].domain;
}

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && v in CATEGORIES;
}

export function severityLabel(s: number): "critical" | "high" | "elevated" | "low" {
  if (s >= 0.8) return "critical";
  if (s >= 0.6) return "high";
  if (s >= 0.35) return "elevated";
  return "low";
}

/**
 * CAMEO event codes (GDELT) → category, severity and a readable label.
 * Specific codes first; root codes (two digits) are the fallback.
 */
const CAMEO: Record<string, { label: string; category: Category; severity: number }> = {
  // 20 — unconventional mass violence
  "20": { label: "Mass violence", category: "conflict", severity: 0.95 },
  "201": { label: "Mass expulsion", category: "conflict", severity: 0.9 },
  "202": { label: "Mass killing", category: "conflict", severity: 1 },
  "203": { label: "Ethnic cleansing", category: "conflict", severity: 1 },
  "204": { label: "Weapons of mass destruction", category: "conflict", severity: 1 },
  // 19 — fight
  "19": { label: "Armed clash", category: "conflict", severity: 0.8 },
  "190": { label: "Military force used", category: "conflict", severity: 0.82 },
  "191": { label: "Blockade", category: "conflict", severity: 0.7 },
  "192": { label: "Territory occupied", category: "conflict", severity: 0.8 },
  "193": { label: "Small-arms fighting", category: "conflict", severity: 0.8 },
  "194": { label: "Artillery & armour engagement", category: "conflict", severity: 0.9 },
  "195": { label: "Air strike", category: "conflict", severity: 0.9 },
  "196": { label: "Ceasefire violated", category: "conflict", severity: 0.78 },
  // 18 — assault
  "18": { label: "Assault", category: "security", severity: 0.7 },
  "180": { label: "Unconventional violence", category: "security", severity: 0.7 },
  "181": { label: "Abduction / hijacking", category: "security", severity: 0.75 },
  "182": { label: "Physical assault", category: "security", severity: 0.65 },
  "183": { label: "Bombing", category: "security", severity: 0.88 },
  "184": { label: "Human shield use", category: "security", severity: 0.8 },
  "185": { label: "Assassination attempt", category: "security", severity: 0.8 },
  "186": { label: "Assassination", category: "security", severity: 0.88 },
  // 17 — coerce
  "17": { label: "Coercion", category: "security", severity: 0.45 },
  "171": { label: "Property seized", category: "security", severity: 0.45 },
  "172": { label: "Rights restricted", category: "security", severity: 0.45 },
  "173": { label: "Arrests & detentions", category: "security", severity: 0.45 },
  "174": { label: "Expulsion / deportation", category: "security", severity: 0.45 },
  "175": { label: "Violent repression", category: "security", severity: 0.7 },
  "176": { label: "Cyber attack", category: "security", severity: 0.6 },
  // 14 — protest
  "14": { label: "Protest", category: "unrest", severity: 0.4 },
  "141": { label: "Demonstration", category: "unrest", severity: 0.4 },
  "142": { label: "Hunger strike", category: "unrest", severity: 0.35 },
  "143": { label: "Strike / boycott", category: "unrest", severity: 0.4 },
  "144": { label: "Blockade by protesters", category: "unrest", severity: 0.45 },
  "145": { label: "Riot", category: "unrest", severity: 0.62 },
  // 15 — exhibit force posture
  "15": { label: "Military posturing", category: "tension", severity: 0.45 },
  "150": { label: "Military alert", category: "tension", severity: 0.5 },
  "151": { label: "Police alert", category: "tension", severity: 0.4 },
  "152": { label: "Troop mobilisation", category: "tension", severity: 0.55 },
  "153": { label: "Security lockdown", category: "tension", severity: 0.45 },
  "154": { label: "Military mobilisation", category: "tension", severity: 0.6 },
  // 13, 16, 12, 11, 10 — threats and friction
  "13": { label: "Threat", category: "tension", severity: 0.4 },
  "138": { label: "Threat of force", category: "tension", severity: 0.55 },
  "139": { label: "Ultimatum", category: "tension", severity: 0.55 },
  "16": { label: "Relations reduced", category: "tension", severity: 0.35 },
  "163": { label: "Sanctions / embargo", category: "tension", severity: 0.4 },
  "12": { label: "Rejection", category: "tension", severity: 0.25 },
  "11": { label: "Condemnation", category: "tension", severity: 0.2 },
  "10": { label: "Demand", category: "tension", severity: 0.2 },
  // 07 — aid
  "07": { label: "Aid provided", category: "humanitarian", severity: 0.3 },
  "073": { label: "Humanitarian aid", category: "humanitarian", severity: 0.35 },
  "074": { label: "Military protection / peacekeeping", category: "humanitarian", severity: 0.35 },
  "075": { label: "Asylum granted", category: "humanitarian", severity: 0.3 },
  // 03–06 — cooperation
  "03": { label: "Intent to cooperate", category: "diplomacy", severity: 0.12 },
  "04": { label: "Consultation", category: "diplomacy", severity: 0.12 },
  "042": { label: "Official visit", category: "diplomacy", severity: 0.15 },
  "043": { label: "Visit hosted", category: "diplomacy", severity: 0.15 },
  "046": { label: "Negotiation", category: "diplomacy", severity: 0.2 },
  "05": { label: "Diplomatic cooperation", category: "diplomacy", severity: 0.12 },
  "057": { label: "Agreement signed", category: "diplomacy", severity: 0.2 },
  "06": { label: "Material cooperation", category: "diplomacy", severity: 0.12 },
};

/** Root codes kept from GDELT. 01, 02, 08, 09 (statements, appeals, yielding,
 * investigations) are too noisy to map without a human in the loop. */
export const CAMEO_ROOTS_KEPT = new Set([
  "03", "04", "05", "06", "07", "10", "11", "12", "13", "14",
  "15", "16", "17", "18", "19", "20",
]);

export function cameo(
  code: string,
): { label: string; category: Category; severity: number } | null {
  return CAMEO[code] ?? CAMEO[code.slice(0, 3)] ?? CAMEO[code.slice(0, 2)] ?? null;
}

/**
 * Keyword classifier for free-text headlines. Each rule adds weight to a
 * category; the heaviest wins. Returns null when nothing matches.
 */
/** Court reporting: a violence-coded event whose headline is about a trial is crime. */
export const LEGAL_VOCAB =
  /\b(court|sentenc(?:e|es|ed|ing)|convict(?:s|ed|ion)?|jury|trial|prosecut\w*|indict\w*|charged|pleads?|guilty|acquit\w*|verdict)\b/i;

const RULES: Array<[RegExp, Category, number]> = [
  [/\b(air ?strikes?|missiles?|drones? (?:attack|strike)|shelling|artillery|airstrike|bombard\w*|offensive|frontline|troops? (?:advance|killed)|killed in (?:fighting|clashes)|clashes?|firefight|gunfire|rockets?|incursion|invasion|militants? killed|strikes? (?:on|against|hit\w*|kill\w*|downtown)|fighting|fighters|exchang\w* (?:of )?fire|open(?:s|ed)? fire)\b/i, "conflict", 3],
  // Weak cues: "war" alone is mostly commentary ("Pope touches on war"), and
  // casualty words also appear in crime and disasters. Together they count.
  [/\b(wars?|wartime)\b/i, "conflict", 1],
  [/\b(kill(?:s|ed|ing)?|dead|deaths?|injur(?:es|ed|ing)|wounded|casualt\w*)\b/i, "conflict", 1],
  [/\b(suicide bomb\w*|car bomb|explosion|blast|terror\w*|gunm[ae]n|hostages?|kidnap\w*|abduct\w*|assassinat\w*|massacre|detained|coup|militia\w*|insurgen\w*|jihadis\w*|extremists?)\b/i, "security", 3],
  [/\b(murder\w*|homicides?|robber(?:s|y|ies)?|burglar\w*|shootings?|shot dead|stabb\w*|gangs?|cartels?|drug (?:bust|lord|traffick\w*)|trafficking|smuggl\w*|carjack\w*|heist|manhunt|police (?:say|said|arrest\w*)|arrested|charged with|serial killer|jury|sentenc(?:e|es|ed|ing)|convicted|prosecutors?|felon\w*|theft|stolen|indict\w*|detectives?|sheriff)\b/i, "crime", 3],
  // Legal words tip a kidnapping or bombing *trial* from security to crime,
  // but alone ("Supreme Court ruling") are not enough to make an event.
  [LEGAL_VOCAB, "crime", 1],
  [/\b(protests?|protesters?|demonstrat\w*|riots?|rally|rallies|march(?:es|ed)? (?:against|for)|strike action|walkout|unrest|tear gas|crackdown)\b/i, "unrest", 3],
  [/\b(threat\w*|warns?|warning|sanction\w*|tensions?|ultimatum|mobili[sz]\w*|military drills?|exercises|standoff|expel\w*|summon\w*|embargo)\b/i, "tension", 2],
  [/\b(talks|summit|agreement|deal|treaty|ceasefire|truce|negotiat\w*|diplomat\w*|election\w*|vote|minister visits?|meets? with|accord)\b/i, "diplomacy", 2],
  [/\b(refugees?|displaced|humanitarian|aid|famine|hunger|starvation|cholera|outbreak|epidemic|mpox|ebola|measles|evacuat\w*)\b/i, "humanitarian", 2],
  [/\b(earthquake|quake|tremor|tsunami|seismic)\b/i, "seismic", 4],
  [/\b(volcan\w*|eruption|erupts?|lava|ash cloud)\b/i, "volcanic", 4],
  [/\b(hurricane|typhoon|cyclone|tropical storm|tornado\w*|storm|blizzard)\b/i, "storm", 3],
  [/\b(floods?|flooding|flash flood|monsoon|landslides?|mudslide)\b/i, "flood", 3],
  [/\b(wildfires?|bushfires?|forest fires?|blaze)\b/i, "wildfire", 4],
  [/\b(drought|heatwave|heat wave|dust storm|avalanche)\b/i, "hazard", 3],
];

export function classifyText(text: string): { category: Category; score: number } | null {
  const scores = new Map<Category, number>();
  for (const [re, cat, w] of RULES) {
    if (re.test(text)) scores.set(cat, (scores.get(cat) ?? 0) + w);
  }
  let best: Category | null = null;
  let bestScore = 0;
  for (const [cat, s] of scores) {
    if (s > bestScore) {
      best = cat;
      bestScore = s;
    }
  }
  return best ? { category: best, score: bestScore } : null;
}

/**
 * Words a headline about violence almost always contains. Used to veto
 * machine coding that labels court reports, sport or tax disputes as
 * "assault" or "fight": a sanity check, not a classifier.
 */
export const VIOLENCE_VOCAB =
  /\b(kill(?:s|ed|ing)?|wounded|injur\w*|casualt\w*|attack\w*|air ?strikes?|strikes? (?:on|against|hit\w*)|bomb(?:s|ed|ing|ings|er|ers)?|blasts?|explo(?:sion|sions|sive|sives|ded)|shell(?:ing|ed|s)|missiles?|rockets?|drones?|artillery|gunfire|exchang\w* (?:of )?fire|open(?:s|ed|ing)? fire|cross-?fire|gunm[ae]n|shoot(?:ing|ings|out)|shot (?:dead|down)|stabb\w*|fighting|firefight|clash(?:es|ed)|troops?|soldiers?|militants?|militia\w*|raid(?:s|ed)?|ambush\w*|siege|offensive|invasion|front ?line|warfare|hostages?|kidnap\w*|abduct\w*|assassinat\w*|massacre|murder\w*|homicide|terror\w*|insurgen\w*|rebels?|jihadis\w*|coup|riot\w*|executed|torture\w*|gunmen|armed (?:men|group|attack|robbery|forces))\b/i;

/** Culture and entertainment coverage: a "kill" or "abduction" here is a plot, not an event. */
export const NOT_AN_EVENT =
  /\b(ufos?|movies?|films?|trailer|box office|netflix|hbo|episode|album|songs?|novel|documentary|horoscope|video games?|celebrity|actress|comeback)\b/i;

/** Minimum classifier score for a newsroom headline to count as an event. */
export const MIN_TEXT_SCORE = 2;

/** Baseline severity for a headline classified into a category. */
export const TEXT_SEVERITY: Record<Category, number> = {
  conflict: 0.72,
  security: 0.62,
  crime: 0.45,
  unrest: 0.42,
  tension: 0.35,
  diplomacy: 0.15,
  humanitarian: 0.45,
  seismic: 0.5,
  volcanic: 0.5,
  storm: 0.5,
  flood: 0.5,
  wildfire: 0.45,
  hazard: 0.35,
};
