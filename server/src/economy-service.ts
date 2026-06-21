import type { CatalogItem, Currency, DailyMission, DailyReward, LedgerEntry, LedgerSource, SpinReward, Wallet } from "@mahjong/shared-types";
import coinPacks from "./economy/config/coinPacks.json";
import cosmetics from "./economy/config/cosmetics.json";
import dailyMissions from "./economy/config/dailyMissions.json";
import dailyRewards from "./economy/config/dailyRewards.json";
import gemPacks from "./economy/config/gemPacks.json";
import offers from "./economy/config/offers.json";
import spinWheel from "./economy/config/spinWheel.json";

export interface EconomyService {
  getWallet(userId: string): MaybePromise<Wallet>;
  getLedger(userId: string): MaybePromise<LedgerEntry[]>;
  getMatchHistory(): MaybePromise<MatchHistoryEntry[]>;
  catalog(): MaybePromise<EconomyCatalog>;
  mutate(userId: string, currency: Currency, amount: number, source: LedgerSource, metadata?: Record<string, unknown>): MaybePromise<MutationResult>;
  settle(matchId: string, deltas: SettlementDelta[], options?: SettlementOptions): MaybePromise<SettlementResult>;
  buy(userId: string, itemId: string): MaybePromise<PurchaseResult>;
  claimDaily(userId: string): MaybePromise<DailyClaimResult>;
  rewardAd(userId: string): MaybePromise<AdRewardResult>;
  spin(userId: string, random?: number): MaybePromise<SpinResult>;
  getDailyMissions(userId: string): MaybePromise<DailyMission[]>;
  recordMissionProgress(userId: string, event: MissionProgressEvent): MaybePromise<DailyMission[]>;
  claimMission(userId: string, missionId: string): MaybePromise<MissionClaimResult>;
  verifyPurchase(userId: string, packId?: string): MaybePromise<MutationResult>;
}

export type MaybePromise<T> = T | Promise<T>;

interface EconomyOptions {
  now?: () => number;
  id?: () => string;
  today?: () => string;
}

interface UserState {
  wallet: Wallet;
  ledger: LedgerEntry[];
  inventory: string[];
  dailyClaimDate: string | null;
  dailyStreak: number;
  adDate: string | null;
  adClaims: number;
  spinDate: string | null;
  spinClaims: number;
  missionDate: string | null;
  missions: Record<string, MissionState>;
}

export interface MatchHistoryEntry {
  matchId: string;
  deltas: number[];
  houseDelta?: number;
  createdAt: string;
}

export interface EconomyCatalog {
  gemPacks: CatalogItem[];
  coinPacks: CatalogItem[];
  cosmetics: CatalogItem[];
  offers: unknown[];
}

export interface MutationResult {
  wallet: Wallet;
  ledger: LedgerEntry;
}

export interface SettlementDelta {
  userId: string;
  amount: number;
}

export interface SettlementOptions {
  allowHouseDelta?: boolean;
}

export interface SettlementResult {
  wallets: Record<string, Wallet>;
  ledgers: LedgerEntry[];
}

export interface PurchaseResult {
  wallet: Wallet;
  granted: { kind: "coins"; amount: number } | { kind: "cosmetic"; itemId: string };
}

export interface DailyClaimResult {
  wallet: Wallet;
  reward: DailyReward;
  streak: number;
}

export interface AdRewardResult {
  wallet: Wallet;
  reward: SpinReward;
}

export interface SpinResult {
  wallet: Wallet;
  reward: SpinReward;
  oddsShownAt: string;
}

export type MissionProgressEvent =
  | { type: "play" }
  | { type: "win-with-pong" }
  | { type: "claim-melds"; count?: number };

export interface MissionClaimResult {
  wallet: Wallet;
  mission: DailyMission;
  ledger: LedgerEntry;
}

interface MissionState {
  progress: number;
  claimed: boolean;
}

const defaultWallet: Wallet = { coins: 0, gems: 0 };
const dailyMissionTemplates = dailyMissions as DailyMission[];

const adRewards: SpinReward[] = [
  { type: "coins", amount: 120 },
  { type: "coins", amount: 160 },
  { type: "coins", amount: 220 },
];

