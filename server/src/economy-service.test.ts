import { describe, expect, it } from "vitest";
import { createEconomyService } from "./economy-service";

describe("economy service", () => {
  it("creates a wallet on first read and records checked ledger mutations", async () => {
    const economy = createEconomyService({ now: () => 1_789_000_000_000, id: () => "ledger-1" });

    expect(await economy.getWallet("lina")).toEqual({ coins: 0, gems: 0 });

    const credited = await economy.mutate("lina", "coins", 500, "daily-login");
    expect(credited.wallet).toEqual({ coins: 500, gems: 0 });
    expect(credited.ledger).toMatchObject({
      ledgerId: "ledger-1",
      userId: "lina",
      currency: "coins",
      amount: 500,
      source: "daily-login",
      balanceBefore: 0,
      balanceAfter: 500,
      createdAt: "2026-09-10T00:26:40.000Z",
    });
    expect(await economy.getLedger("lina")).toHaveLength(1);
  });

  it("rejects mutations that would make a wallet negative", async () => {
    const economy = createEconomyService();

    expect(() => economy.mutate("lina", "coins", -1, "table-buyin")).toThrow("Insufficient coins");
    expect(await economy.getWallet("lina")).toEqual({ coins: 0, gems: 0 });
    expect(await economy.getLedger("lina")).toEqual([]);
  });

  it("settles a hand only when all deltas sum to zero", async () => {
    let nextId = 0;
    const economy = createEconomyService({ id: () => `ledger-${++nextId}` });
    await economy.mutate("lina", "coins", 1000, "admin");
    await economy.mutate("bo", "coins", 1000, "admin");
    await economy.mutate("chen", "coins", 1000, "admin");
    await economy.mutate("dewi", "coins", 1000, "admin");

    const settled = await economy.settle("match-1", [
      { userId: "lina", amount: 300 },
      { userId: "bo", amount: -100 },
      { userId: "chen", amount: -100 },
      { userId: "dewi", amount: -100 },
    ]);

    expect(settled.wallets.lina.coins).toBe(1300);
    expect(settled.wallets.bo.coins).toBe(900);
    expect(await economy.getMatchHistory()).toMatchObject([{ matchId: "match-1", deltas: [300, -100, -100, -100] }]);
    expect(() =>
      economy.settle("match-2", [
        { userId: "lina", amount: 10 },
        { userId: "bo", amount: 0 },
      ]),
    ).toThrow("Settlement deltas must sum to zero");
  });

  it("can settle bot-backed hands against the house when explicitly allowed", async () => {
    let nextId = 0;
    const economy = createEconomyService({ id: () => `ledger-${++nextId}` });

    const settled = await economy.settle("match-house", [{ userId: "lina", amount: 16_000 }], {
      allowHouseDelta: true,
    });

    expect(settled.wallets.lina.coins).toBe(16_000);
    expect(await economy.getMatchHistory()).toMatchObject([
      { matchId: "match-house", deltas: [16_000], houseDelta: -16_000 },
    ]);
  });

  it("does not settle the same match twice", async () => {
    let nextId = 0;
    const economy = createEconomyService({ id: () => `ledger-${++nextId}` });
    await economy.mutate("lina", "coins", 1000, "admin");
    await economy.mutate("bo", "coins", 1000, "admin");

    const first = await economy.settle("match-once", [
      { userId: "lina", amount: 300 },
      { userId: "bo", amount: -300 },
    ]);
    const second = await economy.settle("match-once", [
      { userId: "lina", amount: 300 },
      { userId: "bo", amount: -300 },
    ]);

    expect(second).toEqual(first);
    expect(await economy.getWallet("lina")).toEqual({ coins: 1300, gems: 0 });
    expect(await economy.getWallet("bo")).toEqual({ coins: 700, gems: 0 });
    expect(await economy.getMatchHistory()).toHaveLength(1);
  });

  it("serves catalog actions without allowing coin-to-gem conversion", async () => {
    const economy = createEconomyService();
    await economy.mutate("lina", "gems", 200, "purchase");

    const bought = await economy.buy("lina", "coins-small");
    expect(bought.wallet).toEqual({ coins: 2_000, gems: 150 });
    expect(bought.granted).toEqual({ kind: "coins", amount: 2_000 });

    expect(() => economy.buy("lina", "missing-pack")).toThrow("Catalog item not found");
    const catalog = await economy.catalog();
    expect(catalog.coinPacks.some((pack) => pack.coinGrant > 0 && pack.gemCost > 0)).toBe(true);
    expect(catalog.coinPacks.some((pack) => pack.coinGrant < 0)).toBe(false);
  });

  it("caps rewarded ads and daily claims per day", async () => {
    const economy = createEconomyService({ today: () => "2026-06-16" });

    const daily = await economy.claimDaily("lina");
    expect(daily.reward).toMatchObject({ rewardCoins: 800, rewardGems: 0 });
    expect(() => economy.claimDaily("lina")).toThrow("Daily reward already claimed");

    expect((await economy.rewardAd("lina")).reward).toEqual({ type: "coins", amount: 120 });
    expect((await economy.rewardAd("lina")).reward).toEqual({ type: "coins", amount: 160 });
    expect((await economy.rewardAd("lina")).reward).toEqual({ type: "coins", amount: 220 });
    expect(() => economy.rewardAd("lina")).toThrow("Rewarded ad cap reached");
  });

  it("caps Lucky Draw to one spin per day", async () => {
    const economy = createEconomyService({ today: () => "2026-06-16" });

    expect((await economy.spin("lina", 0)).reward).toEqual({ type: "coins", amount: 200, weight: 45 });
    expect(() => economy.spin("lina", 0)).toThrow("Lucky Draw already used today");
  });

  it("resets the daily streak after a missed calendar day", async () => {
    let date = "2026-06-16";
    const economy = createEconomyService({ today: () => date });

    expect((await economy.claimDaily("lina")).streak).toBe(1);

    date = "2026-06-17";
    expect((await economy.claimDaily("lina")).streak).toBe(2);

    date = "2026-06-19";
    const restarted = await economy.claimDaily("lina");

    expect(restarted.streak).toBe(1);
    expect(restarted.reward.id).toBe("daily-1");
  });

  it("records Lucky Draw rewards in the user ledger with reward metadata", async () => {
    const economy = createEconomyService({
      today: () => "2026-06-16",
      now: () => Date.parse("2026-06-16T00:00:00.000Z"),
      id: () => "spin-ledger-1",
    });

    await economy.spin("lina", 0);

    expect(await economy.getLedger("lina")).toEqual([
      expect.objectContaining({
        ledgerId: "spin-ledger-1",
        currency: "coins",
        amount: 200,
        source: "spin-wheel",
        metadata: { rewardType: "coins", rewardAmount: 200 },
      }),
    ]);
  });

  it("tracks daily mission progress for play, pong wins, and claimed melds", async () => {
    const economy = createEconomyService({ today: () => "2026-06-16" });

    await economy.recordMissionProgress("lina", { type: "play" });
    await economy.recordMissionProgress("lina", { type: "win-with-pong" });
    await economy.recordMissionProgress("lina", { type: "claim-melds", count: 2 });

    expect(await economy.getDailyMissions("lina")).toEqual([
      expect.objectContaining({ id: "play-hand", progress: 1, target: 1, claimed: false }),
      expect.objectContaining({ id: "win-with-pong", progress: 1, target: 1, claimed: false }),
      expect.objectContaining({ id: "claim-melds", progress: 2, target: 2, claimed: false }),
    ]);
  });

  it("claims completed daily missions once and ledgers the reward", async () => {
    const economy = createEconomyService({
      today: () => "2026-06-16",
      now: () => Date.parse("2026-06-16T00:00:00.000Z"),
      id: () => "mission-ledger-1",
    });

    await economy.recordMissionProgress("lina", { type: "play" });
    const claimed = await economy.claimMission("lina", "play-hand");

    expect(claimed.wallet.coins).toBe(300);
    expect(claimed.mission).toMatchObject({ id: "play-hand", progress: 1, claimed: true });
    expect(await economy.getLedger("lina")).toEqual([
      expect.objectContaining({
        ledgerId: "mission-ledger-1",
        amount: 300,
        source: "mission",
        metadata: { missionId: "play-hand" },
      }),
    ]);
    expect(() => economy.claimMission("lina", "play-hand")).toThrow("Mission already claimed");
  });
});

