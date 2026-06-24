import type { CatalogItem, DailyMission, DailyReward, LedgerEntry, SpinReward, Wallet } from "@mahjong/shared-types";
import { authHeaders } from "../auth/authToken";

type FetchLike = typeof fetch;

export interface CatalogResponse {
  gemPacks: CatalogItem[];
  coinPacks: CatalogItem[];
  cosmetics: CatalogItem[];
  offers: unknown[];
}

export interface MutationResponse {
  wallet: Wallet;
  ledger: LedgerEntry;
}

export interface BuyResponse {
  wallet: Wallet;
  granted: { kind: "coins"; amount: number } | { kind: "cosmetic"; itemId: string };
}

export interface DailyClaimResponse {
  wallet: Wallet;
  reward: DailyReward;
  streak: number;
}

export interface RewardAdResponse {
  wallet: Wallet;
  reward: SpinReward;
}

export interface SpinWheelResponse {
  wallet: Wallet;
  reward: SpinReward;
  oddsShownAt: string;
}

export interface DailyMissionsResponse {
  missions: DailyMission[];
}

export interface MissionClaimResponse {
  wallet: Wallet;
  mission: DailyMission;
  ledger: LedgerEntry;
}

export async function getWallet(apiBase: string, userId: string, fetchImpl: FetchLike = fetch): Promise<Wallet> {
  const response = await request<{ wallet: Wallet }>(apiBase, "/api/economy/wallet", userId, undefined, fetchImpl);
  return response.wallet;
}

export async function getCatalog(apiBase: string, fetchImpl: FetchLike = fetch): Promise<CatalogResponse> {
  return request<CatalogResponse>(apiBase, "/api/economy/catalog", null, undefined, fetchImpl);
}

export function buyCatalogItem(
  apiBase: string,
  userId: string,
  itemId: string,
  fetchImpl: FetchLike = fetch,
): Promise<BuyResponse> {
  return request<BuyResponse>(apiBase, "/api/economy/shop/buy", userId, { userId, itemId }, fetchImpl);
}

export function claimDailyReward(
  apiBase: string,
  userId: string,
  turnstileToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<DailyClaimResponse> {
  return request<DailyClaimResponse>(
    apiBase,
    "/api/economy/daily/claim",
    userId,
    { userId },
    fetchImpl,
    turnstileToken,
  );
}

export function rewardAd(apiBase: string, userId: string, fetchImpl: FetchLike = fetch): Promise<RewardAdResponse> {
  return request<RewardAdResponse>(apiBase, "/api/economy/ad/reward", userId, { userId }, fetchImpl);
}

export function spinWheel(
  apiBase: string,
  userId: string,
  turnstileToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<SpinWheelResponse> {
  return request<SpinWheelResponse>(apiBase, "/api/economy/spin", userId, { userId }, fetchImpl, turnstileToken);
}

export async function getDailyMissions(apiBase: string, userId: string, fetchImpl: FetchLike = fetch): Promise<DailyMission[]> {
  const response = await request<DailyMissionsResponse>(apiBase, "/api/economy/daily/missions", userId, undefined, fetchImpl);
  return response.missions;
}

export function recordMissionProgress(
  apiBase: string,
  userId: string,
  event: { type: "play" } | { type: "win-with-pong" } | { type: "claim-melds"; count?: number },
  fetchImpl: FetchLike = fetch,
): Promise<DailyMissionsResponse> {
  return request<DailyMissionsResponse>(apiBase, "/api/economy/daily/missions/progress", userId, { userId, event }, fetchImpl);
}

export function claimMission(
  apiBase: string,
  userId: string,
  missionId: string,
  turnstileToken: string,
  fetchImpl: FetchLike = fetch,
): Promise<MissionClaimResponse> {
  return request<MissionClaimResponse>(
    apiBase,
    "/api/economy/daily/missions/claim",
    userId,
    { userId, missionId },
    fetchImpl,
    turnstileToken,
  );
}

export function buyIn(
  apiBase: string,
  userId: string,
  amount: number,
  fetchImpl: FetchLike = fetch,
): Promise<MutationResponse> {
  return request<MutationResponse>(apiBase, "/api/economy/table/buy-in", userId, { userId, amount }, fetchImpl);
}

async function request<T>(
  apiBase: string,
  path: string,
  userId: string | null,
  body: unknown,
  fetchImpl: FetchLike,
  turnstileToken?: string,
): Promise<T> {
  const headers = new Headers();
  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }
  if (userId) {
    headers.set("x-user-id", userId);
  }
  for (const [key, value] of Object.entries(authHeaders())) {
    headers.set(key, value);
  }
  if (turnstileToken !== undefined) {
    headers.set("x-turnstile-token", turnstileToken);
  }

  const response = await fetchImpl(apiUrl(apiBase, path), {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await responseError(response));
  }
  return response.json() as Promise<T>;
}

function apiUrl(apiBase: string, path: string): string {
  return apiBase ? `${apiBase}${path}` : path;
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}
