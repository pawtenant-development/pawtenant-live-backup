/**
 * visitorSession.ts — Lightweight visitor session tracking.
 *
 * Records a row in public.visitor_sessions for every browser session (not
 * just chat users) so we can attribute ALL traffic, not just converters.
 *
 * Design rules:
 *   - Fire-and-forget. Never blocks the page. Never throws.
 *   - Idempotent — only ONE row per sessionStorage session.
 *   - The session_id is OWNED by attributionStore.captureFromUrl(); this file
 *     mirrors it into "__pt_visitor_session_id" for legacy callsites and
 *     never mints a parallel UUID.
 *   - Events (chat_opened / first_message / assessment_started / paid) are
 *     each guarded by a sessionStorage flag so they fire at most once per
 *     browser session.
 *   - Privacy: we do not send IP. Geo is only included when the page has
 *     already cached a country code in sessionStorage["geo_country"]. When
 *     not available we still send p_geo: null so PostgREST can resolve the
 *     15-arg signature of record_visitor_session.
 */

import { supabase } from "./supabaseClient";
import { buildChannel, getAttribution } from "./attributionStore";

const IS_DEV = import.meta.env.DEV;

const SESSION_KEY      = "__pt_visitor_session_id";
const RECORDED_KEY     = "__pt_visitor_session_recorded";
const CHAT_OPEN_KEY    = "__pt_visitor_chat_opened";
const FIRST_MSG_KEY    = "__pt_visitor_first_message";
const ASSESS_START_KEY = "__pt_visitor_assessment_started";
const PAID_KEY         = "__pt_visitor_paid";

// ── sessionStorage helpers (swallow errors — must never break the page) ─────
function ssGet(key: string): string | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function ssSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function ssDel(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function detectDevice(ua: string): "mobile" | "desktop" {
  return /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua)
    ? "mobile"
    : "desktop";
}

// ── Internal-route exclusion ────────────────────────────────────────────────
// Visitor-intelligence pipeline must only record customer-facing public
// traffic. Admin / portal / auth surfaces are excluded entirely:
//
//   * No visitor_sessions row is inserted.
//   * No heartbeat pulse is sent (last_seen_at + current_page stay frozen).
//   * Excluded routes never appear in Live Visitors.
//
// /admin matches via prefix so /admin, /admin-orders, /admin-login,
// /admin-doctors, /admin-guide, /admin-orders/live, and any future
// /admin-* route are automatically covered. Authenticated portal /
// session-reset routes are listed explicitly.
const INTERNAL_EXACT_PATHS = new Set<string>([
  "/customer-login",
  "/my-orders",
  "/reset-password",
  "/go-live",
  "/provider-login",
]);

/**
 * Returns true when the given pathname is an internal / admin / portal
 * surface that must be excluded from visitor-session tracking. Defensive
 * defaults: empty input / SSR → false (treat unknown as tracked, since
 * we never want a false-positive exclusion to silence a real visitor).
 *
 * Falls back to window.location.pathname when no argument is supplied,
 * so internal callers (ensureVisitorSession, pulseVisitorSession) can
 * stay zero-arg.
 */
export function isInternalAdminPath(pathname?: string | null): boolean {
  let p: string | null | undefined = pathname;
  if (p === undefined || p === null) {
    if (typeof window === "undefined") return false;
    try { p = window.location.pathname; } catch { p = null; }
  }
  if (!p || typeof p !== "string") return false;
  const lower = p.toLowerCase();

  // Any /admin or /admin-* route (covers /admin-orders/live too).
  if (lower === "/admin" || lower.startsWith("/admin/") || lower.startsWith("/admin-")) {
    return true;
  }
  // Exact-match explicit internal paths.
  if (INTERNAL_EXACT_PATHS.has(lower)) return true;
  // Nested under any of the above (defensive — none today, but future-proof).
  for (const exact of INTERNAL_EXACT_PATHS) {
    if (lower.startsWith(exact + "/")) return true;
  }
  return false;
}

