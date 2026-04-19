/**
 * Centralized, strict env reader for the browser-exposed Supabase config.
 * Fails fast with a readable error so "undefined is not a function" never
 * surfaces in Sentry. Call exactly from the Supabase clients.
 */
export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export function readSupabaseEnv(): SupabasePublicEnv {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env missing: NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set. See apps/web/.env.example.",
    );
  }
  return { url, anonKey };
}
