"use client";

import type { FeedItem, SourceStatus } from "@/lib/intel/types";
import { cn } from "@/lib/utils";

const NATION_DOT: Record<string, string> = {
  IR: "bg-warning",
  IL: "bg-primary",
  UA: "bg-primary",
  RU: "bg-danger",
};

function Item({ item }: { item: FeedItem }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="group inline-flex shrink-0 items-center gap-2 px-4"
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          item.nation ? NATION_DOT[item.nation] : "bg-muted-foreground",
        )}
      />
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {item.domain}
      </span>
      <span className="font-mono text-[11px] text-foreground/90 group-hover:text-primary">
        {item.title.length > 90 ? item.title.slice(0, 90) + "…" : item.title}
      </span>
      <span className="text-border">{"//"}</span>
    </a>
  );
}

export function AlertTicker({
  items,
  status,
}: {
  items: FeedItem[];
  status: SourceStatus;
}) {
  const live = items.slice(0, 24);
  const loop = live.length ? [...live, ...live] : [];

  return (
    <div className="flex h-full items-center overflow-hidden border-t border-border bg-surface">
      <div className="flex h-full shrink-0 items-center gap-2 border-r border-border bg-surface-2 px-3">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            status === "ok"
              ? "bg-success animate-pulse"
              : status === "degraded"
                ? "bg-warning"
                : "bg-danger",
          )}
        />
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-foreground">
          LIVE FEED
        </span>
      </div>

      <div className="relative h-full flex-1 overflow-hidden">
        {loop.length ? (
          <div className="marquee absolute top-1/2 flex -translate-y-1/2 whitespace-nowrap">
            {loop.map((it, i) => (
              <Item key={`${it.id}-${i}`} item={it} />
            ))}
          </div>
        ) : (
          <div className="flex h-full items-center px-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            — AWAITING LIVE FEED · UPLINK {status.toUpperCase()} —
          </div>
        )}
      </div>
    </div>
  );
}
