import { bankrollReserveFor } from "@mahjong/shared-types";
import type { CatalogItem, DailyReward, TableConfig, Wallet } from "@mahjong/shared-types";

export function buyCatalogItem(wallet: Wallet, item: CatalogItem): { wallet: Wallet; message: string } {
  if (item.kind === "gem-pack") {
    return {
      wallet: { ...wallet, gems: wallet.gems + 120 },
      message: "Prototype gem pack granted.",
    };
  }

  if (wallet.gems < item.gemCost) {
    return { wallet, message: "Not enough Gems for this item." };
  }

  return {
    wallet: {
      gems: wallet.gems - item.gemCost,
      coins: wallet.coins + item.coinGrant,
    },
    message: item.coinGrant > 0 ? "Coin pack added from Gems." : "Cosmetic added to inventory.",
  };
}

export function claimDailyReward(wallet: Wallet, reward: DailyReward): { wallet: Wallet; message: string } {
  if (reward.claimed) {
    return { wallet, message: "Reward already claimed." };
  }

  return {
    wallet: {
      coins: wallet.coins + reward.rewardCoins,
      gems: wallet.gems + reward.rewardGems,
    },
    message: `${reward.title} claimed.`,
  };
}

export function joinTableWithWallet(
  wallet: Wallet,
  table: TableConfig,
): { ok: boolean; wallet: Wallet; message: string } {
  if (table.tableType !== "coin" || table.buyIn <= 0) {
    return { ok: true, wallet, message: "Joined friendly table." };
  }

  const reserve = bankrollReserveFor(table);
  if (wallet.coins < reserve) {
    return { ok: false, wallet, message: "Not enough Coins for this table." };
  }

  return {
    ok: true,
    wallet: { ...wallet, coins: wallet.coins - reserve },
    message: `${reserve.toLocaleString()} Coins bankroll reserved.`,
  };
}
