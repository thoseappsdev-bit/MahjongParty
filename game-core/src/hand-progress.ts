export type HandProgressKind = "standard" | "seven-pairs" | "thirteen-orphans";

export interface HandProgress {
  shanten: number;
  kind: HandProgressKind;
}

const suits = ["m", "p", "s"] as const;
const honors = ["we", "ws", "ww", "wn", "dr", "dg", "dw"] as const;

const tileCodes = [
  ...suits.flatMap((suit) => Array.from({ length: 9 }, (_, index) => `${suit}${index + 1}`)),
  ...honors,
] as const;

const tileIndex = new Map<string, number>(tileCodes.map((tile, index) => [tile, index]));

const terminalHonorCodes = new Set<string>(["m1", "m9", "p1", "p9", "s1", "s9", ...honors]);

export function evaluateHandProgress(hand: readonly string[], melds: readonly string[] = []): HandProgress {
  const counts = toCounts(hand);
  const openMeldCount = countOpenMelds(melds);
  const candidates = [standardProgress(counts, openMeldCount)];

  if (openMeldCount === 0) {
    candidates.push(sevenPairsProgress(counts), thirteenOrphansProgress(counts));
  }

  return candidates.sort((left, right) => left.shanten - right.shanten || kindRank(left.kind) - kindRank(right.kind))[0];
}

function toCounts(hand: readonly string[]): number[] {
  const counts = Array<number>(tileCodes.length).fill(0);

  for (const tile of hand) {
    if (/^[ft]\d$/i.test(tile)) {
      throw new Error(`Bonus tile ${tile} cannot be evaluated in hand progress`);
    }

    const index = tileIndex.get(tile.toLowerCase());
    if (index === undefined) {
      throw new Error(`Invalid tile code: ${tile}`);
    }

    counts[index] += 1;
    if (counts[index] > 4) {
      throw new Error(`Hand contains more than four copies of ${tile}`);
    }
  }

  return counts;
}

function countOpenMelds(melds: readonly string[]): number {
  let count = 0;

  for (const meld of melds) {
    const [kind] = meld.trim().toLowerCase().split(/\s+/);
    if (kind === "chow" || kind === "pung" || kind === "kong") {
      count += 1;
    }
  }

  return count;
}

function standardProgress(counts: readonly number[], openMeldCount: number): HandProgress {
  const working = [...counts];
  const best = { shanten: 8 };
  searchStandard(working, openMeldCount, 0, false, best);
  return { shanten: best.shanten, kind: "standard" };
}

function searchStandard(counts: number[], groups: number, incompleteGroups: number, hasPair: boolean, best: { shanten: number }) {
  const index = counts.findIndex((count) => count > 0);

  if (index === -1) {
    const cappedGroups = Math.min(groups, 4);
    const cappedIncomplete = Math.min(incompleteGroups, Math.max(0, 4 - cappedGroups));
    best.shanten = Math.min(best.shanten, 8 - cappedGroups * 2 - cappedIncomplete - (hasPair ? 1 : 0));
    return;
  }

  if (counts[index] >= 3) {
    counts[index] -= 3;
    searchStandard(counts, groups + 1, incompleteGroups, hasPair, best);
    counts[index] += 3;
  }

  if (canSequence(counts, index)) {
    removeTiles(counts, [index, index + 1, index + 2]);
    searchStandard(counts, groups + 1, incompleteGroups, hasPair, best);
    addTiles(counts, [index, index + 1, index + 2]);
  }

  if (counts[index] >= 2) {
    counts[index] -= 2;
    if (!hasPair) {
      searchStandard(counts, groups, incompleteGroups, true, best);
    }
    searchStandard(counts, groups, incompleteGroups + 1, hasPair, best);
    counts[index] += 2;
  }

  if (canAdjacentWait(counts, index)) {
    removeTiles(counts, [index, index + 1]);
    searchStandard(counts, groups, incompleteGroups + 1, hasPair, best);
    addTiles(counts, [index, index + 1]);
  }

  if (canClosedWait(counts, index)) {
    removeTiles(counts, [index, index + 2]);
    searchStandard(counts, groups, incompleteGroups + 1, hasPair, best);
    addTiles(counts, [index, index + 2]);
  }

  counts[index] -= 1;
  searchStandard(counts, groups, incompleteGroups, hasPair, best);
  counts[index] += 1;
}

function sevenPairsProgress(counts: readonly number[]): HandProgress {
  const pairs = counts.filter((count) => count >= 2).length;
  const uniqueTiles = counts.filter((count) => count > 0).length;
  return { shanten: 6 - pairs + Math.max(0, 7 - uniqueTiles), kind: "seven-pairs" };
}

function thirteenOrphansProgress(counts: readonly number[]): HandProgress {
  let uniqueTerminalsHonors = 0;
  let hasPair = false;

  for (const tile of terminalHonorCodes) {
    const index = tileIndex.get(tile);
    if (index === undefined) {
      continue;
    }
    if (counts[index] > 0) {
      uniqueTerminalsHonors += 1;
    }
    if (counts[index] > 1) {
      hasPair = true;
    }
  }

  return { shanten: 13 - uniqueTerminalsHonors - (hasPair ? 1 : 0), kind: "thirteen-orphans" };
}

function canSequence(counts: readonly number[], index: number): boolean {
  return isSuitIndex(index) && rank(index) <= 6 && counts[index + 1] > 0 && counts[index + 2] > 0;
}

function canAdjacentWait(counts: readonly number[], index: number): boolean {
  return isSuitIndex(index) && rank(index) <= 7 && counts[index + 1] > 0;
}

function canClosedWait(counts: readonly number[], index: number): boolean {
  return isSuitIndex(index) && rank(index) <= 6 && counts[index + 2] > 0;
}

function isSuitIndex(index: number): boolean {
  return index >= 0 && index < 27;
}

function rank(index: number): number {
  return index % 9;
}

function removeTiles(counts: number[], indexes: readonly number[]) {
  for (const index of indexes) {
    counts[index] -= 1;
  }
}

function addTiles(counts: number[], indexes: readonly number[]) {
  for (const index of indexes) {
    counts[index] += 1;
  }
}

function kindRank(kind: HandProgressKind): number {
  return kind === "standard" ? 0 : kind === "seven-pairs" ? 1 : 2;
}
