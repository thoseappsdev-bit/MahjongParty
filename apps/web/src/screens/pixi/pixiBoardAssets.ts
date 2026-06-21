import type { MatchView } from "@mahjong/shared-types";

export const pixiTableSkinPath = "/assets/table-skins/old-hk-openai-board.png";
export const pixiTileBackPath = "/assets/tiles/tile-back.svg";
export const pixiTileFrontPath = "/assets/tiles/tile-front.svg";

export function collectPixiBoardAssetPaths(view: MatchView): string[] {
  const paths = new Set<string>([pixiTableSkinPath, pixiTileBackPath, pixiTileFrontPath]);

  for (const tile of view.myHand) {
    addTile(paths, tile);
  }

  for (const player of view.players) {
    for (const tile of player.discards) {
      addTile(paths, tile);
    }

    for (const meld of player.melds) {
      for (const part of meld.split(" ").slice(1)) {
        addTile(paths, part);
      }
    }
  }

  return [...paths];
}

function addTile(paths: Set<string>, tile: string) {
  if (!tile) {
    return;
  }

  paths.add(`/assets/tiles/old-hk/${tile.toLowerCase()}.svg`);
}
