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
 *   assessment_completed      (helper: trackAssessmentCompleted)
 *   assessment_step_view      (legacy helper)
 *   payment_attempted         (helper: trackPaymentAttempted)
 *   payment_success           (helper: trackPaymentSuccess)
 *   recovery_email_sent       (helper: trackRecoveryEmailSent)
 *   recovery_sms_sent         (helper: trackRecoverySmsSent)
 *   recovery_click            (helper: trackRecoveryClick)
 *   recovery_conversion       (helper: trackRecoveryConversion)
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
      void supabase
        .rpc("record_event", payload)
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

/** payment_attempted — fired right before Stripe confirmation. */
export function trackPaymentAttempted(
  confirmationId: string,
  extra?: Record<string, unknown>,
): void {
  fire(
    "payment_attempted",
    getEnrichedProps({ confirmation_id: confirmationId, ...(extra ?? {}) }),
    confirmationId,
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
  fire(
    "payment_success",
    getEnrichedProps({ confirmation_id: confirmationId, ...(extra ?? {}) }),
    confirmationId,
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
