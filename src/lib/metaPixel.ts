/**
 * metaPixel.ts — Centralized Meta Pixel (Facebook) event tracking utilities.
 *
 * Pixel ID: 2970753196590228
 * The fbevents.js script is loaded once via index.html.
 * PageView is fired by MetaPageView in App.tsx on every SPA route change.
 * Purchase deduplication uses sessionStorage keyed by confirmationId.
 *
 * ── EVENT_ID FORMAT CONTRACT (IMMUTABLE) ─────────────────────────────────────
 * The event_id format is defined ONCE here as META_PURCHASE_EVENT_ID_FORMAT
 * and must NEVER be changed without a coordinated update to the CAPI function.
 *
 * Format:  "purchase_{confirmationId}"
 * Builder: buildMetaPurchaseEventId(confirmationId)
 *
 * This is the key Meta uses to deduplicate the browser pixel event against
 * the server-side CAPI event. If they match → counted once. If they differ
 * → double-counted.
 *
 * ── WHERE THIS IS USED ────────────────────────────────────────────────────────
 * Frontend (this file):
 *   fireMetaPurchase() → buildMetaPurchaseEventId(confirmationId)
 *
 * Backend (supabase/functions/send-meta-capi-event/index.ts):
 *   eventId = `purchase_${confirmationId}`   ← MUST match META_PURCHASE_EVENT_ID_FORMAT
 *
 * Backend (supabase/functions/send-meta-events/index.ts):
 *   event_id = `purchase_${confirmation_id}` ← MUST match META_PURCHASE_EVENT_ID_FORMAT
 *
 * ── CHANGE PROTOCOL ──────────────────────────────────────────────────────────
 * If you ever need to change this format:
 *   1. Update META_PURCHASE_EVENT_ID_FORMAT below
 *   2. Update the matching string in send-meta-capi-event/index.ts
 *   3. Update the matching string in send-meta-events/index.ts
 *   4. Deploy all three simultaneously — any mismatch causes double-counting
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * ── CANONICAL EVENT_ID FORMAT ─────────────────────────────────────────────────
 * This is the single source of truth for the Meta Purchase event_id format.
 * The backend CAPI functions MUST produce the same string.
 *
 * Format: "purchase_{confirmationId}"
 * Example: "purchase_PT-ABC123"
 *
 * DO NOT change this format. If you must, update all three locations listed above.
 */
export const META_PURCHASE_EVENT_ID_PREFIX = "purchase_" as const;

/**
 * Builds the canonical Meta Purchase event_id for a given confirmation ID.
 * Use this in ALL places that generate a Purchase event_id — never hardcode.
 *
 * @param confirmationId - The order confirmation ID (e.g. "PT-ABC123")
 * @returns The canonical event_id string (e.g. "purchase_PT-ABC123")
 */
export function buildMetaPurchaseEventId(confirmationId: string): string {
  return `${META_PURCHASE_EVENT_ID_PREFIX}${confirmationId}`;
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

// ── Phase-1: Lead + InitiateCheckout dedup event-id format ──────────────────
// Same protocol as Purchase: keyed by a stable per-browser id (session_id from
// the existing attributionStore). Pixel and CAPI must produce the same string
// for Meta to dedup non-Purchase events.
export const META_LEAD_EVENT_ID_PREFIX = "lead_" as const;
export const META_INITIATE_CHECKOUT_EVENT_ID_PREFIX = "initiatecheckout_" as const;

export function buildMetaLeadEventId(sessionId: string): string {
  return `${META_LEAD_EVENT_ID_PREFIX}${sessionId}`;
}

export function buildMetaInitiateCheckoutEventId(sessionId: string): string {
  return `${META_INITIATE_CHECKOUT_EVENT_ID_PREFIX}${sessionId}`;
}

// ── Phase-1: read _fbp cookie (Meta browser pixel cookie) ───────────────────
// Set by fbevents.js on first PageView. Format: fb.1.<ms_timestamp>.<random>.
// Read-only — never written or modified by us. Safe to call from any page.
export function getFbp(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const match = document.cookie
      .split("; ")
      .find((row) => row.startsWith("_fbp="));
    if (!match) return null;
    const v = match.slice(5);
    return v || null;
  } catch {
    return null;
  }
}

