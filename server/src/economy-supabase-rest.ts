import type { CatalogItem, Currency, DailyMission, DailyReward, LedgerEntry, LedgerSource, SpinReward, Wallet } from "@mahjong/shared-types";
import coinPacks from "./economy/config/coinPacks.json";
import cosmetics from "./economy/config/cosmetics.json";
import dailyMissions from "./economy/config/dailyMissions.json";
import dailyRewards from "./economy/config/dailyRewards.json";
import gemPacks from "./economy/config/gemPacks.json";
import offers from "./economy/config/offers.json";
import spinWheel from "./economy/config/spinWheel.json";
import type {
  EconomyCatalog,
  EconomyService,
  MutationResult,
} from "./economy-service";

interface SupabaseRestOptions {
  url: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
}

export function createSupabaseRestEconomyService(options: SupabaseRestOptions): EconomyService {
  const client = new SupabaseRestClient(options);

  return {
    async getWallet(userId) {
      const rows = await client.get<WalletRow[]>("/wallets", {
        select: "coins,gems",
        user_id: `eq.${userId}`,
        limit: "1",
      });
      return rows[0] ? { coins: rows[0].coins, gems: rows[0].gems } : { coins: 0, gems: 0 };
    },
    async getLedger(userId) {
      const rows = await client.get<LedgerRow[]>("/economy_ledger", {
        select: "*",
        user_id: `eq.${userId}`,
        order: "created_at.desc",
      });
      return rows.map(mapLedger);
    },
    async getMatchHistory() {
      const rows = await client.get<MatchHistoryRow[]>("/match_history", {
        select: "match_id,settlement,completed_at,started_at",
        order: "started_at.desc",
        limit: "100",
      });
      return rows.map((row) => ({
        matchId: row.match_id,
        deltas: Array.isArray(row.settlement?.deltas) ? row.settlement.deltas : [],
        createdAt: row.completed_at ?? row.started_at,
      }));
    },
    catalog,
    async mutate(userId, currency, amount, source, metadata) {
      await ensureGuestUser(client, userId);
      return mutateWallet(client, userId, currency, amount, source, metadata);
    },
    async settle(matchId, deltas, options = {}) {
      const sum = deltas.reduce((total, delta) => total + delta.amount, 0);
      if (sum !== 0 && !options.allowHouseDelta) {
        throw new Error("Settlement deltas must sum to zero");
      }

      const result = normalizeRpcRow(
        await client.post<AtomicSettlementRow>("/rpc/service_settle_match", {
          target_match_id: matchId,
          settlement_deltas: deltas,
          allow_house_delta: options.allowHouseDelta ?? false,
        }),
      );
      return {
        wallets: result.wallets,
        ledgers: result.ledgers.map(mapLedger),
      };
    },
    async buy(userId, itemId) {
      const item = [...(coinPacks as CatalogItem[]), ...(cosmetics as CatalogItem[])].find((entry) => entry.id === itemId);
      if (!item) {
        throw new Error("Catalog item not found");
      }

      await ensureGuestUser(client, userId);
      await mutateWallet(client, userId, "gems", -item.gemCost, "shop-spend", { itemId });
      if (item.kind === "coin-pack") {
        const result = await mutateWallet(client, userId, "coins", item.coinGrant, "coin-pack", { itemId });
        return { wallet: result.wallet, granted: { kind: "coins", amount: item.coinGrant } };
      }

      await client.post(
        "/inventory",
        {
          user_id: userId,
          item_id: item.id,
          item_type: "tile-set",
          rarity: item.rarity ?? "common",
        },
        { on_conflict: "user_id,item_id" },
        "resolution=ignore-duplicates,return=minimal",
      );
      return { wallet: await getWallet(client, userId), granted: { kind: "cosmetic", itemId: item.id } };
    },
    async claimDaily(userId) {
      await ensureGuestUser(client, userId);
      const state = await getDailyState(client, userId);
      const today = currentDateKey();
      if (state.reward_date === today) {
        throw new Error("Daily reward already claimed");
      }

      const streak = nextStreak(state.reward_date, today, state.streak);
      const reward = (dailyRewards as DailyReward[])[(streak - 1) % dailyRewards.length];
      await client.patch(
        "/daily_state",
        { reward_date: today, streak, updated_at: new Date().toISOString() },
        { user_id: `eq.${userId}` },
      );
      if (reward.rewardCoins > 0) {
        await mutateWallet(client, userId, "coins", reward.rewardCoins, "daily-login", { streak });
      }
      if (reward.rewardGems > 0) {
        await mutateWallet(client, userId, "gems", reward.rewardGems, "daily-login", { streak });
      }
      return { wallet: await getWallet(client, userId), reward, streak };
    },
    async rewardAd(userId) {
      await ensureGuestUser(client, userId);
      const state = await getDailyState(client, userId);
      const today = currentDateKey();
      const adClaims = state.rewarded_ad_date === today ? state.rewarded_ad_count : 0;
      if (adClaims >= adRewards.length) {
        throw new Error("Rewarded ad cap reached");
      }

      const reward = adRewards[adClaims];
      await client.patch(
        "/daily_state",
        {
          rewarded_ad_date: today,
          rewarded_ad_count: adClaims + 1,
          updated_at: new Date().toISOString(),
        },
        { user_id: `eq.${userId}` },
      );
      if (reward.type === "coins" || reward.type === "gems") {
        await mutateWallet(client, userId, reward.type, reward.amount, "rewarded-ad");
      }
      return { wallet: await getWallet(client, userId), reward };
    },
    async spin(userId, random = Math.random()) {
      await ensureGuestUser(client, userId);
      const state = await getDailyState(client, userId);
      const today = currentDateKey();
      const spinClaims = state.spin_date === today ? state.spin_count : 0;
      if (spinClaims >= 1) {
        throw new Error("Lucky Draw already used today");
      }

      const reward = pickSpinReward(random);
      await client.patch(
        "/daily_state",
        {
          spin_date: today,
          spin_count: spinClaims + 1,
          updated_at: new Date().toISOString(),
        },
        { user_id: `eq.${userId}` },
      );
      if (reward.type === "coins" || reward.type === "gems") {
        await mutateWallet(client, userId, reward.type, reward.amount, "spin-wheel", { rewardType: reward.type, rewardAmount: reward.amount });
      }
      return { wallet: await getWallet(client, userId), reward, oddsShownAt: new Date().toISOString() };
    },
    async getDailyMissions(userId) {
      const today = currentDateKey();
      const rows = await client.get<DailyMissionProgressRow[]>("/daily_mission_progress", {
        select: "mission_id,progress,claimed",
        user_id: `eq.${userId}`,
        mission_date: `eq.${today}`,
      });
      return missionViews(rows);
    },
    async recordMissionProgress(userId, event) {
      await ensureGuestUser(client, userId);
      await client.post(
        "/rpc/service_record_daily_mission_progress",
        {
          target_user_id: userId,
          mission_event: event.type,
          increment_by: event.type === "claim-melds" ? event.count ?? 1 : 1,
        },
        {},
        "return=minimal",
      );
      return this.getDailyMissions(userId);
    },
    async claimMission(userId, missionId) {
      await ensureGuestUser(client, userId);
      const ledger = normalizeRpcRow(
        await client.post<LedgerRow>("/rpc/service_claim_daily_mission", {
          target_user_id: userId,
          mission_id: missionId,
        }),
      );
      const missions = await this.getDailyMissions(userId);
      const mission = missions.find((entry) => entry.id === missionId);
      if (!mission) {
        throw new Error("Mission not found");
      }
      return { wallet: await getWallet(client, userId), mission, ledger: mapLedger(ledger) };
    },
    async verifyPurchase(userId, packId = "gems-test-small") {
      const pack = (gemPacks as CatalogItem[]).find((entry) => entry.id === packId);
      if (!pack) {
        throw new Error("Gem pack not found");
      }
      await ensureGuestUser(client, userId);
      return mutateWallet(client, userId, "gems", 120, "purchase", { packId });
    },
  };
}

