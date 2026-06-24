import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile, TableConfig } from "@mahjong/shared-types";
import { createLanRoom, joinDiscordActivityRoom, joinLanRoom, resolveLanApiBase } from "./lanClient";

const config: TableConfig = {
  mode: "3-fan",
  tableType: "friendly",
  privacy: "private",
  timerSeconds: 25,
  maxPlayers: 4,
  buyIn: 0,
};

const profile: Profile = {
  userId: "user-1",
  displayName: "Lina",
  avatar: "L",
  level: 1,
  locale: "en",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LAN client", () => {
  it("uses same-origin APIs for production Worker/custom-domain builds", () => {
    expect(resolveLanApiBase({ protocol: "https:", hostname: "mahjong.example.com", search: "" }, true)).toBe("");
    expect(resolveLanApiBase({ protocol: "https:", hostname: "mahjong-party.youraimates.workers.dev", search: "" }, true)).toBe("");
  });

  it("uses same-origin APIs inside Discord Activity launches", () => {
    expect(resolveLanApiBase({ protocol: "https:", hostname: "localhost", search: "?frame_id=abc&instance_id=xyz&platform=desktop" }, false)).toBe("");
  });

  it("uses the local LAN server port during browser development", () => {
    expect(resolveLanApiBase({ protocol: "http:", hostname: "127.0.0.1", search: "" }, false)).toBe("http://127.0.0.1:8787");
    expect(resolveLanApiBase({ protocol: "http:", hostname: "192.168.68.113", search: "" }, false)).toBe(
      "http://192.168.68.113:8787",
    );
  });

  it("sends the Turnstile token when creating a LAN room", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ roomCode: "ABCD" }));

    await createLanRoom("", config, profile, "create-token");

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-turnstile-token")).toBe("create-token");
  });

  it("sends the Turnstile token when joining a Discord activity room", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ roomCode: "ABCD" }));

    await joinDiscordActivityRoom("", { instanceId: "instance-1", config, profile }, "discord-token");

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-turnstile-token")).toBe("discord-token");
  });

  it("does not add a Turnstile header when joining an existing LAN room", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({ roomCode: "ABCD" }));

    await joinLanRoom("", "ABCD", profile);

    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(headers.get("x-turnstile-token")).toBeNull();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
