// ─────────────────────────────────────────────────────────────────────────────
// invocationAuth.ts — GOOGLE-ADS-PRIMARY-PURCHASE-CHANNEL-GATE-001-CLOSURE
//
// THE PROBLEM THIS CLOSES
// ───────────────────────
// The function is deployed with verify_jwt=true, which many people read as
// "authenticated". It is not. verify_jwt only asks the Supabase API gateway
// whether the bearer is a VALID JWT for this project — and the PUBLIC anon key
// is exactly that. Worse, every admin-UI call site was sending
// `Authorization: Bearer <VITE_PUBLIC_SUPABASE_ANON_KEY>` rather than the signed-in
// admin's session token, so the function had no way to tell an admin from any
// anonymous visitor holding a key that ships in the client bundle.
//
// Net effect before this module: anyone who read the published JS bundle could POST
// mode:"backfill" / "retry_failed" / "retry_gclid_upgraded" / "single" and drive real
// uploads into the PRIMARY, bidding-critical Google Ads conversion action.
//
// WHAT THIS MODULE IS
// ───────────────────
// ONE fail-closed authorization decision, taken before order selection, email
// hashing, the Google OAuth token request, payload construction, any Google API
// call and any upload-status mutation. It is deliberately dependency-injected so
// the guard can execute the real decision logic offline, with no network.
//
// It does NOT invent a second role system. The admin test is the repository's
// canonical one, identical to broadcast-email / admin-send-password-reset /
// admin-issue-provider-temp-password / send-monthly-business-report:
//   doctor_profiles.is_admin === true, or doctor_profiles.role in the admin set.
//
// PRIVACY: nothing here returns or logs a bearer, a key, a secret, an email, a
// hash, a click id or PHI — only a machine reason token and an auth user id.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Roles that count as a PawTenant admin. Mirrors the canonical set used by the
 * other admin-only edge functions. "finance" is deliberately NOT included: this
 * function writes conversion data that drives ad bidding, not financial records.
 */
export const ADMIN_ROLES: readonly string[] = ["owner", "admin_manager", "support"];

/**
 * Modes the Admin UI legitimately invokes.
 * Sourced by reading the real call sites, not by assumption:
 *   GoogleAdsSyncPanel.tsx  → single, retry_failed, backfill, test_auth,
 *                             test_upload, retry_gclid_upgraded,
 *                             list_conversion_actions
 *   GoogleOAuthPanel.tsx    → test_auth, test_upload
 *   UnifiedBackfillPanel.tsx→ backfill (dry run + real)
 */
export const ADMIN_MODES: readonly string[] = [
  "single",
  "backfill",
  "retry_failed",
  "retry_gclid_upgraded",
  "test_auth",
  "test_upload",
  "list_conversion_actions",
];

/**
 * Modes NO browser caller may invoke. apply_refund_adjustments restates or
 * retracts conversions that are already live in Google Ads; it is reachable only
 * by a server-controlled caller.
 */
export const INTERNAL_ONLY_MODES: readonly string[] = [
  "apply_refund_adjustments",
  // LIVE-only: a read-only GAQL inspection of the configured conversion action
  // (GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-READINESS-001). No Admin UI surface calls
  // it, so it stays reachable only by a server-controlled caller.
  "inspect_conversion_action",
];

/** Every mode this function recognises. Anything else is refused (fail closed). */
export const KNOWN_MODES: readonly string[] = [...ADMIN_MODES, ...INTERNAL_ONLY_MODES];

export type CallerKind = "internal_service" | "internal_cron" | "admin_user";

export interface AuthzResult {
  authorized: boolean;
  /** HTTP status to return when not authorized. 200 while authorized. */
  status: number;
  kind: CallerKind | null;
  /** Privacy-safe machine token naming the deciding rule. */
  reason: string;
  /** Supabase auth user id for an admin caller; null for internal callers. */
  actorId: string | null;
}

export interface AuthzDeps {
  /** Deno.env SUPABASE_SERVICE_ROLE_KEY. */
  serviceRoleKey: string;
  /**
   * Shared secret for a scheduled caller that authenticates by header.
   * EMPTY STRING DISABLES THE HEADER BRANCH ENTIRELY — an unprovisioned secret
   * must never make a bare `x-cron-secret:` header sufficient.
   */
  cronSecret: string;
  /** Resolve a Supabase Auth session token to a user, or null. */
  getUser: (token: string) => Promise<{ id: string } | null>;
  /** Read the caller's admin profile row, or null. */
  getAdminProfile: (userId: string) => Promise<{ is_admin?: boolean | null; role?: string | null } | null>;
  /**
   * OPTIONAL last-resort capability probe for a service-role bearer that is not
   * string-equal to serviceRoleKey. This project runs BOTH the legacy JWT and the
   * newer sb_secret_ key systems, and the injected SUPABASE_SERVICE_ROLE_KEY does
   * not always equal the key a legitimate internal caller presents, so equality
   * alone can reject a real service-role caller. The probe must attempt an
   * operation granted to service_role ONLY, and must resolve false (never throw)
   * for anon, customer and provider tokens.
   */
  probeServiceRole?: (token: string) => Promise<boolean>;
}