/**
 * Canonical session_id reader — used by every tracking site (events, orders,
 * Stripe metadata, RPC calls). Always prefers the attributionStore session_id
 * (set on first captureFromUrl) so all systems agree.
 *
 * IMPORTANT: this function MUST NOT generate a new UUID. The single owner of
 * UUID generation for the session is attributionStore.captureFromUrl().
 */
export function getSessionId(): string | null {
  try {
    const fromAttribution = getAttribution().session_id;
    if (fromAttribution) {
      try {
        if (!ssGet(SESSION_KEY)) ssSet(SESSION_KEY, fromAttribution);
      } catch { /* ignore */ }
      return fromAttribution;
    }
  } catch {
    /* fall through to legacy read */
  }
  return ssGet(SESSION_KEY);
}

export function getVisitorSessionId(): string {
  return getSessionId() ?? "";
}

/**
 * Insert the visitor_sessions row on first call per browser session.
 * Safe to call on every route change — guarded by sessionStorage flag.
 * Fully async and non-blocking.
 *
 * IMPORTANT: PostgREST resolves RPC overloads by named-argument shape. The
 * underlying record_visitor_session function has 15 typed params, so we
 * MUST send all 15 keys (use null when absent) — otherwise PostgREST 404s
 * with "Could not find the function …" and the row is never written.
 *
 * The single source of truth for the RPC arg shape is `payload` below. We
 * always include p_geo (null when no country is cached). Do not introduce
 * any conditional spread that could omit a key.
 */
export function ensureVisitorSession(): void {
  if (typeof window === "undefined") return;
  if (ssGet(RECORDED_KEY) === "1") return;

  // Visitor pipeline is for customer-facing traffic only. Admin / portal
  // / auth surfaces never insert a visitor_sessions row.
  if (isInternalAdminPath()) return;

  const sessionId = getSessionId();
  if (!sessionId) return; // attributionStore hasn't run yet — wait for next route change.

  // Mark early so rapid navigation can't double-insert while the RPC is in flight.
  ssSet(RECORDED_KEY, "1");

  const attr = getAttribution();
  const ua   = typeof navigator !== "undefined" ? navigator.userAgent : "";

  // Geo is opt-in. If we have a country code cached, send it; otherwise null.
  // Either way the key MUST be present.
  const country = ssGet("geo_country");
  const geoVal: { country: string } | null = country ? { country } : null;

  // ALWAYS-FULL payload — every one of the 15 named params present.
  const payload: Record<string, unknown> = {
    p_session_id:   sessionId,
    p_channel:      buildChannel(),
    p_utm_source:   attr.utm_source   ?? null,
    p_utm_medium:   attr.utm_medium   ?? null,
    p_utm_campaign: attr.utm_campaign ?? null,
    p_utm_term:     attr.utm_term     ?? null,
    p_utm_content:  attr.utm_content  ?? null,
    p_gclid:        attr.gclid        ?? null,
    p_fbclid:       attr.fbclid       ?? null,
    p_ref:          attr.ref          ?? null,
    p_landing_url:  attr.landing_url  ?? null,
    p_referrer:     attr.referrer     ?? null,
    p_device:       detectDevice(ua),
    p_user_agent:   ua                ?? null,
    p_geo:          geoVal,
  };

  try {
    void supabase
      .rpc("record_visitor_session", payload)
      .then(({ error }) => {
        if (error) {
          if (IS_DEV) console.debug("[visitorSession] record_visitor_session error:", error.message);
          ssDel(RECORDED_KEY);
        }
      })
      .catch((err) => {
        if (IS_DEV) console.debug("[visitorSession] record_visitor_session threw:", err);
        ssDel(RECORDED_KEY);
      });
  } catch (err) {
    if (IS_DEV) console.debug("[visitorSession] record_visitor_session sync throw:", err);
    ssDel(RECORDED_KEY);
  }
}

/**
 * Fire a milestone event for the current visitor session. Guarded by a
 * per-event sessionStorage flag so it fires at most once per browser session.
 */
