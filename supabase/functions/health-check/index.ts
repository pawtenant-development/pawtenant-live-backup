
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CheckResult {
  name: string;
  category: string;
  status: "pass" | "fail" | "warn";
  message: string;
  detail?: string;
  latencyMs?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase    = createClient(supabaseUrl, serviceKey);

  const body = await req.json().catch(() => ({})) as { triggeredBy?: string };
  const triggeredBy = body.triggeredBy ?? "manual";

  const checks: CheckResult[] = [];

  // ── 1. Supabase DB ──────────────────────────────────────────────────────
  {
    const t0 = Date.now();
    try {
      const { error } = await supabase.from("orders").select("id").limit(1);
      const latencyMs = Date.now() - t0;
      if (error) {
        checks.push({ name: "Supabase Database", category: "infrastructure", status: "fail", message: `DB query failed: ${error.message}`, latencyMs });
      } else {
        checks.push({ name: "Supabase Database", category: "infrastructure", status: "pass", message: "Queries responding normally", latencyMs });
      }
    } catch (e) {
      checks.push({ name: "Supabase Database", category: "infrastructure", status: "fail", message: `Exception: ${(e as Error).message}`, latencyMs: Date.now() - t0 });
    }
  }

  // ── 2. Doctor profiles table ────────────────────────────────────────────
  {
    const t0 = Date.now();
    try {
      const { error } = await supabase.from("doctor_profiles").select("id").limit(1);
      checks.push({
        name: "Doctor Profiles Table",
        category: "infrastructure",
        status: error ? "fail" : "pass",
        message: error ? `Failed: ${error.message}` : "Accessible",
        latencyMs: Date.now() - t0,
      });
    } catch (e) {
      checks.push({ name: "Doctor Profiles Table", category: "infrastructure", status: "fail", message: (e as Error).message, latencyMs: Date.now() - t0 });
    }
  }

  // ── 3. Communications table ─────────────────────────────────────────────
  {
    const t0 = Date.now();
    try {
      const { error } = await supabase.from("communications").select("id").limit(1);
      checks.push({
        name: "Communications Table",
        category: "infrastructure",
        status: error ? "fail" : "pass",
        message: error ? `Failed: ${error.message}` : "Accessible",
        latencyMs: Date.now() - t0,
      });
    } catch (e) {
      checks.push({ name: "Communications Table", category: "infrastructure", status: "fail", message: (e as Error).message, latencyMs: Date.now() - t0 });
    }
  }

  // ── 4. Stripe ───────────────────────────────────────────────────────────
  {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      checks.push({ name: "Stripe", category: "payments", status: "fail", message: "STRIPE_SECRET_KEY secret is not configured" });
    } else {
      const t0 = Date.now();
      try {
        const res = await fetch("https://api.stripe.com/v1/balance", {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        const latencyMs = Date.now() - t0;
        if (res.ok) {
          checks.push({ name: "Stripe", category: "payments", status: "pass", message: "API connection healthy", latencyMs });
        } else {
          const err = await res.json() as { error?: { message?: string } };
          checks.push({ name: "Stripe", category: "payments", status: "fail", message: `Stripe API error: ${err?.error?.message ?? res.statusText}`, latencyMs });
        }
      } catch (e) {
        checks.push({ name: "Stripe", category: "payments", status: "fail", message: `Network error: ${(e as Error).message}`, latencyMs: Date.now() - t0 });
      }
    }
  }

  // ── 5. Twilio SMS ───────────────────────────────────────────────────────
  {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken  = Deno.env.get("TWILIO_AUTH_TOKEN");
    // Use TWILIO_PHONE_NUMBER — matches what send-sms uses
    const fromPhone  = Deno.env.get("TWILIO_PHONE_NUMBER");

    if (!accountSid || !authToken) {
      checks.push({ name: "Twilio SMS", category: "communications", status: "fail", message: "TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN secret missing" });
    } else {
      const t0 = Date.now();
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
          headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` },
        });
        const latencyMs = Date.now() - t0;
        if (res.ok) {
          const data = await res.json() as { status?: string; friendly_name?: string };
          const acctStatus = data?.status ?? "unknown";
          checks.push({
            name: "Twilio SMS",
            category: "communications",
            status: acctStatus === "active" ? "pass" : "warn",
            message: acctStatus === "active" ? `Account active${fromPhone ? ` · From: ${fromPhone}` : ""}` : `Account status: ${acctStatus}`,
            latencyMs,
          });
        } else {
          checks.push({ name: "Twilio SMS", category: "communications", status: "fail", message: `Twilio API returned ${res.status}`, latencyMs });
        }
      } catch (e) {
        checks.push({ name: "Twilio SMS", category: "communications", status: "fail", message: `Network error: ${(e as Error).message}`, latencyMs: Date.now() - t0 });
      }
    }
  }

  // ── 6. Twilio Voice ─────────────────────────────────────────────────────
  {
    const appSid    = Deno.env.get("TWILIO_TWIML_APP_SID");
    const apiKey    = Deno.env.get("TWILIO_API_KEY");
    const apiSecret = Deno.env.get("TWILIO_API_SECRET");

    if (!appSid || !apiKey || !apiSecret) {
      checks.push({
        name: "Twilio Voice",
        category: "communications",
        status: "warn",
        message: "Voice credentials not fully configured (TWILIO_TWIML_APP_SID / TWILIO_API_KEY / TWILIO_API_SECRET)",
      });
    } else {
      checks.push({ name: "Twilio Voice", category: "communications", status: "pass", message: "Voice credentials present" });
    }
  }

  // ── 7. Email (Resend / SMTP) ────────────────────────────────────────────
  {
    const resendKey   = Deno.env.get("RESEND_API_KEY");
    const smtpHost    = Deno.env.get("SMTP_HOST");
    const sendgridKey = Deno.env.get("SENDGRID_API_KEY");

    if (!resendKey && !smtpHost && !sendgridKey) {
      checks.push({ name: "Email (SMTP / Resend)", category: "communications", status: "warn", message: "No email provider configured — RESEND_API_KEY, SENDGRID_API_KEY, or SMTP_HOST needed" });
    } else if (resendKey) {
      const t0 = Date.now();
      try {
        const res = await fetch("https://api.resend.com/domains", {
          headers: { Authorization: `Bearer ${resendKey}` },
        });
        const latencyMs = Date.now() - t0;
        checks.push({
          name: "Email (Resend)",
          category: "communications",
          status: res.ok ? "pass" : "fail",
          message: res.ok ? "Resend API key valid" : `Resend returned ${res.status}`,
          latencyMs,
        });
      } catch (e) {
        checks.push({ name: "Email (Resend)", category: "communications", status: "fail", message: (e as Error).message });
      }
    } else if (sendgridKey) {
      checks.push({ name: "Email (SendGrid)", category: "communications", status: "pass", message: "SendGrid API key present" });
    } else {
      checks.push({ name: "Email (SMTP)", category: "communications", status: "pass", message: `SMTP host configured: ${smtpHost}` });
    }
  }

  // ── 8. GHL (GoHighLevel) ────────────────────────────────────────────────
  {
    const ghlKey = Deno.env.get("GHL_API_KEY") ?? Deno.env.get("GHL_LOCATION_API_KEY");
    if (!ghlKey) {
      checks.push({ name: "GoHighLevel CRM", category: "crm", status: "warn", message: "GHL_API_KEY not configured — CRM sync may not work" });
    } else {
      checks.push({ name: "GoHighLevel CRM", category: "crm", status: "pass", message: "GHL API key present" });
    }
  }

  // ── 9. Edge Functions self-check ────────────────────────────────────────
  const criticalFunctions = [
    "assign-doctor",
    "notify-patient-letter",
    "notify-order-status",
    "send-sms",
    "make-outbound-call",
    "create-checkout-session",
    "stripe-webhook",
  ];

  for (const fnName of criticalFunctions) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: "OPTIONS",
      });
      const latencyMs = Date.now() - t0;
      const ok = res.status === 200 || res.status === 204;
      checks.push({
        name: `Edge Fn: ${fnName}`,
        category: "functions",
        status: ok ? "pass" : "warn",
        message: ok ? `Deployed & reachable (${res.status})` : `Unexpected status ${res.status}`,
        latencyMs,
      });
    } catch (e) {
      checks.push({
        name: `Edge Fn: ${fnName}`,
        category: "functions",
        status: "fail",
        message: `Unreachable: ${(e as Error).message}`,
        latencyMs: Date.now() - t0,
      });
    }
  }

  // ── 10. Order Health ────────────────────────────────────────────────────
  const THREE_HOURS = 3 * 60 * 60 * 1000;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const now = new Date();

  const { data: allOrders } = await supabase
    .from("orders")
    .select("id, payment_intent_id, doctor_email, doctor_user_id, doctor_status, status, created_at");

  const orders = (allOrders ?? []) as {
    id: string;
    payment_intent_id: string | null;
    doctor_email: string | null;
    doctor_user_id: string | null;
    doctor_status: string | null;
    status: string;
    created_at: string;
  }[];

  const paidUnassignedOver3h = orders.filter(o =>
    !!o.payment_intent_id &&
    !o.doctor_email && !o.doctor_user_id &&
    o.doctor_status !== "patient_notified" &&
    (now.getTime() - new Date(o.created_at).getTime()) > THREE_HOURS
  ).length;

  const paidUnassignedOver24h = orders.filter(o =>
    !!o.payment_intent_id &&
    !o.doctor_email && !o.doctor_user_id &&
    o.doctor_status !== "patient_notified" &&
    (now.getTime() - new Date(o.created_at).getTime()) > TWENTY_FOUR_HOURS
  ).length;

  const totalPaid      = orders.filter(o => !!o.payment_intent_id).length;
  const totalCompleted = orders.filter(o => o.doctor_status === "patient_notified").length;
  const totalOrders    = orders.length;

  if (paidUnassignedOver24h > 0) {
    checks.push({
      name: "Order Health",
      category: "orders",
      status: "fail",
      message: `${paidUnassignedOver24h} paid order${paidUnassignedOver24h !== 1 ? "s" : ""} unassigned for 24+ hours`,
      detail: `${paidUnassignedOver3h} unassigned >3h, ${paidUnassignedOver24h} unassigned >24h`,
    });
  } else if (paidUnassignedOver3h > 0) {
    checks.push({
      name: "Order Health",
      category: "orders",
      status: "warn",
      message: `${paidUnassignedOver3h} paid order${paidUnassignedOver3h !== 1 ? "s" : ""} awaiting provider assignment (3h+)`,
      detail: `${paidUnassignedOver3h} unassigned >3h`,
    });
  } else {
    checks.push({
      name: "Order Health",
      category: "orders",
      status: "pass",
      message: "All paid orders have been assigned within 3 hours",
    });
  }

  // ── Determine overall status ─────────────────────────────────────────────
  const hasFailure = checks.some(c => c.status === "fail");
  const hasWarning = checks.some(c => c.status === "warn");
  const overallStatus = hasFailure ? "fail" : hasWarning ? "warn" : "pass";

  const orderHealth = {
    totalOrders,
    totalPaid,
    totalCompleted,
    paidUnassignedOver3h,
    paidUnassignedOver24h,
  };

  // ── Log to Supabase ──────────────────────────────────────────────────────
  const { data: logRow } = await supabase
    .from("system_health_logs")
    .insert({
      triggered_by: triggeredBy,
      overall_status: overallStatus,
      checks,
      order_health: orderHealth,
    })
    .select("id, checked_at")
    .maybeSingle();

  return new Response(
    JSON.stringify({
      ok: true,
      id: logRow?.id,
      checkedAt: logRow?.checked_at ?? now.toISOString(),
      overallStatus,
      checks,
      orderHealth,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
