import { Pool, type PoolClient, type QueryResultRow } from "pg";
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
import { createSupabaseRestEconomyService } from "./economy-supabase-rest";

export function createConfiguredEconomyService(fallback: EconomyService): EconomyService {
  const connectionString = process.env.SUPABASE_DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceRoleKey) {
      return createSupabaseRestEconomyService({ url: supabaseUrl, serviceRoleKey });
    }

    return fallback;
  }

  return createPostgresEconomyService(new Pool({ connectionString, max: 5 }));
}

export function createPostgresEconomyService(pool: Pool): EconomyService {
  return {
    async getWallet(userId) {
      return getWallet(pool, userId);
    },
    async getLedger(userId) {
      const result = await pool.query<LedgerRow>(
        "select * from public.economy_ledger where user_id = $1::uuid order by created_at desc",
        [userId],
      );
      return result.rows.map(mapLedger);
    },
    async getMatchHistory() {
      const result = await pool.query<MatchHistoryRow>(
        "select match_id, settlement, completed_at, started_at from public.match_history order by started_at desc limit 100",
      );
      return result.rows.map((row) => ({
        matchId: row.match_id,
        deltas: Array.isArray(row.settlement?.deltas) ? row.settlement.deltas : [],
        createdAt: (row.completed_at ?? row.started_at).toISOString(),
      }));
    },
    catalog,
    async mutate(userId, currency, amount, source) {
      return mutateWallet(pool, userId, currency, amount, source);
    },
    async settle(matchId, deltas, options = {}) {
      const sum = deltas.reduce((total, delta) => total + delta.amount, 0);
      if (sum !== 0 && !options.allowHouseDelta) {
        throw new Error("Settlement deltas must sum to zero");
      }

      return transaction(pool, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [matchId]);
        const existing = await client.query<MatchHistoryRow>(
          "select match_id, settlement, completed_at, started_at from public.match_history where match_id = $1",
          [matchId],
        );
        if (existing.rows[0]) {
          return {
            wallets: Object.fromEntries(
              await Promise.all(deltas.map(async (delta) => [delta.userId, await getWallet(client, delta.userId)])),
            ),
            ledgers: [],
          };
        }

        const ledgers: LedgerEntry[] = [];
        for (const delta of deltas) {
          if (delta.amount !== 0) {
            ledgers.push((await mutateWallet(client, delta.userId, "coins", delta.amount, "table-settle", { matchId })).ledger);
          }
        }
        await client.query(
          `insert into public.match_history (match_id, mode, table_type, settlement, completed_at)
           values ($1, '3-fan', 'coin', $2::jsonb, now())
           on conflict (match_id) do nothing`,
          [matchId, JSON.stringify({ deltas: deltas.map((delta) => delta.amount), ...(sum !== 0 ? { houseDelta: -sum } : {}) })],
        );
        return {
          wallets: Object.fromEntries(
            await Promise.all(deltas.map(async (delta) => [delta.userId, await getWallet(client, delta.userId)])),
          ),
          ledgers,
        };
      });
    },
    async buy(userId, itemId) {
      const item = [...(coinPacks as CatalogItem[]), ...(cosmetics as CatalogItem[])].find((entry) => entry.id === itemId);
      if (!item) {
        throw new Error("Catalog item not found");
      }

      return transaction(pool, async (client) => {
        await mutateWallet(client, userId, "gems", -item.gemCost, "shop-spend", { itemId });
        if (item.kind === "coin-pack") {
          const result = await mutateWallet(client, userId, "coins", item.coinGrant, "coin-pack", { itemId });
          return { wallet: result.wallet, granted: { kind: "coins", amount: item.coinGrant } };
        }

        await client.query(
          `insert into public.inventory (user_id, item_id, item_type, rarity)
           values ($1::uuid, $2, 'tile-set', $3)
           on conflict (user_id, item_id) do nothing`,
          [userId, item.id, item.rarity ?? "common"],
        );
        return { wallet: await getWallet(client, userId), granted: { kind: "cosmetic", itemId: item.id } };
      });
    },
    async claimDaily(userId) {
      return transaction(pool, async (client) => {
        const state = await lockDailyState(client, userId);
        const today = currentDateKey();
        if (dateKey(state.reward_date) === today) {
          throw new Error("Daily reward already claimed");
        }

        const streak = nextStreak(dateKey(state.reward_date), today, state.streak);
        const reward = (dailyRewards as DailyReward[])[(streak - 1) % dailyRewards.length];
        await client.query(
          `update public.daily_state
           set reward_date = $2::date, streak = $3, updated_at = now()
           where user_id = $1::uuid`,
          [userId, today, streak],
        );
        if (reward.rewardCoins > 0) {
          await mutateWallet(client, userId, "coins", reward.rewardCoins, "daily-login", { streak });
        }
        if (reward.rewardGems > 0) {
          await mutateWallet(client, userId, "gems", reward.rewardGems, "daily-login", { streak });
        }
        return { wallet: await getWallet(client, userId), reward, streak };
      });
    },
    async rewardAd(userId) {
      return transaction(pool, async (client) => {
        const state = await lockDailyState(client, userId);
        const today = currentDateKey();
        const adClaims = dateKey(state.rewarded_ad_date) === today ? state.rewarded_ad_count : 0;
        if (adClaims >= adRewards.length) {
          throw new Error("Rewarded ad cap reached");
        }

        const reward = adRewards[adClaims];
        await client.query(
          `update public.daily_state
           set rewarded_ad_date = $2::date, rewarded_ad_count = $3, updated_at = now()
           where user_id = $1::uuid`,
          [userId, today, adClaims + 1],
        );
        if (reward.type === "coins" || reward.type === "gems") {
          await mutateWallet(client, userId, reward.type, reward.amount, "rewarded-ad");
        }
        return { wallet: await getWallet(client, userId), reward };
      });
    },
    async spin(userId, random = Math.random()) {
      return transaction(pool, async (client) => {
        const state = await lockDailyState(client, userId);
        const today = currentDateKey();
        const spinClaims = dateKey(state.spin_date) === today ? state.spin_count : 0;
        if (spinClaims >= 1) {
          throw new Error("Lucky Draw already used today");
        }

        const reward = pickSpinReward(random);
        await client.query(
          `update public.daily_state
           set spin_date = $2::date, spin_count = $3, updated_at = now()
           where user_id = $1::uuid`,
          [userId, today, spinClaims + 1],
        );
        if (reward.type === "coins" || reward.type === "gems") {
          await mutateWallet(client, userId, reward.type, reward.amount, "spin-wheel", { rewardType: reward.type, rewardAmount: reward.amount });
        }
        return { wallet: await getWallet(client, userId), reward, oddsShownAt: new Date().toISOString() };
      });
    },
    async getDailyMissions(userId) {
      return getDailyMissions(pool, userId);
    },
    async recordMissionProgress(userId, event) {
      const mission = missionForEvent(event.type);
      const increment = event.type === "claim-melds" ? event.count ?? 1 : 1;
      await pool.query(
        `insert into public.daily_mission_progress (user_id, mission_date, mission_id, progress)
         values ($1::uuid, current_date, $2, least($3, $4))
         on conflict (user_id, mission_date, mission_id)
         do update set progress = least($3, public.daily_mission_progress.progress + $4), updated_at = now()`,
        [userId, mission.id, mission.target, increment],
      );
      return getDailyMissions(pool, userId);
    },
    async claimMission(userId, missionId) {
      return transaction(pool, async (client) => {
        const mission = dailyMissionTemplates.find((entry) => entry.id === missionId);
        if (!mission) {
          throw new Error("Mission not found");
        }
        await client.query(
          `insert into public.daily_mission_progress (user_id, mission_date, mission_id, progress)
           values ($1::uuid, current_date, $2, 0)
           on conflict (user_id, mission_date, mission_id) do nothing`,
          [userId, missionId],
        );
        const rows = await client.query<DailyMissionProgressRow>(
          `select mission_id, progress, claimed from public.daily_mission_progress
           where user_id = $1::uuid and mission_date = current_date and mission_id = $2
           for update`,
          [userId, missionId],
        );
        const row = rows.rows[0];
        if (row.claimed) {
          throw new Error("Mission already claimed");
        }
        if (row.progress < mission.target) {
          throw new Error("Mission incomplete");
        }
        await client.query(
          `update public.daily_mission_progress set claimed = true, updated_at = now()
           where user_id = $1::uuid and mission_date = current_date and mission_id = $2`,
          [userId, missionId],
        );
        const result = await mutateWallet(client, userId, "coins", mission.rewardCoins, "mission", { missionId });
        return {
          wallet: result.wallet,
          mission: missionView(mission, { mission_id: missionId, progress: row.progress, claimed: true }),
          ledger: result.ledger,
        };
      });
    },
    async verifyPurchase(userId, packId = "gems-test-small") {
      const pack = (gemPacks as CatalogItem[]).find((entry) => entry.id === packId);
      if (!pack) {
        throw new Error("Gem pack not found");
      }
      return mutateWallet(pool, userId, "gems", 120, "purchase", { packId });
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

async function getWallet(client: Queryable, userId: string): Promise<Wallet> {
  const result = await client.query<{ coins: number; gems: number }>(
    "select coins, gems from public.wallets where user_id = $1::uuid",
    [userId],
  );
  return result.rows[0] ? { coins: result.rows[0].coins, gems: result.rows[0].gems } : { coins: 0, gems: 0 };
}

async function mutateWallet(
  client: Queryable,
  userId: string,
  currency: Currency,
  amount: number,
  source: LedgerSource,
  metadata: Record<string, unknown> = {},
): Promise<MutationResult> {
  const result = await client.query<LedgerRow>(
    "select * from mahjong_private.mutate_wallet($1::uuid, $2, $3, $4, $5::jsonb)",
    [userId, currency, amount, source, JSON.stringify(metadata)],
  );
  const ledger = mapLedger(result.rows[0]);
  return { wallet: await getWallet(client, userId), ledger };
}

async function transaction<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function lockDailyState(client: Queryable, userId: string): Promise<DailyStateRow> {
  await client.query(
    `insert into public.daily_state (user_id, streak, rewarded_ad_count)
     values ($1::uuid, 0, 0)
     on conflict (user_id) do nothing`,
    [userId],
  );
  const result = await client.query<DailyStateRow>("select * from public.daily_state where user_id = $1::uuid for update", [
    userId,
  ]);
  return result.rows[0];
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
    createdAt: row.created_at.toISOString(),
    ...(row.metadata ? { metadata: row.metadata } : {}),
  };
}

