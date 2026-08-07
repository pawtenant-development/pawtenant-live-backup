// reconcileCustomPayment — ORDER-LINKED-CUSTOM-STRIPE-INVOICE-001
//
// Lives in _shared, NOT in stripe-webhook, because importing a function module
// would execute its top-level Deno.serve and stand up a second server inside the
// importing function. Three callers need identical behaviour: invoice.paid,
// invoice.payment_succeeded, and the admin "sync" recovery action.

// ── ORDER-LINKED-CUSTOM-STRIPE-INVOICE-001 ──────────────────────────────────
// Reconcile a paid custom payment request. Shared by invoice.paid,
// invoice.payment_succeeded and the admin "sync" recovery action, so whichever
// event this endpoint happens to be subscribed to, the outcome is identical and
// settles exactly once.
//
// Returns null when the invoice is not a custom payment request, so the caller
// can fall through to its normal handling.
// deno-lint-ignore no-explicit-any
export async function reconcileCustomPaymentInvoice(supabase: any, invoice: any): Promise<Record<string, unknown> | null> {
  if (invoice?.metadata?.type !== "custom_payment_request") return null;
  const reqId = invoice.metadata.custom_payment_request_id as string | undefined;
  if (!reqId) return { skipped: true, reason: "custom request id missing from metadata" };

  const { data: reqRaw } = await supabase
    .from("order_custom_payment_requests")
    .select("id, order_id, confirmation_id, purpose, amount_cents, currency, status, paid_at")
    .eq("id", reqId).maybeSingle();
  const cpr = reqRaw as {
    id: string; order_id: string; confirmation_id: string | null; purpose: string;
    amount_cents: number; currency: string; status: string; paid_at: string | null;
  } | null;
  if (!cpr) return { skipped: true, reason: "custom payment request not found" };

  const paidCents = invoice.amount_paid ?? 0;
  const paidCurrency = (invoice.currency ?? "").toLowerCase();
  if (paidCents !== cpr.amount_cents || paidCurrency !== cpr.currency) {
    await supabase.from("audit_logs").insert({
      actor_name: "Stripe Webhook", actor_role: "system", actor_type: "webhook",
      category: "payments", source: "stripe_webhook",
      object_type: "order", object_id: cpr.confirmation_id, order_id: cpr.order_id,
      action: "custom_payment_amount_mismatch",
      description: `Custom payment settled ${paidCents} ${paidCurrency} but ${cpr.amount_cents} ${cpr.currency} was authorised. Held for Admin.`,
      metadata: { custom_payment_request_id: cpr.id, stripe_invoice_id: invoice.id,
                  authorised_cents: cpr.amount_cents, settled_cents: paidCents },
    });
    return { mismatch: true, requestId: cpr.id };
  }

  const nowIso = new Date().toISOString();
  const piId = typeof invoice.payment_intent === "string"
    ? invoice.payment_intent : invoice.payment_intent?.id ?? null;

  // Guarded transition. Replays and a second event type race here; exactly one
  // wins, so revenue, audit and order state are each written once.
  const { data: settled } = await supabase
    .from("order_custom_payment_requests")
    .update({ status: "paid", paid_at: nowIso, stripe_payment_intent_id: piId })
    .eq("id", cpr.id).neq("status", "paid")
    .select("id").maybeSingle();
  if (!settled) {
    // Already settled — but a partial recovery (e.g. an admin "sync" that only
    // mapped the status) may still owe the payment_intent id.
    if (piId) {
      await supabase.from("order_custom_payment_requests")
        .update({ stripe_payment_intent_id: piId })
        .eq("id", cpr.id).is("stripe_payment_intent_id", null);
    }
    return { duplicate: true, requestId: cpr.id };
  }

  // Purpose-specific reconciliation.
  //   supplemental_charge       → base order untouched. Paying for extra work
  //                               does not mean the order itself was paid, and
  //                               orders.price stays canonical.
  //   outstanding_order_balance → settles the order, but only if still unpaid.
  let orderSettled = false;
  if (cpr.purpose === "outstanding_order_balance") {
    const { data: stamped } = await supabase
      .from("orders")
      .update({ paid_at: nowIso, status: "processing", payment_failed_at: null, payment_failure_reason: null })
      .eq("id", cpr.order_id).is("paid_at", null)
      .select("id").maybeSingle();
    orderSettled = !!stamped;
  }

  await supabase.from("audit_logs").insert({
    actor_name: "Stripe Webhook", actor_role: "system", actor_type: "webhook",
    category: "payments", source: "stripe_webhook",
    object_type: "order", object_id: cpr.confirmation_id, order_id: cpr.order_id,
    action: "custom_payment_received",
    description: `Custom payment of $${(paidCents / 100).toFixed(2)} received for order ${cpr.confirmation_id} (${cpr.purpose.replace(/_/g, " ")}).`
      + (cpr.purpose === "supplemental_charge"
          ? " Recorded as supplemental revenue; the base order payment is unchanged."
          : orderSettled ? " Order marked paid." : " Order was already paid; no change made."),
    metadata: {
      custom_payment_request_id: cpr.id, confirmation_id: cpr.confirmation_id,
      purpose: cpr.purpose, amount_cents: paidCents, currency: paidCurrency,
      stripe_invoice_id: invoice.id, stripe_payment_intent_id: piId,
      order_payment_state_changed: orderSettled,
    },
  });

  return { custom_payment: true, requestId: cpr.id, orderSettled };
}
