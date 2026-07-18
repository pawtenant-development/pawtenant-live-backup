/**
 * trackEvent.ts — fire-and-forget structured event logger.
 *
 * Writes a row to public.events via the record_event RPC. NEVER throws,
 * NEVER blocks the UI, NEVER spams the console in production. Safe to call
 * from any component.
 *
 * Phase-3: every event is auto-enriched with attribution + channel + UTMs
 * + click ids + email so call sites don't have to remember to pass them.
 *
 * The session_id is sourced from visitorSession.getSessionId() — the single
 * canonical reader. This file MUST NOT mint or generate any UUIDs.
 *
 * IMPORTANT: PostgREST resolves RPC overloads by named-argument shape. We
 * always send all four keys (use null for absent values) so PostgREST can
 * always resolve to the single record_event(uuid, text, text, jsonb) we
 * defined in the analytics_phase1 migration.
 *
 * Recommended event names (keep this list small):
 *   page_view
 *   cta_click
 *   assessment_started        (helper: trackAssessmentStarted)
 *   otp_requested             (helper: trackOtpRequested)
 *   otp_verified              (helper: trackOtpVerified)
 *   assessment_submitted      (helper: trackAssessmentSubmitted)
 *   assessment_completed      (helper: trackAssessmentCompleted)
 *   assessment_step_view      (legacy helper)
 *   customer_portal_viewed    (helper: trackCustomerPortalViewed)
 *   checkout_viewed           (helper: trackCheckoutViewed)
 *   payment_fields_completed  (helper: trackPaymentFieldsCompleted)
 *   payment_attempted         (helper: trackPaymentAttempted)
 *   payment_failed            (helper: trackPaymentFailed)
 *   payment_success           (helper: trackPaymentSuccess)
 *   recovery_email_sent       (helper: trackRecoveryEmailSent)
 *   recovery_sms_sent         (helper: trackRecoverySmsSent)
 *   recovery_click            (helper: trackRecoveryClick)
 *   recovery_conversion       (helper: trackRecoveryConversion)
 *
 * PRIVACY CONTRACT for the checkout/funnel helpers below: they record ONLY
 * a confirmation_id, letter_type, and coarse booleans / safe category enums.
 * They MUST NEVER receive or store card numbers, CVC, expiry, OTP codes,
 * billing details typed into Stripe, raw Stripe element values, medical
 * assessment answers, email or phone. Callers pass nothing sensitive.
 */

import { supabase } from "./supabaseClient";
import { getSessionId } from "./visitorSession";
import { getAttribution, buildChannel } from "./attributionStore";

const IS_DEV = import.meta.env.DEV;

// ── In-memory dedup guard ───────────────────────────────────────────────────
// Stops the same logical event firing twice in the same browser session for
// events where duplicates would skew the funnel (e.g. payment_success). Keyed
// by `${event_name}|${dedupKey}`. Cleared on page reload by design.
const FIRED = new Set<string>();

function alreadyFired(eventName: string, dedupKey?: string | null): boolean {
  if (!dedupKey) return false;
  const k = `${eventName}|${dedupKey}`;
  if (FIRED.has(k)) return true;
  FIRED.add(k);
  return false;
}

/**
 * Returns props enriched with the standard event-model fields:
 *   timestamp, channel, source, campaign, medium, gclid, fbclid, page_url
 * The caller's keys win on conflict so we never overwrite explicit data.
 */
function getEnrichedProps(extra?: Record<string, unknown>): Record<string, unknown> {
  let attr: ReturnType<typeof getAttribution> | null = null;
  try { attr = getAttribution(); } catch { attr = null; }

  let channel: string | null = null;
  try { channel = buildChannel(); } catch { channel = null; }

  let pageUrl: string | null = null;
  try {
    pageUrl = typeof window !== "undefined" && window.location ? window.location.href : null;
  } catch { pageUrl = null; }

  const enriched: Record<string, unknown> = {
    ts:           new Date().toISOString(),
    channel:      channel ?? null,
    source:       attr?.utm_source   ?? null,
    campaign:     attr?.utm_campaign ?? null,
    medium:       attr?.utm_medium   ?? null,
    gclid:        attr?.gclid        ?? null,
    fbclid:       attr?.fbclid       ?? null,
    referrer:     attr?.referrer     ?? null,
    landing_url:  attr?.landing_url  ?? null,
    page_url:     pageUrl,
    ...(extra ?? {}),
  };

  return enriched;
}

