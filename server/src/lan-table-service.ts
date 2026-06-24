import {
  createMatchState,
  evaluateHandProgress,
  evaluateWinningHand,
  resolveMatchAction,
  resolveNextBotTurn,
  scoreOldHongKongFan,
  settleOldHongKong,
  type MatchActionType,
  type MatchState,
  type SettlementContext,
  type SettlementSettings,
} from "@mahjong/game-core";
import type {
  LanAuditEntry,
  LanJoinResponse,
  LanRoomSnapshot,
  LegalAction,
  LobbySeat,
  MatchIntent,
  MatchResult,
  MatchView,
  Seat,
  TableConfig,
} from "@mahjong/shared-types";
import { bankrollReserveFor } from "@mahjong/shared-types";

export interface LanTableServiceOptions {
  now: () => number;
  code: () => string;
  /** Server-only entropy source. The seed is never exposed in client snapshots. */
  seed?: () => string;
}

export interface CreateLanRoomInput {
  config: TableConfig;
  userId: string;
  displayName: string;
  avatar: string;
}

export interface JoinLanRoomInput {
  userId: string;
  displayName: string;
  avatar: string;
}

export interface JoinDiscordActivityRoomInput extends JoinLanRoomInput {
  instanceId: string;
  config: TableConfig;
}

export interface SubmitLanActionInput {
  seat: Seat;
  userId: string;
  intent: MatchIntent;
}

export interface StartLanMatchInput {
  userId: string;
}

export interface LeaveLanRoomInput {
  userId: string;
}

export interface LanRoomState {
  roomCode: string;
  hostUserId: string;
  config: TableConfig;
  seats: [LobbySeat, LobbySeat, LobbySeat, LobbySeat];
  match: MatchState | null;
  auditLog: LanAuditEntry[];
  updatedAt: number;
}

