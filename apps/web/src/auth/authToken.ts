// Central access-token provider for authenticated API calls.
//
// Once a Supabase login flow exists, call `setAuthTokenProvider(() => session?.access_token ?? null)`.
// Until then this returns no token and the worker accepts identity only under an
// explicit DEV_AUTH_BYPASS (local dev). In production (JWT enforced) a token is required.

let tokenProvider: () => string | null = () => null;

export function setAuthTokenProvider(provider: () => string | null): void {
  tokenProvider = provider;
}

export function getAuthToken(): string | null {
  return tokenProvider();
}

export function authHeaders(): Record<string, string> {
  const token = tokenProvider();
  return token ? { authorization: `Bearer ${token}` } : {};
}
