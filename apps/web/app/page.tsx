import dynamic from "next/dynamic";
import Link from "next/link";
import { Topbar } from "@/components/topbar";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const WatchDawgMap = dynamic(
  () =>
    import("@/components/map/watchdawg-map").then((m) => ({
      default: m.WatchDawgMap,
    })),
  { ssr: false },
);

export default async function LandingPage() {
  // If logged in, jump straight to the dashboard.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <Topbar email={null} />
      <main className="relative flex-1">
        <WatchDawgMap />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto rounded-sm border border-border bg-surface/95 px-6 py-4 text-center backdrop-blur">
            <div className="section-header mb-2">SIGN IN REQUIRED</div>
            <p className="mb-3 max-w-sm font-mono text-xs text-muted-foreground">
              WatchDawg is access-controlled. Authenticate to view the live
              theater picture.
            </p>
            <Link
              href="/login"
              className="inline-block rounded-sm border border-primary bg-primary px-3 py-1 font-mono text-xs uppercase tracking-widest text-primary-foreground hover:bg-primary/90"
            >
              SIGN IN
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
