import { describe, expect, it } from "vitest";
import { createMatchState } from "@mahjong/game-core";
import { coinSettlementDeltasFor, createLanTableService, matchResultFor } from "./lan-table-service";

const config = {
  mode: "3-fan" as const,
  tableType: "friendly" as const,
  privacy: "private" as const,
  timerSeconds: 20,
  maxPlayers: 4 as const,
  buyIn: 0,
};

describe("LAN table service", () => {
  it("creates a room with a host and bot-filled seats", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });

    const response = service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });

    expect(response.room.roomCode).toBe("JADE42");
    expect(response.seat).toBe(0);
    expect(response.room.seats[0]).toMatchObject({ userId: "u_lina", isBot: false });
    expect(response.room.seats[1]).toMatchObject({ displayName: "Bo Bot", isBot: true });
  });

  it("lets a second device replace the first bot seat", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });

    const response = service.joinRoom("JADE42", { userId: "u_friend", displayName: "Friend", avatar: "F" });

    expect(response.seat).toBe(1);
    expect(response.room.seats[1]).toMatchObject({ userId: "u_friend", displayName: "Friend", isBot: false });
  });

  it("uses the Discord activity instance as one shared room", () => {
    const service = createLanTableService({ now: () => 10, code: () => "IGNORED" });
    const host = service.joinOrCreateDiscordActivityRoom({
      config,
      instanceId: "i-activity-123",
      userId: "u_host",
      displayName: "Host",
      avatar: "H",
    });
    const guest = service.joinOrCreateDiscordActivityRoom({
      config,
      instanceId: "i-activity-123",
      userId: "u_guest",
      displayName: "Guest",
      avatar: "G",
    });

    expect(host.room.roomCode).toBe(guest.room.roomCode);
    expect(host.seat).toBe(0);
    expect(guest.seat).toBe(1);
    expect(guest.room.seats[0]).toMatchObject({ displayName: "Host", isBot: false });
    expect(guest.room.seats[1]).toMatchObject({ displayName: "Guest", isBot: false });
  });

  it("starts a match and returns a seat-specific hand", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.joinRoom("JADE42", { userId: "u_friend", displayName: "Friend", avatar: "F" });

    service.startMatch("JADE42", { userId: "u_lina" });
    const host = service.getRoom("JADE42", 0);
    const friend = service.getRoom("JADE42", 1);

    expect(host.match?.mySeat).toBe(0);
    expect(friend.match?.mySeat).toBe(1);
    expect(host.match?.players[1].name).toBe("Friend");
    expect(host.match?.myHand).not.toEqual(friend.match?.myHand);
  });

  it("converts a bot-controlled match seat when a human joins after start", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.startMatch("JADE42", { userId: "u_lina" });

    const response = service.joinRoom("JADE42", { userId: "u_mobile", displayName: "Mobile Friend", avatar: "M" });

    expect(response.seat).toBe(1);
    expect(response.room.match?.players[1]).toMatchObject({
      name: "Mobile Friend",
      avatar: "M",
      isBot: false,
    });
  });

  it("transfers host control when the host leaves", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.joinRoom("JADE42", { userId: "u_friend", displayName: "Friend", avatar: "F" });

    const afterLeave = service.leaveRoom("JADE42", { userId: "u_lina" });

    expect(afterLeave.hostUserId).toBe("u_friend");
    expect(afterLeave.seats[0]).toMatchObject({ userId: "bot_0", isBot: true });
    expect(afterLeave.seats[1]).toMatchObject({ userId: "u_friend", isBot: false });
    expect(afterLeave.auditLog.at(-1)).toMatchObject({ type: "leave", actorUserId: "u_lina", seat: 0 });
  });

  it("lets the transferred host start the hand", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.joinRoom("JADE42", { userId: "u_friend", displayName: "Friend", avatar: "F" });
    service.leaveRoom("JADE42", { userId: "u_lina" });

    const started = service.startMatch("JADE42", { userId: "u_friend" });

    expect(started.phase).toBe("playing");
    expect(started.match?.players[1]).toMatchObject({ name: "Friend", isBot: false });
  });

  it("starts a rematch with the same seats and a fresh match", () => {
    let now = 10;
    const service = createLanTableService({ now: () => now, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.joinRoom("JADE42", { userId: "u_friend", displayName: "Friend", avatar: "F" });
    const first = service.startMatch("JADE42", { userId: "u_lina" });
    now = 11;

    const second = service.rematch("JADE42", { userId: "u_lina" });

    expect(second.phase).toBe("playing");
    expect(second.seats[1]).toMatchObject({ userId: "u_friend", displayName: "Friend" });
    expect(second.match?.recentEvent).toContain("Match started");
    expect(second.match?.myHand).not.toEqual(first.match?.myHand);
    expect(second.auditLog.at(-1)).toMatchObject({ type: "rematch", actorUserId: "u_lina" });
  });

  it("rejects non-host match starts", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.joinRoom("JADE42", { userId: "u_friend", displayName: "Friend", avatar: "F" });

    expect(() => service.startMatch("JADE42", { userId: "u_friend" })).toThrow("Only the host");
  });

  it("accepts a legal host discard and advances the shared match", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.startMatch("JADE42", { userId: "u_lina" });
    const before = service.getRoom("JADE42", 0);
    const tile = before.match?.myHand[0] ?? "m1";

    const after = service.submitAction("JADE42", { seat: 0, userId: "u_lina", intent: { type: "discard", tile } });

    expect(after.match?.players[0].discards).toContain(tile);
    expect(after.match?.recentEvent).toContain("discarded");
  });

  it("rejects stale or forged seat sessions for hidden hands and actions", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.joinRoom("JADE42", { userId: "u_friend", displayName: "Friend", avatar: "F" });
    const started = service.startMatch("JADE42", { userId: "u_lina" });

    expect(() => service.getRoom("JADE42", 0, "u_friend")).toThrow("Session no longer controls seat 1");
    expect(() =>
      service.submitAction("JADE42", {
        seat: 0,
        userId: "u_friend",
        intent: { type: "discard", tile: started.match?.myHand[0] ?? "m1" },
      }),
    ).toThrow("Session no longer controls seat 1");
  });

  it("adds a structured audit trail for room and match actions", () => {
    const service = createLanTableService({ now: () => 10, code: () => "JADE42" });
    service.createRoom({ config, userId: "u_lina", displayName: "Lina", avatar: "L" });
    service.joinRoom("JADE42", { userId: "u_friend", displayName: "Friend", avatar: "F" });
    const started = service.startMatch("JADE42", { userId: "u_lina" });
    const tile = started.match?.myHand[0] ?? "m1";

    const afterAction = service.submitAction("JADE42", { seat: 0, userId: "u_lina", intent: { type: "discard", tile } });

    expect(afterAction.auditLog.map((entry) => entry.type)).toEqual(["create", "join", "start", "action"]);
    expect(afterAction.auditLog.at(-1)).toMatchObject({
      actorUserId: "u_lina",
      seat: 0,
      type: "action",
      message: expect.stringContaining("discard"),
    });
  });

  it("returns a neutral result when the wall is exhausted", () => {
    const match = createMatchState("wall-draw-lan");
    const exhausted = {
      ...match,
      phase: "complete" as const,
      winnerSeat: null,
      wall: [],
      eventLog: [...match.eventLog, "The wall is exhausted."],
    };

    expect(matchResultFor(exhausted)).toMatchObject({
      winnerName: "Wall Draw",
      totalFan: 0,
      deltas: [0, 0, 0, 0],
      policyCopy: "The wall was exhausted. No winner this hand.",
    });
  });

  it("uses the coin table buy-in as the Old Hong Kong settlement base unit", () => {
    const match = createMatchState("coin-settlement-lan");
    const winning = {
      ...match,
      phase: "complete" as const,
      winnerSeat: 0 as const,
      winContext: "discard" as const,
      payerSeat: 1 as const,
      players: match.players.map((player, index) =>
        index === 0
          ? {
              ...player,
              hand: ["m1", "m1", "m1", "p2", "p2", "p2", "s3", "s3", "s3", "dr", "dr", "dr", "we", "we"],
              melds: [],
              flowers: [],
            }
          : player,
      ) as typeof match.players,
    };

    const result = matchResultFor(winning, { ...config, tableType: "coin", buyIn: 2_000 });

    expect(result?.totalFan).toBe(6);
    expect(result?.deltas).toEqual([16_000, -16_000, 0, 0]);
  });

  it("maps completed human coin-table results to economy settlement deltas", () => {
    const snapshot = {
      roomCode: "COIN88",
      hostUserId: "11111111-1111-4111-8111-111111111111",
      config: { ...config, tableType: "coin" as const, buyIn: 2_000 },
      seats: [
        {
          seat: 0 as const,
          userId: "11111111-1111-4111-8111-111111111111",
          displayName: "Lina",
          avatar: "L",
          isBot: false,
          ready: true,
        },
        {
          seat: 1 as const,
          userId: "22222222-2222-4222-8222-222222222222",
          displayName: "Friend",
          avatar: "F",
          isBot: false,
          ready: true,
        },
        {
          seat: 2 as const,
          userId: "33333333-3333-4333-8333-333333333333",
          displayName: "Third",
          avatar: "T",
          isBot: false,
          ready: true,
        },
        {
          seat: 3 as const,
          userId: "44444444-4444-4444-8444-444444444444",
          displayName: "Fourth",
          avatar: "F",
          isBot: false,
          ready: true,
        },
      ],
      result: {
        winnerSeat: 0 as const,
        winnerName: "Lina",
        totalFan: 6,
        fanLines: [],
        deltas: [16_000, -16_000, 0, 0] as [number, number, number, number],
        policyCopy: "Virtual coins have no cash value.",
      },
      match: null,
      eventLog: [],
      auditLog: [],
      phase: "complete" as const,
      updatedAt: 123,
    };

    expect(coinSettlementDeltasFor(snapshot)).toEqual([
      { userId: "11111111-1111-4111-8111-111111111111", amount: 16_000 },
      { userId: "22222222-2222-4222-8222-222222222222", amount: -16_000 },
      { userId: "33333333-3333-4333-8333-333333333333", amount: 0 },
      { userId: "44444444-4444-4444-8444-444444444444", amount: 0 },
    ]);
  });

  it("maps bot coin-table results to human deltas backed by the house", () => {
    const service = createLanTableService({ now: () => 10, code: () => "COIN88" });
    const response = service.createRoom({
      config: { ...config, tableType: "coin", buyIn: 2_000 },
      userId: "11111111-1111-4111-8111-111111111111",
      displayName: "Lina",
      avatar: "L",
    });

    expect(
      coinSettlementDeltasFor({
        ...response.room,
        phase: "complete",
        result: {
          winnerSeat: 0,
          winnerName: "Lina",
          totalFan: 6,
          fanLines: [],
          deltas: [16_000, -16_000, 0, 0],
          policyCopy: "Virtual coins have no cash value.",
        },
      }),
    ).toEqual([{ userId: "11111111-1111-4111-8111-111111111111", amount: 16_000 }]);
  });

  it("does not settle a human loss larger than the reserved bankroll", () => {
    const service = createLanTableService({ now: () => 10, code: () => "COIN88" });
    const response = service.createRoom({
      config: { ...config, tableType: "coin", buyIn: 2_000 },
      userId: "11111111-1111-4111-8111-111111111111",
      displayName: "Lina",
      avatar: "L",
    });

    expect(
      coinSettlementDeltasFor({
        ...response.room,
        phase: "complete",
        result: {
          winnerSeat: 1,
          winnerName: "Bo Bot",
          totalFan: 13,
          fanLines: [],
          deltas: [-128_000, 128_000, 0, 0],
          policyCopy: "Virtual coins have no cash value.",
        },
      }),
    ).toBeNull();
  });
});
