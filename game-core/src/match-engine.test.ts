import { describe, expect, it } from "vitest";
import {
  claimPriorityOrder,
  createMatchState,
  resolveMatchAction,
  resolveNextBotTurn,
  type MatchClaimIntent,
} from "./match-engine";

describe("match engine", () => {
  it("draws for the next seat after a player discard", () => {
    const match = createMatchState("match-discard");
    const noClaim = {
      ...match,
      players: [
        { ...match.players[0], hand: ["wn", "m1", "m4", "p1", "p4", "s1", "s4", "dr", "dg", "dw", "we", "ws", "ww", "m7"] },
        { ...match.players[1], hand: ["m2", "m5", "m8", "p2", "p5", "p8", "s2", "s5", "s8", "dr", "dg", "dw", "we"] },
        { ...match.players[2], hand: ["m3", "m6", "m9", "p3", "p6", "p9", "s3", "s6", "s9", "dr", "dg", "dw", "we"] },
        { ...match.players[3], hand: ["m2", "m5", "m8", "p2", "p5", "p8", "s2", "s5", "s8", "dr", "dg", "dw", "we"] },
      ] as typeof match.players,
    };
    const next = resolveMatchAction(noClaim, { seat: 0, type: "discard", tile: "wn" });

    expect(next.players[0].discards).toContain("wn");
    expect(next.turnSeat).toBe(1);
    expect(next.players[1].hand).toHaveLength(14);
    expect(next.eventLog.at(-1)).toContain("Bo Bot drew");
  });

  it("creates a claim window when a discard can be claimed", () => {
    const match = createMatchState("match-claim");
    const claimable = {
      ...match,
      players: [
        { ...match.players[0], hand: ["m1", "m4", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dg", "dg", "dw", "dw"] },
        { ...match.players[1], hand: ["m1", "m1", "m2", "m3", "p4", "p5", "p6", "s4", "s5", "s6", "we", "ws", "ww", "wn"] },
        { ...match.players[2], hand: ["m2", "m2", "p7", "p8", "p9", "s7", "s8", "s9", "dr", "dg", "dw", "we", "ws"] },
        { ...match.players[3], hand: ["m2", "m3", "m4", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dg", "dw", "we"] },
      ] as typeof match.players,
    };

    const next = resolveMatchAction(claimable, { seat: 0, type: "discard", tile: "m1" });

    expect(next.claimWindow?.discard.tile).toBe("m1");
    expect(next.claimWindow?.offers.map((offer) => offer.action)).toContain("pong");
    expect(next.claimWindow?.offers.map((offer) => offer.action)).toContain("chi");
  });

  it("orders claim priority as win, kong, pong, then chi", () => {
    const claims: MatchClaimIntent[] = [
      { seat: 3, action: "chi" },
      { seat: 1, action: "pong" },
      { seat: 2, action: "win" },
      { seat: 1, action: "kong" },
    ];

    expect(claimPriorityOrder(claims).map((claim) => claim.action)).toEqual(["win", "kong", "pong", "chi"]);
  });

  it("blocks lower-priority claims until higher-priority offers pass", () => {
    const match = createMatchState("claim-priority-block");
    const claimState = {
      ...match,
      claimWindow: {
        discard: { seat: 0 as const, tile: "m5" },
        offers: [
          { seat: 1 as const, action: "win" as const, tile: "m5" },
          { seat: 2 as const, action: "pong" as const, tile: "m5", tiles: ["m5", "m5", "m5"] as [string, string, string] },
        ],
      },
      players: [
        { ...match.players[0], discards: ["m5"] },
        match.players[1],
        { ...match.players[2], hand: ["m5", "m5", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr"] },
        match.players[3],
      ] as typeof match.players,
    };

    const blocked = resolveMatchAction(claimState, { seat: 2, type: "pong" });

    expect(blocked.claimWindow).not.toBeNull();
    expect(blocked.players[2].melds).not.toContain("pung m5");
    expect(blocked.eventLog.at(-1)).toContain("higher-priority claim");
  });

  it("resolves the next claim in priority order after a winning offer passes", () => {
    const match = createMatchState("claim-priority-pass");
    const claimState = {
      ...match,
      claimWindow: {
        discard: { seat: 0 as const, tile: "m5" },
        offers: [
          { seat: 1 as const, action: "win" as const, tile: "m5" },
          { seat: 2 as const, action: "pong" as const, tile: "m5", tiles: ["m5", "m5", "m5"] as [string, string, string] },
        ],
      },
      players: [
        { ...match.players[0], discards: ["m5"] },
        match.players[1],
        { ...match.players[2], hand: ["m5", "m5", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr"] },
        match.players[3],
      ] as typeof match.players,
    };

    const next = resolveMatchAction(claimState, { seat: 1, type: "pass" });

    expect(next.claimWindow).toBeNull();
    expect(next.turnSeat).toBe(2);
    expect(next.players[2].melds).toContain("pung m5");
    expect(next.players[2].hand.filter((tile) => tile === "m5")).toHaveLength(0);
    expect(next.auditLog.map((event) => event.action.type)).toEqual(expect.arrayContaining(["pass", "pong"]));
  });

  it("lets a winning player complete the hand", () => {
    const match = createMatchState("match-win");
    const winning = {
      ...match,
      players: [
        {
          ...match.players[0],
          hand: ["m1", "m1", "m2", "m2", "m3", "m3", "p4", "p4", "p5", "p5", "s6", "s6", "dr", "dr"],
        },
        match.players[1],
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const complete = resolveMatchAction(winning, { seat: 0, type: "win" });

    expect(complete.phase).toBe("complete");
    expect(complete.winnerSeat).toBe(0);
  });

  it("resolves a claim window into a player meld and turn control", () => {
    const match = createMatchState("claim-resolve");
    const claimState = {
      ...match,
      turnSeat: 0 as const,
      claimWindow: {
        discard: { seat: 3 as const, tile: "p5" },
        offers: [{ seat: 0 as const, action: "pong" as const, tile: "p5" }],
      },
      players: [
        { ...match.players[0], hand: ["p5", "p5", "m1", "m2", "m3"] },
        match.players[1],
        match.players[2],
        { ...match.players[3], discards: ["p5"] },
      ] as typeof match.players,
    };

    const claimed = resolveMatchAction(claimState, { seat: 0, type: "pong" });

    expect(claimed.claimWindow).toBeNull();
    expect(claimed.turnSeat).toBe(0);
    expect(claimed.players[0].melds).toContain("pung p5");
    expect(claimed.players[0].hand).not.toContain("p5");
  });

  it("resolves a displayed chi claim using its offered sequence", () => {
    const match = createMatchState("chi-resolve");
    const claimState = {
      ...match,
      claimWindow: {
        discard: { seat: 3 as const, tile: "p4" },
        offers: [{ seat: 0 as const, action: "chi" as const, tile: "p4", tiles: ["p2", "p3", "p4"] as [string, string, string] }],
      },
      players: [
        { ...match.players[0], hand: ["m4", "m6", "m6", "m6", "p1", "p2", "p3", "p5", "s3", "s4", "s6", "we", "ww"] },
        match.players[1],
        match.players[2],
        { ...match.players[3], discards: ["p4"] },
      ] as typeof match.players,
    };

    const claimed = resolveMatchAction(claimState, { seat: 0, type: "chi" });

    expect(claimed.claimWindow).toBeNull();
    expect(claimed.players[0].melds).toContain("chow p2 p3 p4");
    expect(claimed.turnSeat).toBe(0);
  });

  it("resolves one bot turn at a time after the active bot has drawn", () => {
    const match = createMatchState("bot-turn");
    const afterDiscard = resolveMatchAction(match, { seat: 0, type: "discard", tile: match.players[0].hand[0] });
    const afterBot = resolveNextBotTurn(afterDiscard);

    expect(afterBot.players[1].discards.length).toBeGreaterThan(match.players[1].discards.length);
    expect(afterBot.turnSeat).toBe(2);
    expect(afterBot.players[2].hand).toHaveLength(14);
  });

  it("resolves bot-only claim windows instead of leaving the table stuck", () => {
    const match = createMatchState("bot-only-claim");
    const frozen = {
      ...match,
      turnSeat: 0 as const,
      claimWindow: {
        discard: { seat: 0 as const, tile: "m4" },
        offers: [{ seat: 1 as const, action: "pong" as const, tile: "m4", tiles: ["m4", "m4", "m4"] as [string, string, string] }],
      },
      players: [
        { ...match.players[0], discards: ["m4"] },
        { ...match.players[1], hand: ["m4", "m4", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dg", "dw"] },
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const next = resolveNextBotTurn(frozen);

    expect(next.claimWindow).toBeNull();
    expect(next.turnSeat).toBe(1);
    expect(next.players[1].melds).toContain("pung m4");
    expect(next.eventLog.at(-1)).toContain("Bo Bot claimed PONG");
  });

  it("continues play when the local player passes a claim window", () => {
    const match = createMatchState("pass-local-claim");
    const claimState = {
      ...match,
      claimWindow: {
        discard: { seat: 3 as const, tile: "p5" },
        offers: [{ seat: 0 as const, action: "pong" as const, tile: "p5", tiles: ["p5", "p5", "p5"] as [string, string, string] }],
      },
      players: [
        { ...match.players[0], hand: ["p5", "p5", "m1", "m2", "m3", "s1", "s2", "s3", "dr", "dg", "dw", "we", "ws"] },
        match.players[1],
        match.players[2],
        { ...match.players[3], discards: ["p5"] },
      ] as typeof match.players,
    };

    const next = resolveMatchAction(claimState, { seat: 0, type: "pass" });

    expect(next.claimWindow).toBeNull();
    expect(next.turnSeat).toBe(0);
    expect(next.players[0].hand).toHaveLength(14);
    expect(next.eventLog.at(-1)).toContain("Lina drew from the wall");
  });

  it("lets the highest priority bot claim after the local player passes", () => {
    const match = createMatchState("pass-to-bot-claim");
    const claimState = {
      ...match,
      claimWindow: {
        discard: { seat: 3 as const, tile: "p5" },
        offers: [
          { seat: 0 as const, action: "pong" as const, tile: "p5", tiles: ["p5", "p5", "p5"] as [string, string, string] },
          { seat: 1 as const, action: "kong" as const, tile: "p5", tiles: ["p5", "p5", "p5", "p5"] as [string, string, string, string] },
        ],
      },
      players: [
        { ...match.players[0], hand: ["p5", "p5", "m1", "m2", "m3"] },
        { ...match.players[1], hand: ["p5", "p5", "p5", "m1", "m2", "m3", "s1", "s2", "s3", "dr", "dg", "dw", "we"] },
        match.players[2],
        { ...match.players[3], discards: ["p5"] },
      ] as typeof match.players,
    };

    const next = resolveMatchAction(claimState, { seat: 0, type: "pass" });

    expect(next.claimWindow).toBeNull();
    expect(next.turnSeat).toBe(1);
    expect(next.players[1].melds).toContain("kong p5");
    expect(next.eventLog.at(-1)).toContain("Bo Bot claimed KONG");
  });

  it("lets a bot declare self-draw before discarding", () => {
    const match = createMatchState("bot-self-draw");
    const winning = {
      ...match,
      turnSeat: 1 as const,
      players: [
        match.players[0],
        { ...match.players[1], hand: ["m1", "m1", "m2", "m2", "m3", "m3", "p4", "p4", "p5", "p5", "s6", "s6", "dr", "dr"] },
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const complete = resolveNextBotTurn(winning);

    expect(complete.phase).toBe("complete");
    expect(complete.winnerSeat).toBe(1);
    expect(complete.eventLog.at(-1)).toContain("Bo Bot declared self-draw Win");
  });

  it("lets the local player declare a concealed kong and draw a supplement tile", () => {
    const match = createMatchState("local-kong");
    const kongReady = {
      ...match,
      turnSeat: 0 as const,
      players: [
        { ...match.players[0], hand: ["m8", "m8", "m8", "m8", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr"] },
        match.players[1],
        match.players[2],
        match.players[3],
      ] as typeof match.players,
    };

    const next = resolveMatchAction(kongReady, { seat: 0, type: "kong" });

    expect(next.players[0].melds).toContain("kong m8");
    expect(next.players[0].hand.filter((tile) => tile === "m8")).toHaveLength(0);
    expect(next.players[0].hand).toHaveLength(11);
    expect(next.turnSeat).toBe(0);
    expect(next.eventLog.at(-1)).toContain("Lina declared concealed KONG on M8");
  });
});
