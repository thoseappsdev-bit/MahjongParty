export type TelegramMiniAppStatus = "unavailable" | "ready" | "error";

export interface TelegramMiniAppUser {
  id: string;
  displayName: string;
  avatar: string;
  avatarUrl: string | null;
}

export interface TelegramMiniAppState {
  status: TelegramMiniAppStatus;
  user: TelegramMiniAppUser | null;
  platform: string | null;
  colorScheme: "light" | "dark" | null;
  initData: string | null;
  error: string | null;
}

interface TelegramWebAppLike {
  initData?: string;
  initDataUnsafe?: {
    user?: {
      id?: number | string;
      first_name?: string;
      last_name?: string;
      username?: string;
      photo_url?: string;
    };
  };
  platform?: string;
  colorScheme?: "light" | "dark";
  ready?: () => void;
  expand?: () => void;
  disableVerticalSwipes?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebAppLike;
    };
  }
}

export const telegramMiniAppUnavailable: TelegramMiniAppState = {
  status: "unavailable",
  user: null,
  platform: null,
  colorScheme: null,
  initData: null,
  error: null,
};

export function connectTelegramMiniApp(): TelegramMiniAppState {
  if (typeof window === "undefined") {
    return telegramMiniAppUnavailable;
  }

  const webApp = window.Telegram?.WebApp;
  if (!webApp) {
    return telegramMiniAppUnavailable;
  }

  try {
    webApp.ready?.();
    webApp.expand?.();
    webApp.disableVerticalSwipes?.();
    webApp.setHeaderColor?.("#06291f");
    webApp.setBackgroundColor?.("#06291f");

    return {
      status: "ready",
      user: telegramUserFor(webApp),
      platform: webApp.platform ? String(webApp.platform) : null,
      colorScheme: webApp.colorScheme ?? null,
      initData: webApp.initData?.trim() || null,
      error: null,
    };
  } catch (error) {
    return {
      ...telegramMiniAppUnavailable,
      status: "error",
      error: error instanceof Error ? error.message : "Telegram Mini App initialization failed.",
    };
  }
}

function telegramUserFor(webApp: TelegramWebAppLike): TelegramMiniAppUser | null {
  const user = webApp.initDataUnsafe?.user;
  if (!user?.id) {
    return null;
  }

  const displayName =
    [user.first_name, user.last_name].filter(Boolean).join(" ").trim() ||
    (user.username ? `@${user.username}` : "Telegram Player");

  return {
    id: String(user.id),
    displayName,
    avatar: displayName.replace(/^@/, "").slice(0, 1).toUpperCase() || "T",
    avatarUrl: user.photo_url ?? null,
  };
}
