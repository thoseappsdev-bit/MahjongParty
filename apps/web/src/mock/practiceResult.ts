import type { PracticeMatchState } from "@mahjong/game-core";
import type { MatchResult, Seat } from "@mahjong/shared-types";

export function resultFromPractice(state: PracticeMatchState): MatchResult {
  if (state.winnerSeat === null) {
    return {
      winnerSeat: 0,
      winnerName: "Wall Draw",
      totalFan: 0,
      fanLines: [{ id: "wall-draw", nameKey: "fan.wallDraw", fan: 0 }],
      deltas: [0, 0, 0, 0],
      policyCopy: "Practice coins are simulated only.",
    };
  }

  const winnerSeat = state.winnerSeat;
  const winner = state.players[winnerSeat];
  const deltas = ([0, 1, 2, 3] as Seat[]).map((seat) => (seat === winnerSeat ? 3000 : -1000)) as [
    number,
    number,
    number,
    number,
  ];

  return {
    winnerSeat,
    winnerName: winner.name,
    totalFan: 3,
    fanLines: [{ id: "practice-basic", nameKey: "fan.practiceBasic", fan: 3 }],
    deltas,
    policyCopy: "Practice coins are simulated only.",
  };
}
