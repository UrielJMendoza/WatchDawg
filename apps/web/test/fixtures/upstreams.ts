import { createHash } from "node:crypto";
import { strToU8, zipSync } from "fflate";
import type { Transport } from "@/lib/osint/sources/types";
import { USGS_URL } from "@/lib/osint/sources/usgs";
import { EONET_URL } from "@/lib/osint/sources/eonet";
import { GDACS_API } from "@/lib/osint/sources/gdacs";
import { GDELT_LASTUPDATE_PATH } from "@/lib/osint/sources/gdelt";
import { WIRE_FEEDS } from "@/lib/osint/sources/wire";
import { CITIES } from "@/lib/osint/sources/crime";

/**
 * TEST FIXTURES — never imported by the app.
 *
 * Synthesises payloads in each upstream's *native* wire format (GeoJSON,
 * zipped GDELT TSV with an MD5 manifest, RSS/Atom, Socrata JSON) so the real
 * validators, fusion and aggregation can be exercised end-to-end without
 * network access. Geography is real; every event and headline is fictional
 * and links point at the reserved `.invalid` TLD. Deliberately malformed
 * records exercise the reject paths.
 */

const SIM = "https://sim.watchdawg.invalid";
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

type Rand = () => number;
const pick = <T,>(r: Rand, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const jitter = (r: Rand, d: number) => (r() - 0.5) * 2 * d;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The scenario is anchored to the hour so it evolves slowly and deterministically. */
function epochOf(now: number) {
  return Math.floor(now / HOUR) * HOUR;
}

// ─── USGS ────────────────────────────────────────────────────────────────

const QUAKE_ZONES: Array<[number, number, string, number]> = [
  [36.2, 141.5, "off the east coast of Honshu, Japan", 1.5],
  [-6.5, 129.5, "Banda Sea", 2.5],
  [-2.0, 99.5, "southern Sumatra, Indonesia", 1.8],
  [-23.5, -70.4, "near Antofagasta, Chile", 1.5],
  [-15.5, -173.5, "Tonga", 1.8],
  [52.0, -175.0, "Andreanof Islands, Aleutian Islands, Alaska", 3],
  [35.8, -117.6, "Ridgecrest, California", 0.4],
  [15.5, -94.5, "offshore Oaxaca, Mexico", 1.2],
  [38.4, 38.1, "eastern Türkiye", 1.2],
  [28.2, 57.2, "southern Iran", 1.5],
  [12.0, 125.8, "Philippine Islands region", 1.8],
  [-5.5, 151.5, "New Britain region, Papua New Guinea", 1.6],
  [-41.8, 174.2, "Cook Strait, New Zealand", 1],
  [-12.2, -77.2, "near the coast of central Peru", 1.2],
  [38.3, 21.8, "Greece", 1],
  [28.1, 84.6, "Nepal", 0.8],
  [23.9, 121.6, "Hualien, Taiwan", 0.6],
  [61.5, -150.0, "Southern Alaska", 0.8],
  [-30.0, -177.8, "Kermadec Islands region", 2],
  [13.4, 144.8, "Mariana Islands region", 1.2],
];

function usgsPayload(now: number): string {
  const epoch = epochOf(now);
  const r = mulberry32(seedOf(`usgs:${epoch / DAY | 0}`));
  const features: unknown[] = [];
  const quake = (id: string, lat: number, lon: number, place: string, mag: number, time: number, extra: Record<string, unknown> = {}) => {
    features.push({
      type: "Feature",
      id,
      geometry: { type: "Point", coordinates: [Number(lon.toFixed(4)), Number(lat.toFixed(4)), Number((5 + r() * 60).toFixed(1))] },
      properties: {
        mag: Number(mag.toFixed(1)),
        place: /^(off|near) /.test(place) ? place : `${Math.round(5 + r() * 90)} km ${pick(r, ["N", "NE", "E", "SE", "S", "SW", "W", "NW"])} of ${place}`,
        time,
        updated: time + 20 * MIN,
        url: `${SIM}/usgs/${id}`,
        title: `M ${mag.toFixed(1)} - ${place}`,
        alert: null,
        status: time < now - 6 * HOUR ? "reviewed" : "automatic",
        tsunami: 0,
        sig: Math.round(mag * mag * 12),
        felt: mag > 4.5 ? Math.round(r() * 400) : null,
        type: "earthquake",
        magType: "mb",
        net: "sim",
        nst: Math.round(20 + r() * 80),
        ...extra,
      },
    });
  };
  for (let i = 0; i < 150; i++) {
    const [lat, lon, place, spread] = pick(r, QUAKE_ZONES);
    const mag = Math.min(6.2, 2.5 - Math.log(1 - r()) * 0.75);
    const t = now - r() * 7 * DAY;
    quake(`sim${(seedOf(`q${i}${epoch}`) % 1e8).toString(36)}`, lat + jitter(r, spread), lon + jitter(r, spread), place, mag, Math.round(t));
  }
  // Two headline quakes that other sources will corroborate.
  const t1 = epoch - 2 * HOUR - 12 * MIN;
  quake("simmain01", 36.41, 141.83, "off the east coast of Honshu, Japan", 6.6, t1, { alert: "orange", tsunami: 1, status: "reviewed" });
  quake("simmain02", -15.72, -173.31, "Tonga", 6.1, epoch - 9 * HOUR, { alert: "yellow", status: "reviewed" });
  // Malformed: impossible coordinates, missing magnitude, blast not quake.
  features.push({ type: "Feature", id: "simbad1", geometry: { type: "Point", coordinates: [999, 45, 10] }, properties: { mag: 4.2, time: now - HOUR, place: "Nowhere", type: "earthquake" } });
  features.push({ type: "Feature", id: "simbad2", geometry: { type: "Point", coordinates: [120, 10, 10] }, properties: { mag: null, time: now - HOUR, place: "Somewhere", type: "earthquake" } });
  features.push({ type: "Feature", id: "simbad3", geometry: { type: "Point", coordinates: [-117.1, 34.1, 0] }, properties: { mag: 2.6, time: now - 2 * HOUR, place: "Quarry", type: "quarry blast" } });
  return JSON.stringify({ type: "FeatureCollection", metadata: { generated: now, title: "SIMULATED" }, features });
}

// ─── NASA EONET ──────────────────────────────────────────────────────────

const FIRE_REGIONS: Array<[number, number, string, number]> = [
  [39.5, -121.5, "California", 2.5], [44.0, -121.5, "Oregon", 1.5], [52.5, -121.0, "British Columbia", 3],
  [55.0, -115.0, "Alberta", 3], [-33.5, 150.5, "New South Wales", 2], [-10.5, -55.0, "Mato Grosso", 4],
  [62.0, 129.0, "Sakha Republic", 5], [39.8, -8.0, "Portugal", 1], [38.2, 23.5, "Greece", 1], [-37.5, -72.5, "Biobío", 1.5],
];
const FIRE_NAMES = ["Ridge", "Canyon", "Creek", "Mesa", "Pine", "Cedar", "Lookout", "Bear", "Falcon", "Granite"];
const VOLCANOES: Array<[number, number, string]> = [
  [37.75, 14.99, "Etna Volcano, Italy"], [19.41, -155.29, "Kilauea Volcano, United States"],
  [31.58, 130.66, "Sakurajima Volcano, Japan"], [19.02, -98.62, "Popocatepetl Volcano, Mexico"],
  [-7.54, 110.44, "Merapi Volcano, Indonesia"], [14.47, -90.88, "Fuego Volcano, Guatemala"],
];

function eonetPayload(now: number): string {
  const epoch = epochOf(now);
  const r = mulberry32(seedOf(`eonet:${epoch / DAY | 0}`));
  const events: unknown[] = [];
  const iso = (t: number) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
  let n = 0;
  const ev = (cat: string, title: string, geometry: unknown[], sources: string[]) => {
    events.push({
      id: `EONET_SIM${++n}`,
      title,
      description: null,
      link: `${SIM}/eonet/${n}`,
      closed: null,
      categories: [{ id: cat, title: cat }],
      sources: sources.map((s) => ({ id: s, url: `${SIM}/eonet/${n}/${s.toLowerCase()}` })),
      geometry,
    });
  };
  for (let i = 0; i < 34; i++) {
    const [lat, lon, region, spread] = pick(r, FIRE_REGIONS);
    const t = now - r() * 5 * DAY;
    ev("wildfires", `${pick(r, FIRE_NAMES)} ${pick(r, ["Fire", "Complex", "Fire"])}, ${region}`, [
      { magnitudeValue: Math.round(50 + Math.exp(r() * 11)), magnitudeUnit: "acres", date: iso(t), type: "Point", coordinates: [lon + jitter(r, spread), lat + jitter(r, spread)] },
    ], r() > 0.6 ? ["IRWIN", "InciWeb"] : ["IRWIN"]);
  }
  // Two tropical cyclones with tracks (latest fix is current position).
  const track = (lat0: number, lon0: number, dLat: number, dLon: number, kts: number[]) =>
    kts.map((k, i) => ({
      magnitudeValue: k,
      magnitudeUnit: "kts",
      date: iso(epoch - (kts.length - 1 - i) * 6 * HOUR),
      type: "Point",
      coordinates: [lon0 + dLon * i, lat0 + dLat * i],
    }));
  ev("severeStorms", "Typhoon Orion", track(13.2, 131.5, 0.55, -1.05, [45, 60, 80, 100, 115, 125, 130]), ["JTWC"]);
  ev("severeStorms", "Hurricane Vesta", track(15.0, -58.5, 0.4, -1.2, [40, 55, 70, 85, 95]), ["NOAA_NHC"]);
  for (const [lat, lon, name] of VOLCANOES) {
    ev("volcanoes", name, [{ magnitudeValue: null, magnitudeUnit: null, date: iso(now - r() * 4 * DAY), type: "Point", coordinates: [lon, lat] }], ["SIVolcano"]);
  }
  const floods: Array<[number, number, string]> = [[23.7, 90.4, "Bangladesh"], [5.5, 6.5, "Nigeria"], [26.0, 68.5, "Pakistan"], [7.5, 30.5, "South Sudan"]];
  for (const [lat, lon, name] of floods) {
    ev("floods", `Flooding in ${name}`, [{ magnitudeValue: null, magnitudeUnit: null, date: iso(now - r() * 3 * DAY), type: "Point", coordinates: [lon + jitter(r, 1), lat + jitter(r, 1)] }], ["GDACS", "ReliefWeb"]);
  }
  for (let i = 0; i < 3; i++) {
    ev("seaLakeIce", `Iceberg SIM${i + 1}`, [{ magnitudeValue: 40 + i * 20, magnitudeUnit: "NM^2", date: iso(now - r() * 6 * DAY), type: "Point", coordinates: [-60 + i * 50, -66 - r() * 4] }], ["NATICE"]);
  }
  ev("drought", "Drought — Horn of Africa", [{ magnitudeValue: null, magnitudeUnit: null, date: iso(now - 2 * DAY), type: "Polygon", coordinates: [[[40, 2], [46, 2], [46, 9], [40, 9], [40, 2]]] }], ["FEWSNET"]);
  // Malformed: no categories.
  events.push({ id: "EONET_BAD", title: "Broken", categories: [], sources: [], geometry: [] });
  return JSON.stringify({ title: "SIMULATED EONET", events });
}

// ─── GDACS ───────────────────────────────────────────────────────────────

function gdacsPayload(now: number): string {
  const epoch = epochOf(now);
  const features: unknown[] = [];
  const iso = (t: number) => new Date(t).toISOString().slice(0, 19);
  let id = 1000;
  const add = (type: string, alert: string, lat: number, lon: number, name: string, country: string, iso2: string, from: number, to: number, sev: string) => {
    id++;
    const props = {
      eventtype: type, eventid: id, episodeid: 1, name, description: name, htmldescription: `${alert} ${name}`,
      alertlevel: alert, alertscore: alert === "Red" ? 3 : alert === "Orange" ? 2 : 1, country,
      fromdate: iso(from), todate: iso(to), datemodified: iso(to), iscurrent: "true",
      url: { report: `${SIM}/gdacs/${type}/${id}` }, affectedcountries: [{ iso2, countryname: country }],
      severitydata: { severity: 1, severitytext: sev, severityunit: "" }, source: "SIM",
    };
    features.push({ type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: props });
    // The MAP endpoint repeats events as impact polygons; they must be skipped.
    features.push({ type: "Feature", geometry: { type: "Polygon", coordinates: [[[lon - 1, lat - 1], [lon + 1, lat - 1], [lon + 1, lat + 1], [lon - 1, lat - 1]]] }, properties: props });
  };
  const t1 = epoch - 2 * HOUR - 12 * MIN;
  add("EQ", "Orange", 36.38, 141.9, "Earthquake off the coast of Honshu", "Japan", "JP", t1, t1, "Magnitude 6.6M, Depth:24km");
  add("EQ", "Green", -15.7, -173.35, "Earthquake in Tonga", "Tonga", "TO", epoch - 9 * HOUR, epoch - 9 * HOUR, "Magnitude 6.1M, Depth:35km");
  add("TC", "Red", 16.5, 125.2, "Tropical Cyclone ORION-26", "Philippines", "PH", epoch - 2 * DAY, epoch, "Typhoon, 130 kt");
  add("TC", "Orange", 16.6, -63.3, "Tropical Cyclone VESTA-26", "Antigua and Barbuda", "AG", epoch - DAY, epoch, "Category 2, 95 kt");
  add("FL", "Orange", 23.9, 90.2, "Flood in Bangladesh", "Bangladesh", "BD", epoch - 4 * DAY, epoch - 3 * HOUR, "Large flood");
  add("FL", "Green", 5.3, 6.8, "Flood in Nigeria", "Nigeria", "NG", epoch - 3 * DAY, epoch - 5 * HOUR, "Medium flood");
  add("DR", "Orange", 5.5, 43.0, "Drought in Horn of Africa", "Somalia", "SO", epoch - 60 * DAY, epoch - DAY, "Severe drought");
  add("VO", "Green", -7.54, 110.44, "Merapi eruption", "Indonesia", "ID", epoch - 3 * DAY, epoch - 6 * HOUR, "VEI 1");
  add("WF", "Green", -10.2, -55.4, "Forest fires in Mato Grosso", "Brazil", "BR", epoch - 2 * DAY, epoch - 2 * HOUR, "12,000 ha");
  return JSON.stringify({ type: "FeatureCollection", features });
}

// ─── GDELT ───────────────────────────────────────────────────────────────

type Mix = Array<[string, number]>;
const MIX: Record<string, Mix> = {
  war: [["190", 3], ["193", 2], ["194", 2.5], ["195", 3], ["183", 0.8], ["173", 0.6], ["073", 0.6], ["202", 0.1]],
  insurgency: [["190", 1.5], ["193", 3], ["181", 1], ["183", 1.2], ["186", 0.4], ["175", 0.8], ["073", 0.8]],
  unrest: [["141", 4], ["145", 1.5], ["143", 1], ["173", 1.2], ["175", 0.6]],
  politics: [["042", 2], ["046", 2], ["057", 1], ["138", 0.8], ["163", 1], ["112", 1], ["154", 0.5]],
  flashpoint: [["138", 1.5], ["154", 1.5], ["150", 1], ["163", 1], ["046", 1], ["190", 0.4]],
};

// [GDELT full name, lat, lon, feature id, geo type, mix, intensity]
const THEATRES: Array<[string, number, number, string, number, keyof typeof MIX, number]> = [
  ["Kharkiv, Kharkivs'ka Oblast', Ukraine", 49.99, 36.23, "-1036337", 4, "war", 1.3],
  ["Donetsk, Donets'ka Oblast', Ukraine", 48.0, 37.8, "-1035851", 4, "war", 1.4],
  ["Zaporizhzhia, Zaporiz'ka Oblast', Ukraine", 47.84, 35.14, "-1047193", 4, "war", 1.0],
  ["Kherson, Khersons'ka Oblast', Ukraine", 46.64, 32.61, "-1036983", 4, "war", 0.9],
  ["Kyiv, Kyyiv, Misto, Ukraine", 50.45, 30.52, "-1044367", 4, "war", 0.8],
  ["Odesa, Odes'ka Oblast', Ukraine", 46.48, 30.73, "-1049016", 4, "war", 0.6],
  ["Belgorod, Belgorodskaya Oblast', Russia", 50.6, 36.6, "-2459052", 4, "war", 0.5],
  ["Gaza, Gaza Strip", 31.5, 34.47, "-1017566", 4, "war", 1.5],
  ["Khan Yunis, Gaza Strip", 31.34, 34.31, "-1017620", 4, "war", 0.9],
  ["Beirut, Beyrouth, Lebanon", 33.89, 35.5, "-801546", 4, "war", 0.5],
  ["Khartoum, Khartoum, Sudan", 15.55, 32.53, "-1454631", 4, "war", 0.9],
  ["El Fasher, Northern Darfur, Sudan", 13.63, 25.35, "-1454112", 4, "war", 1.0],
  ["Goma, Nord-Kivu, Congo (Kinshasa)", -1.68, 29.22, "-898853", 4, "insurgency", 0.9],
  ["Port-au-Prince, Ouest, Haiti", 18.54, -72.34, "-352968", 4, "insurgency", 0.8],
  ["Sanaa, Amanat Al Asimah, Yemen", 15.35, 44.21, "-3102987", 4, "war", 0.5],
  ["Hodeidah, Al Hudaydah, Yemen", 14.8, 42.95, "-3102443", 4, "war", 0.5],
  ["Mandalay, Mandalay, Burma", 21.97, 96.08, "-2112932", 4, "insurgency", 0.6],
  ["Bamako, Bamako, Mali", 12.65, -8.0, "-1238395", 4, "insurgency", 0.6],
  ["Mogadishu, Banaadir, Somalia", 2.04, 45.34, "-2185434", 4, "insurgency", 0.6],
  ["Damascus, Dimashq, Syria", 33.51, 36.29, "-3024473", 4, "insurgency", 0.5],
  ["Paris, Ile-de-France, France", 48.86, 2.35, "-1456928", 4, "unrest", 0.7],
  ["Nairobi, Nairobi Area, Kenya", -1.29, 36.82, "-1382855", 4, "unrest", 0.8],
  ["Buenos Aires, Distrito Federal, Argentina", -34.6, -58.38, "-1265580", 4, "unrest", 0.6],
  ["Tbilisi, Tbilisi, Georgia", 41.72, 44.79, "-2200640", 4, "unrest", 0.8],
  ["Belgrade, Central Serbia, Serbia", 44.8, 20.47, "-74897", 4, "unrest", 0.7],
  ["Jakarta, Jakarta Raya, Indonesia", -6.2, 106.85, "-2679652", 4, "unrest", 0.5],
  ["Dhaka, Dhaka, Bangladesh", 23.72, 90.41, "-2791016", 4, "unrest", 0.6],
  ["Lima, Lima, Peru", -12.05, -77.04, "-1377049", 4, "unrest", 0.5],
  ["Seoul, Seoul-t'ukpyolsi, South Korea", 37.57, 126.98, "-716582", 4, "unrest", 0.4],
  ["Istanbul, Istanbul, Turkey", 41.01, 28.95, "-755717", 4, "unrest", 0.5],
  ["Caracas, Distrito Federal, Venezuela", 10.5, -66.92, "-1385498", 4, "unrest", 0.5],
  ["Geneva, Geneve, Switzerland", 46.2, 6.15, "-2551870", 4, "politics", 0.6],
  ["Brussels, Bruxelles-Capitale, Belgium", 50.85, 4.35, "-1955538", 4, "politics", 0.6],
  ["Washington, District of Columbia, United States", 38.9, -77.04, "531871", 3, "politics", 1.0],
  ["Beijing, Beijing, China", 39.93, 116.39, "-1898541", 4, "politics", 0.7],
  ["New Delhi, National Capital Territory of Delhi, India", 28.6, 77.2, "-2106102", 4, "politics", 0.6],
  ["Doha, Ad Dawhah, Qatar", 25.29, 51.53, "-3181339", 4, "politics", 0.5],
  ["Riyadh, Ar Riyad, Saudi Arabia", 24.69, 46.72, "-3092186", 4, "politics", 0.4],
  ["Taipei, T'ai-pei, Taiwan", 25.04, 121.53, "-2637824", 4, "flashpoint", 0.6],
  ["Pyongyang, P'yongyang-si, North Korea", 39.02, 125.75, "-157183", 4, "flashpoint", 0.4],
  ["Tehran, Tehran, Iran", 35.69, 51.42, "10074674", 4, "flashpoint", 0.6],
  ["Moscow, Moskva, Russia", 55.75, 37.62, "-2960561", 4, "politics", 0.6],
];

const ACTORS: Record<keyof typeof MIX, Array<[string, string]>> = {
  war: [["MILITARY", "CIVILIAN"], ["ARMED FORCES", "MILITARY"], ["MILITARY", "GOVERNMENT"]],
  insurgency: [["REBEL", "MILITARY"], ["MILITIA", "CIVILIAN"], ["ARMED GANG", "POLICE"]],
  unrest: [["PROTESTER", "POLICE"], ["PROTESTER", "GOVERNMENT"], ["UNION", "EMPLOYER"]],
  politics: [["GOVERNMENT", "GOVERNMENT"], ["FOREIGN MINISTRY", "UNITED NATIONS"], ["PRESIDENT", "PRIME MINISTER"]],
  flashpoint: [["MILITARY", "GOVERNMENT"], ["NAVY", "COAST GUARD"], ["GOVERNMENT", "MILITARY"]],
};

const SLUGS: Record<string, string[]> = {
  "19": ["heavy fighting reported on the outskirts of {p}", "forces exchange fire near {p} overnight", "clashes intensify around {p} as front line shifts"],
  "195": ["air strikes hit targets near {p}", "drone and missile strikes reported across {p}"],
  "194": ["artillery shelling pounds districts of {p}", "shelling damages infrastructure in {p}"],
  "18": ["explosion rocks market district in {p}", "gunmen attack checkpoint outside {p}", "car bomb blast reported in central {p}"],
  "17": ["security forces detain dozens in {p}", "authorities impose curfew in {p} after unrest"],
  "14": ["thousands march through {p} in anti government protest", "protesters clash with riot police in {p}", "general strike paralyses transport in {p}"],
  "15": ["troops placed on high alert near {p}", "military drills near {p} raise regional tensions"],
  "13": ["officials in {p} warn of retaliation over border incident", "ultimatum issued from {p} as talks stall"],
  "16": ["new sanctions announced targeting companies linked to {p}"],
  "11": ["{p} condemns cross border raid in strong terms"],
  "04": ["delegations meet in {p} for round of security talks", "foreign ministers hold talks in {p}"],
  "05": ["leaders sign cooperation framework in {p}"],
  "07": ["aid convoy reaches displaced families near {p}", "humanitarian corridor opened outside {p}"],
  "20": ["reports of mass casualties emerge from {p}"],
};

/** Actor-country pairs (CAMEO alpha-3) per theatre, for link-analysis fixtures. */
const PAIRS: Record<string, Array<[string, string]>> = {
  Kharkiv: [["RUS", "UKR"], ["UKR", "RUS"]],
  Donetsk: [["RUS", "UKR"]],
  Zaporizhzhia: [["RUS", "UKR"]],
  Kherson: [["RUS", "UKR"]],
  Kyiv: [["RUS", "UKR"]],
  Odesa: [["RUS", "UKR"]],
  Belgorod: [["UKR", "RUS"]],
  Gaza: [["ISR", "PSE"]],
  "Khan Yunis": [["ISR", "PSE"]],
  Beirut: [["ISR", "LBN"]],
  Hodeidah: [["USA", "YEM"]],
  Taipei: [["CHN", "TWN"]],
  Tehran: [["IRN", "ISR"]],
  Washington: [["USA", "CHN"]],
  Beijing: [["CHN", "USA"]],
  Geneva: [["USA", "RUS"]],
};

function slugFor(r: Rand, code: string, place: string): string {
  const opts = SLUGS[code.slice(0, 3)] ?? SLUGS[code.slice(0, 2)] ?? ["developing situation in {p}"];
  return slug(pick(r, opts).replace("{p}", place));
}

const GDELT_STEP = 15 * MIN;

function gdeltLatestStamp(now: number): number {
  return Math.floor(now / GDELT_STEP) * GDELT_STEP - GDELT_STEP;
}

function stamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:T]/g, "").slice(0, 14);
}

