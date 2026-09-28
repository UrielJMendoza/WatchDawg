import { topicBySlug } from "@/lib/seo/topics";
import { OG_SIZE, ogCard } from "@/lib/seo/og";

export const alt = "Live map — WatchDawg";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ topic: string }> }) {
  const t = topicBySlug((await params).topic);
  return ogCard({
    kicker: "WATCHDAWG · LIVE",
    title: t?.h1 ?? "Live events map",
    subtitle: t?.description.split(",")[0] ?? "Updated continuously from validated sources.",
  });
}
