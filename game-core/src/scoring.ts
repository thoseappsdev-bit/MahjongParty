export type WinningPattern = "standard" | "seven-pairs" | "thirteen-orphans";

export interface WinningHandEvaluation {
  isWin: boolean;
  pattern: WinningPattern | null;
}

export interface CoreFanLine {
  id: string;
  nameKey: string;
  fan: number;
}

export interface OldHongKongScoreInput {
  codes: string[];
  selfDraw?: boolean;
  melds?: string[];
  flowerCount?: number;
  seasonCount?: number;
  seatWind?: string;
  roundWind?: string;
  winContext?: "discard" | "self-draw" | "rob-kong";
  concealed?: boolean;
  lastTile?: boolean;
}

export interface OldHongKongScoreResult extends WinningHandEvaluation {
  totalFan: number;
  fanLines: CoreFanLine[];
}

const suits = ["m", "p", "s"] as const;
const dragons = new Set(["dr", "dg", "dw"]);
const winds = new Set(["we", "ws", "ww", "wn"]);
const terminalsAndHonors = new Set([
  "m1",
  "m9",
  "p1",
  "p9",
  "s1",
  "s9",
  "we",
  "ws",
  "ww",
  "wn",
  "dr",
  "dg",
  "dw",
]);
const terminals = new Set(["m1", "m9", "p1", "p9", "s1", "s9"]);

export function evaluateWinningHand(codes: string[]): WinningHandEvaluation {
  if (codes.length !== 14 || codes.some(isBonusTile)) {
    return losingHand();
  }

  if (isThirteenOrphans(codes)) {
    return { isWin: true, pattern: "thirteen-orphans" };
  }

  const counts = countsByCode(codes);
  const pairCount = [...counts.values()].filter((count) => count === 2).length;
  if (codes.length === 14 && pairCount === 7) {
    return { isWin: true, pattern: "seven-pairs" };
  }

  for (const [code, count] of counts) {
    if (count < 2) {
      continue;
    }

    const withoutPair = new Map(counts);
    withoutPair.set(code, count - 2);
    if (canFormMelds(withoutPair)) {
      return { isWin: true, pattern: "standard" };
    }
  }

  return losingHand();
}

