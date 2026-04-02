import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const INTERNAL_NOTIFICATION_EMAIL = "eservices.dm@gmail.com";
const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildUnpaidLeadHtml(opts: {
  confirmationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  letterType: string;
  deliverySpeed: string;
  timestamp: string;
}): string {
  const rows = [
    ["Order ID",       opts.confirmationId],
    ["Name",           `${opts.firstName} ${opts.lastName}`.trim() || "—"],
    ["Email",          opts.email],
    ["Phone",          opts.phone || "—"],
    ["State",          opts.state || "—"],
    ["Service",        opts.letterType === "psd" ? "PSD Letter" : "ESA Letter"],
    ["Delivery",       opts.deliverySpeed === "2-3days" ? "Standard (2-3 days)" : "Priority (24h)"],
    ["Status",         "UNPAID — Assessment Completed"],
    ["Time",           opts.timestamp],
  ];

  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#6b7280;width:160px;border-bottom:1px solid #f3f4f6;font-weight:600;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr>
        <td style="background:#f97316;padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" width="160" alt="PawTenant" style="display:block;margin:0 auto 14px;height:auto;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.25);color:#ffffff;padding:5px 16px;border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:10px;">NEW UNPAID LEAD</div>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;">Assessment Completed — Awaiting Payment</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 32px;">
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">A new lead has completed their assessment but has <strong>not yet paid</strong>. Consider sending a follow-up or recovery email.</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;margin-bottom:24px;">
            ${rowsHtml}
          </table>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center">
              <a href="https://pawtenant.com/admin-orders" style="display:inline-block;background:#1a5c4f;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:8px;margin-right:12px;">Open Admin Portal &rarr;</a>
            </td></tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant Internal Notification &mdash; <a href="https://pawtenant.com" style="color:#1a5c4f;text-decoration:none;">pawtenant.com</a></p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = await req.json() as {
      confirmationId?: string;
      action?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      state?: string;
      deliverySpeed?: string;
      assessmentAnswers?: Record<string, unknown>;
      letterType?: string;
      status?: string;
      paymentIntentId?: string;
      price?: number;
      planType?: string;
      referredBy?: string;
      paidAt?: string;
      paymentMethod?: string;
      selectedProvider?: string;
      addonServices?: string[];
      gclid?: string;
      fbclid?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmTerm?: string;
      utmContent?: string;
      landingUrl?: string;
      attributionJson?: Record<string, unknown>;
      // Flag to suppress lead notification (e.g. when just updating payment info)
      suppressLeadNotification?: boolean;
    };

    const { confirmationId, action } = body;

    if (!confirmationId) {
      return new Response(
        JSON.stringify({ ok: false, error: "confirmationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── UPSERT action: save/update order (service_role bypasses RLS) ──────
    if (action === "upsert") {
      // Check if this is a NEW order (doesn't exist yet) before upsert
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("id, status, email_log, first_name, last_name, email, phone, state, delivery_speed, letter_type")
        .eq("confirmation_id", confirmationId)
        .maybeSingle();

      const isNewOrder = !existingOrder;

      const upsertPayload: Record<string, unknown> = {
        confirmation_id: confirmationId,
        user_id: null,
      };

      if (body.email !== undefined) upsertPayload.email = body.email;
      if (body.firstName !== undefined) upsertPayload.first_name = body.firstName;
      if (body.lastName !== undefined) upsertPayload.last_name = body.lastName;
      if (body.phone !== undefined) upsertPayload.phone = body.phone;
      if (body.state !== undefined) upsertPayload.state = body.state;
      if (body.deliverySpeed !== undefined) upsertPayload.delivery_speed = body.deliverySpeed;
      if (body.letterType !== undefined) upsertPayload.letter_type = body.letterType;
      if (body.status !== undefined) upsertPayload.status = body.status;
      if (body.assessmentAnswers !== undefined) upsertPayload.assessment_answers = body.assessmentAnswers;
      if (body.paymentIntentId !== undefined) upsertPayload.payment_intent_id = body.paymentIntentId;
      if (body.price !== undefined) upsertPayload.price = body.price;
      if (body.planType !== undefined) upsertPayload.plan_type = body.planType;
      if (body.paidAt !== undefined) upsertPayload.paid_at = body.paidAt;
      if (body.paymentMethod !== undefined) upsertPayload.payment_method = body.paymentMethod;
      if (body.selectedProvider !== undefined) upsertPayload.selected_provider = body.selectedProvider;
      if (body.addonServices !== undefined) upsertPayload.addon_services = body.addonServices;
      if (body.gclid !== undefined) upsertPayload.gclid = body.gclid;
      if (body.fbclid !== undefined) upsertPayload.fbclid = body.fbclid;
      if (body.utmSource !== undefined) upsertPayload.utm_source = body.utmSource;
      if (body.utmMedium !== undefined) upsertPayload.utm_medium = body.utmMedium;
      if (body.utmCampaign !== undefined) upsertPayload.utm_campaign = body.utmCampaign;
      if (body.utmTerm !== undefined) upsertPayload.utm_term = body.utmTerm;
      if (body.utmContent !== undefined) upsertPayload.utm_content = body.utmContent;
      if (body.landingUrl !== undefined) upsertPayload.landing_url = body.landingUrl;
      if (body.attributionJson !== undefined) upsertPayload.attribution_json = body.attributionJson;
      if (body.referredBy !== undefined && body.referredBy !== "") {
        upsertPayload.referred_by = body.referredBy;
      }

      const { error: upsertError } = await supabase
        .from("orders")
        .upsert(upsertPayload, { onConflict: "confirmation_id", ignoreDuplicates: false });

      if (upsertError) {
        console.error("[get-resume-order] upsert failed:", upsertError.message);
        return new Response(
          JSON.stringify({ ok: false, error: upsertError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Send unpaid lead notification for NEW orders only ─────────────────
      // Only fire when: new order AND has email AND not suppressed AND not already paid
      const shouldNotify =
        isNewOrder &&
        !body.suppressLeadNotification &&
        !body.paymentIntentId && // not already paying
        (body.email || "").trim() !== "" &&
        RESEND_API_KEY;

      if (shouldNotify) {
        try {
          const emailData = body.email || "";
          const firstNameData = body.firstName || "";
          const lastNameData = body.lastName || "";
          const phoneData = body.phone || "";
          const stateData = body.state || "";
          const letterTypeData = body.letterType || "esa";
          const deliveryData = body.deliverySpeed || "2-3days";
          const timestamp = new Date().toLocaleString("en-US", {
            timeZone: "America/New_York",
            dateStyle: "medium",
            timeStyle: "short",
          }) + " ET";

          const html = buildUnpaidLeadHtml({
            confirmationId,
            firstName: firstNameData,
            lastName: lastNameData,
            email: emailData,
            phone: phoneData,
            state: stateData,
            letterType: letterTypeData,
            deliverySpeed: deliveryData,
            timestamp,
          });

          const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [INTERNAL_NOTIFICATION_EMAIL],
              subject: `[PawTenant] New Unpaid Lead — ${confirmationId} (${letterTypeData.toUpperCase()})`,
              html,
            }),
          });

          if (res.ok) {
            console.info(`[get-resume-order] Unpaid lead notification sent for ${confirmationId}`);
          } else {
            const errText = await res.text();
            console.warn(`[get-resume-order] Lead notification failed: ${errText}`);
          }
        } catch (notifyErr) {
          // Non-critical — don't fail the upsert
          console.warn("[get-resume-order] Lead notification error:", notifyErr);
        }
      }

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Default GET action: fetch order for resume flow ───────────────────
    const { data, error } = await supabase
      .from("orders")
      .select(
        "confirmation_id, first_name, last_name, email, phone, state, delivery_speed, price, assessment_answers, payment_intent_id, status, plan_type, letter_type"
      )
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const alreadyPaid = !!(data.payment_intent_id);

    const safeOrder = {
      confirmation_id: data.confirmation_id,
      first_name: data.first_name,
      last_name: data.last_name,
      email: data.email,
      phone: data.phone,
      state: data.state,
      delivery_speed: data.delivery_speed,
      price: data.price,
      assessment_answers: data.assessment_answers,
      status: data.status,
      plan_type: data.plan_type,
      letter_type: data.letter_type,
      already_paid: alreadyPaid,
    };

    return new Response(
      JSON.stringify({ ok: true, order: safeOrder }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
