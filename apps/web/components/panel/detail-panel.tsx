import { cn } from "@/lib/utils";

export function DetailPanel({ className }: { className?: string }) {
  return (
    <aside
      aria-label="Detail panel"
      className={cn(
        "flex h-full flex-col border-l border-border bg-surface",
        className,
      )}
    >
      <div className="border-b border-border p-4">
        <h2 className="section-header">SELECTION</h2>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <p className="text-center font-mono text-xs uppercase tracking-widest text-muted">
          No selection
        </p>
      </div>
    </aside>
  );
}
