import { describe, expect, it } from "vitest";
import { bankrollReserveFor } from "./index";
import type { DailyMission, DailyStreakDay, MatchView, TableConfig, Wallet } from "./index";

describe("shared prototype contracts", () => {
  it("keeps wallet currencies explicit", () => {
    const wallet: Wallet = { coins: 12800, gems: 240 };

    expect(Object.keys(wallet).sort()).toEqual(["coins", "gems"]);
  });

  it("requires match actions to come from the server-shaped view", () => {
    const view = {
      legalActions: ["discard", "pong"],
    } satisfies Pick<MatchView, "legalActions">;

    expect(view.legalActions).toContain("discard");
  });

  it("calculates coin-table bankroll reserve from the capped self-draw exposure", () => {
    const table = {
      mode: "3-fan",
      tableType: "coin",
      privacy: "public",
      timerSeconds: 25,
      maxPlayers: 4,
      buyIn: 2_000,
    } satisfies TableConfig;

    expect(bankrollReserveFor(table)).toBe(96_000);
    expect(bankrollReserveFor({ ...table, tableType: "friendly", buyIn: 0 })).toBe(0);
  });

  it("keeps daily retention display contracts explicit", () => {
    const streakDay: DailyStreakDay = { day: 3, rewardCoins: 1000, rewardGems: 0, status: "today" };
    const mission: DailyMission = {
      id: "play-hand",
      title: "Play 1 hand",
      detail: "Finish any friendly or coin hand.",
      progress: 0,
      target: 1,
      rewardCoins: 300,
      claimed: false,
    };

    expect(streakDay.status).toBe("today");
    expect(mission.progress).toBeLessThan(mission.target);
  });
});
