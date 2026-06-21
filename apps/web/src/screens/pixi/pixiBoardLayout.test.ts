import { describe, expect, it } from "vitest";
import type { MatchView, Seat } from "@mahjong/shared-types";
import { buildPixiBoardLayout } from "./pixiBoardLayout";

describe("pixi board layout", () => {
  it("keeps every desktop hand inside the playable felt", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });

    expect(layout.mode).toBe("desktop");
    expect(layout.table.x).toBeGreaterThanOrEqual(layout.viewport.width * 0.1);
    expect(layout.table.y).toBeGreaterThanOrEqual(layout.viewport.height * 0.1);
    for (const seat of layout.seats) {
      for (const tile of seat.concealedTiles) {
        expect(tile.x).toBeGreaterThanOrEqual(layout.table.x);
        expect(tile.y).toBeGreaterThanOrEqual(layout.table.y);
        expect(tile.x + tile.width).toBeLessThanOrEqual(layout.table.x + layout.table.width);
        expect(tile.y + tile.height).toBeLessThanOrEqual(layout.table.y + layout.table.height);
      }
    }
  });

  it("uses upright side tiles and rotated side nameplates", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });

    expect(layout.seats[1].concealedTiles.every((tile) => tile.rotation === 0)).toBe(true);
    expect(layout.seats[3].concealedTiles.every((tile) => tile.rotation === 0)).toBe(true);
    expect(layout.seats[1].label.rotation).toBe(-90);
    expect(layout.seats[3].label.rotation).toBe(90);
  });

  it("places every desktop nameplate on the center-facing side of its tiles", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });
    const topHand = layout.seats[2].concealedTiles;
    const localHand = layout.localHand;
    const leftHand = layout.seats[1].concealedTiles;
    const rightHand = layout.seats[3].concealedTiles;

    expect(layout.seats[2].label.y).toBeGreaterThanOrEqual(layout.table.y);
    expect(layout.seats[2].label.y).toBeGreaterThan(topHand[0].y + topHand[0].height);
    expect(layout.seats[1].label.x + layout.seats[1].label.width / 2 - layout.seats[1].label.height / 2)
      .toBeGreaterThan(leftHand[0].x + leftHand[0].width);
    expect(layout.seats[3].label.x + layout.seats[3].label.width / 2 + layout.seats[3].label.height / 2)
      .toBeLessThan(rightHand[0].x);
    expect(layout.seats[0].label.y).toBeGreaterThan(layout.discardArea.y + layout.discardArea.height);
    expect(layout.seats[0].label.y + layout.seats[0].label.height).toBeLessThan(localHand[0].y);
  });

  it("moves the desktop top rail near the table border to leave more felt for play", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });
    const topHand = layout.seats[2].concealedTiles;

    expect(topHand[0].y).toBeLessThanOrEqual(layout.table.y + 30);
    expect(layout.seats[2].label.y).toBeLessThan(layout.discardArea.y);
  });

  it("uses a compact desktop discard frame without excessive side space", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });

    expect(layout.discardArea.width).toBeGreaterThanOrEqual(layout.table.width * 0.6);
    expect(layout.discardArea.width).toBeLessThanOrEqual(layout.table.width * 0.66);
    expect(layout.discardArea.x).toBeCloseTo(layout.table.x + layout.table.width * 0.18, 4);
  });

  it("makes a normal discard row fill most of the center frame", () => {
    const populatedView = view();
    populatedView.players = populatedView.players.map((player, seat) => ({
      ...player,
      discards: seat === 0 ? ["m1", "m2", "m3", "m4", "p1", "p2", "s1", "s2"] : [],
    })) as MatchView["players"];
    const layout = buildPixiBoardLayout(populatedView, { width: 1180, height: 640 });
    const discards = layout.seats[0].discardTiles;
    const gridWidth = Math.max(...discards.map((tile) => tile.x + tile.width)) - Math.min(...discards.map((tile) => tile.x));

    expect(discards[0].width).toBeGreaterThanOrEqual(56);
    expect(gridWidth).toBeGreaterThanOrEqual(layout.discardArea.width * 0.78);
  });
  it("uses readable desktop nameplates proportional to the tile rails", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });

    for (const seat of layout.seats) {
      expect(seat.label.width).toBeGreaterThanOrEqual(150);
      expect(seat.label.height).toBeGreaterThanOrEqual(44);
    }
  });

  it("uses larger desktop hand and opponent tiles", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });

    expect(layout.localHand[0].width).toBeGreaterThanOrEqual(51);
    expect(layout.seats[2].concealedTiles[0].width).toBeGreaterThanOrEqual(34);
  });

  it("centers and enlarges a sparse discard pile", () => {
    const sparseView = view();
    sparseView.players = sparseView.players.map((player, seat) => ({
      ...player,
      discards: seat === 0 ? ["m1"] : [],
    })) as MatchView["players"];
    const layout = buildPixiBoardLayout(sparseView, { width: 1180, height: 640 });
    const tile = layout.seats[0].discardTiles[0];

    expect(tile.width).toBeGreaterThanOrEqual(56);
    expect(tile.x + tile.width / 2).toBeCloseTo(layout.discardArea.x + layout.discardArea.width / 2, 4);
  });

  it("keeps full discard piles readable by overflowing into a scrollable center zone", () => {
    const denseView = view();
    denseView.players = denseView.players.map((player) => ({
      ...player,
      discards: Array.from({ length: 20 }, (_, index) => `m${(index % 9) + 1}`),
    })) as MatchView["players"];
    const layout = buildPixiBoardLayout(denseView, { width: 1180, height: 640 });
    const discards = layout.seats.flatMap((seat) => seat.discardTiles);

    expect(layout.discardScrollMax).toBeGreaterThan(0);
    expect(Math.min(...discards.map((tile) => tile.width))).toBeGreaterThanOrEqual(52);
    expect(Math.max(...discards.map((tile) => tile.y + tile.height)))
      .toBeGreaterThan(layout.discardArea.y + layout.discardArea.height);
  });
  it("sizes meld pills to contain the complete displayed label", () => {
    const meldView = view();
    meldView.players = meldView.players.map((player, seat) => ({
      ...player,
      melds: seat === 0 ? ["pung dr", "chow s4 s5 s6"] : player.melds,
    })) as MatchView["players"];
    const layout = buildPixiBoardLayout(meldView, { width: 1180, height: 640 });
    const [pung, chow] = layout.seats[0].meldBadges;

    expect(chow.width).toBeGreaterThan(pung.width);
    expect(chow.width).toBeGreaterThanOrEqual(94);
    expect(chow.x + chow.width).toBeLessThanOrEqual(layout.viewport.width);
  });
  it("gives every discarded tile a unique position in the shared center grid", () => {
    const populatedView = view();
    populatedView.players = populatedView.players.map((player, seat) => ({
      ...player,
      discards: ["m1", "m2", "m3"].slice(0, seat + 1),
    })) as MatchView["players"];
    const layout = buildPixiBoardLayout(populatedView, { width: 1180, height: 640 });
    const discards = layout.seats.flatMap((seat) => seat.discardTiles);
    const positions = new Set(discards.map((tile) => `${tile.x}:${tile.y}`));

    expect(positions.size).toBe(discards.length);
  });

  it("keeps local hand below the discard area on desktop", () => {
    const layout = buildPixiBoardLayout(view(), { width: 1180, height: 640 });
    const handTop = Math.min(...layout.localHand.map((tile) => tile.y));

    expect(handTop).toBeGreaterThan(layout.discardArea.y + layout.discardArea.height);
  });

  it("uses compressed rails on mobile", () => {
    const layout = buildPixiBoardLayout(view(), { width: 390, height: 680 });

    expect(layout.mode).toBe("mobile");
    expect(layout.seats[1].concealedTiles.length).toBeLessThanOrEqual(8);
    expect(layout.localHand.every((tile) => tile.width >= 31)).toBe(true);
    expect(layout.seats[2].concealedTiles[0].y).toBeGreaterThanOrEqual(80);
    expect(layout.seats[2].label.y).toBeGreaterThanOrEqual(0);
    for (const seat of [layout.seats[1], layout.seats[3]]) {
      const visualLeft = seat.label.x + seat.label.width / 2 - seat.label.height / 2;
      const visualRight = seat.label.x + seat.label.width / 2 + seat.label.height / 2;
      const visualTop = seat.label.y + seat.label.height / 2 - seat.label.width / 2;
      expect(visualLeft).toBeGreaterThanOrEqual(0);
      expect(visualRight).toBeLessThanOrEqual(layout.viewport.width);
      expect(visualTop).toBeCloseTo(seat.concealedTiles[0].y, 4);
    }
  });
});

function view(): MatchView {
  return {
    handNumber: 1,
    mode: "3-fan",
    tableType: "friendly",
    turnSeat: 3,
    mySeat: 0,
    timerSeconds: 25,
    wallCount: 64,
    claimPrompt: null,
    legalActions: ["discard"],
    myHand: ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "we", "ws", "dr", "dw"],
    players: [player(0), player(1), player(2), player(3)] as MatchView["players"],
    recentEvent: "Your turn.",
  };
}

function player(seat: Seat): MatchView["players"][number] {
  return {
    seat,
    name: ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"][seat],
    avatar: ["L", "B", "C", "D"][seat],
    wind: ["E", "S", "W", "N"][seat] as "E" | "S" | "W" | "N",
    isBot: seat !== 0,
    handCount: 13,
    melds: seat === 3 ? ["pung dr"] : [],
    discards: seat === 0 ? ["m4", "m5"] : [],
    coinsDelta: 0,
    connected: true,
  };
}












