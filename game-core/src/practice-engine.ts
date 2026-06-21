import type { LegalAction, MatchIntent, MatchView, PlayerView, Seat } from "@mahjong/shared-types";

export type PracticePhase = "playing" | "complete";
export type PracticeKind = "ai" | "tutorial";
export type TutorialStage = "chi" | "pong" | "kong" | "win" | "standard-win";

export interface PracticeClaimOffer {
  actions: LegalAction[];
  tile: string;
  fromSeat: Seat;
  prompt: string;
  tilesByAction?: Partial<Record<Extract<LegalAction, "chi" | "pong" | "kong">, [string, string, string] | [string, string, string, string]>>;
}

export interface PracticePlayer {
  seat: Seat;
  name: string;
  avatar: string;
  wind: "E" | "S" | "W" | "N";
  isBot: boolean;
  hand: string[];
  discards: string[];
  melds: string[];
}

export interface PracticeMatchState {
  seed: string;
  kind: PracticeKind;
  turnSeat: Seat;
  handNumber: number;
  wall: string[];
  players: [PracticePlayer, PracticePlayer, PracticePlayer, PracticePlayer];
  eventLog: string[];
  phase: PracticePhase;
  winnerSeat: Seat | null;
  claimOffer: PracticeClaimOffer | null;
  tutorialStage: TutorialStage | null;
  pendingBotSeats: Seat[];
}

const winds = ["E", "S", "W", "N"] as const;
const playerNames = ["Lina", "Bo Bot", "Chen Bot", "Dewi Bot"] as const;
const avatars = ["L", "B", "C", "D"] as const;
const suits = ["m", "p", "s"] as const;
const honors = ["we", "ws", "ww", "wn", "dr", "dg", "dw"] as const;
const bonus = ["f1", "f2", "f3", "f4", "t1", "t2", "t3", "t4"] as const;

export function createPracticeMatch(seed: string): PracticeMatchState {
  const wall = shuffle(buildWall(), seed);
  const players: PracticeMatchState["players"] = [
    createPracticePlayer(0),
    createPracticePlayer(1),
    createPracticePlayer(2),
    createPracticePlayer(3),
  ];

  for (let drawIndex = 0; drawIndex < 13; drawIndex += 1) {
    for (const player of players) {
      player.hand.push(drawTile(wall));
    }
  }
  players[0].hand.push(drawTile(wall));
  for (const player of players) {
    player.hand = sortCodes(player.hand);
  }

  return {
    seed,
    kind: "ai",
    turnSeat: 0,
    handNumber: 1,
    wall,
    players,
    eventLog: ["Practice hand started. Your turn."],
    phase: "playing",
    winnerSeat: null,
    claimOffer: null,
    tutorialStage: null,
    pendingBotSeats: [],
  };
}

export function createTutorialMatch(): PracticeMatchState {
  const wall = buildWall();
  const players: PracticeMatchState["players"] = [
    createPracticePlayer(0),
    createPracticePlayer(1),
    createPracticePlayer(2),
    createPracticePlayer(3),
  ];

  for (const player of players) {
    player.hand = tutorialBackHand();
  }

  return applyTutorialStage({
    seed: "tutorial-script",
    kind: "tutorial",
    turnSeat: 0,
    handNumber: 1,
    wall,
    players,
    eventLog: [],
    phase: "playing",
    winnerSeat: null,
    claimOffer: null,
    tutorialStage: "chi",
    pendingBotSeats: [],
  }, "chi");
}

function createPracticePlayer(seat: Seat): PracticePlayer {
  return {
    seat,
    name: playerNames[seat],
    avatar: avatars[seat],
    wind: winds[seat],
    isBot: seat !== 0,
    hand: [],
    discards: [],
    melds: [],
  };
}

export function resolvePracticeAction(state: PracticeMatchState, intent: MatchIntent): PracticeMatchState {
  if (state.phase === "complete") {
    return state;
  }

  if (state.kind === "tutorial") {
    return resolveTutorialAction(state, intent);
  }

  if (state.claimOffer) {
    return resolveClaimAction(state, intent);
  }

  if (intent.type === "win" && isWinningCodes(state.players[0].hand)) {
    return {
      ...state,
      phase: "complete",
      winnerSeat: 0,
      eventLog: [...state.eventLog, "You declared a winning hand."],
    };
  }

  if (intent.type !== "discard") {
    return {
      ...state,
      eventLog: [...state.eventLog, `${labelIntent(intent.type)} is noted. Discard to advance practice.`],
    };
  }

  const tile = intent.tile ?? state.players[0].hand[0];
  if (!state.players[0].hand.includes(tile)) {
    return {
      ...state,
      eventLog: [...state.eventLog, "That tile is not in your hand."],
    };
  }

  let next = cloneState(state);
  discardFromSeat(next, 0, tile);
  next.eventLog.push(`You discarded ${displayCode(tile)}.`);
  next.pendingBotSeats = [1, 2, 3];
  next.turnSeat = 1;
  next.eventLog.push(`${next.players[1].name} is thinking.`);

  return next;
}

