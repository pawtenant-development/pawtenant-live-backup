import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const LOGO_URL = "https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png";
const PAYOUT_RECIPIENT = Deno.env.get("ADMIN_EMAIL") ?? "hello@pawtenant.com";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

// ── Resend helper ──────────────────────────────────────────────────────────

async function sendViaResend(opts: {
  to: string;
  subject: string;
  html: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[send-payout-reminder] RESEND_API_KEY secret is not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [opts.to],
        subject: opts.subject,
        html: opts.html,
        ...(opts.tags ? { tags: opts.tags } : {}),
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[send-payout-reminder] Resend error ${res.status}: ${errBody}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[send-payout-reminder] Resend fetch error:", err);
    return false;
  }
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}

interface EarningRow {
  id: string;
  doctor_user_id: string;
  doctor_name: string | null;
  doctor_email: string | null;
  confirmation_id: string | null;
  patient_name: string | null;
  patient_state: string | null;
  doctor_amount: number | null;
  status: string;
  created_at: string;
}

interface DoctorSummary {
  doctorName: string;
  doctorEmail: string;
  pendingOrders: EarningRow[];
  totalUnpaid: number;
  perOrderRate: number | null;
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildPayoutReminderEmail(summaries: DoctorSummary[], totalUnpaid: number, triggerDate: string): string {
  const doctorRows = summaries.map((s) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-size:14px;color:#111827;font-weight:600;">${escapeHtml(s.doctorName)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#6B7280;">${escapeHtml(s.doctorEmail)}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:center;color:#374151;">${s.pendingOrders.length}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;font-size:14px;font-weight:700;text-align:right;color:#1a5c4f;">${formatCurrency(s.totalUnpaid)}</td>
    </tr>
    ${s.pendingOrders.map((o) => `
      <tr style="background:#FAFAFA;">
        <td colspan="2" style="padding:7px 16px 7px 30px;font-size:12px;color:#9CA3AF;">
          <span style="color:#6B7280;">↳</span> ${escapeHtml(o.confirmation_id ?? "—")} — ${escapeHtml(o.patient_name ?? "Unknown")} (${escapeHtml(o.patient_state ?? "—")})
        </td>
        <td style="padding:7px 16px;text-align:center;font-size:12px;color:#9CA3AF;">${new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
        <td style="padding:7px 16px;text-align:right;font-size:12px;color:#1a5c4f;font-weight:600;">${o.doctor_amount != null ? formatCurrency(o.doctor_amount) : "<span style='color:#f59e0b;'>Not set</span>"}</td>
      </tr>`).join("")}`).join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;background:#F3F4F6;font-family:Arial,sans-serif;">
<table width="100%" style="padding:24px;">
<tr><td align="center">
<table width="700" style="background:#fff;border-radius:20px;border:1px solid #E5E7EB;overflow:hidden;">
<tr>
<td style="padding:30px;background:#F7F7F8;text-align:center;border-bottom:1px solid #E5E7EB;">
  <img src="${LOGO_URL}" width="200" style="margin-bottom:16px;" alt="${COMPANY_NAME}" />
  <div style="background:#FFF3CD;color:#92400E;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:bold;display:inline-block;margin-bottom:12px;">
    Provider Payout Reminder
  </div>
  <h2 style="margin:10px 0 6px;font-size:22px;color:#111827;">Provider Payout Summary</h2>
  <p style="color:#6B7280;margin:0;font-size:14px;">Generated on ${escapeHtml(triggerDate)}</p>
</td>
</tr>
<tr>
<td style="padding:24px 30px 0;">
  <div style="display:flex;gap:16px;flex-wrap:wrap;">
    <div style="flex:1;min-width:160px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#92400E;">Providers Owed</p>
      <p style="margin:0;font-size:26px;font-weight:900;color:#92400E;">${summaries.length}</p>
    </div>
    <div style="flex:1;min-width:160px;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#065F46;">Total Unpaid</p>
      <p style="margin:0;font-size:26px;font-weight:900;color:#065F46;">${formatCurrency(totalUnpaid)}</p>
    </div>
    <div style="flex:1;min-width:160px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#374151;">Pending Orders</p>
      <p style="margin:0;font-size:26px;font-weight:900;color:#374151;">${summaries.reduce((a, s) => a + s.pendingOrders.length, 0)}</p>
    </div>
  </div>
</td>
</tr>
<tr>
<td style="padding:24px 30px;">
  <p style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#374151;">Breakdown by Provider</p>
  <table width="100%" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
    <thead>
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">Provider</th>
        <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">Email</th>
        <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">Orders</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">Amount Due</th>
      </tr>
    </thead>
    <tbody>${doctorRows}</tbody>
    <tfoot>
      <tr style="background:#F9FAFB;">
        <td colspan="3" style="padding:12px 16px;font-size:14px;font-weight:700;color:#111827;border-top:2px solid #E5E7EB;">Total to Pay Out</td>
        <td style="padding:12px 16px;text-align:right;font-size:16px;font-weight:900;color:#1a5c4f;border-top:2px solid #E5E7EB;">${formatCurrency(totalUnpaid)}</td>
      </tr>
    </tfoot>
  </table>
</td>
</tr>
<tr>
<td style="padding:0 30px 24px;">
  <div style="text-align:center;">
    <a href="https://${COMPANY_DOMAIN}/admin-orders" style="display:inline-block;background:#1a5c4f;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
      Open Admin Earnings Panel →
    </a>
  </div>
</td>
</tr>
<tr>
<td style="padding:20px;background:#F9FAFB;text-align:center;border-top:1px solid #E5E7EB;">
  <p style="font-size:12px;color:#9CA3AF;margin:0;">${COMPANY_NAME} • Automated Payout Reminder • ${triggerDate}</p>
  <p style="font-size:12px;color:#9CA3AF;margin:4px 0 0;">${SUPPORT_EMAIL}</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let isAuthorized = false;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");

  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    isAuthorized = true;
  } else if (token) {
    const { data: { user } } = await createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(token);
    if (user) {
      const { data: profile } = await supabase.from("doctor_profiles").select("is_admin").eq("user_id", user.id).maybeSingle();
      isAuthorized = profile?.is_admin === true;
    }
  }

  if (!isAuthorized) return json({ error: "Unauthorized" }, 401);

  const { data: pendingEarnings, error: earningsErr } = await supabase
    .from("doctor_earnings").select("*").eq("status", "pending").order("created_at", { ascending: true });

  if (earningsErr) return json({ error: `Failed to fetch earnings: ${earningsErr.message}` }, 500);

  const earnings = (pendingEarnings as EarningRow[]) ?? [];

  if (earnings.length === 0) {
    return json({ ok: true, message: "No pending payouts — nothing to remind about", count: 0 });
  }

  const doctorMap = new Map<string, DoctorSummary>();
  for (const rowItem of earnings) {
    const key = rowItem.doctor_user_id;
    if (!doctorMap.has(key)) {
      doctorMap.set(key, { doctorName: rowItem.doctor_name ?? "Unknown", doctorEmail: rowItem.doctor_email ?? "", pendingOrders: [], totalUnpaid: 0, perOrderRate: null });
    }
    const entry = doctorMap.get(key)!;
    entry.pendingOrders.push(rowItem);
    entry.totalUnpaid += rowItem.doctor_amount ?? 0;
  }

  const summaries = Array.from(doctorMap.values()).sort((a, b) => b.totalUnpaid - a.totalUnpaid);
  const grandTotal = summaries.reduce((sum, s) => sum + s.totalUnpaid, 0);

  const triggerDate = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const htmlEmail = buildPayoutReminderEmail(summaries, grandTotal, triggerDate);

  const emailSent = await sendViaResend({
    to: PAYOUT_RECIPIENT,
    subject: `[Action Required] Provider Payout Reminder — ${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} — ${formatCurrency(grandTotal)} Due`,
    html: htmlEmail,
    tags: [{ name: "email_type", value: "payout_reminder" }],
  });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      webhookType: "main", event: "provider_payout_reminder",
      triggerDate, totalUnpaid: grandTotal, providersCount: summaries.length,
      pendingOrdersCount: earnings.length,
      providers: summaries.map((s) => ({ name: s.doctorName, email: s.doctorEmail, ordersCount: s.pendingOrders.length, amountDue: s.totalUnpaid })),
      tags: ["Payout Reminder", "Provider Payments"],
    }),
  }).catch(() => {});

  return json({
    ok: true,
    message: `Payout reminder sent for ${summaries.length} provider${summaries.length !== 1 ? "s" : ""}`,
    totalUnpaid: grandTotal, providersCount: summaries.length,
    pendingOrdersCount: earnings.length, emailSent, sentTo: PAYOUT_RECIPIENT,
  });
});
