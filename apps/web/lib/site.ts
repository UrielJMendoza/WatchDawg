export const SITE_NAME = "WatchDawg";
export const SITE_TAGLINE = "Live Global Events Map";

/** Canonical origin: explicit env, then Vercel's production URL, then local. */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}

export function countrySlug(name: string, iso2: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${s}-${iso2.toLowerCase()}`;
}

export function iso2FromSlug(slug: string): string | null {
  const m = /-([a-z]{2})$/.exec(slug);
  return m ? m[1].toUpperCase() : null;
}
