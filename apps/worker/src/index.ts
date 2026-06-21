import {
  coinSettlementDeltasFor,
  createLanTableService,
  type LanRoomState,
} from "../../../server/src/lan-table-service";
import { createEconomyService, type EconomyService } from "../../../server/src/economy-service";
import { createSupabaseRestEconomyService } from "../../../server/src/economy-supabase-rest";
import { AuthError, parseBearer, verifySupabaseJwt } from "../../../server/src/auth";
import { applyDisconnectGrace, parseSocketMessage } from "../../../server/src/room-realtime";
import { markConnected, markDisconnected, nextAlarmAt, type DisconnectMap } from "../../../server/src/disconnect-tracker";
import { discordRoomCode, generateRoomCode, normalizeRoomCode } from "./room-code";
import { bankrollReserveFor, type LanRoomSnapshot, type Seat, type TableConfig } from "@mahjong/shared-types";

/** Grace window before a disconnected human seat is converted to a bot. */
const DISCONNECT_GRACE_MS = 30_000;

interface SocketAttachment {
  userId: string;
  seat: Seat;
}

export interface Env {
  MAHJONG_ROOM: DurableObjectNamespace;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** Supabase project JWT secret (Settings -> API -> JWT Secret). When set, JWT auth is enforced. */
  SUPABASE_JWT_SECRET?: string;
  /** "1" allows x-user-id / body.userId identity. ONLY for local dev / tests. Ignored when a JWT secret is set. */
  DEV_AUTH_BYPASS?: string;
}

interface AuthEnv {
  SUPABASE_JWT_SECRET?: string;
  DEV_AUTH_BYPASS?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
}

// Verification options: HS256 via the shared secret, ES256/RS256 via the project
// JWKS endpoint derived from the Supabase URL (Supabase's modern signing keys).
function jwtVerifyOptions(env: AuthEnv) {
  const baseUrl = (env.SUPABASE_URL ?? env.VITE_SUPABASE_URL)?.replace(/\/$/, "");
  return {
    secret: env.SUPABASE_JWT_SECRET,
    audience: "authenticated",
    ...(baseUrl
      ? { jwksUrl: `${baseUrl}/auth/v1/.well-known/jwks.json`, issuer: `${baseUrl}/auth/v1` }
      : {}),
  };
}

let fallbackEconomyService: EconomyService | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return json(null, 204);
    }

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/api/health")) {
      return json({
        ok: true,
        service: "mahjong-party-cloudflare",
        roomRuntime: "durable-object",
        authMode: authModeFor(env),
      });
    }
    if (request.method === "POST" && url.pathname === "/api/analytics/events") {
      return handleAnalyticsEvent(request);
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments[0] === "api" && segments[1] === "economy") {
      return handleEconomyRequest(request, segments, env);
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const roomCode = generateRoomCode();
      return roomFetch(env, roomCode, new Request(new URL("/create", request.url), request));
    }

    if (request.method === "POST" && url.pathname === "/api/discord/rooms") {
      const body = await request.clone().json<{ instanceId?: string }>();
      if (!body.instanceId) {
        return json({ error: "instanceId is required" }, 400);
      }
      const roomCode = discordRoomCode(body.instanceId);
      return roomFetch(env, roomCode, new Request(new URL("/discord", request.url), request));
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/.*)?$/);
    if (roomMatch) {
      const roomCode = normalizeRoomCode(roomMatch[1]);
      const roomPath = roomMatch[2] ?? "/";
      const objectUrl = new URL(`${roomPath}${url.search}`, request.url);
      return roomFetch(env, roomCode, new Request(objectUrl, request));
    }

    return json({ error: "Not found" }, 404);
  },
};

export class MahjongRoomObject {
  private readonly roomCode: string;
  private readonly service: ReturnType<typeof createLanTableService>;
  private readonly economyService: EconomyService;
  private readonly storageState: DurableObjectState;
  private readonly authEnv: AuthEnv;
  private settledMatches = new Set<string>();
  private bankrollReservations: BankrollReservations = {};
  private disconnectMap: DisconnectMap = {};

