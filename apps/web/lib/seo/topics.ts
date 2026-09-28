import type { Category, Incident, WindowKey } from "@/lib/osint/types";
import { domainOf } from "@/lib/osint/taxonomy";

/**
 * Search landing pages. Each topic is a live, server-rendered slice of the
 * snapshot with its own title, description and canonical URL, so "live war
 * map" or "earthquake map" searches land on a page that answers them.
 */
export interface Topic {
  slug: string;
  title: string;
  h1: string;
  description: string;
  intro: string;
  window: WindowKey;
  /** Query that reproduces this slice in the console. */
  query: string;
  keywords: string[];
  match: (i: Incident) => boolean;
}

const cats = (...c: Category[]) => (i: Incident) => c.includes(i.category);

export const TOPICS: Topic[] = [
  {
    slug: "war",
    title: "Live war map — armed conflict and attacks worldwide",
    h1: "Live war map",
    description:
      "Real-time map of armed conflict, air strikes, shelling, bombings and attacks on civilians worldwide, fused from ACLED, GDELT and international newsrooms and graded for confidence.",
    intro:
      "Battles, air and drone strikes, shelling, bombings and violence against civilians reported in the last 24 hours. Each incident is corroborated across independent sources where possible and carries a NATO Admiralty grade.",
    window: "24h",
    query: "cat:conflict,security",
    keywords: ["live war map", "war map", "conflict map", "ukraine war map", "gaza map", "air strikes map"],
    match: cats("conflict", "security"),
  },
  {
    slug: "crime",
    title: "Live crime map — shootings, homicides and robberies",
    h1: "Live crime map",
    description:
      "Serious crime from official police open data (San Francisco, Chicago) plus crime headlines from international newsrooms, validated and mapped.",
    intro:
      "Homicides, shootings, robberies, assaults and other serious offences from the latest two weeks of police open-data reports, alongside geocoded crime reporting. Police portals publish with a lag of one to eight days, so this page looks back 30 days; sex offences and domestic incidents are excluded to protect victims.",
    // Portals lag up to ~8 days: a 7-day window can miss them entirely.
    window: "30d",
    query: "cat:crime",
    keywords: ["live crime map", "crime map", "shootings map", "chicago crime map", "san francisco crime map"],
    match: cats("crime"),
  },
  {
    slug: "protests",
    title: "Live protest map — demonstrations, riots and strikes",
    h1: "Live protest map",
    description: "Protests, riots, strikes and civil unrest around the world, updated continuously from ACLED, GDELT and newsrooms.",
    intro: "Demonstrations, riots, general strikes and crackdowns reported in the last 24 hours, clustered by city and graded by how many independent sources report them.",
    window: "24h",
    query: "cat:unrest",
    keywords: ["protest map", "live protests", "riots map", "civil unrest map"],
    match: cats("unrest"),
  },
  {
    slug: "earthquakes",
    title: "Live earthquake map — M2.5+ quakes worldwide",
    h1: "Live earthquake map",
    description: "Earthquakes of magnitude 2.5 and above from the USGS real-time feed, with GDACS impact alerts and tsunami flags.",
    intro: "Every M2.5+ earthquake of the past 7 days from the USGS network, cross-checked against GDACS impact alerts and news reports.",
    window: "7d",
    query: "cat:seismic",
    keywords: ["earthquake map", "live earthquakes", "earthquakes today", "usgs earthquake map"],
    match: cats("seismic"),
  },
  {
    slug: "disasters",
    title: "Live disaster map — storms, floods, wildfires and volcanoes",
    h1: "Live disaster map",
    description: "Tropical cyclones, floods, wildfires, volcanic eruptions and droughts from GDACS, NASA EONET and USGS, updated continuously.",
    intro: "Open natural-hazard events worldwide: cyclones and severe storms, floods, wildfires, volcanoes, drought and more, with GDACS Green / Orange / Red impact alerts.",
    window: "7d",
    query: "domain:hazard",
    keywords: ["disaster map", "natural disasters today", "wildfire map", "hurricane tracker", "flood map"],
    match: (i) => domainOf(i.category) === "hazard",
  },
  {
    slug: "news",
    title: "Live world news map — breaking news by location",
    h1: "Live world news map",
    description: "Breaking headlines from 15 international newsrooms, classified and placed on a map, updated every few minutes.",
    intro: "Headlines from BBC, Al Jazeera, The New York Times, The Guardian, France 24, DW, UN News, NPR and others, classified by type and geocoded to where they happened.",
    window: "24h",
    query: "src:wire",
    keywords: ["world news map", "breaking news map", "live news", "news by location"],
    match: (i) => i.sources.includes("wire"),
  },
];

export function topicBySlug(slug: string): Topic | undefined {
  return TOPICS.find((t) => t.slug === slug);
}
