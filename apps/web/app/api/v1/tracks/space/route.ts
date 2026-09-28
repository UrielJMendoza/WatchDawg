import { NextResponse } from "next/server";
import { tracker } from "@/lib/osint/tracks/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** GET /api/v1/tracks/space — validated orbital element sets (TLE). */
export async function GET() {
  const payload = await tracker().space();
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=600, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
