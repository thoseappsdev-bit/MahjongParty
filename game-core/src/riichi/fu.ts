import type { RiichiHonor, RiichiTile } from "./tiles";
import type { RiichiMeld } from "./types";
import { countTiles, detectRiichiYaku, isHonor, isSevenPairs, isTerminal } from "./yaku";

export interface RiichiFuInput {
  hand: readonly RiichiTile[];
  melds?: readonly RiichiMeld[];
  winningTile: RiichiTile;
  winBy?: "ron" | "tsumo";
  seatWind?: RiichiHonor;
  roundWind?: RiichiHonor;
}

export function calculateRiichiFu(input: RiichiFuInput): number {
  const melds = input.melds ?? [];
  const counts = countTiles([...input.hand, ...melds.flatMap((meld) => meld.tiles)]);
  if (isSevenPairs(counts, melds)) return 25;
  const yaku = detectRiichiYaku(input).map((line) => line.id);
  if (input.winBy === "tsumo" && yaku.includes("pinfu")) return 20;
  let fu = 20;
  const closed = melds.every((meld) => !meld.open);
  if ((input.winBy ?? "ron") === "ron" && closed) fu += 10;
  if (input.winBy === "tsumo") fu += 2;
  for (const [tile, count] of counts) if (count >= 3) fu += groupFu(tile, false, count >= 4);
  for (const meld of melds) if (meld.kind === "pung" || meld.kind === "kong") fu += groupFu(meld.tiles[0], meld.open, meld.kind === "kong");
  const pair = [...counts.entries()].find(([, count]) => count === 2)?.[0];
  if (pair === "dr" || pair === "dg" || pair === "dw") fu += 2;
  if (pair && pair === input.seatWind) fu += 2;
  if (pair && pair === input.roundWind) fu += 2;
  if (isClosedWait(input.hand, input.winningTile) || pair === input.winningTile) fu += 2;
  return Math.ceil(fu / 10) * 10;
}

function groupFu(tile: RiichiTile, open: boolean, kong: boolean): number {
  const terminalOrHonor = isTerminal(tile) || isHonor(tile);
  if (kong) return terminalOrHonor ? (open ? 16 : 32) : open ? 8 : 16;
  return terminalOrHonor ? (open ? 4 : 8) : open ? 2 : 4;
}

function isClosedWait(hand: readonly RiichiTile[], winningTile: RiichiTile): boolean {
  if (winningTile.length !== 2 || !(winningTile[0] === "m" || winningTile[0] === "p" || winningTile[0] === "s")) return false;
  const suit = winningTile[0];
  const rank = Number(winningTile[1]);
  return rank > 1 && rank < 9 && hand.includes(`${suit}${rank - 1}` as RiichiTile) && hand.includes(`${suit}${rank + 1}` as RiichiTile);
}
