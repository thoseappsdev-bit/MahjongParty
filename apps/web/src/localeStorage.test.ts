import { describe, expect, it } from "vitest";
import { loadStoredLocale, saveStoredLocale } from "./localeStorage";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("locale storage", () => {
  it("restores a supported locale", () => {
    const storage = new MemoryStorage();
    saveStoredLocale(storage, "id");

    expect(loadStoredLocale(storage)).toBe("id");
  });

  it("ignores unsupported locale data", () => {
    const storage = new MemoryStorage();
    storage.setItem("mahjong-party-locale", "fr");

    expect(loadStoredLocale(storage)).toBeNull();
  });
});
