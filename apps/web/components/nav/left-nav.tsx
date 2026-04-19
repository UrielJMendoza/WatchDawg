import { cn } from "@/lib/utils";
import { LastIngestLabel, LiveStatusPill } from "@/components/status/live-status-pill";

const SECTIONS: { title: string; caption: string }[] = [
  { title: "FEEDS", caption: "Awaiting ingest" },
  { title: "FILTERS", caption: "No constraints applied" },
  { title: "ENTITIES", caption: "No tracked entities" },
  { title: "SAVED VIEWS", caption: "No saved views" },
];

export function LeftNav({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full flex-col border-r border-border bg-surface",
        className,
      )}
    >
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="section-header">{s.title}</h2>
            <p className="mt-2 font-mono text-[0.625rem] uppercase tracking-widest text-muted">
              {s.caption}
            </p>
          </section>
        ))}
      </div>

      <footer className="border-t border-border p-4">
        <h2 className="section-header">SYSTEM</h2>
        <div className="mt-3 space-y-2">
          <LiveStatusPill variant="dot" />
          <LastIngestLabel />
        </div>
      </footer>
    </nav>
  );
}
