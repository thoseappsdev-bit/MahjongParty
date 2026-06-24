import type { RiichiHonor, RiichiTile } from "./tiles";
import type { RiichiMeld, RiichiSeat } from "./types";
import { calculateRiichiFu } from "./fu";
import { detectRiichiYaku, type RiichiYakuLine } from "./yaku";

export type RiichiLimit = "none" | "mangan" | "haneman" | "baiman" | "sanbaiman" | "yakuman";

export interface RiichiScoreInput {
  hand: readonly RiichiTile[];
  melds?: readonly RiichiMeld[];
  winningTile: RiichiTile;
  winBy?: "ron" | "tsumo";
  riichi?: boolean;
  doubleRiichi?: boolean;
  ippatsu?: boolean;
  chankan?: boolean;
  rinshan?: boolean;
  haitei?: boolean;
  houtei?: boolean;
  seatWind?: RiichiHonor;
  roundWind?: RiichiHonor;
  doraIndicators?: readonly RiichiTile[];
  uraDoraIndicators?: readonly RiichiTile[];
  kanDoraIndicators?: readonly RiichiTile[];
}

export interface RiichiScore {
  legal: boolean;
  han: number;
  fu: number;
  yakuman: number;
  limit: RiichiLimit;
  yaku: RiichiYakuLine[];
}

export interface RiichiSettlementContext {
  winnerSeat: RiichiSeat;
  winBy: "ron" | "tsumo";
  payerSeat?: RiichiSeat;
  dealerSeat: RiichiSeat;
  honba: number;
  riichiSticks: number;
}

export function scoreRiichiHand(input: RiichiScoreInput): RiichiScore {
  const yaku = detectRiichiYaku(input);
  const yakuman = yaku.reduce((sum, line) => sum + line.yakuman, 0);
  const han = yaku.reduce((sum, line) => sum + line.han, 0);
  const hasNonDoraYaku = yaku.some((line) => line.yakuman > 0 || !line.id.includes("dora"));
  const fu = calculateRiichiFu(input);
  return { legal: hasNonDoraYaku, han, fu, yakuman, limit: limitName(han, fu, yakuman), yaku };
}

export function settleRiichiWin(score: Pick<RiichiScore, "han" | "fu" | "yakuman">, context: RiichiSettlementContext): [number, number, number, number] {
  const deltas = [0, 0, 0, 0] as [number, number, number, number];
  const base = basePoints(score);
  const winnerIsDealer = context.winnerSeat === context.dealerSeat;
  const stickBonus = context.riichiSticks * 1000;
  if (context.winBy === "ron") {
    const payer = context.payerSeat ?? context.dealerSeat;
    const payment = roundUp100(base * (winnerIsDealer ? 6 : 4)) + context.honba * 300;
    deltas[context.winnerSeat] += payment + stickBonus;
    deltas[payer] -= payment;
    return deltas;
  }
  for (const seat of [0, 1, 2, 3] as RiichiSeat[]) {
    if (seat === context.winnerSeat) continue;
    const payment = roundUp100(base * (winnerIsDealer || seat === context.dealerSeat ? 2 : 1)) + context.honba * 100;
    deltas[seat] -= payment;
    deltas[context.winnerSeat] += payment;
  }
  deltas[context.winnerSeat] += stickBonus;
  return deltas;
}

function basePoints(score: Pick<RiichiScore, "han" | "fu" | "yakuman">): number {
  if (score.yakuman > 0 || score.han >= 13) return 8000 * Math.max(1, score.yakuman);
  if (score.han >= 11) return 6000;
  if (score.han >= 8) return 4000;
  if (score.han >= 6) return 3000;
  const raw = score.fu * 2 ** (score.han + 2);
  return score.han >= 5 || raw >= 2000 ? 2000 : raw;
}

function limitName(han: number, fu: number, yakuman: number): RiichiLimit {
  if (yakuman > 0 || han >= 13) return "yakuman";
  if (han >= 11) return "sanbaiman";
  if (han >= 8) return "baiman";
  if (han >= 6) return "haneman";
  if (han >= 5 || fu * 2 ** (han + 2) >= 2000) return "mangan";
  return "none";
}

function roundUp100(value: number): number {
  return Math.ceil(value / 100) * 100;
}
