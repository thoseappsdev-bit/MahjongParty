import { describe, expect, it } from "vitest";
import {
  sendSupabaseMagicLink,
  signOutSupabaseAuth,
  startSupabaseAuth,
  type AuthClientLike,
  type AuthProfile,
  type SessionLike,
} from "./supabaseAuth";

function fakeClient(options: {
  initialSession?: SessionLike | null;
  anon?: { session: SessionLike | null; error: { message: string } | null };
  signOutError?: { message: string } | null;
}): {
  client: AuthClientLike;
  emit: (event: string, session: SessionLike | null) => void;
  signInCount: () => number;
  otpCalls: () => Array<{ email: string; redirectTo?: string }>;
  signOutCount: () => number;
} {
  let listener: ((event: string, session: SessionLike | null) => void) | null = null;
  let signInCalls = 0;
  let signOutCalls = 0;
  const otpRequests: Array<{ email: string; redirectTo?: string }> = [];
  const client: AuthClientLike = {
    auth: {
      async getSession() {
        return { data: { session: options.initialSession ?? null } };
      },
      async signInAnonymously() {
        signInCalls += 1;
        return { data: { session: options.anon?.session ?? null }, error: options.anon?.error ?? null };
      },
      async signInWithOtp(input) {
        otpRequests.push({ email: input.email, redirectTo: input.options?.emailRedirectTo });
        return { data: {}, error: null };
      },
      async signOut() {
        signOutCalls += 1;
        return { error: options.signOutError ?? null };
      },
      onAuthStateChange(callback) {
        listener = callback;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  };
  return {
    client,
    emit: (event, session) => listener?.(event, session),
    signInCount: () => signInCalls,
    otpCalls: () => otpRequests,
    signOutCount: () => signOutCalls,
  };
}

const session = (token: string, id = "user-1", email: string | null = null, isAnonymous = true): SessionLike => ({
  access_token: token,
  user: { id, email, is_anonymous: isAnonymous },
});

describe("startSupabaseAuth", () => {
  it("uses an existing session without signing in again", async () => {
    let provider: () => string | null = () => null;
    const { client } = fakeClient({ initialSession: session("existing-token") });
    const result = await startSupabaseAuth(client, (fn) => (provider = fn));
    expect(result.userId).toBe("user-1");
    expect(result.profile).toMatchObject({ userId: "user-1", status: "guest", isAnonymous: true });
    expect(provider()).toBe("existing-token");
  });

  it("signs in anonymously when there is no session", async () => {
    let provider: () => string | null = () => null;
    const fake = fakeClient({ initialSession: null, anon: { session: session("anon-token", "anon-9"), error: null } });
    const result = await startSupabaseAuth(fake.client, (fn) => (provider = fn));
    expect(result.userId).toBe("anon-9");
    expect(result.profile).toMatchObject({ userId: "anon-9", status: "guest", isAnonymous: true });
    expect(provider()).toBe("anon-token");
    expect(fake.signInCount()).toBe(1);
  });

  it("returns an error and a null token when anonymous sign-in fails", async () => {
    let provider: () => string | null = () => "stale";
    const fake = fakeClient({ initialSession: null, anon: { session: null, error: { message: "anonymous sign-ins are disabled" } } });
    const result = await startSupabaseAuth(fake.client, (fn) => (provider = fn));
    expect(result.userId).toBeNull();
    expect(result.profile).toBeNull();
    expect(result.error).toMatch(/disabled/);
    expect(provider()).toBeNull();
  });

  it("keeps the token and account profile fresh when auth state changes", async () => {
    let provider: () => string | null = () => null;
    const changes: Array<AuthProfile | null> = [];
    const fake = fakeClient({ initialSession: session("first-token") });
    await startSupabaseAuth(fake.client, (fn) => (provider = fn), (profile) => changes.push(profile));
    expect(provider()).toBe("first-token");

    fake.emit("SIGNED_IN", session("email-token", "user-email", "friend@example.com", false));
    expect(provider()).toBe("email-token");
    expect(changes.at(-1)).toMatchObject({
      userId: "user-email",
      email: "friend@example.com",
      status: "signed-in",
      isAnonymous: false,
    });

    fake.emit("SIGNED_OUT", null);
    expect(provider()).toBeNull();
    expect(changes.at(-1)).toBeNull();
  });
});

describe("Supabase auth actions", () => {
  it("sends a trimmed magic-link request with a redirect URL", async () => {
    const fake = fakeClient({ initialSession: null });
    const result = await sendSupabaseMagicLink(fake.client, " friend@example.com ", "https://mahjong.example.com/settings");
    expect(result).toEqual({ ok: true });
    expect(fake.otpCalls()).toEqual([{ email: "friend@example.com", redirectTo: "https://mahjong.example.com/settings" }]);
  });

  it("rejects an empty magic-link email before calling Supabase", async () => {
    const fake = fakeClient({ initialSession: null });
    const result = await sendSupabaseMagicLink(fake.client, "   ", "https://mahjong.example.com/settings");
    expect(result).toEqual({ ok: false, error: "Email is required" });
    expect(fake.otpCalls()).toEqual([]);
  });

  it("signs out and clears the bearer token provider", async () => {
    let provider: () => string | null = () => "stale";
    const fake = fakeClient({ initialSession: session("token") });
    const result = await signOutSupabaseAuth(fake.client, (fn) => (provider = fn));
    expect(result).toEqual({ ok: true });
    expect(fake.signOutCount()).toBe(1);
    expect(provider()).toBeNull();
  });
});
