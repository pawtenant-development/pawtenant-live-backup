// _shared/resumeLink.ts
//
// ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001
// (supersedes ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §C for the
//  customer-facing URL shape)
//
// THE ONE canonical recovery-link builder. Every server-side producer of a
// recovery / resume link (email, SMS, admin action, drip sequence) builds its
// link through `issueResumeLink()` and nothing else.
//
// WHAT CHANGED AND WHY
// --------------------
// This used to mint a single-use `?rt=<token>` credential per send. Measured on
// LIVE 2026-08-04: of 134 tokens issued, only 1 ever expired unused and 11 were
// used — but 39 were revoked `superseded_by_new_token`, because issuing a new
// token revoked the previous unused one. With a 30min/24h/48h/3day/5day drip the
// earlier email's link died the moment the next message sent, and 48% of orders
// held at least one dead link. Customers hit "Link expired or not found".
//
// The customer-facing link is now a short, stable, opaque slug:
//
//     https://pawtenant.com/checkout/AB7K92QD
//
//   • no query string, no confirmation id, no email/phone, no coupon
//   • stable for the whole unpaid life of the order — no expiry
//   • reusable: refresh, email scanners, multiple devices, repeat clicks
//   • dies automatically once the order is paid / completed / cancelled /
//     refunded / archived (server-side, via order_is_resumable)
//   • admin revocable and regenerable
//
// NO AUTOMATIC DISCOUNTS. `extraParams` and `bridgeStage` are accepted but
// DELIBERATELY IGNORED so that no producer can smuggle promo / coupon /
// discount / dc into a customer link. A discount now only applies when it is
// already saved server-side on the order itself. Do not re-add them.
//
// A confirmation id is a DISPLAY REFERENCE — it appears in mail logs, SMS
// history, analytics, referrers and support threads. It is never a credential
// and this module never puts one in a link.

export type ResumePurpose = "resume_checkout" | "resume_assessment";

export interface IssueResumeLinkOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** Origin the link points at, e.g. https://pawtenant-test.vercel.app (no trailing slash). */
  siteUrl: string;
  confirmationId: string;
  /** Retained for call-site compatibility. The slug resolves ESA vs PSD server-side. */
  isPsd?: boolean;
  /** Retained for call-site compatibility; the stable link has no purpose scope. */
  purpose?: ResumePurpose;
  /** Retained for call-site compatibility; the stable link does not expire. */
  ttlMinutes?: number;
  /** Recorded on the link row as `created_by` — an actor label, never PII. */
  createdBy: string;
  /**
   * DEPRECATED AND IGNORED. This was how `promo` / `dc` reached customer links.
   * Kept only so existing call sites compile. Never honoured.
   */
  extraParams?: Record<string, string | null | undefined>;
  /** DEPRECATED AND IGNORED. The /r/<stage> bridge is no longer used for recovery. */
  bridgeStage?: string | null;
}

export interface IssuedResumeLink {
  /** The finished URL. `tokenized` true means a real stable slug was allocated. */
  url: string;
  tokenized: boolean;
  /** Always null — stable links do not expire. Kept for call-site compatibility. */
  expiresAt: string | null;
}

/**
 * Return the stable checkout link for an order.
 *
 * FAIL-CLOSED. If the order is unknown or no longer payable (paid / completed /
 * cancelled / refunded / archived), or slug allocation is unavailable for any
 * reason, the returned URL is the bare assessment path with **no confirmation
 * id, no slug and no parameters** — the customer lands on the safe "request a
 * new link" screen rather than following a link that leaks an order reference.
 * Every failure mode returns the same shape, so this is never an existence
 * oracle for its caller.
 */
export async function issueResumeLink(opts: IssueResumeLinkOptions): Promise<IssuedResumeLink> {
  const {
    supabaseUrl, serviceRoleKey, siteUrl, confirmationId,
    isPsd = false, createdBy, extraParams = {}, purpose = "resume_assessment",
    ttlMinutes = 4320,
  } = opts;

  const origin = siteUrl.replace(/\/+$/, "");
  // Credential-free destination used for every failure path.
  const safeFallback = `${origin}/${isPsd ? "psd-assessment" : "assessment"}`;

  if (!confirmationId || !confirmationId.trim()) {
    return { url: safeFallback, tokenized: false, expiresAt: null };
  }

  // ── EXCEPTION: the add-a-pet flow is NOT checkout recovery ──────────────────
  // `send-new-esa-order-link` asks an existing customer to add another pet, which
  // genuinely needs the ASSESSMENT UI (assessment/page.tsx reads `?edit=pet` and
  // lands on Step 1). A stable checkout slug would drop them on payment instead
  // and skip the new pet's intake. That flow therefore keeps the legacy
  // single-use token link. It is the only caller allowed to do so, and it is not
  // a recovery producer, so the supersession problem does not apply to it.
  if (String(extraParams.edit ?? "") === "pet") {
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/issue-resume-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          confirmationId: confirmationId.trim(), purpose, ttlMinutes,
          createdBy: createdBy.slice(0, 64),
        }),
      });
      const issued = (await res.json()) as { ok?: boolean; token?: string; expiresAt?: string };
      if (!issued?.ok || !issued.token) {
        return { url: safeFallback, tokenized: false, expiresAt: null };
      }
      const path = `${origin}/${isPsd ? "psd-assessment" : "assessment"}`;
      return {
        url: `${path}?rt=${encodeURIComponent(issued.token)}&edit=pet`,
        tokenized: true,
        expiresAt: issued.expiresAt ?? null,
      };
    } catch {
      return { url: safeFallback, tokenized: false, expiresAt: null };
    }
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/rpc/ensure_checkout_slug_by_confirmation`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          p_confirmation_id: confirmationId.trim(),
          p_created_by: createdBy.slice(0, 64),
        }),
      },
    );

    if (!res.ok) return { url: safeFallback, tokenized: false, expiresAt: null };

    // The RPC returns the bare slug as a JSON string, or null when the order is
    // unknown / not payable. Both non-slug cases fall through identically.
    const slug = (await res.json()) as string | null;
    if (!slug || typeof slug !== "string" || !/^[2-9A-HJ-NP-TV-Z]{8}$/.test(slug)) {
      return { url: safeFallback, tokenized: false, expiresAt: null };
    }

    return { url: `${origin}/checkout/${slug}`, tokenized: true, expiresAt: null };
  } catch {
    // Never surface the reason — and never fall back to a confirmation-id link.
    return { url: safeFallback, tokenized: false, expiresAt: null };
  }
}
