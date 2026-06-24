import { doraForIndicator, type RiichiTile } from "./tiles";
import type { RiichiHonor } from "./tiles";
import type { RiichiMeld } from "./types";

export interface RiichiYakuLine {
  id: string;
  han: number;
  yakuman: number;
}

export interface RiichiYakuInput {
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

const dragons = new Set<RiichiTile>(["dr", "dg", "dw"]);
const winds = new Set<RiichiTile>(["we", "ws", "ww", "wn"]);

export function detectRiichiYaku(input: RiichiYakuInput): RiichiYakuLine[] {
  const melds = input.melds ?? [];
  const allTiles = [...input.hand, ...melds.flatMap((meld) => meld.tiles)];
  const counts = countTiles(allTiles);
  const lines: RiichiYakuLine[] = [];
  const closed = melds.every((meld) => !meld.open);
  const add = (id: string, han: number, yakuman = 0) => lines.push({ id, han, yakuman });

  if (isKokushi(counts)) add("kokushi-musou", 0, 1);
  if (input.doubleRiichi) add("double-riichi", 2);
  else if (input.riichi) add("riichi", 1);
  if (input.ippatsu) add("ippatsu", 1);
  if (input.winBy === "tsumo" && closed) add("menzen-tsumo", 1);
  if (input.chankan) add("chankan", 1);
  if (input.rinshan) add("rinshan", 1);
  if (input.haitei) add("haitei", 1);
  if (input.houtei) add("houtei", 1);
  if (isTanyao(allTiles)) add("tanyao", 1);
  if (isSevenPairs(counts, melds)) add("chiitoitsu", 2);

  const sequenceCounts = sequencePatternCounts(allTiles, melds);
  const duplicateSequencePairs = [...sequenceCounts.values()].filter((count) => count >= 2).length;
  if (closed && duplicateSequencePairs >= 2) add("ryanpeikou", 3);
  else if (closed && duplicateSequencePairs >= 1) add("iipeikou", 1);

  if (isPinfu(allTiles, melds, input)) add("pinfu", 1);
  if (hasYakuhai(counts, melds, input)) add("yakuhai", 1);
  if (hasSanshoku(sequenceCounts)) add("sanshoku", melds.some((meld) => meld.open) ? 1 : 2);
  if (hasIttsuu(sequenceCounts)) add("ittsuu", melds.some((meld) => meld.open) ? 1 : 2);
  if (isJunchan(allTiles, melds)) add("junchan", melds.some((meld) => meld.open) ? 2 : 3);
  else if (isChanta(allTiles, melds)) add("chanta", melds.some((meld) => meld.open) ? 1 : 2);
  if (isToitoi(allTiles, melds)) add("toitoi", 2);
  if (tripletTiles(counts, melds).length >= 3) add("sanankou", 2);
  if (melds.filter((meld) => meld.kind === "kong").length >= 3) add("sankantsu", 2);
  if (allTiles.every((tile) => isTerminal(tile) || isHonor(tile))) add("honroutou", 2);
  if (isShousangen(counts, melds)) add("shousangen", 2);
  if (isChinitsu(allTiles)) add("chinitsu", melds.some((meld) => meld.open) ? 5 : 6);
  else if (isHonitsu(allTiles)) add("honitsu", melds.some((meld) => meld.open) ? 2 : 3);

  addDora(lines, "dora", allTiles, input.doraIndicators ?? []);
  addDora(lines, "kan-dora", allTiles, input.kanDoraIndicators ?? []);
  if (input.riichi || input.doubleRiichi) addDora(lines, "ura-dora", allTiles, input.uraDoraIndicators ?? []);
  return lines;
}

function addDora(lines: RiichiYakuLine[], id: string, allTiles: readonly RiichiTile[], indicators: readonly RiichiTile[]) {
  const dora = indicators.map(doraForIndicator);
  const han = allTiles.filter((tile) => dora.includes(tile)).length;
  if (han > 0) lines.push({ id, han, yakuman: 0 });
}

export function countTiles(tiles: readonly RiichiTile[]): Map<RiichiTile, number> {
  const counts = new Map<RiichiTile, number>();
  for (const tile of tiles) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  return counts;
}

export function isSevenPairs(counts: Map<RiichiTile, number>, melds: readonly RiichiMeld[] = []): boolean {
  return melds.length === 0 && [...counts.values()].filter((count) => count >= 2).length === 7;
}

export function isKokushi(counts: Map<RiichiTile, number>): boolean {
  const required = ["m1", "m9", "p1", "p9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw"] as RiichiTile[];
  return required.every((tile) => (counts.get(tile) ?? 0) > 0) && required.some((tile) => (counts.get(tile) ?? 0) > 1);
}

export function isTerminal(tile: RiichiTile): boolean {
  return tile.length === 2 && (tile[1] === "1" || tile[1] === "9");
}

export function isHonor(tile: RiichiTile): boolean {
  return dragons.has(tile) || winds.has(tile);
}

function isTanyao(tiles: readonly RiichiTile[]): boolean {
  return tiles.every((tile) => !isHonor(tile) && !isTerminal(tile));
}

function suited(tile: RiichiTile): boolean {
  return tile[0] === "m" || tile[0] === "p" || tile[0] === "s";
}

function sequencePatternCounts(tiles: readonly RiichiTile[], melds: readonly RiichiMeld[]): Map<string, number> {
  const patterns = new Map<string, number>();
  for (const meld of melds) if (meld.kind === "chow") addSequencePattern(patterns, meld.tiles);
  for (const suit of ["m", "p", "s"] as const) {
    const ranks = Array(10).fill(0);
    for (const tile of tiles) if (tile[0] === suit) ranks[Number(tile[1])] += 1;
    for (let rank = 1; rank <= 7; rank += 1) {
      const count = Math.min(ranks[rank], ranks[rank + 1], ranks[rank + 2]);
      if (count > 0) patterns.set(`${suit}${rank}${rank + 1}${rank + 2}`, Math.max(patterns.get(`${suit}${rank}${rank + 1}${rank + 2}`) ?? 0, count));
    }
  }
  return patterns;
}

function addSequencePattern(patterns: Map<string, number>, tiles: readonly RiichiTile[]) {
  const suitedTiles = tiles.filter(suited).sort();
  if (suitedTiles.length !== 3) return;
  const suit = suitedTiles[0][0];
  const ranks = suitedTiles.map((tile) => Number(tile[1])).sort((a, b) => a - b);
  if (ranks[0] + 1 === ranks[1] && ranks[1] + 1 === ranks[2]) {
    const key = `${suit}${ranks[0]}${ranks[1]}${ranks[2]}`;
    patterns.set(key, (patterns.get(key) ?? 0) + 1);
  }
}

function hasSanshoku(patterns: Map<string, number>): boolean {
  for (let rank = 1; rank <= 7; rank += 1) if (["m", "p", "s"].every((suit) => patterns.has(`${suit}${rank}${rank + 1}${rank + 2}`))) return true;
  return false;
}

function hasIttsuu(patterns: Map<string, number>): boolean {
  return ["m", "p", "s"].some((suit) => patterns.has(`${suit}123`) && patterns.has(`${suit}456`) && patterns.has(`${suit}789`));
}

function hasYakuhai(counts: Map<RiichiTile, number>, melds: readonly RiichiMeld[], input: RiichiYakuInput): boolean {
  const valueTiles = new Set<RiichiTile>(["dr", "dg", "dw"]);
  if (input.seatWind) valueTiles.add(input.seatWind);
  if (input.roundWind) valueTiles.add(input.roundWind);
  return [...valueTiles].some((tile) => (counts.get(tile) ?? 0) >= 3 || melds.some((meld) => meld.tiles[0] === tile && meld.tiles.length >= 3));
}

function tripletTiles(counts: Map<RiichiTile, number>, melds: readonly RiichiMeld[]): RiichiTile[] {
  const fromHand = [...counts.entries()].filter(([, count]) => count >= 3).map(([tile]) => tile);
  const fromMelds = melds.filter((meld) => meld.kind === "pung" || meld.kind === "kong").map((meld) => meld.tiles[0]);
  return [...new Set([...fromHand, ...fromMelds])];
}

function isToitoi(tiles: readonly RiichiTile[], melds: readonly RiichiMeld[]): boolean {
  const counts = countTiles(tiles);
  const pairs = [...counts.values()].filter((count) => count === 2).length;
  return pairs === 1 && tripletTiles(counts, melds).length >= 4;
}

function isShousangen(counts: Map<RiichiTile, number>, melds: readonly RiichiMeld[]): boolean {
  const dragonTriplets = [...dragons].filter((tile) => (counts.get(tile) ?? 0) >= 3 || melds.some((meld) => meld.tiles[0] === tile && meld.tiles.length >= 3));
  const dragonPairs = [...dragons].filter((tile) => (counts.get(tile) ?? 0) === 2);
  return dragonTriplets.length >= 2 && dragonPairs.length >= 1;
}

function isHonitsu(tiles: readonly RiichiTile[]): boolean {
  const suits = new Set(tiles.filter(suited).map((tile) => tile[0]));
  return suits.size === 1 && tiles.some(isHonor);
}

function isChinitsu(tiles: readonly RiichiTile[]): boolean {
  const suits = new Set(tiles.filter(suited).map((tile) => tile[0]));
  return suits.size === 1 && tiles.every((tile) => !isHonor(tile));
}

function isPinfu(tiles: readonly RiichiTile[], melds: readonly RiichiMeld[], input: RiichiYakuInput): boolean {
  if (melds.some((meld) => meld.open || meld.kind !== "chow")) return false;
  const counts = countTiles(tiles);
  if ([...counts.entries()].some(([, count]) => count >= 3)) return false;
  const pair = [...counts.entries()].find(([, count]) => count === 2)?.[0];
  return !pair || (!dragons.has(pair) && pair !== input.seatWind && pair !== input.roundWind);
}

function isChanta(tiles: readonly RiichiTile[], melds: readonly RiichiMeld[]): boolean {
  return everyGroupHas(tiles, melds, (group) => group.some((tile) => isTerminal(tile) || isHonor(tile))) && [...sequencePatternCounts(tiles, melds).values()].length > 0;
}

function isJunchan(tiles: readonly RiichiTile[], melds: readonly RiichiMeld[]): boolean {
  return tiles.every((tile) => !isHonor(tile)) && everyGroupHas(tiles, melds, (group) => group.some(isTerminal)) && [...sequencePatternCounts(tiles, melds).values()].length > 0;
}

function everyGroupHas(tiles: readonly RiichiTile[], melds: readonly RiichiMeld[], predicate: (group: RiichiTile[]) => boolean): boolean {
  const groups = melds.map((meld) => [...meld.tiles]);
  const counts = countTiles(tiles);
  for (const [tile, count] of counts) {
    if (count >= 3) groups.push([tile, tile, tile]);
    if (count === 2) groups.push([tile, tile]);
  }
  for (const [key] of sequencePatternCounts(tiles, melds)) {
    const suit = key[0] as "m" | "p" | "s";
    const ranks = key.slice(1).split("").map(Number);
    groups.push(ranks.map((rank) => `${suit}${rank}` as RiichiTile));
  }
  return groups.length > 0 && groups.every(predicate);
}
