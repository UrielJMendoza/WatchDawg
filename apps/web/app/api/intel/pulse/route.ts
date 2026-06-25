import { NextResponse } from "next/server";
import { cached } from "@/lib/intel/cache";
import { fetchTimeline } from "@/lib/intel/sources/gdelt";
import { NATIONS } from "@/lib/intel/theaters";
import type { NationCode, PulsePayload, TimePoint } from "@/lib/intel/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL = 120_000;

function isNation(v: string | null): v is NationCode {
  return v === "IR" || v === "IL" || v === "UA" || v === "RU";
}

interface Bundle {
  volume: TimePoint[];
  tone: TimePoint[];
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const nationParam = url.searchParams.get("nation");
  if (!isNation(nationParam)) {
    return NextResponse.json({ error: "bad nation" }, { status: 400 });
  }
  const nation = nationParam;
  const query = NATIONS[nation].query;

  const { value, fresh } = await cached<Bundle>(`pulse:${nation}`, TTL, async () => {
    const [volume, tone] = await Promise.all([
      fetchTimeline(query, "timelinevol", "14d"),
      fetchTimeline(query, "timelinetone", "14d"),
    ]);
    return { volume, tone };
  });

  const volume = value?.volume ?? [];
  const tone = value?.tone ?? [];
  const toneNow = tone.length ? tone[tone.length - 1].v : 0;
  const live = volume.length > 0 || tone.length > 0;

  const payload: PulsePayload = {
    status: live ? (fresh ? "ok" : "degraded") : "offline",
    nation,
    volume,
    tone,
    toneNow,
    updatedAt: new Date().toISOString(),
    note: live ? undefined : "No timeline data — uplink degraded.",
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