function catalog(): EconomyCatalog {
  return {
    gemPacks: gemPacks as CatalogItem[],
    coinPacks: coinPacks as CatalogItem[],
    cosmetics: cosmetics as CatalogItem[],
    offers,
  };
}

async function mutateWallet(
  client: SupabaseRestClient,
  userId: string,
  currency: Currency,
  amount: number,
  source: LedgerSource,
  metadata: Record<string, unknown> = {},
): Promise<MutationResult> {
  const ledger = normalizeRpcRow(
    await client.post<LedgerRow>("/rpc/service_mutate_wallet", {
      target_user_id: userId,
      target_currency: currency,
      delta: amount,
      ledger_source: source,
      ledger_metadata: metadata,
    }),
  );
  return { wallet: await getWallet(client, userId), ledger: mapLedger(ledger) };
}

async function ensureGuestUser(client: SupabaseRestClient, userId: string): Promise<void> {
  try {
    await client.post(
      "/rpc/service_ensure_guest_user",
      {
        target_user_id: userId,
      },
      {},
      "return=minimal",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("service_ensure_guest_user") || message.includes("PGRST202")) {
      return;
    }
    throw error;
  }
}

async function getWallet(client: SupabaseRestClient, userId: string): Promise<Wallet> {
  const rows = await client.get<WalletRow[]>("/wallets", {
    select: "coins,gems",
    user_id: `eq.${userId}`,
    limit: "1",
  });
  return rows[0] ? { coins: rows[0].coins, gems: rows[0].gems } : { coins: 0, gems: 0 };
}