/**
 * Internal: actually fire the RPC. Public callers should prefer the typed
 * helpers below so the event-name list stays small and consistent.
 */
function fire(
  eventName: string,
  props: Record<string, unknown>,
  dedupKey?: string | null,
): void {
  try {
    if (typeof window === "undefined") return;
    if (!eventName || typeof eventName !== "string") return;
    if (alreadyFired(eventName, dedupKey)) return;

    let sessionId: string | null = null;
    try { sessionId = getSessionId(); } catch { sessionId = null; }

    const pageUrl = typeof props.page_url === "string" ? (props.page_url as string) : null;

    const payload = {
      p_session_id: sessionId,
      p_event_name: eventName,
      p_page_url:   pageUrl,
      p_props:      props,
    };

    try {
      void Promise.resolve(supabase.rpc("record_event", payload))
        .then(({ error }) => {
          if (error && IS_DEV) console.debug("[trackEvent] record_event error:", error.message, payload);
        })
        .catch((err) => {
          if (IS_DEV) console.debug("[trackEvent] record_event threw:", err);
        });
    } catch (err) {
      if (IS_DEV) console.debug("[trackEvent] sync throw:", err);
    }
  } catch (err) {
    if (IS_DEV) console.debug("[trackEvent] outer guard:", err);
  }
}

/**
 * Durable one-time firer for milestone events. Routes to the record_event_once
 * RPC, which inserts with ON CONFLICT DO NOTHING against a partial unique index
 * on (event_name, props->>'confirmation_id') covering exactly the one-time
 * milestones (otp_verified, assessment_submitted, payment_fields_completed,
 * payment_success). Unlike the in-memory FIRED set, this survives refresh,
 * resume, remount, callback replay and multiple tabs/devices: the DB enforces
 * "at most one row per (milestone, order)". The in-memory FIRED guard is kept
 * as a same-session fast-path so we don't even issue the redundant network call.
 * Repeatable events must NOT use this — they keep using fire()/record_event.
 */
function fireOnce(
  eventName: string,
  props: Record<string, unknown>,
  dedupKey: string,
): void {
  try {
    if (typeof window === "undefined") return;
    if (!eventName || !dedupKey) return;
    if (alreadyFired(eventName, dedupKey)) return; // same-session fast-path

    let sessionId: string | null = null;
    try { sessionId = getSessionId(); } catch { sessionId = null; }

    const pageUrl = typeof props.page_url === "string" ? (props.page_url as string) : null;

    const payload = {
      p_session_id: sessionId,
      p_event_name: eventName,
      p_page_url:   pageUrl,
      p_props:      props,
    };

    try {
      void Promise.resolve(supabase.rpc("record_event_once", payload))
        .then(({ error }) => {
          if (error && IS_DEV) console.debug("[trackEvent] record_event_once error:", error.message, payload);
        })
        .catch((err) => { if (IS_DEV) console.debug("[trackEvent] record_event_once threw:", err); });
    } catch (err) {
      if (IS_DEV) console.debug("[trackEvent] fireOnce sync throw:", err);
    }
  } catch (err) {
    if (IS_DEV) console.debug("[trackEvent] fireOnce outer guard:", err);
  }
}

/**
 * Generic event firer. Async, non-blocking, swallows ALL errors.
 *
 * Phase-3: now auto-enriches `props` with channel / source / campaign /
 * medium / gclid / fbclid / page_url / referrer / landing_url / ts. Call
 * sites can keep passing only their custom fields — the standard fields
 * are merged automatically.
 */
export function trackEvent(
  eventName: string,
  props?: Record<string, unknown>,
): void {
  fire(eventName, getEnrichedProps(props));
}

// ── Canonical helpers (the small recommended-list above) ─────────────────────

/** page_view — fires on every route change. App.tsx hooks this in. */
export function trackPageView(extra?: Record<string, unknown>): void {
  trackEvent("page_view", extra);
}

/** Generic "user clicked a CTA". `cta` is a stable string label. */
export function trackCtaClick(cta: string, extra?: Record<string, unknown>): void {
  trackEvent("cta_click", { cta, ...(extra ?? {}) });
}

