export const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const TURNSTILE_SPIN_TELEMETRY_ACTION = "turnstile-spin-v1";

export type TurnstileAction =
  | "room_create"
  | "economy_claim"
  | "magic_link";

export interface TurnstileRenderOptions {
  sitekey: string;
  action: TurnstileAction;
  size: "compact";
  callback: (token: string) => void;
  "expired-callback": () => void;
  "error-callback": () => void;
}

export interface TurnstileApi {
  render: (
    container: HTMLElement | string,
    options: TurnstileRenderOptions,
  ) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId: string) => void;
}

export interface TurnstileScriptElement {
  src: string;
  async: boolean;
  defer: boolean;
  addEventListener: (type: "load" | "error", listener: () => void) => void;
  removeEventListener: (type: "load" | "error", listener: () => void) => void;
  remove?: () => void;
}

export interface TurnstileLoaderEnvironment {
  getTurnstile: () => TurnstileApi | undefined;
  findScript: () => TurnstileScriptElement | undefined;
  createScript: () => TurnstileScriptElement;
  appendScript: (script: TurnstileScriptElement) => void;
}

export function getTurnstileDomContract(siteKey: string) {
  return {
    "data-action": TURNSTILE_SPIN_TELEMETRY_ACTION,
    "data-sitekey": siteKey,
  } as const;
}

export function createTurnstileRenderOptions(
  siteKey: string,
  action: TurnstileAction,
  onToken: (token: string | null) => void,
): TurnstileRenderOptions {
  return {
    sitekey: siteKey,
    action,
    size: "compact",
    callback: onToken,
    "expired-callback": () => onToken(null),
    "error-callback": () => onToken(null),
  };
}

export function createTurnstileLoader(environment: TurnstileLoaderEnvironment) {
  let pending: Promise<TurnstileApi> | undefined;

  return function loadTurnstileFromEnvironment(): Promise<TurnstileApi> {
    const loadedApi = environment.getTurnstile();
    if (loadedApi) return Promise.resolve(loadedApi);
    if (pending) return pending;

    const request = new Promise<TurnstileApi>((resolve, reject) => {
      const existingScript = environment.findScript();
      const script = existingScript ?? environment.createScript();
      const ownsScript = existingScript === undefined;

      const detachListeners = () => {
        script.removeEventListener("load", handleLoad);
        script.removeEventListener("error", handleError);
      };
      const discardOwnedScript = () => {
        if (!ownsScript) return;
        try {
          script.remove?.();
        } catch {
          // The document may already have removed the failed script.
        }
      };
      const handleLoad = () => {
        detachListeners();
        const api = environment.getTurnstile();
        if (api) {
          resolve(api);
          return;
        }
        discardOwnedScript();
        reject(new Error("Cloudflare Turnstile loaded without exposing its API"));
      };
      const handleError = () => {
        detachListeners();
        discardOwnedScript();
        reject(new Error("Failed to load Cloudflare Turnstile"));
      };

      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);

      if (ownsScript) {
        script.src = TURNSTILE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        try {
          environment.appendScript(script);
        } catch (error) {
          detachListeners();
          discardOwnedScript();
          reject(error);
        }
      }
    });

    pending = request;
    void request.catch(() => {
      if (pending === request) pending = undefined;
    });
    return request;
  };
}

export function disposeTurnstileWidget(
  api: TurnstileApi,
  widgetId: string,
): void {
  if (api.remove) {
    try {
      api.remove(widgetId);
      return;
    } catch {
      // Fall through to reset if removal raced with another cleanup.
    }
  }

  try {
    api.reset(widgetId);
  } catch {
    // Cleanup must remain safe after navigation or script replacement.
  }
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const loadBrowserTurnstile = createTurnstileLoader({
  getTurnstile: () =>
    typeof window === "undefined" ? undefined : window.turnstile,
  findScript: () =>
    typeof document === "undefined"
      ? undefined
      : (document.querySelector(
          `script[src="${TURNSTILE_SCRIPT_URL}"]`,
        ) as HTMLScriptElement | null) ?? undefined,
  createScript: () => document.createElement("script"),
  appendScript: (script) => {
    document.head.append(script as HTMLScriptElement);
  },
});

export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.reject(
      new Error("Cloudflare Turnstile requires a browser document"),
    );
  }
  return loadBrowserTurnstile();
}
