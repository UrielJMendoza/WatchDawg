"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY_SAFE, SUPABASE_URL_SAFE } from "./env";

export function createClient() {
  // Safe placeholders keep construction from throwing when Supabase is not
  // configured (the public command center does not require auth).
  return createBrowserClient(SUPABASE_URL_SAFE, SUPABASE_ANON_KEY_SAFE);
}
