import { cn } from "@/lib/utils";

export type BannerPosition = "top" | "bottom";

interface ClassificationBannerProps {
  position: BannerPosition;
  text?: string;
}

/**
 * Always-visible classification marking. Two instances render on every
 * page — one fixed to the top of the viewport, one to the bottom.
 * Positioned above the map (z-index 40) but below dialogs (z-50+).
 */
export function ClassificationBanner({
  position,
  text = "UNCLASSIFIED // OSINT",
}: ClassificationBannerProps) {
  return (
    <div
      role="banner"
      aria-label="classification marking"
      data-position={position}
      className={cn(
        "fixed inset-x-0 z-40 flex h-6 items-center justify-center",
        "bg-classification text-background",
        "font-mono text-xs font-bold uppercase tracking-widest",
        "select-none",
        position === "top" ? "top-0" : "bottom-0",
      )}
    >
      {text}
    </div>
  );
}
