import { appendMatchEvent, type JsonObject, type MatchEvent } from "../action-log";
import { buildRiichiWall, type RiichiTile } from "./tiles";
import { scoreRiichiHand } from "./scoring";
import type { RiichiActionInput, RiichiActionOffer, RiichiClaimWindow, RiichiMatchState, RiichiPlayerState, RiichiSeat } from "./types";
import { canRon, winningTiles } from "./waits";

export interface CreateRiichiMatchOptions {
  playerNames?: readonly [string, string, string, string];
  dealerSeat?: RiichiSeat;
}

const seats = [0, 1, 2, 3] as const;
const defaultNames = ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"] as const;
const defaultAvatars = ["L", "B", "C", "D"] as const;
const DECISION_TYPES = new Set<string>(["discard", "chi", "pong", "kong", "riichi", "win", "pass"]);
const suits = ["m", "p", "s"] as const;
const seatWinds = ["we", "ws", "ww", "wn"] as const;

type WinBy = "ron" | "tsumo";
type RiichiLogAction = RiichiActionInput & { winBy?: WinBy; payerSeat?: RiichiSeat };

export function createRiichiMatchState(seed: string, options: CreateRiichiMatchOptions = {}): RiichiMatchState {
  const shuffled = shuffle(buildRiichiWall(), seed);
  const deadWall = shuffled.slice(shuffled.length - 14);
  const liveWall = shuffled.slice(0, shuffled.length - 14);
  const names = options.playerNames ?? defaultNames;
  const dealerSeat = options.dealerSeat ?? 0;
  const players = seats.map((seat) => createPlayer(seat, names[seat])) as RiichiMatchState["players"];

  for (let drawIndex = 0; drawIndex < 13; drawIndex += 1) {
    for (const player of players) {
      player.hand.push(drawRaw(liveWall));
    }
  }
  players[dealerSeat].hand.push(drawRaw(liveWall));

  return {
    mode: "riichi",
    phase: "playing",
    seed,
    context: { roundWind: "we", handNumber: 1, dealerSeat, honba: 0, riichiSticks: 0 },
    turnSeat: dealerSeat,
    liveWall,
    deadWall,
    doraIndicators: deadWall.length > 0 ? [deadWall[0]] : [],
    uraDoraIndicators: deadWall.length > 1 ? [deadWall[1]] : [],
    kanDoraIndicators: [],
    players,
    claimWindow: null,
    result: null,
    eventLog: ["Riichi hand started."],
    auditLog: [],
  };
}

export function resolveRiichiAction(state: RiichiMatchState, action: RiichiActionInput): RiichiMatchState {
  if (state.phase === "complete") return cloneState(state);

  if (state.claimWindow) {
    return resolveClaimAction(state, action);
  }

  if (action.seat !== state.turnSeat && action.type !== "pass") {
    throw new Error("It is not that seat's turn.");
  }

  const next = cloneState(state);
  if (action.type === "pass") {
    log(next, action, "player");
    return next;
  }
  if (action.type === "riichi") {
    declareRiichi(next, action);
    return next;
  }
  if (action.type === "discard") {
    discardAndMaybeOpenClaimWindow(next, action);
    return next;
  }
  if (action.type === "win") {
    completeWin(next, action.seat, action.tile, "tsumo");
    return next;
  }

  throw new Error(`Riichi action is not implemented yet: ${action.type}`);
}

export function decisionsFromRiichiAuditLog(auditLog: readonly MatchEvent[]): RiichiActionInput[] {
  return auditLog
    .filter((event) => event.source === "player" && DECISION_TYPES.has(event.action.type))
    .map((event) => ({
      seat: event.action.actorSeat as RiichiSeat,
      type: event.action.type as RiichiActionInput["type"],
      tile: typeof event.action.payload?.tile === "string" ? (event.action.payload.tile as RiichiTile) : undefined,
    }));
}

export function replayRiichiMatch(seed: string, decisions: readonly RiichiActionInput[], options: CreateRiichiMatchOptions = {}): RiichiMatchState {
  let state = createRiichiMatchState(seed, options);
  for (const decision of decisions) {
    state = resolveRiichiAction(state, decision);
  }
  return state;
}