export function scoreOldHongKongFan(input: OldHongKongScoreInput): OldHongKongScoreResult {
  const melds = input.melds ?? [];
  const evaluation = evaluateWinningHandWithMelds(input.codes, melds);
  if (!evaluation.isWin) {
    return { ...evaluation, totalFan: 0, fanLines: [] };
  }

  const fanLines: CoreFanLine[] = [];
  if (input.selfDraw || input.winContext === "self-draw") {
    fanLines.push({ id: "self-draw", nameKey: "fan.selfDraw", fan: 1 });
  }

  if (input.concealed) {
    fanLines.push({ id: "concealed", nameKey: "fan.concealed", fan: 1 });
  }

  if (input.lastTile) {
    fanLines.push({ id: "last-tile", nameKey: "fan.lastTile", fan: 1 });
  }

  if ((input.flowerCount ?? 0) === 0 && (input.seasonCount ?? 0) === 0) {
    fanLines.push({ id: "no-bonus", nameKey: "fan.noBonus", fan: 1 });
  }

  if (evaluation.pattern === "thirteen-orphans") {
    fanLines.push({ id: "thirteen-orphans", nameKey: "fan.thirteenOrphans", fan: 16 });
  } else if (evaluation.pattern === "seven-pairs") {
    fanLines.push({ id: "seven-pairs", nameKey: "fan.sevenPairs", fan: 4 });
  } else {
    if (isAllChows(input.codes, melds)) {
      fanLines.push({ id: "all-chows", nameKey: "fan.allChows", fan: 1 });
    }
    if (isAllPungs(input.codes, melds)) {
      fanLines.push({ id: "all-pungs", nameKey: "fan.allPungs", fan: 3 });
    }
  }

  const dragonSet = dragonPungs(input.codes, melds);
  const windSet = windPungs(input.codes, melds);
  if (dragonSet.size >= 3) {
    fanLines.push({ id: "great-three-dragons", nameKey: "fan.greatThreeDragons", fan: 8 });
  } else if (dragonSet.size === 2 && hasPairOf(input.codes, "dr", "dg", "dw")) {
    fanLines.push({ id: "small-three-dragons", nameKey: "fan.smallThreeDragons", fan: 5 });
  } else if (dragonSet.size > 0) {
    fanLines.push({ id: "dragon-pung", nameKey: "fan.dragonPung", fan: 1 });
  }

  if (windSet.size >= 4) {
    fanLines.push({ id: "great-four-winds", nameKey: "fan.greatFourWinds", fan: 10 });
  } else if (windSet.size === 3 && hasPairOf(input.codes, "we", "ws", "ww", "wn")) {
    fanLines.push({ id: "small-four-winds", nameKey: "fan.smallFourWinds", fan: 8 });
  }

  const flushKind = flushFan(input.codes);
  if (flushKind === "full-flush") {
    fanLines.push({ id: "full-flush", nameKey: "fan.fullFlush", fan: 7 });
  } else if (flushKind === "half-flush") {
    fanLines.push({ id: "half-flush", nameKey: "fan.halfFlush", fan: 3 });
  }

  if (isAllHonors(input.codes)) {
    fanLines.push({ id: "all-honors", nameKey: "fan.allHonors", fan: 10 });
  }

  if (isAllTerminals(input.codes, melds)) {
    fanLines.push({ id: "all-terminals", nameKey: "fan.allTerminals", fan: 10 });
  } else if (isTerminalsAndHonors(input.codes, melds)) {
    fanLines.push({ id: "terminals-honors", nameKey: "fan.terminalsHonors", fan: 1 });
  }

  if (isAllKongs(melds)) {
    fanLines.push({ id: "all-kongs", nameKey: "fan.allKongs", fan: 16 });
  }

  if (input.seatWind && hasPungOf(input.codes, melds, input.seatWind) && !fanLines.some((line) => line.id.includes("four-winds"))) {
    fanLines.push({ id: "seat-wind", nameKey: "fan.seatWind", fan: 1 });
  }

  if (input.roundWind && hasPungOf(input.codes, melds, input.roundWind) && !fanLines.some((line) => line.id.includes("four-winds"))) {
    fanLines.push({ id: "round-wind", nameKey: "fan.roundWind", fan: 1 });
  }

  if ((input.flowerCount ?? 0) > 0) {
    fanLines.push({ id: "flowers", nameKey: "fan.flowers", fan: input.flowerCount ?? 0 });
  }

  if ((input.seasonCount ?? 0) > 0) {
    fanLines.push({ id: "seasons", nameKey: "fan.seasons", fan: input.seasonCount ?? 0 });
  }

  if (input.winContext === "rob-kong") {
    fanLines.push({ id: "rob-kong", nameKey: "fan.robKong", fan: 1 });
  }

  return {
    ...evaluation,
    fanLines,
    totalFan: fanLines.reduce((total, line) => total + line.fan, 0),
  };
}

function evaluateWinningHandWithMelds(codes: string[], melds: string[]): WinningHandEvaluation {
  if (melds.length === 0) {
    return evaluateWinningHand(codes);
  }

  if (codes.some(isBonusTile) || melds.length > 4) {
    return losingHand();
  }

  const concealedMeldsNeeded = 4 - melds.length;
  if (codes.length !== concealedMeldsNeeded * 3 + 2) {
    return losingHand();
  }

  const counts = countsByCode(codes);
  for (const [code, count] of counts) {
    if (count < 2) {
      continue;
    }

    const withoutPair = new Map(counts);
    withoutPair.set(code, count - 2);
    if (canFormMelds(withoutPair)) {
      return { isWin: true, pattern: "standard" };
    }
  }

  return losingHand();
}

function losingHand(): WinningHandEvaluation {
  return { isWin: false, pattern: null };
}

function isBonusTile(code: string): boolean {
  return code.startsWith("f") || code.startsWith("t");
}

function isThirteenOrphans(codes: string[]): boolean {
  if (codes.length !== 14 || codes.some((code) => !terminalsAndHonors.has(code))) {
    return false;
  }

  const counts = countsByCode(codes);
  return [...terminalsAndHonors].every((code) => (counts.get(code) ?? 0) >= 1) && [...counts.values()].some((count) => count === 2);
}

