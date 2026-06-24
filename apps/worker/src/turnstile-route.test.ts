import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "./index";

const SECRET = "turnstile-secret";
const TOKEN = "turnstile-token";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const protectedRoutes = [
  ["/api/rooms", "room_create", {}],
  ["/api/discord/rooms", "room_create", { instanceId: "discord-instance" }],
  ["/api/economy/daily/claim", "economy_claim", {}],
  ["/api/economy/spin", "economy_claim", {}],
  ["/api/economy/daily/missions/claim", "economy_claim", { missionId: "play-hand" }],
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Turnstile-protected Worker routes", () => {
  it.each(protectedRoutes)("protects POST %s with action %s", async (pathname, action, body) => {
    const siteverify = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(_input).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(Object.fromEntries((init?.body as FormData).entries())).toEqual({
        secret: SECRET,
        response: TOKEN,
        remoteip: "203.0.113.10",
      });
      return Response.json({ success: true, action });
    });
    vi.stubGlobal("fetch", siteverify);

    const response = await worker.fetch(post(pathname, body), routeEnv({ TURNSTILE_SECRET_KEY: SECRET }));

    expect(response.status).not.toBe(403);
    expect(response.status).not.toBe(503);
    expect(siteverify).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Turnstile is not configured", async () => {
    const response = await worker.fetch(post("/api/rooms", {}), routeEnv());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  it("allows explicit dev bypass when Turnstile is not configured", async () => {
    const siteverify = vi.fn();
    vi.stubGlobal("fetch", siteverify);

    const response = await worker.fetch(post("/api/rooms", {}), routeEnv({ DEV_AUTH_BYPASS: "1" }));

    expect(response.status).toBe(202);
    expect(siteverify).not.toHaveBeenCalled();
  });

  it("rejects missing, invalid, and action-mismatched tokens", async () => {
    const env = routeEnv({ TURNSTILE_SECRET_KEY: SECRET });
    const missing = await worker.fetch(post("/api/rooms", {}, false), env);
    expect(missing.status).toBe(403);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: false })));
    const invalid = await worker.fetch(post("/api/rooms", {}), env);
    expect(invalid.status).toBe(403);

    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ success: true, action: "economy_claim" })));
    const mismatch = await worker.fetch(post("/api/rooms", {}), env);
    expect(mismatch.status).toBe(403);
  });

  it("does not protect other methods or nearby economy routes", async () => {
    const getResponse = await worker.fetch(
      new Request("https://mahjong.example.com/api/economy/daily/claim", {
        headers: { "x-user-id": USER_ID },
      }),
      routeEnv({ DEV_AUTH_BYPASS: "1" }),
    );
    const nearbyResponse = await worker.fetch(
      post("/api/economy/daily/missions/progress", { event: { type: "play" } }, false),
      routeEnv({ DEV_AUTH_BYPASS: "1" }),
    );

    expect(getResponse.status).toBe(404);
    expect(nearbyResponse.status).toBe(403);
  });

  it("rate limits before calling siteverify", async () => {
    const siteverify = vi.fn(async () => Response.json({ success: true, action: "room_create" }));
    vi.stubGlobal("fetch", siteverify);
    const env = routeEnv({ TURNSTILE_SECRET_KEY: SECRET, RATE_LIMIT_DISABLED: undefined });

    for (let index = 0; index < 20; index += 1) {
      const response = await worker.fetch(post("/api/rooms", {}, true, "203.0.113.99"), env);
      expect(response.status).toBe(202);
    }
    const limited = await worker.fetch(post("/api/rooms", {}, true, "203.0.113.99"), env);

    expect(limited.status).toBe(429);
    expect(siteverify).toHaveBeenCalledTimes(20);
  });

  it("reports configured, dev-bypass, and locked health modes", async () => {
    const configured = await health(routeEnv({ TURNSTILE_SECRET_KEY: SECRET }));
    const bypass = await health(routeEnv({ DEV_AUTH_BYPASS: "1" }));
    const locked = await health(routeEnv());

    expect(configured.turnstileMode).toBe("configured");
    expect(bypass.turnstileMode).toBe("dev-bypass");
    expect(locked.turnstileMode).toBe("locked");
  });
});

function post(
  pathname: string,
  body: object,
  includeToken = true,
  remoteIp = "203.0.113.10",
): Request {
  return new Request(`https://mahjong.example.com${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "cf-connecting-ip": remoteIp,
      "x-user-id": USER_ID,
      ...(includeToken ? { "x-turnstile-token": TOKEN } : {}),
    },
    body: JSON.stringify(body),
  });
}

function routeEnv(overrides: Partial<Env> = {}): Env {
  return {
    RATE_LIMIT_DISABLED: "1",
    MAHJONG_ROOM: {
      idFromName(name: string) {
        return { name };
      },
      get() {
        return {
          fetch: vi.fn(async () => new Response(null, { status: 202 })),
        };
      },
    } as unknown as DurableObjectNamespace,
    ...overrides,
  };
}

async function health(env: Env): Promise<Record<string, string>> {
  const response = await worker.fetch(new Request("https://mahjong.example.com/health"), env);
  return response.json() as Promise<Record<string, string>>;
}