export function advancePracticeBotTurn(state: PracticeMatchState): PracticeMatchState {
  if (state.phase === "complete" || state.claimOffer || state.pendingBotSeats.length === 0) {
    return state;
  }

  const [seat, ...remainingSeats] = state.pendingBotSeats;
  let next = runBotTurn(state, seat);
  next.pendingBotSeats = remainingSeats;

  if (next.phase === "complete" || next.claimOffer) {
    return next;
  }

  if (remainingSeats.length > 0) {
    next.turnSeat = remainingSeats[0];
    next.eventLog.push(`${next.players[remainingSeats[0]].name} is thinking.`);
    return next;
  }

  if (next.wall.length === 0) {
    drawForSeat(next, 0);
    return next;
  }

  drawForSeat(next, 0);
  next.turnSeat = 0;
  next.players[0].hand = sortCodes(next.players[0].hand);
  next.eventLog.push("Your turn.");
  return next;
}

function resolveClaimAction(state: PracticeMatchState, intent: MatchIntent): PracticeMatchState {
  const offer = state.claimOffer;
  if (!offer || !offer.actions.includes(intent.type as LegalAction)) {
    return {
      ...state,
      eventLog: [...state.eventLog, "That claim is not available right now."],
    };
  }

  const next = cloneState(state);
  const player = next.players[0];
  if (intent.type === "chi") {
    const sequence = (offer.tilesByAction?.chi as [string, string, string] | undefined) ?? claimSequenceFor(player.hand, offer.tile);
    if (!sequence) {
      return { ...state, eventLog: [...state.eventLog, "Chi is no longer available."] };
    }
    player.hand = removeTiles(player.hand, sequence.filter((tile) => tile !== offer.tile));
    player.melds.push(`chow ${sequence.join(" ")}`);
  }

  if (intent.type === "pong") {
    player.hand = removeTiles(player.hand, [offer.tile, offer.tile]);
    player.melds.push(`pung ${offer.tile}`);
  }

  if (intent.type === "kong") {
    player.hand = removeTiles(player.hand, [offer.tile, offer.tile, offer.tile]);
    player.melds.push(`kong ${offer.tile}`);
  }

  next.claimOffer = null;
  next.pendingBotSeats = [];
  next.turnSeat = 0;
  next.eventLog.push(`You claimed ${labelIntent(intent.type)}. Discard one tile to continue.`);
  return next;
}

export function practiceToMatchView(state: PracticeMatchState): MatchView {
  const legalActions = legalActionsFor(state);

  return {
    handNumber: state.handNumber,
    mode: "3-fan",
    tableType: "friendly",
    turnSeat: state.turnSeat,
    mySeat: 0,
    timerSeconds: state.turnSeat === 0 ? 25 : 8,
    wallCount: state.wall.length,
    claimPrompt: state.claimOffer?.prompt ?? null,
    legalActions,
    myHand: state.players[0].hand,
    players: state.players.map(toPlayerView) as MatchView["players"],
    recentEvent: summarizeRecentEvents(state.eventLog),
  };
}

function legalActionsFor(state: PracticeMatchState): LegalAction[] {
  if (state.phase === "complete") {
    return [];
  }

  if (state.claimOffer) {
    return state.claimOffer.actions;
  }

  if (state.kind === "tutorial" && (state.tutorialStage === "win" || state.tutorialStage === "standard-win")) {
    return ["win"];
  }

  const actions: LegalAction[] = [];
  if (state.turnSeat === 0) {
    actions.push("discard");
    if (findConcealedKong(state.players[0].hand)) {
      actions.push("kong");
    }
  }

  if (isWinningCodes(state.players[0].hand)) {
    actions.push("win");
  }

  return actions;
}

