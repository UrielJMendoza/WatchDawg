import { createClient } from "@/lib/supabase/server";
import { WatchdawgMapLazy } from "@/components/map/map-loader";
import { Topbar } from "@/components/topbar";
import { LeftNav } from "@/components/nav/left-nav";
import { DetailPanel } from "@/components/panel/detail-panel";
import { TimelineStrip } from "@/components/timeline-strip";

/**
 * Three-pane dashboard shell. Layout math (height budget):
 *   viewport:                100vh
 *   top classification:      -24px (fixed)
 *   bottom classification:   -24px (fixed)
 *   topbar row:              -48px
 *   timeline row:            -32px
 *   main map pane:          = 100vh - 128px
 *
 * The outer grid uses `calc(100vh - 3rem)` because the root layout
 * pads #main by 24px top and 24px bottom to clear the fixed banners.
 */
export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div
      role="main"
      aria-label="WatchDawg dashboard"
      className="grid flex-1 h-[calc(100vh-3rem)] grid-cols-[240px_1fr_360px] grid-rows-[48px_1fr_32px]"
    >
      <Topbar userEmail={user?.email ?? null} />

      <LeftNav />

      <section
        className="relative h-full w-full overflow-hidden bg-background"
        aria-label="Map viewport"
      >
        <WatchdawgMapLazy />
      </section>

      <DetailPanel />

      <TimelineStrip />
    </div>
  );
}