function markEvent(flagKey: string, event: string): void {
  if (typeof window === "undefined") return;
  if (ssGet(flagKey) === "1") return;

  const sessionId = getSessionId();
  if (!sessionId) return;

  ssSet(flagKey, "1");

  try {
    void supabase
      .rpc("mark_visitor_session_event", {
        p_session_id: sessionId,
        p_event:      event,
      })
      .then(({ error }) => {
        if (error && IS_DEV) console.debug("[visitorSession] mark_visitor_session_event error:", error.message);
      })
      .catch((err) => {
        if (IS_DEV) console.debug("[visitorSession] mark_visitor_session_event threw:", err);
      });
  } catch (err) {
    if (IS_DEV) console.debug("[visitorSession] mark_visitor_session_event sync throw:", err);
  }
}

/**
 * pulseVisitorSession — fire-and-forget visitor heartbeat.
 *
 * Calls the bump_visitor_pulse RPC to update last_seen_at + current_page
 * (and increment page_count when the page changes). Safe to call from any
 * route effect AND from a 30s interval. Pauses automatically when the tab
 * is hidden so we don't inflate "active" counts with background tabs.
 *
 * Never throws. Never blocks. No-ops when the session_id is not ready yet
 * (the next call will land — record_visitor_session inserts the row first).
 *
 * The current_page argument is stripped of query string + hash client-side
 * so we never persist fbclid/gclid into the live table. Attribution stays
 * in attributionStore + visitor_sessions.utm_* / *clid columns where it
 * already lives.
 */
export function pulseVisitorSession(currentPage?: string | null): void {
  if (typeof window === "undefined") return;

  // Don't heartbeat from a hidden tab — keeps writes low and the live
  // list honest about who is actually looking at the page.
  try {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
  } catch {
    /* visibility API unavailable — proceed */
  }

  // Visitor pipeline is for customer-facing traffic only. If the caller
  // passed a path, gate on it directly; otherwise fall back to the live
  // window.location pathname via the helper.
  if (isInternalAdminPath(currentPage ?? null)) return;

  const sessionId = getSessionId();
  if (!sessionId) return;

  // Strip query + hash so current_page stays low-cardinality and never
  // captures click ids. Empty / non-string → null (server keeps prior value).
  let path: string | null = null;
  if (typeof currentPage === "string" && currentPage.length > 0) {
    path = currentPage.split("?")[0].split("#")[0] || null;
  }

  try {
    void supabase
      .rpc("bump_visitor_pulse", {
        p_session_id:   sessionId,
        p_current_page: path,
      })
      .then(({ error }) => {
        if (error && IS_DEV) console.debug("[visitorSession] bump_visitor_pulse error:", error.message);
      })
      .catch((err) => {
        if (IS_DEV) console.debug("[visitorSession] bump_visitor_pulse threw:", err);
      });
  } catch (err) {
    if (IS_DEV) console.debug("[visitorSession] bump_visitor_pulse sync throw:", err);
  }
}

export function markChatOpened(): void {
  markEvent(CHAT_OPEN_KEY, "chat_opened");
}

export function markFirstMessage(): void {
  markEvent(FIRST_MSG_KEY, "first_message");
}

export function markAssessmentStarted(): void {
  markEvent(ASSESS_START_KEY, "assessment_started");
}

export function markPaid(): void {
  markEvent(PAID_KEY, "paid");
}

/**
 * Back-link the visitor_sessions row to a confirmation_id when the order
 * converts. Idempotent (the RPC uses COALESCE), fire-and-forget, swallows
 * all errors. Safe to call from the thank-you page or wherever the order
 * id becomes available client-side.
 */
export function linkSessionToOrder(confirmationId: string): void {
  if (typeof window === "undefined") return;
  if (!confirmationId) return;

  const sessionId = getSessionId();
  if (!sessionId) return;

  try {
    void supabase
      .rpc("link_session_to_order", {
        p_session_id:      sessionId,
        p_confirmation_id: confirmationId,
      })
      .then(({ error }) => {
        if (error && IS_DEV) console.debug("[visitorSession] link_session_to_order error:", error.message);
      })
      .catch((err) => {
        if (IS_DEV) console.debug("[visitorSession] link_session_to_order threw:", err);
      });
  } catch (err) {
    if (IS_DEV) console.debug("[visitorSession] link_session_to_order sync throw:", err);
  }
}
