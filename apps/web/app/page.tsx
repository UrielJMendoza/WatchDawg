"use client";

import dynamic from "next/dynamic";

// The command center is browser-only (MapLibre + Deck.gl WebGL). No auth, no
// Supabase — this route renders the live picture the moment the app boots.
const CommandCenter = dynamic(
  () => import("@/components/gotham/command-center"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center bg-background">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-primary animate-pulse">
          BOOTING GOTHAM…
        </span>
      </div>
    ),
  },
);

export default function Page() {
  return <CommandCenter />;
}