function weighted(r: Rand, mix: Mix): string {
  const total = mix.reduce((s, [, w]) => s + w, 0);
  let x = r() * total;
  for (const [code, w] of mix) {
    x -= w;
    if (x <= 0) return code;
  }
  return mix[0][0];
}

function gdeltTsv(fileMs: number): string {
  const r = mulberry32(seedOf(`gdelt:${fileMs}`));
  const sqlDate = stamp(fileMs).slice(0, 8);
  const added = stamp(fileMs);
  const lines: string[] = [];
  let id = Math.floor(fileMs / 1000);
  // Activity breathes over the day so the timeline has shape.
  const pulse = 0.75 + 0.35 * Math.sin((fileMs / DAY) * 2 * Math.PI * 1.7);
  for (const [full, lat, lon, fid, geoType, mixKey, intensity] of THEATRES) {
    const rows = Math.round(intensity * pulse * (1.2 + r() * 2.6));
    const place = full.split(",")[0];
    for (let i = 0; i < rows; i++) {
      const code = weighted(r, MIX[mixKey]);
      const [a1, a2] = pick(r, ACTORS[mixKey]);
      const articles = Math.max(1, Math.round(Math.exp(r() * 2.6)));
      const outlet = Math.floor(r() * 18);
      const url = `https://news-${outlet}.sim.watchdawg.invalid/${sqlDate.slice(0, 4)}/${sqlDate.slice(4, 6)}/${slugFor(r, code, place)}-${Math.floor(r() * 1e6)}`;
      const c = new Array(61).fill("");
      c[0] = String(id++);
      c[1] = sqlDate;
      c[5] = a1.slice(0, 3);
      c[6] = a1;
      c[15] = a2.slice(0, 3);
      c[16] = a2;
      const pair = PAIRS[place] ? pick(r, PAIRS[place]) : null;
      if (pair) {
        c[7] = pair[0];
        c[17] = pair[1];
      }
      c[25] = "1";
      c[26] = code;
      c[27] = code.slice(0, 3);
      c[28] = code.slice(0, 2);
      c[29] = code.startsWith("1") && Number(code.slice(0, 2)) >= 18 ? "4" : "3";
      c[30] = (-10 + r() * 6).toFixed(1);
      c[31] = String(articles * 2);
      c[32] = String(Math.max(1, Math.round(articles / 2)));
      c[33] = String(articles);
      c[34] = (-8 + r() * 5).toFixed(2);
      c[51] = String(geoType);
      c[52] = full;
      c[56] = (lat + jitter(r, 0.08)).toFixed(4);
      c[57] = (lon + jitter(r, 0.08)).toFixed(4);
      c[58] = fid;
      c[59] = added;
      c[60] = url;
      lines.push(c.join("\t"));
    }
  }
  // Statements (CAMEO 01) — valid but filtered as low-relevance.
  for (let i = 0; i < 12; i++) {
    const c = new Array(61).fill("");
    c[0] = String(id++); c[26] = "010"; c[28] = "01"; c[33] = "3"; c[32] = "1"; c[51] = "4";
    c[52] = "London, London, City of, United Kingdom"; c[56] = "51.5"; c[57] = "-0.12"; c[59] = added;
    c[60] = `https://news-1.sim.watchdawg.invalid/statement-${i}`;
    lines.push(c.join("\t"));
  }
  // Malformed rows: truncated line, unparsable latitude, Null Island.
  lines.push(["1", sqlDate, "truncated"].join("\t"));
  const bad = new Array(61).fill("");
  bad[26] = "190"; bad[28] = "19"; bad[33] = "2"; bad[32] = "1"; bad[51] = "4"; bad[59] = added; bad[60] = "https://news-2.sim.watchdawg.invalid/x";
  lines.push([...bad.slice(0, 56), "abc", "12", ...bad.slice(58)].join("\t"));
  lines.push([...bad.slice(0, 56), "0", "0", ...bad.slice(58)].join("\t"));
  return lines.join("\n");
}

