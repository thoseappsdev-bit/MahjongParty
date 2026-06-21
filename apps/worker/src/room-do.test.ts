import { afterEach, describe, expect, it, vi } from "vitest";
import type { TableConfig } from "@mahjong/shared-types";
import { MahjongRoomObject, type Env } from "./index";

const tableConfig: TableConfig = {
  mode: "3-fan",
  tableType: "friendly",
  privacy: "private",
  timerSeconds: 25,
  maxPlayers: 4,
  buyIn: 0,
};
const coinTableConfig: TableConfig = {
  ...tableConfig,
  tableType: "coin",
  buyIn: 2_000,
};

function env(overrides: Partial<Env> = {}): Env {
  return {
    MAHJONG_ROOM: {
      idFromName() {
        throw new Error("nested room access not expected");
      },
      get() {
        throw new Error("nested room access not expected");
      },
    } as unknown as DurableObjectNamespace,
    ...overrides,
  };
}

// Minimal in-memory DurableObjectState whose storage is shared between instances
// so we can prove rehydration after eviction.
function fakeState(name: string, store = new Map<string, unknown>()) {
  const obj = {
    store,
    id: { name },
    ready: Promise.resolve(),
    storage: {
      async get(key: string) {
        return store.get(key);
      },
      async put(arg: string | Record<string, unknown>, value?: unknown) {
        if (typeof arg === "string") {
          store.set(arg, value);
        } else {
          for (const [key, val] of Object.entries(arg)) {
            store.set(key, val);
          }
        }
      },
    },
    blockConcurrencyWhile(fn: () => Promise<void>) {
      obj.ready = fn();
      return obj.ready;
    },
    getWebSockets() {
      return [] as unknown[];
    },
    acceptWebSocket() {
      /* no sockets in these tests */
    },
  };
  return obj;
}

function createRequest(userId: string | null) {
  return new Request("https://do/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(userId ? { "x-user-id": userId } : {}),
    },
    body: JSON.stringify({ config: tableConfig, userId: userId ?? undefined, displayName: "Host", avatar: "H" }),
  });
}

describe("MahjongRoomObject auth + persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("rejects room creation when authentication is not configured (fail closed)", async () => {
    const state = fakeState("LOCKED");
    const room = new MahjongRoomObject(state as never, env());
    await state.ready;
    const response = await room.fetch(createRequest("host-1"));
    expect(response.status).toBe(401);
  });

  it("creates a room under dev bypass and persists it to Durable Object storage", async () => {
    const store = new Map<string, unknown>();
    const state = fakeState("ROOMAA", store);
    const room = new MahjongRoomObject(state as never, env({ DEV_AUTH_BYPASS: "1" }));
    await state.ready;

    const response = await room.fetch(createRequest("host-1"));
    expect(response.status).toBe(200);
    expect(store.has("room")).toBe(true);
  });


  it("reserves coin-table bankroll before creating a paid room", async () => {
    const store = new Map<string, unknown>();
    const state = fakeState("COIN88", store);
    const calls: Array<{ path: string; body: Record<string, unknown> | null }> = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ path: url.pathname, body });
      if (url.pathname.includes("/rpc/service_ensure_guest_user")) {
        return new Response(null, { status: 204 });
      }
      if (url.pathname.includes("/rpc/service_mutate_wallet")) {
        return Response.json({
          ledger_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          user_id: body?.target_user_id,
          currency: "coins",
          amount: body?.delta,
          source: body?.ledger_source,
          balance_before: 100_000,
          balance_after: 4_000,
          created_at: "2026-06-20T00:00:00.000Z",
          metadata: body?.ledger_metadata,
        });
      }
      if (url.pathname.includes("/wallets")) {
        return Response.json([{ coins: 4_000, gems: 0 }]);
      }
      return Response.json({ error: "unexpected" }, { status: 500 });
    });

    const room = new MahjongRoomObject(
      state as never,
      env({ DEV_AUTH_BYPASS: "1", SUPABASE_URL: "https://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "service-role" }),
    );
    await state.ready;

    const response = await room.fetch(
      new Request("https://do/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-user-id": "11111111-1111-4111-8111-111111111111",
        },
        body: JSON.stringify({
          config: coinTableConfig,
          userId: "11111111-1111-4111-8111-111111111111",
          displayName: "Host",
          avatar: "H",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "/rest/v1/rpc/service_mutate_wallet",
          body: expect.objectContaining({
            target_user_id: "11111111-1111-4111-8111-111111111111",
            target_currency: "coins",
            delta: -96_000,
            ledger_source: "table-buyin",
            ledger_metadata: { roomCode: "COIN88", reserve: 96_000 },
          }),
        }),
      ]),
    );
    expect(store.get("bankrollReservations")).toEqual({ "11111111-1111-4111-8111-111111111111": 96_000 });
  });

  it("rehydrates an existing room from storage in a fresh Durable Object instance", async () => {
    const store = new Map<string, unknown>();

    const first = fakeState("ROOMBB", store);
    const room = new MahjongRoomObject(first as never, env({ DEV_AUTH_BYPASS: "1" }));
    await first.ready;
    await room.fetch(createRequest("host-1"));

    // Simulate eviction: a brand-new instance backed by the same storage.
    const second = fakeState("ROOMBB", store);
    const revived = new MahjongRoomObject(second as never, env({ DEV_AUTH_BYPASS: "1" }));
    await second.ready;

    const getResponse = await revived.fetch(
      new Request("https://do/?seat=0", { headers: { "x-user-id": "host-1" } }),
    );
    expect(getResponse.status).toBe(200);
    const snapshot = (await getResponse.json()) as { roomCode: string; hostUserId: string };
    expect(snapshot.roomCode).toBe("ROOMBB");
    expect(snapshot.hostUserId).toBe("host-1");
  });
});
