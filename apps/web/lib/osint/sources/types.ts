import type { Category, Reliability, Signal, SourceId } from "../types";
import type { Ledger } from "../validate";
import type { GazetteerData } from "../gazetteer";

/** Byte/text fetcher. Production uses the network; tests inject recorded or
 * synthesised upstream payloads so the same parsers run offline. */
export interface Transport {
  text(url: string, init?: { headers?: Record<string, string>; method?: string; body?: string; timeoutMs?: number }): Promise<string>;
  bytes(url: string): Promise<Uint8Array>;
}

export interface SourceMeta {
  id: SourceId;
  name: string;
  kind: string;
  /** Admiralty source reliability — a property of the provider. */
  reliability: Reliability;
  homepage: string;
  description: string;
  /** How long a successful pull stays fresh. */
  ttlMs: number;
  /** How long a last-known-good pull may be served after failures. */
  maxStaleMs: number;
  /** Human description of time coverage / publication lag. */
  coverage: string;
}

export interface CollectContext {
  transport: Transport;
  now: number;
  /** Oldest data worth keeping, in ms. */
  horizonMs: number;
  gazetteer: GazetteerData;
}

/** One actor-country → actor-country observation (GDELT). */
export interface RelationObs {
  from: string;
  to: string;
  time: number;
  articles: number;
  outlet: string;
  goldstein: number;
  tone: number;
  category: Category;
}

export interface CollectResult {
  signals: Signal[];
  relations?: RelationObs[];
  ledger: Ledger;
  integrity?: { check: string; passed: number; total: number; detail?: string };
}

export interface SourceAdapter {
  meta: SourceMeta;
  /** Returns a reason string when the source can't run (e.g. missing API key). */
  disabled?(): string | null;
  collect(ctx: CollectContext): Promise<CollectResult>;
}