function countsByCode(codes: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

function canFormMelds(counts: Map<string, number>): boolean {
  const nextCode = [...counts.entries()].find(([, count]) => count > 0)?.[0];
  if (!nextCode) {
    return true;
  }

  const count = counts.get(nextCode) ?? 0;
  if (count >= 3) {
    const pungCounts = new Map(counts);
    pungCounts.set(nextCode, count - 3);
    if (canFormMelds(pungCounts)) {
      return true;
    }
  }

  const chow = chowFor(nextCode);
  if (chow && chow.every((code) => (counts.get(code) ?? 0) > 0)) {
    const chowCounts = new Map(counts);
    for (const code of chow) {
      chowCounts.set(code, (chowCounts.get(code) ?? 0) - 1);
    }
    if (canFormMelds(chowCounts)) {
      return true;
    }
  }

  return false;
}

function chowFor(code: string): [string, string, string] | null {
  const suit = code[0];
  const rank = Number(code.slice(1));
  if (!suits.includes(suit as (typeof suits)[number]) || rank > 7) {
    return null;
  }

  return [`${suit}${rank}`, `${suit}${rank + 1}`, `${suit}${rank + 2}`];
}

function isAllPungs(codes: string[], melds: string[]): boolean {
  if (melds.some((meld) => meld.startsWith("chow"))) {
    return false;
  }

  return canFormOnlyPungsAndPair(codes, 4 - melds.length);
}

function isAllChows(codes: string[], melds: string[]): boolean {
  if (melds.some((meld) => !meld.startsWith("chow"))) {
    return false;
  }

  return canFormOnlyChowsAndPair(codes);
}

function canFormOnlyPungsAndPair(codes: string[], meldsNeeded: number): boolean {
  const counts = [...countsByCode(codes).values()].sort((left, right) => right - left);
  const expected = [...Array.from({ length: meldsNeeded }, () => 3), 2].sort((left, right) => right - left);
  return counts.length === expected.length && counts.every((count, index) => count === expected[index]);
}

function canFormOnlyChowsAndPair(codes: string[]): boolean {
  const counts = countsByCode(codes);
  for (const [code, count] of counts) {
    if (count < 2) {
      continue;
    }

    const withoutPair = new Map(counts);
    withoutPair.set(code, count - 2);
    if (canFormChows(withoutPair)) {
      return true;
    }
  }
  return false;
}

function canFormChows(counts: Map<string, number>): boolean {
  const nextCode = [...counts.entries()].find(([, count]) => count > 0)?.[0];
  if (!nextCode) {
    return true;
  }

  const chow = chowFor(nextCode);
  if (!chow || !chow.every((code) => (counts.get(code) ?? 0) > 0)) {
    return false;
  }

  const next = new Map(counts);
  for (const code of chow) {
    next.set(code, (next.get(code) ?? 0) - 1);
  }
  return canFormChows(next);
}

function hasPungOf(codes: string[], melds: string[], tile: string): boolean {
  const counts = countsByCode(codes);
  if ((counts.get(tile) ?? 0) >= 3) {
    return true;
  }

  return melds.some((meld) => {
    const [kind, meldTile] = meld.split(" ");
    return (kind === "pung" || kind === "kong") && meldTile === tile;
  });
}

function dragonPungs(codes: string[], melds: string[]): Set<string> {
  return new Set([...dragons].filter((dragon) => hasPungOf(codes, melds, dragon)));
}

function windPungs(codes: string[], melds: string[]): Set<string> {
  return new Set([...winds].filter((wind) => hasPungOf(codes, melds, wind)));
}

function hasPairOf(codes: string[], ...tiles: string[]): boolean {
  const counts = countsByCode(codes);
  return tiles.some((tile) => (counts.get(tile) ?? 0) === 2);
}

function flushFan(codes: string[]): "full-flush" | "half-flush" | null {
  const suited = codes.filter((code) => suits.includes(code[0] as (typeof suits)[number]));
  if (suited.length === 0) {
    return null;
  }

  const suitCount = new Set(suited.map((code) => code[0])).size;
  if (suitCount !== 1) {
    return null;
  }

  return suited.length === codes.length ? "full-flush" : "half-flush";
}

function isAllHonors(codes: string[]): boolean {
  return codes.length > 0 && codes.every((code) => dragons.has(code) || winds.has(code));
}

function isAllTerminals(codes: string[], melds: string[]): boolean {
  const tiles = scoringTiles(codes, melds);
  return tiles.length > 0 && tiles.every((tile) => terminals.has(tile));
}

function isTerminalsAndHonors(codes: string[], melds: string[]): boolean {
  const tiles = scoringTiles(codes, melds);
  return tiles.length > 0 && tiles.every((tile) => terminalsAndHonors.has(tile)) && tiles.some((tile) => terminals.has(tile));
}

function isAllKongs(melds: string[]): boolean {
  return melds.filter((meld) => meld.startsWith("kong")).length === 4;
}

function scoringTiles(codes: string[], melds: string[]): string[] {
  return [...codes, ...melds.flatMap(tilesFromMeld)];
}

function tilesFromMeld(meld: string): string[] {
  const [kind, ...tiles] = meld.split(" ");
  if (kind === "chow") {
    return tiles;
  }
  if ((kind === "pung" || kind === "kong") && tiles[0]) {
    return [tiles[0], tiles[0], tiles[0]];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Fan gate (1-fan / 3-fan minimum enforcement)
// ---------------------------------------------------------------------------

export type FanGateMode = "1-fan" | "3-fan" | "riichi";

// Limit hands always satisfy the gate regardless of mode.
const LIMIT_PATTERN_IDS = new Set(["thirteen-orphans", "all-kongs"]);

export function minFanForMode(mode: FanGateMode): number {
  return mode === "3-fan" ? 3 : 1;
}

export function isLimitHand(result: OldHongKongScoreResult): boolean {
  return result.fanLines.some((line) => LIMIT_PATTERN_IDS.has(line.id));
}

/**
 * A scored hand is only a legal win if it reaches the table's fan minimum.
 * Limit hands (thirteen orphans, all kongs) always pass.
 */
export function meetsFanGate(result: OldHongKongScoreResult, mode: FanGateMode): boolean {
  if (!result.isWin) {
    return false;
  }
  if (isLimitHand(result)) {
    return true;
  }
  return result.totalFan >= minFanForMode(mode);
}

// ---------------------------------------------------------------------------
// Settlement ladder (base unit x fan multiplier), per the phase doc
// ---------------------------------------------------------------------------

export type SettlementContext = "self-draw" | "discard" | "rob-kong";

export interface SettlementSettings {
  /** Coin base unit for the table tier (Bamboo=100, Jade=1000, ...). */
  baseUnit: number;
  /** Fan cap before the multiplier lookup (16 for Bamboo/Jade, 32 for Dragon/Phoenix). */
  fanCap: number;
}

export const DEFAULT_SETTLEMENT_SETTINGS: SettlementSettings = { baseUnit: 1000, fanCap: 16 };

export type OldHongKongTableTier = "bamboo" | "jade" | "dragon" | "phoenix";

export const OLD_HONG_KONG_TABLE_PRESETS: Readonly<Record<OldHongKongTableTier, SettlementSettings>> = {
  bamboo: { baseUnit: 100, fanCap: 16 },
  jade: { baseUnit: 1000, fanCap: 16 },
  dragon: { baseUnit: 10000, fanCap: 32 },
  phoenix: { baseUnit: 100000, fanCap: 32 },
};

export function oldHongKongTableSettings(tier: OldHongKongTableTier): SettlementSettings {
  return { ...OLD_HONG_KONG_TABLE_PRESETS[tier] };
}

export interface SettlementInput {
  totalFan: number;
  winnerSeat: number; // 0..3
  context: SettlementContext;
  /** Discarder (discard) or the konged player (rob-kong). Ignored for self-draw. */
  payerSeat?: number | null;
  settings?: SettlementSettings;
}

export interface SettlementResult {
  multiplier: number;
  handValue: number;
  /** Signed coin change per seat; invariant: the four values sum to 0. */
  deltas: [number, number, number, number];
}

/**
 * Doubling ladder from the phase doc: 3 fan = 1x, 4 = 2x, 5 = 4x, 6 = 8x,
 * 7+ = capped (16x for Bamboo/Jade, 32x for Dragon/Phoenix). Fan below the
 * 3-fan pivot settles at the base unit (1x).
 */
export function fanMultiplier(fan: number, fanCap: number = DEFAULT_SETTLEMENT_SETTINGS.fanCap): number {
  if (fan <= 3) {
    return 1;
  }
  return Math.min(2 ** (fan - 3), fanCap);
}

/**
 * Settles an Old Hong Kong hand into per-seat coin deltas.
 * Self-draw collects the hand value from all three opponents; a discard win
 * (and a robbed kong) collects from the single paying seat.
 */
export function settleOldHongKong(input: SettlementInput): SettlementResult {
  const settings = input.settings ?? DEFAULT_SETTLEMENT_SETTINGS;
  const multiplier = fanMultiplier(input.totalFan, settings.fanCap);
  const handValue = settings.baseUnit * multiplier;
  const deltas: [number, number, number, number] = [0, 0, 0, 0];
  const winner = input.winnerSeat;

  if (input.context === "self-draw") {
    for (let seat = 0; seat < 4; seat += 1) {
      if (seat !== winner) {
        deltas[seat] -= handValue;
        deltas[winner] += handValue;
      }
    }
  } else {
    const payer = input.payerSeat ?? (winner + 1) % 4;
    deltas[payer] -= handValue;
    deltas[winner] += handValue;
  }

  return { multiplier, handValue, deltas };
}
