import type { MatchView } from "@mahjong/shared-types";
export * from "./action-log";
export * from "./match-engine";
export * from "./practice-engine";
export * from "./scoring";

export function createPrototypeMatch(view: MatchView): MatchView {
  return { ...view, recentEvent: "Hand started" };
}

export function advancePrototypeMatch(view: MatchView): MatchView {
  const nextTurn = ((view.turnSeat + 1) % 4) as MatchView["turnSeat"];

  return {
    ...view,
    turnSeat: nextTurn,
    timerSeconds: Math.max(8, view.timerSeconds - 3),
    wallCount: Math.max(0, view.wallCount - 1),
    recentEvent: `${view.players[nextTurn].name} is thinking`,
    legalActions: nextTurn === view.mySeat ? ["discard", "kong", "win"] : ["chi", "pong", "win"],
  };
}
