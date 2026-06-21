import { describe, expect, it } from "vitest";
import { loadOrCreatePlayerId } from "./playerIdentityStorage";

describe("player identity storage", () => {
  it("reuses a valid stored UUID", () => {
    const storage = storageWith("mahjong-party-player-id", "11111111-1111-4111-8111-111111111111");

    expect(loadOrCreatePlayerId(storage, { randomUUID: () => "22222222-2222-4222-8222-222222222222" })).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("creates and stores a UUID when none exists", () => {
    const storage = storageWith();

    const id = loadOrCreatePlayerId(storage, { randomUUID: () => "22222222-2222-4222-8222-222222222222" });

    expect(id).toBe("22222222-2222-4222-8222-222222222222");
    expect(storage.getItem("mahjong-party-player-id")).toBe(id);
  });
});

function storageWith(key?: string, value?: string) {
  const map = new Map<string, string>();
  if (key && value) {
    map.set(key, value);
  }
  return {
    getItem: (itemKey: string) => map.get(itemKey) ?? null,
    setItem: (itemKey: string, itemValue: string) => map.set(itemKey, itemValue),
  };
}
