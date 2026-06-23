import type {
  CatalogItem,
  DailyMission,
  DailyReward,
  DailyStreakDay,
  MatchResult,
  MatchView,
  Profile,
  PublicTable,
  RoomLobbyState,
  TableConfig,
  Wallet,
} from "@mahjong/shared-types";
import type { MatchEvent } from "@mahjong/game-core";

export const profile: Profile = {
  userId: "u_local",
  displayName: "Lina",
  avatar: "L",
  level: 12,
  locale: "en",
};

export const wallet: Wallet = {
  coins: 128_400,
  gems: 540,
};

export const defaultTableConfig: TableConfig = {
  mode: "3-fan",
  tableType: "friendly",
  privacy: "private",
  timerSeconds: 25,
  maxPlayers: 4,
  buyIn: 0,
};

export const publicTables: PublicTable[] = [
  {
    id: "jade-814",
    title: "Lantern Room",
    mode: "3-fan",
    tableType: "friendly",
    seatsTaken: 2,
    maxPlayers: 4,
    buyIn: 0,
    host: "Mei",
  },
  {
    id: "riichi-103",
    title: "Riichi Beta Room",
    mode: "riichi",
    tableType: "friendly",
    seatsTaken: 1,
    maxPlayers: 4,
    buyIn: 0,
    host: "Ren",
  },
  {
    id: "coin-226",
    title: "Jade Coin Table",
    mode: "3-fan",
    tableType: "coin",
    seatsTaken: 3,
    maxPlayers: 4,
    buyIn: 2_000,
    host: "Arif",
  },
];

export const lobby: RoomLobbyState = {
  roomCode: "JADE42",
  hostUserId: "u_local",
  config: defaultTableConfig,
  seats: [
    { seat: 0, userId: "u_local", displayName: "Lina", avatar: "L", isBot: false, ready: true },
    { seat: 1, userId: "bot_bo", displayName: "Bo Bot", avatar: "B", isBot: true, ready: true },
    { seat: 2, userId: "bot_chen", displayName: "Chen Bot", avatar: "C", isBot: true, ready: true },
    { seat: 3, userId: "bot_dewi", displayName: "Dewi Bot", avatar: "D", isBot: true, ready: true },
  ],
};

export const initialMatchView: MatchView = {
  handNumber: 1,
  mode: "3-fan",
  tableType: "friendly",
  turnSeat: 0,
  mySeat: 0,
  timerSeconds: 25,
  wallCount: 68,
  claimPrompt: null,
  legalActions: ["chi", "pong", "kong", "win", "discard"],
  myHand: ["m1", "m2", "m3", "m5", "m6", "m7", "p2", "p3", "p4", "s8", "s8", "dr", "dr", "dr"],
  players: [
    {
      seat: 0,
      name: "Lina",
      avatar: "L",
      wind: "E",
      isBot: false,
      handCount: 14,
      melds: [],
      discards: ["s1", "wn"],
      coinsDelta: 0,
      connected: true,
    },
    {
      seat: 1,
      name: "Bo Bot",
      avatar: "B",
      wind: "S",
      isBot: true,
      handCount: 13,
      melds: ["pung dr"],
      discards: ["m9", "p1", "dg"],
      coinsDelta: 0,
      connected: true,
    },
    {
      seat: 2,
      name: "Chen Bot",
      avatar: "C",
      wind: "W",
      isBot: true,
      handCount: 13,
      melds: [],
      discards: ["s9", "m4"],
      coinsDelta: 0,
      connected: true,
    },
    {
      seat: 3,
      name: "Dewi Bot",
      avatar: "D",
      wind: "N",
      isBot: true,
      handCount: 13,
      melds: ["chow m1 m2 m3"],
      discards: ["p8", "we"],
      coinsDelta: 0,
      connected: true,
    },
  ],
  recentEvent: "Your turn: discard or declare win.",
};

