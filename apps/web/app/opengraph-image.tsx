import { OG_SIZE, ogCard } from "@/lib/seo/og";

export const alt = "WatchDawg — live 3D globe of world events";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return ogCard({
    kicker: "WATCHDAWG",
    title: "Live global events map",
    subtitle: "War, crime, unrest and disasters — fused from validated sources and graded for confidence.",
  });
}
