import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { readSupabaseEnv } from "./env";

/**
 * Server-side Supabase client for Server Components, Route Handlers, and
 * Server Actions. Reads/writes the session cookie via Next's cookies() API.
 * Must be awaited in callers because cookies() is async in Next 15+.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = readSupabaseEnv();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component — cookies are read-only there.
          // updateSession middleware refreshes the cookie on the next request.
        }
      },
    },
  });
}
