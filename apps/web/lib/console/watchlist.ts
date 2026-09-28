"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Incident } from "@/lib/osint/types";

/**
 * Per-viewer watchlist and alerts, kept in localStorage (a convenience: it
 * never leaves the browser, and everything degrades gracefully when storage
 * is blocked). When a watched country gets a new incident at or above the
 * alert threshold, it lands in the alert tray and — if the viewer allowed
 * it — raises a desktop notification.
 */

const KEY = "watchdawg.watch.v1";
const MAX_SEEN = 2000;
const MAX_ALERTS = 60;
export const ALERT_MIN_SEVERITY = 0.6;

export interface WatchAlert {
  id: string;
  incidentId: string;
  title: string;
  country: string;
  severity: number;
  grade: string;
  at: number;
  read: boolean;
}

interface Stored {
  countries: string[];
  seen: string[];
  alerts: WatchAlert[];
}

function load(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Stored>;
      return {
        countries: Array.isArray(v.countries) ? v.countries.filter((c) => /^[A-Z]{2}$/.test(c)) : [],
        seen: Array.isArray(v.seen) ? v.seen.slice(-MAX_SEEN) : [],
        alerts: Array.isArray(v.alerts) ? v.alerts.slice(0, MAX_ALERTS) : [],
      };
    }
  } catch {
    /* storage blocked or corrupt — start empty */
  }
  return { countries: [], seen: [], alerts: [] };
}

function save(s: Stored) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Pure core, exported for tests: which incidents should raise alerts? */
export function newAlerts(incidents: Incident[], countries: Set<string>, seen: Set<string>, at: number): WatchAlert[] {
  const out: WatchAlert[] = [];
  for (const i of incidents) {
    if (!i.country || !countries.has(i.country) || i.severity < ALERT_MIN_SEVERITY || seen.has(i.id)) continue;
    out.push({
      id: `${i.id}@${at}`,
      incidentId: i.id,
      title: i.title,
      country: i.country,
      severity: i.severity,
      grade: `${i.reliability}${i.credibility}`,
      at,
      read: false,
    });
  }
  return out.sort((a, b) => b.severity - a.severity);
}

export function useWatchlist(incidents: Incident[], countryName: (iso2: string) => string | undefined) {
  const [state, setState] = useState<Stored>({ countries: [], seen: [], alerts: [] });
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const incidentsRef = useRef(incidents);
  incidentsRef.current = incidents;

  useEffect(() => {
    setState(load());
    setLoaded(true);
    setPermission(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const commit = useCallback((next: Stored) => {
    setState(next);
    save(next);
  }, []);

  // Scan every refresh for new qualifying incidents in watched countries.
  useEffect(() => {
    if (!loaded || !state.countries.length || !incidents.length) return;
    const seen = new Set(state.seen);
    const fresh = newAlerts(incidents, new Set(state.countries), seen, Date.now());
    if (!fresh.length) return;
    for (const a of fresh) seen.add(a.incidentId);
    commit({ ...state, seen: [...seen].slice(-MAX_SEEN), alerts: [...fresh, ...state.alerts].slice(0, MAX_ALERTS) });
    if (permission === "granted") {
      for (const a of fresh.slice(0, 3)) {
        try {
          new Notification(`WatchDawg · ${countryName(a.country) ?? a.country}`, { body: a.title, tag: a.incidentId });
        } catch {
          /* some browsers only allow notifications from a service worker */
        }
      }
    }
    // state is intentionally read from the render; commit writes the next one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, loaded]);

  const toggle = useCallback(
    (iso2: string) => {
      const watching = state.countries.includes(iso2);
      const countries = watching ? state.countries.filter((c) => c !== iso2) : [...state.countries, iso2];
      // Baseline: what is already on the map when you start watching is not "new".
      const seen = new Set(state.seen);
      if (!watching) for (const i of incidentsRef.current) if (i.country === iso2) seen.add(i.id);
      commit({ ...state, countries, seen: [...seen].slice(-MAX_SEEN) });
    },
    [state, commit],
  );

  const markAllRead = useCallback(() => commit({ ...state, alerts: state.alerts.map((a) => ({ ...a, read: true })) }), [state, commit]);
  const clear = useCallback(() => commit({ ...state, alerts: [] }), [state, commit]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return;
    try {
      setPermission(await Notification.requestPermission());
    } catch {
      /* ignore */
    }
  }, []);

  return {
    countries: state.countries,
    alerts: state.alerts,
    unread: state.alerts.filter((a) => !a.read).length,
    watching: (iso2: string) => state.countries.includes(iso2),
    toggle,
    markAllRead,
    clear,
    permission,
    requestPermission,
  };
}

export type Watchlist = ReturnType<typeof useWatchlist>;