// ── Phase-1: fire-and-forget CAPI mirror for Lead / InitiateCheckout ────────
// Sends the same event_id the Pixel just fired to the Supabase edge function
// `send-meta-browser-event`, which forwards to Meta CAPI. Meta dedups by
// (event_name, event_id) so this is safe to fire alongside the Pixel.
//
// Never throws. Never blocks. If the fetch fails the Pixel side is unaffected.
function dispatchCapiMirror(opts: {
  eventName: "Lead" | "InitiateCheckout";
  eventId: string;
  email?: string;
  value?: number;
  currency?: string;
  content_name?: string;
}): void {
  if (typeof window === "undefined") return;
  try {
    const supaUrl = (import.meta.env.VITE_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? "") as string;
    const anonKey = (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "") as string;
    if (!supaUrl || !anonKey) return;

    const url = `${supaUrl.replace(/\/+$/, "")}/functions/v1/send-meta-browser-event`;
    const body = JSON.stringify({
      event_name: opts.eventName,
      event_id: opts.eventId,
      email: opts.email ?? null,
      value: opts.value ?? null,
      currency: opts.currency ?? "USD",
      content_name: opts.content_name ?? null,
      fbp: getFbp(),
      event_source_url: typeof window !== "undefined" && window.location ? window.location.href : null,
    });

    // Prefer sendBeacon for reliability across navigations; fall back to fetch.
    const beaconOk = (() => {
      try {
        if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
        const blob = new Blob([body], { type: "application/json" });
        return navigator.sendBeacon(`${url}?apikey=${encodeURIComponent(anonKey)}`, blob);
      } catch { return false; }
    })();
    if (beaconOk) return;

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": anonKey, "Authorization": `Bearer ${anonKey}` },
      body,
      keepalive: true,
    }).catch(() => { /* ignore */ });
  } catch {
    /* ignore — analytics must never break the page */
  }
}

