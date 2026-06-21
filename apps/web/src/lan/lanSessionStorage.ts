import type { LanSession } from "./lanClient";

const storageKey = "mahjong-party-lan-session";

interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): unknown;
  removeItem(key: string): unknown;
}

export function saveStoredLanSession(storage: SessionStorageLike | undefined, session: LanSession): void {
  storage?.setItem(storageKey, JSON.stringify(session));
}

export function loadStoredLanSession(storage: SessionStorageLike | undefined): LanSession | null {
  const raw = storage?.getItem(storageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LanSession>;
    if (
      typeof parsed.roomCode === "string" &&
      typeof parsed.userId === "string" &&
      (parsed.seat === 0 || parsed.seat === 1 || parsed.seat === 2 || parsed.seat === 3)
    ) {
      return { roomCode: parsed.roomCode, seat: parsed.seat, userId: parsed.userId };
    }
  } catch {
    return null;
  }

  return null;
}

export function clearStoredLanSession(storage: SessionStorageLike | undefined): void {
  storage?.removeItem(storageKey);
}
