import { describe, expect, it } from "vitest";
import {
  OLD_HONG_KONG_TABLE_PRESETS,
  evaluateWinningHand,
  oldHongKongTableSettings,
  scoreOldHongKongFan,
  settleOldHongKong,
} from "./scoring";

describe("scoring", () => {
  it("identifies a standard four-melds-and-a-pair winning hand", () => {
    const result = evaluateWinningHand(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dr", "we", "we"]);

    expect(result).toEqual({ isWin: true, pattern: "standard" });
  });

  it("identifies seven pairs as its own winning pattern", () => {
    const result = evaluateWinningHand(["m1", "m1", "m2", "m2", "m3", "m3", "p4", "p4", "p5", "p5", "s6", "s6", "dr", "dr"]);

    expect(result).toEqual({ isWin: true, pattern: "seven-pairs" });
  });

  it("rejects incomplete hands and hands with bonus tiles", () => {
    expect(evaluateWinningHand(["m1", "m2", "m3", "dr", "dr"]).isWin).toBe(false);
    expect(
      evaluateWinningHand(["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dr", "we", "f1"]),
    ).toEqual({ isWin: false, pattern: null });
  });

  it("scores self draw, all pungs, and dragon pung fan lines", () => {
    const result = scoreOldHongKongFan({
      codes: ["m1", "m1", "m1", "p2", "p2", "p2", "s3", "s3", "s3", "dr", "dr", "dr", "we", "we"],
      selfDraw: true,
    });

    expect(result.pattern).toBe("standard");
    expect(result.fanLines).toEqual([
      { id: "self-draw", nameKey: "fan.selfDraw", fan: 1 },
      { id: "no-bonus", nameKey: "fan.noBonus", fan: 1 },
      { id: "all-pungs", nameKey: "fan.allPungs", fan: 3 },
      { id: "dragon-pung", nameKey: "fan.dragonPung", fan: 1 },
    ]);
    expect(result.totalFan).toBe(6);
  });

  it("scores seven pairs fan separately from all pungs", () => {
    const result = scoreOldHongKongFan({
      codes: ["m1", "m1", "m2", "m2", "m3", "m3", "p4", "p4", "p5", "p5", "s6", "s6", "dr", "dr"],
      selfDraw: true,
    });

    expect(result.pattern).toBe("seven-pairs");
    expect(result.fanLines).toEqual([
      { id: "self-draw", nameKey: "fan.selfDraw", fan: 1 },
      { id: "no-bonus", nameKey: "fan.noBonus", fan: 1 },
      { id: "seven-pairs", nameKey: "fan.sevenPairs", fan: 4 },
    ]);
    expect(result.totalFan).toBe(6);
  });

  it("scores bonus flowers and seasons without counting them inside the winning hand", () => {
    const result = scoreOldHongKongFan({
      codes: ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dr", "we", "we"],
      flowerCount: 2,
      seasonCount: 1,
    });

    expect(result.fanLines).toEqual([
      { id: "dragon-pung", nameKey: "fan.dragonPung", fan: 1 },
      { id: "flowers", nameKey: "fan.flowers", fan: 2 },
      { id: "seasons", nameKey: "fan.seasons", fan: 1 },
    ]);
    expect(result.totalFan).toBe(4);
  });

  it("scores seat wind and round wind pungs", () => {
    const result = scoreOldHongKongFan({
      codes: ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "we", "we", "we", "dr", "dr"],
      seatWind: "we",
      roundWind: "we",
    });

    expect(result.fanLines).toContainEqual({ id: "seat-wind", nameKey: "fan.seatWind", fan: 1 });
    expect(result.fanLines).toContainEqual({ id: "round-wind", nameKey: "fan.roundWind", fan: 1 });
    expect(result.totalFan).toBe(3);
  });

  it("scores robbing a kong win context", () => {
    const result = scoreOldHongKongFan({
      codes: ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dr", "we", "we"],
      winContext: "rob-kong",
    });

    expect(result.fanLines).toContainEqual({ id: "rob-kong", nameKey: "fan.robKong", fan: 1 });
    expect(result.totalFan).toBe(3);
  });

  it("treats winContext self-draw as the same scoring signal as selfDraw", () => {
    const result = scoreOldHongKongFan({
      codes: ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dr", "dr", "we", "we"],
      winContext: "self-draw",
    });

    expect(result.fanLines).toContainEqual({ id: "self-draw", nameKey: "fan.selfDraw", fan: 1 });
    expect(result.totalFan).toBe(3);
  });

  it("scores an open hand by combining concealed tiles with declared melds", () => {
    const result = scoreOldHongKongFan({
      codes: ["p1", "p2", "p3", "s7", "s7"],
      melds: ["chow m1 m2 m3", "pung dr", "kong s9"],
    });

    expect(result.isWin).toBe(true);
    expect(result.pattern).toBe("standard");
    expect(result.fanLines).toContainEqual({ id: "dragon-pung", nameKey: "fan.dragonPung", fan: 1 });
  });

  it("scores all chows and flush patterns with full flush excluding half flush", () => {
    const allChows = scoreOldHongKongFan({
      codes: ["m1", "m2", "m3", "m2", "m3", "m4", "p3", "p4", "p5", "s6", "s7", "s8", "dr", "dr"],
    });
    expect(allChows.fanLines).toContainEqual({ id: "all-chows", nameKey: "fan.allChows", fan: 1 });

    const halfFlush = scoreOldHongKongFan({
      codes: ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "dr", "dr", "dr", "we", "we"],
    });
    expect(halfFlush.fanLines).toContainEqual({ id: "half-flush", nameKey: "fan.halfFlush", fan: 3 });

    const fullFlush = scoreOldHongKongFan({
      codes: ["m1", "m2", "m3", "m2", "m3", "m4", "m4", "m5", "m6", "m6", "m7", "m8", "m9", "m9"],
    });
    expect(fullFlush.fanLines).toContainEqual({ id: "full-flush", nameKey: "fan.fullFlush", fan: 7 });
    expect(fullFlush.fanLines).not.toContainEqual({ id: "half-flush", nameKey: "fan.halfFlush", fan: 3 });
  });

  it("scores dragon, wind, honor, kong, and thirteen-orphans limit-style patterns", () => {
    const smallDragons = scoreOldHongKongFan({
      codes: ["m1", "m2", "m3", "dr", "dr", "dr", "dg", "dg", "dg", "dw", "dw", "p1", "p2", "p3"],
    });
    expect(smallDragons.fanLines).toContainEqual({ id: "small-three-dragons", nameKey: "fan.smallThreeDragons", fan: 5 });

    const greatWinds = scoreOldHongKongFan({
      codes: ["we", "we", "we", "ws", "ws", "ws", "ww", "ww", "ww", "wn", "wn", "wn", "dr", "dr"],
    });
    expect(greatWinds.fanLines).toContainEqual({ id: "great-four-winds", nameKey: "fan.greatFourWinds", fan: 10 });
    expect(greatWinds.fanLines).toContainEqual({ id: "all-honors", nameKey: "fan.allHonors", fan: 10 });

    const allKongs = scoreOldHongKongFan({
      codes: ["dr", "dr"],
      melds: ["kong m1", "kong p2", "kong s3", "kong we"],
    });
    expect(allKongs.fanLines).toContainEqual({ id: "all-kongs", nameKey: "fan.allKongs", fan: 16 });

    const orphans = scoreOldHongKongFan({
      codes: ["m1", "m9", "p1", "p9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw", "dw"],
    });
    expect(orphans.pattern).toBe("thirteen-orphans");
    expect(orphans.fanLines).toContainEqual({ id: "thirteen-orphans", nameKey: "fan.thirteenOrphans", fan: 16 });
  });

  it("scores terminal-only and terminal-honor hands as explicit Old Hong Kong edge cases", () => {
    const allTerminals = scoreOldHongKongFan({
      codes: ["m1", "m1"],
      melds: ["pung m9", "pung p1", "pung p9", "kong s1"],
    });

    expect(allTerminals.fanLines).toContainEqual({ id: "all-terminals", nameKey: "fan.allTerminals", fan: 10 });

    const terminalsAndHonors = scoreOldHongKongFan({
      codes: ["m1", "m1", "m1", "m9", "m9", "m9", "p1", "p1", "p1", "dr", "dr", "dr", "we", "we"],
    });

    expect(terminalsAndHonors.fanLines).toContainEqual({
      id: "terminals-honors",
      nameKey: "fan.terminalsHonors",
      fan: 1,
    });
    expect(terminalsAndHonors.fanLines).not.toContainEqual({
      id: "all-terminals",
      nameKey: "fan.allTerminals",
      fan: 10,
    });
  });

  it("provides table-tier settlement presets for base units and high-tier caps", () => {
    expect(OLD_HONG_KONG_TABLE_PRESETS.bamboo).toEqual({ baseUnit: 100, fanCap: 16 });
    expect(OLD_HONG_KONG_TABLE_PRESETS.jade).toEqual({ baseUnit: 1000, fanCap: 16 });
    expect(OLD_HONG_KONG_TABLE_PRESETS.dragon).toEqual({ baseUnit: 10000, fanCap: 32 });
    expect(OLD_HONG_KONG_TABLE_PRESETS.phoenix).toEqual({ baseUnit: 100000, fanCap: 32 });

    expect(oldHongKongTableSettings("dragon")).toEqual({ baseUnit: 10000, fanCap: 32 });
  });

  it("settles Dragon and Phoenix tables with the 32x cap", () => {
    const dragon = settleOldHongKong({
      totalFan: 9,
      winnerSeat: 0,
      context: "discard",
      payerSeat: 2,
      settings: oldHongKongTableSettings("dragon"),
    });
    expect(dragon.multiplier).toBe(32);
    expect(dragon.handValue).toBe(320000);
    expect(dragon.deltas).toEqual([320000, 0, -320000, 0]);

    const phoenix = settleOldHongKong({
      totalFan: 9,
      winnerSeat: 1,
      context: "self-draw",
      settings: oldHongKongTableSettings("phoenix"),
    });
    expect(phoenix.multiplier).toBe(32);
    expect(phoenix.handValue).toBe(3200000);
    expect(phoenix.deltas).toEqual([-3200000, 9600000, -3200000, -3200000]);
  });
});