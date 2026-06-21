import type { GameMode, LegalAction, Seat } from "@mahjong/shared-types";
import { appendMatchEvent, type MatchEvent } from "./action-log";
import { meetsFanGate, scoreOldHongKongFan, type SettlementContext } from "./scoring";

export type MatchPhase = "playing" | "complete";
export type MatchActionType = LegalAction | "emote" | "pass";

export interface MatchPlayerState {
  seat: Seat;
  name: string;
  avatar: string;
  hand: string[];
  discards: string[];
  melds: string[];
  /** Flowers and seasons revealed for this seat (set aside, never melded). */
  flowers: string[];
  isBot: boolean;
}

export interface MatchDiscard {
  seat: Seat;
  tile: string;
}

export interface MatchClaimOffer {
  seat: Seat;
  action: Extract<LegalAction, "chi" | "pong" | "kong" | "win">;
  tile: string;
  tiles?: [string, string, string] | [string, string, string, string];
}

export interface MatchClaimIntent {
  seat: Seat;
  action: MatchClaimOffer["action"];
}

export interface MatchClaimWindow {
  discard: MatchDiscard;
  offers: MatchClaimOffer[];
  /**
   * Present when this window is a rob-the-kong interrupt rather than a normal
   * discard claim. The added kong only completes if every opponent passes.
   */
  addedKong?: { seat: Seat; tile: string };
}

export interface MatchState {
  seed: string;
  mode: GameMode;
  roundWind: string;
  phase: MatchPhase;
  turnSeat: Seat;
  wall: string[];
  /** Replacement-draw wall for flowers/seasons and kongs. */
  deadWall: string[];
  players: [MatchPlayerState, MatchPlayerState, MatchPlayerState, MatchPlayerState];
  claimWindow: MatchClaimWindow | null;
  winnerSeat: Seat | null;
  /** How the winning tile arrived; drives settlement. */
  winContext: SettlementContext | null;
  /** Seat that pays a discard / robbed-kong win. Null for self-draw. */
  payerSeat: Seat | null;
  /** Human-readable narration for the UI. */
  eventLog: string[];
  /** Structured, replayable audit trail of every draw/discard/claim/score. */
  auditLog: MatchEvent[];
}

export interface MatchActionInput {
  seat: Seat;
  type: MatchActionType;
  tile?: string;
}

export interface CreateMatchOptions {
  mode?: GameMode;
  roundWind?: string;
}

const playerNames = ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"] as const;
const avatars = ["L", "B", "C", "D"] as const;
const seatWinds = ["we", "ws", "ww", "wn"] as const;
const suits = ["m", "p", "s"] as const;
const honors = ["we", "ws", "ww", "wn", "dr", "dg", "dw"] as const;
const flowers = ["f1", "f2", "f3", "f4"] as const;
const seasons = ["t1", "t2", "t3", "t4"] as const;

/** Decisions that, replayed in order, reconstruct a match deterministically. */
const DECISION_TYPES = new Set<string>(["discard", "chi", "pong", "kong", "win", "pass"]);

export function createMatchState(seed: string, options: CreateMatchOptions = {}): MatchState {
  const shuffled = shuffle(buildWall(), seed);
  const deadWall = shuffled.slice(shuffled.length - 14);
  const wall = shuffled.slice(0, shuffled.length - 14);
  const players: MatchState["players"] = [createPlayer(0), createPlayer(1), createPlayer(2), createPlayer(3)];

  const state: MatchState = {
    seed,
    mode: options.mode ?? "3-fan",
    roundWind: options.roundWind ?? "we",
    phase: "playing",
    turnSeat: 0,
    wall,
    deadWall,
    players,
    claimWindow: null,
    winnerSeat: null,
    winContext: null,
    payerSeat: null,
    eventLog: [],
    auditLog: [],
  };

  for (let drawIndex = 0; drawIndex < 13; drawIndex += 1) {
    for (const player of players) {
      player.hand.push(drawRaw(state));
    }
  }
  players[0].hand.push(drawRaw(state));

  // Reveal any flowers/seasons dealt into hands and replace from the dead wall.
  for (const player of players) {
    revealBonusesForSeat(state, player.seat);
  }

  logEvent(state, { type: "match-start" }, "system");
  state.eventLog.push("Match started. Lina drew first.");
  return state;
}

