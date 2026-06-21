import { setAuthTokenProvider } from "./authToken";
import {
  sendSupabaseMagicLink as sendMagicLinkWithClient,
  signOutSupabaseAuth,
  startSupabaseAuth,
  type AuthClientLike,
  type AuthProfile,
} from "./supabaseAuth";

let started = false;
let activeProfile: AuthProfile | null = null;
let activeUnsubscribe: (() => void) | null = null;
let profileListener: ((profile: AuthProfile | null) => void) | null = null;

async function loadSupabaseClient() {
  const { getSupabaseClient } = await import("./supabaseClient");
  return getSupabaseClient();
}
function emitProfile(profile: AuthProfile | null) {
  activeProfile = profile;
  profileListener?.(profile);
}

/**
 * App entry point: boots Supabase auth once (anonymous sign-in if needed) and
 * returns the authenticated user id. Wires the API token provider to the live
 * session. Safe to call when env is missing (returns a null user id).
 *
 * Kept separate from `supabaseAuth.ts` so the pure controller stays testable
 * without importing the @supabase/supabase-js bundle.
 */
export async function initSupabaseAuth(
  onProfileChange?: (profile: AuthProfile | null) => void,
): Promise<{ userId: string | null; profile: AuthProfile | null; error?: string }> {
  profileListener = onProfileChange ?? null;
  if (started) {
    return { userId: activeProfile?.userId ?? null, profile: activeProfile };
  }
  const client = await loadSupabaseClient();
  if (!client) {
    return { userId: null, profile: null, error: "Supabase env not configured" };
  }
  started = true;
  const result = await startSupabaseAuth(client as unknown as AuthClientLike, setAuthTokenProvider, emitProfile);
  activeProfile = result.profile;
  activeUnsubscribe = result.unsubscribe;
  return { userId: result.userId, profile: result.profile, error: result.error };
}

export async function sendSupabaseMagicLink(email: string, redirectTo?: string): Promise<{ ok: boolean; error?: string }> {
  const client = await loadSupabaseClient();
  if (!client) {
    return { ok: false, error: "Supabase env not configured" };
  }
  return sendMagicLinkWithClient(client as unknown as AuthClientLike, email, redirectTo);
}

export async function signOutSupabaseSession(): Promise<{ ok: boolean; error?: string }> {
  const client = await loadSupabaseClient();
  if (!client) {
    setAuthTokenProvider(() => null);
    emitProfile(null);
    return { ok: true };
  }
  const result = await signOutSupabaseAuth(client as unknown as AuthClientLike, setAuthTokenProvider);
  if (result.ok) {
    activeUnsubscribe?.();
    activeUnsubscribe = null;
    started = false;
    emitProfile(null);
  }
  return result;
}

export async function restartSupabaseGuest(
  onProfileChange?: (profile: AuthProfile | null) => void,
): Promise<{ userId: string | null; profile: AuthProfile | null; error?: string }> {
  const signOutResult = await signOutSupabaseSession();
  if (!signOutResult.ok) {
    return { userId: null, profile: null, error: signOutResult.error };
  }
  return initSupabaseAuth(onProfileChange);
}

export type { AuthProfile };
