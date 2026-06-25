import { NextResponse } from "next/server";
import { cached } from "@/lib/intel/cache";
import { fetchArticles } from "@/lib/intel/sources/gdelt";
import { nationForName } from "@/lib/intel/nations";
import { THEATERS } from "@/lib/intel/theaters";
import type { FeedItem, FeedPayload, Theater } from "@/lib/intel/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL = 45_000;

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

  const { value, fresh } = await cached<FeedItem[]>(`feed:${theater}`, TTL, () =>
    fetchArticles(cfg.query, 60, "2d"),
  );

  const items = (value ?? []).map((it) => ({
    ...it,
    nation: nationForName(it.country, it.title) ?? it.nation,
  }));

  const live = items.length > 0;
  const status: FeedPayload["status"] = live
    ? fresh
      ? "ok"
      : "degraded"
    : "offline";

  const payload: FeedPayload = {
    status,
    theater,
    items,
    updatedAt: new Date().toISOString(),
    note: live ? undefined : "No live articles — uplink degraded.",
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
