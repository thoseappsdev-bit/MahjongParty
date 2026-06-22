import { describe, expect, it } from "vitest";
import { signHs256 } from "../../../server/src/auth";
import worker, { type Env } from "./index";
import { refundReservedBankroll, reserveBankrollForSeat, reservedSettlementDeltasFor, settleCoinSnapshotIfNeeded } from "./index";

describe("Cloudflare economy routes", () => {
  it("reports whether production economy persistence is configured", async () => {
    const locked = await worker.fetch(new Request("https://mahjong.example.com/health"), lockedEnv());
    await expect(locked.json()).resolves.toMatchObject({ economyMode: "locked" });

    const development = await worker.fetch(new Request("https://mahjong.example.com/health"), fakeEnv());
    await expect(development.json()).resolves.toMatchObject({ economyMode: "memory-dev" });

    const persisted = await worker.fetch(
      new Request("https://mahjong.example.com/health"),
      {
        ...lockedEnv(),
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      },
    );
    await expect(persisted.json()).resolves.toMatchObject({ economyMode: "supabase" });
  });

  it("serves the economy catalog from the deployed Worker API", async () => {
    const response = await worker.fetch(new Request("https://mahjong.example.com/api/economy/catalog"), fakeEnv());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { gemPacks?: unknown[]; coinPacks?: unknown[]; cosmetics?: unknown[] };
    expect(body.gemPacks?.length).toBeGreaterThan(0);
    expect(body.coinPacks?.length).toBeGreaterThan(0);
    expect(body.cosmetics?.length).toBeGreaterThan(0);
  });

  it("does not advertise unfinished real-money gem packs in production", async () => {
    const response = await worker.fetch(
      new Request("https://mahjong.example.com/api/economy/catalog"),
      {
        ...lockedEnv(),
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role",
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { gemPacks?: unknown[]; coinPacks?: unknown[]; cosmetics?: unknown[] };
    expect(body.gemPacks).toEqual([]);
    expect(body.coinPacks?.length).toBeGreaterThan(0);
    expect(body.cosmetics?.length).toBeGreaterThan(0);
  });
  it("fails closed instead of using an in-memory economy outside explicit development mode", async () => {
    const secret = "production-test-secret";
    const token = await signHs256(
      { sub: "11111111-1111-4111-8111-111111111111", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 60 },
      secret,
    );
    const response = await worker.fetch(
      new Request("https://mahjong.example.com/api/economy/wallet", {
        headers: { authorization: `Bearer ${token}` },
      }),
      { ...lockedEnv(), SUPABASE_JWT_SECRET: secret },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Persistent economy is not configured",
    });
  });

  it("does not expose unverified reward, purchase, mission-progress, or direct buy-in mutations", async () => {
    const env = fakeEnv();
    const userId = "11111111-1111-4111-8111-111111111111";
    const routes = [
      ["/api/economy/ad/reward", {}, 501],
      ["/api/economy/purchase/verify", { packId: "gems-test-small" }, 501],
      ["/api/economy/daily/missions/progress", { event: { type: "play" } }, 403],
      ["/api/economy/table/buy-in", { amount: 2_000 }, 404],
    ] as const;

    for (const [route, body, expectedStatus] of routes) {
      const response = await worker.fetch(
        new Request(`https://mahjong.example.com${route}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-user-id": userId },
          body: JSON.stringify(body),
        }),
        env,
      );
      expect(response.status, route).toBe(expectedStatus);
    }
  });

  it("settles a completed human coin table once", async () => {
    const calls: Array<{
      matchId: string;
      deltas: Array<{ userId: string; amount: number }>;
      allowHouseDelta: boolean | undefined;
    }> = [];
    const economyService: Parameters<typeof settleCoinSnapshotIfNeeded>[1] = {
      async settle(matchId, deltas, options) {
        calls.push({ matchId, deltas, allowHouseDelta: options?.allowHouseDelta });
        return { wallets: {}, ledgers: [] };
      },
    };
    const settledMatches = new Set<string>();
    const snapshot = coinSnapshot();

    await settleCoinSnapshotIfNeeded(snapshot, economyService, settledMatches);
    await settleCoinSnapshotIfNeeded(snapshot, economyService, settledMatches);

    expect(calls).toEqual([
      {
        matchId: "COIN88-123",
        deltas: [
          { userId: "11111111-1111-4111-8111-111111111111", amount: 16_000 },
          { userId: "22222222-2222-4222-8222-222222222222", amount: -16_000 },
          { userId: "33333333-3333-4333-8333-333333333333", amount: 0 },
          { userId: "44444444-4444-4444-8444-444444444444", amount: 0 },
        ],
        allowHouseDelta: true,
      },
    ]);
  });


  it("releases reserved bankroll plus or minus the hand result at settlement", () => {
    const reserve = 96_000;
    const reservations = {
      "11111111-1111-4111-8111-111111111111": reserve,
      "22222222-2222-4222-8222-222222222222": reserve,
      "33333333-3333-4333-8333-333333333333": reserve,
      "44444444-4444-4444-8444-444444444444": reserve,
    };

    expect(reservedSettlementDeltasFor(coinSnapshot(), reservations)).toEqual([
      { userId: "11111111-1111-4111-8111-111111111111", amount: 112_000 },
      { userId: "22222222-2222-4222-8222-222222222222", amount: 80_000 },
      { userId: "33333333-3333-4333-8333-333333333333", amount: 96_000 },
      { userId: "44444444-4444-4444-8444-444444444444", amount: 96_000 },
    ]);
  });

  it("clears reserved bankroll only after the settlement RPC succeeds", async () => {
    const calls: Array<Array<{ userId: string; amount: number }>> = [];
    const economyService: Parameters<typeof settleCoinSnapshotIfNeeded>[1] = {
      async settle(_matchId, deltas) {
        calls.push(deltas);
        return { wallets: {}, ledgers: [] };
      },
    };
    const reservations = {
      "11111111-1111-4111-8111-111111111111": 96_000,
      "22222222-2222-4222-8222-222222222222": 96_000,
    };

    const settled = await settleCoinSnapshotIfNeeded(coinSnapshot(), economyService, new Set(), reservations);

    expect(settled).toBe(true);
    expect(calls[0]).toEqual([
      { userId: "11111111-1111-4111-8111-111111111111", amount: 112_000 },
      { userId: "22222222-2222-4222-8222-222222222222", amount: 80_000 },
    ]);
    expect(reservations).toEqual({});
  });


  it("reserves paid-table bankroll from the server-derived room config", async () => {
    const calls: Array<{ userId: string; amount: number; metadata?: Record<string, unknown> }> = [];
    const economyService = {
      async mutate(userId: string, _currency: "coins", amount: number, _source: "table-buyin", metadata?: Record<string, unknown>) {
        calls.push({ userId, amount, metadata });
        return { wallet: { coins: 4_000, gems: 0 }, ledger: {} as never };
      },
    };
    const reservations: Record<string, number> = {};

    const reserved = await reserveBankrollForSeat(
      "COIN88",
      coinSnapshot().config,
      "11111111-1111-4111-8111-111111111111",
      reservations,
      economyService,
    );

    expect(reserved).toBe(true);
    expect(calls).toEqual([
      {
        userId: "11111111-1111-4111-8111-111111111111",
        amount: -96_000,
        metadata: { roomCode: "COIN88", reserve: 96_000 },
      },
    ]);
    expect(reservations).toEqual({ "11111111-1111-4111-8111-111111111111": 96_000 });
  });

  it("refunds reserved bankroll when a player leaves before settlement", async () => {
    const calls: Array<{ userId: string; amount: number; metadata?: Record<string, unknown> }> = [];
    const economyService = {
      async mutate(userId: string, _currency: "coins", amount: number, _source: "table-settle", metadata?: Record<string, unknown>) {
        calls.push({ userId, amount, metadata });
        return { wallet: { coins: 100_000, gems: 0 }, ledger: {} as never };
      },
    };
    const reservations = { "11111111-1111-4111-8111-111111111111": 96_000 };

    const refunded = await refundReservedBankroll(
      "COIN88",
      "11111111-1111-4111-8111-111111111111",
      reservations,
      economyService,
    );

    expect(refunded).toBe(true);
    expect(calls).toEqual([
      {
        userId: "11111111-1111-4111-8111-111111111111",
        amount: 96_000,
        metadata: { roomCode: "COIN88", reason: "bankroll-refund" },
      },
    ]);
    expect(reservations).toEqual({});
  });

  it("rejects direct buy-in mutations because the room authority owns bankroll reservations", async () => {
    const response = await worker.fetch(
      new Request("https://mahjong.example.com/api/economy/table/buy-in", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "11111111-1111-4111-8111-111111111111",
        },
        body: JSON.stringify({ amount: -500 }),
      }),
      fakeEnv(),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "Not found" });
  });

  it("exposes daily mission list without a client-controlled progress route", async () => {
    const env = fakeEnv();
    const userId = "11111111-1111-4111-8111-111111111111";

    const progressResponse = await worker.fetch(
      new Request("https://mahjong.example.com/api/economy/daily/missions/progress", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ event: { type: "play" } }),
      }),
      env,
    );
    expect(progressResponse.status).toBe(403);

    const listResponse = await worker.fetch(
      new Request("https://mahjong.example.com/api/economy/daily/missions", { headers: { "x-user-id": userId } }),
      env,
    );
    expect(listResponse.status).toBe(200);
    const listBody = (await listResponse.json()) as { missions: Array<{ id: string; progress: number }> };
    expect(listBody.missions).toEqual(expect.arrayContaining([expect.objectContaining({ id: "play-hand", progress: 0 })]));
  });
});

function coinSnapshot() {
  return {
    roomCode: "COIN88",
    hostUserId: "11111111-1111-4111-8111-111111111111",
    config: {
      mode: "3-fan" as const,
      tableType: "coin" as const,
      privacy: "private" as const,
      timerSeconds: 25,
      maxPlayers: 4 as const,
      buyIn: 2_000,
    },
    seats: [
      {
        seat: 0 as const,
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: "Lina",
        avatar: "L",
        isBot: false,
        ready: true,
      },
      {
        seat: 1 as const,
        userId: "22222222-2222-4222-8222-222222222222",
        displayName: "Friend",
        avatar: "F",
        isBot: false,
        ready: true,
      },
      {
        seat: 2 as const,
        userId: "33333333-3333-4333-8333-333333333333",
        displayName: "Third",
        avatar: "T",
        isBot: false,
        ready: true,
      },
      {
        seat: 3 as const,
        userId: "44444444-4444-4444-8444-444444444444",
        displayName: "Fourth",
        avatar: "F",
        isBot: false,
        ready: true,
      },
    ],
    match: null,
    eventLog: [],
    auditLog: [],
    phase: "complete" as const,
    result: {
      winnerSeat: 0 as const,
      winnerName: "Lina",
      totalFan: 6,
      fanLines: [],
      deltas: [16_000, -16_000, 0, 0] as [number, number, number, number],
      policyCopy: "Virtual coins have no cash value.",
    },
    updatedAt: 123,
  };
}

function lockedEnv(): Env {
  return {
    MAHJONG_ROOM: {
      idFromName() {
        throw new Error("room durable object should not be used by economy routes");
      },
      get() {
        throw new Error("room durable object should not be used by economy routes");
      },
    } as unknown as DurableObjectNamespace,
  };
}

function fakeEnv(): Env {
  return {
    DEV_AUTH_BYPASS: "1",
    MAHJONG_ROOM: {
      idFromName() {
        throw new Error("room durable object should not be used by economy routes");
      },
      get() {
        throw new Error("room durable object should not be used by economy routes");
      },
    } as unknown as DurableObjectNamespace,
  };
}


