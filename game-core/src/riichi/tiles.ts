export type RiichiSuit = "m" | "p" | "s";
export type RiichiHonor = "we" | "ws" | "ww" | "wn" | "dr" | "dg" | "dw";
export type RiichiTile =
  | `${RiichiSuit}1`
  | `${RiichiSuit}2`
  | `${RiichiSuit}3`
  | `${RiichiSuit}4`
  | `${RiichiSuit}5`
  | `${RiichiSuit}6`
  | `${RiichiSuit}7`
  | `${RiichiSuit}8`
  | `${RiichiSuit}9`
  | RiichiHonor;

const suits = ["m", "p", "s"] as const;
const honors = ["we", "ws", "ww", "wn", "dr", "dg", "dw"] as const;

export const riichiTileCodes: readonly RiichiTile[] = [
  ...suits.flatMap((suit) => Array.from({ length: 9 }, (_, index) => `${suit}${index + 1}` as RiichiTile)),
  ...honors,
];

const riichiTileSet = new Set<string>(riichiTileCodes);

const honorDora: Record<RiichiHonor, RiichiHonor> = {
  we: "ws",
  ws: "ww",
  ww: "wn",
  wn: "we",
  dg: "dr",
  dr: "dw",
  dw: "dg",
};

export function buildRiichiWall(): RiichiTile[] {
  return riichiTileCodes.flatMap((tile) => [tile, tile, tile, tile]);
}

export function isRiichiTile(tile: string): tile is RiichiTile {
  return riichiTileSet.has(tile);
}

export function assertRiichiTile(tile: string): asserts tile is RiichiTile {
  if (!isRiichiTile(tile)) {
    throw new Error(`Invalid Riichi tile: ${tile}`);
  }
}

export function doraForIndicator(indicator: RiichiTile): RiichiTile {
  if (indicator.length === 2 && (indicator[0] === "m" || indicator[0] === "p" || indicator[0] === "s")) {
    const suit = indicator[0] as RiichiSuit;
    const nextRank = indicator[1] === "9" ? 1 : Number(indicator[1]) + 1;
    return `${suit}${nextRank}` as RiichiTile;
  }

  return honorDora[indicator as RiichiHonor];
}
