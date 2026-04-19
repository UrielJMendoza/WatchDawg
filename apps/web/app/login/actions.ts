"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";

function asString(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function redirectWithError(message: string): never {
  redirect(`/login?error=${encodeURIComponent(message)}`);
}

/**
 * Password sign-in. Server Action invoked by the login form.
 * On success, redirects to the root (dashboard). On failure, bounces
 * back to /login with ?error= so the page can render it inline.
 */
export async function signInAction(formData: FormData): Promise<never> {
  const email = asString(formData.get("email"));
  const password = asString(formData.get("password"));
  if (!email || !password) {
    redirectWithError("Email and password are required.");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirectWithError(error.message);
  }
  redirect("/");
}

/**
 * Magic-link sign-in. Emails a one-time code that lands back at
 * /auth/callback. Uses the request Origin so it works identically
 * in local dev and production.
 */
export async function sendMagicLinkAction(formData: FormData): Promise<never> {
  const email = asString(formData.get("email"));
  if (!email) {
    redirectWithError("Enter your email above to receive a sign-in link.");
  }
  const headerList = await headers();
  const origin = headerList.get("origin") ?? headerList.get("host") ?? "";
  const emailRedirectTo = `${origin.startsWith("http") ? origin : `https://${origin}`}/auth/callback`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) {
    redirectWithError(error.message);
  }
  redirect("/login?sent=1");
}