export function createEconomyService(options: EconomyOptions = {}): EconomyService {
  const users = new Map<string, UserState>();
  const matchHistory: MatchHistoryEntry[] = [];
  const settlementResults = new Map<string, SettlementResult>();
  const now = options.now ?? (() => Date.now());
  const id = options.id ?? (() => crypto.randomUUID());
  const today = options.today ?? (() => new Date(now()).toISOString().slice(0, 10));

  function stateFor(userId: string): UserState {
    const existing = users.get(userId);
    if (existing) {
      return existing;
    }

    const created: UserState = {
      wallet: { ...defaultWallet },
      ledger: [],
      inventory: [],
      dailyClaimDate: null,
      dailyStreak: 0,
      adDate: null,
      adClaims: 0,
      spinDate: null,
      spinClaims: 0,
      missionDate: null,
      missions: {},
    };
    users.set(userId, created);
    return created;
  }

  function mutate(userId: string, currency: Currency, amount: number, source: LedgerSource, metadata: Record<string, unknown> = {}): MutationResult {
    if (!Number.isInteger(amount) || amount === 0) {
      throw new Error("Ledger amount must be a non-zero integer");
    }

    const state = stateFor(userId);
    const balanceBefore = state.wallet[currency];
    const balanceAfter = balanceBefore + amount;
    if (balanceAfter < 0) {
      throw new Error(`Insufficient ${currency}`);
    }

    state.wallet = { ...state.wallet, [currency]: balanceAfter };
    const ledger: LedgerEntry = {
      ledgerId: id(),
      userId,
      currency,
      amount,
      source,
      balanceBefore,
      balanceAfter,
      createdAt: new Date(now()).toISOString(),
      ...(Object.keys(metadata).length > 0 ? { metadata: { ...metadata } } : {}),
    };
    state.ledger.push(ledger);
    return { wallet: { ...state.wallet }, ledger };
  }

  return {
    getWallet(userId) {
      return { ...stateFor(userId).wallet };
    },
    getLedger(userId) {
      return [...stateFor(userId).ledger];
    },
    getMatchHistory() {
      return [...matchHistory];
    },
    catalog() {
      return {
        gemPacks: gemPacks as CatalogItem[],
        coinPacks: coinPacks as CatalogItem[],
        cosmetics: cosmetics as CatalogItem[],
        offers,
      };
    },
    mutate,
    settle(matchId, deltas, options = {}) {
      const existing = settlementResults.get(matchId);
      if (existing) {
        return cloneSettlementResult(existing);
      }

      const sum = deltas.reduce((total, delta) => total + delta.amount, 0);
      if (sum !== 0 && !options.allowHouseDelta) {
        throw new Error("Settlement deltas must sum to zero");
      }

      const snapshots = new Map<string, Wallet>();
      for (const delta of deltas) {
        snapshots.set(delta.userId, { ...stateFor(delta.userId).wallet });
      }

      try {
        const ledgers = deltas
          .filter((delta) => delta.amount !== 0)
          .map((delta) => mutate(delta.userId, "coins", delta.amount, "table-settle").ledger);
        matchHistory.push({
          matchId,
          deltas: deltas.map((delta) => delta.amount),
          ...(sum !== 0 ? { houseDelta: -sum } : {}),
          createdAt: new Date(now()).toISOString(),
        });
        const result = {
          wallets: Object.fromEntries(deltas.map((delta) => [delta.userId, { ...stateFor(delta.userId).wallet }])),
          ledgers,
        };
        settlementResults.set(matchId, cloneSettlementResult(result));
        return result;
      } catch (error) {
        for (const [userId, wallet] of snapshots) {
          stateFor(userId).wallet = wallet;
        }
        throw error;
      }
    },
    buy(userId, itemId) {
      const item = [...(coinPacks as CatalogItem[]), ...(cosmetics as CatalogItem[])].find((entry) => entry.id === itemId);
      if (!item) {
        throw new Error("Catalog item not found");
      }

      const state = stateFor(userId);
      mutate(userId, "gems", -item.gemCost, "shop-spend");
      if (item.kind === "coin-pack") {
        const result = mutate(userId, "coins", item.coinGrant, "coin-pack");
        return { wallet: result.wallet, granted: { kind: "coins", amount: item.coinGrant } };
      }

      state.inventory.push(item.id);
      return { wallet: { ...state.wallet }, granted: { kind: "cosmetic", itemId: item.id } };
    },
    claimDaily(userId) {
      const state = stateFor(userId);
      const date = today();
      if (state.dailyClaimDate === date) {
        throw new Error("Daily reward already claimed");
      }

      state.dailyStreak = nextStreak(state.dailyClaimDate, date, state.dailyStreak);
      state.dailyClaimDate = date;
      const reward = (dailyRewards as DailyReward[])[(state.dailyStreak - 1) % dailyRewards.length];
      if (reward.rewardCoins > 0) {
        mutate(userId, "coins", reward.rewardCoins, "daily-login");
      }
      if (reward.rewardGems > 0) {
        mutate(userId, "gems", reward.rewardGems, "daily-login");
      }
      return { wallet: { ...state.wallet }, reward, streak: state.dailyStreak };
    },
    rewardAd(userId) {
      const state = stateFor(userId);
      const date = today();
      if (state.adDate !== date) {
        state.adDate = date;
        state.adClaims = 0;
      }
      if (state.adClaims >= adRewards.length) {
        throw new Error("Rewarded ad cap reached");
      }

      const reward = adRewards[state.adClaims];
      state.adClaims += 1;
      if (reward.type === "coins" || reward.type === "gems") {
        mutate(userId, reward.type, reward.amount, "rewarded-ad");
      }
      return { wallet: { ...state.wallet }, reward };
    },
    spin(userId, random = Math.random()) {
      const state = stateFor(userId);
      const date = today();
      if (state.spinDate !== date) {
        state.spinDate = date;
        state.spinClaims = 0;
      }
      if (state.spinClaims >= 1) {
        throw new Error("Lucky Draw already used today");
      }

      const wheel = spinWheel as Array<SpinReward & { weight: number }>;
      const totalWeight = wheel.reduce((total, reward) => total + reward.weight, 0);
      let roll = Math.max(0, Math.min(0.999999, random)) * totalWeight;
      const reward = wheel.find((entry) => {
        roll -= entry.weight;
        return roll < 0;
      }) ?? wheel[0];
      if (reward.type === "coins" || reward.type === "gems") {
        mutate(userId, reward.type, reward.amount, "spin-wheel", { rewardType: reward.type, rewardAmount: reward.amount });
      }
      state.spinClaims += 1;
      return {
        wallet: { ...stateFor(userId).wallet },
        reward,
        oddsShownAt: new Date(now()).toISOString(),
      };
    },
    getDailyMissions(userId) {
      return missionsFor(stateFor(userId), today());
    },
    recordMissionProgress(userId, event) {
      const state = stateFor(userId);
      const mission = missionForEvent(event);
      const missions = mutableMissionState(state, today());
      const current = missions[mission.id] ?? { progress: 0, claimed: false };
      const increment = event.type === "claim-melds" ? event.count ?? 1 : 1;
      missions[mission.id] = { ...current, progress: Math.min(mission.target, current.progress + increment) };
      return missionsFor(state, today());
    },
    claimMission(userId, missionId) {
      const state = stateFor(userId);
      const mission = dailyMissionTemplates.find((entry) => entry.id === missionId);
      if (!mission) {
        throw new Error("Mission not found");
      }
      const missions = mutableMissionState(state, today());
      const current = missions[missionId] ?? { progress: 0, claimed: false };
      if (current.claimed) {
        throw new Error("Mission already claimed");
      }
      if (current.progress < mission.target) {
        throw new Error("Mission incomplete");
      }
      missions[missionId] = { ...current, claimed: true };
      const result = mutate(userId, "coins", mission.rewardCoins, "mission", { missionId });
      return {
        wallet: result.wallet,
        mission: missionView(mission, missions[missionId]),
        ledger: result.ledger,
      };
    },
    verifyPurchase(userId, packId = "gems-test-small") {
      const pack = (gemPacks as CatalogItem[]).find((entry) => entry.id === packId);
      if (!pack) {
        throw new Error("Gem pack not found");
      }
      return mutate(userId, "gems", 120, "purchase");
    },
  };
}