async function getDailyState(client: SupabaseRestClient, userId: string): Promise<DailyStateRow> {
  await client.post(
    "/daily_state",
    { user_id: userId, streak: 0, rewarded_ad_count: 0 },
    { on_conflict: "user_id" },
    "resolution=ignore-duplicates,return=minimal",
  );
  const rows = await client.get<DailyStateRow[]>("/daily_state", {
    select: "*",
    user_id: `eq.${userId}`,
    limit: "1",
  });
  if (!rows[0]) {
    throw new Error("Daily state could not be loaded");
  }
  return {
    ...rows[0],
    spin_date: rows[0].spin_date ?? null,
    spin_count: rows[0].spin_count ?? 0,
  };
}

function mapLedger(row: LedgerRow): LedgerEntry {
  return {
    ledgerId: row.ledger_id,
    userId: row.user_id,
    currency: row.currency,
    amount: row.amount,
    source: row.source,
    balanceBefore: row.balance_before,
    balanceAfter: row.balance_after,
    createdAt: row.created_at,
    ...(row.metadata ? { metadata: row.metadata } : {}),
  };
}

function normalizeRpcRow<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function pickSpinReward(random: number): SpinReward {
  const wheel = spinWheel as Array<SpinReward & { weight: number }>;
  const totalWeight = wheel.reduce((total, reward) => total + reward.weight, 0);
  let roll = Math.max(0, Math.min(0.999999, random)) * totalWeight;
  return (
    wheel.find((entry) => {
      roll -= entry.weight;
      return roll < 0;
    }) ?? wheel[0]
  );
}

const dailyMissionTemplates = dailyMissions as DailyMission[];

function missionViews(rows: DailyMissionProgressRow[]): DailyMission[] {
  const byId = new Map(rows.map((row) => [row.mission_id, row]));
  return dailyMissionTemplates.map((mission) => {
    const row = byId.get(mission.id);
    return {
      ...mission,
      progress: Math.min(mission.target, row?.progress ?? 0),
      claimed: row?.claimed ?? false,
    };
  });
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

function currentDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

class SupabaseRestClient {
  private readonly baseUrl: string;
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SupabaseRestOptions) {
    this.baseUrl = options.url.replace(/\/$/, "");
    this.key = options.serviceRoleKey;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  get<T>(path: string, query: Record<string, string> = {}): Promise<T> {
    return this.request<T>("GET", path, undefined, query);
  }

  post<T = unknown>(
    path: string,
    body: unknown,
    query: Record<string, string> = {},
    prefer = "return=representation",
  ): Promise<T> {
    return this.request<T>("POST", path, body, query, prefer);
  }

  patch<T = unknown>(path: string, body: unknown, query: Record<string, string> = {}): Promise<T> {
    return this.request<T>("PATCH", path, body, query, "return=minimal");
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query: Record<string, string> = {},
    prefer?: string,
  ): Promise<T> {
    const search = new URLSearchParams(query);
    const response = await this.fetchImpl(`${this.baseUrl}/rest/v1${path}${search.size ? `?${search}` : ""}`, {
      method,
      headers: {
        apikey: this.key,
        authorization: `Bearer ${this.key}`,
        "content-type": "application/json",
        ...(prefer ? { prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (!response.ok) {
      const message = await response.text();
      throw new Error(`Supabase REST ${method} ${path} failed with HTTP ${response.status}: ${message}`);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

interface WalletRow {
  coins: number;
  gems: number;
}

interface LedgerRow {
  ledger_id: string;
  user_id: string;
  currency: Currency;
  amount: number;
  source: LedgerSource;
  balance_before: number;
  balance_after: number;
  created_at: string;
  metadata?: Record<string, unknown>;
}

interface MatchHistoryRow {
  match_id: string;
  settlement: { deltas?: number[] };
  completed_at: string | null;
  started_at: string;
}

interface AtomicSettlementRow {
  wallets: Record<string, Wallet>;
  ledgers: LedgerRow[];
}

interface DailyMissionProgressRow {
  mission_id: string;
  progress: number;
  claimed: boolean;
}

interface DailyStateRow {
  reward_date: string | null;
  streak: number;
  rewarded_ad_date: string | null;
  rewarded_ad_count: number;
  spin_date: string | null;
  spin_count: number;
}

const adRewards: SpinReward[] = [
  { type: "coins", amount: 120 },
  { type: "coins", amount: 160 },
  { type: "coins", amount: 220 },
];


