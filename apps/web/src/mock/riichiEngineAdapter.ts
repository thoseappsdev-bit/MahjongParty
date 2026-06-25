import { riichi } from "@mahjong/game-core";
import type { LegalAction, MatchResult, MatchView, Seat, TableType } from "@mahjong/shared-types";

const winds = ["E", "S", "W", "N"] as const;

type RiichiMatchState = riichi.RiichiMatchState;
type RiichiSeat = riichi.RiichiSeat;

export function riichiStateToView(state: RiichiMatchState, tableType: TableType = "friendly"): MatchView {
  return {
    handNumber: state.context.handNumber,
    mode: "riichi",
    tableType,
    turnSeat: state.turnSeat,
    mySeat: 0,
    timerSeconds: state.turnSeat === 0 ? 25 : 8,
    wallCount: state.liveWall.length,
    claimPrompt: null,
    legalActions: legalActionsForLocalPlayer(state),
    myHand: state.players[0].hand,
    players: state.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatar: player.avatar,
      wind: winds[player.seat],
      isBot: player.isBot,
      handCount: player.hand.length,
      melds: player.melds.map((meld) => `${meld.kind.toUpperCase()} ${meld.tiles.join(" ")}`),
      discards: player.discards,
      coinsDelta: player.points - 30000,
      connected: true,
    })) as MatchView["players"],
    recentEvent: state.eventLog.slice(-4).join(" "),
  };
}

export function riichiStateToResult(state: RiichiMatchState): MatchResult {
  const handResult = riichi.riichiHandResultFromState(state);
  if (!handResult || handResult.kind === "exhaustive-draw") {
    return wallDrawResult();
  }

  const winnerSeat = handResult.winnerSeat;
  const winner = state.players[winnerSeat];
  const winEvent = [...state.auditLog].reverse().find((event) => event.action.type === "win");
  const winningTile = typeof winEvent?.action.payload?.tile === "string" ? (winEvent.action.payload.tile as riichi.RiichiTile) : winner.hand.at(-1);
  const score = winningTile
    ? riichi.scoreRiichiHand({
        hand: winner.hand,
        melds: winner.melds,
        winningTile,
        winBy: "tsumo",
        riichi: winner.riichi,
        doubleRiichi: winner.doubleRiichi,
        ippatsu: winner.ippatsu,
        doraIndicators: state.doraIndicators,
        uraDoraIndicators: state.uraDoraIndicators,
        seatWind: seatWindFor(winnerSeat),
        roundWind: state.context.roundWind,
      })
    : null;

  return {
    winnerSeat,
    winnerName: winner.name,
    totalFan: score?.han ?? 0,
    fanLines: score?.yaku.length
      ? score.yaku.map((line) => ({ id: line.id, nameKey: `riichi.yaku.${line.id}`, fan: line.han || line.yakuman * 13 }))
      : [{ id: "riichi-win", nameKey: "fan.practiceBasic", fan: 1 }],
    deltas: handResult.deltas as MatchResult["deltas"],
    policyCopy: "Riichi hand settlement uses honba, riichi sticks, dealer payments, and yaku scoring.",
  };
}

export function riichiHanchanToResult(state: RiichiMatchState): MatchResult {
  const standings = riichi.finalizeHanchan(state);
  const winner = standings[0] ?? { seat: 0 as RiichiSeat, name: "Riichi Winner", total: 0 };
  const deltas = state.players.map((player) => player.points - 30000) as MatchResult["deltas"];

  return {
    winnerSeat: winner.seat,
    winnerName: winner.name,
    totalFan: Math.round(winner.total),
    fanLines: [{ id: "riichi-hanchan", nameKey: "riichi.hanchanComplete", fan: Math.round(winner.total) }],
    deltas,
    policyCopy: "Riichi hanchan complete. Ranking total includes the +15/+5/-5/-15 uma table bonus.",
  };
}

export function chooseRiichiBotDiscard(state: RiichiMatchState): riichi.RiichiTile | null {
  const player = state.players[state.turnSeat];
  if (!player.isBot || player.hand.length === 0) return null;
  const isolatedHonor = player.hand.find((tile) => tile.startsWith("w") || tile.startsWith("d"));
  return isolatedHonor ?? player.hand[player.hand.length - 1];
}

function legalActionsForLocalPlayer(state: RiichiMatchState): LegalAction[] {
  if (state.phase === "complete" || state.turnSeat !== 0) return [];
  const actions: LegalAction[] = ["discard"];
  if (canLocalTsumo(state)) actions.unshift("win");
  return actions;
}

function canLocalTsumo(state: RiichiMatchState): boolean {
  const player = state.players[0];
  const winningTile = player.hand.at(-1);
  if (!winningTile) return false;

  const handBeforeDraw = player.hand.slice(0, -1);
  try {
    if (!riichi.winningTiles(handBeforeDraw, player.melds).includes(winningTile)) {
      return false;
    }

    return riichi.scoreRiichiHand({
      hand: player.hand,
      melds: player.melds,
      winningTile,
      winBy: "tsumo",
      riichi: player.riichi,
      doubleRiichi: player.doubleRiichi,
      ippatsu: player.ippatsu,
      doraIndicators: state.doraIndicators,
      uraDoraIndicators: state.uraDoraIndicators,
      seatWind: "we",
      roundWind: state.context.roundWind,
    }).legal;
  } catch {
    return false;
  }
}

function wallDrawResult(): MatchResult {
  return {
    winnerSeat: 0,
    winnerName: "Wall Draw",
    totalFan: 0,
    fanLines: [{ id: "wall-draw", nameKey: "fan.wallDraw", fan: 0 }],
    deltas: [0, 0, 0, 0],
    policyCopy: "The wall was exhausted. Riichi tenpai/noten settlement is applied before the next hand.",
  };
}

function seatWindFor(seat: Seat): riichi.RiichiHonor {
  return (["we", "ws", "ww", "wn"] as const)[seat];
}
