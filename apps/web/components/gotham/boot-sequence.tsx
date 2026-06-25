"use client";

import { useEffect, useRef, useState } from "react";

const LINES = [
  "GOTHAM INTELLIGENCE PLATFORM // v4.8",
  "ESTABLISHING SECURE UPLINK ............ OK",
  "MOUNTING OSINT FEEDS [GDELT // RELIEFWEB] OK",
  "CALIBRATING THEATER GEOMETRY .......... OK",
  "SYNCING NATION TRACKS [IR·IL·UA·RU] ... OK",
  "RENDERING LIVE PICTURE ................ OK",
  "ALL SYSTEMS NOMINAL",
];

/** Cinematic terminal boot intro that fades out into the live command center. */
export function BootSequence({ onDone }: { onDone: () => void }) {
  const [shown, setShown] = useState(0);
  const [closing, setClosing] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (shown >= LINES.length) {
      const t = setTimeout(() => setClosing(true), 500);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setShown((s) => s + 1), 260);
    return () => clearTimeout(t);
  }, [shown]);

  useEffect(() => {
    if (!closing || done.current) return;
    done.current = true;
    const t = setTimeout(onDone, 650);
    return () => clearTimeout(t);
  }, [closing, onDone]);

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-700 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      style={{ pointerEvents: closing ? "none" : "auto" }}
    >
      <div className="scanlines pointer-events-none absolute inset-0 opacity-40" />
      <div className="grid-pan pointer-events-none absolute inset-0 opacity-[0.07]" />
      <div className="relative w-[min(560px,90vw)] rounded-sm border border-primary/30 bg-surface/70 p-6 shadow-glow-primary">
        <div className="mb-4 flex items-center gap-2">
          <span className="h-2.5 w-2.5 animate-ping rounded-full bg-success" />
          <span className="font-mono text-xs uppercase tracking-[0.3em] text-primary">
            G O T H A M
          </span>
        </div>
        <div className="space-y-1 font-mono text-[11px] leading-relaxed text-success">
          {LINES.slice(0, shown).map((l, i) => (
            <div key={i} className="animate-fade-in">
              <span className="text-muted-foreground">{">"}</span> {l}
            </div>
          ))}
          {shown < LINES.length && (
            <span className="inline-block h-3 w-2 animate-flicker bg-success align-middle" />
          )}
        </div>
      </div>
    </div>
  );
}