/**
 * Length-checked, constant-time-ish comparison. A plain === on a shared secret
 * leaks its prefix through response timing; more importantly, this refuses the
 * empty-vs-empty match that would make an unset secret universally valid.
 */
export function secretsMatch(provided: string, expected: string): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  if (expected.length === 0 || provided.length === 0) return false;
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** Extract the bearer token, tolerating header-name casing. Never logged. */
export function bearerOf(req: { headers: { get(name: string): string | null } }): string {
  const raw = req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "";
  return raw.replace(/^Bearer\s+/i, "").trim();
}

export function isAdminProfile(profile: { is_admin?: boolean | null; role?: string | null } | null): boolean {
  if (!profile) return false;
  if (profile.is_admin === true) return true;
  return ADMIN_ROLES.includes((profile.role ?? "").toString());
}

/** Which modes a resolved caller kind may invoke. Internal callers may use all. */
export function isModeAllowedFor(kind: CallerKind, mode: string): boolean {
  if (!KNOWN_MODES.includes(mode)) return false;
  if (kind === "internal_service" || kind === "internal_cron") return true;
  return ADMIN_MODES.includes(mode);
}

/**
 * THE AUTHORIZATION DECISION.
 *
 * Order matters and is asserted by the guard:
 *   1. unknown mode                       → 403 (fail closed; never falls back to backfill)
 *   2. configured cron secret + match     → internal_cron
 *   3. no bearer at all                   → 401
 *   4. bearer === service role key        → internal_service
 *   5. bearer resolves to an auth user    → admin profile decides (200 / 403)
 *   6. bearer resolves to nothing, but the
 *      capability probe proves service role → internal_service
 *   7. otherwise                          → 401
 *
 * The PUBLIC anon key lands on step 6: it is a valid project JWT (so the gateway
 * lets it through) but carries no user, and it cannot pass a service-role
 * capability probe — so it is refused, which is the whole point of this module.
 *
 * `forceUpload` is deliberately absent from every branch: it is a caller-supplied
 * body flag and must never influence authorization.
 */
export async function authorizeInvocation(
  req: { headers: { get(name: string): string | null } },
  mode: string,
  deps: AuthzDeps,
): Promise<AuthzResult> {
  const deny = (status: number, reason: string): AuthzResult =>
    ({ authorized: false, status, kind: null, reason, actorId: null });
  const allow = (kind: CallerKind, actorId: string | null, reason: string): AuthzResult =>
    ({ authorized: true, status: 200, kind, reason, actorId });

  // 1. Unknown mode — refuse rather than silently defaulting to backfill.
  if (!KNOWN_MODES.includes(mode)) return deny(403, "unknown_mode");

  // 2. Scheduled caller authenticating by header. Requires a PROVISIONED secret:
  //    an unset secret disables this branch completely, so merely SENDING the
  //    header can never authorize anything.
  const providedCronSecret = req.headers.get("x-cron-secret") ?? "";
  if (secretsMatch(providedCronSecret, deps.cronSecret)) {
    return isModeAllowedFor("internal_cron", mode)
      ? allow("internal_cron", null, "internal_cron_secret")
      : deny(403, "mode_not_permitted");
  }

  // 3. No bearer → unauthenticated.
  const token = bearerOf(req);
  if (!token) return deny(401, "missing_bearer");

  // 4. Server-controlled internal caller (stripe-webhook posts the service key).
  if (secretsMatch(token, deps.serviceRoleKey)) {
    return isModeAllowedFor("internal_service", mode)
      ? allow("internal_service", null, "internal_service_key")
      : deny(403, "mode_not_permitted");
  }

  // 5. A real signed-in session?
  let user: { id: string } | null = null;
  try {
    user = await deps.getUser(token);
  } catch {
    user = null;
  }

  if (user && user.id) {
    let profile: { is_admin?: boolean | null; role?: string | null } | null = null;
    try {
      profile = await deps.getAdminProfile(user.id);
    } catch {
      profile = null;
    }
    // A signed-in customer or provider has no admin profile / no admin role.
    if (!isAdminProfile(profile)) return deny(403, "not_admin");
    return isModeAllowedFor("admin_user", mode)
      ? allow("admin_user", user.id, "admin_session")
      : deny(403, "mode_not_permitted_for_admin");
  }

  // 6. Not a session. Could still be a legitimate service-role key that is not
  //    string-equal to the injected one (dual key systems). The probe decides.
  //    The public anon key fails this, which is exactly the closed door.
  if (deps.probeServiceRole) {
    let proved = false;
    try {
      proved = await deps.probeServiceRole(token);
    } catch {
      proved = false;
    }
    if (proved) {
      return isModeAllowedFor("internal_service", mode)
        ? allow("internal_service", null, "internal_service_capability")
        : deny(403, "mode_not_permitted");
    }
  }

  // 7. Valid project JWT with no identity behind it (the anon key), an expired
  //    session, or a forged token.
  return deny(401, "not_an_authenticated_session");
}