export function resolveMatchAction(state: MatchState, action: MatchActionInput): MatchState {
  if (state.phase === "complete") {
    return state;
  }

  if (state.claimWindow) {
    return resolveClaimAction(state, action);
  }

  if (action.type === "kong" && action.seat === state.turnSeat) {
    return resolveKongDeclaration(state, action);
  }

  if (action.type === "win" && action.seat === state.turnSeat) {
    return resolveSelfDrawWin(state, action.seat);
  }

  if (action.type !== "discard" || action.seat !== state.turnSeat) {
    return {
      ...cloneState(state),
      eventLog: [...state.eventLog, "That action is not available right now."],
    };
  }

  const next = cloneState(state);
  const tile = action.tile ?? next.players[action.seat].hand[0];
  if (!next.players[action.seat].hand.includes(tile)) {
    return { ...next, eventLog: [...next.eventLog, "That tile is not in hand."] };
  }
  logDecision(next, { seat: action.seat, type: "discard", tile }, next.players[action.seat].isBot ? "bot" : "player");
  discardFromSeat(next, action.seat, tile);
  next.eventLog.push(`${next.players[action.seat].name} discarded ${displayCode(tile)}.`);
  next.claimWindow = buildClaimWindow(next, { seat: action.seat, tile });

  if (next.claimWindow) {
    logEvent(next, { type: "claim-window", tile }, "system");
    next.eventLog.push(`Claim window opened for ${displayCode(tile)}.`);
    return next;
  }

  return continueAfterUnclaimedDiscard(next, action.seat);
}

function resolveSelfDrawWin(state: MatchState, seat: Seat): MatchState {
  const player = state.players[seat];
  const { gatePass } = scoreWin(state, seat, player.hand, "self-draw");
  if (!gatePass) {
    return {
      ...cloneState(state),
      eventLog: [...state.eventLog, `${player.name}'s hand does not meet the ${state.mode} minimum.`],
    };
  }

  const next = cloneState(state);
  logDecision(next, { seat, type: "win" }, next.players[seat].isBot ? "bot" : "player");
  next.phase = "complete";
  next.winnerSeat = seat;
  next.winContext = "self-draw";
  next.payerSeat = null;
  logWinScore(next);
  next.eventLog.push(`${next.players[seat].name} declared self-draw Win.`);
  return next;
}

function resolveClaimAction(state: MatchState, action: MatchActionInput): MatchState {
  if (action.type === "pass") {
    return resolvePassAction(state, action.seat);
  }

  const offer = state.claimWindow?.offers.find((claim) => claim.seat === action.seat && claim.action === action.type);
  if (!offer || !state.claimWindow) {
    return {
      ...cloneState(state),
      eventLog: [...state.eventLog, "That claim is not available right now."],
    };
  }

  if (!isHighestPriorityOffer(state.claimWindow.offers, offer)) {
    return {
      ...cloneState(state),
      eventLog: [...state.eventLog, "A higher-priority claim must resolve first."],
    };
  }

  if (offer.action === "win") {
    const robbing = state.claimWindow.addedKong ?? null;
    const next = cloneState(state);
    logDecision(next, { seat: offer.seat, type: "win" }, next.players[offer.seat].isBot ? "bot" : "player");
    // The winning tile completes the concealed hand for scoring.
    next.players[offer.seat].hand = sortCodes([...next.players[offer.seat].hand, offer.tile]);
    next.phase = "complete";
    next.winnerSeat = offer.seat;
    next.winContext = robbing ? "rob-kong" : "discard";
    next.payerSeat = robbing ? robbing.seat : state.claimWindow.discard.seat;
    next.claimWindow = null;
    logWinScore(next);
    next.eventLog.push(
      robbing
        ? `${next.players[offer.seat].name} robbed the kong on ${displayCode(offer.tile)}.`
        : `${next.players[offer.seat].name} claimed Win on ${displayCode(offer.tile)}.`,
    );
    return next;
  }

  const next = cloneState(state);
  const player = next.players[offer.seat];
  logDecision(next, { seat: offer.seat, type: offer.action }, player.isBot ? "bot" : "player");
  if (offer.action === "chi") {
    const sequence = (offer.tiles as [string, string, string] | undefined) ?? claimSequenceFor(player.hand, offer.tile);
    if (!sequence) {
      return { ...state, eventLog: [...state.eventLog, "Chi is no longer available."] };
    }
    player.hand = removeTiles(player.hand, sequence.filter((tile) => tile !== offer.tile));
    player.melds.push(`chow ${sequence.join(" ")}`);
  }

  if (offer.action === "pong") {
    player.hand = removeTiles(player.hand, [offer.tile, offer.tile]);
    player.melds.push(`pung ${offer.tile}`);
  }

  if (offer.action === "kong") {
    player.hand = removeTiles(player.hand, [offer.tile, offer.tile, offer.tile]);
    player.melds.push(`kong ${offer.tile}`);
    drawForSeat(next, offer.seat, "dead");
  }

  next.claimWindow = null;
  if (next.phase !== "complete") {
    next.turnSeat = offer.seat;
  }
  logEvent(next, { type: offer.action, seat: offer.seat, tile: offer.tile }, "system");
  next.eventLog.push(`${player.name} claimed ${offer.action.toUpperCase()} on ${displayCode(offer.tile)}.`);
  return next;
}

