import { NextResponse } from "next/server";
import { cached } from "@/lib/intel/cache";
import { fetchGeoEvents } from "@/lib/intel/sources/gdelt";
import { acledEnabled, fetchAcledEvents } from "@/lib/intel/sources/acled";
import { buildArcs, nationMetrics } from "@/lib/intel/derive";
import { seedEvents } from "@/lib/intel/seed";
import { NATIONS, THEATERS } from "@/lib/intel/theaters";
import type {
  EventsPayload,
  IntelEvent,
  Theater,
} from "@/lib/intel/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL = 60_000;

function isTheater(v: string | null): v is Theater {
  return v === "middle-east" || v === "eastern-europe" || v === "global";
}

async function collect(theater: Theater): Promise<IntelEvent[]> {
  const cfg = THEATERS[theater];
  const geo = await fetchGeoEvents(cfg.query, cfg.bbox, "1d");

  let acled: IntelEvent[] = [];
  if (acledEnabled()) {
    const perNation = await Promise.all(
      cfg.nations.map((c) =>
        fetchAcledEvents(NATIONS[c].name).catch(() => [] as IntelEvent[]),
      ),
    );
    acled = perNation.flat();
  }

  const merged = [...acled, ...geo];
  // Trim to the strongest signals so the map stays readable.
  return merged
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 250);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const theaterParam = url.searchParams.get("theater");
  const theater: Theater = isTheater(theaterParam)
    ? theaterParam
    : "middle-east";

  const { value, fresh } = await cached<IntelEvent[]>(
    `events:${theater}`,
    TTL,
    () => collect(theater),
  );

  const live = value && value.length > 0;
  const events = live ? value! : seedEvents();
  const status: EventsPayload["status"] = live
    ? fresh
      ? "ok"
      : "degraded"
    : "degraded";

  const payload: EventsPayload = {
    status,
    theater,
    events,
    arcs: buildArcs(events, theater),
    nations: nationMetrics(events, theater),
    updatedAt: new Date().toISOString(),
    note: live
      ? undefined
      : "Live uplink unavailable — showing reference hotspots.",
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
