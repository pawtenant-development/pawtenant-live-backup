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

function normalizePhone(raw: unknown): string {
  if (!raw || typeof raw !== "string") return "";
  const stripped = raw.trim().replace(/[\s\-().]/g, "");
  if (/^\+\d{10,15}$/.test(stripped)) return stripped;
  const digitsOnly = stripped.replace(/\D/g, "");
  if (digitsOnly.length === 0) return "";
  if (digitsOnly.length === 10) return `+1${digitsOnly}`;
  if (digitsOnly.length === 11 && digitsOnly.startsWith("1")) return `+${digitsOnly}`;
  return `+${digitsOnly}`;
}

function isAlreadyPaid(
  order: { payment_intent_id?: string | null; paid_at?: string | null } | null | undefined
): boolean {
  return !!(order?.payment_intent_id || order?.paid_at);
}

async function fireGHLServerSide(opts: {
  supabase: ReturnType<typeof createClient>;
  confirmationId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  letterType: string;
  status: string;
  event: string;
  serviceKey: string;
}): Promise<void> {
  try {
    const ghlPayload = {
      webhookType: "assessment",
      event: opts.event,
      firstName: opts.firstName,
      lastName: opts.lastName,
      email: opts.email,
      phone: opts.phone,
      state: opts.state,
      confirmationId: opts.confirmationId,
      letterType: opts.letterType,
      leadSource: "ESA Assessment Form",
      submittedAt: new Date().toISOString(),
    };

    const ghlRes = await fetch(`${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.serviceKey}`,
      },
      body: JSON.stringify(ghlPayload),
    });

    const ghlBody = await ghlRes.text();
    const ghlOk = ghlRes.ok;

    await opts.supabase
      .from("orders")
      .update({
        ghl_synced_at: ghlOk ? new Date().toISOString() : null,
        ghl_sync_error: ghlOk ? null : `HTTP ${ghlRes.status}: ${ghlBody.slice(0, 400)}`,
      })
      .eq("confirmation_id", opts.confirmationId);

    if (!ghlOk) {
      console.warn(
        `[get-resume-order] GHL sync failed for ${opts.confirmationId}: HTTP ${ghlRes.status} — ${ghlBody.slice(0, 200)}`
      );
    } else {
      console.info(`[get-resume-order] GHL sync OK for ${opts.confirmationId} (event=${opts.event})`);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[get-resume-order] GHL sync threw for ${opts.confirmationId}: ${msg}`);
    try {
      await opts.supabase
        .from("orders")
        .update({
          ghl_sync_error: `GHL proxy error: ${msg.slice(0, 400)}`,
        })
        .eq("confirmation_id", opts.confirmationId);
    } catch {
      // best-effort only
    }
  }
}

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
    ["Order ID", opts.confirmationId],
    ["Name", `${opts.firstName} ${opts.lastName}`.trim() || "—"],
    ["Email", opts.email],
    ["Phone", opts.phone || "—"],
    ["State", opts.state || "—"],
    ["Service", opts.letterType === "psd" ? "PSD Letter" : "ESA Letter"],
    ["Delivery", opts.deliverySpeed === "2-3days" ? "Standard (2-3 days)" : "Priority (24h)"],
    ["Status", "UNPAID — Assessment Completed"],
    ["Time", opts.timestamp],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
    <tr>
      <td style="padding:8px 12px;font-size:13px;color:#6b7280;width:160px;border-bottom:1px solid #f3f4f6;font-weight:600;">${label}</td>
      <td style="padding:8px 12px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${value}</td>
    </tr>`
    )
    .join("");

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body = (await req.json()) as {
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
      suppressLeadNotification?: boolean;
      skipGhlSync?: boolean;
    };

    const { confirmationId, action } = body;

    if (!confirmationId) {
      return new Response(
        JSON.stringify({ ok: false, error: "confirmationId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "upsert") {
      const normalizedPhone = normalizePhone(body.phone);
      const normalizedEmail = (body.email ?? "").trim().toLowerCase();
      const isPaymentUpsert = !!body.paymentIntentId || !!body.paidAt;

      // ── Step 1: Resolve the canonical order row ──────────────────────────
      // Priority:
      //   1. existing row with this confirmation_id
      //   2. (payment upserts only) existing row with this payment_intent_id
      //   3. existing UNPAID row with the same email (lead carry-over)
      //   4. none — create new row (lead only; payment upserts refuse)

      const { data: byConfId, error: byConfIdErr } = await supabase
        .from("orders")
        .select(
          "id, confirmation_id, status, email_log, first_name, last_name, email, phone, state, delivery_speed, letter_type, payment_intent_id, paid_at, price, plan_type, payment_method, selected_provider"
        )
        .eq("confirmation_id", confirmationId)
        .maybeSingle();

      if (byConfIdErr) {
        console.error("[get-resume-order] failed to fetch existing order:", byConfIdErr.message);
        return new Response(
          JSON.stringify({ ok: false, error: byConfIdErr.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let existingOrder = byConfId;
      let effectiveConfirmationId = confirmationId;
      let matchedBy: "confirmation_id" | "payment_intent_id" | "email" | "new" = byConfId
        ? "confirmation_id"
        : "new";

      // 2. Payment upsert fallback: match by payment_intent_id (webhook may have written first)
      if (!existingOrder && isPaymentUpsert && body.paymentIntentId) {
        const { data: byPi } = await supabase
          .from("orders")
          .select(
            "id, confirmation_id, status, email_log, first_name, last_name, email, phone, state, delivery_speed, letter_type, payment_intent_id, paid_at, price, plan_type, payment_method, selected_provider"
          )
          .eq("payment_intent_id", body.paymentIntentId)
          .maybeSingle();
        if (byPi) {
          existingOrder = byPi;
          effectiveConfirmationId = byPi.confirmation_id as string;
          matchedBy = "payment_intent_id";
          console.info(
            `[get-resume-order] matched by payment_intent_id: ${body.paymentIntentId} -> ${effectiveConfirmationId}`
          );
        }
      }

      // 3. Email fallback — applies to BOTH lead and payment upserts
      //    For PAID-email matches we still block (different user must use different email).
      //    For UNPAID-email matches we reuse the existing row.
      if (!existingOrder && normalizedEmail) {
        const { data: byEmail } = await supabase
          .from("orders")
          .select(
            "id, confirmation_id, status, email_log, first_name, last_name, email, phone, state, delivery_speed, letter_type, payment_intent_id, paid_at, price, plan_type, payment_method, selected_provider"
          )
          .ilike("email", normalizedEmail)
          .not("status", "in", `("refunded","cancelled")`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (byEmail) {
          if (isAlreadyPaid(byEmail) && !isPaymentUpsert) {
            // Lead save attempted against an email that already has a paid order — block
            console.warn(
              `[get-resume-order] Email conflict (paid): ${normalizedEmail} already has order ${byEmail.confirmation_id}`
            );
            return new Response(
              JSON.stringify({
                ok: false,
                error: "An order already exists for this email. Please use a different email.",
                emailConflict: true,
              }),
              { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (isAlreadyPaid(byEmail) && isPaymentUpsert) {
            // Payment upsert against an already-paid email row with a different PI
            const incomingPi = body.paymentIntentId ?? null;
            if (incomingPi && byEmail.payment_intent_id && byEmail.payment_intent_id !== incomingPi) {
              console.error(
                `[get-resume-order] payment conflict (email): ${normalizedEmail} already paid with PI ${byEmail.payment_intent_id}, incoming PI ${incomingPi}`
              );
              return new Response(
                JSON.stringify({
                  ok: false,
                  error: "Order already paid with a different payment intent",
                  alreadyPaid: true,
                  confirmationId: byEmail.confirmation_id,
                }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
              );
            }
          }
          existingOrder = byEmail;
          effectiveConfirmationId = byEmail.confirmation_id as string;
          matchedBy = "email";
          console.info(
            `[get-resume-order] matched by email: ${normalizedEmail} -> ${effectiveConfirmationId} (status=${byEmail.status})`
          );
        }
      }

      // 4. Payment upserts MUST NEVER create a new row
      if (isPaymentUpsert && !existingOrder) {
        console.error(
          `[get-resume-order] payment upsert refused — no existing row for ${confirmationId} / PI ${body.paymentIntentId ?? "none"} / email ${normalizedEmail || "none"}`
        );
        return new Response(
          JSON.stringify({
            ok: false,
            error:
              "Cannot record payment: no existing order found for this confirmation_id, payment_intent_id, or email. Lead must be saved before payment.",
            missingOrder: true,
            confirmationId,
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ── Step 2: Idempotent / conflict checks for payment upserts ─────────
      if (isPaymentUpsert && existingOrder) {
        const existingPi = existingOrder.payment_intent_id ?? null;
        const incomingPi = body.paymentIntentId ?? null;
        const alreadyPaid = isAlreadyPaid(existingOrder);

        if (alreadyPaid && existingPi && incomingPi && existingPi === incomingPi) {
          console.info(`[get-resume-order] idempotent payment upsert for ${effectiveConfirmationId}`);
          return new Response(
            JSON.stringify({
              ok: true,
              alreadyPaid: true,
              idempotent: true,
              confirmationId: effectiveConfirmationId,
              matchedBy,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        if (alreadyPaid && existingPi && incomingPi && existingPi !== incomingPi) {
          console.error(
            `[get-resume-order] payment conflict for ${effectiveConfirmationId}: existing PI ${existingPi}, incoming PI ${incomingPi}`
          );
          return new Response(
            JSON.stringify({
              ok: false,
              error: "Order already paid with a different payment intent",
              alreadyPaid: true,
              confirmationId: effectiveConfirmationId,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const isNewOrder = matchedBy === "new";

      // ── Step 3: Build and execute upsert ─────────────────────────────────
      const upsertPayload: Record<string, unknown> = {
        confirmation_id: effectiveConfirmationId,
        user_id: null,
      };

      if (body.email !== undefined) upsertPayload.email = body.email;
      if (body.firstName !== undefined) upsertPayload.first_name = body.firstName;
      if (body.lastName !== undefined) upsertPayload.last_name = body.lastName;
      if (body.phone !== undefined) upsertPayload.phone = normalizedPhone || body.phone;
      if (body.state !== undefined) upsertPayload.state = body.state;
      if (body.deliverySpeed !== undefined) upsertPayload.delivery_speed = body.deliverySpeed;
      if (body.letterType !== undefined) upsertPayload.letter_type = body.letterType;
      if (body.status !== undefined) upsertPayload.status = body.status;
      if (body.assessmentAnswers !== undefined) upsertPayload.assessment_answers = body.assessmentAnswers;
      if (body.price !== undefined) upsertPayload.price = body.price;
      if (body.planType !== undefined) upsertPayload.plan_type = body.planType;
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

      if (body.paymentIntentId !== undefined && body.paymentIntentId !== null && body.paymentIntentId !== "") {
        upsertPayload.payment_intent_id = body.paymentIntentId;
      }
      if (body.paidAt !== undefined && body.paidAt !== null && body.paidAt !== "") {
        upsertPayload.paid_at = body.paidAt;
      }

      // letter_url intentionally never set here — only provider uploads set it.

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

      // ── Step 4: Side effects (GHL, lead notification) ────────────────────
      const isLeadSave = !isPaymentUpsert && !body.skipGhlSync;
      const phoneForGhl = normalizedPhone || body.phone || existingOrder?.phone || "";
      const emailForGhl = body.email ?? existingOrder?.email ?? "";
      const firstNameForGhl = body.firstName ?? existingOrder?.first_name ?? "";
      const lastNameForGhl = body.lastName ?? existingOrder?.last_name ?? "";
      const stateForGhl = body.state ?? existingOrder?.state ?? "";
      const letterTypeForGhl = body.letterType ?? existingOrder?.letter_type ?? "esa";

      if (isLeadSave && emailForGhl) {
        fireGHLServerSide({
          supabase,
          confirmationId: effectiveConfirmationId,
          firstName: firstNameForGhl,
          lastName: lastNameForGhl,
          email: emailForGhl,
          phone: phoneForGhl,
          state: stateForGhl,
          letterType: letterTypeForGhl,
          status: body.status ?? "lead",
          event: "assessment_started",
          serviceKey: SUPABASE_SERVICE_ROLE_KEY,
        }).catch((err) => {
          console.warn("[get-resume-order] GHL fire error:", err);
        });
      }

      const shouldNotify =
        isNewOrder &&
        !body.suppressLeadNotification &&
        !isPaymentUpsert &&
        (body.email || "").trim() !== "" &&
        RESEND_API_KEY;

      if (shouldNotify) {
        try {
          const emailData = body.email || "";
          const firstNameData = body.firstName || "";
          const lastNameData = body.lastName || "";
          const phoneData = normalizedPhone || body.phone || "";
          const stateData = body.state || "";
          const letterTypeData = body.letterType || "esa";
          const deliveryData = body.deliverySpeed || "2-3days";
          const timestamp =
            new Date().toLocaleString("en-US", {
              timeZone: "America/New_York",
              dateStyle: "medium",
              timeStyle: "short",
            }) + " ET";

          const html = buildUnpaidLeadHtml({
            confirmationId: effectiveConfirmationId,
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
              Authorization: `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: FROM_EMAIL,
              to: [INTERNAL_NOTIFICATION_EMAIL],
              subject: `[PawTenant] New Unpaid Lead — ${effectiveConfirmationId} (${letterTypeData.toUpperCase()})`,
              html,
            }),
          });

          if (res.ok) {
            console.info(`[get-resume-order] Unpaid lead notification sent for ${effectiveConfirmationId}`);
          } else {
            const errText = await res.text();
            console.warn(`[get-resume-order] Lead notification failed: ${errText}`);
          }
        } catch (notifyErr) {
          console.warn("[get-resume-order] Lead notification error:", notifyErr);
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          // Always return the canonical id; frontend MUST adopt this.
          confirmationId: effectiveConfirmationId,
          matchedBy,
          alreadyPaid: isPaymentUpsert ? !!body.paymentIntentId : false,
          idDiverged: effectiveConfirmationId !== confirmationId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── READ path ─────────────────────────────────────────────────────────
    const { data, error } = await supabase
      .from("orders")
      .select(
        "confirmation_id, first_name, last_name, email, phone, state, delivery_speed, price, assessment_answers, payment_intent_id, paid_at, status, plan_type, letter_type"
      )
      .eq("confirmation_id", confirmationId)
      .maybeSingle();

    if (error || !data) {
      return new Response(
        JSON.stringify({ ok: false, error: "Order not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const alreadyPaid = !!(data.payment_intent_id || data.paid_at);

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
