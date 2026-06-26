// Pure, DOM-free helpers for the "live read-back" channel indicator.
//
// When an inbound `param` read-back updates a channel, the Console view flags
// that channel as recently updated (channelId → timestamp ms). The strip then
// shows a subtle warm pulse/dot that fades after a short window. These helpers
// keep the recency math testable without any timers or `Date.now()` at module
// scope (callers pass `now` in).

/** Default fade window for the live indicator, in milliseconds. */
export const RECENT_WINDOW_MS = 1200;

/** Map of channelId → last-updated timestamp (ms since epoch). */
export type RecentMap = Record<string, number>;

/**
 * True when `updatedAt` is within `windowMs` of `now` (inclusive of 0, exclusive
 * of the far edge). A missing/undefined timestamp is never recent.
 */
export function isRecent(
  updatedAt: number | undefined,
  now: number,
  windowMs: number = RECENT_WINDOW_MS,
): boolean {
  if (updatedAt === undefined) return false;
  const age = now - updatedAt;
  return age >= 0 && age < windowMs;
}

/**
 * Stamp `channelId` as updated at `now`. Returns a NEW map (so React state
 * updates cleanly), or the SAME map when the stamp is unchanged.
 */
export function markUpdated(map: RecentMap, channelId: string, now: number): RecentMap {
  if (map[channelId] === now) return map;
  return { ...map, [channelId]: now };
}

/**
 * Drop entries older than `windowMs` relative to `now`. Returns the SAME map
 * when nothing expired (referentially stable — lets callers skip a re-render).
 */
export function pruneExpired(
  map: RecentMap,
  now: number,
  windowMs: number = RECENT_WINDOW_MS,
): RecentMap {
  let changed = false;
  const next: RecentMap = {};
  for (const [id, ts] of Object.entries(map)) {
    if (isRecent(ts, now, windowMs)) {
      next[id] = ts;
    } else {
      changed = true;
    }
  }
  return changed ? next : map;
}
