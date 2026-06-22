import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startServer } from "./index";

let server: ReturnType<typeof startServer> | null = null;

describe("server stub", () => {
  afterEach(() => {
    server?.close();
    server = null;
    vi.unstubAllEnvs();
  });

  it("exports a local HTTP server starter", () => {
    expect(typeof startServer).toBe("function");
  });

  it("refuses to start the unsafe LAN server in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_UNSAFE_NODE_LAN_SERVER_IN_PRODUCTION", "");

    expect(() => startServer(0, "127.0.0.1")).toThrow(
      "The Node LAN server is disabled in production",
    );
  });

  it("allows an explicit unsafe production override for controlled private testing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ALLOW_UNSAFE_NODE_LAN_SERVER_IN_PRODUCTION", "1");

    server = startServer(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));

    expect(server.listening).toBe(true);
  });

  it("serves the LAN room flow over HTTP", async () => {
    server = startServer(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${baseUrl}/health`);
    expect(await health.json()).toMatchObject({
      ok: true,
      service: "mahjong-party-lan",
      apiUrls: expect.any(Array),
      webUrls: expect.any(Array),
    });
    const apiHealth = await fetch(`${baseUrl}/api/health`);
    expect(apiHealth.ok).toBe(true);

    const created = await postJson(`${baseUrl}/api/rooms`, {
      userId: "host",
      displayName: "Host Player",
      avatar: "H",
      config: {
        mode: "3-fan",
        tableType: "friendly",
        privacy: "private",
        timerSeconds: 18,
        maxPlayers: 4,
        buyIn: 0,
      },
    });
    expect(created.room.seats[0]).toMatchObject({ userId: "host", isBot: false });

    const joined = await postJson(`${baseUrl}/api/rooms/${created.room.roomCode}/join`, {
      userId: "guest",
      displayName: "Guest Player",
      avatar: "G",
    });
    expect(joined.seat).toBe(1);

    const guestStart = await fetch(`${baseUrl}/api/rooms/${created.room.roomCode}/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "guest" }),
    });
    expect(guestStart.ok).toBe(false);

    const started = await postJson(`${baseUrl}/api/rooms/${created.room.roomCode}/start`, { userId: "host" });
    expect(started.phase).toBe("playing");
    expect(started.match.mySeat).toBe(0);

    const action = started.match.legalActions.includes("discard")
      ? { seat: 0, userId: "host", intent: { type: "discard", tile: started.match.myHand[0] } }
      : { seat: 0, userId: "host", intent: { type: "pass" } };
    const acted = await postJson(`${baseUrl}/api/rooms/${created.room.roomCode}/actions`, action);
    expect(acted.eventLog.length).toBeGreaterThan(0);

    const forgedAction = await fetch(`${baseUrl}/api/rooms/${created.room.roomCode}/actions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seat: 1, userId: "host", intent: { type: "discard", tile: "m1" } }),
    });
    expect(forgedAction.ok).toBe(false);
    expect(await forgedAction.json()).toMatchObject({ error: "Session no longer controls seat 2" });

    const forgedView = await fetch(`${baseUrl}/api/rooms/${created.room.roomCode}?seat=1&userId=host`);
    expect(forgedView.ok).toBe(false);
    expect(await forgedView.json()).toMatchObject({ error: "Session no longer controls seat 2" });

    const guestView = await (
      await fetch(`${baseUrl}/api/rooms/${created.room.roomCode}?seat=1&userId=guest`)
    ).json();
    expect(guestView.match.mySeat).toBe(1);
    expect(guestView.match.myHand).not.toEqual(started.match.myHand);

    const left = await postJson(`${baseUrl}/api/rooms/${created.room.roomCode}/leave`, { userId: "host" });
    expect(left.hostUserId).toBe("guest");
    expect(left.auditLog.at(-1)).toMatchObject({ type: "leave", actorUserId: "host", seat: 0 });

    const rematch = await postJson(`${baseUrl}/api/rooms/${created.room.roomCode}/rematch`, { userId: "guest" });
    expect(rematch.phase).toBe("playing");
    expect(rematch.hostUserId).toBe("guest");
    expect(rematch.auditLog.at(-1)).toMatchObject({ type: "rematch", actorUserId: "guest" });
  });

  it("serves Discord activity rooms and guards token exchange config", async () => {
    server = startServer(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const host = await postJson(`${baseUrl}/api/discord/rooms`, {
      instanceId: "i-shared-discord-instance",
      userId: "discord_host",
      displayName: "Discord Host",
      avatar: "D",
      config: {
        mode: "3-fan",
        tableType: "friendly",
        privacy: "private",
        timerSeconds: 18,
        maxPlayers: 4,
        buyIn: 0,
      },
    });
    const guest = await postJson(`${baseUrl}/api/discord/rooms`, {
      instanceId: "i-shared-discord-instance",
      userId: "discord_guest",
      displayName: "Discord Guest",
      avatar: "G",
      config: host.room.config,
    });

    expect(guest.room.roomCode).toBe(host.room.roomCode);
    expect(guest.seat).toBe(1);

    const token = await fetch(`${baseUrl}/api/discord/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "sample" }),
    });
    expect(token.ok).toBe(false);
    expect(await token.json()).toMatchObject({ error: "Discord OAuth is not configured" });
  });

  it("serves asset provider status and generation through server-side providers", async () => {
    const assetService = {
      providerStatus: () => ({ openai: { configured: true }, fal: { configured: false } }),
      generate: async (body: unknown) => {
        const generated = {
          provider: "openai" as const,
          status: "completed" as const,
          images: [{ b64Json: "image-data" }],
          request: body,
        };
        return generated;
      },
    };
    server = startServer(0, "127.0.0.1", { assetService });
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const providers = await (await fetch(`${baseUrl}/api/assets/providers`)).json();
    expect(providers).toEqual({ openai: { configured: true }, fal: { configured: false } });

    const generated = await postJson(`${baseUrl}/api/assets/generate`, {
      provider: "openai",
      prompt: "mahjong table skin",
    });
    expect(generated).toMatchObject({
      provider: "openai",
      status: "completed",
      images: [{ b64Json: "image-data" }],
    });
  });

  it("serves prototype economy endpoints with server-side wallet mutations", async () => {
    server = startServer(0, "127.0.0.1");
    await new Promise<void>((resolve) => server?.once("listening", resolve));
    const address = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const wallet = await fetch(`${baseUrl}/api/economy/wallet`, { headers: { "x-user-id": "economy-lina" } });
    expect(await wallet.json()).toEqual({ wallet: { coins: 0, gems: 0 } });

    const catalog = await (await fetch(`${baseUrl}/api/economy/catalog`)).json();
    expect(catalog.coinPacks[0]).toMatchObject({ id: "coins-small", kind: "coin-pack" });

    const purchased = await postJson(`${baseUrl}/api/economy/purchase/verify`, { userId: "economy-lina" });
    expect(purchased.wallet.gems).toBe(120);

    const bought = await postJson(`${baseUrl}/api/economy/shop/buy`, { userId: "economy-lina", itemId: "coins-small" });
    expect(bought.wallet).toMatchObject({ coins: 2000, gems: 70 });
    expect(bought.granted).toEqual({ kind: "coins", amount: 2000 });

    const buyIn = await postJson(`${baseUrl}/api/economy/table/buy-in`, {
      userId: "economy-lina",
      amount: 500,
    });
    expect(buyIn.wallet.coins).toBe(1500);

    for (const userId of ["economy-bo", "economy-chen", "economy-dewi"]) {
      await postJson(`${baseUrl}/api/economy/purchase/verify`, { userId });
      await postJson(`${baseUrl}/api/economy/shop/buy`, { userId, itemId: "coins-small" });
    }

    const settled = await postJson(`${baseUrl}/api/economy/table/settle`, {
      matchId: "http-match-1",
      deltas: [
        { userId: "economy-lina", amount: 300 },
        { userId: "economy-bo", amount: -100 },
        { userId: "economy-chen", amount: -100 },
        { userId: "economy-dewi", amount: -100 },
      ],
    });
    expect(settled.wallets["economy-lina"].coins).toBe(1800);
  });
});

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  expect(response.ok, JSON.stringify(payload)).toBe(true);
  return payload;
}