  constructor(state: DurableObjectState, env: Env) {
    this.storageState = state;
    this.roomCode = normalizeRoomCode(state.id.name ?? "ROOM");
    this.economyService = economyServiceFor(env);
    this.authEnv = {
      SUPABASE_JWT_SECRET: env.SUPABASE_JWT_SECRET,
      DEV_AUTH_BYPASS: env.DEV_AUTH_BYPASS,
      SUPABASE_URL: env.SUPABASE_URL,
      VITE_SUPABASE_URL: env.VITE_SUPABASE_URL,
    };
    this.service = createLanTableService({ now: () => Date.now(), code: () => this.roomCode });

    // Rehydrate authoritative room state from storage so the room survives DO eviction.
    state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get<LanRoomState>("room");
      if (saved) {
        this.service.importRoom(saved);
      }
      const settled = await state.storage.get<string[]>("settled");
      if (settled) {
        this.settledMatches = new Set(settled);
      }
      const reservations = await state.storage.get<BankrollReservations>("bankrollReservations");
      if (reservations) {
        this.bankrollReservations = reservations;
      }
      const disconnect = await state.storage.get<DisconnectMap>("disconnect");
      if (disconnect) {
        this.disconnectMap = disconnect;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      const segments = url.pathname.split("/").filter(Boolean);

      if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        return await this.handleWebSocketUpgrade(request);
      }

      if (request.method === "POST" && url.pathname === "/create") {
        const body = await readJson<Record<string, unknown>>(request);
        const userId = await authenticate(request, this.authEnv, body);
        body.userId = userId;
        const reserved = await this.reserveForConfig(body.config as TableConfig | undefined, userId);
        try {
          const result = json(this.service.createRoom(body as never));
          await this.persist();
          this.broadcast();
          return result;
        } catch (error) {
          if (reserved) {
            await this.refundForUser(userId);
          }
          throw error;
        }
      }

      if (request.method === "POST" && url.pathname === "/discord") {
        const body = await readJson<Record<string, unknown>>(request);
        const userId = await authenticate(request, this.authEnv, body);
        body.userId = userId;
        const existing = this.service.exportRoom(this.roomCode);
        const alreadySeated = existing?.seats.some((seat) => seat.userId === userId) ?? false;
        const reserved = alreadySeated ? false : await this.reserveForConfig((existing?.config ?? body.config) as TableConfig | undefined, userId);
        try {
          const result = json(this.service.joinOrCreateDiscordActivityRoom(body as never));
          await this.persist();
          this.broadcast();
          return result;
        } catch (error) {
          if (reserved) {
            await this.refundForUser(userId);
          }
          throw error;
        }
      }

      if (request.method === "POST" && segments[0] === "join") {
        const body = await readJson<Record<string, unknown>>(request);
        const userId = await authenticate(request, this.authEnv, body);
        body.userId = userId;
        const existing = this.service.exportRoom(this.roomCode);
        const alreadySeated = existing?.seats.some((seat) => seat.userId === userId) ?? false;
        const reserved = alreadySeated ? false : await this.reserveForConfig(existing?.config, userId);
        try {
          const result = json(this.service.joinRoom(this.roomCode, body as never));
          await this.persist();
          this.broadcast();
          return result;
        } catch (error) {
          if (reserved) {
            await this.refundForUser(userId);
          }
          throw error;
        }
      }

      if (request.method === "POST" && segments[0] === "start") {
        const body = await readJson<Record<string, unknown>>(request);
        body.userId = await authenticate(request, this.authEnv, body);
        const result = json(this.service.startMatch(this.roomCode, body as never));
        await this.persist();
        this.broadcast();
        return result;
      }

      if (request.method === "POST" && segments[0] === "rematch") {
        const body = await readJson<Record<string, unknown>>(request);
        body.userId = await authenticate(request, this.authEnv, body);
        const result = json(this.service.rematch(this.roomCode, body as never));
        await this.persist();
        this.broadcast();
        return result;
      }

      if (request.method === "POST" && segments[0] === "leave") {
        const body = await readJson<Record<string, unknown>>(request);
        const userId = await authenticate(request, this.authEnv, body);
        body.userId = userId;
        const snapshot = this.service.leaveRoom(this.roomCode, body as never);
        if (snapshot.phase !== "complete") {
          await this.refundForUser(userId);
        }
        const result = json(snapshot);
        await this.persist();
        this.broadcast();
        return result;
      }

      if (request.method === "POST" && segments[0] === "actions") {
        const body = await readJson<Record<string, unknown>>(request);
        body.userId = await authenticate(request, this.authEnv, body);
        const snapshot = this.service.submitAction(this.roomCode, body as never);
        await settleCoinSnapshotIfNeeded(snapshot, this.economyService, this.settledMatches, this.bankrollReservations);
        await this.persist();
        this.broadcast();
        return json(snapshot);
      }

      if (request.method === "GET" && url.pathname === "/") {
        const userId = await authenticate(request, this.authEnv, {});
        const seat = Number(url.searchParams.get("seat") ?? 0);
        const snapshot = this.service.getRoom(this.roomCode, seat === 1 || seat === 2 || seat === 3 ? seat : 0, userId);
        const settled = await settleCoinSnapshotIfNeeded(snapshot, this.economyService, this.settledMatches, this.bankrollReservations);
        if (settled) {
          await this.persist();
        }
        return json(snapshot);
      }

      return json({ error: "Not found" }, 404);
    } catch (error) {
      if (error instanceof AuthError) {
        return json({ error: error.message }, error.status);
      }
      return json({ error: error instanceof Error ? error.message : "Request failed" }, 400);
    }
  }

  private async reserveForConfig(config: Pick<TableConfig, "tableType" | "buyIn"> | undefined, userId: string): Promise<boolean> {
    if (!config) {
      return false;
    }
    return reserveBankrollForSeat(this.roomCode, config, userId, this.bankrollReservations, this.economyService);
  }

  private refundForUser(userId: string): Promise<boolean> {
    return refundReservedBankroll(this.roomCode, userId, this.bankrollReservations, this.economyService);
  }
  private async persist(): Promise<void> {
    const snapshot = this.service.exportRoom(this.roomCode);
    if (snapshot) {
      await this.storageState.storage.put({
        room: snapshot,
        settled: [...this.settledMatches],
        bankrollReservations: this.bankrollReservations,
        disconnect: this.disconnectMap,
      });
    }
  }

  // --- WebSocket hibernation realtime layer ---------------------------------

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = await authenticateWebSocket(url, this.authEnv);
    const seat = this.service.seatOf(this.roomCode, userId);
    if (seat === null) {
      return json({ error: "Join the room before connecting" }, 403);
    }

    // Duplicate sessions: the newest connection wins; close older ones.
    for (const existing of this.storageState.getWebSockets(userId)) {
      try {
        existing.close(1000, "replaced-by-new-session");
      } catch {
        // already closed
      }
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.storageState.acceptWebSocket(server, [userId]);
    server.serializeAttachment({ userId, seat } satisfies SocketAttachment);

    // Reconnecting cancels any pending disconnect-to-bot conversion.
    this.disconnectMap = markConnected(this.disconnectMap, userId);
    await this.persist();

    this.sendSnapshot(server, seat, userId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) {
      return;
    }
    try {
      const frame = parseSocketMessage(typeof message === "string" ? message : new TextDecoder().decode(message));
      if (frame.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }
      if (frame.type === "action") {
        const snapshot = this.service.submitAction(this.roomCode, {
          seat: attachment.seat,
          userId: attachment.userId,
          intent: frame.intent as never,
        });
        await settleCoinSnapshotIfNeeded(snapshot, this.economyService, this.settledMatches, this.bankrollReservations);
      } else if (frame.type === "start") {
        this.service.startMatch(this.roomCode, { userId: attachment.userId });
      } else if (frame.type === "rematch") {
        this.service.rematch(this.roomCode, { userId: attachment.userId });
      }
      await this.persist();
      this.broadcast();
    } catch (error) {
      try {
        ws.send(JSON.stringify({ type: "error", error: error instanceof Error ? error.message : "Action failed" }));
      } catch {
        // socket gone
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) {
      return;
    }
    // Only start the grace timer when the user has no other live sockets.
    const remaining = this.storageState.getWebSockets(attachment.userId).filter((socket) => socket !== ws);
    if (remaining.length > 0) {
      return;
    }
    this.disconnectMap = markDisconnected(this.disconnectMap, attachment.userId, Date.now());
    await this.persist();
    const at = nextAlarmAt(this.disconnectMap, DISCONNECT_GRACE_MS);
    if (at !== null) {
      await this.storageState.storage.setAlarm(at);
    }
  }

  async alarm(): Promise<void> {
    const result = applyDisconnectGrace(this.service, this.roomCode, this.disconnectMap, Date.now(), DISCONNECT_GRACE_MS);
    this.disconnectMap = result.map;
    await this.persist();
    if (result.bottedUserIds.length > 0) {
      this.broadcast();
    }
    const at = nextAlarmAt(this.disconnectMap, DISCONNECT_GRACE_MS);
    if (at !== null) {
      await this.storageState.storage.setAlarm(at);
    }
  }

  private broadcast(): void {
    for (const ws of this.storageState.getWebSockets()) {
      const attachment = ws.deserializeAttachment() as SocketAttachment | null;
      if (attachment) {
        this.sendSnapshot(ws, attachment.seat, attachment.userId);
      }
    }
  }

  private sendSnapshot(ws: WebSocket, seat: Seat, userId: string): void {
    try {
      ws.send(JSON.stringify({ type: "snapshot", snapshot: this.service.getRoom(this.roomCode, seat, userId) }));
    } catch {
      // socket closed mid-broadcast; ignore
    }
  }
}

