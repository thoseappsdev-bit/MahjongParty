import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { networkInterfaces } from "node:os";
import { createAssetService, type AssetService } from "./asset-service";
import { createConfiguredEconomyService } from "./economy-postgres";
import { createEconomyService, type EconomyService } from "./economy-service";
import { createLanTableService } from "./lan-table-service";
import { loadLocalEnv } from "./local-env";

if (process.env.NODE_ENV !== "test") {
  loadLocalEnv();
}

const service = createLanTableService({
  now: () => Date.now(),
  code: () => Math.random().toString(36).slice(2, 8).toUpperCase(),
});

export function startServer(
  port = Number(process.env.PORT ?? 8787),
  host = process.env.HOST ?? "0.0.0.0",
  options: {
    assetService?: Partial<Pick<AssetService, "providerStatus" | "generate" | "falStatus" | "falResult">>;
    economyService?: EconomyService;
  } = {},
) {
  const defaultAssetService = createAssetService();
  const assetService = { ...defaultAssetService, ...options.assetService };
  const economyService = options.economyService ?? createConfiguredEconomyService(createEconomyService());
  const server = createServer((request, response) => {
    void handleRequest(request, response, assetService, economyService);
  });

  server.listen(port, host, () => {
    const urls = localUrls(port);
    console.log(`Mahjong Party LAN server ready on port ${port}`);
    for (const url of urls) {
      console.log(`  ${url}`);
    }
  });

  return server;
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  assetService: Pick<AssetService, "providerStatus" | "generate" | "falStatus" | "falResult">,
  economyService: EconomyService,
) {
  try {
    setCorsHeaders(response);
    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    const url = new URL(request.url ?? "/", "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      sendJson(response, 200, {
        ok: true,
        service: "mahjong-party-lan",
        apiUrls: localUrls(Number(process.env.PORT ?? 8787)),
        webUrls: localUrls(Number(process.env.WEB_PORT ?? 5173)),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      sendJson(response, 200, service.createRoom(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/discord/rooms") {
      sendJson(response, 200, service.joinOrCreateDiscordActivityRoom(await readJson(request)));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/discord/token") {
      sendJson(response, 200, await exchangeDiscordToken(await readJson(request)));
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/assets/providers") {
      sendJson(response, 200, assetService.providerStatus());
      return;
    }

    if (segments[0] === "api" && segments[1] === "economy") {
      await handleEconomyRequest(request, response, segments, economyService);
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/assets/generate") {
      sendJson(response, 200, await assetService.generate(await readJson(request)));
      return;
    }

    if (segments[0] === "api" && segments[1] === "assets" && segments[2] === "fal" && segments[3]) {
      if (request.method === "GET" && segments[4] === "status") {
        sendJson(response, 200, await assetService.falStatus(segments[3]));
        return;
      }

      if (request.method === "GET" && segments[4] === "result") {
        sendJson(response, 200, await assetService.falResult(segments[3]));
        return;
      }
    }

    if (segments[0] === "api" && segments[1] === "rooms" && segments[2]) {
      const roomCode = segments[2].toUpperCase();
      if (request.method === "POST" && segments[3] === "join") {
        sendJson(response, 200, service.joinRoom(roomCode, await readJson(request)));
        return;
      }

      if (request.method === "POST" && segments[3] === "start") {
        sendJson(response, 200, service.startMatch(roomCode, await readJson(request)));
        return;
      }

      if (request.method === "POST" && segments[3] === "rematch") {
        sendJson(response, 200, service.rematch(roomCode, await readJson(request)));
        return;
      }

      if (request.method === "POST" && segments[3] === "leave") {
        sendJson(response, 200, service.leaveRoom(roomCode, await readJson(request)));
        return;
      }

      if (request.method === "POST" && segments[3] === "actions") {
        sendJson(response, 200, service.submitAction(roomCode, await readJson(request)));
        return;
      }

      if (request.method === "GET" && segments.length === 3) {
        const seat = Number(url.searchParams.get("seat") ?? 0);
        const userId = url.searchParams.get("userId") ?? undefined;
        sendJson(response, 200, service.getRoom(roomCode, seat === 1 || seat === 2 || seat === 3 ? seat : 0, userId));
        return;
      }
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    sendJson(response, 400, { error: error instanceof Error ? error.message : "Request failed" });
  }
}

async function handleEconomyRequest(
  request: IncomingMessage,
  response: ServerResponse,
  segments: string[],
  economyService: EconomyService,
) {
  const body = request.method === "GET" ? {} : await readJson(request);

  if (request.method === "GET" && segments[2] === "catalog") {
    sendJson(response, 200, await economyService.catalog());
    return;
  }

  if (request.method === "POST" && segments[2] === "table" && segments[3] === "settle") {
    sendJson(
      response,
      200,
      await economyService.settle(requireString(body.matchId, "matchId"), requireSettlementDeltas(body.deltas)),
    );
    return;
  }

  const userId = resolveUserId(request, body);

  if (request.method === "GET" && segments[2] === "wallet") {
    sendJson(response, 200, { wallet: await economyService.getWallet(userId) });
    return;
  }

  if (request.method === "POST" && segments[2] === "daily" && segments[3] === "claim") {
    sendJson(response, 200, await economyService.claimDaily(userId));
    return;
  }

  if (request.method === "POST" && segments[2] === "ad" && segments[3] === "reward") {
    sendJson(response, 200, await economyService.rewardAd(userId));
    return;
  }

  if (request.method === "POST" && segments[2] === "spin") {
    sendJson(response, 200, await economyService.spin(userId));
    return;
  }

  if (request.method === "POST" && segments[2] === "shop" && segments[3] === "buy") {
    sendJson(response, 200, await economyService.buy(userId, requireString(body.itemId, "itemId")));
    return;
  }

  if (request.method === "POST" && segments[2] === "purchase" && segments[3] === "verify") {
    sendJson(response, 200, await economyService.verifyPurchase(userId, typeof body.packId === "string" ? body.packId : undefined));
    return;
  }

  if (request.method === "POST" && segments[2] === "table" && segments[3] === "buy-in") {
    sendJson(
      response,
      200,
      await economyService.mutate(userId, "coins", -requirePositiveInteger(body.amount, "amount"), "table-buyin"),
    );
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function readJson(request: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(body === null ? "" : JSON.stringify(body));
}

function setCorsHeaders(response: ServerResponse) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function resolveUserId(request: IncomingMessage, body: any): string {
  const headerUserId = request.headers["x-user-id"];
  if (typeof headerUserId === "string" && headerUserId.trim()) {
    return headerUserId.trim();
  }
  return requireString(body.userId, "userId");
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function requireInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  return value as number;
}

function requirePositiveInteger(value: unknown, field: string): number {
  const parsed = requireInteger(value, field);
  if (parsed <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return parsed;
}

function requireSettlementDeltas(value: unknown): Array<{ userId: string; amount: number }> {
  if (!Array.isArray(value)) {
    throw new Error("deltas must be an array");
  }
  return value.map((delta) => ({
    userId: requireString((delta as { userId?: unknown }).userId, "delta.userId"),
    amount: requireInteger((delta as { amount?: unknown }).amount, "delta.amount"),
  }));
}

async function exchangeDiscordToken(body: { code?: string }): Promise<{ access_token: string }> {
  const clientId = process.env.VITE_DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Discord OAuth is not configured");
  }
  if (!body.code) {
    throw new Error("Discord authorization code is required");
  }

  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: body.code,
    }),
  });

  if (!response.ok) {
    throw new Error(`Discord token exchange failed with HTTP ${response.status}`);
  }

  const token = (await response.json()) as { access_token?: string };
  if (!token.access_token) {
    throw new Error("Discord token exchange returned no access token");
  }
  return { access_token: token.access_token };
}

function localUrls(port: number): string[] {
  const urls = [`http://127.0.0.1:${port}`];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        urls.push(`http://${entry.address}:${port}`);
      }
    }
  }
  return urls;
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}
