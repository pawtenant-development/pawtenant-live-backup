/**
 * visitorSession.ts — Lightweight visitor session tracking.
 *
 * Records a row in public.visitor_sessions for every browser session (not
 * just chat users) so we can attribute ALL traffic, not just converters.
 *
 * Design rules:
 *   - Fire-and-forget. Never blocks the page. Never throws.
 *   - Idempotent — only ONE row per sessionStorage session.
 *   - Uses its own session_id (stored in "__pt_visitor_session_id") so the
 *     attribution store and chat session id remain independent.
 *   - Events (chat_opened / first_message / assessment_started / paid) are
 *     each guarded by a sessionStorage flag so they fire at most once per
 *     browser session.
 *   - Privacy: we do not send IP. Geo is only included when the page has
 *     already cached a country code in sessionStorage["geo_country"].
 */

import { supabase } from "./supabaseClient";
import { buildChannel, getAttribution } from "./attributionStore";

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

function newUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // RFC-4122-ish fallback.
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${h()}${h()}-${h()}-4${h().slice(1)}-${((Math.random() * 4) | 8).toString(16)}${h().slice(1)}-${h()}${h()}${h()}`;
}

function detectDevice(ua: string): "mobile" | "desktop" {
  return /Mobi|Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(ua)
    ? "mobile"
    : "desktop";
}

function getOrCreateSessionId(): string {
  const existing = ssGet(SESSION_KEY);
  if (existing) return existing;
  const id = newUuid();
  ssSet(SESSION_KEY, id);
  return id;
}

export function getVisitorSessionId(): string {
  return getOrCreateSessionId();
}

/**
 * Insert the visitor_sessions row on first call per browser session.
 * Safe to call on every route change — guarded by sessionStorage flag.
 * Fully async and non-blocking.
 */
export function ensureVisitorSession(): void {
  if (typeof window === "undefined") return;
  if (ssGet(RECORDED_KEY) === "1") return;

  // Mark early so rapid navigation can't double-insert while the RPC is in flight.
  ssSet(RECORDED_KEY, "1");

  const sessionId = getOrCreateSessionId();
  const attr      = getAttribution();
  const ua        = typeof navigator !== "undefined" ? navigator.userAgent : "";

  // Only include geo when useGeoBlock has already cached a country code.
  // If not available, omit the field entirely (do not send null).
  const country = ssGet("geo_country");
  const geoArg  = country ? { p_geo: { country } } : {};

  try {
    void supabase
      .rpc("record_visitor_session", {
        p_session_id:   sessionId,
        p_channel:      buildChannel(),
        p_utm_source:   attr.utm_source,
        p_utm_medium:   attr.utm_medium,
        p_utm_campaign: attr.utm_campaign,
        p_utm_term:     attr.utm_term,
        p_utm_content:  attr.utm_content,
        p_gclid:        attr.gclid,
        p_fbclid:       attr.fbclid,
        p_ref:          attr.ref,
        p_landing_url:  attr.landing_url,
        p_referrer:     attr.referrer,
        p_device:       detectDevice(ua),
        p_user_agent:   ua,
        ...geoArg,
      })
      .then(({ error }) => {
        // If the insert fails (network / cold start), clear the flag so the
        // next navigation retries. No logging — this is best-effort.
        if (error) ssDel(RECORDED_KEY);
      });
  } catch {
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
  ssSet(flagKey, "1");

  const sessionId = ssGet(SESSION_KEY);
  if (!sessionId) return;

  try {
    void supabase
      .rpc("mark_visitor_session_event", {
        p_session_id: sessionId,
        p_event:      event,
      })
      .then(() => { /* best-effort */ });
  } catch {
    /* ignore */
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
