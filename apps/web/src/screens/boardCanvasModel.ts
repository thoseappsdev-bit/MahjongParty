import type { MatchView, Seat } from "@mahjong/shared-types";

export interface BoardCanvasSize {
  width: number;
  height: number;
}

export interface BoardCanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardCanvasDiscard {
  code: string;
  seat: Seat;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoardCanvasSeatHighlight {
  seat: Seat;
  active: boolean;
  rect: BoardCanvasRect;
}

export interface BoardCanvasModel {
  size: BoardCanvasSize;
  center: BoardCanvasRect;
  discards: BoardCanvasDiscard[];
  seatHighlights: BoardCanvasSeatHighlight[];
  turnSeat: Seat;
}

const discardColumns = 10;

export function buildBoardCanvasModel(view: MatchView, size: BoardCanvasSize): BoardCanvasModel {
  const width = Math.max(1, size.width);
  const height = Math.max(1, size.height);
  const center = {
    x: width * 0.28,
    y: height * 0.3,
    width: width * 0.44,
    height: height * 0.4,
  };
  const tileWidth = Math.max(18, Math.min(34, center.width / 12));
  const tileHeight = tileWidth * 1.34;
  const gap = Math.max(3, tileWidth * 0.14);

  const discards = view.players.flatMap((player) =>
    player.discards.map((code) => ({ code, seat: player.seat })),
  );
  const pileWidth = discardColumns * tileWidth + (discardColumns - 1) * gap;
  const pileX = center.x + Math.max(0, (center.width - pileWidth) / 2);
  const pileY = center.y + center.height * 0.25;

  return {
    size: { width, height },
    center,
    discards: discards.map((tile, index) => ({
      ...tile,
      x: pileX + (index % discardColumns) * (tileWidth + gap),
      y: pileY + Math.floor(index / discardColumns) * (tileHeight + gap),
      width: tileWidth,
      height: tileHeight,
    })),
    seatHighlights: [
      { seat: 0, active: view.turnSeat === 0, rect: { x: width * 0.18, y: height * 0.79, width: width * 0.64, height: height * 0.13 } },
      { seat: 1, active: view.turnSeat === 1, rect: { x: width * 0.02, y: height * 0.28, width: width * 0.15, height: height * 0.45 } },
      { seat: 2, active: view.turnSeat === 2, rect: { x: width * 0.31, y: height * 0.04, width: width * 0.38, height: height * 0.14 } },
      { seat: 3, active: view.turnSeat === 3, rect: { x: width * 0.83, y: height * 0.28, width: width * 0.15, height: height * 0.45 } },
    ],
    turnSeat: view.turnSeat,
  };
}
