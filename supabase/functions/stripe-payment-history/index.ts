import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// STRIPE-ADMIN-DAILY-PAYMENT-TIMEZONE-RECONCILIATION-001 — every date in this
// report is an America/New_York business day (the canonical PawTenant clock),
// resolved from the IANA database. See _shared/stripeDailyBuckets.ts for the
// contract and the pure logic the guard executes.
import { resolveStripeReportWindow, bucketSucceededChargesByBusinessDay } from "../_shared/stripeDailyBuckets.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// READ-ONLY reporting function. It only LISTS Stripe data. It never creates,
// captures, refunds, or modifies any charge / PaymentIntent. Do not add writes here.

// Stripe US standard pricing — used ONLY as a fallback estimate when the real
// balance_transaction fee is not yet available (e.g. pending charges).
const EST_FEE_RATE = 0.029;
const EST_FEE_FIXED = 0.30;

function estimateFee(amount: number): number {
  if (amount <= 0) return 0;
  return Math.round((amount * EST_FEE_RATE + EST_FEE_FIXED) * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify admin
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: userData, error: userErr } = await adminClient.auth.getUser(token);
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: profile } = await adminClient
      .from("doctor_profiles")
      .select("is_admin")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ ok: false, error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY")!;
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-04-10" });

    const url = new URL(req.url);
    const period = url.searchParams.get("period") ?? "30d";

    // Optional explicit custom range (YYYY-MM-DD). Takes precedence over period.
    //
    // STRIPE-ADMIN-DAILY-PAYMENT-TIMEZONE-RECONCILIATION-001 — `from`/`to` are
    // America/New_York BUSINESS days: "2026-09-11" is [Sep 11 00:00 ET, Sep 12
    // 00:00 ET) = [04:00Z, 04:00Z next day) in summer. The previous code parsed
    // them as UTC midnight and 23:59:59Z, so every Accounts range was up to five
    // hours wrong at each end and the final second of each day was dropped. The
    // upper bound is EXCLUSIVE (`lt`), never an inclusive end-of-day sentinel.
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");
    const reportWindow = resolveStripeReportWindow({ from: fromParam, to: toParam, period });
    const since = reportWindow.sinceSec;
    const days = reportWindow.days;

    const createdFilter: Record<string, number> = { gte: since };
    if (reportWindow.untilExclusiveSec != null) createdFilter.lt = reportWindow.untilExclusiveSec;

    // Paginate through ALL Stripe list pages for the window. Stripe caps a single
    // list page at 100 rows; the old code took only the first 100 and silently
    // dropped everything past it (gross / count / fees under-reported in any month
    // with >100 charges or refunds). We follow has_more / starting_after until the
    // window is exhausted (hard page cap = safety backstop, not a real limit).
    async function listAll<T extends { id: string }>(
      listFn: (params: Record<string, unknown>) => Promise<{ data: T[]; has_more: boolean }>,
      params: Record<string, unknown>,
    ): Promise<T[]> {
      const out: T[] = [];
      let startingAfter: string | undefined;
      for (let page = 0; page < 200; page++) { // 200 pages × 100 = 20k row backstop
        const res = await listFn({ ...params, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}) });
        out.push(...res.data);
        if (!res.has_more || res.data.length === 0) break;
        startingAfter = res.data[res.data.length - 1].id;
      }
      return out;
    }

    // Fetch charges (with balance_transaction expanded for REAL fees), refunds, balance.
    const [allCharges, allRefunds, balanceRes] = await Promise.all([
      listAll((p) => stripe.charges.list(p), { created: createdFilter, expand: ["data.balance_transaction"] }),
      listAll((p) => stripe.refunds.list(p), { created: createdFilter }),
      stripe.balance.retrieve(),
    ]);

    let anyEstimated = false;

    const charges = allCharges.map((c) => {
      const amount = c.amount / 100;
      // balance_transaction is an object when expanded & available.
      const bt = (typeof c.balance_transaction === "object" && c.balance_transaction)
        ? c.balance_transaction as { fee?: number; net?: number }
        : null;

      let fee: number;
      let net: number;
      let feeEstimated: boolean;

      if (bt && typeof bt.fee === "number") {
        fee = bt.fee / 100;
        net = typeof bt.net === "number" ? bt.net / 100 : amount - fee;
        feeEstimated = false;
      } else {
        fee = c.status === "succeeded" ? estimateFee(amount) : 0;
        net = amount - fee;
        feeEstimated = c.status === "succeeded";
        if (feeEstimated) anyEstimated = true;
      }

      return {
        id: c.id,
        amount,
        currency: c.currency.toUpperCase(),
        status: c.status,
        description: c.description,
        customer_email: c.billing_details?.email ?? c.metadata?.email ?? null,
        customer_name: c.billing_details?.name ?? null,
        created: c.created,
        refunded: c.refunded,
        amount_refunded: (c.amount_refunded ?? 0) / 100,
        receipt_url: c.receipt_url,
        payment_intent: typeof c.payment_intent === "string" ? c.payment_intent : null,
        // NEW additive fields:
        fee,
        net,
        fee_estimated: feeEstimated,
        payment_method_brand:
          c.payment_method_details?.card?.brand ??
          (c.payment_method_details?.type ?? null),
        payment_method_last4: c.payment_method_details?.card?.last4 ?? null,
      };
    });

    const refunds = allRefunds.map((r) => ({
      id: r.id,
      amount: r.amount / 100,
      currency: r.currency.toUpperCase(),
      status: r.status,
      reason: r.reason,
      charge: typeof r.charge === "string" ? r.charge : null,
      created: r.created,
    }));

    // Cash-basis gross: count EVERY succeeded charge in the window at its full
    // amount, INCLUDING ones later refunded. The refund is netted out exactly once
    // via the refunds list below (by refund date). The old `&& !c.refunded` filter
    // dropped fully-refunded charges from gross while STILL subtracting their refund
    // — double-penalizing every paid-then-refunded order by its full amount
    // (≈$694 across 6 orders in Jun 2026). Gross + count now share one dataset.
    const successfulCharges = charges.filter((c) => c.status === "succeeded");
    const totalRevenue = successfulCharges.reduce((s, c) => s + c.amount, 0);
    const totalRefunded = refunds.reduce((s, r) => s + r.amount, 0);
    // Fees across all succeeded charges (incl. ones later refunded — the fee was still paid).
    const totalFees = charges
      .filter((c) => c.status === "succeeded")
      .reduce((s, c) => s + (c.fee ?? 0), 0);

    // Build daily revenue buckets — keyed on the America/New_York business day
    // of Stripe's own `created` (the authoritative payment instant). One
    // succeeded charge per PaymentIntent; failed / pending never count. The
    // old buckets were UTC days, which filed every 20:00–00:00 ET payment under
    // the next day (8 of 53 succeeded LIVE charges in Sep 1–11 2026).
    const bucketed = bucketSucceededChargesByBusinessDay(charges, reportWindow.dates);
    const daily = bucketed.daily.map(({ date, revenue, count }) => ({ date, revenue, count }));

    const availableBalance = balanceRes.available.reduce((s, b) => s + b.amount / 100, 0);
    const pendingBalance = balanceRes.pending.reduce((s, b) => s + b.amount / 100, 0);

    return new Response(
      JSON.stringify({
        ok: true,
        summary: {
          total_revenue: totalRevenue,
          total_refunded: totalRefunded,
          net_revenue: totalRevenue - totalRefunded,
          // NEW additive fields:
          total_fees: Math.round(totalFees * 100) / 100,
          net_after_fees: Math.round((totalRevenue - totalRefunded - totalFees) * 100) / 100,
          fees_include_estimates: anyEstimated,
          charge_count: successfulCharges.length,
          refund_count: refunds.length,
          available_balance: availableBalance,
          pending_balance: pendingBalance,
          period_days: days,
          // STRIPE-ADMIN-DAILY-PAYMENT-TIMEZONE-RECONCILIATION-001 — additive.
          // The UI labels every daily figure with this zone; the two ISO dates
          // are the inclusive business-day bounds the buckets were built over.
          timezone: reportWindow.timezone,
          from: reportWindow.fromIso,
          to_inclusive: reportWindow.toIso,
          window_start_utc: new Date(reportWindow.sinceSec * 1000).toISOString(),
          window_end_exclusive_utc: reportWindow.untilExclusiveSec == null ? null : new Date(reportWindow.untilExclusiveSec * 1000).toISOString(),
          daily_payment_count: bucketed.count,
          daily_skipped: bucketed.skipped.length,
        },
        daily,
        charges,
        refunds,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
