// Minimal slice of the Supabase auth client so the controller is unit-testable
// with a fake (no network, no env).
export interface SessionLike {
  access_token: string;
  user: {
    id: string;
    email?: string | null;
    is_anonymous?: boolean;
  };
}

export interface AuthClientLike {
  auth: {
    getSession(): Promise<{ data: { session: SessionLike | null } }>;
    signInAnonymously(): Promise<{ data: { session: SessionLike | null }; error: { message: string } | null }>;
    signInWithOtp(input: {
      email: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{ data: unknown; error: { message: string } | null }>;
    signOut(): Promise<{ error: { message: string } | null }>;
    onAuthStateChange(
      callback: (event: string, session: SessionLike | null) => void,
    ): { data: { subscription: { unsubscribe(): void } } };
  };
}

export interface AuthProfile {
  userId: string;
  email: string | null;
  isAnonymous: boolean;
  status: "guest" | "signed-in";
}

export interface AuthStartResult {
  userId: string | null;
  profile: AuthProfile | null;
  error?: string;
  unsubscribe: () => void;
}

export interface AuthActionResult {
  ok: boolean;
  error?: string;
}

export function sessionToAuthProfile(session: SessionLike | null): AuthProfile | null {
  if (!session) {
    return null;
  }
  const email = session.user.email?.trim() || null;
  const isAnonymous = session.user.is_anonymous ?? !email;
  return {
    userId: session.user.id,
    email,
    isAnonymous,
    status: isAnonymous ? "guest" : "signed-in",
  };
}

/**
 * Ensures there is a session (signing in anonymously if needed), wires the API
 * token provider to read the live access token, and keeps it fresh on auth
 * state changes. Pure of env/UI so it can be tested with a fake client.
 */
export async function startSupabaseAuth(
  client: AuthClientLike,
  setTokenProvider: (provider: () => string | null) => void,
  onProfileChange?: (profile: AuthProfile | null) => void,
): Promise<AuthStartResult> {
  let current: SessionLike | null = (await client.auth.getSession()).data.session;

  if (!current) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error || !data.session) {
      setTokenProvider(() => null);
      return { userId: null, profile: null, error: error?.message ?? "Anonymous sign-in failed", unsubscribe: () => {} };
    }
    current = data.session;
  }

  // Always read the latest token so refreshed sessions are picked up.
  setTokenProvider(() => current?.access_token ?? null);

  const { data } = client.auth.onAuthStateChange((_event, session) => {
    current = session;
    onProfileChange?.(sessionToAuthProfile(session));
  });

  return {
    userId: current.user.id,
    profile: sessionToAuthProfile(current),
    unsubscribe: () => data.subscription.unsubscribe(),
  };
}

export async function sendSupabaseMagicLink(
  client: AuthClientLike,
  email: string,
  redirectTo?: string,
): Promise<AuthActionResult> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, error: "Email is required" };
  }
  const { error } = await client.auth.signInWithOtp({
    email: trimmed,
    options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function signOutSupabaseAuth(
  client: AuthClientLike,
  setTokenProvider: (provider: () => string | null) => void,
): Promise<AuthActionResult> {
  const { error } = await client.auth.signOut();
  if (error) {
    return { ok: false, error: error.message };
  }
  setTokenProvider(() => null);
  return { ok: true };
}
