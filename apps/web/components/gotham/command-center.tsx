"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IntelMap, type MapLayers } from "./intel-map";
import { HudOverlay } from "./hud-overlay";
import { TheaterSwitcher } from "./theater-switcher";
import { WatchlistPanel } from "./watchlist-panel";
import { DossierPanel } from "./dossier-panel";
import { AlertTicker } from "./alert-ticker";
import { BootSequence } from "./boot-sequence";
import { useLiveEvents, useLiveFeed } from "@/lib/intel/client";
import { THEATERS } from "@/lib/intel/theaters";
import type { IntelEvent, NationCode, Theater } from "@/lib/intel/types";

const DEFAULT_LAYERS: MapLayers = {
  borders: true,
  heat: true,
  events: true,
  arcs: true,
  labels: true,
};

export default function CommandCenter() {
  const [theater, setTheater] = useState<Theater>("middle-east");
  const [layers, setLayers] = useState<MapLayers>(DEFAULT_LAYERS);
  const [selectedEvent, setSelectedEvent] = useState<IntelEvent | null>(null);
  const [selectedNation, setSelectedNation] = useState<NationCode | null>("IR");
  const [hover, setHover] = useState<{
    event: IntelEvent;
    x: number;
    y: number;
  } | null>(null);
  const [booted, setBooted] = useState(false);

  const { payload: eventsPayload, degraded: eventsDegraded } =
    useLiveEvents(theater);
  const { payload: feedPayload } = useLiveFeed(theater);

  // Reset selection when the theater changes.
  useEffect(() => {
    setSelectedEvent(null);
    setSelectedNation(THEATERS[theater].nations[0]);
  }, [theater]);

  const events = eventsPayload?.events ?? [];
  const arcs = eventsPayload?.arcs ?? [];
  const nations = useMemo(() => eventsPayload?.nations ?? [], [eventsPayload]);
  const status = eventsPayload?.status ?? "offline";

  const selectedNationMetric =
    nations.find((n) => n.code === selectedNation) ?? null;

  const handleSelectEvent = useCallback((e: IntelEvent | null) => {
    setSelectedEvent(e);
  }, []);

  const handleSelectNation = useCallback((code: NationCode) => {
    setSelectedNation(code);
    setSelectedEvent(null);
  }, []);

  const toggleLayer = useCallback((k: keyof MapLayers) => {
    setLayers((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col bg-background">
      {!booted && <BootSequence onDone={() => setBooted(true)} />}

      {/* Command bar */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-surface px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold tracking-[0.3em] text-foreground">
            GOTHAM
          </span>
          <span className="h-4 w-px bg-primary" aria-hidden />
          <span className="section-header hidden sm:block">
            GEOPOLITICAL INTELLIGENCE // {THEATERS[theater].label}
          </span>
        </div>
        <TheaterSwitcher theater={theater} onChange={setTheater} />
      </header>

      {/* Main grid */}
      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: "260px 1fr 360px" }}
      >
        <WatchlistPanel
          nations={nations}
          layers={layers}
          onToggleLayer={toggleLayer}
          selectedNation={selectedNation}
          onSelectNation={handleSelectNation}
        />

        <main className="relative min-w-0 overflow-hidden">
          <IntelMap
            theater={theater}
            events={events}
            arcs={arcs}
            selectedId={selectedEvent?.id ?? null}
            layers={layers}
            onSelect={handleSelectEvent}
            onHover={setHover}
          />
          <HudOverlay
            theaterLabel={THEATERS[theater].label}
            status={status}
            events={events.length}
            degraded={eventsDegraded}
          />
          {hover && (
            <div
              className="pointer-events-none absolute z-30 max-w-[220px] rounded-sm border border-primary/40 bg-surface/95 px-2 py-1 shadow-glow-primary backdrop-blur"
              style={{
                left: Math.min(hover.x + 14, 9999),
                top: hover.y + 14,
              }}
            >
              <div className="font-mono text-[11px] font-semibold text-foreground">
                {hover.event.name}
              </div>
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {hover.event.count} MENTIONS · SEV{" "}
                {(hover.event.severity * 100).toFixed(0)}
              </div>
            </div>
          )}
        </main>

        <DossierPanel event={selectedEvent} nation={selectedNationMetric} />
      </div>

      {/* Ticker */}
      <div className="h-10 shrink-0">
        <AlertTicker
          items={feedPayload?.items ?? []}
          status={feedPayload?.status ?? "offline"}
        />
      </div>
    </div>
  );
}
