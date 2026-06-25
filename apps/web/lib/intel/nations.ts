import type { NationCode } from "./types";

/**
 * Best-effort attribution of a free-text country name and/or headline to one
 * of the four focus nations. Used to colour feed items in the ticker.
 */
const MATCHERS: Array<{ code: NationCode; re: RegExp }> = [
  { code: "IR", re: /\b(iran|iranian|tehran|persia|irgc)\b/i },
  { code: "IL", re: /\b(israel|israeli|jerusalem|tel aviv|idf|gaza)\b/i },
  { code: "UA", re: /\b(ukraine|ukrainian|kyiv|kiev|kharkiv|odesa)\b/i },
  { code: "RU", re: /\b(russia|russian|moscow|kremlin|putin)\b/i },
];

export function nationForName(...texts: string[]): NationCode | null {
  const hay = texts.join(" ");
  for (const m of MATCHERS) {
    if (m.re.test(hay)) return m.code;
  }
  return null;
}