function discardAndMaybeOpenClaimWindow(state: RiichiMatchState, action: RiichiActionInput): void {
  const tile = action.tile;
  if (!tile) throw new Error("Discard requires a tile.");
  const player = state.players[action.seat];
  const index = player.hand.indexOf(tile);
  if (index === -1) throw new Error(`Seat ${action.seat} cannot discard ${tile}.`);

  player.hand = [...player.hand.slice(0, index), ...player.hand.slice(index + 1)];
  player.discards = [...player.discards, tile];
  player.ippatsu = false;
  log(state, action, "player");

  state.eventLog = [...state.eventLog, `${player.name} discarded ${tile}.`];
  state.claimWindow = buildLocalClaimWindow(state, { seat: action.seat, tile });
  if (state.claimWindow) {
    state.eventLog = [...state.eventLog, `Claim window opened for ${tile}.`];
    log(state, { seat: 0, type: "pass", tile }, "system", "claim-window");
    return;
  }

  continueAfterUnclaimedDiscard(state, action.seat);
}

function resolveClaimAction(state: RiichiMatchState, action: RiichiActionInput): RiichiMatchState {
  if (action.type === "pass") {
    return resolvePassAction(state, action.seat);
  }

  const offer = state.claimWindow?.offers.find((claim) => claim.seat === action.seat && claim.type === action.type);
  if (!offer || !state.claimWindow) {
    const next = cloneState(state);
    next.eventLog = [...next.eventLog, "That Riichi claim is not available right now."];
    return next;
  }

  if (offer.type === "win") {
    const next = cloneState(state);
    const window = next.claimWindow as RiichiClaimWindow;
    const tile = offer.tile ?? window.discard.tile;
    removeLastDiscard(next.players[window.discard.seat], tile);
    next.players[offer.seat].hand = [...next.players[offer.seat].hand, tile];
    next.claimWindow = null;
    completeWin(next, offer.seat, tile, "ron", window.discard.seat);
    return next;
  }

  const next = cloneState(state);
  const window = next.claimWindow as RiichiClaimWindow;
  const player = next.players[offer.seat];
  const tile = offer.tile ?? window.discard.tile;
  log(next, { seat: offer.seat, type: offer.type, tile }, player.isBot ? "bot" : "player");
  removeLastDiscard(next.players[window.discard.seat], tile);

  if (offer.type === "chi") {
    const sequence = offer.tiles ?? claimSequenceFor(player.hand, tile);
    if (!sequence) {
      return { ...state, eventLog: [...state.eventLog, "Chi is no longer available."] };
    }
    player.hand = removeTiles(player.hand, sequence.filter((heldTile) => heldTile !== tile));
    player.melds = [...player.melds, { kind: "chow", tiles: [...sequence], open: true, calledTile: tile, fromSeat: window.discard.seat }];
  }

  if (offer.type === "pong") {
    player.hand = removeTiles(player.hand, [tile, tile]);
    player.melds = [...player.melds, { kind: "pung", tiles: [tile, tile, tile], open: true, calledTile: tile, fromSeat: window.discard.seat }];
  }

  if (offer.type === "kong") {
    player.hand = removeTiles(player.hand, [tile, tile, tile]);
    player.melds = [...player.melds, { kind: "kong", tiles: [tile, tile, tile, tile], open: true, calledTile: tile, fromSeat: window.discard.seat }];
    drawReplacementFromDeadWall(next, offer.seat);
  }

  next.claimWindow = null;
  if (next.phase !== "complete") {
    next.turnSeat = offer.seat;
  }
  next.eventLog = [...next.eventLog, `${player.name} claimed ${offer.type.toUpperCase()} on ${tile}.`];
  return next;
}

function resolvePassAction(state: RiichiMatchState, seat: RiichiSeat): RiichiMatchState {
  if (!state.claimWindow) return cloneState(state);

  const next = cloneState(state);
  const window = next.claimWindow as RiichiClaimWindow;
  log(next, { seat, type: "pass", tile: window.discard.tile }, next.players[seat].isBot ? "bot" : "player");
  next.eventLog = [...next.eventLog, `${next.players[seat].name} passed on ${window.discard.tile}.`];
  if (window.offers.some((offer) => offer.seat === seat && offer.type === "win")) {
    next.players[seat].furiten = "temporary";
  }
  next.claimWindow = null;
  continueAfterUnclaimedDiscard(next, window.discard.seat);
  return next;
}

