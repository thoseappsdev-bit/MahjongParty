export interface PlayerIdentityStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface RandomUuidLike {
  randomUUID(): string;
}

const playerIdStorageKey = "mahjong-party-player-id";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function loadOrCreatePlayerId(
  storage: PlayerIdentityStorageLike | undefined,
  randomSource: RandomUuidLike = crypto,
): string {
  const stored = storage?.getItem(playerIdStorageKey);
  if (stored && uuidPattern.test(stored)) {
    return stored;
  }

  const created = randomSource.randomUUID();
  storage?.setItem(playerIdStorageKey, created);
  return created;
}
