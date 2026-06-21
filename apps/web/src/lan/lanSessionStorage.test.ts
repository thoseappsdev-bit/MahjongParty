import { describe, expect, it } from "vitest";
import { clearStoredLanSession, loadStoredLanSession, saveStoredLanSession } from "./lanSessionStorage";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe("LAN session storage", () => {
  it("saves and loads a valid LAN session", () => {
    const storage = memoryStorage();

    saveStoredLanSession(storage, { roomCode: "JADE42", seat: 1, userId: "u_friend" });

    expect(loadStoredLanSession(storage)).toEqual({ roomCode: "JADE42", seat: 1, userId: "u_friend" });
  });

  it("ignores malformed saved sessions", () => {
    const storage = memoryStorage();
    storage.setItem("mahjong-party-lan-session", JSON.stringify({ roomCode: "JADE42", seat: 8 }));

    expect(loadStoredLanSession(storage)).toBeNull();
  });

  it("clears the saved session", () => {
    const storage = memoryStorage();
    saveStoredLanSession(storage, { roomCode: "JADE42", seat: 0, userId: "u_host" });

    clearStoredLanSession(storage);

    expect(loadStoredLanSession(storage)).toBeNull();
  });
});
