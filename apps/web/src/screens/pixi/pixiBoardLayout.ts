import type { MatchView, Seat } from "@mahjong/shared-types";

export type PixiBoardMode = "desktop" | "mobile";

export interface PixiViewport {
  width: number;
  height: number;
}

export interface PixiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixiBoardTile extends PixiRect {
  seat: Seat;
  index: number;
  code: string | null;
  rotation: number;
}

export interface PixiBoardLabel extends PixiRect {
  seat: Seat;
  text: string;
  wind: MatchView["players"][number]["wind"];
  active: boolean;
  rotation: number;
}

export interface PixiBoardMeldBadge extends PixiRect {
  seat: Seat;
  index: number;
  text: string;
}

export interface PixiBoardSeatLayout {
  seat: Seat;
  label: PixiBoardLabel;
  concealedTiles: PixiBoardTile[];
  meldBadges: PixiBoardMeldBadge[];
  discardTiles: PixiBoardTile[];
}

export interface PixiBoardLayout {
  mode: PixiBoardMode;
  viewport: PixiViewport;
  table: PixiRect;
  discardArea: PixiRect;
  discardScrollMax: number;
  localHand: PixiBoardTile[];
  seats: [PixiBoardSeatLayout, PixiBoardSeatLayout, PixiBoardSeatLayout, PixiBoardSeatLayout];
}

const seats: Seat[] = [0, 1, 2, 3];

export function buildPixiBoardLayout(
  view: MatchView,
  viewport: { width: number; height: number },
): PixiBoardLayout {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const mode: PixiBoardMode = width < 720 || height < 520 ? "mobile" : "desktop";
  const table =
    mode === "desktop"
      ? rect(width * 0.11, height * 0.115, width * 0.78, height * 0.77)
      : rect(10, 10, width - 20, height - 20);
  const discardArea =
    mode === "desktop"
      ? rect(
          table.x + table.width * 0.18,
          table.y + table.height * 0.3,
          table.width * 0.64,
          table.height * 0.4,
        )
      : rect(width * 0.16, height * 0.28, width * 0.68, height * 0.25);
  const localHand = buildLocalHand(view, width, height, table, mode);
  const totalDiscardCount = view.players.reduce((total, player) => total + player.discards.length, 0);
  const discardScrollMax = buildDiscardGridMetrics(discardArea, totalDiscardCount, mode).scrollMax;
  let discardOffset = 0;
  const layouts = seats.map((seat) => {
    const player = view.players.find((candidate) => candidate.seat === seat) ?? view.players[seat];
    const seatDiscardOffset = discardOffset;
    discardOffset += player.discards.length;
    return buildSeatLayout(view, seat, width, height, table, discardArea, localHand, seatDiscardOffset, totalDiscardCount, mode);
  }) as PixiBoardLayout["seats"];

  return {
    mode,
    viewport: { width, height },
    table,
    discardArea,
    discardScrollMax,
    localHand,
    seats: layouts,
  };
}

function buildSeatLayout(
  view: MatchView,
  seat: Seat,
  width: number,
  height: number,
  table: PixiRect,
  discardArea: PixiRect,
  localHand: PixiBoardTile[],
  discardOffset: number,
  totalDiscardCount: number,
  mode: PixiBoardMode,
): PixiBoardSeatLayout {
  const player = view.players.find((candidate) => candidate.seat === seat) ?? view.players[seat];
  const concealedTiles =
    seat === view.mySeat ? localHand : buildOpponentTiles(seat, player.handCount, width, height, table, mode);
  const label = buildLabel(view, seat, width, table, concealedTiles, mode);

  return {
    seat,
    label,
    concealedTiles,
    meldBadges: buildMeldBadges(seat, player.melds, width, height, table, mode),
    discardTiles: buildDiscardTiles(seat, player.discards, discardArea, discardOffset, totalDiscardCount, mode),
  };
}

function buildLocalHand(
  view: MatchView,
  width: number,
  height: number,
  table: PixiRect,
  mode: PixiBoardMode,
): PixiBoardTile[] {
  const tileWidth = mode === "desktop" ? clamp(width / 22.5, 44, 58) : clamp(width / 10.5, 31, 40);
  const tileHeight = tileWidth * 1.36;
  const gap = mode === "desktop" ? 6 : 3;
  const y =
    mode === "desktop"
      ? table.y + table.height - tileHeight - 12
      : height - tileHeight - 14;
  const horizontalInset = mode === "desktop" ? 58 : 16;

  return buildHorizontalTiles(view.myHand.length, {
    seat: view.mySeat,
    codes: view.myHand,
    x: mode === "desktop" ? table.x + horizontalInset : horizontalInset,
    y,
    availableWidth: mode === "desktop" ? table.width - horizontalInset * 2 : width - horizontalInset * 2,
    tileWidth,
    tileHeight,
    gap,
    rotation: 0,
  });
}

