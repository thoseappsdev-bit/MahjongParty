import type { Wallet } from "@mahjong/shared-types";

export interface WalletStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const walletStorageKey = "mahjong-party-wallet";

export function loadStoredWallet(storage: WalletStorageLike | undefined): Wallet | null {
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(walletStorageKey);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Wallet>;
    if (!isValidCurrency(parsed.coins) || !isValidCurrency(parsed.gems)) {
      return null;
    }

    return { coins: parsed.coins, gems: parsed.gems };
  } catch {
    return null;
  }
}

export function saveStoredWallet(storage: WalletStorageLike | undefined, wallet: Wallet): void {
  if (!storage) {
    return;
  }

  storage.setItem(walletStorageKey, JSON.stringify(wallet));
}

function isValidCurrency(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}
