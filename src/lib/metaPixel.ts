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
 */
export function fireLead(): void {
  if (typeof window.fbq !== 'function') return;
  if (import.meta.env.DEV) console.log('[Meta Pixel] Lead firing');
  window.fbq('track', 'Lead');
}

/**
 * Fire InitiateCheckout — call when the user enters the payment/checkout step.
 */
export function fireInitiateCheckout(params: {
  value?: number;
  currency?: string;
  content_name?: string;
  num_items?: number;
}): void {
  if (typeof window.fbq !== 'function') return;
  const payload = {
    value: params.value ?? 0,
    currency: params.currency ?? 'USD',
    content_name: params.content_name ?? 'ESA Letter Checkout',
    num_items: params.num_items ?? 1,
  };
  if (import.meta.env.DEV) console.log('[Meta Pixel] InitiateCheckout firing', payload);
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
}
