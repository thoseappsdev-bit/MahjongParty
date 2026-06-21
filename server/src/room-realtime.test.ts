import { describe, expect, it } from "vitest";
import type { TableConfig } from "@mahjong/shared-types";
import { createLanTableService } from "./lan-table-service";
import { markDisconnected } from "./disconnect-tracker";
import { applyDisconnectGrace, parseSocketMessage } from "./room-realtime";

const config: TableConfig = {
  mode: "3-fan",
  tableType: "friendly",
  privacy: "private",
  timerSeconds: 25,
  maxPlayers: 4,
  buyIn: 0,
};

function startedRoom() {
  let clock = 1000;
  const service = createLanTableService({ now: () => clock, code: () => "RTROOM" });
  service.createRoom({ config, userId: "host", displayName: "Host", avatar: "H" });
  service.joinRoom("RTROOM", { userId: "guest", displayName: "Guest", avatar: "G" });
  service.startMatch("RTROOM", { userId: "host" });
  return { service, advanceClock: (ms: number) => (clock += ms) };
}

describe("applyDisconnectGrace", () => {
  it("does nothing before the grace window elapses", () => {
    const { service } = startedRoom();
    const map = markDisconnected({}, "host", 0);
    const result = applyDisconnectGrace(service, "RTROOM", map, 29_999, 30_000);
    expect(result.bottedUserIds).toEqual([]);
    expect(result.map).toEqual({ host: 0 });
  });

  it("converts disconnected humans to bots and clears them from the map", () => {
    const { service } = startedRoom();
    const map = markDisconnected(markDisconnected({}, "host", 0), "guest", 0);
    const result = applyDisconnectGrace(service, "RTROOM", map, 30_000, 30_000);
    expect(result.bottedUserIds.sort()).toEqual(["guest", "host"]);
    expect(result.map).toEqual({});
    expect(result.snapshot?.seats.every((seat) => seat.isBot)).toBe(true);
  });

  it("transfers the host to a remaining human when the host drops", () => {
    const { service } = startedRoom();
    const map = markDisconnected({}, "host", 0);
    const result = applyDisconnectGrace(service, "RTROOM", map, 30_000, 30_000);
    expect(result.bottedUserIds).toEqual(["host"]);
    expect(result.snapshot?.hostUserId).toBe("guest");
  });

  it("skips users who already reconnected or left", () => {
    const { service } = startedRoom();
    // "ghost" is in the grace map but never seated.
    const map = markDisconnected({}, "ghost", 0);
    const result = applyDisconnectGrace(service, "RTROOM", map, 30_000, 30_000);
    expect(result.bottedUserIds).toEqual([]);
    expect(result.map).toEqual({});
  });
});

describe("parseSocketMessage", () => {
  it("parses control + action frames", () => {
    expect(parseSocketMessage(JSON.stringify({ type: "start" }))).toEqual({ type: "start" });
    expect(parseSocketMessage(JSON.stringify({ type: "rematch" }))).toEqual({ type: "rematch" });
    expect(parseSocketMessage(JSON.stringify({ type: "action", intent: { type: "discard", tile: "m1" } }))).toEqual({
      type: "action",
      intent: { type: "discard", tile: "m1" },
    });
  });

  it("rejects malformed or unsupported frames", () => {
    expect(() => parseSocketMessage("not json")).toThrow();
    expect(() => parseSocketMessage(JSON.stringify({ type: "nope" }))).toThrow();
    expect(() => parseSocketMessage(JSON.stringify({ type: "action", intent: {} }))).toThrow();
  });
});
