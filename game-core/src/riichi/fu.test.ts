import { describe, expect, it } from "vitest";
import { calculateRiichiFu } from "./index";

describe("Riichi fu", () => {
  it("uses WRC special fu for seven pairs and pinfu tsumo", () => {
    expect(calculateRiichiFu({
      hand: ["m1", "m1", "m2", "m2", "p3", "p3", "p4", "p4", "s5", "s5", "we", "we", "dr", "dr"],
      winningTile: "dr",
    })).toBe(25);

    expect(calculateRiichiFu({
      hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"],
      winningTile: "p2",
      winBy: "tsumo",
    })).toBe(20);
  });

  it("adds closed ron, wait, pair, and group fu then rounds up", () => {
    expect(calculateRiichiFu({
      hand: ["m1", "m2", "m3", "p1", "p2", "p3", "s7", "s8", "s9", "dr", "dr", "dr", "we", "we"],
      winningTile: "s8",
      winBy: "ron",
      seatWind: "we",
      roundWind: "we",
    })).toBe(50);
  });
});