function resolvePassAction(state: MatchState, seat: Seat): MatchState {
  if (!state.claimWindow) {
    return state;
  }

  const next = cloneState(state);
  const window = next.claimWindow as MatchClaimWindow;
  logDecision(next, { seat, type: "pass" }, next.players[seat].isBot ? "bot" : "player");
  const remainingOffers = window.offers.filter((offer) => offer.seat !== seat);
  next.eventLog.push(`${next.players[seat].name} passed on ${displayCode(window.discard.tile)}.`);

  if (remainingOffers.length > 0) {
    next.claimWindow = { ...window, offers: remainingOffers };
    return resolveNextBotTurn(next);
  }

  next.claimWindow = null;
  if (window.addedKong) {
    return completeAddedKong(next, window.addedKong.seat, window.addedKong.tile);
  }
  return continueAfterUnclaimedDiscard(next, window.discard.seat);
}

function resolveKongDeclaration(state: MatchState, action: MatchActionInput): MatchState {
  const player = state.players[action.seat];

  // Explicit added kong: promote an existing exposed pung with a tile in hand.
  if (action.tile && player.melds.includes(`pung ${action.tile}`) && player.hand.includes(action.tile)) {
    return declareAddedKong(state, action.seat, action.tile);
  }

  const concealed = findConcealedKong(player.hand);
  if (concealed) {
    return resolveConcealedKongAction(state, action.seat, concealed);
  }

  const added = findAddedKong(player);
  if (added) {
    return declareAddedKong(state, action.seat, added);
  }

  return {
    ...cloneState(state),
    eventLog: [...state.eventLog, "Kong is not available right now."],
  };
}

function resolveConcealedKongAction(state: MatchState, seat: Seat, tile: string): MatchState {
  const next = cloneState(state);
  const player = next.players[seat];
  logDecision(next, { seat, type: "kong", tile }, player.isBot ? "bot" : "player");
  player.hand = removeTiles(player.hand, [tile, tile, tile, tile]);
  player.melds.push(`kong ${tile}`);
  drawForSeat(next, seat, "dead");
  logEvent(next, { type: "concealed-kong", seat, tile }, "system");
  if (next.phase !== "complete") {
    next.turnSeat = seat;
  }
  next.eventLog.push(`${player.name} declared concealed KONG on ${displayCode(tile)}.`);
  return next;
}

function declareAddedKong(state: MatchState, seat: Seat, tile: string): MatchState {
  const next = cloneState(state);
  logDecision(next, { seat, type: "kong", tile }, next.players[seat].isBot ? "bot" : "player");
  logEvent(next, { type: "added-kong", seat, tile }, "system");
  next.eventLog.push(`${next.players[seat].name} declared added KONG on ${displayCode(tile)}.`);

  const offers = robKongOffers(next, seat, tile);
  if (offers.length > 0) {
    next.claimWindow = { discard: { seat, tile }, offers, addedKong: { seat, tile } };
    logEvent(next, { type: "rob-kong-window", seat, tile }, "system");
    next.eventLog.push(`Rob-the-kong window opened on ${displayCode(tile)}.`);
    return next;
  }

  return completeAddedKong(next, seat, tile);
}

function completeAddedKong(state: MatchState, seat: Seat, tile: string): MatchState {
  const player = state.players[seat];
  player.melds = player.melds.map((meld) => (meld === `pung ${tile}` ? `kong ${tile}` : meld));
  player.hand = removeTiles(player.hand, [tile]);
  drawForSeat(state, seat, "dead");
  logEvent(state, { type: "added-kong-complete", seat, tile }, "system");
  if (state.phase !== "complete") {
    state.turnSeat = seat;
    state.eventLog.push(`${player.name} completed the kong and must discard.`);
  }
  return state;
}

