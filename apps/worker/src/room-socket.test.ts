import { describe, expect, it } from "vitest";
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

function fakeWs() {
  return {
    sent: [] as string[],
    attachment: null as unknown,
    closed: false,
    serializeAttachment(value: unknown) {
      this.attachment = value;
    },
    deserializeAttachment() {
      return this.attachment;
    },
    send(message: string) {
      this.sent.push(message);
    },
    close() {
      this.closed = true;
    },
  };
}

function fakeState(name: string, store = new Map<string, unknown>()) {
  const sockets: Array<{ ws: ReturnType<typeof fakeWs>; tags: string[] }> = [];
  let alarm: number | null = null;
  const obj = {
    store,
    id: { name },
    ready: Promise.resolve(),
    alarmAt: () => alarm,
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
      async setAlarm(at: number) {
        alarm = at;
      },
      async getAlarm() {
        return alarm;
      },
    },
    blockConcurrencyWhile(fn: () => Promise<void>) {
      obj.ready = fn();
      return obj.ready;
    },
    acceptWebSocket(ws: ReturnType<typeof fakeWs>, tags: string[]) {
      sockets.push({ ws, tags });
    },
    getWebSockets(tag?: string) {
      return sockets.filter((entry) => !tag || entry.tags.includes(tag)).map((entry) => entry.ws);
    },
  };
  return obj;
}

function createRoom(room: MahjongRoomObject, userId: string) {
  return room.fetch(
    new Request("https://do/create", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": userId },
      body: JSON.stringify({ config: tableConfig, userId, displayName: "Host", avatar: "H" }),
    }),
  );
}

describe("MahjongRoomObject realtime socket", () => {
  it("rejects a socket upgrade from a user who has not joined", async () => {
    const state = fakeState("WSX");
    const room = new MahjongRoomObject(state as never, env({ DEV_AUTH_BYPASS: "1" }));
    await state.ready;
    const response = await room.fetch(new Request("https://do/socket?uid=stranger", { headers: { upgrade: "websocket" } }));
    expect(response.status).toBe(403);
  });

  it("answers ping and broadcasts a snapshot after a control message", async () => {
    const state = fakeState("WSY");
    const room = new MahjongRoomObject(state as never, env({ DEV_AUTH_BYPASS: "1" }));
    await state.ready;
    await createRoom(room, "host");

    const ws = fakeWs();
    ws.serializeAttachment({ userId: "host", seat: 0 });
    state.acceptWebSocket(ws, ["host"]);

    await room.webSocketMessage(ws as never, JSON.stringify({ type: "ping" }));
    expect(ws.sent.some((message) => message.includes("pong"))).toBe(true);

    await room.webSocketMessage(ws as never, JSON.stringify({ type: "start" }));
    expect(ws.sent.some((message) => message.includes('"type":"snapshot"'))).toBe(true);
  });

  it("schedules a disconnect-to-bot alarm when a player's last socket closes", async () => {
    const state = fakeState("WSZ");
    const room = new MahjongRoomObject(state as never, env({ DEV_AUTH_BYPASS: "1" }));
    await state.ready;
    await createRoom(room, "host");

    const ws = fakeWs();
    ws.serializeAttachment({ userId: "host", seat: 0 });
    state.acceptWebSocket(ws, ["host"]);

    await room.webSocketClose(ws as never);

    expect(await state.storage.get("disconnect")).toMatchObject({ host: expect.any(Number) });
    expect(state.alarmAt()).not.toBeNull();
  });

  it("closes an older duplicate socket lookup for the same user", async () => {
    // Two sockets for the same user: the close handler should not start a grace
    // timer while another live socket remains.
    const state = fakeState("WSDUP");
    const room = new MahjongRoomObject(state as never, env({ DEV_AUTH_BYPASS: "1" }));
    await state.ready;
    await createRoom(room, "host");

    const first = fakeWs();
    first.serializeAttachment({ userId: "host", seat: 0 });
    state.acceptWebSocket(first, ["host"]);
    const second = fakeWs();
    second.serializeAttachment({ userId: "host", seat: 0 });
    state.acceptWebSocket(second, ["host"]);

    await room.webSocketClose(first as never);
    expect((await state.storage.get("disconnect")) ?? {}).not.toHaveProperty("host");
    expect(state.alarmAt()).toBeNull();
  });
});
