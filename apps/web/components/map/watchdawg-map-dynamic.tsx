"use client";

import dynamic from "next/dynamic";

/**
 * Client boundary for the MapLibre/Deck.gl map. `ssr: false` is only allowed
 * inside a Client Component, so server pages import this wrapper instead of
 * calling `next/dynamic` directly.
 */
export const WatchDawgMapDynamic = dynamic(
  () =>
    import("./watchdawg-map").then((m) => ({ default: m.WatchDawgMap })),
  { ssr: false },
);