/**
 * Legacy helper — fired from useAssessmentTracking and assessment/page.tsx
 * for steps 1 / 2 / 3. Kept for backward compatibility.
 */
export function trackAssessmentStepView(
  step: 1 | 2 | 3,
  letterType: "esa" | "psd",
  extra?: Record<string, unknown>,
): void {
  trackEvent("assessment_step_view", { step, letter_type: letterType, ...(extra ?? {}) });
}

/** assessment_started — typed wrapper. Deduped per browser session. */
export function trackAssessmentStarted(
  letterType: "esa" | "psd",
  extra?: Record<string, unknown>,
): void {
  fire(
    "assessment_started",
    getEnrichedProps({ letter_type: letterType, ...(extra ?? {}) }),
    `${letterType}`,
  );
}

/** assessment_completed — fires once per confirmation_id when payment is attempted/succeeds. */
export function trackAssessmentCompleted(
  confirmationId: string,
  letterType: "esa" | "psd",
  extra?: Record<string, unknown>,
): void {
  fire(
    "assessment_completed",
    getEnrichedProps({ confirmation_id: confirmationId, letter_type: letterType, ...(extra ?? {}) }),
    confirmationId,
  );
}

/**
 * payment_attempted — fired ONLY when the customer presses the final Pay
 * button and the app begins Stripe confirmation (stripe.confirmCardPayment).
 * NOT fired when a PaymentIntent is merely created/refreshed. Deliberately NOT
 * deduped: each genuine attempt (a real retry after a decline) is a distinct
 * event and must be counted.
 */
export function trackPaymentAttempted(
  confirmationId: string,
  extra?: Record<string, unknown>,
): void {
  fire(
    "payment_attempted",
    getEnrichedProps({ confirmation_id: confirmationId, ...(extra ?? {}) }),
    // No dedup key — separate real attempts are distinct events.
  );
}

/**
 * payment_success — fired when Stripe returns a succeeded PaymentIntent.
 * Deduped by confirmation_id so re-renders / redirect bounces can't double
 * count. Pass any of plan, price, payment_method, user_email in extra.
 */
export function trackPaymentSuccess(
  confirmationId: string,
  extra?: Record<string, unknown>,
): void {
  // One-time milestone: durable so redirect bounces / remounts / two tabs can't
  // double-record a success for the same order. (Admin paid truth is still
  // orders.paid_at, not this event.)
  fireOnce(
    "payment_success",
    getEnrichedProps({ confirmation_id: confirmationId, ...(extra ?? {}) }),
    confirmationId,
  );
}

// ── Assessment → checkout funnel helpers ─────────────────────────────────────
//
// These fill the gaps between the existing assessment_* and payment_* events
// so the Admin Attribution tab can show the full per-order funnel. All are
// fire-and-forget and deduped per confirmation_id per browser session (the
// FIRED set clears on reload, so a genuinely new session re-fires — matching
// "checkout_viewed / portal_viewed may recur across separate sessions").

/** Safe, non-PII payment failure categories stored in analytics. */
export type PaymentFailureCategory =
  | "validation_failed"
  | "authentication_required"
  | "card_declined"
  | "processing_error"
  | "session_expired"
  | "unknown";

/**
 * Map a Stripe error shape to a coarse, privacy-safe category. Accepts a plain
 * object (no Stripe types) carrying only `type` / `code` strings — NEVER the
 * raw message, so no card / decline detail can leak into analytics.
 */
export function classifyPaymentFailure(
  err: { type?: string | null; code?: string | null } | null | undefined,
): PaymentFailureCategory {
  const type = (err?.type ?? "").toLowerCase();
  const code = (err?.code ?? "").toLowerCase();

  if (type === "validation_error") return "validation_failed";
  if (code === "card_declined" || code === "expired_card" || code === "incorrect_cvc" ||
      code === "incorrect_number" || code === "insufficient_funds") return "card_declined";
  if (code === "authentication_required" || code === "payment_intent_authentication_failure")
    return "authentication_required";
  if (code === "processing_error" || type === "api_error") return "processing_error";
  if (code === "payment_intent_unexpected_state" || code === "resource_missing" ||
      code === "expired_session") return "session_expired";
  if (type === "card_error") return "card_declined";
  return "unknown";
}

