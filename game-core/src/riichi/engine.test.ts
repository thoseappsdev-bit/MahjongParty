import { describe, expect, it } from "vitest";
import { createRiichiMatchState, decisionsFromRiichiAuditLog, replayRiichiMatch, resolveRiichiAction } from "./index";

describe("authoritative Riichi hand engine", () => {
  it("deals deterministic Riichi hands with a dead wall and dora indicator", () => {
    const left = createRiichiMatchState("riichi-seed");
    const right = createRiichiMatchState("riichi-seed");

    expect(left.players.map((player) => player.hand)).toEqual(right.players.map((player) => player.hand));
    expect(left.players.map((player) => player.hand.length)).toEqual([14, 13, 13, 13]);
    expect(left.deadWall).toHaveLength(14);
    expect(left.doraIndicators).toHaveLength(1);
    expect(left.liveWall).toHaveLength(69);
  });

  it("can deal a new hand from any dealer seat", () => {
    const state = createRiichiMatchState("dealer-seat-seed", { dealerSeat: 2 });

    expect(state.context.dealerSeat).toBe(2);
    expect(state.turnSeat).toBe(2);
    expect(state.players.map((player) => player.hand.length)).toEqual([13, 13, 14, 13]);
    expect(state.liveWall).toHaveLength(69);
  });

  it("moves a discarded tile, draws for the next seat, and records replayable audit events", () => {
    const state = createRiichiMatchState("discard-seed");
    const tile = state.players[0].hand[0];
    const nextDraw = state.liveWall[0];
    const next = resolveRiichiAction(state, { seat: 0, type: "discard", tile });

    expect(next.players[0].hand.filter((code) => code === tile)).toHaveLength(state.players[0].hand.filter((code) => code === tile).length - 1);
    expect(next.players[0].discards).toEqual([tile]);
    expect(next.players[1].hand.at(-1)).toBe(nextDraw);
    expect(next.turnSeat).toBe(1);
    expect(next.auditLog.map((event) => event.action.type)).toEqual(["discard", "draw"]);
  });

  it("replays player decisions into the same visible hand state", () => {
    let state = createRiichiMatchState("replay-riichi");
    state = resolveRiichiAction(state, { seat: 0, type: "discard", tile: state.players[0].hand[0] });
    state = resolveRiichiAction(state, { seat: 1, type: "discard", tile: state.players[1].hand.at(-1) });

    const replayed = replayRiichiMatch("replay-riichi", decisionsFromRiichiAuditLog(state.auditLog));

    expect(replayed.players.map((player) => ({ hand: player.hand, discards: player.discards, points: player.points }))).toEqual(
      state.players.map((player) => ({ hand: player.hand, discards: player.discards, points: player.points })),
    );
    expect(replayed.turnSeat).toBe(state.turnSeat);
    expect(replayed.liveWall).toEqual(state.liveWall);
  });

  it("ends the hand instead of freezing when the wall is empty after a discard", () => {
    const state = createRiichiMatchState("empty-wall");
    state.liveWall = [];
    const next = resolveRiichiAction(state, { seat: 0, type: "discard", tile: state.players[0].hand[0] });

    expect(next.phase).toBe("complete");
    expect(next.eventLog.at(-1)).toBe("The wall is exhausted.");
    expect(next.auditLog.at(-1)?.action.type).toBe("exhaustive-draw");
  });
});

