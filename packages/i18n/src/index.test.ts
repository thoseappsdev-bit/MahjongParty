import { dictionariesForTesting, localeName, t } from "./index";
import { describe, expect, it } from "vitest";

describe("i18n helper", () => {
  it("ships the same translation keys in every locale", () => {
    expect(Object.keys(dictionariesForTesting.zh).sort()).toEqual(Object.keys(dictionariesForTesting.en).sort());
    expect(Object.keys(dictionariesForTesting.id).sort()).toEqual(Object.keys(dictionariesForTesting.en).sort());
  });

  it("contains no Chinese mojibake", () => {
    const text = Object.values(dictionariesForTesting.zh).join("\n");
    expect(text).not.toMatch(/[\u00c3\u00c2\u00e6\u00e5\u00e8\u00e7\u00e9\u00e4\u00ef]/u);
    expect(localeName("zh")).toBe("\u4e2d\u6587");
    expect(t("zh", "settings.language")).toBe("\u8bed\u8a00");
    expect(t("zh", "match.discard")).toBe("\u6253\u51fa");
    expect(t("zh", "daily.title")).toBe("\u6bcf\u65e5\u5956\u52b1");
  });

  it("resolves core navigation in all launch locales", () => {
    expect(t("en", "nav.lobby")).toBe("Lobby");
    expect(t("zh", "nav.lobby")).toBe("\u5927\u5385");
    expect(t("id", "nav.lobby")).toBe("Lobi");
  });

  it("translates prototype screen copy beyond the bottom navigation", () => {
    expect(t("zh", "home.playTables")).toBe("\u5f00\u59cb\u724c\u684c");
    expect(t("zh", "currency.coins")).toBe("\u91d1\u5e01");
    expect(t("id", "match.discard")).toBe("Buang");
  });
});
