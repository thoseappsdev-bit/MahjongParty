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


  it("opens and resolves a local Ron claim with payer metadata", () => {
    const state = createRiichiMatchState("riichi-ron-claim");
    state.turnSeat = 3;
    state.doraIndicators = [];
    state.uraDoraIndicators = [];
    state.players[0].hand = ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2"];
    state.players[3].hand = ["p2", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dg", "dg"];

    const claimWindow = resolveRiichiAction(state, { seat: 3, type: "discard", tile: "p2" });
    const completed = resolveRiichiAction(claimWindow, { seat: 0, type: "win" });
    const winEvent = completed.auditLog.at(-1);

    expect(claimWindow.claimWindow?.offers).toContainEqual({ seat: 0, type: "win", tile: "p2" });
    expect(completed.phase).toBe("complete");
    expect(completed.players[0].hand).toContain("p2");
    expect(completed.players[3].discards).not.toContain("p2");
    expect(winEvent?.action).toMatchObject({ type: "win", actorSeat: 0, payload: { tile: "p2", winBy: "ron", payerSeat: 3 } });
  });

  it("marks temporary furiten when the local player passes Ron", () => {
    const state = createRiichiMatchState("riichi-ron-pass");
    state.turnSeat = 1;
    state.doraIndicators = [];
    state.uraDoraIndicators = [];
    state.players[0].hand = ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2"];
    state.players[1].hand = ["p2", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dg", "dg"];
    state.liveWall = ["m9"];

    const claimWindow = resolveRiichiAction(state, { seat: 1, type: "discard", tile: "p2" });
    const passed = resolveRiichiAction(claimWindow, { seat: 0, type: "pass" });

    expect(passed.players[0].furiten).toBe("temporary");
    expect(passed.players[2].hand.at(-1)).toBe("m9");
  });
  it("opens a local Chi window before drawing when the previous seat discards P4", () => {
    const state = createRiichiMatchState("riichi-p4-claim");
    state.turnSeat = 3;
    state.players[0].hand = ["m1", "m2", "m3", "p5", "p6", "s1", "s2", "s3", "s4", "s5", "s6", "we", "we"];
    state.players[3].hand = ["p4", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dg", "dg"];
    state.liveWall = ["m9"];

    const next = resolveRiichiAction(state, { seat: 3, type: "discard", tile: "p4" });

    expect(next.claimWindow?.discard).toEqual({ seat: 3, tile: "p4" });
    expect(next.claimWindow?.offers).toContainEqual({ seat: 0, type: "chi", tile: "p4", tiles: ["p4", "p5", "p6"] });
    expect(next.players[0].hand).not.toContain("m9");
    expect(next.turnSeat).toBe(3);
  });

  it("lets the local player Chi a Riichi discard and then discard next", () => {
    const state = createRiichiMatchState("riichi-p4-claim-resolve");
    state.turnSeat = 3;
    state.players[0].hand = ["m1", "m2", "m3", "p5", "p6", "s1", "s2", "s3", "s4", "s5", "s6", "we", "we"];
    state.players[3].hand = ["p4", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dg", "dg"];

    const claimWindow = resolveRiichiAction(state, { seat: 3, type: "discard", tile: "p4" });
    const claimed = resolveRiichiAction(claimWindow, { seat: 0, type: "chi", tile: "p4" });

    expect(claimed.claimWindow).toBeNull();
    expect(claimed.turnSeat).toBe(0);
    expect(claimed.players[0].melds).toContainEqual({ kind: "chow", tiles: ["p4", "p5", "p6"], open: true, calledTile: "p4", fromSeat: 3 });
    expect(claimed.players[0].hand).not.toContain("p5");
    expect(claimed.players[0].hand).not.toContain("p6");
    expect(claimed.players[3].discards).not.toContain("p4");
  });

  it("continues to the next draw when the local player passes a Riichi claim", () => {
    const state = createRiichiMatchState("riichi-p4-pass");
    state.turnSeat = 3;
    state.players[0].hand = ["m1", "m2", "m3", "p5", "p6", "s1", "s2", "s3", "s4", "s5", "s6", "we", "we"];
    state.players[3].hand = ["p4", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dg", "dg"];
    state.liveWall = ["m9"];

    const claimWindow = resolveRiichiAction(state, { seat: 3, type: "discard", tile: "p4" });
    const passed = resolveRiichiAction(claimWindow, { seat: 0, type: "pass" });

    expect(passed.claimWindow).toBeNull();
    expect(passed.turnSeat).toBe(0);
    expect(passed.players[0].hand.at(-1)).toBe("m9");
    expect(passed.players[3].discards).toContain("p4");
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

