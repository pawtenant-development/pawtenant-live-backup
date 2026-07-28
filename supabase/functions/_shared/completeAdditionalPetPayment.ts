// completeAdditionalPetPayment — single source of truth for finalizing a paid
// Additional Pet ($20 package-tier upgrade) request. Called by BOTH:
//   - stripe-webhook (when the Stripe event is delivered), and
//   - create-additional-pet-request "list"/"resume" (self-heal when the webhook
//     is not subscribed/delivered — same pattern as the $50 add-on).
//
// ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 §12. Invariants enforced here:
//   • PAYMENT IS NOT APPROVAL. This never sets provider_decision and never
//     activates a document version. It moves the request to provider review.
//   • Amount and currency are VERIFIED against the server contract before the
//     row is marked paid. A wrong amount/currency is recorded and held, never
//     silently accepted.
//   • Creates NO new order and NO acquisition conversion. The Google Ads and
//     Meta uploaders read the `orders` table exclusively, so a request row is
//     structurally invisible to them — there is nothing to exclude.
//   • Never touches the parent order's price, coupon, paid_at or payment intent.
//   • Idempotent: a replayed webhook short-circuits on status='paid'.

import { reserveEmailSend, finalizeEmailSend } from "./logEmailComm.ts";
import { evaluateNotificationSuppression } from "./testNotificationSuppression.ts";

type SupabaseClient = ReturnType<typeof import("https://esm.sh/@supabase/supabase-js@2").createClient>;

const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const PORTAL_URL = "https://pawtenant.com/my-orders";

/**
 * The CURRENT paid Additional Pet price, for NEW quotes only.
 *
 * PRICING CHANGE 2026-07-28: $20 -> $30. This constant is a fallback for the
 * rare path that has no server quote to hand; the authoritative current price
 * is `additional_pet_current_price()` in the database, and the authoritative
 * price for an EXISTING request is that request's own immutable `amount_cents`.
 *
 * NEVER validate a payment against this constant. A request quoted at $20
 * before the change is still payable at $20, so the expected amount must come
 * from the request row (see verifyAgainstQuote below). Comparing against the
 * global price is exactly how a grandfathered checkout would get wrongly
 * rejected — or silently re-priced.
 */
export const ADDITIONAL_PET_UPGRADE_CENTS = 3000;
export const ADDITIONAL_PET_CURRENCY = "usd";

