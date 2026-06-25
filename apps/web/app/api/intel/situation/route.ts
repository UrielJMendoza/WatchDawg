import { NextResponse } from "next/server";
import { cached } from "@/lib/intel/cache";
import { fetchSituationReports } from "@/lib/intel/sources/reliefweb";
import { NATIONS, THEATERS } from "@/lib/intel/theaters";
import type { FeedItem, FeedPayload, Theater } from "@/lib/intel/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL = 300_000;

function isTheater(v: string | null): v is Theater {
  return v === "middle-east" || v === "eastern-europe" || v === "global";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const theaterParam = url.searchParams.get("theater");
  const theater: Theater = isTheater(theaterParam)
    ? theaterParam
    : "middle-east";
  const cfg = THEATERS[theater];

  const { value, fresh } = await cached<FeedItem[]>(
    `situation:${theater}`,
    TTL,
    async () => {
      const perNation = await Promise.all(
        cfg.nations.map((c) =>
          fetchSituationReports(NATIONS[c].name, c).catch(
            () => [] as FeedItem[],
          ),
        ),
      );
      return perNation
        .flat()
        .sort((a, b) => b.seen.localeCompare(a.seen))
        .slice(0, 24);
    },
  );

  const items = value ?? [];
  const live = items.length > 0;

  const payload: FeedPayload = {
    status: live ? (fresh ? "ok" : "degraded") : "offline",
    theater,
    items,
    updatedAt: new Date().toISOString(),
    note: live ? undefined : "No situation reports available.",
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
