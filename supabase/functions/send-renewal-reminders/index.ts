import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reserveEmailSend, finalizeEmailSend } from "../_shared/reserveEmailSend.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "PawTenant <hello@pawtenant.com>";
const SITE_URL = "https://www.pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";

const HEADER_BG = "#4a9e8a";
const ACCENT = "#1a5c4f";
const ORANGE = "#f97316";

const RENEWAL_SLUG = "renewal_30day";
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const SOFT_TIME_BUDGET_MS = 50_000; // edge function soft cap — stop before hard timeout

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Order {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  patient_notification_sent_at: string;
  email_log: unknown[] | null;
  plan_type: string | null;
}

function buildRenewalReminderEmail(firstName: string, expiryDate: string, daysLeft: number): string {
  const renewUrl = `${SITE_URL}/renew-esa-letter`;
  const urgencyColor = daysLeft <= 14 ? "#DC2626" : ORANGE;
  const urgencyLabel = daysLeft <= 14 ? "URGENT — Expires Very Soon" : "Action Required — 30 Days Left";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your ESA Letter Expires in ${daysLeft} Days</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;">

        <!-- Header -->
        <tr><td style="background:${HEADER_BG};border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="PawTenant" height="44" style="display:block;margin:0 auto;object-fit:contain;">
        </td></tr>

        <!-- Urgency badge -->
        <tr><td style="background:#ffffff;padding:20px 40px 0;text-align:center;">
          <span style="display:inline-block;background:${urgencyColor}1A;color:${urgencyColor};font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:6px 16px;border-radius:100px;border:1px solid ${urgencyColor}30;">${urgencyLabel}</span>
        </td></tr>

        <!-- Main card -->
        <tr><td style="background:#ffffff;border-radius:0 0 16px 16px;padding:28px 40px 40px;">

          <h1 style="font-size:24px;font-weight:800;color:#1a1a1a;margin:0 0 12px;">
            Hi ${firstName}, your ESA letter expires in <span style="color:${urgencyColor};">${daysLeft} days</span>
          </h1>
          <p style="font-size:15px;color:#555555;line-height:1.7;margin:0 0 24px;">
            Your Emotional Support Animal letter is set to expire on <strong>${expiryDate}</strong>.
            Once expired, your landlord can legally reject your ESA accommodation request — even if they accepted it before.
          </p>

          <!-- Expiry countdown card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff5f0;border-radius:12px;border:1px solid #ffd5b0;margin-bottom:24px;">
            <tr><td style="padding:20px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;border-bottom:1px solid #ffe5cc;">
                    <span style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Letter Expires</span>
                  </td>
                  <td align="right" style="padding:6px 0;border-bottom:1px solid #ffe5cc;">
                    <span style="font-size:13px;color:${urgencyColor};font-weight:700;">${expiryDate}</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;border-bottom:1px solid #ffe5cc;">
                    <span style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Days Remaining</span>
                  </td>
                  <td align="right" style="padding:6px 0;border-bottom:1px solid #ffe5cc;">
                    <span style="font-size:13px;color:${urgencyColor};font-weight:700;">${daysLeft} days</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="font-size:12px;color:#888;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">Renewal Status</span>
                  </td>
                  <td align="right" style="padding:6px 0;">
                    <span style="font-size:13px;color:#16a34a;font-weight:700;">Available Now</span>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td align="center">
              <a href="${renewUrl}" style="display:inline-block;background:${ORANGE};color:#ffffff;font-size:15px;font-weight:700;text-decoration:none;padding:16px 40px;border-radius:10px;">
                Renew My ESA Letter Now &rarr;
              </a>
            </td></tr>
            <tr><td align="center" style="padding-top:10px;">
              <span style="font-size:12px;color:#999;">Takes under 24 hours &nbsp;·&nbsp; From $79/yr &nbsp;·&nbsp; 100% money-back guarantee</span>
            </td></tr>
          </table>

          <!-- What happens if expired -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff0f0;border-radius:12px;border:1px solid #fecaca;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="font-size:13px;font-weight:700;color:#dc2626;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">What happens if your letter expires?</p>
              ${[
                "Landlords can legally deny your ESA accommodation",
                "You can be charged pet fees &amp; deposits again",
                "Your lease protection under the FHA is removed",
                "University dorm ESA accommodations become invalid",
              ].map(b => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr><td width="20" valign="top" style="padding-top:1px;"><span style="color:#dc2626;font-size:14px;">&#10007;</span></td><td style="font-size:13px;color:#444;padding-left:8px;line-height:1.5;">${b}</td></tr></table>`).join("")}
            </td></tr>
          </table>

          <!-- What renewal includes -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fff4;border-radius:12px;border:1px solid #bbf7d0;margin-bottom:28px;">
            <tr><td style="padding:20px 24px;">
              <p style="font-size:13px;font-weight:700;color:#16a34a;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px;">Your renewal includes:</p>
              ${[
                "New ESA letter from a licensed LMHP in your state",
                "New issue date — valid for another full 12 months",
                "FHA-compliant letter accepted by landlords nationwide",
                "Delivered to your inbox within 24 hours",
              ].map(b => `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;"><tr><td width="20" valign="top" style="padding-top:1px;"><span style="color:#16a34a;font-size:14px;">&#10003;</span></td><td style="font-size:13px;color:#444;padding-left:8px;line-height:1.5;">${b}</td></tr></table>`).join("")}
            </td></tr>
          </table>

          <p style="font-size:13px;color:#888;line-height:1.6;margin:0;">
            Questions? Reply to this email or call us at <strong style="color:#1a1a1a;">(409) 965-5885</strong>.<br>
            As a returning PawTenant client, you get priority scheduling — no waitlist.
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 40px;text-align:center;">
          <p style="font-size:12px;color:#aaaaaa;margin:0 0 8px;">
            PawTenant · ESA Consultation Services<br>
            <a href="${SITE_URL}" style="color:${ORANGE};text-decoration:none;">pawtenant.com</a> · (409) 965-5885
          </p>
          <p style="font-size:11px;color:#cccccc;margin:0;">
            You received this because you previously obtained an ESA letter through PawTenant.<br>
            To stop renewal reminders, reply with "unsubscribe" to this email.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    // ── Parse optional JSON body ────────────────────────────────────────────
    let dryRun = false;
    let limit = DEFAULT_LIMIT;
    if (req.method === "POST") {
      try {
        const body = await req.json() as { dry_run?: boolean; limit?: number };
        if (typeof body.dry_run === "boolean") dryRun = body.dry_run;
        if (typeof body.limit === "number" && body.limit > 0) {
          limit = Math.min(Math.floor(body.limit), MAX_LIMIT);
        }
      } catch { /* empty body → defaults */ }
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Eligibility window: letter sent 330–340 days ago (10-day buffer) ────
    const now = Date.now();
    const windowStart = new Date(now - 340 * 24 * 60 * 60 * 1000).toISOString(); // oldest eligible
    const windowEnd = new Date(now - 330 * 24 * 60 * 60 * 1000).toISOString();   // newest eligible

    const { data: orders, error } = await supabase
      .from("orders")
      .select("id, email, first_name, last_name, patient_notification_sent_at, email_log, plan_type")
      .eq("status", "completed")
      .not("patient_notification_sent_at", "is", null)
      .gte("patient_notification_sent_at", windowStart)
      .lte("patient_notification_sent_at", windowEnd)
      .limit(limit);

    if (error) throw new Error(`DB query error: ${error.message}`);

    const eligible = (orders ?? []) as Order[];

    // ── Dry run short-circuit ───────────────────────────────────────────────
    if (dryRun) {
      return new Response(JSON.stringify({
        ok: true,
        dry_run: true,
        processed: eligible.length,
        sent: 0,
        skipped: 0,
        errors: 0,
        eligible: eligible.map((o) => ({
          id: o.id,
          email: o.email,
          first_name: o.first_name,
          patient_notification_sent_at: o.patient_notification_sent_at,
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (eligible.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        dry_run: false,
        processed: 0, sent: 0, skipped: 0, errors: 0,
        message: "No renewal reminders to send",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let processed = 0;
    let sent = 0;
    let skipped = 0;
    let errors = 0;
    const results: { email: string; status: string; error?: string }[] = [];

    for (const order of eligible) {
      // Soft time guard — stop processing if close to edge function timeout.
      if (Date.now() - startedAt > SOFT_TIME_BUDGET_MS) {
        console.warn(`[send-renewal-reminders] time budget exceeded, stopping after ${processed} of ${eligible.length}`);
        break;
      }
      if (processed >= limit) break;

      processed++;

      try {
        if (!order.email) {
          skipped++;
          continue;
        }

        // ── Compute email content before reservation ────────────────────────
        const letterSentDate = new Date(order.patient_notification_sent_at);
        const expiryDate = new Date(letterSentDate.getTime() + 365 * 24 * 60 * 60 * 1000);
        const daysLeft = Math.max(0, Math.round((expiryDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
        const formattedExpiry = expiryDate.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
        const displayName = order.first_name?.trim() || "there";
        const subject = `Your ESA Letter Expires in ${daysLeft} Days — Renew Now`;
        const html = buildRenewalReminderEmail(displayName, formattedExpiry, daysLeft);

        // ── Phase 1: reserve dedupe_key (atomic, DB-level block) ────────────
        const dedupeKey = `${order.id}:${RENEWAL_SLUG}`;
        const reservation = await reserveEmailSend({
          supabase,
          orderId: order.id,
          to: order.email,
          from: FROM_EMAIL,
          subject,
          slug: RENEWAL_SLUG,
          dedupeKey,
          templateSource: "hardcoded",
          sentBy: "cron:send-renewal-reminders",
        });

        if (!reservation.proceed) {
          skipped++;
          results.push({ email: order.email, status: "skipped_duplicate" });
          continue;
        }

        // ── Phase 2: send via Resend ────────────────────────────────────────
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_EMAIL, to: [order.email], subject, html }),
        });

        const emailResult = await emailRes.json() as { id?: string; error?: string | Record<string, unknown> };
        const sendOk = emailRes.ok && !emailResult.error;
        const errMsg = !sendOk
          ? (typeof emailResult.error === "string" ? emailResult.error : JSON.stringify(emailResult.error ?? `Resend ${emailRes.status}`))
          : null;

        // ── Phase 3: finalize communications row ───────────────────────────
        await finalizeEmailSend(supabase, reservation.rowId, {
          success: sendOk,
          body: sendOk ? `[renewal_30day] ${subject}` : null,
          resendId: emailResult.id ?? null,
          errorMessage: errMsg,
        });

        if (!sendOk) throw new Error(errMsg ?? "Resend send failed");

        // ── Back-compat: append to orders.email_log ────────────────────────
        const emailLog = (order.email_log as Array<Record<string, unknown>>) ?? [];
        const newLogEntry = {
          type: "renewal_reminder_30day",
          sentAt: new Date().toISOString(),
          to: order.email,
          daysLeft,
          expiryDate: expiryDate.toISOString(),
          messageId: emailResult.id,
          success: true,
        };
        await supabase.from("orders").update({ email_log: [...emailLog, newLogEntry] }).eq("id", order.id);

        sent++;
        results.push({ email: order.email, status: "sent" });
      } catch (err: unknown) {
        errors++;
        const msg = err instanceof Error ? err.message : "Unknown error";
        console.error(`[send-renewal-reminders] order=${order.id} failed:`, msg);
        results.push({ email: order.email, status: "failed", error: msg });
        // continue loop — never fail the whole batch on one order
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      dry_run: false,
      processed,
      sent,
      skipped,
      errors,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[send-renewal-reminders] fatal:", message);
    return new Response(JSON.stringify({ ok: false, error: message, processed: 0, sent: 0, skipped: 0, errors: 1 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
