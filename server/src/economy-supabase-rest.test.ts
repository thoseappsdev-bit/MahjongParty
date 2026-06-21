import { afterEach, describe, expect, it } from "vitest";
import { createSupabaseRestEconomyService } from "./economy-supabase-rest";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Supabase REST economy service", () => {
  it("calls global fetch without rebinding it as a class method", async () => {
    globalThis.fetch = function (this: unknown, input: RequestInfo | URL) {
      if (this !== undefined) {
        throw new Error("fetch was called with an illegal receiver");
      }
      expect(String(input)).toContain("/rest/v1/wallets?");
      return Promise.resolve(
        new Response(JSON.stringify([{ coins: 123, gems: 4 }]), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    } as typeof fetch;

    const service = createSupabaseRestEconomyService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
    });

    await expect(service.getWallet("11111111-1111-4111-8111-111111111111")).resolves.toEqual({ coins: 123, gems: 4 });
  });

  it("ensures a guest auth user exists before writing daily state", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const service = createSupabaseRestEconomyService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        const path = `${url.pathname}${url.search}`;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init?.method ?? "GET", path, body });

        if (path.includes("/rpc/service_ensure_guest_user")) {
          return jsonResponse({});
        }
        if (path.includes("/daily_state") && init?.method === "POST") {
          return new Response(null, { status: 204 });
        }
        if (path.includes("/daily_state") && init?.method === "GET") {
          return jsonResponse([{ user_id: "11111111-1111-4111-8111-111111111111", reward_date: null, streak: 0, rewarded_ad_date: null, rewarded_ad_count: 0 }]);
        }
        if (path.includes("/daily_state") && init?.method === "PATCH") {
          return new Response(null, { status: 204 });
        }
        if (path.includes("/rpc/service_mutate_wallet")) {
          return jsonResponse({
            ledger_id: "22222222-2222-4222-8222-222222222222",
            user_id: "11111111-1111-4111-8111-111111111111",
            currency: "coins",
            amount: 800,
            source: "daily-login",
            balance_before: 0,
            balance_after: 800,
            created_at: "2026-06-17T00:00:00.000Z",
          });
        }
        if (path.includes("/wallets")) {
          return jsonResponse([{ coins: 800, gems: 0 }]);
        }
        throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
      },
    });

    await service.claimDaily("11111111-1111-4111-8111-111111111111");

    expect(calls[0]).toMatchObject({
      method: "POST",
      path: "/rest/v1/rpc/service_ensure_guest_user",
      body: { target_user_id: "11111111-1111-4111-8111-111111111111" },
    });
    expect(calls[1]).toMatchObject({ method: "POST", path: "/rest/v1/daily_state?on_conflict=user_id" });
  });

  it("uses daily_state spin fields to cap Lucky Draw", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const service = createSupabaseRestEconomyService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        const path = `${url.pathname}${url.search}`;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init?.method ?? "GET", path, body });

        if (path.includes("/rpc/service_ensure_guest_user")) {
          return jsonResponse({});
        }
        if (path.includes("/daily_state") && init?.method === "POST") {
          return new Response(null, { status: 204 });
        }
        if (path.includes("/daily_state") && init?.method === "GET") {
          return jsonResponse([
            {
              user_id: "11111111-1111-4111-8111-111111111111",
              reward_date: null,
              streak: 0,
              rewarded_ad_date: null,
              rewarded_ad_count: 0,
              spin_date: null,
              spin_count: 0,
            },
          ]);
        }
        if (path.includes("/daily_state") && init?.method === "PATCH") {
          return new Response(null, { status: 204 });
        }
        if (path.includes("/rpc/service_mutate_wallet")) {
          return jsonResponse({
            ledger_id: "22222222-2222-4222-8222-222222222222",
            user_id: "11111111-1111-4111-8111-111111111111",
            currency: "coins",
            amount: 200,
            source: "spin-wheel",
            balance_before: 0,
            balance_after: 200,
            created_at: "2026-06-17T00:00:00.000Z",
          });
        }
        if (path.includes("/wallets")) {
          return jsonResponse([{ coins: 200, gems: 0 }]);
        }
        throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
      },
    });

    await service.spin("11111111-1111-4111-8111-111111111111", 0);

    expect(calls.some((call) => call.method === "PATCH" && call.path.includes("/daily_state"))).toBe(true);
    expect(calls.find((call) => call.method === "PATCH" && call.path.includes("/daily_state"))?.body).toMatchObject({
      spin_count: 1,
    });
  });

  it("resets Supabase daily streaks when the last claim skipped yesterday", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const service = createSupabaseRestEconomyService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        const path = `${url.pathname}${url.search}`;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init?.method ?? "GET", path, body });

        if (path.includes("/rpc/service_ensure_guest_user")) {
          return jsonResponse({});
        }
        if (path.includes("/daily_state") && init?.method === "POST") {
          return new Response(null, { status: 204 });
        }
        if (path.includes("/daily_state") && init?.method === "GET") {
          return jsonResponse([
            {
              user_id: "11111111-1111-4111-8111-111111111111",
              reward_date: "2026-06-17",
              streak: 4,
              rewarded_ad_date: null,
              rewarded_ad_count: 0,
              spin_date: null,
              spin_count: 0,
            },
          ]);
        }
        if (path.includes("/daily_state") && init?.method === "PATCH") {
          return new Response(null, { status: 204 });
        }
        if (path.includes("/rpc/service_mutate_wallet")) {
          return jsonResponse({
            ledger_id: "22222222-2222-4222-8222-222222222222",
            user_id: "11111111-1111-4111-8111-111111111111",
            currency: "coins",
            amount: 800,
            source: "daily-login",
            balance_before: 0,
            balance_after: 800,
            metadata: { streak: 1 },
            created_at: "2026-06-19T00:00:00.000Z",
          });
        }
        if (path.includes("/wallets")) {
          return jsonResponse([{ coins: 800, gems: 0 }]);
        }
        throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
      },
    });

    const claimed = await service.claimDaily("11111111-1111-4111-8111-111111111111");

    expect(claimed.streak).toBe(1);
    expect(calls.find((call) => call.method === "PATCH" && call.path.includes("/daily_state"))?.body).toMatchObject({
      streak: 1,
    });
  });

  it("records Supabase mission progress through service-role RPCs", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const service = createSupabaseRestEconomyService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        const path = `${url.pathname}${url.search}`;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init?.method ?? "GET", path, body });

        if (path.includes("/rpc/service_ensure_guest_user")) {
          return jsonResponse({});
        }
        if (path.includes("/rpc/service_record_daily_mission_progress")) {
          return jsonResponse({});
        }
        if (path.includes("/daily_mission_progress") && init?.method === "GET") {
          return jsonResponse([{ mission_id: "claim-melds", progress: 2, claimed: false }]);
        }
        throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
      },
    });

    await service.recordMissionProgress("11111111-1111-4111-8111-111111111111", { type: "claim-melds", count: 2 });

    expect(calls.find((call) => call.path.includes("/rpc/service_record_daily_mission_progress"))).toMatchObject({
      method: "POST",
      path: "/rest/v1/rpc/service_record_daily_mission_progress",
      body: {
        target_user_id: "11111111-1111-4111-8111-111111111111",
        mission_event: "claim-melds",
        increment_by: 2,
      },
    });
  });

  it("claims Supabase completed missions through a ledgering service RPC", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const service = createSupabaseRestEconomyService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        const path = `${url.pathname}${url.search}`;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init?.method ?? "GET", path, body });

        if (path.includes("/rpc/service_ensure_guest_user")) {
          return jsonResponse({});
        }
        if (path.includes("/rpc/service_claim_daily_mission")) {
          return jsonResponse({
            ledger_id: "22222222-2222-4222-8222-222222222222",
            user_id: "11111111-1111-4111-8111-111111111111",
            currency: "coins",
            amount: 300,
            source: "mission",
            balance_before: 0,
            balance_after: 300,
            metadata: { missionId: "play-hand" },
            created_at: "2026-06-19T00:00:00.000Z",
          });
        }
        if (path.includes("/wallets")) {
          return jsonResponse([{ coins: 300, gems: 0 }]);
        }
        if (path.includes("/daily_mission_progress") && init?.method === "GET") {
          return jsonResponse([{ mission_id: "play-hand", progress: 1, claimed: true }]);
        }
        throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
      },
    });

    const claimed = await service.claimMission("11111111-1111-4111-8111-111111111111", "play-hand");

    expect(claimed.wallet.coins).toBe(300);
    expect(claimed.ledger).toMatchObject({ source: "mission", metadata: { missionId: "play-hand" } });
    expect(claimed.mission).toMatchObject({ id: "play-hand", claimed: true });
  });

  it("settles every wallet and records the match through one atomic RPC", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const linaId = "11111111-1111-4111-8111-111111111111";
    const boId = "22222222-2222-4222-8222-222222222222";
    const service = createSupabaseRestEconomyService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        const path = `${url.pathname}${url.search}`;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init?.method ?? "GET", path, body });

        if (path.includes("/rpc/service_settle_match")) {
          return jsonResponse({
            wallets: {
              [linaId]: { coins: 1300, gems: 0 },
              [boId]: { coins: 900, gems: 0 },
            },
            ledgers: [
              {
                ledger_id: "33333333-3333-4333-8333-333333333333",
                user_id: linaId,
                currency: "coins",
                amount: 300,
                source: "table-settle",
                balance_before: 1000,
                balance_after: 1300,
                metadata: { matchId: "match-atomic" },
                created_at: "2026-06-20T00:00:00.000Z",
              },
              {
                ledger_id: "44444444-4444-4444-8444-444444444444",
                user_id: boId,
                currency: "coins",
                amount: -300,
                source: "table-settle",
                balance_before: 1200,
                balance_after: 900,
                metadata: { matchId: "match-atomic" },
                created_at: "2026-06-20T00:00:00.000Z",
              },
            ],
          });
        }
        throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
      },
    });

    const settled = await service.settle("match-atomic", [
      { userId: linaId, amount: 300 },
      { userId: boId, amount: -300 },
    ]);

    expect(calls).toEqual([
      {
        method: "POST",
        path: "/rest/v1/rpc/service_settle_match",
        body: {
          target_match_id: "match-atomic",
          settlement_deltas: [
            { userId: linaId, amount: 300 },
            { userId: boId, amount: -300 },
          ],
          allow_house_delta: false,
        },
      },
    ]);
    expect(settled.wallets[linaId]).toEqual({ coins: 1300, gems: 0 });
    expect(settled.ledgers).toHaveLength(2);
    expect(settled.ledgers[0]).toMatchObject({ source: "table-settle", metadata: { matchId: "match-atomic" } });
  });

  it("lets the atomic settlement RPC return an idempotent replay without wallet mutation calls", async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    const service = createSupabaseRestEconomyService({
      url: "https://example.supabase.co",
      serviceRoleKey: "service-role",
      fetchImpl: async (input, init) => {
        const url = new URL(String(input));
        const path = `${url.pathname}${url.search}`;
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        calls.push({ method: init?.method ?? "GET", path, body });

        if (path.includes("/rpc/service_settle_match")) {
          return jsonResponse({
            wallets: {
              "11111111-1111-4111-8111-111111111111": { coins: 1300, gems: 0 },
              "22222222-2222-4222-8222-222222222222": { coins: 900, gems: 0 },
            },
            ledgers: [],
          });
        }
        if (path.includes("/rpc/service_mutate_wallet")) {
          throw new Error("duplicate settlement should not mutate wallets");
        }
        throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
      },
    });

    const settled = await service.settle("match-once", [
      { userId: "11111111-1111-4111-8111-111111111111", amount: 300 },
      { userId: "22222222-2222-4222-8222-222222222222", amount: -300 },
    ]);

    expect(settled.ledgers).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/rest/v1/rpc/service_settle_match");
    expect(calls.some((call) => call.path.includes("/rpc/service_mutate_wallet"))).toBe(false);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}





