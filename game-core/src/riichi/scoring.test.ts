import { describe, expect, it } from "vitest";
import { scoreRiichiHand, settleRiichiWin } from "./index";

describe("Riichi scoring", () => {
  it("scores legal hands with yaku, fu, dora, and limit names", () => {
    const score = scoreRiichiHand({
      hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"],
      winningTile: "p2",
      winBy: "tsumo",
      riichi: true,
      doraIndicators: ["m1"],
    });

    expect(score.legal).toBe(true);
    expect(score.han).toBeGreaterThanOrEqual(4);
    expect(score.fu).toBe(20);
    expect(score.limit).toBe("mangan");
    expect(score.yaku.map((line) => line.id)).toEqual(expect.arrayContaining(["riichi", "menzen-tsumo", "pinfu", "tanyao", "dora"]));
  });

  it("rejects dora-only hands as yakuless", () => {
    const score = scoreRiichiHand({
      hand: ["m2", "m2", "m2", "p1", "p2", "p3", "s4", "s5", "s6", "m7", "m8", "m9", "p5", "p5"],
      winningTile: "p5",
      doraIndicators: ["m1"],
    });

    expect(score.legal).toBe(false);
    expect(score.yaku.map((line) => line.id)).toEqual(["dora"]);
  });

  it("settles dealer and non-dealer ron and tsumo payments", () => {
    expect(settleRiichiWin({ han: 3, fu: 40, yakuman: 0 }, { winnerSeat: 1, winBy: "ron", payerSeat: 2, dealerSeat: 0, honba: 0, riichiSticks: 0 })).toEqual([0, 5200, -5200, 0]);
    expect(settleRiichiWin({ han: 3, fu: 40, yakuman: 0 }, { winnerSeat: 0, winBy: "ron", payerSeat: 2, dealerSeat: 0, honba: 0, riichiSticks: 0 })).toEqual([7700, 0, -7700, 0]);
    expect(settleRiichiWin({ han: 3, fu: 40, yakuman: 0 }, { winnerSeat: 1, winBy: "tsumo", dealerSeat: 0, honba: 0, riichiSticks: 0 })).toEqual([-2600, 5200, -1300, -1300]);
    expect(settleRiichiWin({ han: 3, fu: 40, yakuman: 0 }, { winnerSeat: 0, winBy: "tsumo", dealerSeat: 0, honba: 0, riichiSticks: 0 })).toEqual([7800, -2600, -2600, -2600]);
  });

  it("applies mangan through yakuman limits and riichi stick/honba bonuses", () => {
    expect(scoreRiichiHand({ hand: ["m2", "m3", "m4", "p3", "p4", "p5", "s4", "s5", "s6", "m6", "m7", "m8", "p2", "p2"], winningTile: "p2", riichi: true, doraIndicators: ["m1", "p2", "s3"] }).limit).toBe("haneman");
    expect(settleRiichiWin({ han: 13, fu: 30, yakuman: 0 }, { winnerSeat: 1, winBy: "ron", payerSeat: 2, dealerSeat: 0, honba: 1, riichiSticks: 2 })).toEqual([0, 34300, -32300, 0]);
  });
});
