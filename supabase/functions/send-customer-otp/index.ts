// send-customer-otp — issues a 6-digit verification code for the
// customer pre-checkout OTP step in the ESA/PSD assessment flow.
//
// Design (mirrors the existing admin OTP convention):
//   * 6-digit numeric code, stored plaintext in the service-role-only
//     customer_otp_codes table, 10-minute TTL, single use.
//   * Soft rate limit: refuse a new send if one was issued < 45s ago for the
//     same email (returns ok:true with cooldown so the UI can show a timer).
//   * Delivered through both canonical channels: Resend email and GHL SMS.
//   * Does NOT reveal whether an account exists — always behaves identically.
//
// OTP-EMAIL-PRIMARY-DELIVERY-001 (P0, 2026-08-19): EMAIL IS PRIMARY; SMS is
// best-effort secondary convenience. One code is generated and the SAME code
// goes to both channels, but the code stays active when EITHER provider
// accepts it. It is deleted only when BOTH fail — and then only the code this
// request issued, so a failed resend never destroys a still-valid earlier
// code. The response reports exactly which channels delivered so the UI can
// never claim a send that did not happen. The previous both-channels-required
// rule deleted an email-accepted code whenever an unreachable phone made GHL
// refuse the SMS. Delivery policy lives in _shared/otpDeliveryPolicy.ts.
//
// verify_jwt is disabled (public flow, called with the anon key like
// create-payment-intent). No secret values are ever returned in the response,
// and the OTP is never written to a log line, audit row or response payload.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendGhlSms, normalizeE164 } from "../_shared/ghlSms.ts";
import { decideOtpDelivery } from "../_shared/otpDeliveryPolicy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const TTL_MINUTES = 10;
const RESEND_COOLDOWN_MS = 45 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function buildEmail(name: string, otp: string): string {
  const hi = name ? `Hi ${name}, ` : "";
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 20px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="background:#0f1e1a;padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="${COMPANY_NAME}" width="160" style="display:block;margin:0 auto 16px;max-width:160px;" />
          <div style="display:inline-block;background:rgba(255,255,255,0.12);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;padding:5px 16px;border-radius:999px;margin-bottom:12px;">Verify your email</div>
          <h1 style="margin:0;font-size:20px;font-weight:800;color:#ffffff;line-height:1.3;">Your verification code</h1>
        </td></tr>
        <tr><td style="padding:36px 32px;text-align:center;">
          <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">${hi}enter this one-time code to verify your email and continue to secure checkout:</p>
          <div style="display:inline-block;background:#f0faf7;border:2px solid #1a5c4f;border-radius:16px;padding:20px 40px;margin-bottom:24px;">
            <span style="font-size:42px;font-weight:900;letter-spacing:0.18em;color:#1a5c4f;font-family:monospace;">${otp}</span>
          </div>
          <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">This code expires in <strong style="color:#374151;">${TTL_MINUTES} minutes</strong>.</p>
          <p style="margin:0;font-size:12px;color:#d1d5db;">If you didn't request this, you can safely ignore this email.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;border-top:1px solid #f3f4f6;padding:16px 32px;text-align:center;">
          <p style="margin:0;font-size:11px;color:#9ca3af;">${COMPANY_NAME} &mdash; ESA &amp; PSD Letter Consultations</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json() as { email?: string; phone?: string; confirmationId?: string; firstName?: string; letterType?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return json({ ok: false, error: "A valid email is required" }, 400);
    // EMAIL-PRIMARY: a missing or non-dialable number no longer blocks the
    // send — it only skips the SMS channel. A structurally valid but
    // unreachable phone must never keep the email channel from being tried,
    // and must never invalidate an email-accepted code.
    const phone = normalizeE164((body.phone ?? "").trim());

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Soft rate limit — refuse a fresh send if one was issued very recently.
    const { data: recent } = await admin
      .from("customer_otp_codes")
      .select("created_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recent?.created_at) {
      const ageMs = Date.now() - new Date(recent.created_at as string).getTime();
      if (ageMs < RESEND_COOLDOWN_MS) {
        // Channel-neutral on purpose: this reply cannot know which channels the
        // previous send actually reached, so it must not claim either.
        return json({ ok: true, cooldown: true, retryInSeconds: Math.ceil((RESEND_COOLDOWN_MS - ageMs) / 1000), message: "A code was just sent." });
      }
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + TTL_MINUTES * 60 * 1000).toISOString();

    // RESEND SAFETY: insert the NEW code BEFORE touching any prior one. The
    // old order (delete-then-insert) meant a resend whose delivery then failed
    // had already destroyed a still-valid code. Prior codes are removed only
    // after at least one channel accepts the new one; verification always
    // reads the newest row, so the brief overlap is harmless.
    const { data: insRow, error: insErr } = await admin.from("customer_otp_codes").insert({
      email,
      code: otp,
      confirmation_id: body.confirmationId ?? null,
      first_name: body.firstName ?? null,
      letter_type: body.letterType ?? null,
      expires_at: expiresAt,
    }).select("id").single();
    if (insErr || !insRow?.id) {
      console.error("[send-customer-otp] insert failed:", insErr);
      return json({ ok: false, error: "Could not start verification. Please try again." }, 500);
    }

    const firstName = (body.firstName ?? "").split(" ")[0];
    // ONE code, both channels, dispatched together. Each channel resolves to a
    // boolean; neither can throw. A missing Resend key or a missing dialable
    // number is simply that channel failing/being skipped — never an early
    // return that abandons the other channel.
    const emailPromise: Promise<boolean> = resendKey
      ? fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: [email],
          subject: `${otp} — Your ${COMPANY_NAME} verification code`,
          html: buildEmail(firstName, otp),
          reply_to: SUPPORT_EMAIL,
        }),
      }).then(async (res) => {
        // Resend's HTTP acceptance is the email-channel success signal. Later
        // bounce/suppression events never retroactively delete an issued OTP.
        if (!res.ok) console.error("[send-customer-otp] Resend error:", res.status, (await res.text().catch(() => "")).slice(0, 300));
        return res.ok;
      }).catch((e) => {
        console.error("[send-customer-otp] Resend unreachable:", e instanceof Error ? e.message : String(e));
        return false;
      })
      : (console.warn("[send-customer-otp] RESEND_API_KEY not set — email channel unavailable"), Promise.resolve(false));

    const smsPromise: Promise<boolean> = phone
      ? sendGhlSms({
        toPhone: phone,
        message: `${otp} is your PawTenant verification code. It expires in ${TTL_MINUTES} minutes. Do not share this code.`,
        checkDnd: true,
        contactSource: "PawTenant assessment OTP",
      }).then((r) => {
        // Provider internals stay server-side: logs carry the failure class,
        // never the vendor payload, and never the code itself.
        if (!r.ok) console.error("[send-customer-otp] GHL SMS failed:", r.failureCode, r.outcome);
        return r.ok;
      }).catch(() => false)
      : Promise.resolve(false);

    const [emailOk, smsOk] = await Promise.all([emailPromise, smsPromise]);
    const decision = decideOtpDelivery({ emailOk, smsOk, smsAttempted: !!phone });

    if (decision.deleteNewCode) {
      // Both channels failed: remove ONLY the code this request issued. An
      // earlier still-valid code (the failed-resend case) survives and remains
      // verifiable.
      await admin.from("customer_otp_codes").delete().eq("id", insRow.id);
      return json({ ok: false, error: decision.message, channels: decision.channels }, decision.httpStatus);
    }

    // At least one channel accepted the new code — it is now the only valid
    // code for this email; older ones are retired.
    if (decision.deletePriorCodes) {
      await admin.from("customer_otp_codes").delete().eq("email", email).neq("id", insRow.id);
    }
    return json({ ok: true, expires_minutes: TTL_MINUTES, channels: decision.channels, message: decision.message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[send-customer-otp] error:", msg);
    return json({ ok: false, error: "Server error. Please try again." }, 500);
  }
});
