import { describe, expect, it } from "vitest";
import { buildRoomSocketUrl } from "./roomSocket";
import type { LanSession } from "./lanClient";

const session: LanSession = { roomCode: "ABC123", seat: 1, userId: "user-1" };

describe("buildRoomSocketUrl", () => {
  it("uses a bearer token when present and the wss scheme for https origins", () => {
    const url = buildRoomSocketUrl("https://api.example.com", session, "jwt-token");
    expect(url).toBe("wss://api.example.com/api/rooms/ABC123/socket?seat=1&token=jwt-token");
  });

  it("falls back to a dev uid when no token exists and maps http -> ws", () => {
    const url = buildRoomSocketUrl("http://127.0.0.1:8787", session, null);
    expect(url).toBe("ws://127.0.0.1:8787/api/rooms/ABC123/socket?seat=1&uid=user-1");
  });
});
