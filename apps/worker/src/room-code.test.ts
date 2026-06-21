import { describe, expect, it } from "vitest";
import { discordRoomCode, generateRoomCode, normalizeRoomCode } from "./room-code";

describe("Cloudflare room codes", () => {
  it("normalizes friendly room codes", () => {
    expect(normalizeRoomCode(" jade42 ")).toBe("JADE42");
  });

  it("generates six-character uppercase room codes", () => {
    expect(generateRoomCode(123456789)).toMatch(/^[0-9A-Z]{6}$/);
  });

  it("maps Discord activity instances to stable room codes", () => {
    expect(discordRoomCode("discord-instance-1")).toBe(discordRoomCode("discord-instance-1"));
    expect(discordRoomCode("discord-instance-1")).not.toBe(discordRoomCode("discord-instance-2"));
  });
});
