import Stripe from "https://esm.sh/stripe@14?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
    const since = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;

    // Fetch charges and refunds in parallel
    const [chargesRes, refundsRes, balanceRes] = await Promise.all([
      stripe.charges.list({ limit: 100, created: { gte: since } }),
      stripe.refunds.list({ limit: 50, created: { gte: since } }),
      stripe.balance.retrieve(),
    ]);

    const charges = chargesRes.data.map((c) => ({
      id: c.id,
      amount: c.amount / 100,
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
    }));

    const refunds = refundsRes.data.map((r) => ({
      id: r.id,
      amount: r.amount / 100,
      currency: r.currency.toUpperCase(),
      status: r.status,
      reason: r.reason,
      charge: typeof r.charge === "string" ? r.charge : null,
      created: r.created,
    }));

    const successfulCharges = charges.filter((c) => c.status === "succeeded" && !c.refunded);
    const totalRevenue = successfulCharges.reduce((s, c) => s + c.amount, 0);
    const totalRefunded = refunds.reduce((s, r) => s + r.amount, 0);

    // Build daily revenue buckets
    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
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