async function sendViaResend(opts: { to: string; subject: string; html: string }): Promise<{ sent: boolean; error?: string; resendId?: string | null }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { sent: false, error: "RESEND_API_KEY not set" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${await res.text()}` };
    const body = await res.json().catch(() => ({} as Record<string, unknown>));
    return { sent: true, resendId: (body as { id?: string }).id ?? null };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send a customer email, honouring the fail-closed TEST suppression gate.
 * A suppressed send is recorded HONESTLY as not delivered — never as sent.
 */
export async function sendAdditionalPetEmail(
  supabase: SupabaseClient,
  opts: { orderId: string | null; confirmationId: string; to: string; subject: string; html: string; slug: string; dedupeKey: string; sentBy: string },
): Promise<{ delivered: boolean; suppressed: boolean }> {
  const decision = evaluateNotificationSuppression(opts.to);
  const reserve = await reserveEmailSend({
    supabase, orderId: opts.orderId, confirmationId: opts.confirmationId, to: opts.to,
    from: FROM_ADDRESS, subject: opts.subject, slug: opts.slug, dedupeKey: opts.dedupeKey,
    templateSource: "hardcoded", sentBy: opts.sentBy,
  });
  if (!reserve.proceed) return { delivered: false, suppressed: false };

  if (decision.suppressed) {
    console.info(`[addPet] notification SUPPRESSED (${decision.reason}) slug=${opts.slug}`);
    await finalizeEmailSend(supabase, reserve.rowId, {
      success: false, body: opts.html,
      errorMessage: `SUPPRESSED (TEST fixture): ${decision.reason}`,
    });
    return { delivered: false, suppressed: true };
  }

  const r = await sendViaResend({ to: opts.to, subject: opts.subject, html: opts.html });
  await finalizeEmailSend(supabase, reserve.rowId, {
    success: r.sent, body: opts.html, resendId: r.resendId ?? null, errorMessage: r.error ?? null,
  });
  return { delivered: r.sent, suppressed: false };
}

function buildPaidReceiptHtml(opts: { firstName: string; confirmationId: string; petName: string; amountFormatted: string }): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head><body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;"><tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:560px;width:100%;"><tr><td style="background:#0f172a;padding:26px 32px;text-align:center;"><img src="${LOGO_URL}" width="140" alt="${COMPANY_NAME}" style="display:block;margin:0 auto 12px;height:auto;" /><div style="display:inline-block;background:rgba(255,255,255,0.12);color:#94a3b8;padding:4px 14px;border-radius:99px;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">PAYMENT RECEIVED</div><p style="margin:0;font-size:34px;font-weight:900;color:#ffffff;">${opts.amountFormatted}</p><p style="margin:6px 0 0;font-size:13px;color:#94a3b8;">Additional Pet</p></td></tr><tr><td style="padding:26px 32px;"><p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7;">Hi <strong>${opts.firstName || "there"}</strong>, we received your ${opts.amountFormatted} payment to add <strong>${opts.petName}</strong> to order <strong>${opts.confirmationId}</strong>.</p><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 18px;"><p style="margin:0;font-size:13px;color:#475569;line-height:1.7;"><strong>What happens next:</strong> a licensed provider will review this addition. Your current letter stays valid and available throughout. If the addition is approved we will issue an updated document — your original letter and its verification ID remain unchanged and continue to verify. Track progress in your <a href="${PORTAL_URL}" style="color:#1a5c4f;">customer portal</a>.</p></div></td></tr><tr><td style="padding:14px 32px;text-align:center;border-top:1px solid #f1f5f9;background:#f8fafc;"><p style="margin:0;font-size:11px;color:#9ca3af;">${COMPANY_NAME} &middot; <a href="https://pawtenant.com" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a></p></td></tr></table></td></tr></table></body></html>`;
}

export interface CompleteAddPetResult {
  ok: boolean;
  additionalPet: true;
  status: "completed" | "idempotent" | "no_request_row" | "amount_mismatch" | "order_locked";
  requestId?: string;
  confirmationId?: string;
}

