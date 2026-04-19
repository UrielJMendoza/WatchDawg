import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { readSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase session cookie on every request. Runs in the
 * Edge middleware. Callers must return the response object this returns,
 * unmutated, so the refreshed cookies reach the browser.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request });

  const { url, anonKey } = readSupabaseEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  // IMPORTANT: call getUser() — it validates the JWT against the Supabase
  // auth server. Do not use getSession() here, which only reads the cookie.
  await supabase.auth.getUser();

  return supabaseResponse;
}