function continueAfterUnclaimedDiscard(state: RiichiMatchState, discardSeat: RiichiSeat): void {
  if (state.liveWall.length === 0) {
    state.phase = "complete";
    state.eventLog = [...state.eventLog, "The wall is exhausted."];
    log(state, { seat: discardSeat, type: "pass" }, "system", "exhaustive-draw");
    return;
  }

  const nextSeat = nextSeatOf(discardSeat);
  const drawnTile = drawRaw(state.liveWall);
  state.players[nextSeat].hand = [...state.players[nextSeat].hand, drawnTile];
  state.players[nextSeat].furiten = state.players[nextSeat].furiten === "temporary" ? "none" : state.players[nextSeat].furiten;
  state.turnSeat = nextSeat;
  state.eventLog = [...state.eventLog, `${state.players[nextSeat].name} drew from the wall.`];
  log(state, { seat: nextSeat, type: "discard", tile: drawnTile }, "system", "draw");
}

function declareRiichi(state: RiichiMatchState, action: RiichiActionInput): void {
  const player = state.players[action.seat];
  if (player.points < 1000) throw new Error("Riichi requires at least 1,000 points.");
  player.points -= 1000;
  player.riichi = true;
  player.ippatsu = true;
  state.context = { ...state.context, riichiSticks: state.context.riichiSticks + 1 };
  log(state, action, "player");
  discardAndMaybeOpenClaimWindow(state, { ...action, type: "discard", tile: action.tile ?? player.hand.at(-1) });
}

function completeWin(state: RiichiMatchState, seat: RiichiSeat, tile?: RiichiTile, winBy: WinBy = "tsumo", payerSeat?: RiichiSeat): void {
  const winner = state.players[seat];
  const winningTile = tile ?? winner.hand.at(-1);
  if (!winningTile) throw new Error("Win requires a winning tile.");
  state.phase = "complete";
  state.eventLog = [...state.eventLog, winBy === "ron" ? `${winner.name} won by Ron on ${winningTile}.` : `${winner.name} won by Tsumo.`];
  log(state, { seat, type: "win", tile: winningTile, winBy, payerSeat }, "player");
}

function buildLocalClaimWindow(state: RiichiMatchState, discard: { seat: RiichiSeat; tile: RiichiTile }): RiichiClaimWindow | null {
  const localSeat = 0 as RiichiSeat;
  if (discard.seat === localSeat) return null;

  const localPlayer = state.players[localSeat];
  const offers: RiichiActionOffer[] = [];

  if (canClaimRon(state, localSeat, discard.tile)) {
    offers.push({ seat: localSeat, type: "win", tile: discard.tile });
  }

  if (localPlayer.riichi) return offers.length > 0 ? { discard, offers } : null;

  const count = localPlayer.hand.filter((tile) => tile === discard.tile).length;

  if (count >= 3) {
    offers.push({ seat: localSeat, type: "kong", tile: discard.tile, tiles: [discard.tile, discard.tile, discard.tile, discard.tile] });
  }
  if (count >= 2) {
    offers.push({ seat: localSeat, type: "pong", tile: discard.tile, tiles: [discard.tile, discard.tile, discard.tile] });
  }

  const chiSequence = nextSeatOf(discard.seat) === localSeat ? claimSequenceFor(localPlayer.hand, discard.tile) : null;
  if (chiSequence) {
    offers.push({ seat: localSeat, type: "chi", tile: discard.tile, tiles: chiSequence });
  }

  return offers.length > 0 ? { discard, offers } : null;
}

function canClaimRon(state: RiichiMatchState, seat: RiichiSeat, tile: RiichiTile): boolean {
  const player = state.players[seat];
  let waits: RiichiTile[];
  try {
    waits = winningTiles(player.hand, player.melds);
  } catch {
    return false;
  }
  if (!waits.includes(tile) || !canRon(player, waits)) return false;

  try {
    return scoreRiichiHand({
      hand: [...player.hand, tile],
      melds: player.melds,
      winningTile: tile,
      winBy: "ron",
      riichi: player.riichi,
      doubleRiichi: player.doubleRiichi,
      ippatsu: player.ippatsu,
      doraIndicators: state.doraIndicators,
      uraDoraIndicators: state.uraDoraIndicators,
      kanDoraIndicators: state.kanDoraIndicators,
      seatWind: seatWinds[seat],
      roundWind: state.context.roundWind,
    }).legal;
  } catch {
    return false;
  }
}

function claimSequenceFor(hand: readonly RiichiTile[], tile: RiichiTile): RiichiTile[] | null {
  const suit = tile[0];
  const rank = Number(tile.slice(1));
  if (!suits.includes(suit as (typeof suits)[number]) || !Number.isInteger(rank)) {
    return null;
  }

  const candidates = [
    [rank - 2, rank - 1, rank],
    [rank - 1, rank, rank + 1],
    [rank, rank + 1, rank + 2],
  ];

  for (const ranks of candidates) {
    if (ranks.some((candidate) => candidate < 1 || candidate > 9)) continue;
    const sequence = ranks.map((candidate) => `${suit}${candidate}` as RiichiTile);
    const needed = sequence.filter((candidate) => candidate !== tile);
    if (containsTiles(hand, needed)) {
      return sequence;
    }
  }

  return null;
}

