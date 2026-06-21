import { describe, expect, it } from "vitest";
import { discordRoomCode, isDiscordActivityLaunch } from "./discordActivity";

describe("discord activity helpers", () => {
  it("detects Discord launch parameters", () => {
    expect(isDiscordActivityLaunch("?frame_id=f&instance_id=i&platform=desktop")).toBe(true);
    expect(isDiscordActivityLaunch("?instance_id=i&platform=desktop")).toBe(false);
  });

  it("derives a stable room code from an activity instance id", () => {
    expect(discordRoomCode("i-1234567890-gc-912952092627435520-912954213460484116")).toBe(
      discordRoomCode("i-1234567890-gc-912952092627435520-912954213460484116"),
    );
    expect(discordRoomCode("i-1234567890-gc-912952092627435520-912954213460484116")).toHaveLength(6);
  });
});
