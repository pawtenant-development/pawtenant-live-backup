/**
 * adminFunctionAuth — GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-CLOSURE
 *
 * ONE place that builds the headers for an admin-only Edge Function call.
 *
 * WHY THIS EXISTS
 * ───────────────
 * The Google Ads sync panels called their Edge Function with
 * `Authorization: Bearer <VITE_PUBLIC_SUPABASE_ANON_KEY>`. That key ships inside the
 * published JS bundle, so the function could not distinguish a signed-in admin from
 * any anonymous visitor — and `verify_jwt=true` did not help, because the anon key
 * IS a valid project JWT. Every admin-only function call must instead carry the
 * caller's own Supabase Auth session token.
 *
 * The `apikey` header keeps the publishable/anon key: the Supabase API gateway
 * requires a project apikey to route the request at all. Authorization is what
 * carries identity, and that must be the session.
 *
 * Uses the canonical `supabase.auth.getSession()` pattern already used elsewhere in
 * admin-orders — no new auth system, no token caching, no storage of its own.
 */

import { supabase } from "@/lib/supabaseClient";

const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

/**
 * Headers for an admin-authenticated Edge Function POST.
 *
 * Returns `null` when there is no session. Callers MUST treat null as "not signed
 * in" and abort rather than falling back to the anon key — falling back is the
 * exact defect this module exists to remove.
 */
export async function adminFunctionHeaders(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data?.session?.access_token;
  if (!accessToken) return null;
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${accessToken}`,
  };
}

/** Message shown when the admin's session has gone. */
export const ADMIN_SESSION_REQUIRED_MESSAGE =
  "Your admin session has expired — please sign in again.";

/**
 * Same as `adminFunctionHeaders`, but throws instead of returning null.
 *
 * Every admin-sync call site already runs inside a try/catch that surfaces the
 * error to the operator, so throwing keeps those call sites one line long while
 * making a missing session impossible to ignore. There is deliberately NO anon-key
 * fallback path: a call without a real admin session must fail, not downgrade.
 */
export async function adminFunctionHeadersOrThrow(): Promise<Record<string, string>> {
  const headers = await adminFunctionHeaders();
  if (!headers) throw new Error(ADMIN_SESSION_REQUIRED_MESSAGE);
  return headers;
}
