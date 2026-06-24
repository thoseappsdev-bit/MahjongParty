import { createPracticeMatch } from "@mahjong/game-core";
import { describe, expect, it } from "vitest";
import { resultFromPractice } from "./practiceResult";

describe("practice result adapter", () => {
  it("uses the winning bot instead of the static Lina result", () => {
    const state = createPracticeMatch("bot-win-result");
    const result = resultFromPractice({ ...state, phase: "complete", winnerSeat: 2 });

    expect(result.winnerSeat).toBe(2);
    expect(result.winnerName).toBe("Chen Bot");
    expect(result.deltas).toEqual([-1000, -1000, 3000, -1000]);
  });

  it("settles default practice exhaustion by hand progress", () => {
    const state = createPracticeMatch("draw-result");
    const result = resultFromPractice({ ...state, phase: "complete", winnerSeat: null });

    expect(result.winnerName).toBe("Lina");
    expect(result.totalFan).toBe(0);
    expect(result.fanLines).toContainEqual({ id: "progress-tiebreak", nameKey: "fan.progressTiebreak", fan: 0 });
    expect(result.deltas).toEqual([3000, -1000, -1000, -1000]);
  });

  it("awards exhausted practice hands to the unique lowest-shanten leader", () => {
    const state = createPracticeMatch("progress-result");
    const players = state.players.map((player, index) =>
      index === 1
        ? { ...player, hand: ["m1", "p3", "s5", "we", "dr", "dg"], melds: [] }
        : index === 2
          ? {
              ...player,
              hand: ["p2", "p3", "p4", "s5", "s6", "s7", "we", "we", "dr", "dr"],
              melds: ["CHOW m1 m2 m3"],
            }
          : { ...player, hand: ["m1", "p1", "s1", "we", "dr"], melds: [] },
    ) as typeof state.players;
    const result = resultFromPractice({ ...state, players, phase: "complete", winnerSeat: null });

    expect(result.winnerName).toBe("Chen Bot");
    expect(result.fanLines).toContainEqual({ id: "progress-tiebreak", nameKey: "fan.progressTiebreak", fan: 0 });
    expect(result.deltas).toEqual([-1000, -1000, 3000, -1000]);
  });

  it("keeps exhausted practice hands neutral when lowest shanten is tied", () => {
    const state = createPracticeMatch("progress-tie-result");
    const players = state.players.map((player, index) =>
      index === 0
        ? {
            ...player,
            hand: ["m1", "m2", "m3", "m4", "m5", "m6", "p2", "p3", "p4", "s7", "s8", "we", "we"],
            melds: [],
          }
        : index === 2
          ? {
              ...player,
              hand: ["p2", "p3", "p4", "s5", "s6", "s7", "we", "we", "dr", "dr"],
              melds: ["CHOW m1 m2 m3"],
            }
          : { ...player, hand: ["m1", "p1", "s1", "we", "dr"], melds: [] },
    ) as typeof state.players;
    const result = resultFromPractice({ ...state, players, phase: "complete", winnerSeat: null });

    expect(result.winnerName).toBe("Wall Draw");
    expect(result.deltas).toEqual([0, 0, 0, 0]);
  });
});


