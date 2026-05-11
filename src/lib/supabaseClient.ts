import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * Fetch wrapper that retries up to `maxRetries` times on network-level failures
 * (no internet, DNS timeout, etc.). HTTP error responses (4xx/5xx) are NOT retried.
 */
async function fetchWithRetry(
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  const maxRetries = 3;
  const baseDelayMs = 500;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fetch(...args);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries - 1) {
        // Exponential back-off: 500ms → 1s → 2s
        await new Promise((resolve) =>
          setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)),
        );
      }
    }
  }
  throw lastErr;
}

/**
 * Strict variant: returns a valid Supabase Auth user JWT, or null.
 *
 *   1. Try the live session via `getSession()`.
 *   2. If absent/empty, attempt `refreshSession()` to recover an expired token.
 *   3. Return the access_token if either succeeds.
 *   4. Otherwise return null — NEVER falls back to the anon key.
 *
 * Use this for admin actions whose edge function validates the caller via
 * `adminClient.auth.getUser(token)` (e.g. `manual-run-lead-followup-sequence`,
 * `check-admin-status`). Those functions reject the anon key with 401.
 */
export async function getAdminUserToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
  } catch {
    // fall through to refresh
  }
  try {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data.session?.access_token) return data.session.access_token;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Returns a bearer token for Supabase Edge Function calls.
 *
 * Order:
 *   1. Live Supabase Auth user JWT (via `getAdminUserToken()` — getSession then refresh).
 *   2. Anon publishable key — fallback for edge functions that DO NOT validate
 *      the caller via `auth.getUser(token)`.
 *
 * For admin-validated edge functions, prefer `getAdminUserToken()` so the
 * UI can detect a missing session and prompt the admin to re-login instead
 * of sending the anon key (which fails server-side with 401).
 */
export async function getAdminToken(): Promise<string> {
  const userToken = await getAdminUserToken();
  if (userToken) return userToken;
  return supabaseAnonKey;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
  global: {
    fetch: fetchWithRetry,
  },
});