export function createLanTableService(options: LanTableServiceOptions) {
  const rooms = new Map<string, LanRoomState>();

  function createRoom(input: CreateLanRoomInput): LanJoinResponse {
    const roomCode = options.code();
    const room = createRoomState(roomCode, input.config, input.userId, input.displayName, input.avatar);
    touch(room, options.now());
    appendAudit(room, options.now(), "create", input.userId, 0, `${input.displayName} created room ${roomCode}.`);
    rooms.set(roomCode, cloneRoomState(room));
    return { room: snapshotFor(room, 0), seat: 0, userId: input.userId };
  }

  function joinRoom(roomCode: string, input: JoinLanRoomInput): LanJoinResponse {
    const room = requireRoom(rooms, roomCode);
    const existingSeat = room.seats.find((seat) => seat.userId === input.userId);
    const seatIndex = existingSeat?.seat ?? room.seats.findIndex((seat) => seat.isBot);
    if (seatIndex === -1) {
      throw new Error(`Room ${roomCode} is full`);
    }

    room.seats[seatIndex] = seatFromUser(seatIndex as Seat, input.userId, input.displayName, input.avatar);
    if (room.hostUserId.startsWith("bot_")) {
      room.hostUserId = input.userId;
    }
    if (room.match) {
      room.match.players[seatIndex] = {
        ...room.match.players[seatIndex],
        name: input.displayName,
        avatar: input.avatar,
        isBot: false,
      };
    }
    touch(room, options.now());
    appendAudit(room, options.now(), "join", input.userId, seatIndex as Seat, `${input.displayName} joined room ${roomCode}.`);
    rooms.set(roomCode, cloneRoomState(room));
    return { room: snapshotFor(room, seatIndex as Seat), seat: seatIndex as Seat, userId: input.userId };
  }

  function joinOrCreateDiscordActivityRoom(input: JoinDiscordActivityRoomInput): LanJoinResponse {
    const roomCode = discordRoomCode(input.instanceId);
    if (!rooms.has(roomCode)) {
      const room = createRoomState(roomCode, input.config, input.userId, input.displayName, input.avatar);
      touch(room, options.now());
      appendAudit(room, options.now(), "create", input.userId, 0, `${input.displayName} created Discord room ${roomCode}.`);
      rooms.set(roomCode, cloneRoomState(room));
      return { room: snapshotFor(room, 0), seat: 0, userId: input.userId };
    }

    return joinRoom(roomCode, input);
  }

  function getRoom(roomCode: string, seat: Seat, userId?: string): LanRoomSnapshot {
    const room = requireRoom(rooms, roomCode);
    if (userId) {
      assertSeatOwner(room, seat, userId);
    }
    return snapshotFor(room, seat);
  }

  function startMatch(roomCode: string, input: StartLanMatchInput): LanRoomSnapshot {
    const room = requireRoom(rooms, roomCode);
    assertHost(room, input.userId, "Only the host can start this LAN room");
    room.match = createMatchForRoom(room, options.seed?.() ?? secureMatchSeed());
    touch(room, options.now());
    appendAudit(room, options.now(), "start", input.userId, seatForUser(room, input.userId), `${input.userId} started the hand.`);
    rooms.set(roomCode, cloneRoomState(room));
    return snapshotFor(room, seatForUser(room, input.userId) ?? 0);
  }

  function rematch(roomCode: string, input: StartLanMatchInput): LanRoomSnapshot {
    const room = requireRoom(rooms, roomCode);
    assertHost(room, input.userId, "Only the host can start a rematch");
    room.match = createMatchForRoom(room, options.seed?.() ?? secureMatchSeed());
    touch(room, options.now());
    appendAudit(room, options.now(), "rematch", input.userId, seatForUser(room, input.userId), `${input.userId} started a rematch.`);
    rooms.set(roomCode, cloneRoomState(room));
    return snapshotFor(room, seatForUser(room, input.userId) ?? 0);
  }

  function leaveRoom(roomCode: string, input: LeaveLanRoomInput): LanRoomSnapshot {
    const room = requireRoom(rooms, roomCode);
    const seatIndex = room.seats.findIndex((seat) => seat.userId === input.userId);
    if (seatIndex === -1) {
      throw new Error(`User is not seated in room ${roomCode}`);
    }

    const seat = seatIndex as Seat;
    const bot = defaultBotSeat(seat);
    room.seats[seat] = bot;
    if (room.match) {
      room.match.players[seat] = {
        ...room.match.players[seat],
        name: bot.displayName ?? room.match.players[seat].name,
        avatar: bot.avatar ?? room.match.players[seat].avatar,
        isBot: true,
      };
    }
    if (room.hostUserId === input.userId) {
      room.hostUserId = room.seats.find((entry) => !entry.isBot && entry.userId)?.userId ?? "bot_0";
    }
    touch(room, options.now());
    appendAudit(room, options.now(), "leave", input.userId, seat, `${input.userId} left room ${roomCode}.`);
    rooms.set(roomCode, cloneRoomState(room));
    return snapshotFor(room, seat);
  }

  function submitAction(roomCode: string, input: SubmitLanActionInput): LanRoomSnapshot {
    const room = requireRoom(rooms, roomCode);
    if (!room.match) {
      throw new Error(`Room ${roomCode} has not started`);
    }

    assertSeatOwner(room, input.seat, input.userId);
    const actorUserId = input.userId;
    room.match = resolveMatchAction(room.match, {
      seat: input.seat,
      type: input.intent.type as MatchActionType,
      tile: input.intent.tile,
    });
    room.match = advanceBotsUntilHumanChoice(room.match);
    touch(room, options.now());
    appendAudit(
      room,
      options.now(),
      "action",
      actorUserId,
      input.seat,
      `${actorUserId} submitted ${input.intent.type}${input.intent.tile ? ` ${input.intent.tile}` : ""}.`,
    );
    rooms.set(roomCode, cloneRoomState(room));
    return snapshotFor(room, input.seat);
  }

  // Realtime hooks used by the room Durable Object.
  function seatOf(roomCode: string, userId: string): Seat | null {
    const room = rooms.get(roomCode.toUpperCase());
    if (!room) {
      return null;
    }
    return room.seats.find((seat) => seat.userId === userId)?.seat ?? null;
  }

  // After a human seat is converted to a bot mid-hand, nudge the bots so the
  // table keeps moving until the next human decision point.
  function advanceBots(roomCode: string): LanRoomSnapshot {
    const room = requireRoom(rooms, roomCode);
    if (room.match) {
      room.match = advanceBotsUntilHumanChoice(room.match);
      touch(room, options.now());
      rooms.set(roomCode, cloneRoomState(room));
    }
    return snapshotFor(room, 0);
  }

  // Persistence hooks: a Durable Object snapshots the authoritative room state to
  // storage after each mutation and rehydrates it on construction (survives eviction).
  function exportRoom(roomCode: string): LanRoomState | null {
    const room = rooms.get(roomCode.toUpperCase());
    return room ? cloneRoomState(room) : null;
  }

  function importRoom(state: LanRoomState): void {
    rooms.set(state.roomCode.toUpperCase(), cloneRoomState(state));
  }

  return {
    createRoom,
    joinRoom,
    joinOrCreateDiscordActivityRoom,
    getRoom,
    startMatch,
    rematch,
    leaveRoom,
    submitAction,
    seatOf,
    advanceBots,
    exportRoom,
    importRoom,
  };
}

