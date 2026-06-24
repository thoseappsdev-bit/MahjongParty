import { evaluateHandProgress } from "../hand-progress";
import { assertRiichiTile, riichiTileCodes, type RiichiTile } from "./tiles";
import type { RiichiFuriten, RiichiMeld, RiichiPlayerState } from "./types";

export function winningTiles(hand: readonly RiichiTile[], melds: readonly RiichiMeld[] = []): RiichiTile[] {
  validateTiles(hand);
  for (const meld of melds) {
    validateTiles(meld.tiles);
  }

  const heldCounts = countTiles(hand, melds);

  return riichiTileCodes.filter((candidate) => {
    if ((heldCounts.get(candidate) ?? 0) >= 4) {
      return false;
    }

    const completedHand = [...hand, candidate];
    return evaluateHandProgress(completedHand, meldsForProgress(melds)).shanten < 0;
  });
}

export function isTenpai(hand: readonly RiichiTile[], melds: readonly RiichiMeld[] = []): boolean {
  return winningTiles(hand, melds).length > 0;
}

export function furitenState(player: RiichiPlayerState, waits: readonly RiichiTile[]): RiichiFuriten {
  if (player.furiten === "riichi") {
    return "riichi";
  }

  const waitSet = new Set(waits);
  if (player.discards.some((discard) => waitSet.has(discard))) {
    return "discard";
  }

  if (player.furiten === "temporary") {
    return "temporary";
  }

  return "none";
}

export function canRon(player: RiichiPlayerState, waits: readonly RiichiTile[]): boolean {
  return waits.length > 0 && furitenState(player, waits) === "none";
}

export function canTsumo(_player: RiichiPlayerState, waits: readonly RiichiTile[]): boolean {
  return waits.length > 0;
}

export function clearTemporaryFuritenOnDraw(player: RiichiPlayerState): RiichiPlayerState {
  if (player.furiten !== "temporary") {
    return player;
  }

  return { ...player, furiten: "none" };
}

function validateTiles(tiles: readonly string[]) {
  for (const tile of tiles) {
    assertRiichiTile(tile);
  }
}

function countTiles(hand: readonly RiichiTile[], melds: readonly RiichiMeld[]): Map<RiichiTile, number> {
  const counts = new Map<RiichiTile, number>();

  for (const tile of hand) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }

  for (const meld of melds) {
    for (const tile of meld.tiles) {
      counts.set(tile, (counts.get(tile) ?? 0) + 1);
    }
  }

  return counts;
}

function meldsForProgress(melds: readonly RiichiMeld[]): string[] {
  return melds.map((meld) => `${meld.kind} ${meld.tiles.join(" ")}`);
}