export async function settleCoinSnapshotIfNeeded(
  snapshot: LanRoomSnapshot,
  economyService: Pick<EconomyService, "settle">,
  settledMatches: Set<string>,
  bankrollReservations?: BankrollReservations,
): Promise<boolean> {
  const deltas = bankrollReservations
    ? reservedSettlementDeltasFor(snapshot, bankrollReservations)
    : coinSettlementDeltasFor(snapshot);
  if (!deltas) {
    return false;
  }

  const matchId = `${snapshot.roomCode}-${snapshot.updatedAt}`;
  if (settledMatches.has(matchId)) {
    return false;
  }

  await economyService.settle(matchId, deltas, { allowHouseDelta: true });
  settledMatches.add(matchId);
  if (bankrollReservations) {
    for (const delta of deltas) {
      delete bankrollReservations[delta.userId];
    }
  }
  return true;
}

export interface BankrollReservations {
  [userId: string]: number;
}

export async function reserveBankrollForSeat(
  roomCode: string,
  config: Pick<TableConfig, "tableType" | "buyIn">,
  userId: string,
  bankrollReservations: BankrollReservations,
  economyService: Pick<EconomyService, "mutate">,
): Promise<boolean> {
  const reserve = bankrollReserveFor(config);
  if (reserve <= 0 || bankrollReservations[userId]) {
    return false;
  }

  await economyService.mutate(userId, "coins", -reserve, "table-buyin", { roomCode, reserve });
  bankrollReservations[userId] = reserve;
  return true;
}

