import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/osint/engine";
import { isWindowKey, type WindowKey } from "@/lib/osint/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/v1/snapshot?window=24h   (1h | 6h | 24h | 7d | 30d)
 *
 * Fused incidents, hotspots, timeline and per-source validation health for
 * a time window. Cached at the edge for 30 s so any number of viewers cost
 * one upstream pull per source TTL.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const w = url.searchParams.get("window");
  const window: WindowKey = isWindowKey(w) ? w : "24h";
  try {
    const snap = await getSnapshot(window);
    return NextResponse.json(snap, {
      headers: {
        "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "snapshot_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
