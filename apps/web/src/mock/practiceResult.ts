import type { PracticeMatchState } from "@mahjong/game-core";
import type { MatchResult, Seat } from "@mahjong/shared-types";

export function resultFromPractice(state: PracticeMatchState): MatchResult {
  if (state.winnerSeat === null) {
    return practiceProgressResult(state);
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
function practiceProgressResult(state: PracticeMatchState): MatchResult {
  const counts = state.players.map((player) => player.hand.length);
  const fewestTiles = Math.min(...counts);
  const leadingSeats = counts.flatMap((count, index) => (count === fewestTiles ? [index as Seat] : []));

  if (leadingSeats.length !== 1) {
    return {
      winnerSeat: 0,
      winnerName: "Wall Draw",
      totalFan: 0,
      fanLines: [{ id: "wall-draw", nameKey: "fan.wallDraw", fan: 0 }],
      deltas: [0, 0, 0, 0],
      policyCopy: "Practice wall exhausted with a tied least-tile count.",
    };
  }

  const winnerSeat = leadingSeats[0];
  return {
    winnerSeat,
    winnerName: state.players[winnerSeat].name,
    totalFan: 0,
    fanLines: [{ id: "progress-tiebreak", nameKey: "fan.progressTiebreak", fan: 0 }],
    deltas: ([0, 1, 2, 3] as Seat[]).map((seat) => (seat === winnerSeat ? 3000 : -1000)) as MatchResult["deltas"],
    policyCopy: "Practice fallback: the wall was exhausted, so the player with the fewest tiles left wins.",
  };
}