export async function completeAdditionalPetPayment(
  supabase: SupabaseClient,
  opts: {
    requestId?: string | null;
    parentOrderId?: string | null;
    sessionId?: string | null;
    piId?: string | null;
    amountCents?: number | null;
    currency?: string | null;
    eventId?: string | null;
    source?: string;
  },
): Promise<CompleteAddPetResult> {
  const source = opts.source ?? "webhook";

  // ── Resolve the request row ───────────────────────────────────────────────
  let reqRow: Record<string, unknown> | null = null;
  if (opts.requestId) {
    reqRow = (await supabase.from("order_additional_pet_requests").select("*").eq("id", opts.requestId).maybeSingle()).data as Record<string, unknown> | null;
  }
  if (!reqRow && opts.sessionId) {
    reqRow = (await supabase.from("order_additional_pet_requests").select("*").eq("stripe_checkout_session_id", opts.sessionId).maybeSingle()).data as Record<string, unknown> | null;
  }
  if (!reqRow && opts.piId) {
    reqRow = (await supabase.from("order_additional_pet_requests").select("*").eq("stripe_payment_intent_id", opts.piId).maybeSingle()).data as Record<string, unknown> | null;
  }
  if (!reqRow) {
    console.warn(`[addPet:${source}] no matching request row`, { requestId: opts.requestId, sessionId: opts.sessionId });
    return { ok: true, additionalPet: true, status: "no_request_row" };
  }

  const reqId = reqRow.id as string;
  const confId = (reqRow.confirmation_id as string) ?? "";

  // Idempotent replay.
  if (reqRow.paid_at) {
    return { ok: true, additionalPet: true, status: "idempotent", requestId: reqId, confirmationId: confId };
  }

  // ── ADDITIONAL-PET-...-GATING-002: completed-order race guard ─────────────
  // The payment may have been STARTED while the order was still open and only
  // now be settling, after the provider finalised the evaluation and issued the
  // letter. Re-check the authoritative lock at FULFILMENT time — the state at
  // checkout-creation time is not good enough.
  //
  // If the order has since locked we deliberately do NOT touch it: the request
  // is parked in `refund_pending` with the real Stripe evidence recorded so an
  // admin can reconcile the money. We never mutate the completed order, never
  // issue a document, and never create a provider earning.
  // NOTE: deliberately NOT named `parentOrderId` — that identifier is already
  // declared later in this same function scope, and a duplicate `const` is a
  // parse-time SyntaxError that takes the whole edge function down with
  // BOOT_ERROR (it did: stripe-webhook, create-additional-pet-request and
  // provider-additional-pet-decision all 503'd until this was renamed).
  const raceOrderId = (reqRow.order_id as string) ?? opts.parentOrderId ?? null;
  if (raceOrderId) {
    const { data: lock } = await supabase.rpc("additional_pet_order_locked", { p_order_id: raceOrderId });
    if (lock && (lock as { locked?: boolean }).locked) {
      const lockReason = (lock as { reason?: string }).reason ?? "unknown";

      // IDEMPOTENT REPLAY OF THE RACE ITSELF.
      //
      // The `paid_at` short-circuit above cannot cover this branch, because the
      // race deliberately never sets paid_at — the money was received but not
      // applied. Stripe delivers ~3 events per payment (payment_intent.succeeded
      // plus two checkout.session.*), and `reconcilePending` re-drives this same
      // path on EVERY quote for a row with paid_at null + a paid session. So
      // without this guard the exception is re-recorded over and over: measured
      // on TEST, one payment produced THREE identical `payment_after_order_locked`
      // events and THREE identical audit rows, and every subsequent portal load
      // would have added more.
      //
      // `refund_pending` with paid_at still null is reached only by this branch
      // (a provider-rejection refund sets paid_at first, so it short-circuits
      // earlier), which makes it a safe idempotency key.
      if (reqRow.status === "refund_pending") {
        return {
          ok: true, additionalPet: true, status: "order_locked_already_recorded",
          requestId: reqId, confirmationId: confId,
        };
      }

      console.error(`[addPet:${source}] COMPLETED-ORDER RACE req=${reqId} order=${raceOrderId} lock=${lockReason} — payment NOT applied`);
      try {
        await supabase.from("order_additional_pet_requests").update({
          status: "refund_pending",
          stripe_payment_intent_id: opts.piId ?? (reqRow.stripe_payment_intent_id as string | null),
          manual_review_reason:
            `Payment settled after the order was completed/locked (${lockReason}). Money received but NOT applied — the completed evaluation was left untouched. Admin reconciliation required.`,
        }).eq("id", reqId).is("paid_at", null);
        await supabase.from("order_additional_pet_request_events").insert({
          request_id: reqId, order_id: raceOrderId,
          event_type: "payment_after_order_locked",
          to_status: "refund_pending", actor_role: "system",
          detail: {
            lock_reason: lockReason,
            received_cents: opts.amountCents ?? null,
            received_currency: opts.currency ?? null,
            stripe_event_id: opts.eventId ?? null,
            source,
          },
        });
        await supabase.from("audit_logs").insert({
          action: "additional_pet_payment_after_order_locked",
          object_type: "order", object_id: confId,
          description:
            `Additional Pet payment settled AFTER the order was completed/locked (${lockReason}). Payment held for reconciliation; the completed order, its documents and its verification ID were NOT modified.`,
          metadata: {
            request_id: reqId, order_id: raceOrderId, lock_reason: lockReason,
            received_cents: opts.amountCents ?? null, stripe_event_id: opts.eventId ?? null, source,
          },
        });
      } catch (e) {
        console.error(`[addPet:${source}] failed to record completed-order race`, e instanceof Error ? e.message : String(e));
      }
      return { ok: true, additionalPet: true, status: "order_locked", requestId: reqId, confirmationId: confId };
    }
  }

  // ── Verify the money BEFORE marking anything paid ─────────────────────────
  // A $0 (included) request must never carry a Stripe payment at all, and a
  // paid upgrade must match THE PRICE THAT REQUEST WAS QUOTED — not the current
  // global price. Anything else is held for manual review with the real Stripe
  // evidence recorded, never silently accepted.
  //
  // PRICING CHANGE 2026-07-28: this used to compare against the global
  // ADDITIONAL_PET_UPGRADE_CENTS. After $20 -> $30 that would have rejected
  // every legitimately grandfathered $20 payment as an amount mismatch. The
  // request's `amount_cents` is immutable (tg_addpet_immutable) and is validated
  // against a known price version on write (tg_addpet_price_version_valid), so
  // it is the correct and safe expectation.
  const expectedCents = (reqRow.amount_cents as number) ?? 0;
  const gotCents = opts.amountCents ?? null;
  const gotCurrency = (opts.currency ?? ADDITIONAL_PET_CURRENCY).toLowerCase();
  const outcome = reqRow.pricing_outcome as string;

  // Defence in depth: the quoted amount must still correspond to a real price
  // version, so a row tampered with out-of-band cannot authorise a payment.
  let quoteIsKnownPrice = false;
  try {
    const { data: pv } = await supabase
      .from("additional_pet_price_versions")
      .select("pricing_version, amount_cents")
      .eq("amount_cents", expectedCents)
      .limit(1);
    quoteIsKnownPrice = Array.isArray(pv) && pv.length > 0;
  } catch {
    quoteIsKnownPrice = false;
  }

  const amountOk = outcome === "paid_upgrade"
    && expectedCents > 0
    && quoteIsKnownPrice
    && gotCents === expectedCents;
  const currencyOk = gotCurrency === ADDITIONAL_PET_CURRENCY;

  if (!amountOk || !currencyOk) {
    console.error(`[addPet:${source}] AMOUNT/CURRENCY MISMATCH req=${reqId} expected=${expectedCents}${ADDITIONAL_PET_CURRENCY} got=${gotCents}${gotCurrency} outcome=${outcome}`);
    try {
      await supabase.from("order_additional_pet_request_events").insert({
        request_id: reqId, order_id: reqRow.order_id, event_type: "payment_amount_mismatch",
        from_status: reqRow.status, to_status: reqRow.status, actor_role: "system",
        detail: {
          expected_cents: expectedCents, received_cents: gotCents,
          expected_currency: ADDITIONAL_PET_CURRENCY, received_currency: gotCurrency,
          pricing_outcome: outcome, stripe_event_id: opts.eventId ?? null, source,
        },
      });
      await supabase.from("audit_logs").insert({
        action: "additional_pet_payment_amount_mismatch",
        object_type: "order", object_id: confId,
        description: `INTEGRITY HOLD: Additional Pet payment did not match the server contract (expected ${expectedCents} ${ADDITIONAL_PET_CURRENCY}, received ${gotCents} ${gotCurrency}). Request NOT marked paid and NOT advanced.`,
        metadata: { request_id: reqId, expected_cents: expectedCents, received_cents: gotCents, received_currency: gotCurrency, stripe_event_id: opts.eventId ?? null, source },
      });
    } catch { /* non-critical */ }
    return { ok: true, additionalPet: true, status: "amount_mismatch", requestId: reqId, confirmationId: confId };
  }

  // ── Parent order integrity gate ───────────────────────────────────────────
  const parentOrderId = (reqRow.order_id as string) ?? opts.parentOrderId ?? null;
  const { data: parent } = await supabase
    .from("orders")
    .select("id, confirmation_id, email, first_name, payment_intent_id, paid_at, doctor_user_id")
    .eq("id", parentOrderId)
    .maybeSingle();

  const baseIsPaid = !!(parent?.payment_intent_id) || !!(parent?.paid_at);

  const nowIso = new Date().toISOString();
  // The amount the customer ACTUALLY paid for THIS request (a grandfathered
  // request shows $20 even though the current price is $30).
  const amountFormatted = `$${(expectedCents / 100).toFixed(2)}`;

  // Mark paid exactly once. `.is("paid_at", null)` makes a racing duplicate
  // webhook a no-op rather than a second transition.
  const { data: updated } = await supabase
    .from("order_additional_pet_requests")
    .update({
      paid_at: nowIso,
      stripe_payment_intent_id: opts.piId ?? (reqRow.stripe_payment_intent_id as string | null) ?? null,
      stripe_checkout_session_id: opts.sessionId ?? (reqRow.stripe_checkout_session_id as string | null) ?? null,
      // PAYMENT IS NOT APPROVAL: the request goes to provider review, never to
      // approved. If the base order is somehow unpaid we hold it instead.
      status: baseIsPaid ? "pending_provider_review" : "paid_pending_details",
      assigned_provider_user_id: (parent?.doctor_user_id as string | null) ?? null,
    })
    .eq("id", reqId)
    .is("paid_at", null)
    .select()
    .maybeSingle();

  if (!updated) {
    // A concurrent delivery won the race — that is the idempotent outcome.
    return { ok: true, additionalPet: true, status: "idempotent", requestId: reqId, confirmationId: confId };
  }

  try {
    await supabase.from("order_additional_pet_request_events").insert({
      request_id: reqId, order_id: parentOrderId, event_type: "payment_received",
      from_status: reqRow.status as string, to_status: updated.status as string,
      actor_role: "system",
      detail: {
        amount_cents: ADDITIONAL_PET_UPGRADE_CENTS, currency: ADDITIONAL_PET_CURRENCY,
        stripe_event_id: opts.eventId ?? null, source, base_order_paid: baseIsPaid,
      },
    });
  } catch { /* non-critical */ }

  try {
    await supabase.from("audit_logs").insert({
      action: baseIsPaid ? "additional_pet_paid" : "additional_pet_paid_unpaid_base",
      object_type: "order", object_id: confId,
      description: baseIsPaid
        ? `Additional Pet upgrade paid (${amountFormatted}) — sent for provider review. No new order, no acquisition conversion, base order untouched [via ${source}]`
        : `INTEGRITY HOLD: Additional Pet paid (${amountFormatted}) but the base order is UNPAID — held, not advanced [via ${source}]`,
      metadata: {
        request_id: reqId, order_id: parentOrderId, confirmation_id: confId,
        amount_cents: ADDITIONAL_PET_UPGRADE_CENTS, payment_intent_id: opts.piId ?? null,
        checkout_session_id: opts.sessionId ?? null, stripe_event_id: opts.eventId ?? null,
        source, paid_at: nowIso,
      },
    });
  } catch { /* non-critical */ }

  // Customer receipt (deduped per request; suppression-aware).
  const custEmail = (parent?.email as string) ?? (reqRow.customer_email as string) ?? "";
  if (custEmail && baseIsPaid) {
    const petName = ((reqRow.new_pet as Record<string, unknown> | null)?.name as string) ?? "your pet";
    await sendAdditionalPetEmail(supabase, {
      orderId: parentOrderId, confirmationId: confId, to: custEmail,
      subject: "Payment Received — Additional Pet — PawTenant",
      html: buildPaidReceiptHtml({
        firstName: (parent?.first_name as string) ?? "",
        confirmationId: confId, petName, amountFormatted,
      }),
      slug: "additional_pet_receipt", dedupeKey: `${reqId}:additional_pet_receipt`,
      sentBy: `addpet_${source}`,
    });
  }

  console.info(`[addPet:${source}] ✓ ${reqId} paid (${amountFormatted}) — ${confId} status=${updated.status}`);
  return { ok: true, additionalPet: true, status: "completed", requestId: reqId, confirmationId: confId };
}