function createRoomState(
  roomCode: string,
  config: TableConfig,
  userId: string,
  displayName: string,
  avatar: string,
): LanRoomState {
  validateTableConfig(config);
  return {
    roomCode,
    hostUserId: userId,
    config,
    seats: createBotFilledSeats(userId, displayName, avatar),
    match: null,
    auditLog: [],
    updatedAt: Date.now(),
  };
}

function createMatchForRoom(room: LanRoomState, seed: string): MatchState {
  const match = createMatchState(seed, { mode: room.config.mode });
  match.players = match.players.map((player, index) => ({
    ...player,
    name: room.seats[index]?.displayName ?? player.name,
    avatar: room.seats[index]?.avatar ?? player.avatar,
    isBot: room.seats[index]?.isBot ?? true,
  })) as MatchState["players"];
  return match;
}

function advanceBotsUntilHumanChoice(match: MatchState): MatchState {
  let next = match;
  for (let step = 0; step < 12; step += 1) {
    if (next.phase === "complete") {
      return next;
    }

    const localClaimExists = next.claimWindow?.offers.some((offer) => !next.players[offer.seat].isBot) ?? false;
    const botOnlyClaimExists = next.claimWindow && !localClaimExists;
    if (!botOnlyClaimExists && !next.players[next.turnSeat].isBot) {
      return next;
    }

    const advanced = resolveNextBotTurn(next);
    if (advanced === next) {
      return next;
    }
    next = advanced;
  }
  return next;
}

function snapshotFor(room: LanRoomState, seat: Seat): LanRoomSnapshot {
  return {
    roomCode: room.roomCode,
    hostUserId: room.hostUserId,
    config: { ...room.config },
    seats: room.seats.map((entry) => ({ ...entry })),
    match: room.match ? matchStateToLanView(room.match, room.config, seat) : null,
    eventLog: room.match?.eventLog.slice(-9) ?? [],
    auditLog: room.auditLog.map((entry) => ({ ...entry })),
    phase: room.match?.phase === "complete" ? "complete" : room.match ? "playing" : "waiting",
    result: room.match ? matchResultFor(room.match, room.config) : null,
    updatedAt: room.updatedAt,
  };
}

