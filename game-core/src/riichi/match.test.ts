import { describe, expect, it } from "vitest";
import {
  advanceCompletedRiichiHand,
  advanceRiichiRound,
  createRiichiMatchState,
  finalizeHanchan,
  resolveRiichiAction,
  riichiHandResultFromState,
  scoreRiichiHand,
  settleRiichiWin,
  settleTenpaiNoten,
  type RiichiHandResult,
  type RiichiMatchState,
} from "./index";

type TestStateOverrides = Omit<Partial<RiichiMatchState>, "context" | "players"> & {
  context?: Partial<RiichiMatchState["context"]>;
  players?: Array<Partial<RiichiMatchState["players"][number]>>;
};

function state(overrides: TestStateOverrides = {}): RiichiMatchState {
  const { players: playerOverrides, context: contextOverrides, ...stateOverrides } = overrides;
  return {
    mode: "riichi",
    phase: "playing",
    seed: "match-seed",
    context: {
      roundWind: "we",
      handNumber: 1,
      dealerSeat: 0,
      honba: 0,
      riichiSticks: 0,
      ...(contextOverrides ?? {}),
    },
    turnSeat: 0,
    liveWall: [],
    deadWall: [],
    doraIndicators: [],
    uraDoraIndicators: [],
    kanDoraIndicators: [],
    players: [0, 1, 2, 3].map((seat) => ({
      seat: seat as 0 | 1 | 2 | 3,
      name: `Seat ${seat}`,
      avatar: String(seat),
      hand: [],
      discards: [],
      melds: [],
      points: 30000,
      riichi: false,
      doubleRiichi: false,
      ippatsu: false,
      furiten: "none",
      isBot: seat !== 0,
      ...(playerOverrides?.[seat] ?? {}),
    })) as RiichiMatchState["players"],
    claimWindow: null,
    result: null,
    eventLog: [],
    auditLog: [],
    ...stateOverrides,
  };
}

function winResult(overrides: Partial<Extract<RiichiHandResult, { kind: "win" }>> = {}): RiichiHandResult {
  return {
    kind: "win",
    winnerSeat: 1,
    winBy: "ron",
    payerSeat: 2,
    deltas: [0, 3900, -3900, 0],
    riichiDeposits: [],
    ...overrides,
  };
}

