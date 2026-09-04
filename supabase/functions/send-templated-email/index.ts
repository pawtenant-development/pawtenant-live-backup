// send-templated-email — generic DB template sender used by admin Comms tab
// Input: { slug, to, vars?, confirmationId? }
// Looks up email_templates by slug, substitutes vars, wraps in master layout (or fallback), sends via Resend.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logEmailComm } from "../_shared/logEmailComm.ts";
// Task 1C — same reservation the SMS and provider-notification paths use.
import { reserveEmailSend, finalizeEmailSend } from "../_shared/reserveEmailSend.ts";
import { resolveAuditActor, maskEmail } from "../_shared/auditActor.ts";
import { sendEmailViaResend } from "../_shared/resendClient.ts";
import { renderOrderConfirmationContent } from "../_shared/orderConfirmationLayout.ts";
import { DELIVERY_PROMISE_LABEL } from "../_shared/deliveryPromise.ts";
import { issueResumeLink } from "../_shared/resumeLink.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://www.pawtenant.com";
const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function escapeHtml(v = "") {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function substitute(s: string, vars: Record<string, string>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
}

const FALLBACK_LAYOUT = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;max-width:600px;width:100%;">
      <tr><td style="background:#4a9e8a;padding:24px;text-align:center;color:#ffffff;">
        <h1 style="margin:0;font-size:22px;font-weight:800;">PawTenant</h1>
      </td></tr>
      <tr><td style="padding:32px;">{{content}}</td></tr>
      <tr><td style="padding:20px 32px;text-align:center;border-top:1px solid #e5e7eb;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">PawTenant &mdash; ESA &amp; PSD Consultation</p>
      </td></tr>
    </table>
  </td></tr>
</table></body></html>`;

async function loadMasterLayout(supabase: ReturnType<typeof createClient>): Promise<string> {
  const { data } = await supabase
    .from("comms_settings")
    .select("value")
    .eq("key", "email_layout_html")
    .maybeSingle();
  const val = (data?.value as string | null) ?? "";
  if (val && val.includes("{{content}}")) return val;
  return FALLBACK_LAYOUT;
}

function renderBodyAsHtml(bodyText: string, ctaLabel: string, ctaUrl: string): string {
  const paragraphs = bodyText
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((line) => `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7;">${line}</p>`)
    .join("");

  const cta = ctaUrl
    ? `<table width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
         <tr><td align="center">
           <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#f97316;color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:14px 36px;border-radius:8px;">${ctaLabel || "Open"} &rarr;</a>
         </td></tr>
       </table>`
    : "";

  return `${paragraphs}${cta}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as {
      slug: string;
      to: string;
      vars?: Record<string, string>;
      confirmationId?: string;
      // Task 1C: one token per send the operator initiated. Concurrent retries
      // carrying the same token collapse to a single Resend call.
      operationToken?: string;
    };

    if (!body.slug || !body.to) {
      return json({ ok: false, error: "slug and to are required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // PROVIDER-LETTER-ADMIN-APPROVAL-GATE-AND-AUDIT-UX-001 §16 — the sender is
    // resolved from the caller's JWT. This endpoint previously hard-coded
    // sentBy "admin_comms", so an email an employee sent by hand and an email a
    // background job sent were indistinguishable in the record.
    const actor = await resolveAuditActor(req, supabase);

    const { data: tmpl, error } = await supabase
      .from("email_templates")
      .select("subject, body, cta_label, cta_url")
      .eq("slug", body.slug)
      .eq("channel", "email")
      .maybeSingle();

    if (error || !tmpl) {
      return json({ ok: false, error: `Template not found for slug: ${body.slug}` }, 404);
    }

    // Hydrate order-derived vars when a confirmationId is provided. Caller-
    // supplied vars override these, so existing call sites stay backward-compatible.
    // Fixes admin-comms "order confirmation" resends rendering with blank
    // State/Plan/Delivery/Amount because the UI didn't pass those keys.
    const hydratedFromOrder: Record<string, string> = {};
    if (body.confirmationId) {
      try {
        const { data: ord } = await supabase
          .from("orders")
          .select("first_name, last_name, email, state, plan_type, delivery_speed, price, coupon_code, coupon_discount, confirmation_id")
          .eq("confirmation_id", body.confirmationId)
          .maybeSingle();
        if (ord) {
          const o = ord as Record<string, unknown>;
          const firstName = (o.first_name as string) || "";
          const stateValue = (o.state as string) || "";
          const planType = (o.plan_type as string) || "One-Time Purchase";
          // CUSTOMER-DELIVERY-24-HOUR-PROMISE-PARITY-001: the {{delivery}}
          // merge field feeds every DB-backed customer template.
          const deliveryLabel = DELIVERY_PROMISE_LABEL;
          const priceNum = (o.price as number) ?? 0;
          const formattedPrice = `$${Number(priceNum).toFixed(2)}`;
          hydratedFromOrder.name = firstName || "there";
          hydratedFromOrder.first_name = firstName;
          hydratedFromOrder.order_id = (o.confirmation_id as string) || body.confirmationId;
          hydratedFromOrder.confirmation_id = (o.confirmation_id as string) || body.confirmationId;
          hydratedFromOrder.email = (o.email as string) || "";
          hydratedFromOrder.state = stateValue;
          hydratedFromOrder.plan = planType;
          hydratedFromOrder.delivery = deliveryLabel;
          hydratedFromOrder.amount = formattedPrice;
          hydratedFromOrder.price = formattedPrice;
          hydratedFromOrder.coupon_code = (o.coupon_code as string | null) ?? "";
          hydratedFromOrder.coupon_discount = (o.coupon_discount as number | null) != null
            ? `$${o.coupon_discount}`
            : "";
          hydratedFromOrder.portal_url = `${SITE_URL.replace(/\/$/, "")}/my-orders`;
          hydratedFromOrder.date = new Date().toISOString().slice(0, 10);
        }
      } catch (err) {
        console.warn("[send-templated-email] order hydration failed", err);
      }
    }

    // ── Resume links are minted HERE, server-side ────────────────────────────
    // ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §F
    //
    // The admin console used to build `{resume_url}` in the browser as
    // `…/assessment?resume=<confirmationId>` and pass it in `vars`. Two problems:
    // a confirmation id is a display reference, not a credential; and a
    // caller-supplied var could put ANY link into a customer email.
    //
    // Now: whenever a template actually uses a resume variable and we know the
    // order, we mint an expiring, single-use, order-bound token through the one
    // canonical builder — and these two keys are applied AFTER `body.vars`, so
    // a caller can no longer override them. The raw token never enters the
    // admin browser on this path at all.
    const templateSurface = `${tmpl.subject ?? ""}${tmpl.body ?? ""}${tmpl.cta_url ?? ""}`;
    const needsResumeLink = /\{resume_url(_with_promo)?\}/.test(templateSurface);
    const authoritativeResumeVars: Record<string, string> = {};
    if (needsResumeLink && body.confirmationId) {
      const issued = await issueResumeLink({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        siteUrl: SITE_URL,
        confirmationId: body.confirmationId,
        isPsd: /(-|_)psd/i.test(body.confirmationId) ||
               (body.vars?.letter_type ?? "").toLowerCase().includes("psd"),
        purpose: "resume_assessment",
        ttlMinutes: 1440, // 24 h — staff send these in a live conversation.
        createdBy: "send-templated-email",
      });
      authoritativeResumeVars.resume_url = issued.url;
      const promo = (body.vars?.discount_code ?? "").trim();
      authoritativeResumeVars.resume_url_with_promo = promo
        ? issued.url  // no promo appended — ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001
        : issued.url;
    }

    const vars: Record<string, string> = {
      site_url: SITE_URL,
      ...hydratedFromOrder,
      ...(body.vars ?? {}),
      // Applied last: not caller-overridable.
      ...authoritativeResumeVars,
    };

    const subject = substitute(tmpl.subject as string, vars);
    const bodyText = substitute(tmpl.body as string, vars);
    const ctaLabel = substitute((tmpl.cta_label as string) ?? "", vars);
    const ctaUrl = substitute((tmpl.cta_url as string) ?? "", vars);

    // For order_confirmation, render via the shared renderer so the manual
    // admin email matches the automatic (webhook + client_fallback) email
    // exactly — same structured details card, same heading, same CTA shape.
    // Other slugs fall back to the existing generic line-by-line renderer.
    const content = body.slug === "order_confirmation"
      ? renderOrderConfirmationContent({
          subject,
          bodyText,
          ctaLabel: ctaLabel || "Track My Order",
          ctaUrl: ctaUrl || `${SITE_URL.replace(/\/$/, "")}/my-orders`,
          details: {
            orderId: vars.order_id || vars.confirmation_id || body.confirmationId || "",
            state: vars.state || "",
            plan: vars.plan || "",
            delivery: vars.delivery || "",
            amount: vars.amount || vars.price || "",
            couponCode: vars.coupon_code || null,
            couponDiscount: vars.coupon_discount ? Number(String(vars.coupon_discount).replace(/[^0-9.]/g, "")) || null : null,
          },
        })
      : renderBodyAsHtml(bodyText, ctaLabel, ctaUrl);
    const layout = await loadMasterLayout(supabase);
    const html = layout.replace("{{content}}", content);

    // Centralized Resend transport via shared helper.
    // Helper does NOT auto-attach BCC and does NOT auto-write to communications;
    // ── CLAIM before SEND (Task 1C) ────────────────────────────────────────
    // The communications row used to be written AFTER Resend answered, so two
    // concurrent requests could both deliver before either had logged anything.
    // The claim goes in first, on the unique communications.dedupe_key index;
    // the loser of the race never calls Resend. No token → unchanged behaviour.
    const operationToken = (body.operationToken ?? "").toString().trim();
    let claimRowId: string | null = null;
    if (operationToken) {
      const claim = await reserveEmailSend({
        supabase,
        confirmationId: body.confirmationId ?? null,
        to: body.to,
        from: FROM_EMAIL,
        subject,
        slug: body.slug,
        dedupeKey: `${body.confirmationId ?? body.to}:${body.slug}:${operationToken}`,
        templateSource: "db",
        sentBy: actor.name,
        staleClaimMinutes: 5,
      });
      if (!claim.proceed) {
        console.log(`[send-templated-email] duplicate suppressed — operationToken=${operationToken}`);
        return json({ ok: true, duplicate: true, skipped: true, reason: "already sent for this operation" });
      }
      claimRowId = claim.rowId ?? null;
    }

    // Trustpilot BCC remains scoped to send-review-request only.
    const sendResult = await sendEmailViaResend(
      {
        from: FROM_EMAIL,
        to: [body.to],
        subject,
        html,
        tags: [
          { name: "email_type", value: "templated_email" },
          { name: "slug", value: body.slug },
          ...(body.confirmationId ? [{ name: "confirmation_id", value: body.confirmationId }] : []),
        ],
      },
      RESEND_API_KEY,
    );

    if (!sendResult.ok) {
      // Keep the evidence on the claimed row rather than leaving it stuck in
      // "sending" — and mark whether another attempt is worth making.
      await finalizeEmailSend(supabase, claimRowId, {
        success: false,
        status: (sendResult.status === 0 || sendResult.status === 429 || sendResult.status >= 500)
          ? "retryable_failed"
          : "terminal_failed",
        errorMessage: `${sendResult.error} (HTTP ${sendResult.status})`,
      });
      return json({ ok: false, error: `Resend error (${sendResult.status}): ${sendResult.raw || sendResult.error}` }, 500);
    }

    // order_id lets the order-level Audit timeline resolve this event directly
    // instead of string-matching the confirmation id.
    let orderIdForAudit: string | null = null;
    if (body.confirmationId) {
      const { data: oRow } = await supabase
        .from("orders").select("id").eq("confirmation_id", body.confirmationId).maybeSingle();
      orderIdForAudit = ((oRow as { id?: string } | null)?.id) ?? null;
    }

    // Primary log → communications (single source of truth for the unified Comms
    // timeline). With a claim this FINALISES the reserved row; inserting a second
    // row here would defeat claiming first.
    if (claimRowId) {
      await finalizeEmailSend(supabase, claimRowId, {
        success: true,
        status: "sent",
        body: bodyText,
        resendId: sendResult.messageId,
        extraColumns: { order_id: orderIdForAudit },
      });
    } else {
      await logEmailComm({
        supabase,
        confirmationId: body.confirmationId ?? null,
        to: body.to,
        from: FROM_EMAIL,
        subject,
        body: bodyText,
        slug: body.slug,
        templateSource: "db",
        sentBy: actor.name,
      });
    }

    // Audit the send. The rendered body is NOT copied here — `communications`
    // is the authoritative record; the audit row names the template and links
    // to the order (§19).
    await supabase.from("audit_logs").insert({
      actor_id: actor.id,
      actor_name: actor.name,
      actor_role: actor.role,
      actor_type: actor.type,
      category: "communications",
      source: actor.isHuman ? "admin_portal" : "system",
      object_type: "order",
      object_id: body.confirmationId ?? null,
      order_id: orderIdForAudit,
      entity_type: "communication",
      action: "customer_email_sent",
      description: `${actor.name} sent the "${body.slug}" email to the customer (${maskEmail(body.to)}).`,
      metadata: {
        channel: "email",
        direction: "outbound",
        recipient_type: "customer",
        recipient_masked: maskEmail(body.to),
        template: body.slug,
        subject,
        delivery_status: "sent",
        confirmation_id: body.confirmationId ?? null,
      },
    });

    // Backup log → orders.email_log (kept for legacy consumers; not source of truth)
    if (body.confirmationId) {
      const { data: order } = await supabase
        .from("orders")
        .select("email_log")
        .eq("confirmation_id", body.confirmationId)
        .maybeSingle();
      const existingLog = (order?.email_log as unknown[]) ?? [];
      await supabase.from("orders").update({
        email_log: [...existingLog, {
          type: `templated_${body.slug}`,
          sentAt: new Date().toISOString(),
          to: body.to,
          success: true,
          slug: body.slug,
        }],
      }).eq("confirmation_id", body.confirmationId);
    }

    return json({ ok: true, to: body.to, slug: body.slug });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: `Internal error: ${msg}` }, 500);
  }
});
