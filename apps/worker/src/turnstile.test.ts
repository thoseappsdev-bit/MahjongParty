import { describe, expect, it, vi } from "vitest";
import { verifyTurnstileToken } from "./turnstile";

const SECRET = "super-secret-value";
const TOKEN = "client-token-value";

describe("verifyTurnstileToken", () => {
  it.each([
    [{ secret: "", token: TOKEN }, "missing-secret"],
    [{ secret: SECRET, token: "   " }, "missing-token"],
  ] as const)("rejects incomplete input without making a request", async (input, reason) => {
    const fetchImpl = vi.fn();

    const result = await verifyTurnstileToken(input, fetchImpl);

    expect(result).toMatchObject({ success: false, reason });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("posts the token and optional remote IP as FormData", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(_input).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);

      const body = init?.body as FormData;
      expect(Object.fromEntries(body.entries())).toEqual({
        secret: SECRET,
        response: TOKEN,
        remoteip: "203.0.113.10",
      });

      return Response.json({
        success: true,
        action: "create_room",
        hostname: "mahjong.example",
        challenge_ts: "2026-06-23T01:02:03.000Z",
      });
    });

    const result = await verifyTurnstileToken(
      {
        secret: SECRET,
        token: TOKEN,
        expectedAction: "create_room",
        remoteIp: "203.0.113.10",
      },
      fetchImpl,
    );

    expect(result).toEqual({
      success: true,
      action: "create_room",
      hostname: "mahjong.example",
      challengeTimestamp: "2026-06-23T01:02:03.000Z",
    });
  });

  it("omits remoteip when none is supplied", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect((init?.body as FormData).has("remoteip")).toBe(false);
      return Response.json({ success: true });
    });

    await expect(verifyTurnstileToken({ secret: SECRET, token: TOKEN }, fetchImpl)).resolves.toEqual({
      success: true,
    });
  });

  it("returns a safe network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`request exposed ${SECRET} and ${TOKEN}`);
    });

    const result = await verifyTurnstileToken({ secret: SECRET, token: TOKEN }, fetchImpl);

    expect(result).toEqual({
      success: false,
      reason: "network-error",
      message: "Turnstile verification request failed",
    });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("rejects a non-successful HTTP response", async () => {
    const result = await verifyTurnstileToken(
      { secret: SECRET, token: TOKEN },
      async () => new Response("upstream failure", { status: 503 }),
    );

    expect(result).toEqual({
      success: false,
      reason: "http-error",
      message: "Turnstile verification service returned HTTP 503",
    });
  });

  it("rejects malformed JSON", async () => {
    const result = await verifyTurnstileToken(
      { secret: SECRET, token: TOKEN },
      async () => new Response("not-json", { status: 200 }),
    );

    expect(result).toEqual({
      success: false,
      reason: "invalid-response",
      message: "Turnstile verification service returned an invalid response",
    });
  });

  it("rejects a failed Turnstile verification with provider error codes", async () => {
    const result = await verifyTurnstileToken(
      { secret: SECRET, token: TOKEN },
      async () => Response.json({ success: false, "error-codes": ["invalid-input-response"] }),
    );

    expect(result).toEqual({
      success: false,
      reason: "verification-failed",
      message: "Turnstile verification failed",
      errorCodes: ["invalid-input-response"],
    });
  });

  it("rejects a successful response for the wrong action", async () => {
    const result = await verifyTurnstileToken(
      { secret: SECRET, token: TOKEN, expectedAction: "create_room" },
      async () => Response.json({ success: true, action: "join_room" }),
    );

    expect(result).toEqual({
      success: false,
      reason: "action-mismatch",
      message: "Turnstile action did not match the expected action",
    });
  });
});
