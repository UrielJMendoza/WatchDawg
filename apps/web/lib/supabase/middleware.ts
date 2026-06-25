import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, SUPABASE_ANON_KEY_SAFE, SUPABASE_URL_SAFE } from "./env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // No Supabase configured -> auth is disabled; pass through untouched so the
  // public command center works with zero environment.
  if (!hasSupabaseEnv()) return supabaseResponse;

  const supabase = createServerClient(
    SUPABASE_URL_SAFE,
    SUPABASE_ANON_KEY_SAFE,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session — required for Server Components to read auth state.
  await supabase.auth.getUser();

  return supabaseResponse;
}
