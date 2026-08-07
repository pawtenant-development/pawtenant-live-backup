// src/lib/durableCheckoutUrl.ts
//
// ASSESSMENT-CHECKOUT-REFRESH-AND-RESUME-PERSISTENCE-LIVE-INCIDENT-003
//
// WHAT WENT WRONG
// ---------------
// A customer who finished a PSD or ESA assessment and reached payment was
// standing on `/psd-assessment` (or `/assessment`) with the ENTIRE checkout
// state — current step, assessment-complete verdict, restored identity, the
// Stripe client secret — held in React component state and nowhere else.
//
// Refreshing threw all of it away. The page remounted, `useState(1)` won, and
// the customer was returned to Question 1 with "0 answered · Step 1 of 3"
// having already completed a 16-question clinical intake. Reproduced on LIVE.
//
// The stable-checkout architecture that fixes this ALREADY EXISTED
// (ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001): `order_checkout_links`
// holds a high-entropy, server-authorised, non-clinical slug per unpaid order,
// and `resolve-checkout-link` turns it back into a payable order with no
// browser memory required at all. What was missing is that the browser never
// STOOD on that URL — `/checkout/<slug>` scrubbed itself out of the address bar
// and forwarded to the ephemeral assessment route, so the durable handle was
// destroyed at the exact moment it became useful.
//
// This module closes that gap: once a customer reaches payment with a verified
// identity, the address bar BECOMES `/checkout/<slug>`. Refresh, tab close,
// browser restart and a second device then all resolve server-side.
//
// WHY replaceState AND NOT navigate()
// -----------------------------------
// A router navigation would unmount the checkout component, discard the Stripe
// Elements instance and mint a second PaymentIntent for a customer who is
// mid-payment. `history.replaceState` changes only the address bar: React state
// and the in-flight payment survive untouched, and no new history entry is
// pushed, so Back still means "the page before checkout".
//
// SLUG HANDLING RULES (non-negotiable)
// ------------------------------------
//   • The slug is a CREDENTIAL. It is never logged, never written to
//     localStorage/sessionStorage, never sent to analytics, never placed in an
//     audit description and never included in an error payload.
//   • It lives in the PATH, never the query string, so the pre-boot credential
//     scrub in index.html (which only strips query params) leaves it alone.
//   • Anything that captures a URL for attribution or analytics must run it
//     through `maskCheckoutSlugPath()` first — see `attributionStore.ts`.
//
// TRADE-OFF THE OWNER ACCEPTED
// ----------------------------
// The previous design deliberately scrubbed the slug BECAUSE a credential in
// the address bar can reach referrers and analytics (that is what happened to
// `?rt=`, which leaked into nine third-party beacons). The owner has required a
// durable, copy-pasteable payment URL, which is incompatible with scrubbing.
// The mitigations are: path-not-query placement, `maskCheckoutSlugPath` on
// every capture surface, `no-referrer` on the checkout view, and the slug's own
// server-side properties (opaque, ~6.6e11 space, rate limited, auto-dies on
// payment, admin revocable).

import { supabase } from "./supabaseClient";
import { CHECKOUT_SLUG_RE } from "./checkoutSlugMask";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export { CHECKOUT_SLUG_RE, maskCheckoutSlugPath } from "./checkoutSlugMask";

/**
 * Force EVERY robots directive in the document to noindex while the durable
 * checkout URL is showing, and restore them on the way out.
 *
 * Rendering `<meta name="robots" content="noindex, nofollow">` from the page is
 * not enough on its own: `index.html` already ships a static
 * `index, follow, max-snippet:-1, …` tag, so the document ends up with TWO
 * conflicting directives. Crawlers are documented to take the most restrictive
 * of a conflicting pair, so noindex would probably win — "probably" is not a
 * standard to apply to a URL that is a payment credential. This makes it
 * unambiguous.
 *
 * Belt and braces only. The authoritative control is the `X-Robots-Tag:
 * noindex` response header on `/checkout/*` in `vercel.json`, which does not
 * depend on JavaScript running at all.
 *
 * Returns a restore function so an SPA navigation away from checkout does not
 * leave the rest of the site noindexed.
 */
export function enforceNoindexOnDurableCheckout(): () => void {
  if (typeof document === "undefined") return () => {};
  const tags = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="robots"]'));
  const previous = tags.map((t) => t.content);
  tags.forEach((t) => { t.content = "noindex, nofollow"; });
  return () => { tags.forEach((t, i) => { t.content = previous[i]; }); };
}

/** True when the address bar is ALREADY the durable checkout location. */
export function isDurableCheckoutPath(pathname?: string): boolean {
  const p = pathname ?? (typeof window !== "undefined" ? window.location.pathname : "");
  const parts = p.split("/").filter(Boolean);
  return parts.length === 2
    && parts[0].toLowerCase() === "checkout"
    && CHECKOUT_SLUG_RE.test(parts[1].toUpperCase());
}

/**
 * Point the address bar at `/checkout/<slug>` without remounting anything.
 * Returns false if the slug is malformed — a bad value must never reach the
 * address bar, because the next refresh would land on the failure screen.
 */
export function adoptDurableCheckoutUrl(slug: string): boolean {
  const s = (slug ?? "").trim().toUpperCase();
  if (!CHECKOUT_SLUG_RE.test(s)) return false;
  try {
    window.history.replaceState({}, "", `/checkout/${s}`);
    return true;
  } catch {
    return false;
  }
}

// One attempt per confirmation id per page life. Minting is idempotent
// server-side (`ensure_order_checkout_slug` reuses the active row), but there
// is no reason to re-ask on every render, and a failure is not worth retrying
// in a loop while the customer is trying to pay.
const attempted = new Set<string>();

/**
 * Make the current browser location durable for this order.
 *
 * Returns true when the address bar is (or has just become) `/checkout/<slug>`.
 *
 * Requires an authenticated session: the slug is minted through
 * `issue-resume-link`, which authorises the caller as either admin staff or the
 * customer who owns the order (§K of the resume-credential task). That is
 * exactly right here — this only ever runs AFTER the email OTP step, so the
 * browser holds a Supabase session for the order's own email. An anonymous
 * visitor cannot mint a payment handle for someone else's order.
 *
 * Every failure is silent and non-blocking. The customer can still pay; they
 * simply keep the pre-existing, non-durable URL.
 */
export async function ensureDurableCheckoutUrl(opts: {
  confirmationId: string;
  isPsd: boolean;
}): Promise<boolean> {
  const confirmationId = (opts.confirmationId ?? "").trim();
  if (!confirmationId) return false;
  if (isDurableCheckoutPath()) return true;
  if (attempted.has(confirmationId)) return false;
  attempted.add(confirmationId);

  try {
    const { data: sess } = await supabase.auth.getSession();
    const accessToken = sess?.session?.access_token;
    // No session -> no authority to mint. Not an error: the OTP gate has simply
    // not been passed yet, or this arrival is already slug-authenticated.
    if (!accessToken) return false;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/issue-resume-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        confirmationId,
        isPsd: opts.isPsd,
        purpose: "resume_checkout",
      }),
    });

    const json = (await res.json().catch(() => null)) as
      | { ok?: boolean; url?: string }
      | null;
    if (!json?.ok || !json.url) return false;

    // Take the slug from the SERVER's URL. Never reconstruct it, and never log
    // `json.url` — it is the credential.
    const slug = new URL(json.url).pathname.split("/").filter(Boolean).pop() ?? "";
    return adoptDurableCheckoutUrl(slug);
  } catch {
    // Silent by design. A recovery-link failure must never block a payment.
    return false;
  }
}
