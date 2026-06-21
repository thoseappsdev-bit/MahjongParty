import { describe, expect, it } from "vitest";
import { t } from "./index";

describe("i18n helper", () => {
  it("resolves core navigation in all launch locales", () => {
    expect(t("en", "nav.lobby")).toBe("Lobby");
    expect(t("zh", "nav.lobby")).toBe("大厅");
    expect(t("id", "nav.lobby")).toBe("Lobi");
  });

  it("translates prototype screen copy beyond the bottom navigation", () => {
    expect(t("zh", "home.playTables")).toBe("开始牌桌");
    expect(t("zh", "currency.coins")).toBe("金币");
    expect(t("id", "match.discard")).toBe("Buang");
  });
});