export const mockAuditReplayEvents: MatchEvent[] = [
  {
    sequence: 1,
    occurredAt: "2026-06-19T08:00:00.000Z",
    source: "system",
    action: { type: "start", payload: { context: "East round hand 1 started with Lina as dealer" } },
  },
  {
    sequence: 2,
    occurredAt: "2026-06-19T08:00:04.000Z",
    source: "player",
    action: { type: "draw", actorSeat: 0, payload: { tile: "dr", context: "dealer opening draw" } },
  },
  {
    sequence: 3,
    occurredAt: "2026-06-19T08:00:08.000Z",
    source: "player",
    action: { type: "discard", actorSeat: 0, payload: { tile: "wn", context: "discarded from starting hand" } },
  },
  {
    sequence: 4,
    occurredAt: "2026-06-19T08:00:11.000Z",
    source: "bot",
    action: { type: "pong", actorSeat: 1, payload: { tile: "wn", fromSeat: 0 } },
  },
  {
    sequence: 5,
    occurredAt: "2026-06-19T08:00:15.000Z",
    source: "bot",
    action: { type: "discard", actorSeat: 1, payload: { tile: "dg", context: "after claimed pong" } },
  },
  {
    sequence: 6,
    occurredAt: "2026-06-19T08:00:20.000Z",
    source: "player",
    action: { type: "win", actorSeat: 0, payload: { tile: "dr", context: "self draw, all pungs and dragon pung" } },
  },
];
export const result: MatchResult = {
  winnerSeat: 0,
  winnerName: "Lina",
  totalFan: 5,
  fanLines: [
    { id: "all-pungs", nameKey: "fan.allPungs", fan: 3 },
    { id: "self-draw", nameKey: "fan.selfDraw", fan: 1 },
    { id: "dragon-pung", nameKey: "fan.dragonPung", fan: 1 },
  ],
  deltas: [6_000, -2_000, -2_000, -2_000],
  policyCopy: "Virtual coins have no cash value.",
};

export const catalog: CatalogItem[] = [
  {
    id: "coins-jade",
    kind: "coin-pack",
    title: "Jade Coin Pack",
    description: "A clean boost for coin tables.",
    priceLabel: "120 Gems",
    gemCost: 120,
    coinGrant: 45_000,
    rarity: "rare",
  },
  {
    id: "skin-old-hk",
    kind: "cosmetic",
    title: "Old Hong Kong Table",
    description: "Warm lantern wood and green felt.",
    priceLabel: "220 Gems",
    gemCost: 220,
    coinGrant: 0,
    rarity: "epic",
  },
  {
    id: "gems-starter",
    kind: "gem-pack",
    title: "Starter Gems",
    description: "Mock purchase for prototype only.",
    priceLabel: "Prototype",
    gemCost: 0,
    coinGrant: 0,
    rarity: "common",
  },
];

export const dailyRewards: DailyReward[] = [
  {
    id: "daily-login",
    title: "Daily Login",
    detail: "Day 3 streak",
    rewardCoins: 8_000,
    rewardGems: 0,
    claimed: false,
  },
];

export const dailyStreakDays: DailyStreakDay[] = [
  { day: 1, rewardCoins: 800, rewardGems: 0, status: "claimed" },
  { day: 2, rewardCoins: 1000, rewardGems: 0, status: "claimed" },
  { day: 3, rewardCoins: 1200, rewardGems: 0, status: "today" },
  { day: 4, rewardCoins: 1400, rewardGems: 0, status: "upcoming" },
  { day: 5, rewardCoins: 1600, rewardGems: 0, status: "upcoming" },
  { day: 6, rewardCoins: 1800, rewardGems: 0, status: "upcoming" },
  { day: 7, rewardCoins: 2000, rewardGems: 8, status: "upcoming" },
];

export const dailyMissions: DailyMission[] = [
  {
    id: "play-hand",
    title: "Play 1 hand",
    detail: "Finish any practice, friend, or coin hand.",
    progress: 0,
    target: 1,
    rewardCoins: 300,
    claimed: false,
  },
  {
    id: "win-with-pong",
    title: "Win with Pong",
    detail: "Complete a hand that includes at least one Pong.",
    progress: 0,
    target: 1,
    rewardCoins: 900,
    claimed: false,
  },
  {
    id: "claim-melds",
    title: "Claim 2 melds",
    detail: "Use Chi, Pong, or Kong twice across hands.",
    progress: 1,
    target: 2,
    rewardCoins: 500,
    claimed: false,
  },
];
