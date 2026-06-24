import { describe, expect, it, vi } from "vitest";
import {
  TURNSTILE_SCRIPT_URL,
  createTurnstileLoader,
  createTurnstileRenderOptions,
  disposeTurnstileWidget,
  getTurnstileDomContract,
  type TurnstileAction,
  type TurnstileApi,
  type TurnstileScriptElement,
} from "./turnstileClient";

function createApi(overrides: Partial<TurnstileApi> = {}): TurnstileApi {
  return {
    render: vi.fn(() => "widget-id"),
    reset: vi.fn(),
    ...overrides,
  };
}

function createScriptHarness() {
  const listeners = new Map<string, Set<() => void>>();
  const script: TurnstileScriptElement = {
    async: false,
    defer: false,
    src: "",
    addEventListener(type, listener) {
      const callbacks = listeners.get(type) ?? new Set();
      callbacks.add(listener);
      listeners.set(type, callbacks);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    remove: vi.fn(),
  };

  return {
    script,
    emit(type: "load" | "error") {
      for (const listener of listeners.get(type) ?? []) listener();
    },
  };
}

describe("Turnstile client contract", () => {
  it("exposes the explicit-render script and Spin DOM attributes", () => {
    expect(TURNSTILE_SCRIPT_URL).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
    );
    expect(getTurnstileDomContract("site-key")).toEqual({
      "data-action": "turnstile-spin-v1",
      "data-sitekey": "site-key",
    });
  });

  it("loads the explicit script once for concurrent callers", async () => {
    const harness = createScriptHarness();
    const api = createApi();
    let availableApi: TurnstileApi | undefined;
    const appendScript = vi.fn();
    const load = createTurnstileLoader({
      getTurnstile: () => availableApi,
      findScript: () => undefined,
      createScript: () => harness.script,
      appendScript,
    });

    const first = load();
    const second = load();

    expect(first).toBe(second);
    expect(appendScript).toHaveBeenCalledTimes(1);
    expect(harness.script).toMatchObject({
      async: true,
      defer: true,
      src: TURNSTILE_SCRIPT_URL,
    });

    availableApi = api;
    harness.emit("load");

    await expect(first).resolves.toBe(api);
    await expect(load()).resolves.toBe(api);
    expect(appendScript).toHaveBeenCalledTimes(1);
  });

  it("removes a failed script and permits a clean retry", async () => {
    const firstHarness = createScriptHarness();
    const secondHarness = createScriptHarness();
    const scripts = [firstHarness.script, secondHarness.script];
    const appendScript = vi.fn();
    const load = createTurnstileLoader({
      getTurnstile: () => undefined,
      findScript: () => undefined,
      createScript: () => scripts.shift()!,
      appendScript,
    });

    const first = load();
    firstHarness.emit("error");
    await expect(first).rejects.toThrow("Failed to load Cloudflare Turnstile");
    expect(firstHarness.script.remove).toHaveBeenCalledOnce();

    const second = load();
    expect(second).not.toBe(first);
    expect(appendScript).toHaveBeenCalledTimes(2);
  });

  it("builds compact explicit-render options that forward and clear tokens", () => {
    const onToken = vi.fn();
    const action: TurnstileAction = "economy_claim";
    const options = createTurnstileRenderOptions(
      "site-key",
      action,
      onToken,
    );

    expect(options).toMatchObject({
      sitekey: "site-key",
      action: "economy_claim",
      size: "compact",
    });

    options.callback("verified-token");
    options["expired-callback"]();
    options["error-callback"]();

    expect(onToken.mock.calls).toEqual([
      ["verified-token"],
      [null],
      [null],
    ]);
  });

  it("disposes a widget with remove or reset without leaking cleanup errors", () => {
    const remove = vi.fn();
    const reset = vi.fn();
    disposeTurnstileWidget(createApi({ remove, reset }), "widget-id");
    expect(remove).toHaveBeenCalledWith("widget-id");
    expect(reset).not.toHaveBeenCalled();

    disposeTurnstileWidget(createApi({ remove: undefined, reset }), "widget-id");
    expect(reset).toHaveBeenCalledWith("widget-id");

    expect(() =>
      disposeTurnstileWidget(
        createApi({
          remove: () => {
            throw new Error("already removed");
          },
        }),
        "widget-id",
      ),
    ).not.toThrow();
  });
});