function missionsFor(state: UserState, date: string): DailyMission[] {
  const missions = mutableMissionState(state, date);
  return dailyMissionTemplates.map((mission) => missionView(mission, missions[mission.id]));
}

function mutableMissionState(state: UserState, date: string): Record<string, MissionState> {
  if (state.missionDate !== date) {
    state.missionDate = date;
    state.missions = {};
  }
  return state.missions;
}

function missionView(template: DailyMission, state: MissionState | undefined): DailyMission {
  return {
    ...template,
    progress: Math.min(template.target, state?.progress ?? 0),
    claimed: state?.claimed ?? false,
  };
}

function missionForEvent(event: MissionProgressEvent): DailyMission {
  const missionId =
    event.type === "play" ? "play-hand" : event.type === "win-with-pong" ? "win-with-pong" : "claim-melds";
  const mission = dailyMissionTemplates.find((entry) => entry.id === missionId);
  if (!mission) {
    throw new Error("Mission not found");
  }
  return mission;
}

function nextStreak(lastClaimDate: string | null, claimDate: string, currentStreak: number): number {
  if (!lastClaimDate) {
    return 1;
  }
  return daysBetween(lastClaimDate, claimDate) === 1 ? currentStreak + 1 : 1;
}

function daysBetween(fromDate: string, toDate: string): number {
  const from = Date.parse(`${fromDate}T00:00:00.000Z`);
  const to = Date.parse(`${toDate}T00:00:00.000Z`);
  return Math.round((to - from) / 86_400_000);
}

function cloneSettlementResult(result: SettlementResult): SettlementResult {
  return {
    wallets: Object.fromEntries(Object.entries(result.wallets).map(([userId, wallet]) => [userId, { ...wallet }])),
    ledgers: result.ledgers.map((ledger) => ({ ...ledger })),
  };
}