/**
 * otp_requested — fired for each genuine NEW code the server dispatches. The
 * caller gates on a non-cooldown accepted send, so a within-45s cooldown reply
 * (no new email) does NOT fire. Repeatable: a genuine resend after cooldown is a
 * distinct request and must be counted, so this is NOT deduped.
 */
export function trackOtpRequested(
  confirmationId: string,
  letterType: "esa" | "psd",
  extra?: Record<string, unknown>,
): void {
  fire(
    "otp_requested",
    getEnrichedProps({ confirmation_id: confirmationId, letter_type: letterType, ...(extra ?? {}) }),
    // No dedup key — a genuine resend is a distinct request.
  );
}

/**
 * otp_verified — fired ONLY after verify-customer-otp returns verified:true.
 * The server verification result is the gate: this helper is never called on
 * a form view or a failed attempt. No OTP code is ever passed here.
 */
export function trackOtpVerified(
  confirmationId: string,
  letterType: "esa" | "psd",
  extra?: Record<string, unknown>,
): void {
  // One-time milestone — durable across refresh/resume/remount/two tabs.
  fireOnce(
    "otp_verified",
    getEnrichedProps({ confirmation_id: confirmationId, letter_type: letterType, ...(extra ?? {}) }),
    confirmationId,
  );
}

/**
 * assessment_submitted — fired once per order when the assessment answers are
 * successfully persisted (the lead upsert), not on button click. Distinct from
 * assessment_completed, which marks the payment milestone.
 */
export function trackAssessmentSubmitted(
  confirmationId: string,
  letterType: "esa" | "psd",
  extra?: Record<string, unknown>,
): void {
  // One-time milestone — durable across refresh/resume/remount/two tabs.
  fireOnce(
    "assessment_submitted",
    getEnrichedProps({ confirmation_id: confirmationId, letter_type: letterType, ...(extra ?? {}) }),
    confirmationId,
  );
}

/**
 * customer_portal_viewed — fired once per portal page-load per order when the
 * authenticated customer's own order renders. Not fired for admin preview and
 * not on every rerender (deduped by confirmation_id within the page session).
 */
export function trackCustomerPortalViewed(
  confirmationId: string,
  extra?: Record<string, unknown>,
): void {
  if (!confirmationId) return;
  fire(
    "customer_portal_viewed",
    getEnrichedProps({ confirmation_id: confirmationId, ...(extra ?? {}) }),
    confirmationId,
  );
}

/**
 * checkout_viewed — fired when the checkout surface actually renders for the
 * customer. Deduped per order per browser session; a fresh page load (new
 * session) re-fires, which is the intended "viewed again" signal.
 */
export function trackCheckoutViewed(
  confirmationId: string,
  extra?: Record<string, unknown>,
): void {
  if (!confirmationId) return;
  fire(
    "checkout_viewed",
    getEnrichedProps({ confirmation_id: confirmationId, ...(extra ?? {}) }),
    confirmationId,
  );
}

/**
 * payment_fields_completed — boolean/timestamp milestone fired once when all
 * required Stripe card fields first report complete. Records ONLY
 * { complete: true, checkout_type } — never any card data. The `complete`
 * signal comes from Stripe Element onChange events (no field contents cross
 * into our code).
 */
export function trackPaymentFieldsCompleted(
  confirmationId: string,
  extra?: { checkout_type?: string } & Record<string, unknown>,
): void {
  if (!confirmationId) return;
  // One-time milestone (first time all fields report complete) — durable across
  // refresh/resume/remount/two tabs.
  fireOnce(
    "payment_fields_completed",
    getEnrichedProps({ confirmation_id: confirmationId, complete: true, ...(extra ?? {}) }),
    confirmationId,
  );
}

/**
 * payment_failed — fired on a real Stripe/confirm failure. Stores only a safe
 * category enum, never the raw error message or decline detail. NOT deduped:
 * genuinely separate failed attempts should each record.
 */
export function trackPaymentFailed(
  confirmationId: string,
  category: PaymentFailureCategory,
  extra?: Record<string, unknown>,
): void {
  fire(
    "payment_failed",
    getEnrichedProps({ confirmation_id: confirmationId, category, ...(extra ?? {}) }),
    // No dedup key — separate real attempts are distinct events.
  );
}