export function resolveNextBotTurn(state: MatchState): MatchState {
  if (state.phase === "complete") {
    return state;
  }

  if (state.claimWindow) {
    const localOffers = state.claimWindow.offers.filter((offer) => offer.seat === 0);
    if (localOffers.length > 0) {
      return state;
    }

    const [botClaim] = claimPriorityOrder(
      state.claimWindow.offers.map((offer) => ({ seat: offer.seat, action: offer.action })),
    );
    return botClaim ? resolveMatchAction(state, { seat: botClaim.seat, type: botClaim.action }) : state;
  }

  if (!state.players[state.turnSeat].isBot) {
    return state;
  }

  const seat = state.turnSeat;
  const player = state.players[seat];
  const { gatePass } = scoreWin(state, seat, player.hand, "self-draw");
  if (gatePass) {
    return resolveMatchAction(state, { seat, type: "win" });
  }

  const discard = chooseBotDiscard(player.hand, seat);
  return resolveMatchAction(state, { seat, type: "discard", tile: discard });
}

export function claimPriorityOrder(claims: MatchClaimIntent[]): MatchClaimIntent[] {
  const priority: Record<MatchClaimOffer["action"], number> = {
    win: 0,
    kong: 1,
    pong: 2,
    chi: 3,
  };
  return [...claims].sort((left, right) => priority[left.action] - priority[right.action] || left.seat - right.seat);
}

function isHighestPriorityOffer(offers: MatchClaimOffer[], offer: MatchClaimOffer): boolean {
  const [top] = claimPriorityOrder(offers.map((claim) => ({ seat: claim.seat, action: claim.action })));
  return top?.seat === offer.seat && top.action === offer.action;
}

// ---------------------------------------------------------------------------
// Audit log + replay
// ---------------------------------------------------------------------------

function logEvent(
  state: MatchState,
  action: { type: string; seat?: Seat; tile?: string; fan?: number },
  source: "player" | "bot" | "system",
): void {
  const payload: Record<string, string | number> = {};
  if (action.tile !== undefined) {
    payload.tile = action.tile;
  }
  if (action.fan !== undefined) {
    payload.fan = action.fan;
  }
  state.auditLog = appendMatchEvent(state.auditLog, {
    occurredAt: state.auditLog.length + 1,
    source,
    action: { type: action.type, actorSeat: action.seat, payload },
  });
}

function logDecision(state: MatchState, input: MatchActionInput, source: "player" | "bot" | "system"): void {
  logEvent(state, { type: input.type, seat: input.seat, tile: input.tile }, source);
}

/** Extracts the ordered decision inputs from an audit log (drops derived events). */
export function decisionsFromAuditLog(auditLog: readonly MatchEvent[]): MatchActionInput[] {
  return auditLog
    .filter((event) => DECISION_TYPES.has(event.action.type) && event.action.actorSeat !== undefined)
    .map((event) => {
      const tile = event.action.payload?.tile;
      return {
        seat: event.action.actorSeat as Seat,
        type: event.action.type as MatchActionType,
        ...(typeof tile === "string" ? { tile } : {}),
      };
    });
}

