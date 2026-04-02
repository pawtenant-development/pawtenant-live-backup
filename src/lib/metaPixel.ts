/**
 * metaPixel.ts — Centralized Meta Pixel (Facebook) event tracking utilities.
 *
 * Pixel ID: 2970753196590228
 * The fbevents.js script is loaded once via index.html.
 * PageView is fired by MetaPageView in App.tsx on every SPA route change.
 * Purchase deduplication uses sessionStorage keyed by confirmationId.
 */

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
 *   - eventID for Conversions API deduplication
 *   - external_id (SHA-256 hashed email) for advanced matching
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
  const eventId = `purchase_${opts.confirmationId}`;

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
    });
  }

  // eventID enables server-side Conversions API deduplication (future-ready)
  window.fbq('track', 'Purchase', payload, { eventID: eventId });

  // Mark as fired — prevents double-fire on re-render, refresh, or concurrent effects
  try {
    sessionStorage.setItem(dedupKey, '1');
  } catch {
    // ignore
  }
}
