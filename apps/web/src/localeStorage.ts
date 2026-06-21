import type { LocaleCode } from "@mahjong/shared-types";

export interface LocaleStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const localeStorageKey = "mahjong-party-locale";
const supportedLocales: LocaleCode[] = ["en", "zh", "id"];

export function loadStoredLocale(storage: LocaleStorageLike | undefined): LocaleCode | null {
  const value = storage?.getItem(localeStorageKey);
  return supportedLocales.includes(value as LocaleCode) ? (value as LocaleCode) : null;
}

export function saveStoredLocale(storage: LocaleStorageLike | undefined, locale: LocaleCode): void {
  storage?.setItem(localeStorageKey, locale);
}