// ── SHA-256 email hashing for Meta advanced matching ──────────────────────────
async function sha256Hex(message: string): Promise<string> {
  try {
    const msgBuffer = new TextEncoder().encode(message.toLowerCase().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

/**
 * Fire PageView — called by MetaPageView on every SPA route change.
 */
export function firePageView(): void {
  if (typeof window.fbq !== 'function') return;
  if (import.meta.env.DEV) console.log('[Meta Pixel] PageView firing', window.location.pathname);
  window.fbq('track', 'PageView');
}

/**
 * Fire Lead — call when a user submits personal info (Step 2) or arrives
 * on a thank-you page via a redirect-based payment (Klarna / QR).
 *
 * Phase-1: optionally accepts sessionId + email to enable Pixel↔CAPI dedup
 * via shared event_id `lead_<sessionId>`. When sessionId is provided, also
 * dispatches a fire-and-forget CAPI mirror via `send-meta-browser-event`.
 * Old call sites with no args still work — they emit a Pixel-only Lead
 * (Meta does not dedup events without an event_id).
 */
export function fireLead(opts?: { sessionId?: string; email?: string }): void {
  if (typeof window.fbq !== 'function') return;
  const sessionId = opts?.sessionId;
  if (sessionId) {
    const eventId = buildMetaLeadEventId(sessionId);
    if (import.meta.env.DEV) console.log('[Meta Pixel] Lead firing', { eventId });
    window.fbq('track', 'Lead', {}, { eventID: eventId });
    dispatchCapiMirror({ eventName: "Lead", eventId, email: opts?.email });
    return;
  }
  if (import.meta.env.DEV) console.log('[Meta Pixel] Lead firing (no eventID — legacy call)');
  window.fbq('track', 'Lead');
}

/**
 * Fire InitiateCheckout — call when the user enters the payment/checkout step.
 *
 * Phase-1: optionally accepts sessionId + email to enable Pixel↔CAPI dedup
 * via shared event_id `initiatecheckout_<sessionId>`. When sessionId is
 * provided, also dispatches a fire-and-forget CAPI mirror.
 */
export function fireInitiateCheckout(params: {
  value?: number;
  currency?: string;
  content_name?: string;
  num_items?: number;
  sessionId?: string;
  email?: string;
}): void {
  if (typeof window.fbq !== 'function') return;
  const payload = {
    value: params.value ?? 0,
    currency: params.currency ?? 'USD',
    content_name: params.content_name ?? 'ESA Letter Checkout',
    num_items: params.num_items ?? 1,
  };
  const sessionId = params.sessionId;
  if (sessionId) {
    const eventId = buildMetaInitiateCheckoutEventId(sessionId);
    if (import.meta.env.DEV) console.log('[Meta Pixel] InitiateCheckout firing', { ...payload, eventId });
    window.fbq('track', 'InitiateCheckout', payload, { eventID: eventId });
    dispatchCapiMirror({
      eventName: "InitiateCheckout",
      eventId,
      email: params.email,
      value: payload.value,
      currency: payload.currency,
      content_name: payload.content_name,
    });
    return;
  }
  if (import.meta.env.DEV) console.log('[Meta Pixel] InitiateCheckout firing (no eventID — legacy call)', payload);
  window.fbq('track', 'InitiateCheckout', payload);
}

/**
 * Fire Purchase — fires ONLY when:
 *   - confirmationId exists (non-empty string)
 *   - value exists and is > 0 (payment confirmed)
 *   - NOT already fired for this confirmationId this session (sessionStorage dedup)
 *
 * Includes:
 *   - value + currency (USD)
 *   - order_id for server-side matching
 *   - eventID for Conversions API deduplication (MUST match backend CAPI event_id)
 *   - external_id (SHA-256 hashed email) for advanced matching
 *
 * ── DEDUPLICATION ─────────────────────────────────────────────────────────────
 * eventID = "purchase_{confirmationId}"
 *
 * This MUST match the event_id sent by the backend CAPI function:
 *   supabase/functions/send-meta-capi-event/index.ts
 *
 * Meta uses this shared event_id to deduplicate the browser pixel event
 * against the server-side CAPI event, counting the conversion only once.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export async function fireMetaPurchase(opts: {
  value: number;
  confirmationId: string;
  email?: string;
  contentName?: string;
}): Promise<void> {
  if (typeof window.fbq !== 'function') return;

  // Guard: must have both a confirmationId and a positive value
  if (!opts.confirmationId || !opts.value || opts.value <= 0) {
    if (import.meta.env.DEV) console.warn('[Meta Pixel] Purchase skipped — missing confirmationId or value', opts);
    return;
  }

  // Deduplication: only fire once per confirmationId per browser session
  const dedupKey = `meta_purchase_fired_${opts.confirmationId}`;
  try {
    if (sessionStorage.getItem(dedupKey)) {
      if (import.meta.env.DEV) console.log('[Meta Pixel] Purchase deduped — already fired for', opts.confirmationId);
      return;
    }
  } catch {
    // sessionStorage unavailable — proceed without dedup guard
  }

  const hashedEmail = opts.email ? await sha256Hex(opts.email) : '';

  // ── CRITICAL: event_id MUST match backend CAPI event_id ──────────────────
  // Uses buildMetaPurchaseEventId() — the single source of truth for this format.
  // Backend functions MUST produce the same string: `purchase_${confirmationId}`
  // See META_PURCHASE_EVENT_ID_PREFIX and buildMetaPurchaseEventId() above.
  const eventId = buildMetaPurchaseEventId(opts.confirmationId);

  // Set external_id for advanced matching (helps lookalike + custom audiences)
  if (hashedEmail) {
    window.fbq('set', 'userData', { external_id: hashedEmail });
  }

  const payload = {
    value: opts.value,
    currency: 'USD',
    content_name: opts.contentName ?? 'ESA Letter',
    order_id: opts.confirmationId,
  };

  if (import.meta.env.DEV) {
    console.log('[Meta Pixel] Purchase firing', {
      payload,
      eventId,
      hashedEmail: hashedEmail ? '[sha256 hashed]' : '[none]',
      confirmationId: opts.confirmationId,
      deduplicationNote: 'eventID must match backend CAPI event_id = purchase_{confirmationId}',
    });
  }

  // eventID enables server-side Conversions API deduplication
  // Meta will match this against the CAPI event sent by send-meta-capi-event
  window.fbq('track', 'Purchase', payload, { eventID: eventId });

  // Mark as fired — prevents double-fire on re-render, refresh, or concurrent effects
  try {
    sessionStorage.setItem(dedupKey, '1');
  } catch {
    // ignore
  }

  // Phase-1: forward fbp + event_source_url to the existing send-meta-capi-event
  // server function as a hint. The function's "single" mode accepts an optional
  // payload override now (see edge-function change). Fire-and-forget.
  try {
    const supaUrl = (import.meta.env.VITE_PUBLIC_SUPABASE_URL ?? import.meta.env.VITE_SUPABASE_URL ?? "") as string;
    const anonKey = (import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? "") as string;
    if (!supaUrl || !anonKey) return;
    const fbp = getFbp();
    const eventSourceUrl = typeof window !== "undefined" && window.location ? window.location.href : null;
    if (!fbp && !eventSourceUrl) return;

    const url = `${supaUrl.replace(/\/+$/, "")}/functions/v1/send-meta-capi-event`;
    const body = JSON.stringify({
      mode: "single",
      confirmationId: opts.confirmationId,
      browser_hint: { fbp, event_source_url: eventSourceUrl },
    });

    const beaconOk = (() => {
      try {
        if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return false;
        const blob = new Blob([body], { type: "application/json" });
        return navigator.sendBeacon(`${url}?apikey=${encodeURIComponent(anonKey)}`, blob);
      } catch { return false; }
    })();
    if (beaconOk) return;

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": anonKey, "Authorization": `Bearer ${anonKey}` },
      body,
      keepalive: true,
    }).catch(() => { /* ignore */ });
  } catch {
    // never throw
  }
}
