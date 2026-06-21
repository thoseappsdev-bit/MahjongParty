import { describe, expect, it } from "vitest";
import type { MatchView } from "@mahjong/shared-types";
import { buildBoardCanvasModel } from "./boardCanvasModel";

describe("board canvas model", () => {
  it("places discards inside the center pile and highlights the active seat", () => {
    const model = buildBoardCanvasModel(view(), { width: 900, height: 560 });

    expect(model.discards).toHaveLength(3);
    expect(model.discards[0]).toMatchObject({ code: "m1", seat: 0 });
    expect(model.discards.every((tile) => tile.x >= model.center.x && tile.x <= model.center.x + model.center.width)).toBe(true);
    expect(model.turnSeat).toBe(2);
    expect(model.seatHighlights.find((highlight) => highlight.seat === 2)?.active).toBe(true);
  });
});

function view(): MatchView {
  const players = [
    player(0, ["m1", "m2"]),
    player(1, []),
    player(2, ["p3"]),
    player(3, []),
  ] as MatchView["players"];

  return {
    handNumber: 1,
    mode: "3-fan",
    tableType: "coin",
    turnSeat: 2,
    mySeat: 0,
    timerSeconds: 25,
    wallCount: 70,
    claimPrompt: null,
    legalActions: [],
    myHand: [],
    players,
    recentEvent: "Chen Bot is thinking.",
  };
}

function player(seat: 0 | 1 | 2 | 3, discards: string[]): MatchView["players"][number] {
  return {
    seat,
    name: `Seat ${seat}`,
    avatar: String(seat),
    wind: ["E", "S", "W", "N"][seat] as "E" | "S" | "W" | "N",
    isBot: seat !== 0,
    handCount: 13,
    melds: [],
    discards,
    coinsDelta: 0,
    connected: true,
  };
}