export async function refundReservedBankroll(
  roomCode: string,
  userId: string,
  bankrollReservations: BankrollReservations,
  economyService: Pick<EconomyService, "mutate">,
): Promise<boolean> {
  const reserve = bankrollReservations[userId] ?? 0;
  if (reserve <= 0) {
    return false;
  }

  await economyService.mutate(userId, "coins", reserve, "table-settle", { roomCode, reason: "bankroll-refund" });
  delete bankrollReservations[userId];
  return true;
}

export function reservedSettlementDeltasFor(
  snapshot: LanRoomSnapshot,
  bankrollReservations: BankrollReservations,
): Array<{ userId: string; amount: number }> | null {
  const baseDeltas = coinSettlementDeltasFor(snapshot);
  if (!baseDeltas) {
    return null;
  }

  const byUser = new Map(baseDeltas.map((delta) => [delta.userId, delta.amount]));
  const releaseDeltas = Object.entries(bankrollReservations)
    .filter(([userId, reserve]) => reserve > 0 && byUser.has(userId))
    .map(([userId, reserve]) => ({ userId, amount: reserve + (byUser.get(userId) ?? 0) }));

  if (releaseDeltas.length === 0) {
    return baseDeltas;
  }
  if (releaseDeltas.some((delta) => delta.amount < 0)) {
    return null;
  }
  return releaseDeltas;
}

