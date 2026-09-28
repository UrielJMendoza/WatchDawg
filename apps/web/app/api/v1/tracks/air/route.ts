import { NextResponse } from "next/server";
import { tracker } from "@/lib/osint/tracks/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/v1/tracks/air — military and emergency-squawk aircraft, live. */
export async function GET() {
  const payload = await tracker().air();
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=10, s-maxage=15, stale-while-revalidate=30" },
  });
}
