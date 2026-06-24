const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileVerificationInput {
  secret: string;
  token: string;
  expectedAction?: string;
  remoteIp?: string;
}

export type TurnstileFailureReason =
  | "missing-secret"
  | "missing-token"
  | "network-error"
  | "http-error"
  | "invalid-response"
  | "verification-failed"
  | "action-mismatch";

export type TurnstileVerificationResult =
  | {
      success: true;
      action?: string;
      hostname?: string;
      challengeTimestamp?: string;
    }
  | {
      success: false;
      reason: TurnstileFailureReason;
      message: string;
      errorCodes?: string[];
    };

export type TurnstileFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface TurnstileResponse {
  success: boolean;
  action?: unknown;
  hostname?: unknown;
  challenge_ts?: unknown;
  "error-codes"?: unknown;
}

export async function verifyTurnstileToken(
  input: TurnstileVerificationInput,
  fetchImpl: TurnstileFetch = fetch,
): Promise<TurnstileVerificationResult> {
  const secret = input.secret.trim();
  const token = input.token.trim();

  if (!secret) {
    return failure("missing-secret", "Turnstile secret is required");
  }
  if (!token) {
    return failure("missing-token", "Turnstile token is required");
  }

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (input.remoteIp?.trim()) {
    body.set("remoteip", input.remoteIp.trim());
  }

  let response: Response;
  try {
    response = await fetchImpl(TURNSTILE_VERIFY_URL, { method: "POST", body });
  } catch {
    return failure("network-error", "Turnstile verification request failed");
  }

  if (!response.ok) {
    return failure(
      "http-error",
      `Turnstile verification service returned HTTP ${response.status}`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return invalidResponse();
  }

  if (!isTurnstileResponse(payload)) {
    return invalidResponse();
  }

  if (!payload.success) {
    const errorCodes = safeErrorCodes(payload["error-codes"], secret, token);
    return {
      ...failure("verification-failed", "Turnstile verification failed"),
      ...(errorCodes.length > 0 ? { errorCodes } : {}),
    };
  }

  if (input.expectedAction !== undefined && payload.action !== input.expectedAction) {
    return failure("action-mismatch", "Turnstile action did not match the expected action");
  }

  return {
    success: true,
    ...safeField("action", payload.action, secret, token),
    ...safeField("hostname", payload.hostname, secret, token),
    ...safeField("challengeTimestamp", payload.challenge_ts, secret, token),
  };
}

function failure(reason: TurnstileFailureReason, message: string): TurnstileVerificationResult {
  return { success: false, reason, message };
}

function invalidResponse(): TurnstileVerificationResult {
  return failure(
    "invalid-response",
    "Turnstile verification service returned an invalid response",
  );
}

function isTurnstileResponse(value: unknown): value is TurnstileResponse {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, "success") === "boolean";
}

function safeErrorCodes(value: unknown, secret: string, token: string): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string =>
      typeof item === "string" &&
      /^[a-z0-9-]{1,64}$/i.test(item) &&
      !containsCredential(item, secret, token),
  );
}

function safeField<Key extends string>(
  key: Key,
  value: unknown,
  secret: string,
  token: string,
): Partial<Record<Key, string>> {
  return typeof value === "string" && !containsCredential(value, secret, token)
    ? { [key]: value } as Record<Key, string>
    : {};
}

function containsCredential(value: string, secret: string, token: string): boolean {
  return value.includes(secret) || value.includes(token);
}