function matchStateToLanView(match: MatchState, config: TableConfig, seat: Seat): MatchView {
  const localPlayer = match.players[seat];
  const localOffers = match.claimWindow?.offers.filter((offer) => offer.seat === seat) ?? [];
  const legalActions = localActionsFor(match, seat);
  return {
    handNumber: 1,
    mode: config.mode,
    tableType: config.tableType,
    turnSeat: match.turnSeat,
    mySeat: seat,
    timerSeconds: match.turnSeat === seat || localOffers.length > 0 ? config.timerSeconds : 8,
    wallCount: match.wall.length,
    claimPrompt:
      match.claimWindow && localOffers.length > 0
        ? `${match.players[match.claimWindow.discard.seat].name} discarded ${match.claimWindow.discard.tile.toUpperCase()}. ${localOffers
            .map((offer) => offer.action.toUpperCase())
            .join(" or ")} is available.`
        : null,
    legalActions,
    myHand: localPlayer.hand,
    players: match.players.map((player, index) => ({
      seat: index as Seat,
      name: player.name,
      avatar: player.avatar,
      wind: ["E", "S", "W", "N"][index] as "E" | "S" | "W" | "N",
      isBot: player.isBot,
      handCount: player.hand.length,
      melds: player.melds,
      discards: player.discards,
      coinsDelta: 0,
      connected: true,
    })) as MatchView["players"],
    recentEvent: match.eventLog.slice(-4).join(" "),
  };
}

function localActionsFor(match: MatchState, seat: Seat): LegalAction[] {
  if (match.phase === "complete") {
    return [];
  }

  if (match.claimWindow) {
    const claimActions = match.claimWindow.offers.filter((offer) => offer.seat === seat).map((offer) => offer.action);
    return claimActions.length > 0 ? claimActions : [];
  }

  if (match.turnSeat !== seat) {
    return [];
  }

  const actions: LegalAction[] = ["discard"];
  if (evaluateWinningHand(match.players[seat].hand).isWin) {
    actions.push("win");
  }
  if (hasConcealedKong(match.players[seat].hand)) {
    actions.push("kong");
  }
  return actions;
}

export function matchResultFor(match: MatchState, config?: Pick<TableConfig, "tableType" | "buyIn">): MatchResult | null {
  if (match.phase !== "complete") {
    return null;
  }
  if (match.winnerSeat === null) {
    return config?.tableType === "coin" ? wallDrawMatchResult() : exhaustedProgressResult(match);
  }

  const winner = match.players[match.winnerSeat];
  const seatWinds = ["we", "ws", "ww", "wn"] as const;
  const context: SettlementContext = match.winContext ?? "discard";
  const score = scoreOldHongKongFan({
    codes: winner.hand,
    melds: winner.melds,
    selfDraw: context === "self-draw",
    concealed: winner.melds.length === 0,
    seatWind: seatWinds[match.winnerSeat],
    roundWind: match.roundWind,
    winContext: context,
    flowerCount: winner.flowers.filter((tile) => tile.startsWith("f")).length,
    seasonCount: winner.flowers.filter((tile) => tile.startsWith("t")).length,
  });
  // Doubling settlement ladder (base unit x fan multiplier) per the phase doc.
  const settlement = settleOldHongKong({
    totalFan: score.totalFan,
    winnerSeat: match.winnerSeat,
    context,
    payerSeat: match.payerSeat,
    settings: settlementSettingsFor(config),
  });
  return {
    winnerSeat: match.winnerSeat,
    winnerName: winner.name,
    totalFan: score.totalFan,
    fanLines:
      score.fanLines.length > 0 ? score.fanLines : [{ id: "base-win", nameKey: "fan.baseWin", fan: score.totalFan }],
    deltas: settlement.deltas,
    policyCopy: "Virtual coins have no cash value.",
  };
}

