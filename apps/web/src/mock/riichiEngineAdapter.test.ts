import { riichi } from "@mahjong/game-core";
import { describe, expect, it } from "vitest";
import {
  chooseRiichiBotDiscard,
  createRiichiTutorialState,
  resolveRiichiTutorialAction,
  riichiHanchanToResult,
  riichiStateToResult,
  riichiStateToView,
  sortRiichiHandForView,
} from "./riichiEngineAdapter";

describe("riichi engine adapter", () => {
  it("maps Riichi state to the shared match view", () => {
    const state = riichi.createRiichiMatchState("web-riichi");
    const view = riichiStateToView(state);

    expect(view.mode).toBe("riichi");
    expect(view.wallCount).toBe(state.liveWall.length);
    expect(view.myHand).toHaveLength(14);
    expect(view.legalActions).toContain("discard");
  });

  it("sorts Riichi hands for display without mutating engine order", () => {
    const hand: riichi.RiichiTile[] = ["s9", "m2", "dr", "p1", "m1", "we", "s1", "p9"];

    expect(sortRiichiHandForView(hand)).toEqual(["m1", "m2", "p1", "p9", "s1", "s9", "we", "dr"]);
    expect(hand).toEqual(["s9", "m2", "dr", "p1", "m1", "we", "s1", "p9"]);
  });

  it("shows the local Riichi hand sorted in the shared view", () => {
    const state = riichi.createRiichiMatchState("web-riichi-sorted-view");
    state.players[0].hand = ["s9", "m2", "dr", "p1", "m1", "we", "s1", "p9"];

    expect(riichiStateToView(state).myHand).toEqual(["m1", "m2", "p1", "p9", "s1", "s9", "we", "dr"]);
  });

  it("does not offer Win for an invalid Riichi shape even when yaku-like tiles are present", () => {
    const state = riichi.createRiichiMatchState("web-riichi-no-false-win");
    state.players[0].hand = ["m2", "m3", "m5", "m6", "p2", "p4", "p5", "p7", "s2", "s3", "s5", "s6", "s8", "s9"];
    state.doraIndicators = [];
    state.uraDoraIndicators = [];

    expect(riichiStateToView(state).legalActions).toEqual(["discard"]);
  });

  it("offers Win for a legal Riichi self-draw shape with yaku", () => {
    const state = riichi.createRiichiMatchState("web-riichi-legal-win");
    state.players[0].hand = ["m2", "m3", "m4", "m3", "m4", "m5", "p2", "p3", "p4", "p6", "p7", "p8", "s5", "s5"];
    state.doraIndicators = [];
    state.uraDoraIndicators = [];

    expect(riichiStateToView(state).legalActions).toContain("win");
  });

  it("keeps the Riichi tutorial on the local player after the guided discard", () => {
    const state = createRiichiTutorialState("web-riichi-tutorial");
    const openingView = riichiStateToView(state);

    expect(openingView.legalActions).toEqual(["discard"]);
    expect(openingView.claimPrompt).toContain("discard S9");

    const afterDiscard = resolveRiichiTutorialAction(state, { type: "discard", tile: "s9" });
    const view = riichiStateToView(afterDiscard);

    expect(view.turnSeat).toBe(0);
    expect(view.legalActions).toEqual(["win", "discard"]);
    expect(view.recentEvent).toContain("Closed Tsumo");
    expect(view.claimPrompt).toContain("press Tsumo / Win");
  });

  it("uses S9 as the guided discard when the action button has no tile", () => {
    const afterDiscard = resolveRiichiTutorialAction(createRiichiTutorialState("web-riichi-tutorial-button"), { type: "discard" });

    expect(afterDiscard.players[0].discards).toContain("s9");
    expect(afterDiscard.players[0].hand).not.toContain("s9");
  });

  it("explains the Riichi tutorial win result after Tsumo", () => {
    const afterDiscard = resolveRiichiTutorialAction(createRiichiTutorialState("web-riichi-tutorial-result"), { type: "discard" });
    const completed = resolveRiichiTutorialAction(afterDiscard, { type: "win" });
    const result = riichiStateToResult(completed);

    expect(completed.phase).toBe("complete");
    expect(result.winnerName).toBe("Lina");
    expect(result.policyCopy).toContain("Tanyao is a yaku");
    expect(result.fanLines.map((line) => line.id)).toContain("tanyao");
    expect(result.fanLines.map((line) => line.id)).toContain("menzen-tsumo");
  });

  it("chooses a deterministic bot discard", () => {
    const state = riichi.createRiichiMatchState("bot-riichi");
    state.turnSeat = 1;
    state.players[1].hand = ["m1", "p2", "we"];

    expect(chooseRiichiBotDiscard(state)).toBe("we");
  });

  it("maps a completed Riichi win to real settlement deltas", () => {
    const state = riichi.createRiichiMatchState("web-riichi-result");
    state.players[0].hand = ["m2", "m3", "m4", "m3", "m4", "m5", "p2", "p3", "p4", "p6", "p7", "p8", "s5", "s5"];
    state.doraIndicators = [];
    state.uraDoraIndicators = [];

    const completed = riichi.resolveRiichiAction(state, { seat: 0, type: "win", tile: "s5" });
    const result = riichiStateToResult(completed);

    expect(result.winnerName).toBe("Lina");
    expect(result.deltas[0]).toBeGreaterThan(0);
    expect(result.policyCopy).not.toContain("prototype");
  });

  it("maps a completed hanchan to final standings copy", () => {
    const state = riichi.createRiichiMatchState("web-hanchan-result");
    state.phase = "complete";
    state.players[0].points = 42000;
    state.players[1].points = 31000;
    state.players[2].points = 27000;
    state.players[3].points = 20000;

    const result = riichiHanchanToResult(state);

    expect(result.winnerName).toBe("Lina");
    expect(result.fanLines).toContainEqual({ id: "riichi-hanchan", nameKey: "riichi.hanchanComplete", fan: 27 });
  });

  it("returns a neutral wall-draw result when no win is recorded", () => {
    const state = riichi.createRiichiMatchState("draw-riichi");
    state.phase = "complete";

    expect(riichiStateToResult(state)).toMatchObject({ winnerName: "Wall Draw", deltas: [0, 0, 0, 0] });
  });
});