/**
 * Derives the authenticated user id. With a JWT secret configured, a valid
 * Supabase bearer token is required and identity comes from its `sub` claim.
 * Without a secret, identity is only accepted under an explicit dev bypass.
 */
async function authenticate(request: Request, env: AuthEnv, body: { userId?: unknown }): Promise<string> {
  const token = parseBearer(request.headers.get("authorization"));
  if (env.SUPABASE_JWT_SECRET) {
    if (!token) {
      throw new AuthError("Missing bearer token");
    }
    const { userId } = await verifySupabaseJwt(token, jwtVerifyOptions(env));
    return userId;
  }

  if (env.DEV_AUTH_BYPASS === "1") {
    const header = request.headers.get("x-user-id");
    const fromBody = typeof body.userId === "string" ? body.userId : undefined;
    const identity = header?.trim() || fromBody?.trim();
    if (!identity) {
      throw new AuthError("Missing dev identity (x-user-id or body.userId)");
    }
    return identity;
  }

  throw new AuthError("Authentication is not configured", 401);
}

// Browser WebSocket clients cannot set headers, so identity arrives via query:
// `?token=<supabase access token>` (JWT) or `?uid=<id>` (dev bypass only).
async function authenticateWebSocket(url: URL, env: AuthEnv): Promise<string> {
  if (env.SUPABASE_JWT_SECRET) {
    const token = url.searchParams.get("token");
    if (!token) {
      throw new AuthError("Missing token");
    }
    const { userId } = await verifySupabaseJwt(token, jwtVerifyOptions(env));
    return userId;
  }
  if (env.DEV_AUTH_BYPASS === "1") {
    const uid = url.searchParams.get("uid")?.trim();
    if (!uid) {
      throw new AuthError("Missing dev identity (uid)");
    }
    return uid;
  }
  throw new AuthError("Authentication is not configured");
}

function authModeFor(env: Env): "jwt" | "dev-bypass" | "locked" {
  if (env.SUPABASE_JWT_SECRET) {
    return "jwt";
  }
  return env.DEV_AUTH_BYPASS === "1" ? "dev-bypass" : "locked";
}

function roomFetch(env: Env, roomCode: string, request: Request): Promise<Response> {
  const id = env.MAHJONG_ROOM.idFromName(roomCode);
  return env.MAHJONG_ROOM.get(id).fetch(request);
}

function economyServiceFor(env: Env): EconomyService {
  const supabaseUrl = env.SUPABASE_URL ?? env.VITE_SUPABASE_URL;
  if (supabaseUrl && env.SUPABASE_SERVICE_ROLE_KEY) {
    return createSupabaseRestEconomyService({
      url: supabaseUrl,
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    });
  }

  fallbackEconomyService ??= createEconomyService();
  return fallbackEconomyService;
}