/** Deterministically reconstructs a match from its seed and recorded decisions. */
export function replayMatch(seed: string, decisions: readonly MatchActionInput[], options: CreateMatchOptions = {}): MatchState {
  let state = createMatchState(seed, options);
  for (const decision of decisions) {
    state = resolveMatchAction(state, decision);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Scoring helpers (fan gate)
// ---------------------------------------------------------------------------

function scoreWin(state: MatchState, seat: Seat, hand: string[], context: SettlementContext) {
  const player = state.players[seat];
  const flowerCount = player.flowers.filter((tile) => tile.startsWith("f")).length;
  const seasonCount = player.flowers.filter((tile) => tile.startsWith("t")).length;
  const score = scoreOldHongKongFan({
    codes: hand,
    melds: player.melds,
    selfDraw: context === "self-draw",
    concealed: player.melds.length === 0,
    seatWind: seatWinds[seat],
    roundWind: state.roundWind,
    winContext: context,
    flowerCount,
    seasonCount,
  });
  return { score, gatePass: meetsFanGate(score, state.mode) };
}

function logWinScore(state: MatchState): void {
  if (state.winnerSeat === null || state.winContext === null) {
    return;
  }
  const { score } = scoreWin(state, state.winnerSeat, state.players[state.winnerSeat].hand, state.winContext);
  logEvent(state, { type: "score", seat: state.winnerSeat, fan: score.totalFan }, "system");
}

function robKongOffers(state: MatchState, kongSeat: Seat, tile: string): MatchClaimOffer[] {
  const offers: MatchClaimOffer[] = [];
  for (const player of state.players) {
    if (player.seat === kongSeat) {
      continue;
    }
    const { gatePass } = scoreWin(state, player.seat, [...player.hand, tile], "rob-kong");
    if (gatePass) {
      offers.push({ seat: player.seat, action: "win", tile });
    }
  }
  return offers;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function createPlayer(seat: Seat): MatchPlayerState {
  return {
    seat,
    name: playerNames[seat],
    avatar: avatars[seat],
    hand: [],
    discards: [],
    melds: [],
    flowers: [],
    isBot: seat !== 0,
  };
}

function buildClaimWindow(state: MatchState, discard: MatchDiscard): MatchClaimWindow | null {
  const offers = state.players.flatMap((player) => claimOffersForPlayer(state, player, discard));
  return offers.length > 0 ? { discard, offers } : null;
}

function claimOffersForPlayer(state: MatchState, player: MatchPlayerState, discard: MatchDiscard): MatchClaimOffer[] {
  if (player.seat === discard.seat) {
    return [];
  }

  const offers: MatchClaimOffer[] = [];
  const handWithDiscard = [...player.hand, discard.tile];
  const count = player.hand.filter((tile) => tile === discard.tile).length;

  const { gatePass } = scoreWin(state, player.seat, handWithDiscard, "discard");
  if (gatePass) {
    offers.push({ seat: player.seat, action: "win", tile: discard.tile });
  }
  if (count >= 3) {
    offers.push({ seat: player.seat, action: "kong", tile: discard.tile, tiles: [discard.tile, discard.tile, discard.tile, discard.tile] });
  }
  if (count >= 2) {
    offers.push({ seat: player.seat, action: "pong", tile: discard.tile, tiles: [discard.tile, discard.tile, discard.tile] });
  }
  const chiSequence = nextSeatOf(discard.seat) === player.seat ? claimSequenceFor(player.hand, discard.tile) : null;
  if (chiSequence) {
    offers.push({ seat: player.seat, action: "chi", tile: discard.tile, tiles: chiSequence });
  }

  return offers;
}

/** Raw deal draw (no bonus handling); bonuses are revealed after the deal. */
function drawRaw(state: MatchState): string {
  const tile = state.wall.shift();
  if (!tile) {
    throw new Error("Match wall exhausted during deal");
  }
  return tile;
}

/** Draws a usable (non-bonus) tile into a seat, parking flowers/seasons and
 *  drawing replacements from the dead wall. Marks the hand complete if exhausted. */
function drawForSeat(state: MatchState, seat: Seat, source: "wall" | "dead" = "wall"): void {
  let pool: "wall" | "dead" = source;
  for (;;) {
    const tiles = pool === "dead" ? state.deadWall : state.wall;
    if (tiles.length === 0) {
      state.phase = "complete";
      logEvent(state, { type: "wall-exhausted", seat }, "system");
      state.eventLog.push("The wall is exhausted.");
      return;
    }
    const tile = tiles.shift() as string;
    if (isBonusCode(tile)) {
      state.players[seat].flowers = sortCodes([...state.players[seat].flowers, tile]);
      logEvent(state, { type: "bonus-replace", seat, tile }, "system");
      state.eventLog.push(`${state.players[seat].name} revealed ${displayCode(tile)} (draws a replacement).`);
      pool = "dead";
      continue;
    }
    state.players[seat].hand = sortCodes([...state.players[seat].hand, tile]);
    logEvent(state, { type: "draw", seat, tile }, state.players[seat].isBot ? "bot" : "player");
    return;
  }
}

/** Reveals any flowers/seasons already in a seat's hand, replacing from the dead wall. */
function revealBonusesForSeat(state: MatchState, seat: Seat): void {
  const player = state.players[seat];
  for (;;) {
    const bonusIndex = player.hand.findIndex(isBonusCode);
    if (bonusIndex === -1) {
      break;
    }
    const tile = player.hand[bonusIndex];
    player.hand = [...player.hand.slice(0, bonusIndex), ...player.hand.slice(bonusIndex + 1)];
    player.flowers = sortCodes([...player.flowers, tile]);
    logEvent(state, { type: "bonus-replace", seat, tile }, "system");
    const replacement = state.deadWall.shift();
    if (!replacement) {
      break;
    }
    player.hand = [...player.hand, replacement];
  }
  player.hand = sortCodes(player.hand);
}

function continueAfterUnclaimedDiscard(state: MatchState, discardSeat: Seat): MatchState {
  const nextSeat = nextSeatOf(discardSeat);
  drawForSeat(state, nextSeat, "wall");
  if (state.phase !== "complete") {
    state.turnSeat = nextSeat;
    state.eventLog.push(`${state.players[nextSeat].name} drew from the wall.`);
  }
  return state;
}

function discardFromSeat(state: MatchState, seat: Seat, tile: string): void {
  const hand = state.players[seat].hand;
  const index = hand.indexOf(tile);
  if (index === -1) {
    return;
  }
  state.players[seat].hand = [...hand.slice(0, index), ...hand.slice(index + 1)];
  state.players[seat].discards = [...state.players[seat].discards, tile];
  logEvent(state, { type: "discard", seat, tile }, "system");
}

function chooseBotDiscard(hand: string[], seat: Seat): string {
  const sorted = sortCodes(hand);
  const honor = sorted.find((tile) => honors.includes(tile as (typeof honors)[number]));
  return honor ?? sorted[(seat + sorted.length - 1) % sorted.length];
}

function findConcealedKong(hand: string[]): string | null {
  for (const [tile, count] of countsByCode(hand)) {
    if (count >= 4) {
      return tile;
    }
  }
  return null;
}

function findAddedKong(player: MatchPlayerState): string | null {
  for (const meld of player.melds) {
    const [kind, tile] = meld.split(" ");
    if (kind === "pung" && player.hand.includes(tile)) {
      return tile;
    }
  }
  return null;
}

function nextSeatOf(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

function claimSequenceFor(hand: string[], tile: string): [string, string, string] | null {
  const suit = tile[0];
  const rank = Number(tile.slice(1));
  if (!suits.includes(suit as (typeof suits)[number])) {
    return null;
  }

  const candidates: Array<[string, string, string]> = [
    [`${suit}${rank - 2}`, `${suit}${rank - 1}`, tile],
    [`${suit}${rank - 1}`, tile, `${suit}${rank + 1}`],
    [tile, `${suit}${rank + 1}`, `${suit}${rank + 2}`],
  ];

  return (
    candidates.find((sequence) =>
      sequence
        .filter((code) => code !== tile)
        .every((code) => Number(code.slice(1)) >= 1 && Number(code.slice(1)) <= 9 && hand.includes(code)),
    ) ?? null
  );
}

function removeTiles(hand: string[], tiles: string[]): string[] {
  let next = [...hand];
  for (const tile of tiles) {
    const index = next.indexOf(tile);
    if (index !== -1) {
      next = [...next.slice(0, index), ...next.slice(index + 1)];
    }
  }
  return sortCodes(next);
}

function buildWall(): string[] {
  const tiles: string[] = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 9; rank += 1) {
      tiles.push(...Array.from({ length: 4 }, () => `${suit}${rank}`));
    }
  }
  for (const honor of honors) {
    tiles.push(...Array.from({ length: 4 }, () => honor));
  }
  tiles.push(...flowers, ...seasons);
  return tiles;
}

function shuffle(wall: string[], seed: string): string[] {
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

function isBonusCode(code: string): boolean {
  return code.startsWith("f") || code.startsWith("t");
}

function countsByCode(codes: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

function sortCodes(codes: string[]): string[] {
  return [...codes].sort((left, right) => codeOrder(left) - codeOrder(right));
}

function codeOrder(code: string): number {
  const suitOrder: Record<string, number> = { m: 0, p: 20, s: 40, w: 60, d: 70, f: 80, t: 90 };
  return (suitOrder[code[0]] ?? 100) + Number(code.slice(1).replace(/\D/g, "")) + code.charCodeAt(1) / 1000;
}

function displayCode(code: string): string {
  return code.toUpperCase();
}

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    wall: [...state.wall],
    deadWall: [...state.deadWall],
    claimWindow: state.claimWindow
      ? {
          discard: { ...state.claimWindow.discard },
          offers: state.claimWindow.offers.map((offer) => ({ ...offer })),
          ...(state.claimWindow.addedKong ? { addedKong: { ...state.claimWindow.addedKong } } : {}),
        }
      : null,
    eventLog: [...state.eventLog],
    auditLog: [...state.auditLog],
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      discards: [...player.discards],
      melds: [...player.melds],
      flowers: [...player.flowers],
    })) as MatchState["players"],
  };
}