async function getDailyMissions(client: Queryable, userId: string): Promise<DailyMission[]> {
  const result = await client.query<DailyMissionProgressRow>(
    `select mission_id, progress, claimed from public.daily_mission_progress
     where user_id = $1::uuid and mission_date = current_date`,
    [userId],
  );
  return missionViews(result.rows);
}

const dailyMissionTemplates = dailyMissions as DailyMission[];

function missionViews(rows: DailyMissionProgressRow[]): DailyMission[] {
  const byId = new Map(rows.map((row) => [row.mission_id, row]));
  return dailyMissionTemplates.map((mission) => missionView(mission, byId.get(mission.id)));
}

function missionView(template: DailyMission, row: DailyMissionProgressRow | undefined): DailyMission {
  return {
    ...template,
    progress: Math.min(template.target, row?.progress ?? 0),
    claimed: row?.claimed ?? false,
  };
}

function missionForEvent(event: string): DailyMission {
  const missionId = event === "play" ? "play-hand" : event === "win-with-pong" ? "win-with-pong" : "claim-melds";
  const mission = dailyMissionTemplates.find((entry) => entry.id === missionId);
  if (!mission || !["play", "win-with-pong", "claim-melds"].includes(event)) {
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

function currentDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateKey(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

type Queryable = Pick<Pool | PoolClient, "query">;

interface LedgerRow extends QueryResultRow {
  ledger_id: string;
  user_id: string;
  currency: Currency;
  amount: number;
  source: LedgerSource;
  balance_before: number;
  balance_after: number;
  created_at: Date;
}

interface MatchHistoryRow extends QueryResultRow {
  match_id: string;
  settlement: { deltas?: number[] };
  completed_at: Date | null;
  started_at: Date;
}

interface DailyMissionProgressRow extends QueryResultRow {
  mission_id: string;
  progress: number;
  claimed: boolean;
}

interface DailyStateRow extends QueryResultRow {
  reward_date: Date | string | null;
  streak: number;
  rewarded_ad_date: Date | string | null;
  rewarded_ad_count: number;
  spin_date: Date | string | null;
  spin_count: number;
}

const adRewards: SpinReward[] = [
  { type: "coins", amount: 120 },
  { type: "coins", amount: 160 },
  { type: "coins", amount: 220 },
];

