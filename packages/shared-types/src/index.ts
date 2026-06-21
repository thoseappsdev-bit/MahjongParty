export type Seat = 0 | 1 | 2 | 3;

export type Route =
  | "home"
  | "play"
  | "create"
  | "waiting"
  | "match"
  | "result"
  | "shop"
  | "daily"
  | "settings";

export interface Wallet {
  coins: number;
  gems: number;
}

export interface Profile {
  userId: string;
  displayName: string;
  avatar: string;
  level: number;
  locale: LocaleCode;
}

export type LocaleCode = "en" | "zh" | "id";
export type TableType = "friendly" | "coin";
export type TablePrivacy = "public" | "private";
export type GameMode = "1-fan" | "3-fan";

export interface TableConfig {
  mode: GameMode;
  tableType: TableType;
  privacy: TablePrivacy;
  timerSeconds: number;
  maxPlayers: 2 | 3 | 4;
  buyIn: number;
}

export const oldHongKongDefaultFanCap = 16;
export const oldHongKongMaxLossPayers = 3;

export function bankrollReserveFor(config: Pick<TableConfig, "tableType" | "buyIn">): number {
  if (config.tableType !== "coin" || config.buyIn <= 0) {
    return 0;
  }

  return config.buyIn * oldHongKongDefaultFanCap * oldHongKongMaxLossPayers;
}

export interface PublicTable {
  id: string;
  title: string;
  mode: GameMode;
  tableType: TableType;
  seatsTaken: number;
  maxPlayers: number;
  buyIn: number;
  host: string;
}

export interface LobbySeat {
  seat: Seat;
  userId: string | null;
  displayName: string | null;
  avatar: string | null;
  isBot: boolean;
  ready: boolean;
}

export interface RoomLobbyState {
  roomCode: string;
  hostUserId: string;
  seats: LobbySeat[];
  config: TableConfig;
}

export interface LanRoomSnapshot {
  roomCode: string;
  hostUserId: string;
  config: TableConfig;
  seats: LobbySeat[];
  match: MatchView | null;
  eventLog: string[];
  auditLog: LanAuditEntry[];
  phase: "waiting" | "playing" | "complete";
  result: MatchResult | null;
  updatedAt: number;
}

export type LanAuditEntryType = "create" | "join" | "start" | "action" | "leave" | "rematch";

export interface LanAuditEntry {
  id: string;
  at: number;
  type: LanAuditEntryType;
  actorUserId: string;
  seat: Seat | null;
  message: string;
}

export interface LanJoinResponse {
  room: LanRoomSnapshot;
  seat: Seat;
  userId: string;
}

export type LegalAction = "chi" | "pong" | "kong" | "win" | "discard";

export interface MatchIntent {
  type: LegalAction | "emote" | "pass";
  tile?: string;
}

export interface PlayerView {
  seat: Seat;
  name: string;
  avatar: string;
  wind: "E" | "S" | "W" | "N";
  isBot: boolean;
  handCount: number;
  melds: string[];
  discards: string[];
  coinsDelta: number;
  connected: boolean;
}

export interface MatchView {
  handNumber: number;
  mode: GameMode;
  tableType: TableType;
  turnSeat: Seat;
  mySeat: Seat;
  timerSeconds: number;
  wallCount: number;
  claimPrompt: string | null;
  legalActions: LegalAction[];
  myHand: string[];
  players: [PlayerView, PlayerView, PlayerView, PlayerView];
  recentEvent: string;
}

export interface FanLine {
  id: string;
  nameKey: string;
  fan: number;
}

export interface MatchResult {
  winnerSeat: Seat;
  winnerName: string;
  totalFan: number;
  fanLines: FanLine[];
  deltas: [number, number, number, number];
  policyCopy: string;
}

export type CatalogKind = "gem-pack" | "coin-pack" | "cosmetic";

export interface CatalogItem {
  id: string;
  kind: CatalogKind;
  title: string;
  description: string;
  priceLabel: string;
  gemCost: number;
  coinGrant: number;
  rarity?: "common" | "rare" | "epic" | "legendary";
}

export interface DailyReward {
  id: string;
  title: string;
  detail: string;
  rewardCoins: number;
  rewardGems: number;
  claimed: boolean;
}

export interface DailyStreakDay {
  day: number;
  rewardCoins: number;
  rewardGems: number;
  status: "claimed" | "today" | "upcoming";
}

export interface DailyMission {
  id: string;
  title: string;
  detail: string;
  progress: number;
  target: number;
  rewardCoins: number;
  claimed: boolean;
}

export type Currency = "gems" | "coins";

export type LedgerSource =
  | "purchase"
  | "coin-pack"
  | "table-buyin"
  | "table-settle"
  | "daily-login"
  | "rewarded-ad"
  | "spin-wheel"
  | "mission"
  | "shop-spend"
  | "admin";

export interface LedgerEntry {
  ledgerId: string;
  userId: string;
  currency: Currency;
  amount: number;
  source: LedgerSource;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface SpinReward {
  type: "coins" | "gems" | "fragment" | "chest";
  amount: number;
  itemId?: string;
}

export interface InventoryItem {
  itemId: string;
  itemType: "tile-set" | "table-skin" | "frame" | "emote" | "win-fx" | "title";
  rarity: "common" | "rare" | "epic" | "legendary";
  equipped: boolean;
}

