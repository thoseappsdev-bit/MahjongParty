import { describe, expect, it } from "vitest";
import { advancePrototypeMatch } from "./index";
import type { MatchView } from "@mahjong/shared-types";

const player = {
  seat: 0 as const,
  name: "Lina",
  avatar: "L",
  wind: "E" as const,
  isBot: false,
  handCount: 13,
  melds: [],
  discards: [],
  coinsDelta: 0,
  connected: true,
};

describe("prototype match stubs", () => {
  it("advances the turn without mutating the input view", () => {
    const view: MatchView = {
      handNumber: 1,
      mode: "3-fan",
      tableType: "friendly",
      turnSeat: 0,
      mySeat: 0,
      timerSeconds: 24,
      wallCount: 70,
      claimPrompt: null,
      legalActions: ["discard"],
      myHand: ["m1", "m2"],
      players: [
        player,
        { ...player, seat: 1, name: "Bo", wind: "S", avatar: "B", isBot: true },
        { ...player, seat: 2, name: "Chen", wind: "W", avatar: "C", isBot: true },
        { ...player, seat: 3, name: "Dewi", wind: "N", avatar: "D", isBot: true },
      ],
      recentEvent: "Ready",
    };

    const next = advancePrototypeMatch(view);

    expect(next.turnSeat).toBe(1);
    expect(view.turnSeat).toBe(0);
  });
});
