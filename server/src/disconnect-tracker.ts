// Pure disconnect-grace tracking for realtime rooms.
//
// When a seated human's last socket closes, we don't immediately replace them
// with a bot — we record the disconnect time and give them a grace window to
// reconnect. This module is the pure decision layer; the Durable Object persists
// the map and drives an alarm from `nextAlarmAt`.

export type DisconnectMap = Record<string, number>; // userId -> disconnectedAt (ms)

export function markDisconnected(map: DisconnectMap, userId: string, now: number): DisconnectMap {
  return { ...map, [userId]: now };
}

/** Clears a user from the grace map (reconnected, or already converted to a bot). */
export function markConnected(map: DisconnectMap, userId: string): DisconnectMap {
  if (!(userId in map)) {
    return map;
  }
  const next = { ...map };
  delete next[userId];
  return next;
}

/** Users whose grace window has elapsed and should be converted to bots. */
export function dueForBot(map: DisconnectMap, now: number, graceMs: number): string[] {
  return Object.entries(map)
    .filter(([, disconnectedAt]) => now - disconnectedAt >= graceMs)
    .map(([userId]) => userId);
}

/** Earliest time a pending disconnect becomes due, for scheduling the DO alarm. */
export function nextAlarmAt(map: DisconnectMap, graceMs: number): number | null {
  const times = Object.values(map);
  if (times.length === 0) {
    return null;
  }
  return Math.min(...times) + graceMs;
}
