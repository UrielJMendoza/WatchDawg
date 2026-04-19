import { cn } from "@/lib/utils";

export function TimelineStrip({ className }: { className?: string }) {
  return (
    <div
      role="region"
      aria-label="Timeline"
      className={cn(
        "col-span-3 flex h-8 items-center border-t border-border bg-surface px-4",
        className,
      )}
    >
      <p className="font-mono text-[0.625rem] uppercase tracking-widest text-muted">
        Timeline — awaiting data
      </p>
    </div>
  );
}
