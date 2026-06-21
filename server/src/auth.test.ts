import { describe, expect, it } from "vitest";
import { AuthError, parseBearer, signHs256, verifySupabaseJwt, type Jwk } from "./auth";

const SECRET = "test-super-secret-please-rotate";
const NOW = 1_700_000_000_000; // fixed ms clock
const nowSeconds = Math.floor(NOW / 1000);

function token(claims: Record<string, unknown>): Promise<string> {
  return signHs256({ aud: "authenticated", role: "authenticated", iat: nowSeconds, exp: nowSeconds + 3600, ...claims }, SECRET);
}

describe("parseBearer", () => {
  it("extracts the token from an Authorization header", () => {
    expect(parseBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(parseBearer("bearer   xyz")).toBe("xyz");
  });

  it("returns null for missing or malformed headers", () => {
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer("Basic abc")).toBeNull();
  });
});

describe("verifySupabaseJwt", () => {
  it("verifies a valid token and derives the user id from sub", async () => {
    const jwt = await token({ sub: "user-123" });
    const { userId, claims } = await verifySupabaseJwt(jwt, { secret: SECRET, now: NOW, audience: "authenticated" });
    expect(userId).toBe("user-123");
    expect(claims.role).toBe("authenticated");
  });

  it("rejects a token signed with the wrong secret", async () => {
    const jwt = await signHs256({ sub: "user-123", exp: nowSeconds + 3600 }, "attacker-secret");
    await expect(verifySupabaseJwt(jwt, { secret: SECRET, now: NOW })).rejects.toBeInstanceOf(AuthError);
  });

  it("rejects an expired token", async () => {
    const jwt = await token({ sub: "user-123", exp: nowSeconds - 60 });
    await expect(verifySupabaseJwt(jwt, { secret: SECRET, now: NOW })).rejects.toThrow(/expired/i);
  });

  it("rejects a token with no subject", async () => {
    const jwt = await token({ email: "nobody@example.com" });
    await expect(verifySupabaseJwt(jwt, { secret: SECRET, now: NOW })).rejects.toThrow(/subject/i);
  });

  it("rejects a non-HS256 algorithm (e.g. alg:none downgrade)", async () => {
    const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const body = btoa(JSON.stringify({ sub: "user-123" })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await expect(verifySupabaseJwt(`${header}.${body}.`, { secret: SECRET, now: NOW })).rejects.toThrow(/algorithm/i);
  });

  it("rejects a wrong audience when one is required", async () => {
    const jwt = await token({ sub: "user-123", aud: "anon" });
    await expect(verifySupabaseJwt(jwt, { secret: SECRET, now: NOW, audience: "authenticated" })).rejects.toThrow(/audience/i);
  });

  it("rejects a structurally malformed token", async () => {
    await expect(verifySupabaseJwt("not-a-jwt", { secret: SECRET, now: NOW })).rejects.toBeInstanceOf(AuthError);
  });
});

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signEs256(payload: Record<string, unknown>, privateKey: CryptoKey, kid: string): Promise<string> {
  const enc = new TextEncoder();
  const header = base64Url(enc.encode(JSON.stringify({ alg: "ES256", typ: "JWT", kid })));
  const body = base64Url(enc.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, enc.encode(data)));
  return `${data}.${base64Url(signature)}`;
}

describe("verifySupabaseJwt — ES256 via JWKS (Supabase asymmetric keys)", () => {
  const ISSUER = "https://example.supabase.co/auth/v1";

  async function keypair(kid: string) {
    const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk;
    jwk.kid = kid;
    jwk.alg = "ES256";
    return { privateKey: pair.privateKey, jwk };
  }

  it("verifies a valid ES256 token against the JWKS", async () => {
    const { privateKey, jwk } = await keypair("kid-1");
    const token = await signEs256(
      { sub: "user-es", aud: "authenticated", iss: ISSUER, exp: nowSeconds + 3600 },
      privateKey,
      "kid-1",
    );
    const { userId } = await verifySupabaseJwt(token, { jwks: [jwk], now: NOW, audience: "authenticated", issuer: ISSUER });
    expect(userId).toBe("user-es");
  });

  it("rejects an ES256 token whose kid is not in the JWKS", async () => {
    const signer = await keypair("kid-A");
    const other = await keypair("kid-B");
    const token = await signEs256({ sub: "user-es", aud: "authenticated", iss: ISSUER, exp: nowSeconds + 3600 }, signer.privateKey, "kid-A");
    await expect(verifySupabaseJwt(token, { jwks: [other.jwk], now: NOW })).rejects.toThrow(/signing key/i);
  });

  it("rejects an ES256 token forged with a different key for the same kid", async () => {
    const real = await keypair("kid-1");
    const forger = await keypair("kid-1");
    const token = await signEs256({ sub: "attacker", aud: "authenticated", iss: ISSUER, exp: nowSeconds + 3600 }, forger.privateKey, "kid-1");
    await expect(verifySupabaseJwt(token, { jwks: [real.jwk], now: NOW })).rejects.toThrow(/signature/i);
  });

  it("rejects a wrong issuer", async () => {
    const { privateKey, jwk } = await keypair("kid-1");
    const token = await signEs256({ sub: "user-es", aud: "authenticated", iss: "https://evil.example/auth/v1", exp: nowSeconds + 3600 }, privateKey, "kid-1");
    await expect(verifySupabaseJwt(token, { jwks: [jwk], now: NOW, issuer: ISSUER })).rejects.toThrow(/issuer/i);
  });
});