function wallDrawMatchResult(policyCopy = "The wall was exhausted. No winner this hand."): MatchResult {
  return {
    winnerSeat: 0,
    winnerName: "Wall Draw",
    totalFan: 0,
    fanLines: [{ id: "wall-draw", nameKey: "fan.wallDraw", fan: 0 }],
    deltas: [0, 0, 0, 0],
    policyCopy,
  };
}

function exhaustedProgressResult(match: MatchState): MatchResult {
  const leadingSeats = lowestShantenSeats(match.players);

  if (leadingSeats.length !== 1) {
    return wallDrawMatchResult("The wall was exhausted with tied hand progress. No winner this hand.");
  }

  const winnerSeat = leadingSeats[0];
  return {
    winnerSeat,
    winnerName: match.players[winnerSeat].name,
    totalFan: 0,
    fanLines: [{ id: "progress-tiebreak", nameKey: "fan.progressTiebreak", fan: 0 }],
    deltas: match.players.map((player) => (player.seat === winnerSeat ? 3000 : -1000)) as MatchResult["deltas"],
    policyCopy: "Casual progress tiebreak: closest valid hand when the wall was exhausted.",
  };
}

function lowestShantenSeats(players: MatchState["players"]): Seat[] {
  const scores = players.map((player) => evaluateHandProgress(player.hand, player.melds).shanten);
  const lowest = Math.min(...scores);
  return scores.flatMap((score, index) => (score === lowest ? [index as Seat] : []));
}
export function coinSettlementDeltasFor(
  room: Pick<LanRoomSnapshot, "config" | "phase" | "result" | "seats">,
): Array<{ userId: string; amount: number }> | null {
  if (room.config.tableType !== "coin" || room.phase !== "complete" || !room.result) {
    return null;
  }

  if (!room.result.deltas.some((amount) => amount !== 0)) {
    return null;
  }

  const deltas: Array<{ userId: string; amount: number }> = [];
  const reserve = bankrollReserveFor(room.config);
  for (const [index, amount] of room.result.deltas.entries()) {
    const seat = room.seats[index];
    if (!seat || seat.isBot) {
      continue;
    }

    if (!seat.userId || !isUuid(seat.userId)) {
      if (amount !== 0) {
        return null;
      }
      continue;
    }

    if (amount < 0 && Math.abs(amount) > reserve) {
      return null;
    }
    deltas.push({ userId: seat.userId, amount });
  }

  return deltas.some((delta) => delta.amount !== 0) ? deltas : null;
}

const supportedCoinBuyIns = new Set([2_000]);

export function validateTableConfig(config: TableConfig): void {
  if (config.mode !== "1-fan" && config.mode !== "3-fan" && config.mode !== "riichi") {
    throw new Error("Unsupported game mode");
  }
  if (config.privacy !== "public" && config.privacy !== "private") {
    throw new Error("Unsupported table privacy");
  }
  if (!Number.isInteger(config.timerSeconds) || config.timerSeconds < 12 || config.timerSeconds > 40) {
    throw new Error("Timer must be between 12 and 40 seconds");
  }
  if (config.maxPlayers !== 4) {
    throw new Error("Old Hong Kong tables currently require 4 seats");
  }
  if (config.tableType === "friendly") {
    if (config.buyIn !== 0) {
      throw new Error("Friendly tables cannot have a buy-in");
    }
    return;
  }
  if (config.mode === "riichi") {
    throw new Error("Riichi Beta is friendly-room only for now");
  }
  if (config.tableType !== "coin" || !supportedCoinBuyIns.has(config.buyIn)) {
    throw new Error("Coin tables require a supported buy-in");
  }
}

function secureMatchSeed(): string {
  return crypto.randomUUID();
}

