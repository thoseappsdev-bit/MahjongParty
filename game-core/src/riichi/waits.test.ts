import { describe, expect, it } from "vitest";
import type { RiichiPlayerState, RiichiTile } from "./index";
import { canRon, canTsumo, clearTemporaryFuritenOnDraw, furitenState, isTenpai, winningTiles } from "./index";

function sorted(tiles: readonly RiichiTile[]): RiichiTile[] {
  return [...tiles].sort();
}

function player(overrides: Partial<RiichiPlayerState>): RiichiPlayerState {
  return {
    seat: 0,
    name: "Tester",
    avatar: "T",
    hand: [],
    discards: [],
    melds: [],
    points: 25000,
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    furiten: "none",
    isBot: false,
    ...overrides,
  };
}

describe("Riichi waits", () => {
  it("finds multi-sided standard waits", () => {
    const hand: RiichiTile[] = ["m2", "m3", "m4", "m5", "m6", "p2", "p3", "p4", "s3", "s4", "s5", "we", "we"];

    expect(sorted(winningTiles(hand))).toEqual(["m1", "m4", "m7"]);
    expect(isTenpai(hand)).toBe(true);
  });

  it("finds tanki pair waits", () => {
    const hand: RiichiTile[] = ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "m7", "m8", "m9", "we"];

    expect(winningTiles(hand)).toEqual(["we"]);
  });

  it("finds shanpon pair waits", () => {
    const hand: RiichiTile[] = ["m1", "m1", "m2", "m3", "m4", "p1", "p2", "p3", "s1", "s2", "s3", "we", "we"];

    expect(sorted(winningTiles(hand))).toEqual(["m1", "we"]);
  });

  it("does not offer an impossible fifth-copy wait", () => {
    const hand: RiichiTile[] = ["m1", "m1", "m1", "m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "we"];

    expect(winningTiles(hand)).toEqual(["we"]);
  });

  it("keeps seven-pairs and thirteen-orphans waits", () => {
    expect(
      winningTiles(["m1", "m1", "m2", "m2", "p3", "p3", "p4", "p4", "s5", "s5", "we", "we", "dr"]),
    ).toEqual(["dr"]);

    expect(
      sorted(winningTiles(["m1", "m9", "p1", "p9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw"])),
    ).toEqual(sorted(["m1", "m9", "p1", "p9", "s1", "s9", "we", "ws", "ww", "wn", "dr", "dg", "dw"]));
  });
});

describe("Riichi furiten", () => {
  const waits: RiichiTile[] = ["m1", "m4", "m7"];

  it("marks own-discard furiten when a wait is in the player's discard river", () => {
    expect(furitenState(player({ discards: ["p9", "m4"] }), waits)).toBe("discard");
  });

  it("marks passed-ron temporary furiten until the player's next draw", () => {
    expect(furitenState(player({ furiten: "temporary" }), waits)).toBe("temporary");
    expect(furitenState(clearTemporaryFuritenOnDraw(player({ furiten: "temporary" })), waits)).toBe("none");
  });

  it("keeps riichi furiten permanent and blocks ron only", () => {
    const riichiFuritenPlayer = player({ riichi: true, furiten: "riichi" });

    expect(furitenState(riichiFuritenPlayer, waits)).toBe("riichi");
    expect(canRon(riichiFuritenPlayer, waits)).toBe(false);
    expect(canTsumo(riichiFuritenPlayer, waits)).toBe(true);
  });

  it("allows ron and tsumo when the player is not furiten", () => {
    const cleanPlayer = player({ discards: ["p9", "s9"] });

    expect(furitenState(cleanPlayer, waits)).toBe("none");
    expect(canRon(cleanPlayer, waits)).toBe(true);
    expect(canTsumo(cleanPlayer, waits)).toBe(true);
  });
});
