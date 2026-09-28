import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/osint/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET /api/v1/sources — per-source validation ledger and health. */
export async function GET() {
  const snap = await getSnapshot("24h");
  return NextResponse.json(
    { generatedAt: snap.generatedAt, sources: snap.sources },
    { headers: { "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=120" } },
  );
}