const zipCache = new Map<number, Uint8Array>();

function gdeltZip(fileMs: number): Uint8Array {
  let z = zipCache.get(fileMs);
  if (!z) {
    const name = `${stamp(fileMs)}.export.CSV`;
    z = zipSync({ [name]: [strToU8(gdeltTsv(fileMs)), { mtime: new Date(fileMs) }] });
    zipCache.set(fileMs, z);
    if (zipCache.size > 120) zipCache.delete(zipCache.keys().next().value as number);
  }
  return z;
}

function gdeltManifest(now: number): string {
  const latest = gdeltLatestStamp(now);
  const zip = gdeltZip(latest);
  const md5 = createHash("md5").update(zip).digest("hex");
  const s = stamp(latest);
  return [
    `${zip.byteLength} ${md5} http://data.gdeltproject.org/gdeltv2/${s}.export.CSV.zip`,
    `1 00000000000000000000000000000000 http://data.gdeltproject.org/gdeltv2/${s}.mentions.CSV.zip`,
    `1 00000000000000000000000000000000 http://data.gdeltproject.org/gdeltv2/${s}.gkg.csv.zip`,
  ].join("\n");
}

// ─── Wires ───────────────────────────────────────────────────────────────

const HEADLINES: Array<[string, number]> = [
  ["Drone strike hits apartment block in Kharkiv, officials say 4 killed", 1.5],
  ["Shelling intensifies around Donetsk as front line shifts", 3],
  ["Air raid alerts sound across Kyiv after overnight missile barrage", 5],
  ["Israeli strikes on Gaza kill 23, health officials say", 2],
  ["Aid agencies warn of famine conditions in Gaza", 7],
  ["Sudan: shelling forces thousands to flee as siege tightens", 6],
  ["Cholera outbreak spreads in displacement camps near Goma", 10],
  ["Gang violence escalates in Port-au-Prince as police stations attacked", 4],
  ["Protesters clash with police in Nairobi over new tax measures", 3],
  ["Tens of thousands rally in Tbilisi against foreign agents law", 8],
  ["Riot police fire tear gas at demonstrators in Belgrade", 5],
  ["Magnitude 6.6 earthquake strikes off Japan, tsunami advisory issued", 1.8],
  ["Typhoon Orion slams into the Philippines, thousands evacuated", 2],
  ["Hurricane Vesta strengthens as it nears Antigua and Barbuda", 3],
  ["Floods displace hundreds of thousands in Bangladesh", 9],
  ["Talks in Geneva aim to revive stalled ceasefire negotiations", 6],
  ["Gunmen attack village in central Mali, dozens reported killed", 11],
  ["Houthi forces claim missile attack on cargo ship in Red Sea", 7],
  ["Naval drills near Taiwan raise regional tensions", 12],
  ["Etna eruption sends ash cloud over eastern Sicily, Italy", 14],
  ["Sanctions package targets shipping firms and insurers", 5],
  ["Champions League: late goal seals dramatic comeback win", 2],
  ["Film festival opens with record attendance", 6],
];

