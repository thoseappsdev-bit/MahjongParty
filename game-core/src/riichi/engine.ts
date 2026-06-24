import { appendMatchEvent, type MatchEvent } from "../action-log";
import { buildRiichiWall, type RiichiTile } from "./tiles";
import type { RiichiActionInput, RiichiMatchState, RiichiPlayerState, RiichiSeat } from "./types";

export interface CreateRiichiMatchOptions {
  playerNames?: readonly [string, string, string, string];
}

const seats = [0, 1, 2, 3] as const;
const defaultNames = ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"] as const;
const defaultAvatars = ["L", "B", "C", "D"] as const;
const DECISION_TYPES = new Set<string>(["discard", "riichi", "win", "pass"]);

export function createRiichiMatchState(seed: string, options: CreateRiichiMatchOptions = {}): RiichiMatchState {
  const shuffled = shuffle(buildRiichiWall(), seed);
  const deadWall = shuffled.slice(shuffled.length - 14);
  const liveWall = shuffled.slice(0, shuffled.length - 14);
  const names = options.playerNames ?? defaultNames;
  const players = seats.map((seat) => createPlayer(seat, names[seat])) as RiichiMatchState["players"];

  for (let drawIndex = 0; drawIndex < 13; drawIndex += 1) {
    for (const player of players) {
      player.hand.push(drawRaw(liveWall));
    }
  }
  players[0].hand.push(drawRaw(liveWall));

  return {
    mode: "riichi",
    phase: "playing",
    seed,
    context: { roundWind: "we", handNumber: 1, dealerSeat: 0, honba: 0, riichiSticks: 0 },
    turnSeat: 0,
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
    discardAndAdvance(next, action);
    return next;
  }
  if (action.type === "win") {
    completeWin(next, action.seat, action.tile);
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

function discardAndAdvance(state: RiichiMatchState, action: RiichiActionInput): void {
  const tile = action.tile;
  if (!tile) throw new Error("Discard requires a tile.");
  const player = state.players[action.seat];
  const index = player.hand.indexOf(tile);
  if (index === -1) throw new Error(`Seat ${action.seat} cannot discard ${tile}.`);

  player.hand = [...player.hand.slice(0, index), ...player.hand.slice(index + 1)];
  player.discards = [...player.discards, tile];
  player.ippatsu = false;
  log(state, action, "player");

  if (state.liveWall.length === 0) {
    state.phase = "complete";
    state.eventLog = [...state.eventLog, "The wall is exhausted."];
    log(state, { seat: action.seat, type: "pass" }, "system", "exhaustive-draw");
    return;
  }

  const nextSeat = ((action.seat + 1) % 4) as RiichiSeat;
  const drawnTile = drawRaw(state.liveWall);
  state.players[nextSeat].hand = [...state.players[nextSeat].hand, drawnTile];
  state.turnSeat = nextSeat;
  state.eventLog = [...state.eventLog, `${player.name} discarded ${tile}.`, `${state.players[nextSeat].name} drew from the wall.`];
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
  discardAndAdvance(state, { ...action, type: "discard", tile: action.tile ?? player.hand.at(-1) });
}

function completeWin(state: RiichiMatchState, seat: RiichiSeat, tile?: RiichiTile): void {
  const winner = state.players[seat];
  const winningTile = tile ?? winner.hand.at(-1);
  if (!winningTile) throw new Error("Win requires a winning tile.");
  state.phase = "complete";
  state.eventLog = [...state.eventLog, `${winner.name} won the hand.`];
  log(state, { seat, type: "win", tile: winningTile }, "player");
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

function log(state: RiichiMatchState, action: RiichiActionInput, source: "player" | "system", overrideType?: string): void {
  state.auditLog = appendMatchEvent(state.auditLog, {
    occurredAt: state.auditLog.length + 1,
    source,
    action: {
      type: overrideType ?? action.type,
      actorSeat: action.seat,
      payload: action.tile ? { tile: action.tile } : undefined,
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
