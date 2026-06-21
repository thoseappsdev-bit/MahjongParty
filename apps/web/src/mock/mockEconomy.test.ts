import { describe, expect, it } from "vitest";
import { buyCatalogItem, joinTableWithWallet } from "./mockEconomy";
import type { CatalogItem, TableConfig, Wallet } from "@mahjong/shared-types";

describe("mock economy", () => {
  it("returns a replacement wallet for gem to coin packs", () => {
    const wallet: Wallet = { coins: 100, gems: 200 };
    const item: CatalogItem = {
      id: "coins",
      kind: "coin-pack",
      title: "Coins",
      description: "Coins",
      priceLabel: "100 Gems",
      gemCost: 100,
      coinGrant: 10_000,
    };

    const result = buyCatalogItem(wallet, item);

    expect(result.wallet).toEqual({ coins: 10_100, gems: 100 });
    expect(wallet).toEqual({ coins: 100, gems: 200 });
  });

  it("reserves bankroll exposure when joining a paid coin table", () => {
    const wallet: Wallet = { coins: 100_000, gems: 0 };
    const table: TableConfig = {
      mode: "3-fan",
      tableType: "coin",
      privacy: "public",
      timerSeconds: 20,
      maxPlayers: 4,
      buyIn: 2_000,
    };

    const result = joinTableWithWallet(wallet, table);

    expect(result.ok).toBe(true);
    expect(result.wallet.coins).toBe(4_000);
    expect(result.message).toContain("96,000 Coins bankroll reserved");
  });

  it("blocks paid table join when coins are insufficient", () => {
    const wallet: Wallet = { coins: 95_999, gems: 0 };
    const table: TableConfig = {
      mode: "3-fan",
      tableType: "coin",
      privacy: "public",
      timerSeconds: 20,
      maxPlayers: 4,
      buyIn: 2_000,
    };

    const result = joinTableWithWallet(wallet, table);

    expect(result.ok).toBe(false);
    expect(result.wallet).toBe(wallet);
  });
});