// ── Recovery funnel helpers ──────────────────────────────────────────────────

// Active recovery stages currently wired in the backend
// (supabase/functions/lead-followup-sequence/core.ts). Additional stages
// (48-hour, 5-day, SMS) are planned but not yet implemented — add them
// back here only when the backend sequence engine actually sends them.
export type RecoveryStage =
  | "seq_30min"
  | "seq_24h"
  | "seq_3day";

/** recovery_email_sent — log when an automated recovery email is dispatched. */
export function trackRecoveryEmailSent(
  stage: RecoveryStage | string,
  confirmationId?: string | null,
  extra?: Record<string, unknown>,
): void {
  fire(
    "recovery_email_sent",
    getEnrichedProps({
      stage,
      channel_type: "email",
      confirmation_id: confirmationId ?? null,
      ...(extra ?? {}),
    }),
    `${stage}|${confirmationId ?? ""}`,
  );
}

/** recovery_sms_sent — log when a recovery SMS is dispatched. */
export function trackRecoverySmsSent(
  stage: RecoveryStage | string,
  confirmationId?: string | null,
  extra?: Record<string, unknown>,
): void {
  fire(
    "recovery_sms_sent",
    getEnrichedProps({
      stage,
      channel_type: "sms",
      confirmation_id: confirmationId ?? null,
      ...(extra ?? {}),
    }),
    `${stage}|${confirmationId ?? ""}`,
  );
}

/** recovery_click — fired when the user clicks a tracked recovery link. */
export function trackRecoveryClick(
  stage: RecoveryStage | string,
  confirmationId?: string | null,
  extra?: Record<string, unknown>,
): void {
  fire(
    "recovery_click",
    getEnrichedProps({
      stage,
      confirmation_id: confirmationId ?? null,
      ...(extra ?? {}),
    }),
    `${stage}|${confirmationId ?? ""}`,
  );
}

/** recovery_conversion — fired when a recovery-attributed visitor converts. */
export function trackRecoveryConversion(
  stage: RecoveryStage | string,
  confirmationId: string,
  extra?: Record<string, unknown>,
): void {
  fire(
    "recovery_conversion",
    getEnrichedProps({
      stage,
      confirmation_id: confirmationId,
      ...(extra ?? {}),
    }),
    `${stage}|${confirmationId}`,
  );
}

/**
 * Phase-3B recovery attribution flag — set by /r/<stage> click bridge,
 * read once at payment_success, then cleared so a refresh can't double
 * count.
 */
const RECOVERY_FLAG_KEY = "pt_recovery_attribution";

interface RecoveryFlagShape {
  stage: string;
  confirmation_id: string;
  discount_code: string | null;
  clicked_at: string;
}

/**
 * If the user clicked a recovery link in this browser (any tab) and now
 * converts, fire recovery_conversion linked to the original stage. The
 * flag is cleared after read so subsequent loads don't re-fire.
 *
 * Safe to call from any payment-success site. Fire-and-forget. Returns
 * true if a recovery_conversion was fired, false otherwise.
 */
export function trackRecoveryConversionIfFlagged(
  confirmationId: string,
  extra?: Record<string, unknown>,
): boolean {
  if (!confirmationId) return false;
  if (typeof localStorage === "undefined") return false;

  let raw: string | null = null;
  try { raw = localStorage.getItem(RECOVERY_FLAG_KEY); } catch { raw = null; }
  if (!raw) return false;

  let flag: RecoveryFlagShape | null = null;
  try { flag = JSON.parse(raw) as RecoveryFlagShape; } catch { flag = null; }
  if (!flag || !flag.stage) {
    try { localStorage.removeItem(RECOVERY_FLAG_KEY); } catch { /* ignore */ }
    return false;
  }

  try {
    trackRecoveryConversion(flag.stage, confirmationId, {
      discount_code: flag.discount_code ?? null,
      clicked_at: flag.clicked_at ?? null,
      flag_confirmation_id: flag.confirmation_id ?? null,
      ...(extra ?? {}),
    });
  } catch { /* ignore */ }

  try { localStorage.removeItem(RECOVERY_FLAG_KEY); } catch { /* ignore */ }
  return true;
}