function buildOpponentTiles(
  seat: Seat,
  handCount: number,
  width: number,
  height: number,
  table: PixiRect,
  mode: PixiBoardMode,
): PixiBoardTile[] {
  const count = mode === "mobile" ? Math.min(handCount, 8) : handCount;
  const tileWidth = mode === "desktop" ? 34 : 24;
  const tileHeight = tileWidth * 1.36;
  const gap = mode === "desktop" ? 3 : 3;

  if (seat === 1 || seat === 3) {
    const sideInset = mode === "desktop" ? 24 : 22;
    return buildVerticalTiles(count, {
      seat,
      x:
        seat === 1
          ? mode === "desktop" ? table.x + sideInset : 32
          : mode === "desktop" ? table.x + table.width - sideInset - tileWidth : width - 56,
      y: mode === "desktop" ? table.y + 104 : height * 0.33,
      availableHeight: mode === "desktop" ? table.height - 208 : height * 0.3,
      tileWidth,
      tileHeight,
      gap,
      rotation: 0,
    });
  }

  return buildHorizontalTiles(count, {
    seat,
    codes: [],
    x: mode === "desktop" ? table.x + table.width * 0.2 : width * 0.24,
    y: mode === "desktop" ? table.y + 24 : 90,
    availableWidth: mode === "desktop" ? table.width * 0.6 : width * 0.52,
    tileWidth,
    tileHeight,
    gap,
    rotation: 0,
  });
}
function buildLabel(
  view: MatchView,
  seat: Seat,
  width: number,
  table: PixiRect,
  concealedTiles: PixiBoardTile[],
  mode: PixiBoardMode,
): PixiBoardLabel {
  const player = view.players.find((candidate) => candidate.seat === seat) ?? view.players[seat];
  const labelWidth = mode === "desktop" ? 154 : 112;
  const labelHeight = mode === "desktop" ? 44 : 36;
  const active = view.turnSeat === seat;
  const firstTile = concealedTiles[0];
  const text = `${player.wind} ${player.name}`;

  if ((seat === 1 || seat === 3) && firstTile) {
    const railCenterY =
      mode === "desktop"
        ? (concealedTiles[0].y + concealedTiles.at(-1)!.y + concealedTiles.at(-1)!.height) / 2
        : concealedTiles[0].y + labelWidth / 2;
    const sideGap = mode === "desktop" ? 28 : 22;
    const labelCenterX =
      seat === 1
        ? firstTile.x + firstTile.width + sideGap
        : firstTile.x - sideGap;

    return {
      seat,
      text,
      wind: player.wind,
      active,
      rotation: seat === 1 ? -90 : 90,
      ...rect(
        labelCenterX - labelWidth / 2,
        railCenterY - labelHeight / 2,
        labelWidth,
        labelHeight,
      ),
    };
  }

  if (seat === 2 && firstTile) {
    return {
      seat,
      text,
      wind: player.wind,
      active,
      rotation: 0,
      ...rect(
        width / 2 - labelWidth / 2,
        firstTile.y + firstTile.height + 10,
        labelWidth,
        labelHeight,
      ),
    };
  }

  if (firstTile) {
    return {
      seat,
      text,
      wind: player.wind,
      active,
      rotation: 0,
      ...rect(
        width / 2 - labelWidth / 2,
        firstTile.y - labelHeight - 10,
        labelWidth,
        labelHeight,
      ),
    };
  }

  return {
    seat,
    text,
    wind: player.wind,
    active,
    rotation: 0,
    ...rect(width / 2 - labelWidth / 2, table.y + 10, labelWidth, labelHeight),
  };
}
function buildMeldBadges(
  seat: Seat,
  melds: string[],
  width: number,
  height: number,
  table: PixiRect,
  mode: PixiBoardMode,
): PixiBoardMeldBadge[] {
  const badgeHeight = 22;
  const gap = 5;
  const badgeWidths = melds.map((text) =>
    clamp(
      text.toUpperCase().length * (mode === "desktop" ? 6.2 : 5.2) + 18,
      mode === "desktop" ? 64 : 48,
      mode === "desktop" ? 124 : 104,
    ),
  );

  return melds.map((text, index) => {
    const badgeWidth = badgeWidths[index];
    const horizontalOffset = badgeWidths
      .slice(0, index)
      .reduce((offset, previousWidth) => offset + previousWidth + gap, 0);
    const base =
      mode === "desktop"
        ? seat === 1
          ? { x: table.x + 56, y: table.y + 54 + index * (badgeHeight + gap) }
          : seat === 3
            ? { x: table.x + table.width - badgeWidth - 56, y: table.y + 54 + index * (badgeHeight + gap) }
            : seat === 2
              ? { x: table.x + table.width * 0.62 + horizontalOffset, y: table.y + 10 }
              : { x: table.x + 64 + horizontalOffset, y: table.y + table.height - 28 }
        : seat === 1
          ? { x: 18, y: height * 0.2 + index * (badgeHeight + gap) }
          : seat === 3
            ? { x: width - badgeWidth - 18, y: height * 0.2 + index * (badgeHeight + gap) }
            : seat === 2
              ? { x: width * 0.62 + horizontalOffset, y: 56 }
              : { x: 18 + horizontalOffset, y: height - 82 };

    return {
      seat,
      index,
      text,
      ...rect(clamp(base.x, 0, width - badgeWidth), clamp(base.y, 0, height - badgeHeight), badgeWidth, badgeHeight),
    };
  });
}
interface PixiDiscardGridMetrics {
  columns: number;
  gap: number;
  tileWidth: number;
  tileHeight: number;
  startX: number;
  startY: number;
  scrollMax: number;
}

