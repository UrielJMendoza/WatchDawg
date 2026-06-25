"use client";

import useSWR from "swr";
import type {
  EventsPayload,
  FeedPayload,
  PulsePayload,
  NationCode,
  Theater,
} from "./types";

const jsonFetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const EVENTS_INTERVAL = 20_000;
const FEED_INTERVAL = 12_000;

export function useLiveEvents(theater: Theater) {
  const { data, error, isLoading } = useSWR<EventsPayload>(
    `/api/intel/events?theater=${theater}`,
    jsonFetcher,
    {
      refreshInterval: EVENTS_INTERVAL,
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 5_000,
    },
  );
  return {
    payload: data ?? null,
    loading: isLoading,
    degraded: Boolean(error) || data?.status !== "ok",
  };
}

export function useLiveFeed(theater: Theater) {
  const { data, error, isLoading } = useSWR<FeedPayload>(
    `/api/intel/feed?theater=${theater}`,
    jsonFetcher,
    {
      refreshInterval: FEED_INTERVAL,
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 5_000,
    },
  );
  return {
    payload: data ?? null,
    loading: isLoading,
    degraded: Boolean(error) || data?.status !== "ok",
  };
}

/** On-demand per-nation tone/volume timeline for the dossier sparkline. */
export function useNationPulse(nation: NationCode | null) {
  const { data, isLoading } = useSWR<PulsePayload>(
    nation ? `/api/intel/pulse?nation=${nation}` : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60_000,
    },
  );
  return { pulse: data ?? null, loading: isLoading };
}