function findConcealedKong(hand: string[]): string | null {
  for (const [code, count] of countsByCode(hand)) {
    if (count >= 4) {
      return code;
    }
  }
  return null;
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
    next = removeFirst(next, tile);
  }
  return sortCodes(next);
}

function removeFirst(hand: string[], tile: string): string[] {
  const index = hand.indexOf(tile);
  if (index === -1) {
    return hand;
  }
  return [...hand.slice(0, index), ...hand.slice(index + 1)];
}

function resolveTutorialAction(state: PracticeMatchState, intent: MatchIntent): PracticeMatchState {
  const stage = state.tutorialStage;
  const expectedAction = stage === "standard-win" ? "win" : stage;
  if (!stage || intent.type !== expectedAction) {
    return {
      ...state,
      eventLog: [...state.eventLog, "Follow the highlighted tutorial action to continue."],
    };
  }

  if (stage === "win") {
    return applyTutorialStage(state, "standard-win");
  }

  if (stage === "standard-win") {
    return {
      ...state,
      phase: "complete",
      winnerSeat: 0,
      claimOffer: null,
      eventLog: [...state.eventLog, "You declared the tutorial winning hand."],
    };
  }

  const nextStage: Record<Exclude<TutorialStage, "win" | "standard-win">, TutorialStage> = {
    chi: "pong",
    pong: "kong",
    kong: "win",
  };

  return applyTutorialStage(state, nextStage[stage]);
}

function applyTutorialStage(state: PracticeMatchState, stage: TutorialStage): PracticeMatchState {
  const players = state.players.map((player) => ({
    ...player,
    hand: [...player.hand],
    discards: [...player.discards],
    melds: [...player.melds],
  })) as PracticeMatchState["players"];

  players[0].hand = sortCodes(tutorialHandFor(stage));
  players[0].melds = tutorialMeldsFor(stage);
  for (const player of players.slice(1)) {
    player.discards = [];
  }

  const offer = tutorialOfferFor(stage);
  if (offer) {
    players[offer.fromSeat].discards = [offer.tile];
  }

  return {
    ...state,
    players,
    turnSeat: 0,
    handNumber: stage === "standard-win" ? 2 : 1,
    tutorialStage: stage,
    claimOffer: offer,
    eventLog: [tutorialEventFor(stage)],
  };
}

function tutorialOfferFor(stage: TutorialStage): PracticeClaimOffer | null {
  if (stage === "chi") {
    return {
      actions: ["chi"],
      tile: "m1",
      fromSeat: 1,
      prompt: "Tutorial: Bo Bot discarded 1M. Chi uses your 2M and 3M to complete a 1-2-3 sequence.",
      tilesByAction: { chi: ["m1", "m2", "m3"] },
    };
  }

  if (stage === "pong") {
    return {
      actions: ["pong"],
      tile: "p5",
      fromSeat: 2,
      prompt: "Tutorial: Chen Bot discarded 5P. Pong turns your pair of 5P into three matching tiles.",
      tilesByAction: { pong: ["p5", "p5", "p5"] },
    };
  }

  if (stage === "kong") {
    return {
      actions: ["kong"],
      tile: "s9",
      fromSeat: 3,
      prompt: "Tutorial: you have four 9S tiles. Kong declares the full four-of-a-kind set.",
      tilesByAction: { kong: ["s9", "s9", "s9", "s9"] },
    };
  }

  return null;
}

function tutorialHandFor(stage: TutorialStage): string[] {
  return {
    chi: ["m2", "m3", "m4", "m4", "p2", "p2", "p5", "p5", "s7", "s8", "s9", "dr", "dg"],
    pong: ["m4", "m4", "p2", "p2", "p5", "p5", "s7", "s8", "s9", "dr", "dg", "dw", "dw"],
    kong: ["m4", "m4", "p2", "p2", "s7", "s8", "s9", "s9", "s9", "s9", "dr", "dw", "dw"],
    win: ["m1", "m1", "m2", "m2", "m3", "m3", "p4", "p4", "p5", "p5", "s6", "s6", "dr", "dr"],
    "standard-win": ["m1", "m2", "m3", "p2", "p3", "p4", "s5", "s6", "s7", "dr", "dr", "dr", "we", "we"],
  }[stage];
}

function tutorialMeldsFor(stage: TutorialStage): string[] {
  return {
    chi: [],
    pong: ["chow m1 m2 m3"],
    kong: ["chow m1 m2 m3", "pung p5"],
    win: ["chow m1 m2 m3", "pung p5", "kong s9"],
    "standard-win": [],
  }[stage];
}

