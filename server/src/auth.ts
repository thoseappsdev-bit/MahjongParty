// Supabase JWT verification + server-derived identity.
//
// Uses Web Crypto (HMAC-SHA256), which is available identically in Cloudflare
// Workers, Durable Objects, and Node 20+. No external dependencies.
//
// Supabase access tokens are HS256-signed with the project JWT secret and carry
// the authenticated user id in the `sub` claim and `aud: "authenticated"`.

export interface SupabaseJwtClaims {
  sub: string;
  aud?: string | string[];
  iss?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export interface VerifyJwtOptions {
  /** HS256 shared secret (legacy Supabase JWT secret). */
  secret?: string;
  /** JWKS endpoint for asymmetric (ES256/RS256) tokens — Supabase's modern signing keys. */
  jwksUrl?: string;
  /** Preloaded JWKS keys (tests / cached). Used instead of fetching when provided. */
  jwks?: Jwk[];
  /** If set, the token `iss` must match. */
  issuer?: string;
  /** Current time in ms; defaults to Date.now(). Injected for deterministic tests. */
  now?: number;
  /** If set, the token `aud` must match. Supabase uses "authenticated". */
  audience?: string;
  /** Clock skew tolerance in seconds (default 5). */
  leewaySeconds?: number;
  /** Injectable fetch for JWKS retrieval (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

export type Jwk = JsonWebKey & { kid?: string; alg?: string };

interface JwksEntry {
  keys: Jwk[];
  expiresAt: number;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
const jwksCache = new Map<string, JwksEntry>();

async function fetchJwks(url: string, fetchImpl: typeof fetch, now: number, force = false): Promise<Jwk[]> {
  const cached = jwksCache.get(url);
  if (!force && cached && cached.expiresAt > now) {
    return cached.keys;
  }
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new AuthError("Unable to fetch signing keys", 503);
  }
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = body.keys ?? [];
  jwksCache.set(url, { keys, expiresAt: now + JWKS_TTL_MS });
  return keys;
}

async function resolveJwk(kid: string | undefined, alg: string, options: VerifyJwtOptions, now: number): Promise<Jwk> {
  const matches = (keys: Jwk[]) => keys.find((key) => (!kid || key.kid === kid) && (!key.alg || key.alg === alg));

  if (options.jwks) {
    const jwk = matches(options.jwks);
    if (!jwk) {
      throw new AuthError("No matching signing key");
    }
    return jwk;
  }
  if (!options.jwksUrl) {
    throw new AuthError(`Asymmetric token (${alg}) but no JWKS endpoint configured`);
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  let jwk = matches(await fetchJwks(options.jwksUrl, fetchImpl, now));
  if (!jwk) {
    // Key rotation: refetch once, bypassing the cache.
    jwk = matches(await fetchJwks(options.jwksUrl, fetchImpl, now, true));
  }
  if (!jwk) {
    throw new AuthError("No matching signing key");
  }
  return jwk;
}

async function verifyAsymmetric(
  alg: "ES256" | "RS256",
  jwk: Jwk,
  signature: Uint8Array<ArrayBuffer>,
  signingInput: Uint8Array<ArrayBuffer>,
): Promise<boolean> {
  if (alg === "ES256") {
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, signingInput);
  }
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, key, signature, signingInput);
}

export class AuthError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function parseBearer(header: string | null | undefined): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSegment(segment: string): unknown {
  return JSON.parse(decoder.decode(base64UrlToBytes(segment)));
}

async function hmacKey(secret: string, usage: "sign" | "verify"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

/** Mints an HS256 JWT. Intended for tests and local tooling, not production tokens. */
export async function signHs256(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), encoder.encode(data)));
  return `${data}.${bytesToBase64Url(signature)}`;
}

/**
 * Verifies a Supabase HS256 access token and returns the derived user id.
 * Throws AuthError (401) on any failure. The signature is checked before any
 * claim is trusted.
 */
export async function verifySupabaseJwt(
  token: string,
  options: VerifyJwtOptions,
): Promise<{ userId: string; claims: SupabaseJwtClaims }> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new AuthError("Malformed token");
  }
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  let header: { alg?: string; kid?: string };
  try {
    header = decodeSegment(headerSegment) as { alg?: string; kid?: string };
  } catch {
    throw new AuthError("Malformed token header");
  }

  const nowMs = options.now ?? Date.now();
  const signature = base64UrlToBytes(signatureSegment);
  const signingInput = encoder.encode(`${headerSegment}.${payloadSegment}`);

  let valid: boolean;
  try {
    if (header.alg === "HS256") {
      if (!options.secret) {
        throw new AuthError("HS256 token but no shared secret configured");
      }
      valid = await crypto.subtle.verify("HMAC", await hmacKey(options.secret, "verify"), signature, signingInput);
    } else if (header.alg === "ES256" || header.alg === "RS256") {
      const jwk = await resolveJwk(header.kid, header.alg, options, nowMs);
      valid = await verifyAsymmetric(header.alg, jwk, signature, signingInput);
    } else {
      throw new AuthError(`Unsupported token algorithm: ${header.alg ?? "none"}`);
    }
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError("Malformed token signature");
  }
  if (!valid) {
    throw new AuthError("Invalid token signature");
  }

  let claims: SupabaseJwtClaims;
  try {
    claims = decodeSegment(payloadSegment) as SupabaseJwtClaims;
  } catch {
    throw new AuthError("Malformed token payload");
  }

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const leeway = options.leewaySeconds ?? 5;
  if (typeof claims.exp === "number" && nowSeconds >= claims.exp + leeway) {
    throw new AuthError("Token expired");
  }
  if (typeof claims.nbf === "number" && nowSeconds + leeway < claims.nbf) {
    throw new AuthError("Token not yet valid");
  }
  if (options.audience) {
    const aud = claims.aud;
    const matches = Array.isArray(aud) ? aud.includes(options.audience) : aud === options.audience;
    if (!matches) {
      throw new AuthError("Invalid token audience");
    }
  }
  if (options.issuer && claims.iss !== options.issuer) {
    throw new AuthError("Invalid token issuer");
  }
  if (typeof claims.sub !== "string" || !claims.sub) {
    throw new AuthError("Token missing subject");
  }

  return { userId: claims.sub, claims };
}