function settlementSettingsFor(config?: Pick<TableConfig, "tableType" | "buyIn">): SettlementSettings {
  if (config?.tableType === "coin" && config.buyIn > 0) {
    return { baseUnit: config.buyIn, fanCap: 16 };
  }
  return { baseUnit: 1000, fanCap: 16 };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function hasConcealedKong(hand: string[]): boolean {
  const counts = new Map<string, number>();
  for (const tile of hand) {
    counts.set(tile, (counts.get(tile) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= 4);
}

function assertHost(room: LanRoomState, userId: string, message: string): void {
  if (room.hostUserId !== userId) {
    throw new Error(message);
  }
}

function assertSeatOwner(room: LanRoomState, seat: Seat, userId: string): void {
  const lobbySeat = room.seats[seat];
  if (!lobbySeat || lobbySeat.isBot || lobbySeat.userId !== userId) {
    throw new Error(`Session no longer controls seat ${seat + 1}`);
  }
}

function seatForUser(room: LanRoomState, userId: string): Seat | null {
  const seat = room.seats.find((entry) => entry.userId === userId);
  return seat ? seat.seat : null;
}

function appendAudit(
  room: LanRoomState,
  at: number,
  type: LanAuditEntry["type"],
  actorUserId: string,
  seat: Seat | null,
  message: string,
): void {
  room.auditLog.push({
    id: `${room.roomCode}-${room.auditLog.length + 1}`,
    at,
    type,
    actorUserId,
    seat,
    message,
  });
}

function touch(room: LanRoomState, now: number): void {
  room.updatedAt = now;
}

function discordRoomCode(instanceId: string): string {
  let hash = 2166136261;
  for (let index = 0; index < instanceId.length; index += 1) {
    hash ^= instanceId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(6, "0").slice(0, 6);
}

function createBotFilledSeats(hostUserId: string, hostName: string, hostAvatar: string): LanRoomState["seats"] {
  return [
    seatFromUser(0, hostUserId, hostName, hostAvatar),
    botSeat(1, "Bo Bot", "B"),
    botSeat(2, "Chen Bot", "C"),
    botSeat(3, "Dewi Bot", "D"),
  ];
}

function defaultBotSeat(seat: Seat): LobbySeat {
  const names = ["Lina Bot", "Bo Bot", "Chen Bot", "Dewi Bot"] as const;
  const avatars = ["L", "B", "C", "D"] as const;
  return botSeat(seat, names[seat], avatars[seat]);
}

function seatFromUser(seat: Seat, userId: string, displayName: string, avatar: string): LobbySeat {
  return { seat, userId, displayName, avatar, isBot: false, ready: true };
}

function botSeat(seat: Seat, displayName: string, avatar: string): LobbySeat {
  return { seat, userId: `bot_${seat}`, displayName, avatar, isBot: true, ready: true };
}

function requireRoom(rooms: Map<string, LanRoomState>, roomCode: string): LanRoomState {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room) {
    throw new Error(`Room ${roomCode} not found`);
  }
  return cloneRoomState(room);
}

function cloneRoomState(room: LanRoomState): LanRoomState {
  return {
    roomCode: room.roomCode,
    hostUserId: room.hostUserId,
    config: { ...room.config },
    seats: room.seats.map((seat) => ({ ...seat })) as LanRoomState["seats"],
    match: room.match
      ? {
          ...room.match,
          wall: [...room.match.wall],
          claimWindow: room.match.claimWindow
            ? {
                discard: { ...room.match.claimWindow.discard },
                offers: room.match.claimWindow.offers.map((offer) => ({ ...offer })),
                ...(room.match.claimWindow.addedKong ? { addedKong: { ...room.match.claimWindow.addedKong } } : {}),
              }
            : null,
          eventLog: [...room.match.eventLog],
          auditLog: [...room.match.auditLog],
          deadWall: [...room.match.deadWall],
          players: room.match.players.map((player) => ({
            ...player,
            hand: [...player.hand],
            discards: [...player.discards],
            melds: [...player.melds],
            flowers: [...player.flowers],
          })) as MatchState["players"],
        }
      : null,
    auditLog: room.auditLog.map((entry) => ({ ...entry })),
    updatedAt: room.updatedAt,
  };
}


