import { evaluateWinningHand, scoreOldHongKongFan, type MatchState } from "@mahjong/game-core";
import type { GameMode, LegalAction, MatchResult, MatchView, TableType } from "@mahjong/shared-types";

const winds = ["E", "S", "W", "N"] as const;

export function matchStateToView(
  state: MatchState,
  config: { mode: GameMode; tableType: TableType },
): MatchView {
  return {
    handNumber: 1,
    mode: config.mode,
    tableType: config.tableType,
    turnSeat: state.turnSeat,
    mySeat: 0,
    timerSeconds: state.turnSeat === 0 ? 25 : 8,
    wallCount: state.wall.length,
    claimPrompt: claimPromptForLocalPlayer(state),
    legalActions: legalActionsForLocalPlayer(state),
    myHand: state.players[0].hand,
    players: state.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatar: player.avatar,
      wind: winds[player.seat],
      isBot: player.isBot,
      handCount: player.hand.length,
      melds: player.melds,
      discards: player.discards,
      coinsDelta: 0,
      connected: true,
    })) as MatchView["players"],
    recentEvent: state.eventLog.slice(-4).join(" "),
  };
}

export function matchStateToResult(state: MatchState): MatchResult {
  if (state.winnerSeat === null) {
    return wallDrawResult();
  }

  const winnerSeat = state.winnerSeat ?? 0;
  const winner = state.players[winnerSeat];
  const score = scoreOldHongKongFan({ codes: winner.hand, selfDraw: false, melds: winner.melds });
  const fanLines = score.fanLines.length > 0 ? score.fanLines : [{ id: "basic-win", nameKey: "fan.practiceBasic", fan: 3 }];

  return {
    winnerSeat,
    winnerName: winner.name,
    totalFan: score.totalFan || 3,
    fanLines,
    deltas: state.players.map((player) => (player.seat === winnerSeat ? 3000 : -1000)) as MatchResult["deltas"],
    policyCopy: "Virtual coins have no cash value.",
  };
}

function wallDrawResult(): MatchResult {
  return {
    winnerSeat: 0,
    winnerName: "Wall Draw",
    totalFan: 0,
    fanLines: [{ id: "wall-draw", nameKey: "fan.wallDraw", fan: 0 }],
    deltas: [0, 0, 0, 0],
    policyCopy: "The wall was exhausted. No winner this hand.",
  };
}

function legalActionsForLocalPlayer(state: MatchState): LegalAction[] {
  if (state.phase === "complete") {
    return [];
  }

  if (state.claimWindow) {
    return state.claimWindow.offers.filter((offer) => offer.seat === 0).map((offer) => offer.action);
  }

  if (state.turnSeat !== 0) {
    return [];
  }

  const actions: LegalAction[] = ["discard"];
  if (hasConcealedKong(state.players[0].hand)) {
    actions.push("kong");
  }
  if (evaluateWinningHand(state.players[0].hand).isWin) {
    actions.push("win");
  }
  return actions;
}

function hasConcealedKong(hand: string[]): boolean {
  const counts = new Map<string, number>();
  for (const tile of hand) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 4);
}

function claimPromptForLocalPlayer(state: MatchState): string | null {
  const localOffers = state.claimWindow?.offers.filter((offer) => offer.seat === 0) ?? [];
  if (!state.claimWindow || localOffers.length === 0) {
    return null;
  }

  return `${state.players[state.claimWindow.discard.seat].name} discarded ${state.claimWindow.discard.tile.toUpperCase()}. ${localOffers
    .map((offer) => offer.action.toUpperCase())
    .join(" or ")} is available.`;
}
