import { Button, Panel } from "@mahjong/ui";
import { formatT, t } from "@mahjong/i18n";
import type { CatalogItem, LocaleCode, Wallet } from "@mahjong/shared-types";

export function Shop({
  locale,
  catalog,
  wallet,
  onBuy,
}: {
  locale: LocaleCode;
  catalog: CatalogItem[];
  wallet: Wallet;
  onBuy: (itemId: string) => void;
}) {
  return (
    <div className="screen">
      <div className="screen-heading">
        <div>
          <h1>{t(locale, "shop.title")}</h1>
          <p>{t(locale, "shop.subtitle")}</p>
        </div>
        <span className="wallet-note">{formatT(locale, "shop.available", { gems: wallet.gems.toLocaleString() })}</span>
      </div>

      <div className="shop-grid">
        {catalog.map((item) => (
          <Panel className="shop-card" key={item.id}>
            <span className={`rarity ${item.rarity ?? "common"}`}>{item.rarity ?? "common"}</span>
            <h2>{item.title}</h2>
            <p>{item.description}</p>
            <div className="shop-card-footer">
              <strong>{item.priceLabel}</strong>
              <Button tone="secondary" onClick={() => onBuy(item.id)}>
                {t(locale, "common.buy")}
              </Button>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