function buildDiscardGridMetrics(
  discardArea: PixiRect,
  totalCount: number,
  mode: PixiBoardMode,
): PixiDiscardGridMetrics {
  const gap = mode === "desktop" ? 4 : 2;
  const topPadding = mode === "desktop" ? 44 : 36;
  const bottomPadding = 10;
  const maxColumns = mode === "desktop" ? 10 : 6;
  const maxTileWidth = mode === "desktop" ? 58 : 26;
  const minReadableWidth = mode === "desktop" ? 52 : 22;
  const contentHeight = Math.max(1, discardArea.height - topPadding - bottomPadding);
  const safeTotal = Math.max(1, totalCount);
  const columns = Math.max(1, Math.min(maxColumns, safeTotal));
  const rows = Math.ceil(safeTotal / columns);
  const widthLimit = (discardArea.width - gap * (columns - 1)) / columns;
  const tileWidth = Math.max(1, Math.min(maxTileWidth, Math.max(Math.min(minReadableWidth, widthLimit), widthLimit)));
  const tileHeight = tileWidth * 1.36;
  const gridWidth = columns * tileWidth + (columns - 1) * gap;
  const gridHeight = rows * tileHeight + (rows - 1) * gap;
  const startX = discardArea.x + (discardArea.width - gridWidth) / 2;
  const startY = discardArea.y + topPadding + Math.max(0, (contentHeight - gridHeight) / 2);
  const scrollMax = Math.max(0, gridHeight - contentHeight);

  return { columns, gap, tileWidth, tileHeight, startX, startY, scrollMax };
}

function buildDiscardTiles(
  seat: Seat,
  discards: string[],
  discardArea: PixiRect,
  startIndex: number,
  totalCount: number,
  mode: PixiBoardMode,
): PixiBoardTile[] {
  const metrics = buildDiscardGridMetrics(discardArea, totalCount, mode);

  return discards.map((code, index) => {
    const gridIndex = startIndex + index;
    return {
      seat,
      index,
      code,
      rotation: 0,
      ...rect(
        metrics.startX + (gridIndex % metrics.columns) * (metrics.tileWidth + metrics.gap),
        metrics.startY + Math.floor(gridIndex / metrics.columns) * (metrics.tileHeight + metrics.gap),
        metrics.tileWidth,
        metrics.tileHeight,
      ),
    };
  });
}
function buildHorizontalTiles(
  count: number,
  options: {
    seat: Seat;
    codes: string[];
    x: number;
    y: number;
    availableWidth: number;
    tileWidth: number;
    tileHeight: number;
    gap: number;
    rotation: number;
  },
): PixiBoardTile[] {
  const stride = count <= 1 ? 0 : Math.min(options.tileWidth + options.gap, (options.availableWidth - options.tileWidth) / (count - 1));
  const totalWidth = count <= 1 ? options.tileWidth : options.tileWidth + stride * (count - 1);
  const startX = options.x + Math.max(0, (options.availableWidth - totalWidth) / 2);

  return Array.from({ length: count }, (_, index) => ({
    seat: options.seat,
    index,
    code: options.codes[index] ?? null,
    rotation: options.rotation,
    ...rect(startX + index * stride, options.y, options.tileWidth, options.tileHeight),
  }));
}

function buildVerticalTiles(
  count: number,
  options: {
    seat: Seat;
    x: number;
    y: number;
    availableHeight: number;
    tileWidth: number;
    tileHeight: number;
    gap: number;
    rotation: number;
  },
): PixiBoardTile[] {
  const stride = count <= 1 ? 0 : Math.min(options.tileHeight + options.gap, (options.availableHeight - options.tileHeight) / (count - 1));

  return Array.from({ length: count }, (_, index) => ({
    seat: options.seat,
    index,
    code: null,
    rotation: options.rotation,
    ...rect(options.x, options.y + index * stride, options.tileWidth, options.tileHeight),
  }));
}

function rect(x: number, y: number, width: number, height: number): PixiRect {
  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}


