function tutorialEventFor(stage: TutorialStage): string {
  return {
    chi: "Tutorial step 1: Chi is available because you can complete a suited sequence.",
    pong: "Tutorial step 2: Pong is available because you hold a matching pair.",
    kong: "Tutorial step 3: Kong is available because you hold four matching tiles.",
    win: "Tutorial scenario 1 final step: this seven-pairs hand is complete, so Win is available.",
    "standard-win": "Scenario 2: the board restarted with a four-melds-and-a-pair winning hand. Tap Win.",
  }[stage];
}

function tutorialBackHand(): string[] {
  return ["m1", "m2", "m3", "p1", "p2", "p3", "s1", "s2", "s3", "dr", "dg", "dw", "we"];
}

function summarizeRecentEvents(events: string[]): string {
  const recent = events.slice(-4);
  return recent.join(" ");
}

export function isWinningCodes(codes: string[]): boolean {
  if (codes.length % 3 !== 2) {
    return false;
  }

  const baseCodes = codes.filter((code) => !code.startsWith("f") && !code.startsWith("t"));
  if (baseCodes.length !== codes.length) {
    return false;
  }

  const counts = countsByCode(baseCodes);
  const pairCount = [...counts.values()].filter((count) => count === 2).length;
  if (baseCodes.length === 14 && pairCount === 7) {
    return true;
  }

  for (const [code, count] of counts) {
    if (count < 2) {
      continue;
    }
    const withoutPair = new Map(counts);
    withoutPair.set(code, count - 2);
    if (canFormMelds(withoutPair)) {
      return true;
    }
  }

  return false;
}

function buildWall(): string[] {
  const kinds: string[] = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 9; rank += 1) {
      kinds.push(`${suit}${rank}`);
    }
  }
  kinds.push(...honors);

  return [...kinds.flatMap((kind) => Array.from({ length: 4 }, () => kind)), ...bonus];
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
    const normalized = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    return Math.floor(normalized * maxExclusive);
  };
}

function drawTile(wall: string[]): string {
  const tile = wall.shift();
  if (!tile) {
    throw new Error("Practice wall exhausted");
  }
  return tile;
}

function drawForSeat(state: PracticeMatchState, seat: Seat): void {
  if (state.wall.length === 0) {
    state.phase = "complete";
    state.eventLog.push("The wall is exhausted.");
    return;
  }
  state.players[seat].hand.push(drawTile(state.wall));
}

function runBotTurn(state: PracticeMatchState, seat: Seat): PracticeMatchState {
  const next = cloneState(state);
  next.turnSeat = seat;
  drawForSeat(next, seat);
  if (next.phase === "complete") {
    return next;
  }
  next.eventLog.push(`${next.players[seat].name} drew from the wall.`);

  if (isWinningCodes(next.players[seat].hand)) {
    next.phase = "complete";
    next.winnerSeat = seat;
    next.eventLog.push(`${next.players[seat].name} completed a basic winning hand.`);
    return next;
  }

  const discard = chooseBotDiscard(next.players[seat].hand, seat);
  discardFromSeat(next, seat, discard);
  next.eventLog.push(`${next.players[seat].name} discarded ${displayCode(discard)}.`);
  next.claimOffer = claimOfferForPlayer(next.players[0].hand, discard, seat);
  if (next.claimOffer) {
    next.turnSeat = 0;
    next.eventLog.push(next.claimOffer.prompt);
  }
  return next;
}

function claimOfferForPlayer(hand: string[], tile: string, fromSeat: Seat): PracticeClaimOffer | null {
  const actions: LegalAction[] = [];
  const count = hand.filter((code) => code === tile).length;

  const chiSequence = fromSeat === 3 ? claimSequenceFor(hand, tile) : null;
  if (chiSequence) {
    actions.push("chi");
  }
  if (count >= 2) {
    actions.push("pong");
  }
  if (count >= 3) {
    actions.push("kong");
  }

  if (actions.length === 0) {
    return null;
  }

  const tilesByAction: PracticeClaimOffer["tilesByAction"] = {};
  if (chiSequence) {
    tilesByAction.chi = chiSequence;
  }
  if (count >= 2) {
    tilesByAction.pong = [tile, tile, tile];
  }
  if (count >= 3) {
    tilesByAction.kong = [tile, tile, tile, tile];
  }

  return {
    actions,
    tile,
    fromSeat,
    tilesByAction,
    prompt: `${playerNames[fromSeat]} discarded ${displayCode(tile)}. ${actions.map(labelIntent).join(" or ")} is available.`,
  };
}

