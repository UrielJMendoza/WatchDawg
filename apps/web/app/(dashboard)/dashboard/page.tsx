import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/topbar";
import { LeftNav } from "@/components/nav/left-nav";
import { DetailPanel } from "@/components/panel/detail-panel";
import { TimelineStrip } from "@/components/timeline/timeline-strip";

const WatchDawgMap = dynamic(
  () =>
    import("@/components/map/watchdawg-map").then((m) => ({
      default: m.WatchDawgMap,
    })),
  { ssr: false },
);

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div
      className="grid h-[calc(100vh-3rem)] w-full"
      style={{
        gridTemplateColumns: "240px 1fr 360px",
        gridTemplateRows: "48px 1fr 32px",
      }}
    >
      <div className="col-span-3 row-start-1">
        <Topbar email={user?.email ?? null} />
      </div>

      <div className="col-start-1 row-start-2 row-end-3 overflow-hidden">
        <LeftNav />
      </div>

      <main className="col-start-2 row-start-2 row-end-3 relative overflow-hidden">
        <WatchDawgMap />
      </main>

      <div className="col-start-3 row-start-2 row-end-3 overflow-hidden">
        <DetailPanel />
      </div>

      <div className="col-span-3 row-start-3">
        <TimelineStrip />
      </div>
    </div>
  );
}
