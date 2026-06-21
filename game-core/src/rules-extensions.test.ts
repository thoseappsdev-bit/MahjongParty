import { describe, expect, it } from "vitest";
import {
  claimPriorityOrder,
  createMatchState,
  decisionsFromAuditLog,
  replayMatch,
  resolveMatchAction,
  type MatchState,
} from "./match-engine";
import {
  fanMultiplier,
  isLimitHand,
  meetsFanGate,
  minFanForMode,
  settleOldHongKong,
  type OldHongKongScoreResult,
} from "./scoring";

const isBonus = (tile: string): boolean => tile.startsWith("f") || tile.startsWith("t");

/** Generic autoplay: resolves any current decision point so a match runs to the end. */
function playOut(initial: MatchState, maxSteps = 4000): MatchState {
  let state = initial;
  let steps = 0;
  while (state.phase !== "complete" && steps < maxSteps) {
    steps += 1;
    if (state.claimWindow) {
      const [top] = claimPriorityOrder(
        state.claimWindow.offers.map((offer) => ({ seat: offer.seat, action: offer.action })),
      );
      state = top ? resolveMatchAction(state, { seat: top.seat, type: top.action }) : state;
      continue;
    }
    const seat = state.turnSeat;
    const afterWin = resolveMatchAction(state, { seat, type: "win" });
    if (afterWin.phase === "complete") {
      state = afterWin;
      continue;
    }
    state = resolveMatchAction(state, { seat, type: "discard", tile: state.players[seat].hand[0] });
  }
  return state;
}

