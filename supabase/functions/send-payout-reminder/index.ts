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
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

async function sendViaResend(opts: {
  to: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string; content_type: string }>;
  tags?: Array<{ name: string; value: string }>;
}): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[send-payout-reminder] RESEND_API_KEY secret is not set");
    return false;
  }
  try {
    const body: Record<string, unknown> = {
      from: FROM_ADDRESS,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
    };
    if (opts.attachments?.length) body.attachments = opts.attachments;
    if (opts.tags?.length) body.tags = opts.tags;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

function escapeCsv(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface EarningRow {
  id: string;
  doctor_user_id: string;
  doctor_name: string | null;
  doctor_email: string | null;
  order_id: string | null;
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
}

function buildCsv(summaries: DoctorSummary[], triggerDate: string): string {
  const lines: string[] = [];
  lines.push(`Provider Payout Report — ${triggerDate}`);
  lines.push("");
  lines.push(["Provider Name", "Provider Email", "Order ID", "Patient Name", "State", "Order Date", "Amount Due"].join(","));

  for (const s of summaries) {
    for (const o of s.pendingOrders) {
      lines.push([
        escapeCsv(s.doctorName),
        escapeCsv(s.doctorEmail),
        escapeCsv(o.confirmation_id),
        escapeCsv(o.patient_name),
        escapeCsv(o.patient_state),
        escapeCsv(new Date(o.created_at).toLocaleDateString("en-US")),
        escapeCsv(o.doctor_amount != null ? formatCurrency(o.doctor_amount) : "Not set"),
      ].join(","));
    }
    lines.push([
      escapeCsv(`SUBTOTAL — ${s.doctorName}`),
      "", "", "", "", "",
      escapeCsv(formatCurrency(s.totalUnpaid)),
    ].join(","));
    lines.push("");
  }

  const grandTotal = summaries.reduce((a, s) => a + s.totalUnpaid, 0);
  lines.push(["GRAND TOTAL", "", "", "", "", "", escapeCsv(formatCurrency(grandTotal))].join(","));

  return lines.join("\n");
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
          <span style="color:#6B7280;">&#8627;</span> ${escapeHtml(o.confirmation_id ?? "—")} — ${escapeHtml(o.patient_name ?? "Unknown")} (${escapeHtml(o.patient_state ?? "—")})
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
    ACTION REQUIRED — Provider Payout Due
  </div>
  <h2 style="margin:10px 0 6px;font-size:22px;color:#111827;">Provider Payout Summary</h2>
  <p style="color:#6B7280;margin:0;font-size:14px;">Generated on ${escapeHtml(triggerDate)} &nbsp;|&nbsp; Please process payments at your earliest convenience.</p>
</td>
</tr>
<tr>
<td style="padding:24px 30px 0;">
  <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px 18px;margin-bottom:20px;">
    <p style="margin:0;font-size:13px;color:#991B1B;font-weight:600;">
      &#9888; This is your bi-monthly payout reminder. The providers listed below have completed orders with unpaid earnings. Please log in to the admin panel and process their payments.
    </p>
  </div>
  <div style="display:flex;gap:16px;flex-wrap:wrap;">
    <div style="flex:1;min-width:160px;background:#FEF3C7;border:1px solid #FDE68A;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#92400E;">Providers Owed</p>
      <p style="margin:0;font-size:26px;font-weight:900;color:#92400E;">${summaries.length}</p>
    </div>
    <div style="flex:1;min-width:160px;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#065F46;">Total to Pay Out</p>
      <p style="margin:0;font-size:26px;font-weight:900;color:#065F46;">${formatCurrency(totalUnpaid)}</p>
    </div>
    <div style="flex:1;min-width:160px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#374151;">Completed Orders</p>
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
  <p style="margin:12px 0 0;font-size:12px;color:#9CA3AF;">A detailed CSV breakdown is attached to this email for your records.</p>
</td>
</tr>
<tr>
<td style="padding:0 30px 24px;">
  <div style="text-align:center;">
    <a href="https://${COMPANY_DOMAIN}/admin-orders" style="display:inline-block;background:#1a5c4f;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;">
      Open Admin Earnings Panel &#8594;
    </a>
  </div>
</td>
</tr>
<tr>
<td style="padding:20px;background:#F9FAFB;text-align:center;border-top:1px solid #E5E7EB;">
  <p style="font-size:12px;color:#9CA3AF;margin:0;">${COMPANY_NAME} &bull; Automated Payout Reminder (12th &amp; 27th of each month) &bull; ${triggerDate}</p>
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const supabase = createClient(supabaseUrl, serviceKey);

  // Environment label for logs/responses (LIVE vs TEST) — derived from project ref.
  const ENV_LABEL = Deno.env.get("ENVIRONMENT")
    ?? (supabaseUrl.includes("cvwbozlbbmrjxznknouq") ? "LIVE"
      : supabaseUrl.includes("opudhofjbydrljgleofq") ? "TEST"
      : "UNKNOWN");

  // ── Auth check — supports cron secret, service key AND OTP-based admin logins ──
  let isAuthorized = false;

  // Cron auth path (rotation-proof): pg_cron sends a shared secret via the
  // x-cron-secret header. This survives Supabase API-key rotation, which broke
  // the old "service-role key from Vault" match and caused every scheduled run
  // to return 401 (so no LIVE payout reminder was ever delivered). Mirrors the
  // lead-followup-sequence scheduler. Falls back to the existing shared secret
  // when a dedicated PAYOUT_CRON_SECRET has not been provisioned.
  const cronSecret = Deno.env.get("PAYOUT_CRON_SECRET")
    ?? Deno.env.get("LEAD_FOLLOWUP_CRON_SECRET") ?? "";
  const providedCronSecret = req.headers.get("x-cron-secret") ?? "";
  if (cronSecret && providedCronSecret === cronSecret) {
    isAuthorized = true;
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (isAuthorized) {
    // already authorized via cron secret
  } else if (token === serviceKey) {
    isAuthorized = true;
  } else if (token) {
    // Try Supabase Auth session (works for both Supabase Auth and OTP logins
    // as long as the token is a valid user JWT)
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      const { data: profile } = await supabase
        .from("doctor_profiles")
        .select("is_admin, role")
        .eq("user_id", user.id)
        .maybeSingle();
      isAuthorized = profile?.is_admin === true ||
        ["owner", "admin_manager"].includes(profile?.role ?? "");
    }
  }

  if (!isAuthorized) return json({ error: "Unauthorized" }, 401);

  // ── Date gate: only run on 12th or 27th (unless forced) ─────────────────
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const force = body?.force === true;
  // dryRun = compute + return the breakdown WITHOUT sending any email or GHL webhook.
  // Safe manual test path: nothing is delivered to any recipient.
  const dryRun = body?.dryRun === true;
  const today = new Date();
  const dayOfMonth = today.getDate();

  if (!force && dayOfMonth !== 12 && dayOfMonth !== 27) {
    return json({
      ok: false,
      skipped: true,
      message: `Payout reminders only send on the 12th and 27th. Today is the ${dayOfMonth}th. Pass { force: true } to override.`,
    });
  }

  // ── Fetch pending earnings, real providers & completed (eligible) orders ──
  // Payout eligibility (single source of truth, mirrors the admin Earnings panel):
  //   • status = pending AND a payout amount is set
  //   • belongs to a REAL provider (doctor_profiles.is_admin = false AND role = 'provider')
  //     → never employees / admins / owner / support / Company OS users
  //   • the order is COMPLETED (doctor_status = 'patient_notified') — never under-review
  //   • the order is NOT legacy/imported (source_system <> 'wordpress_legacy', historical_import <> true)
  //   • manual earnings with no order link are kept (admin-entered payouts for real providers)
  const [earningsRes, providersRes, completedOrdersRes] = await Promise.all([
    supabase
      .from("doctor_earnings")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("doctor_profiles")
      .select("user_id")
      .eq("is_admin", false)
      .eq("role", "provider"),
    supabase
      .from("orders")
      .select("id, confirmation_id, source_system, historical_import")
      .eq("doctor_status", "patient_notified"),
  ]);

  if (earningsRes.error) return json({ error: `Failed to fetch earnings: ${earningsRes.error.message}` }, 500);

  const allPending = (earningsRes.data as EarningRow[]) ?? [];
  const realProviderIds = new Set(((providersRes.data ?? []) as { user_id: string }[]).map((p) => p.user_id));

  type OrderRef = { id: string; confirmation_id: string | null; source_system: string | null; historical_import: boolean | null };
  const completedRows = ((completedOrdersRes.data ?? []) as OrderRef[])
    .filter((o) => o.source_system !== "wordpress_legacy" && o.historical_import !== true);
  const completedOrderIds = new Set(completedRows.map((o) => o.id));
  const completedConfirmIds = new Set(completedRows.map((o) => o.confirmation_id).filter(Boolean) as string[]);

  const earnings = allPending.filter((e) => {
    if (e.doctor_amount == null) return false;
    if (!realProviderIds.has(e.doctor_user_id)) return false;
    if (!e.order_id && !e.confirmation_id) return true; // manual payout entry for a real provider
    if (e.order_id && completedOrderIds.has(e.order_id)) return true;
    if (e.confirmation_id && completedConfirmIds.has(e.confirmation_id)) return true;
    return false;
  });

  if (earnings.length === 0) {
    return json({ ok: true, message: "No eligible pending payouts — nothing to remind about", count: 0 });
  }

  // ── Build per-doctor summaries ───────────────────────────────────────────
  const doctorMap = new Map<string, DoctorSummary>();
  for (const row of earnings) {
    const key = row.doctor_user_id;
    if (!doctorMap.has(key)) {
      doctorMap.set(key, {
        doctorName: row.doctor_name ?? "Unknown",
        doctorEmail: row.doctor_email ?? "",
        pendingOrders: [],
        totalUnpaid: 0,
      });
    }
    const entry = doctorMap.get(key)!;
    entry.pendingOrders.push(row);
    entry.totalUnpaid += row.doctor_amount ?? 0;
  }

  const summaries = Array.from(doctorMap.values()).sort((a, b) => b.totalUnpaid - a.totalUnpaid);
  const grandTotal = summaries.reduce((sum, s) => sum + s.totalUnpaid, 0);

  const triggerDate = today.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // ── Determine recipient emails (matches get-admin-notif-recipients resolver) ──
  // The admin Settings → Communications UI saves per-notification recipients into
  // `per_notif_emails` and deliberately clears `email_override`. The old code only
  // read `group_emails` + `email_override`, so the configured recipients were never
  // seen and the reminder silently fell back to a hardcoded inbox. Read
  // `per_notif_emails` FIRST (then group, then override), honor the enabled toggle,
  // and DO NOT send if nothing is configured.
  const { data: prefRow } = await supabase
    .from("admin_notification_prefs")
    .select("enabled, email_override, group_emails, per_notif_emails")
    .eq("notification_key", "payout_reminder")
    .maybeSingle();

  // Honor the on/off toggle from Settings → Communications.
  if (prefRow && prefRow.enabled === false) {
    return json({
      ok: true,
      skipped: true,
      environment: ENV_LABEL,
      message: "Provider Payout Reminder is disabled in admin settings — not sending.",
    });
  }

  const recipientEmails: Set<string> = new Set();
  const addEmail = (e: unknown) => {
    if (e && typeof e === "string" && e.includes("@")) recipientEmails.add(e.toLowerCase().trim());
  };
  if (Array.isArray(prefRow?.per_notif_emails)) prefRow!.per_notif_emails.forEach(addEmail);
  if (recipientEmails.size === 0 && Array.isArray(prefRow?.group_emails)) prefRow!.group_emails.forEach(addEmail);
  if (recipientEmails.size === 0) addEmail(prefRow?.email_override);

  // No recipients configured → do not send (no silent fallback to a hardcoded inbox).
  if (recipientEmails.size === 0) {
    return json({
      ok: true,
      skipped: true,
      environment: ENV_LABEL,
      message: "No payout reminder recipients configured in admin settings — not sending.",
    });
  }

  const toList = Array.from(recipientEmails);

  console.log(`[send-payout-reminder] env=${ENV_LABEL} day=${dayOfMonth} force=${force} dryRun=${dryRun} recipients=${toList.length} providers=${summaries.length} orders=${earnings.length} total=${formatCurrency(grandTotal)}`);

  // ── Build email + CSV ────────────────────────────────────────────────────
  const htmlEmail = buildPayoutReminderEmail(summaries, grandTotal, triggerDate);
  const csvContent = buildCsv(summaries, triggerDate);
  const csvBase64 = btoa(unescape(encodeURIComponent(csvContent)));
  const csvFilename = `payout-report-${today.toISOString().slice(0, 10)}.csv`;

  // ── Dry run: return the computed breakdown without delivering anything ────
  if (dryRun) {
    return json({
      ok: true,
      dryRun: true,
      environment: ENV_LABEL,
      message: `DRY RUN — would notify ${toList.length} recipient${toList.length !== 1 ? "s" : ""} about ${summaries.length} provider${summaries.length !== 1 ? "s" : ""} (${formatCurrency(grandTotal)}). No email or webhook sent.`,
      totalUnpaid: grandTotal,
      providersCount: summaries.length,
      pendingOrdersCount: earnings.length,
      wouldSendTo: toList,
      providers: summaries.map((s) => ({
        name: s.doctorName,
        email: s.doctorEmail,
        ordersCount: s.pendingOrders.length,
        amountDue: s.totalUnpaid,
      })),
    });
  }

  const emailSent = await sendViaResend({
    to: toList,
    subject: `[Action Required] Provider Payout Due — ${today.toLocaleDateString("en-US", { month: "long", year: "numeric" })} — ${formatCurrency(grandTotal)} Owed`,
    html: htmlEmail,
    attachments: [{ filename: csvFilename, content: csvBase64, content_type: "text/csv" }],
    tags: [{ name: "email_type", value: "payout_reminder" }],
  });

  // ── GHL webhook (fire-and-forget) ────────────────────────────────────────
  fetch(`${supabaseUrl}/functions/v1/ghl-webhook-proxy`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
    body: JSON.stringify({
      webhookType: "main",
      event: "admin_payout_reminder",
      triggerDate,
      totalUnpaid: grandTotal,
      providersCount: summaries.length,
      pendingOrdersCount: earnings.length,
      providers: summaries.map((s) => ({
        name: s.doctorName,
        email: s.doctorEmail,
        ordersCount: s.pendingOrders.length,
        amountDue: s.totalUnpaid,
      })),
      tags: ["Payout Reminder", "Admin Action Required"],
    }),
  }).catch(() => {});

  return json({
    ok: true,
    environment: ENV_LABEL,
    message: `Payout reminder sent to ${toList.length} recipient${toList.length !== 1 ? "s" : ""} for ${summaries.length} provider${summaries.length !== 1 ? "s" : ""}`,
    totalUnpaid: grandTotal,
    providersCount: summaries.length,
    pendingOrdersCount: earnings.length,
    emailSent,
    sentTo: toList,
    csvAttached: true,
  });
});