function containsTiles(hand: readonly RiichiTile[], needed: readonly RiichiTile[]): boolean {
  const counts = new Map<RiichiTile, number>();
  for (const tile of hand) counts.set(tile, (counts.get(tile) ?? 0) + 1);
  for (const tile of needed) {
    const remaining = counts.get(tile) ?? 0;
    if (remaining <= 0) return false;
    counts.set(tile, remaining - 1);
  }
  return true;
}

function removeTiles(hand: readonly RiichiTile[], tiles: readonly RiichiTile[]): RiichiTile[] {
  const next = [...hand];
  for (const tile of tiles) {
    const index = next.indexOf(tile);
    if (index !== -1) next.splice(index, 1);
  }
  return next;
}

function removeLastDiscard(player: RiichiPlayerState, tile: RiichiTile): void {
  const index = player.discards.lastIndexOf(tile);
  if (index !== -1) {
    player.discards = [...player.discards.slice(0, index), ...player.discards.slice(index + 1)];
  }
}

function drawReplacementFromDeadWall(state: RiichiMatchState, seat: RiichiSeat): void {
  const tile = state.deadWall.shift();
  if (!tile) {
    state.phase = "complete";
    state.eventLog = [...state.eventLog, "The dead wall is exhausted."];
    log(state, { seat, type: "pass" }, "system", "exhaustive-draw");
    return;
  }
  state.players[seat].hand = [...state.players[seat].hand, tile];
  state.eventLog = [...state.eventLog, `${state.players[seat].name} drew a kan replacement tile.`];
  log(state, { seat, type: "discard", tile }, "system", "draw");
}

function nextSeatOf(seat: RiichiSeat): RiichiSeat {
  return ((seat + 1) % 4) as RiichiSeat;
}

function createPlayer(seat: RiichiSeat, name: string): RiichiPlayerState {
  return {
    seat,
    name,
    avatar: defaultAvatars[seat],
    hand: [],
    discards: [],
    melds: [],
    points: 30000,
    riichi: false,
    doubleRiichi: false,
    ippatsu: false,
    furiten: "none",
    isBot: seat !== 0,
  };
}

function cloneState(state: RiichiMatchState): RiichiMatchState {
  return {
    ...state,
    context: { ...state.context },
    liveWall: [...state.liveWall],
    deadWall: [...state.deadWall],
    doraIndicators: [...state.doraIndicators],
    uraDoraIndicators: [...state.uraDoraIndicators],
    kanDoraIndicators: [...state.kanDoraIndicators],
    claimWindow: state.claimWindow
      ? {
          discard: { ...state.claimWindow.discard },
          offers: state.claimWindow.offers.map((offer) => ({ ...offer, tiles: offer.tiles ? [...offer.tiles] : undefined })),
        }
      : null,
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      discards: [...player.discards],
      melds: player.melds.map((meld) => ({ ...meld, tiles: [...meld.tiles] })),
    })) as RiichiMatchState["players"],
    eventLog: [...state.eventLog],
    auditLog: [...state.auditLog],
  };
}

function log(state: RiichiMatchState, action: RiichiLogAction, source: "player" | "bot" | "system", overrideType?: string): void {
  const payload: JsonObject = {
    ...(action.tile ? { tile: action.tile } : {}),
    ...(action.winBy ? { winBy: action.winBy } : {}),
    ...(typeof action.payerSeat === "number" ? { payerSeat: action.payerSeat } : {}),
  };
  state.auditLog = appendMatchEvent(state.auditLog, {
    occurredAt: state.auditLog.length + 1,
    source,
    action: {
      type: overrideType ?? action.type,
      actorSeat: action.seat,
      payload: Object.keys(payload).length > 0 ? payload : undefined,
    },
  });
}

function drawRaw(wall: RiichiTile[]): RiichiTile {
  const tile = wall.shift();
  if (!tile) throw new Error("The Riichi wall is empty.");
  return tile;
}

function shuffle(wall: RiichiTile[], seed: string): RiichiTile[] {
  const rng = createRng(seed);
  const copy = [...wall];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = rng(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function createRng(seed: string): (maxExclusive: number) => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;

  return (maxExclusive: number) => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return Math.floor((((value ^ (value >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}