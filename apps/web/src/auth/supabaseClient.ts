import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Lazily creates the browser Supabase client from Vite env. Returns null when
 * the project env is not configured (e.g. unit tests / SSR), so callers can
 * degrade gracefully instead of throwing at import time.
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (client) {
    return client;
  }
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey) {
    return null;
  }
  client = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
