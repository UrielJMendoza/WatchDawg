import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

// Auth-gated, so never statically prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth not configured -> send users to the public command center.
  if (!hasSupabaseEnv()) {
    redirect("/");
  }

  const supabase = await createClient();
  let userId: string | null = null;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    redirect("/login");
  }
  return <>{children}</>;
}
