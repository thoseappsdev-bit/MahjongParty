import { afterEach, describe, expect, it, vi } from "vitest";
import { connectTelegramMiniApp } from "./telegramMiniApp";

describe("telegram mini app adapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stays unavailable outside Telegram", () => {
    vi.stubGlobal("window", {});
    expect(connectTelegramMiniApp()).toMatchObject({ status: "unavailable", user: null });
  });

  it("reads Telegram launch user context without making it authoritative", () => {
    const ready = vi.fn();
    const expand = vi.fn();
    vi.stubGlobal("window", {
      Telegram: {
        WebApp: {
          initData: "query-hash",
          initDataUnsafe: { user: { id: 42, first_name: "Lina", username: "lina" } },
          platform: "android",
          colorScheme: "dark",
          ready,
          expand,
        },
      },
    });

    const state = connectTelegramMiniApp();

    expect(state).toMatchObject({
      status: "ready",
      initData: "query-hash",
      platform: "android",
      user: { id: "42", displayName: "Lina", avatar: "L" },
    });
    expect(ready).toHaveBeenCalledOnce();
    expect(expand).toHaveBeenCalledOnce();
  });
});
