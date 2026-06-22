import { describe, expect, it } from "vitest";
import type { MatchView, Seat } from "@mahjong/shared-types";
import { collectPixiBoardAssetPaths, tileFaceAssetPath } from "./pixiBoardAssets";

describe("pixi board assets", () => {
  it("maps engine tile codes to the shipped artwork filenames", () => {
    expect(tileFaceAssetPath("1M")).toBe("/assets/tiles/old-hk/m1.svg");
    expect(tileFaceAssetPath("9P")).toBe("/assets/tiles/old-hk/p9.svg");
    expect(tileFaceAssetPath("DR")).toBe("/assets/tiles/old-hk/dr.svg");
    expect(tileFaceAssetPath("")).toBe("/assets/tiles/tile-front.svg");
  });

  it("collects table, tile backs, local hand tiles, discards, and meld tiles for preloading", () => {
    const assets = collectPixiBoardAssetPaths(view());

    expect(assets).toContain("/assets/table-skins/old-hk-openai-board.png");
    expect(assets).toContain("/assets/tiles/tile-back.svg");
    expect(assets).toContain("/assets/tiles/tile-front.svg");
    expect(assets).toContain("/assets/tiles/old-hk/m1.svg");
    expect(assets).toContain("/assets/tiles/old-hk/p9.svg");
    expect(assets).toContain("/assets/tiles/old-hk/dr.svg");
    expect(assets).toContain("/assets/tiles/old-hk/we.svg");
    expect(new Set(assets).size).toBe(assets.length);
  });
});

function view(): MatchView {
  return {
    handNumber: 1,
    mode: "3-fan",
    tableType: "friendly",
    turnSeat: 0,
    mySeat: 0,
    timerSeconds: 25,
    wallCount: 64,
    claimPrompt: null,
    legalActions: ["discard"],
    myHand: ["1M", "1M", "9P", "DR"],
    players: [player(0, ["WE"], []), player(1, ["3S"], ["pung DR"]), player(2, [], []), player(3, [], [])] as MatchView["players"],
    recentEvent: "Your turn.",
  };
}

function player(seat: Seat, discards: string[], melds: string[]): MatchView["players"][number] {
  return {
    seat,
    name: ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"][seat],
    avatar: ["L", "B", "C", "D"][seat],
    wind: ["E", "S", "W", "N"][seat] as "E" | "S" | "W" | "N",
    isBot: seat !== 0,
    handCount: 13,
    melds,
    discards,
    coinsDelta: 0,
    connected: true,
  };
}