describe("WRC Riichi match progression", () => {
  it("settles exhaustive tenpai/noten with exactly 3,000 points in every split", () => {
    expect(settleTenpaiNoten([])).toEqual([0, 0, 0, 0]);
    expect(settleTenpaiNoten([0, 1, 2, 3])).toEqual([0, 0, 0, 0]);
    expect(settleTenpaiNoten([1])).toEqual([-1000, 3000, -1000, -1000]);
    expect(settleTenpaiNoten([0, 2])).toEqual([1500, -1500, 1500, -1500]);
    expect(settleTenpaiNoten([0, 1, 3])).toEqual([1000, 1000, -3000, 1000]);
  });

  it("continues dealer on exhaustive draw when dealer is tenpai and keeps hand deltas zero before riichi deposits", () => {
    const next = advanceRiichiRound(
      state({ context: { roundWind: "we", handNumber: 2, dealerSeat: 1, honba: 0, riichiSticks: 0 } }),
      { kind: "exhaustive-draw", tenpaiSeats: [1], riichiDeposits: [0, 3] },
    );

    expect(next.context).toMatchObject({ roundWind: "we", handNumber: 2, dealerSeat: 1, honba: 1, riichiSticks: 2 });
    expect(next.players.map((player) => player.points)).toEqual([28000, 33000, 29000, 28000]);
    expect(next.phase).toBe("playing");
  });

  it("rotates dealer on exhaustive draw when dealer is not tenpai and enters South after East 4", () => {
    const next = advanceRiichiRound(
      state({ context: { roundWind: "we", handNumber: 4, dealerSeat: 3, honba: 2, riichiSticks: 1 } }),
      { kind: "exhaustive-draw", tenpaiSeats: [0, 2], riichiDeposits: [] },
    );

    expect(next.context).toMatchObject({ roundWind: "ws", handNumber: 1, dealerSeat: 0, honba: 3, riichiSticks: 1 });
    expect(next.players.map((player) => player.points)).toEqual([31500, 28500, 31500, 28500]);
  });

  it("rotates after non-dealer win, resets honba, and awards table riichi sticks", () => {
    const next = advanceRiichiRound(
      state({ context: { roundWind: "we", handNumber: 1, dealerSeat: 0, honba: 2, riichiSticks: 2 } }),
      winResult({ winnerSeat: 2, deltas: [0, 6000, 7000, -13000], riichiDeposits: [1] }),
    );

    expect(next.context).toMatchObject({ roundWind: "we", handNumber: 2, dealerSeat: 1, honba: 0, riichiSticks: 1 });
    expect(next.players.map((player) => player.points)).toEqual([30000, 35000, 39000, 17000]);
  });

  it("continues on dealer win and accumulates honba while clearing won riichi sticks", () => {
    const next = advanceRiichiRound(
      state({ context: { roundWind: "ws", handNumber: 3, dealerSeat: 2, honba: 1, riichiSticks: 3 } }),
      winResult({ winnerSeat: 2, deltas: [-4000, -4000, 15000, -4000], riichiDeposits: [] }),
    );

    expect(next.context).toMatchObject({ roundWind: "ws", handNumber: 3, dealerSeat: 2, honba: 2, riichiSticks: 0 });
    expect(next.players.map((player) => player.points)).toEqual([26000, 26000, 45000, 26000]);
  });

  it("finalizes after South 4 non-dealer rotation and prevents bankruptcy early stops", () => {
    const next = advanceRiichiRound(
      state({
        context: { roundWind: "ws", handNumber: 4, dealerSeat: 3, honba: 0, riichiSticks: 0 },
        players: [
          { points: 1000 },
          { points: 42000 },
          { points: 35000 },
          { points: 42000 },
        ],
      }),
      winResult({ winnerSeat: 0, deltas: [12000, -12000, 0, 0], riichiDeposits: [] }),
    );

    expect(next.phase).toBe("complete");
    expect(next.players.map((player) => player.points)).toEqual([13000, 30000, 35000, 42000]);
  });

  it("deals the next hanchan hand with the rotated dealer and preserved points", () => {
    const next = advanceRiichiRound(
      state({ context: { roundWind: "we", handNumber: 1, dealerSeat: 0, honba: 0, riichiSticks: 0 } }),
      winResult({ winnerSeat: 2, deltas: [0, 0, 8000, -8000] }),
    );

    expect(next.phase).toBe("playing");
    expect(next.context).toMatchObject({ roundWind: "we", handNumber: 2, dealerSeat: 1, honba: 0 });
    expect(next.turnSeat).toBe(1);
    expect(next.players.map((player) => player.hand.length)).toEqual([13, 14, 13, 13]);
    expect(next.liveWall).toHaveLength(69);
    expect(next.players.map((player) => player.points)).toEqual([30000, 30000, 38000, 22000]);
  });

  it("derives Riichi hand settlement from a completed engine win", () => {
    const state = createRiichiMatchState("riichi-real-settle");
    state.players[0].hand = ["m2", "m3", "m4", "m3", "m4", "m5", "p2", "p3", "p4", "p6", "p7", "p8", "s5", "s5"];
    state.doraIndicators = [];
    state.uraDoraIndicators = [];

    const completed = resolveRiichiAction(state, { seat: 0, type: "win", tile: "s5" });
    const result = riichiHandResultFromState(completed);
    const score = scoreRiichiHand({
      hand: completed.players[0].hand,
      winningTile: "s5",
      winBy: "tsumo",
      doraIndicators: [],
      uraDoraIndicators: [],
      seatWind: "we",
      roundWind: "we",
    });

    expect(score.legal).toBe(true);
    expect(result).toMatchObject({ kind: "win", winnerSeat: 0 });
    expect(result?.kind === "win" ? result.deltas : null).toEqual(
      settleRiichiWin(score, { winnerSeat: 0, winBy: "tsumo", dealerSeat: 0, honba: 0, riichiSticks: 0 }),
    );
  });

  it("includes kan dora when deriving authoritative Riichi settlement", () => {
    const completed = state({
      phase: "complete",
      context: { dealerSeat: 0, honba: 0, riichiSticks: 0 },
      doraIndicators: [],
      uraDoraIndicators: [],
      kanDoraIndicators: ["p1"],
      players: [
        {
          hand: ["m2", "m3", "m4", "p2", "p3", "p4", "s2", "s3", "s4", "m6", "m7", "m8", "p2", "p2"],
          melds: [],
        },
      ],
      auditLog: [
        {
          sequence: 1,
          occurredAt: 1,
          source: "player",
          action: { type: "win", actorSeat: 0, payload: { tile: "p2", winBy: "tsumo" } },
        },
      ],
    });

    const score = scoreRiichiHand({
      hand: completed.players[0].hand,
      winningTile: "p2",
      winBy: "tsumo",
      doraIndicators: [],
      uraDoraIndicators: [],
      kanDoraIndicators: ["p1"],
      seatWind: "we",
      roundWind: "we",
    });
    const result = riichiHandResultFromState(completed);

    expect(score.yaku.some((line) => line.id === "kan-dora")).toBe(true);
    expect(result?.kind === "win" ? result.deltas : null).toEqual(
      settleRiichiWin(score, { winnerSeat: 0, winBy: "tsumo", dealerSeat: 0, honba: 0, riichiSticks: 0 }),
    );
  });
  it("derives Riichi Ron settlement from a completed claim win", () => {
    const state = createRiichiMatchState("riichi-real-ron-settle");
    state.turnSeat = 3;
    state.doraIndicators = [];
    state.uraDoraIndicators = [];
    state.players[0].hand = ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2"];
    state.players[3].hand = ["p2", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dg", "dg"];

    const claimWindow = resolveRiichiAction(state, { seat: 3, type: "discard", tile: "p2" });
    const completed = resolveRiichiAction(claimWindow, { seat: 0, type: "win" });
    const result = riichiHandResultFromState(completed);
    const score = scoreRiichiHand({
      hand: completed.players[0].hand,
      winningTile: "p2",
      winBy: "ron",
      doraIndicators: [],
      uraDoraIndicators: [],
      seatWind: "we",
      roundWind: "we",
    });

    expect(score.legal).toBe(true);
    expect(result).toMatchObject({ kind: "win", winnerSeat: 0, winBy: "ron", payerSeat: 3 });
    expect(result?.kind === "win" ? result.deltas : null).toEqual(
      settleRiichiWin(score, { winnerSeat: 0, winBy: "ron", payerSeat: 3, dealerSeat: 0, honba: 0, riichiSticks: 0 }),
    );
    expect(result?.kind === "win" ? result.deltas.filter((delta) => delta < 0) : []).toEqual([result?.kind === "win" ? result.deltas[3] : 0]);
  });
  it("advances a completed Riichi hand into the next hand instead of stopping the hanchan early", () => {
    const state = createRiichiMatchState("riichi-advance-complete");
    state.players[0].hand = ["m2", "m3", "m4", "m3", "m4", "m5", "p2", "p3", "p4", "p6", "p7", "p8", "s5", "s5"];
    state.doraIndicators = [];
    state.uraDoraIndicators = [];

    const completed = resolveRiichiAction(state, { seat: 0, type: "win", tile: "s5" });
    const next = advanceCompletedRiichiHand(completed);

    expect(next.phase).toBe("playing");
    expect(next.context).toMatchObject({ roundWind: "we", handNumber: 1, dealerSeat: 0, honba: 1 });
    expect(next.players[0].points).toBeGreaterThan(30000);
    expect(next.players.map((player) => player.hand.length)).toEqual([14, 13, 13, 13]);
  });

  it("finalizes standings with +15/+5/-5/-15 uma and splits ties", () => {
    const standings = finalizeHanchan(
      state({
        phase: "complete",
        players: [
          { points: 45000, name: "A" },
          { points: 45000, name: "B" },
          { points: 30000, name: "C" },
          { points: 0, name: "D" },
        ],
      }),
    );

    expect(standings.map((standing) => ({ seat: standing.seat, rank: standing.rank, points: standing.points, uma: standing.uma, total: standing.total }))).toEqual([
      { seat: 0, rank: 1, points: 45000, uma: 10, total: 25 },
      { seat: 1, rank: 1, points: 45000, uma: 10, total: 25 },
      { seat: 2, rank: 3, points: 30000, uma: -5, total: -5 },
      { seat: 3, rank: 4, points: 0, uma: -15, total: -45 },
    ]);
  });
});







