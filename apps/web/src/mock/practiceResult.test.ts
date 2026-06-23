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

  it("keeps exhaustive wall draws neutral when the least-tile count is tied", () => {
    const state = createPracticeMatch("draw-result");
    const result = resultFromPractice({ ...state, phase: "complete", winnerSeat: null });

    expect(result.winnerName).toBe("Wall Draw");
    expect(result.totalFan).toBe(0);
    expect(result.deltas).toEqual([0, 0, 0, 0]);
  });

  it("awards exhausted practice hands to the unique least-tile leader", () => {
    const state = createPracticeMatch("progress-result");
    const players = state.players.map((player, index) =>
      index === 1 ? { ...player, hand: player.hand.slice(0, 7) } : player,
    ) as typeof state.players;
    const result = resultFromPractice({ ...state, players, phase: "complete", winnerSeat: null });

    expect(result.winnerName).toBe("Bo Bot");
    expect(result.fanLines).toContainEqual({ id: "progress-tiebreak", nameKey: "fan.progressTiebreak", fan: 0 });
    expect(result.deltas).toEqual([-1000, 3000, -1000, -1000]);
  });
});