async function handleEconomyRequest(request: Request, segments: string[], env: Env): Promise<Response> {
  const economyService = economyServiceFor(env);
  try {
    // The shop catalog is static config and safe to read unauthenticated.
    if (request.method === "GET" && segments[2] === "catalog") {
      return json(await economyService.catalog());
    }

    const body = request.method === "GET" ? {} : await readJson<Record<string, unknown>>(request);
    // Server-derived identity. Settlement is never exposed here â€” it is performed
    // internally by the room Durable Object after an authoritative hand completes.
    const userId = await authenticate(request, env, body);

    if (request.method === "GET" && segments[2] === "wallet") {
      return json({ wallet: await economyService.getWallet(userId) });
    }

    if (request.method === "GET" && segments[2] === "daily" && segments[3] === "missions") {
      return json({ missions: await economyService.getDailyMissions(userId) });
    }

    if (request.method === "POST" && segments[2] === "daily" && segments[3] === "missions" && segments[4] === "progress") {
      return json({ missions: await economyService.recordMissionProgress(userId, requireMissionProgressEvent(body.event)) });
    }

    if (request.method === "POST" && segments[2] === "daily" && segments[3] === "missions" && segments[4] === "claim") {
      return json(await economyService.claimMission(userId, requireString(body.missionId, "missionId")));
    }

    if (request.method === "POST" && segments[2] === "daily" && segments[3] === "claim") {
      return json(await economyService.claimDaily(userId));
    }

    if (request.method === "POST" && segments[2] === "ad" && segments[3] === "reward") {
      return json(await economyService.rewardAd(userId));
    }

    if (request.method === "POST" && segments[2] === "spin") {
      return json(await economyService.spin(userId));
    }

    if (request.method === "POST" && segments[2] === "shop" && segments[3] === "buy") {
      return json(await economyService.buy(userId, requireString(body.itemId, "itemId")));
    }

    if (request.method === "POST" && segments[2] === "purchase" && segments[3] === "verify") {
      return json(await economyService.verifyPurchase(userId, typeof body.packId === "string" ? body.packId : undefined));
    }

    if (request.method === "POST" && segments[2] === "table" && segments[3] === "buy-in") {
      return json(await economyService.mutate(userId, "coins", -requirePositiveInteger(body.amount, "amount"), "table-buyin"));
    }

    return json({ error: "Not found" }, 404);
  } catch (error) {
    if (error instanceof AuthError) {
      return json({ error: error.message }, error.status);
    }
    return json({ error: error instanceof Error ? error.message : "Request failed" }, 400);
  }
}

function requireMissionProgressEvent(value: unknown): { type: "play" } | { type: "win-with-pong" } | { type: "claim-melds"; count?: number } {
  if (!value || typeof value !== "object") {
    throw new Error("event is required");
  }
  const event = value as { type?: unknown; count?: unknown };
  if (event.type === "play" || event.type === "win-with-pong") {
    return { type: event.type };
  }
  if (event.type === "claim-melds") {
    if (event.count !== undefined && !Number.isInteger(event.count)) {
      throw new Error("event.count must be an integer");
    }
    return event.count === undefined ? { type: "claim-melds" } : { type: "claim-melds", count: event.count as number };
  }
  throw new Error("event.type is not supported");
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
async function handleAnalyticsEvent(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) {
    return json({ error: "Event payload too large" }, 413);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJson<Record<string, unknown>>(request);
  } catch {
    return json({ error: "Invalid analytics event" }, 400);
  }

  const event = sanitizeAnalyticsEvent(body);
  console.log("client-event", JSON.stringify(event));
  return json({ ok: true });
}

function sanitizeAnalyticsEvent(body: Record<string, unknown>) {
  return {
    type: boundedString(body.type, "client.event", 80),
    level: body.level === "warning" || body.level === "error" ? body.level : "info",
    message: boundedString(body.message, "Client event", 500),
    occurredAt: boundedString(body.occurredAt, new Date().toISOString(), 64),
    metadata: sanitizeAnalyticsMetadata(body.metadata),
  };
}

function sanitizeAnalyticsMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, 20)
      .map(([key, entry]) => [boundedString(key, "key", 80), sanitizeAnalyticsValue(entry)]),
  );
}

function sanitizeAnalyticsValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return boundedString(value, "", 1200);
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(sanitizeAnalyticsValue);
  }
  if (typeof value === "object") {
    return sanitizeAnalyticsMetadata(value);
  }
  return boundedString(String(value), "", 1200);
}

function boundedString(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === "string" && value.trim() ? value.trim() : fallback;
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 3))}...` : text;
}

async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  if (!request.body) {
    return {} as T;
  }
  return request.json<T>();
}

function json(body: unknown, status = 200): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-user-id",
      "content-type": "application/json",
    },
  });
}