function wireFeed(url: string, now: number): string {
  const epoch = epochOf(now);
  const which = Math.max(0, WIRE_FEEDS.findIndex((f) => f.urls.includes(url))) % 3;
  const r = mulberry32(seedOf(`wire:${which}:${epoch}`));
  const items = HEADLINES.filter((_, i) => (i + which) % 3 !== 2 || r() > 0.5).map(([title, hoursAgo]) => {
    const t = epoch - (hoursAgo + which * 0.4) * HOUR;
    return { title, link: `${SIM}/wire/${which}/${slug(title)}`, t };
  });
  if (which === 2) {
    const entries = items
      .map((it) => `<entry><title>${esc(it.title)}</title><link rel="alternate" href="${it.link}"/><updated>${new Date(it.t).toISOString()}</updated><summary>Fixture report.</summary></entry>`)
      .join("");
    return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Fixture Wire</title>${entries}</feed>`;
  }
  const body = items
    .map((it) => `<item><title><![CDATA[${it.title}]]></title><link>${it.link}</link><pubDate>${new Date(it.t).toUTCString()}</pubDate><description>Fixture report.</description></item>`)
    .join("");
  // Malformed: no link; publish date two days in the future.
  const bad =
    `<item><title>Item with no link at all in this feed</title><pubDate>${new Date(now).toUTCString()}</pubDate></item>` +
    `<item><title>Protest planned in Madrid next week organisers say</title><link>${SIM}/wire/future</link><pubDate>${new Date(now + 2 * DAY).toUTCString()}</pubDate></item>`;
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture Wire</title>${body}${bad}</channel></rss>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

// ─── City crime portals (Socrata) ─────────────────────────────────────────

function crimePayload(url: string, now: number): string {
  const r = mulberry32(seedOf(`crime:${url.slice(0, 40)}:${epochOf(now)}`));
  const local = (t: number, tz: string) => {
    const f = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "medium" });
    return `${f.format(new Date(t)).replace(" ", "T")}.000`;
  };
  if (url.includes("sfgov")) {
    const cats = ["Robbery", "Assault", "Burglary", "Motor Vehicle Theft", "Larceny Theft", "Homicide", "Weapons Offense", "Sex Offense", "Arson"];
    const hoods = ["Mission", "Tenderloin", "South of Market", "Bayview Hunters Point", "Financial District/South Beach"];
    const rows = [];
    for (let i = 0; i < 90; i++) {
      const t = now - 36 * HOUR - r() * 6 * DAY;
      rows.push({
        incident_id: String(900000 + i), incident_datetime: local(t, "America/Los_Angeles"),
        incident_category: pick(r, cats), incident_subcategory: "Fixture", incident_description: "Fixture offence",
        analysis_neighborhood: pick(r, hoods), latitude: String(37.76 + jitter(r, 0.03)), longitude: String(-122.42 + jitter(r, 0.03)),
        resolution: r() > 0.8 ? "Cite or Arrest Adult" : "Open or Active",
      });
      if (i % 9 === 0) rows.push({ ...rows[rows.length - 1] }); // duplicate row per offence code
    }
    rows.push({ incident_id: "bad", incident_datetime: "not a date", latitude: "37.7", longitude: "-122.4", incident_category: "Robbery" });
    return JSON.stringify(rows);
  }
  const types: Array<[string, string]> = [["ROBBERY", "ARMED - HANDGUN"], ["BATTERY", "AGGRAVATED - HANDGUN"], ["BATTERY", "SIMPLE"], ["HOMICIDE", "FIRST DEGREE MURDER"], ["WEAPONS VIOLATION", "UNLAWFUL POSSESSION - HANDGUN"], ["THEFT", "OVER $500"], ["MOTOR VEHICLE THEFT", "AUTOMOBILE"], ["BURGLARY", "FORCIBLE ENTRY"]];
  const rows = [];
  for (let i = 0; i < 90; i++) {
    const [pt, desc] = pick(r, types);
    const t = now - 5 * DAY - r() * 3 * DAY;
    rows.push({ id: String(13000000 + i), date: local(t, "America/Chicago"), primary_type: pt, description: desc, block: "043XX W MADISON ST", arrest: r() > 0.85, domestic: r() > 0.85, latitude: String(41.85 + jitter(r, 0.08)), longitude: String(-87.68 + jitter(r, 0.06)) });
  }
  return JSON.stringify(rows);
}

// ─── Transport ───────────────────────────────────────────────────────────

export function fixtureTransport(now: number): Transport {
  const text = async (url: string): Promise<string> => {
    if (url === USGS_URL) return usgsPayload(now);
    if (url === EONET_URL) return eonetPayload(now);
    if (url.startsWith(`${GDACS_API}/SEARCH`)) return gdacsPayload(now);
    if (url.endsWith(GDELT_LASTUPDATE_PATH)) return gdeltManifest(now);
    if (WIRE_FEEDS.some((f) => f.urls[0] === url)) return wireFeed(url, now);
    if (CITIES.some((c) => url.startsWith(c.url("").split("?")[0]))) return crimePayload(url, now);
    throw new Error(`fixture transport: nothing for ${url}`);
  };
  return {
    text,
    async bytes(url: string) {
      const m = /(\d{14})\.export\.CSV\.zip$/.exec(url);
      if (!m) throw new Error(`fixture transport: nothing for ${url}`);
      const s = m[1];
      const ms = Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
      if (ms > gdeltLatestStamp(now)) throw new Error("404");
      return gdeltZip(ms);
    },
  };
}
