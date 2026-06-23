import { createMatchState } from "@mahjong/game-core";
import { describe, expect, it } from "vitest";
import { matchStateToResult, matchStateToView } from "./matchEngineAdapter";

describe("match engine adapter", () => {
  it("shows discard and win when the local engine hand is complete", () => {
    const match = createMatchState("adapter-win");
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

    const view = matchStateToView(winning, { mode: "3-fan", tableType: "friendly" });

    expect(view.myHand).toHaveLength(14);
    expect(view.legalActions).toEqual(["discard", "win"]);
  });

  it("maps claim windows to only local legal claim actions", () => {
    const match = createMatchState("adapter-claim");
    const claim = {
      ...match,
      claimWindow: {
        discard: { seat: 3 as const, tile: "p5" },
        offers: [{ seat: 0 as const, action: "pong" as const, tile: "p5" }],
      },
    };

    expect(matchStateToView(claim, { mode: "3-fan", tableType: "friendly" }).legalActions).toEqual(["pong"]);
  });

  it("shows kong when the local player has a concealed kong", () => {
    const match = createMatchState("adapter-kong");
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

    expect(matchStateToView(kongReady, { mode: "3-fan", tableType: "friendly" }).legalActions).toContain("kong");
  });

  it("creates a result from the real match winner", () => {
    const match = createMatchState("adapter-result");
    const complete = {
      ...match,
      phase: "complete" as const,
      winnerSeat: 2 as const,
      players: [
        match.players[0],
        match.players[1],
        {
          ...match.players[2],
          hand: ["m1", "m1", "m2", "m2", "m3", "m3", "p4", "p4", "p5", "p5", "s6", "s6", "dr", "dr"],
        },
        match.players[3],
      ] as typeof match.players,
    };

    expect(matchStateToResult(complete).winnerName).toBe("Chen Bot");
    expect(matchStateToResult(complete).deltas).toEqual([-1000, -1000, 3000, -1000]);
  });

  it("creates a neutral result for a wall draw", () => {
    const match = createMatchState("adapter-wall-draw");
    const complete = {
      ...match,
      phase: "complete" as const,
      winnerSeat: null,
    };

    expect(matchStateToResult(complete)).toMatchObject({
      winnerName: "Wall Draw",
      totalFan: 0,
      deltas: [0, 0, 0, 0],
    });
  });

  it("keeps a coin-table exhaustion neutral even with a unique least-tile leader", () => {
    const match = createMatchState("adapter-coin-draw");
    const complete = {
      ...match,
      phase: "complete" as const,
      winnerSeat: null,
      players: match.players.map((player, index) =>
        index === 1 ? { ...player, hand: player.hand.slice(0, 6) } : player,
      ) as typeof match.players,
    };

    expect(matchStateToResult(complete, "coin")).toMatchObject({
      winnerName: "Wall Draw",
      deltas: [0, 0, 0, 0],
    });
  });
});
