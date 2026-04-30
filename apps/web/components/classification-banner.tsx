/**
 * UNCLASSIFIED // OSINT classification marking shown at the top and bottom
 * of every page. Always visible, sticky at the top and fixed at the bottom.
 */
export function ClassificationBanner({
  position,
}: {
  position: "top" | "bottom";
}) {
  const positionClass =
    position === "top"
      ? "sticky top-0 z-50"
      : "fixed bottom-0 left-0 right-0 z-50";

  return (
    <div
      role="banner"
      aria-label="Classification marking: Unclassified, Open Source"
      className={`${positionClass} flex h-6 w-full items-center justify-center bg-classification text-[10px] font-bold uppercase tracking-[0.2em] text-black font-mono`}
    >
      UNCLASSIFIED // OSINT
    </div>
  );
}
