"use client";

import { createBrowserClient } from "@supabase/ssr";

import { readSupabaseEnv } from "./env";

export function createClient() {
  const { url, anonKey } = readSupabaseEnv();
  return createBrowserClient(url, anonKey);
}
