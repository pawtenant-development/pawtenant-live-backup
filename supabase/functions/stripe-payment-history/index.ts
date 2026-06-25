import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const fromParam = url.searchParams.get("from");
    const toParam = url.searchParams.get("to");

    let since: number;
    let until: number | null = null;
    let days: number;

    if (fromParam) {
      const fromTs = Math.floor(new Date(`${fromParam}T00:00:00Z`).getTime() / 1000);
      since = isNaN(fromTs) ? Math.floor(Date.now() / 1000) - 30 * 86400 : fromTs;
      if (toParam) {
        const toTs = Math.floor(new Date(`${toParam}T23:59:59Z`).getTime() / 1000);
        until = isNaN(toTs) ? null : toTs;
      }
      const span = (until ?? Math.floor(Date.now() / 1000)) - since;
      days = Math.max(1, Math.ceil(span / 86400));
    } else {
      days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
      since = Math.floor(Date.now() / 1000) - days * 86400;
    }

    const createdFilter: Record<string, number> = { gte: since };
    if (until) createdFilter.lte = until;

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

    // Build daily revenue buckets
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date((until ?? Math.floor(Date.now() / 1000)) * 1000);
      d.setUTCDate(d.getUTCDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap[key] = 0;
    }
    successfulCharges.forEach((c) => {
      const key = new Date(c.created * 1000).toISOString().slice(0, 10);
      if (key in dailyMap) dailyMap[key] = (dailyMap[key] ?? 0) + c.amount;
    });

    const daily = Object.entries(dailyMap)
      .map(([date, revenue]) => ({ date, revenue }))
      .sort((a, b) => a.date.localeCompare(b.date));

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
