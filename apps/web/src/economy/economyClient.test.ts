import { describe, expect, it } from "vitest";
import { buyIn, claimMission, getDailyMissions, getWallet, recordMissionProgress, rewardAd, spinWheel } from "./economyClient";

describe("economy client", () => {
  it("loads a wallet through the same-origin economy API", async () => {
    const calls: string[] = [];
    const wallet = await getWallet("", "11111111-1111-4111-8111-111111111111", async (input, init) => {
      calls.push(`${String(input)}|${init?.headers instanceof Headers ? init.headers.get("x-user-id") : ""}`);
      return jsonResponse({ wallet: { coins: 123, gems: 4 } });
    });

    expect(wallet).toEqual({ coins: 123, gems: 4 });
    expect(calls).toEqual(["/api/economy/wallet|11111111-1111-4111-8111-111111111111"]);
  });

  it("pays table buy-in through the backend", async () => {
    const bodies: unknown[] = [];
    const result = await buyIn("", "11111111-1111-4111-8111-111111111111", 2_000, async (_input, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return jsonResponse({ wallet: { coins: 3_000, gems: 0 }, ledger: { amount: -2_000 } });
    });

    expect(result.wallet).toEqual({ coins: 3_000, gems: 0 });
    expect(bodies).toEqual([{ userId: "11111111-1111-4111-8111-111111111111", amount: 2_000 }]);
  });

  it("claims rewarded ad rewards through the backend", async () => {
    const calls: string[] = [];
    const result = await rewardAd("", "11111111-1111-4111-8111-111111111111", async (input, init) => {
      calls.push(`${String(input)}|${String(init?.body)}`);
      return jsonResponse({ wallet: { coins: 220, gems: 0 }, reward: { type: "coins", amount: 220 } });
    });

    expect(result.wallet).toEqual({ coins: 220, gems: 0 });
    expect(calls).toEqual([
      '/api/economy/ad/reward|{"userId":"11111111-1111-4111-8111-111111111111"}',
    ]);
  });

  it("spins the lucky wheel through the backend", async () => {
    const result = await spinWheel("", "11111111-1111-4111-8111-111111111111", async () =>
      jsonResponse({
        wallet: { coins: 0, gems: 8 },
        reward: { type: "gems", amount: 8 },
        oddsShownAt: "2026-06-17T00:00:00.000Z",
      }),
    );

    expect(result.reward).toEqual({ type: "gems", amount: 8 });
    expect(result.wallet).toEqual({ coins: 0, gems: 8 });
  });
  it("loads, records, and claims daily missions through the backend", async () => {
    const calls: string[] = [];
    const missions = await getDailyMissions("", "11111111-1111-4111-8111-111111111111", async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)}`);
      return jsonResponse({
        missions: [{ id: "play-hand", title: "Play 1 hand", detail: "Finish one hand.", progress: 1, target: 1, rewardCoins: 300, claimed: false }],
      });
    });

    await recordMissionProgress("", "11111111-1111-4111-8111-111111111111", { type: "claim-melds", count: 2 }, async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body)}`);
      return jsonResponse({ missions });
    });

    const claimed = await claimMission("", "11111111-1111-4111-8111-111111111111", "play-hand", async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${String(input)} ${String(init?.body)}`);
      return jsonResponse({
        wallet: { coins: 300, gems: 0 },
        mission: { ...missions[0], claimed: true },
        ledger: { amount: 300 },
      });
    });

    expect(missions[0]).toMatchObject({ id: "play-hand", progress: 1 });
    expect(claimed.wallet.coins).toBe(300);
    expect(calls).toEqual([
      "GET /api/economy/daily/missions",
      'POST /api/economy/daily/missions/progress {"userId":"11111111-1111-4111-8111-111111111111","event":{"type":"claim-melds","count":2}}',
      'POST /api/economy/daily/missions/claim {"userId":"11111111-1111-4111-8111-111111111111","missionId":"play-hand"}',
    ]);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

