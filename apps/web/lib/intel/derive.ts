import type { Arc, IntelEvent, NationMetric, Theater } from "./types";
import { threatFromScore } from "./types";
import { NATIONS, THEATERS } from "./theaters";

/**
 * DERIVED visualisation layer. These are NOT literal munition tracks — they are
 * "tension axes" computed from where real reporting is clustering. For each
 * focus nation we connect its hottest cluster to its adversary's capital, so
 * the map reads as a live picture of pressure between the parties.
 */
export function buildArcs(events: IntelEvent[], theater: Theater): Arc[] {
  const nations = THEATERS[theater].nations;
  const arcs: Arc[] = [];

  for (const code of nations) {
    const nation = NATIONS[code];
    const adversary = NATIONS[nation.adversary];
    if (!nations.includes(adversary.code)) continue;

    // Hottest event attributed to this nation.
    const hot = events
      .filter((e) => e.nation === code)
      .sort((a, b) => b.severity - a.severity)[0];

    const from: [number, number] = hot
      ? [hot.lon, hot.lat]
      : [nation.capital.lon, nation.capital.lat];
    const to: [number, number] = [adversary.capital.lon, adversary.capital.lat];

    arcs.push({
      id: `arc-${code}-${adversary.code}`,
      from,
      to,
      label: `${nation.name} → ${adversary.name}`,
      intensity: hot ? hot.severity : 0.4,
      derived: true,
    });
  }

  return arcs;
}

/** Per-nation pressure score from event volume + intensity within its bbox. */
export function nationMetrics(
  events: IntelEvent[],
  theater: Theater,
): NationMetric[] {
  const nations = THEATERS[theater].nations;
  const tally = new Map<string, { count: number; sev: number }>();
  for (const code of nations) tally.set(code, { count: 0, sev: 0 });

  for (const e of events) {
    if (e.nation && tally.has(e.nation)) {
      const t = tally.get(e.nation)!;
      t.count += 1;
      t.sev += e.severity;
    }
  }

  const maxCount = Math.max(1, ...[...tally.values()].map((t) => t.count));

  return nations.map((code) => {
    const t = tally.get(code)!;
    const volume = t.count / maxCount; // 0..1 relative volume
    const intensity = t.count ? t.sev / t.count : 0; // mean severity
    const score = Math.min(1, 0.55 * volume + 0.45 * intensity);
    return {
      code,
      events: t.count,
      score,
      threat: threatFromScore(score),
    };
  });
}
