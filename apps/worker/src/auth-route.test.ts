import { afterEach, describe, expect, it, vi } from "vitest";
import { signHs256, type Jwk } from "../../../server/src/auth";
import worker, { type Env } from "./index";

const SECRET = "worker-test-jwt-secret";

function env(overrides: Partial<Env> = {}): Env {
  return {
    MAHJONG_ROOM: {
      idFromName() {
        throw new Error("rooms not exercised here");
      },
      get() {
        throw new Error("rooms not exercised here");
      },
    } as unknown as DurableObjectNamespace,
    ...overrides,
  };
}

async function bearer(sub: string): Promise<string> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const jwt = await signHs256({ sub, aud: "authenticated", role: "authenticated", exp: nowSeconds + 3600 }, SECRET);
  return `Bearer ${jwt}`;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function es256Keypair(kid: string): Promise<{ privateKey: CryptoKey; jwk: Jwk }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk;
  jwk.kid = kid;
  jwk.alg = "ES256";
  return { privateKey: pair.privateKey, jwk };
}

async function signEs256(payload: Record<string, unknown>, privateKey: CryptoKey, kid: string): Promise<string> {
  const enc = new TextEncoder();
  const header = base64Url(enc.encode(JSON.stringify({ alg: "ES256", typ: "JWT", kid })));
  const body = base64Url(enc.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, enc.encode(data)));
  return `${data}.${base64Url(signature)}`;
}

describe("worker authentication", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves the catalog without authentication even when locked", async () => {
    const response = await worker.fetch(new Request("https://x/api/economy/catalog"), env());
    expect(response.status).toBe(200);
  });
  it("accepts bounded anonymous client analytics events", async () => {
    const response = await worker.fetch(
      new Request("https://x/api/analytics/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "client.render_error",
          level: "error",
          message: "screen failed",
          metadata: { componentStack: "Stack" },
        }),
      }),
      env(),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
  it("rejects malformed client analytics without throwing a Worker error", async () => {
    const response = await worker.fetch(
      new Request("https://x/api/analytics/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not-json",
      }),
      env(),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid analytics event" });
  });

  it("returns 401 for a protected route when neither JWT nor dev bypass is configured (fail closed)", async () => {
    const response = await worker.fetch(new Request("https://x/api/economy/wallet"), env());
    expect(response.status).toBe(401);
  });

  it("derives identity from a valid Supabase bearer token", async () => {
    const response = await worker.fetch(
      new Request("https://x/api/economy/wallet", { headers: { authorization: await bearer("user-abc") } }),
      env({ SUPABASE_JWT_SECRET: SECRET }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { wallet: { coins: number; gems: number } };
    expect(body.wallet).toBeDefined();
  });

  it("derives identity from a Supabase ES256 bearer token through the project JWKS endpoint", async () => {
    const issuer = "https://example.supabase.co/auth/v1";
    const { privateKey, jwk } = await es256Keypair("kid-es256");
    const nowSeconds = Math.floor(Date.now() / 1000);
    const token = await signEs256(
      { sub: "user-es256", aud: "authenticated", role: "authenticated", iss: issuer, exp: nowSeconds + 3600 },
      privateKey,
      "kid-es256",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe("https://example.supabase.co/auth/v1/.well-known/jwks.json");
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const response = await worker.fetch(
      new Request("https://x/api/economy/wallet", { headers: { authorization: `Bearer ${token}` } }),
      env({ SUPABASE_JWT_SECRET: SECRET, SUPABASE_URL: "https://example.supabase.co" }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { wallet: { coins: number; gems: number } };
    expect(body.wallet).toBeDefined();
  });

  it("rejects a missing token when JWT is enforced", async () => {
    const response = await worker.fetch(new Request("https://x/api/economy/wallet"), env({ SUPABASE_JWT_SECRET: SECRET }));
    expect(response.status).toBe(401);
  });

  it("does NOT trust x-user-id when JWT is enforced", async () => {
    const response = await worker.fetch(
      new Request("https://x/api/economy/wallet", { headers: { "x-user-id": "spoofed-user" } }),
      env({ SUPABASE_JWT_SECRET: SECRET }),
    );
    expect(response.status).toBe(401);
  });

  it("rejects a token signed with the wrong secret", async () => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const forged = await signHs256({ sub: "user-abc", aud: "authenticated", exp: nowSeconds + 3600 }, "attacker-secret");
    const response = await worker.fetch(
      new Request("https://x/api/economy/wallet", { headers: { authorization: `Bearer ${forged}` } }),
      env({ SUPABASE_JWT_SECRET: SECRET }),
    );
    expect(response.status).toBe(401);
  });

  it("no longer exposes a public settlement route", async () => {
    const response = await worker.fetch(
      new Request("https://x/api/economy/table/settle", {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": "user-abc" },
        body: JSON.stringify({ matchId: "M1", deltas: [{ userId: "user-abc", amount: 999999 }] }),
      }),
      env({ DEV_AUTH_BYPASS: "1" }),
    );
    expect(response.status).toBe(404);
    expect(response.status).not.toBe(200);
  });

  it("reports the active auth mode on health", async () => {
    const jwtHealth = await (await worker.fetch(new Request("https://x/health"), env({ SUPABASE_JWT_SECRET: SECRET }))).json();
    expect(jwtHealth).toMatchObject({ authMode: "jwt" });
    const lockedHealth = await (await worker.fetch(new Request("https://x/health"), env())).json();
    expect(lockedHealth).toMatchObject({ authMode: "locked" });
  });
});


