"use client";

import dynamic from "next/dynamic";

/**
 * Dynamic wrapper so maplibre-gl + deck.gl (~270 KB gz combined) do not
 * appear in the initial dashboard bundle. Renders a mono skeleton while
 * the map chunk streams in.
 */
export const WatchdawgMapLazy = dynamic(
  () => import("./watchdawg-map").then((m) => ({ default: m.WatchdawgMap })),
  {
    ssr: false,
    loading: () => (
      <div
        role="status"
        aria-live="polite"
        className="flex h-full w-full items-center justify-center bg-surface"
      >
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Loading map…
        </p>
      </div>
    ),
  },
);