function chooseBotDiscard(hand: string[], seat: Seat): string {
  const sorted = sortCodes(hand);
  const ranked = sorted.map((tile, index) => ({ tile, index, cost: discardCost(tile, sorted) }));
  ranked.sort((left, right) => left.cost - right.cost || ((left.index + seat) % sorted.length) - ((right.index + seat) % sorted.length));
  return ranked[0]?.tile ?? sorted[0];
}

function discardCost(tile: string, hand: string[]): number {
  const copies = hand.filter((code) => code === tile).length;
  if (copies > 1) {
    return 10 + copies;
  }

  if (honors.includes(tile as (typeof honors)[number])) {
    return 0;
  }

  const suit = tile[0];
  const rank = Number(tile.slice(1));
  if (!Number.isInteger(rank)) {
    return 0;
  }

  let cost = -1;
  for (const other of hand) {
    if (other === tile || other[0] !== suit) {
      continue;
    }
    const distance = Math.abs(Number(other.slice(1)) - rank);
    if (distance === 1) {
      cost += 3;
    } else if (distance === 2) {
      cost += 1;
    }
  }
  return cost;
}

function discardFromSeat(state: PracticeMatchState, seat: Seat, tile: string): void {
  const hand = state.players[seat].hand;
  const index = hand.indexOf(tile);
  if (index === -1) {
    return;
  }
  state.players[seat].hand = [...hand.slice(0, index), ...hand.slice(index + 1)];
  state.players[seat].discards.push(tile);
}

function toPlayerView(player: PracticePlayer): PlayerView {
  return {
    seat: player.seat,
    name: player.name,
    avatar: player.avatar,
    wind: player.wind,
    isBot: player.isBot,
    handCount: player.hand.length,
    melds: player.melds,
    discards: player.discards,
    coinsDelta: 0,
    connected: true,
  };
}

function cloneState(state: PracticeMatchState): PracticeMatchState {
  return {
    ...state,
    wall: [...state.wall],
    eventLog: [...state.eventLog],
    pendingBotSeats: [...state.pendingBotSeats],
    players: state.players.map((player) => ({
      ...player,
      hand: [...player.hand],
      discards: [...player.discards],
      melds: [...player.melds],
    })) as PracticeMatchState["players"],
  };
}

function countsByCode(codes: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const code of codes) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return counts;
}

function canFormMelds(counts: Map<string, number>): boolean {
  const nextCode = [...counts.entries()].find(([, count]) => count > 0)?.[0];
  if (!nextCode) {
    return true;
  }

  const count = counts.get(nextCode) ?? 0;
  if (count >= 3) {
    const pungCounts = new Map(counts);
    pungCounts.set(nextCode, count - 3);
    if (canFormMelds(pungCounts)) {
      return true;
    }
  }

  const chow = chowFor(nextCode);
  if (chow && chow.every((code) => (counts.get(code) ?? 0) > 0)) {
    const chowCounts = new Map(counts);
    for (const code of chow) {
      chowCounts.set(code, (chowCounts.get(code) ?? 0) - 1);
    }
    if (canFormMelds(chowCounts)) {
      return true;
    }
  }

  return false;
}

function chowFor(code: string): [string, string, string] | null {
  const suit = code[0];
  const rank = Number(code.slice(1));
  if (!suits.includes(suit as (typeof suits)[number]) || rank > 7) {
    return null;
  }
  return [`${suit}${rank}`, `${suit}${rank + 1}`, `${suit}${rank + 2}`];
}

function sortCodes(codes: string[]): string[] {
  return [...codes].sort((left, right) => codeOrder(left) - codeOrder(right));
}

function codeOrder(code: string): number {
  const suitOrder: Record<string, number> = { m: 0, p: 20, s: 40, w: 60, d: 70 };
  return (suitOrder[code[0]] ?? 90) + Number(code.slice(1).replace(/\D/g, "")) + code.charCodeAt(1) / 1000;
}

function labelIntent(action: MatchIntent["type"]): string {
  return {
    chi: "Chi",
    pong: "Pong",
    kong: "Kong",
    win: "Win",
    discard: "Discard",
    emote: "Emote",
    pass: "Pass",
  }[action];
}

function displayCode(code: string): string {
  return code.toUpperCase();
}
