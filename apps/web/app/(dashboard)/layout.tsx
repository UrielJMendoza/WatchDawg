import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

/**
 * Guard layout for every route under the (dashboard) route group.
 * Uses getUser() (authenticated request to Supabase) rather than
 * getSession() (cookie-only read) so forged cookies are rejected.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  return <>{children}</>;
}
