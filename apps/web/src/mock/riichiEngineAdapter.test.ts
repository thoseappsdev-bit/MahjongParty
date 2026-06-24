import { riichi } from "@mahjong/game-core";
import { describe, expect, it } from "vitest";
import { chooseRiichiBotDiscard, riichiStateToResult, riichiStateToView } from "./riichiEngineAdapter";

describe("riichi engine adapter", () => {
  it("maps Riichi state to the shared match view", () => {
    const state = riichi.createRiichiMatchState("web-riichi");
    const view = riichiStateToView(state);

    expect(view.mode).toBe("riichi");
    expect(view.wallCount).toBe(state.liveWall.length);
    expect(view.myHand).toHaveLength(14);
    expect(view.legalActions).toContain("discard");
  });

  it("chooses a deterministic bot discard", () => {
    const state = riichi.createRiichiMatchState("bot-riichi");
    state.turnSeat = 1;
    state.players[1].hand = ["m1", "p2", "we"];

    expect(chooseRiichiBotDiscard(state)).toBe("we");
  });

  it("returns a neutral wall-draw result when no win is recorded", () => {
    const state = riichi.createRiichiMatchState("draw-riichi");
    state.phase = "complete";

    expect(riichiStateToResult(state)).toMatchObject({ winnerName: "Wall Draw", deltas: [0, 0, 0, 0] });
  });
});
