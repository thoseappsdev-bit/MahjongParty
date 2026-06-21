import { describe, expect, it } from "vitest";
import { loadStoredWallet, saveStoredWallet } from "./walletStorage";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("wallet storage", () => {
  it("restores a valid wallet", () => {
    const storage = new MemoryStorage();
    saveStoredWallet(storage, { coins: 12_000, gems: 90 });

    expect(loadStoredWallet(storage)).toEqual({ coins: 12_000, gems: 90 });
  });

  it("ignores malformed wallet data", () => {
    const storage = new MemoryStorage();
    storage.setItem("mahjong-party-wallet", JSON.stringify({ coins: -10, gems: "bad" }));

    expect(loadStoredWallet(storage)).toBeNull();
  });
});
