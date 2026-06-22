import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { discordRoomCode, isDiscordActivityLaunch } from "./discordActivity";

describe("discord activity helpers", () => {
  it("detects Discord launch parameters", () => {
    expect(isDiscordActivityLaunch("?frame_id=f&instance_id=i&platform=desktop")).toBe(true);
    expect(isDiscordActivityLaunch("?instance_id=i&platform=desktop")).toBe(false);
  });

  it("includes the public client id in the server token exchange payload", () => {
    const source = readFileSync(new URL("./discordActivity.ts", import.meta.url), "utf8");
    expect(source).toContain("JSON.stringify({ code, clientId })");
  });

  it("derives a stable room code from an activity instance id", () => {
    expect(discordRoomCode("i-1234567890-gc-912952092627435520-912954213460484116")).toBe(
      discordRoomCode("i-1234567890-gc-912952092627435520-912954213460484116"),
    );
    expect(discordRoomCode("i-1234567890-gc-912952092627435520-912954213460484116")).toHaveLength(6);
  });
});
