import { describe, expect, it } from "vitest";
import type { RiichiMeld, RiichiTile } from "./index";
import { detectRiichiYaku } from "./index";

const pung = (tiles: RiichiTile[], open = false): RiichiMeld => ({ kind: "pung", tiles, open });
const kong = (tiles: RiichiTile[], open = false): RiichiMeld => ({ kind: "kong", tiles, open });

describe("Riichi yaku detection", () => {
  it("detects common one-han context yaku and keeps dora separate", () => {
    const score = detectRiichiYaku({
      hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"],
      melds: [],
      winningTile: "p2",
      winBy: "tsumo",
      riichi: true,
      ippatsu: true,
      doraIndicators: ["m1"],
      uraDoraIndicators: ["p1"],
    });

    expect(score.map((line) => line.id)).toEqual(expect.arrayContaining(["riichi", "ippatsu", "menzen-tsumo", "pinfu", "tanyao"]));
    expect(score.find((line) => line.id === "dora")?.han).toBe(1);
    expect(score.find((line) => line.id === "ura-dora")?.han).toBe(2);
  });

  it("detects the planned WRC pattern families", () => {
    const cases: Array<[string, Parameters<typeof detectRiichiYaku>[0]]> = [
      ["double-riichi", { hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"], winningTile: "p2", doubleRiichi: true }],
      ["iipeikou", { hand: ["m1", "m2", "m3", "m1", "m2", "m3", "p4", "p5", "p6", "s4", "s5", "s6", "we", "we"], winningTile: "we" }],
      ["yakuhai", { hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "dr", "dr", "dr", "we", "we"], winningTile: "we", seatWind: "we", roundWind: "ws" }],
      ["chankan", { hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"], winningTile: "p2", chankan: true }],
      ["rinshan", { hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"], winningTile: "p2", rinshan: true }],
      ["haitei", { hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"], winningTile: "p2", haitei: true }],
      ["houtei", { hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"], winningTile: "p2", houtei: true }],
      ["sanshoku", { hand: ["m2", "m3", "m4", "p2", "p3", "p4", "s2", "s3", "s4", "m7", "m8", "m9", "we", "we"], winningTile: "we" }],
      ["ittsuu", { hand: ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "p2", "p3", "p4", "we", "we"], winningTile: "we" }],
      ["chanta", { hand: ["m1", "m2", "m3", "p1", "p2", "p3", "s7", "s8", "s9", "dr", "dr", "dr", "we", "we"], winningTile: "we" }],
      ["chiitoitsu", { hand: ["m1", "m1", "m2", "m2", "p3", "p3", "p4", "p4", "s5", "s5", "we", "we", "dr", "dr"], winningTile: "dr" }],
      ["toitoi", { hand: ["m2", "m2", "m2", "p3", "p3", "p3", "s4", "s4", "s4", "dr", "dr", "dr", "we", "we"], winningTile: "we" }],
      ["sanankou", { hand: ["m2", "m2", "m2", "p3", "p3", "p3", "s4", "s4", "s4", "dr", "dr", "dr", "we", "we"], winningTile: "we" }],
      ["sankantsu", { hand: ["we", "we"], melds: [kong(["m2", "m2", "m2", "m2"]), kong(["p3", "p3", "p3", "p3"]), kong(["s4", "s4", "s4", "s4"]), pung(["dr", "dr", "dr"])], winningTile: "we" }],
      ["honroutou", { hand: ["m1", "m1", "m1", "p9", "p9", "p9", "s1", "s1", "s1", "dr", "dr", "dr", "we", "we"], winningTile: "we" }],
      ["shousangen", { hand: ["dr", "dr", "dr", "dg", "dg", "dg", "dw", "dw", "m2", "m3", "m4", "p5", "p6", "p7"], winningTile: "dw" }],
      ["honitsu", { hand: ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "we", "we", "we", "dr", "dr"], winningTile: "dr" }],
      ["junchan", { hand: ["m1", "m2", "m3", "p1", "p2", "p3", "s7", "s8", "s9", "m7", "m8", "m9", "s1", "s1"], winningTile: "s1" }],
      ["ryanpeikou", { hand: ["m1", "m2", "m3", "m1", "m2", "m3", "p4", "p5", "p6", "p4", "p5", "p6", "we", "we"], winningTile: "we" }],
      ["chinitsu", { hand: ["m1", "m2", "m3", "m2", "m3", "m4", "m4", "m5", "m6", "m6", "m7", "m8", "m9", "m9"], winningTile: "m9" }],
      ["kokushi-musou", { hand: ["m1", "m9", "p1", "p9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw", "dw"], winningTile: "dw" }],
    ];

    for (const [id, input] of cases) {
      expect(detectRiichiYaku(input).map((line) => line.id), id).toContain(id);
    }
  });

  it("does not make a yakuless hand legal with dora only", () => {
    const yaku = detectRiichiYaku({
      hand: ["m2", "m2", "m2", "p1", "p2", "p3", "s4", "s5", "s6", "m7", "m8", "m9", "p5", "p5"],
      winningTile: "p5",
      doraIndicators: ["m1"],
    });

    expect(yaku.map((line) => line.id)).toEqual(["dora"]);
  });
});
