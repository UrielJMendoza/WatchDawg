/**
 * Supabase is OPTIONAL in GOTHAM. The public command center at `/` needs no
 * auth and no env. These helpers let the legacy auth routes (login/dashboard)
 * and the middleware degrade to a no-op when Supabase env vars are absent,
 * instead of throwing "URL and API key are required" on every request.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function hasSupabaseEnv(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/** Non-throwing values for client construction when env is unset. */
export const SUPABASE_URL_SAFE = SUPABASE_URL || "https://placeholder.supabase.co";
export const SUPABASE_ANON_KEY_SAFE = SUPABASE_ANON_KEY || "placeholder-anon-key";