describe("settlement ladder (feature: real ladder, not flat base delta)", () => {
  it("doubles from the 3-fan pivot and caps", () => {
    expect(fanMultiplier(1)).toBe(1);
    expect(fanMultiplier(3)).toBe(1);
    expect(fanMultiplier(4)).toBe(2);
    expect(fanMultiplier(5)).toBe(4);
    expect(fanMultiplier(6)).toBe(8);
    expect(fanMultiplier(7)).toBe(16);
    expect(fanMultiplier(9, 16)).toBe(16); // capped for Bamboo/Jade
    expect(fanMultiplier(9, 32)).toBe(32); // higher cap for Dragon/Phoenix
  });

  it("self-draw collects from all three opponents and sums to zero", () => {
    const { deltas, handValue } = settleOldHongKong({ totalFan: 4, winnerSeat: 2, context: "self-draw" });
    expect(handValue).toBe(2000); // baseUnit 1000 * 2x
    expect(deltas[2]).toBe(6000);
    expect(deltas.filter((_, seat) => seat !== 2)).toEqual([-2000, -2000, -2000]);
    expect(deltas.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("a discard win collects from the discarder only", () => {
    const { deltas } = settleOldHongKong({ totalFan: 3, winnerSeat: 1, context: "discard", payerSeat: 3 });
    expect(deltas).toEqual([0, 1000, 0, -1000]);
    expect(deltas.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("a robbed kong is paid by the konged seat", () => {
    const { deltas } = settleOldHongKong({ totalFan: 6, winnerSeat: 0, context: "rob-kong", payerSeat: 2 });
    expect(deltas[0]).toBe(8000); // 1000 * 8x
    expect(deltas[2]).toBe(-8000);
    expect(deltas.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("respects a custom base unit for the tier", () => {
    const { handValue } = settleOldHongKong({ totalFan: 4, winnerSeat: 0, context: "self-draw", settings: { baseUnit: 100, fanCap: 16 } });
    expect(handValue).toBe(200);
  });
});

describe("fan gate (feature: 1-fan / 3-fan enforcement)", () => {
  const make = (totalFan: number, id = "all-chows"): OldHongKongScoreResult => ({
    isWin: true,
    pattern: "standard",
    totalFan,
    fanLines: [{ id, nameKey: "fan.x", fan: totalFan }],
  });

  it("knows the minimum per mode", () => {
    expect(minFanForMode("1-fan")).toBe(1);
    expect(minFanForMode("3-fan")).toBe(3);
  });

  it("rejects a 2-fan win in 3-fan mode but accepts it in 1-fan mode", () => {
    expect(meetsFanGate(make(2), "3-fan")).toBe(false);
    expect(meetsFanGate(make(2), "1-fan")).toBe(true);
  });

  it("always passes limit hands regardless of mode", () => {
    const limit = make(16, "thirteen-orphans");
    expect(isLimitHand(limit)).toBe(true);
    expect(meetsFanGate(limit, "3-fan")).toBe(true);
  });

  it("a non-win never passes the gate", () => {
    expect(meetsFanGate({ isWin: false, pattern: null, totalFan: 9, fanLines: [] }, "1-fan")).toBe(false);
  });
});

describe("fan gate enforced in the actual win action", () => {
  const craft = (mode: "1-fan" | "3-fan"): MatchState => {
    const base = createMatchState("gate-seed", { mode });
    return {
      ...base,
      turnSeat: 0,
      players: [
        // 1 exposed chow + a 2-fan self-draw hand (self-draw + no-bonus, nothing else).
        { ...base.players[0], melds: ["chow m1 m2 m3"], hand: ["p1", "p2", "p3", "s4", "s5", "s6", "m5", "m5", "m5", "ww", "ww"] },
        base.players[1],
        base.players[2],
        base.players[3],
      ] as MatchState["players"],
    };
  };

  it("rejects a sub-minimum win under 3-fan rules", () => {
    const result = resolveMatchAction(craft("3-fan"), { seat: 0, type: "win" });
    expect(result.phase).toBe("playing");
    expect(result.winnerSeat).toBeNull();
    expect(result.eventLog.at(-1)).toContain("3-fan minimum");
  });

  it("accepts the same hand under 1-fan rules", () => {
    const result = resolveMatchAction(craft("1-fan"), { seat: 0, type: "win" });
    expect(result.phase).toBe("complete");
    expect(result.winnerSeat).toBe(0);
    expect(result.winContext).toBe("self-draw");
  });
});

describe("flowers and seasons (feature: replacement draw behavior)", () => {
  it("seeds 8 distinct bonus tiles into the wall and keeps them out of hands", () => {
    const state = createMatchState("flowers-seed");
    const total =
      state.wall.length +
      state.deadWall.length +
      state.players.reduce((sum, player) => sum + player.hand.length + player.flowers.length, 0);
    expect(total).toBe(144); // 136 base + 8 bonus, fully conserved at deal time

    const bonusEverywhere = [
      ...state.wall,
      ...state.deadWall,
      ...state.players.flatMap((player) => player.flowers),
    ].filter(isBonus);
    expect(bonusEverywhere.length).toBe(8);
    expect(new Set(bonusEverywhere).size).toBe(8);

    expect(state.players.every((player) => player.hand.every((tile) => !isBonus(tile)))).toBe(true);
  });

  it("never leaves a bonus tile in a hand during live play (replacements drawn)", () => {
    const final = playOut(createMatchState("flowers-play", { mode: "1-fan" }));
    expect(final.players.every((player) => player.hand.every((tile) => !isBonus(tile)))).toBe(true);
    expect(final.players.every((player) => player.flowers.every(isBonus))).toBe(true);
  });
});

describe("added kong + rob-the-kong real interrupt (features 1 & 3)", () => {
  const setup = (): MatchState => {
    const base = createMatchState("rob-seed");
    return {
      ...base,
      turnSeat: 0,
      players: [
        // Seat 0 has an exposed pung of s5 and the 4th s5 in hand -> can add the kong.
        { ...base.players[0], melds: ["pung s5"], hand: ["s5", "m1", "m2", "m3", "p1", "p2", "p3", "we", "we", "dr", "dr"] },
        // Seat 1 is waiting on s5 to complete a full hand.
        { ...base.players[1], melds: [], hand: ["s3", "s4", "m1", "m1", "m1", "p2", "p3", "p4", "we", "we", "we", "dr", "dr"] },
        base.players[2],
        base.players[3],
      ] as MatchState["players"],
    };
  };

  it("opens a rob-kong window instead of completing the kong immediately", () => {
    const declared = resolveMatchAction(setup(), { seat: 0, type: "kong", tile: "s5" });
    expect(declared.claimWindow?.addedKong).toEqual({ seat: 0, tile: "s5" });
    expect(declared.claimWindow?.offers.some((offer) => offer.seat === 1 && offer.action === "win")).toBe(true);
    expect(declared.players[0].melds).toContain("pung s5"); // not yet promoted
    expect(declared.auditLog.some((event) => event.action.type === "added-kong")).toBe(true);
  });

  it("lets an opponent rob the kong for the win", () => {
    const declared = resolveMatchAction(setup(), { seat: 0, type: "kong", tile: "s5" });
    const robbed = resolveMatchAction(declared, { seat: 1, type: "win" });
    expect(robbed.phase).toBe("complete");
    expect(robbed.winnerSeat).toBe(1);
    expect(robbed.winContext).toBe("rob-kong");
    expect(robbed.payerSeat).toBe(0);
    expect(robbed.players[1].hand).toContain("s5"); // winning tile joins the hand for scoring
    expect(robbed.auditLog.some((event) => event.action.type === "score")).toBe(true);
  });

  it("completes the kong when every opponent passes", () => {
    const declared = resolveMatchAction(setup(), { seat: 0, type: "kong", tile: "s5" });
    const passed = resolveMatchAction(declared, { seat: 1, type: "pass" });
    expect(passed.claimWindow).toBeNull();
    expect(passed.players[0].melds).toContain("kong s5");
    expect(passed.players[0].melds).not.toContain("pung s5");
    expect(passed.turnSeat).toBe(0); // konger keeps the turn and must discard
  });
});

describe("audit log + deterministic replay (feature 4)", () => {
  it("records every draw/discard/claim/score with a monotonic sequence", () => {
    const final = playOut(createMatchState("audit-seed", { mode: "1-fan" }));
    final.auditLog.forEach((event, index) => expect(event.sequence).toBe(index + 1));
    const types = new Set(final.auditLog.map((event) => event.action.type));
    expect(types.has("draw")).toBe(true);
    expect(types.has("discard")).toBe(true);
    if (final.winnerSeat !== null) {
      expect(types.has("score")).toBe(true);
    }
  });

  it("replays the recorded decisions to an identical final state", () => {
    const final = playOut(createMatchState("replay-seed", { mode: "1-fan" }));
    const decisions = decisionsFromAuditLog(final.auditLog);
    const replayed = replayMatch("replay-seed", decisions, { mode: "1-fan" });

    expect(replayed.phase).toBe(final.phase);
    expect(replayed.winnerSeat).toBe(final.winnerSeat);
    expect(replayed.winContext).toBe(final.winContext);
    expect(replayed.players.map((player) => player.hand)).toEqual(final.players.map((player) => player.hand));
    expect(replayed.players.map((player) => player.melds)).toEqual(final.players.map((player) => player.melds));
  });
});
