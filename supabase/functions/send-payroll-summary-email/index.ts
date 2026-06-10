import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Monthly Payroll Summary email ──────────────────────────────────────────
// Internal OWNER/ADMIN notification only. Sends a branded summary of the
// estimated monthly salary for ACTIVE NON-OWNER employees for one closed month.
//
// Hard rules (mirrors the Accounts salary basis):
//   • Uses the SAME source as the Accounts salary estimate: the security-definer
//     RPC get_salary_expense_detail(p_from, p_to), called AS THE ADMIN (their JWT)
//     so owner exclusion + auth are identical to the panel.
//   • Owner / co-owner compensation (Hamza, Omer) is EXCLUDED upstream by the RPC
//     (included = false). We only include rows where included = true.
//   • This NEVER moves money, never triggers payroll/processing. Report only.
//   • Recipients are FIXED (no arbitrary recipient editing).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const COMPANY_DOMAIN = "pawtenant.com";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;

// Fixed payroll-notification recipients (owners). NOT user-editable.
const PAYROLL_RECIPIENTS = ["eservices.dm@gmail.com", "omer_kam@yahoo.com"];
const DEFAULT_FX = 280; // PKR per USD — Accounts default

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fmtPkr(n: number): string {
  return `PKR ${Math.round(n).toLocaleString("en-US")}`;
}
function fmtUsd(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sendViaResend(opts: {
  to: string[];
  subject: string;
  html: string;
  tags?: Array<{ name: string; value: string }>;
}): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.error("[send-payroll-summary-email] RESEND_API_KEY secret is not set");
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_ADDRESS, to: opts.to, subject: opts.subject, html: opts.html, tags: opts.tags }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[send-payroll-summary-email] Resend error ${res.status}: ${errBody}`);
      return { ok: false, error: `Resend ${res.status}: ${errBody}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[send-payroll-summary-email] Resend fetch error:", err);
    return { ok: false, error: String(err) };
  }
}

// One employee row in the payroll summary (active, non-owner, included).
interface PayrollRow {
  name: string;
  code: string | null;
  title: string | null;
  baseSalaryPkr: number;   // base monthly salary
  includedPkr: number;     // amount payable for the month (prorated − late deductions)
  prorated: boolean;
  lateDays: number;        // half-day-late instances in the period (30-min grace policy)
  deductionPkr: number;    // automatic half-day late deduction total
}

function buildPayrollEmail(opts: {
  periodLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  fxRate: number;
  rows: PayrollRow[];
  totalPkr: number;
  totalUsd: number;
}): string {
  const { periodLabel, periodStart, periodEnd, generatedAt, fxRate, rows, totalPkr, totalUsd } = opts;

  const employeeRows = rows.length === 0
    ? `<tr><td colspan="5" style="padding:18px 16px;text-align:center;font-size:13px;color:#9CA3AF;">No eligible active non-owner employees found for this period.</td></tr>`
    : rows.map((r) => `
      <tr>
        <td style="padding:11px 16px;border-bottom:1px solid #E5E7EB;font-size:13px;color:#111827;font-weight:600;">
          ${escapeHtml(r.name)}${r.code ? `<span style="color:#9CA3AF;font-weight:400;"> · ${escapeHtml(r.code)}</span>` : ""}
          ${r.title ? `<div style="font-size:11px;color:#6B7280;font-weight:400;">${escapeHtml(r.title)}</div>` : ""}
        </td>
        <td style="padding:11px 16px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:right;color:#374151;">${fmtPkr(r.baseSalaryPkr)}</td>
        <td style="padding:11px 16px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:right;color:${r.deductionPkr > 0 ? "#BE123C" : "#9CA3AF"};">${r.deductionPkr > 0 ? `−${fmtPkr(r.deductionPkr)}<div style="font-size:10px;color:#BE123C;font-weight:600;">${r.lateDays} half-day late</div>` : "—"}</td>
        <td style="padding:11px 16px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:right;color:#111827;font-weight:700;">${fmtPkr(r.includedPkr)}${r.prorated ? `<div style="font-size:10px;color:#92400E;font-weight:600;">prorated</div>` : ""}</td>
        <td style="padding:11px 16px;border-bottom:1px solid #E5E7EB;font-size:13px;text-align:right;color:#1a5c4f;">${fmtUsd(fxRate > 0 ? r.includedPkr / fxRate : 0)}</td>
      </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<body style="margin:0;background:#F3F4F6;font-family:Arial,sans-serif;">
<table width="100%" style="padding:24px;">
<tr><td align="center">
<table width="700" style="background:#fff;border-radius:20px;border:1px solid #E5E7EB;overflow:hidden;">
<tr>
<td style="padding:30px;background:#F7F7F8;text-align:center;border-bottom:1px solid #E5E7EB;">
  <img src="${LOGO_URL}" width="200" style="margin-bottom:16px;" alt="${COMPANY_NAME}" />
  <div style="background:#E0ECFF;color:#1E3A8A;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:bold;display:inline-block;margin-bottom:12px;">
    INTERNAL — Owner/Admin Payroll Summary
  </div>
  <h2 style="margin:10px 0 6px;font-size:22px;color:#111827;">Monthly Payroll Summary — ${escapeHtml(periodLabel)}</h2>
  <p style="color:#6B7280;margin:0;font-size:14px;">Period ${escapeHtml(periodStart)} to ${escapeHtml(periodEnd)} &nbsp;|&nbsp; Generated ${escapeHtml(generatedAt)}</p>
</td>
</tr>
<tr>
<td style="padding:24px 30px 0;">
  <div style="display:flex;gap:16px;flex-wrap:wrap;">
    <div style="flex:1;min-width:150px;background:#EFF6FF;border:1px solid #BFDBFE;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#1E40AF;">Employees</p>
      <p style="margin:0;font-size:26px;font-weight:900;color:#1E40AF;">${rows.length}</p>
    </div>
    <div style="flex:1;min-width:150px;background:#ECFDF5;border:1px solid #6EE7B7;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#065F46;">Total Payroll (PKR)</p>
      <p style="margin:0;font-size:24px;font-weight:900;color:#065F46;">${fmtPkr(totalPkr)}</p>
    </div>
    <div style="flex:1;min-width:150px;background:#F3F4F6;border:1px solid #E5E7EB;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#374151;">Total (USD est. @ ${fxRate})</p>
      <p style="margin:0;font-size:24px;font-weight:900;color:#374151;">${fmtUsd(totalUsd)}</p>
    </div>
  </div>
</td>
</tr>
<tr>
<td style="padding:24px 30px;">
  <p style="margin:0 0 12px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#374151;">Active Non-Owner Employees</p>
  <table width="100%" style="border-collapse:collapse;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;">
    <thead>
      <tr style="background:#F9FAFB;">
        <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">Employee</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">Base / mo (PKR)</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">Late Ded. (PKR)</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">This Month (PKR)</th>
        <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#6B7280;border-bottom:1px solid #E5E7EB;">USD est.</th>
      </tr>
    </thead>
    <tbody>${employeeRows}</tbody>
    <tfoot>
      <tr style="background:#F9FAFB;">
        <td colspan="3" style="padding:12px 16px;font-size:14px;font-weight:700;color:#111827;border-top:2px solid #E5E7EB;">Total Payroll</td>
        <td style="padding:12px 16px;text-align:right;font-size:15px;font-weight:900;color:#065F46;border-top:2px solid #E5E7EB;">${fmtPkr(totalPkr)}</td>
        <td style="padding:12px 16px;text-align:right;font-size:14px;font-weight:900;color:#1a5c4f;border-top:2px solid #E5E7EB;">${fmtUsd(totalUsd)}</td>
      </tr>
    </tfoot>
  </table>
</td>
</tr>
<tr>
<td style="padding:0 30px 24px;">
  <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;padding:14px 18px;">
    <p style="margin:0;font-size:12px;color:#92400E;line-height:1.5;">
      Owner/co-owner compensation is excluded. This is an internal payroll summary notification, not a payment confirmation.
      USD figures are estimates at ${fxRate} PKR/USD. No payment has been processed.
      Late deductions: half a day's salary (base ÷ Mon–Fri working days ÷ 2) per day where the first clock-in was 30+ minutes
      after shift start. Policy active from 2026-06-08 — earlier attendance is never deducted.
    </p>
  </div>
</td>
</tr>
<tr>
<td style="padding:20px;background:#F9FAFB;text-align:center;border-top:1px solid #E5E7EB;">
  <p style="font-size:12px;color:#9CA3AF;margin:0;">${COMPANY_NAME} &bull; Internal Payroll Notification &bull; ${escapeHtml(generatedAt)}</p>
  <p style="font-size:12px;color:#9CA3AF;margin:4px 0 0;"><a href="https://${COMPANY_DOMAIN}/admin-orders" style="color:#3b6ea5;text-decoration:none;">Open Accounts</a> &nbsp;|&nbsp; ${SUPPORT_EMAIL}</p>
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
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? serviceKey;
  const admin = createClient(supabaseUrl, serviceKey);

  // ── Auth: admin / owner / admin_manager / finance only ────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token || token === anonKey) return json({ error: "Unauthorized" }, 401);

  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return json({ error: "Unauthorized" }, 401);
  const { data: profile } = await admin
    .from("doctor_profiles")
    .select("is_admin, role")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAuthorized = profile?.is_admin === true ||
    ["owner", "admin_manager", "finance"].includes(profile?.role ?? "");
  if (!isAuthorized) return json({ error: "Unauthorized" }, 403);

  // ── Input ─────────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as {
    period_start?: string; period_end?: string; period_label?: string;
    fx_rate?: number; dryRun?: boolean;
  };
  const periodStart = body.period_start;
  const periodEnd = body.period_end;
  if (!periodStart || !periodEnd) return json({ error: "period_start and period_end are required (YYYY-MM-DD)" }, 400);
  const periodLabel = body.period_label || periodStart;
  const fxRate = typeof body.fx_rate === "number" && body.fx_rate > 0 ? body.fx_rate : DEFAULT_FX;
  const dryRun = body.dryRun === true;

  // ── Salary detail — SAME RPC + auth as the Accounts panel (owners excluded) ─
  // Called as the admin user (their JWT) so the RPC's auth.uid() admin check and
  // owner-exclusion logic apply identically.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: detail, error: detailErr } = await userClient.rpc("get_salary_expense_detail", {
    p_from: periodStart, p_to: periodEnd,
  });
  if (detailErr) return json({ error: `Failed to load salary detail: ${detailErr.message}` }, 500);

  interface DetailRow {
    team_member_id: string; display_name: string | null; employee_code: string | null;
    base_salary: number; salary_currency: string; prorated_amount: number;
    included: boolean; exclude_reason: string | null;
    // Half-day late deduction fields (30-min grace policy from 2026-06-08).
    working_days?: number; half_day_late_days?: number;
    late_deduction_amount?: number; payable_amount?: number;
  }
  const included = ((detail ?? []) as DetailRow[]).filter((r) => r.included === true);

  // Enrich with title (RPC does not return it). Service-role read is safe — owners
  // are already filtered out above, so no owner data is exposed.
  const titleById: Record<string, string | null> = {};
  if (included.length > 0) {
    const ids = included.map((r) => r.team_member_id);
    const { data: tms } = await admin.from("team_members").select("id, title").in("id", ids);
    for (const t of (tms ?? []) as { id: string; title: string | null }[]) titleById[t.id] = t.title;
  }

  // PKR is the salary storage currency (Accounts converts PKR→USD at fxRate).
  const rows: PayrollRow[] = included.map((r) => {
    const base = Number(r.base_salary) || 0;
    const prorated = Number(r.prorated_amount) || 0;
    const deduction = Number(r.late_deduction_amount) || 0;
    // Payable = prorated − automatic half-day late deductions (RPC-computed).
    const incl = Number(r.payable_amount ?? (prorated - deduction)) || 0;
    return {
      name: r.display_name ?? "Unknown",
      code: r.employee_code ?? null,
      title: titleById[r.team_member_id] ?? null,
      baseSalaryPkr: base,
      includedPkr: incl,
      // Prorated when the prorated amount differs from a flat month's base by >0.5 PKR.
      prorated: Math.abs(prorated - base) > 0.5,
      lateDays: Number(r.half_day_late_days) || 0,
      deductionPkr: deduction,
    };
  });

  const totalPkr = rows.reduce((s, r) => s + r.includedPkr, 0);
  const totalUsd = fxRate > 0 ? totalPkr / fxRate : 0;

  const now = new Date();
  const generatedAt = now.toLocaleString("en-US", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });

  const subject = `${COMPANY_NAME} Payroll Summary — ${periodLabel}`;
  const html = buildPayrollEmail({
    periodLabel, periodStart, periodEnd, generatedAt, fxRate, rows, totalPkr, totalUsd,
  });

  const summaryPayload = {
    periodLabel, periodStart, periodEnd, fxRate,
    employeeCount: rows.length,
    totalPkr: Math.round(totalPkr),
    totalUsd: Number(totalUsd.toFixed(2)),
    recipients: PAYROLL_RECIPIENTS,
    employees: rows.map((r) => ({
      name: r.name, code: r.code, title: r.title,
      baseSalaryPkr: r.baseSalaryPkr, includedPkr: r.includedPkr,
      usd: Number((fxRate > 0 ? r.includedPkr / fxRate : 0).toFixed(2)),
      prorated: r.prorated,
      halfDayLateDays: r.lateDays, lateDeductionPkr: r.deductionPkr,
    })),
  };

  // ── Dry run: compute + return, deliver nothing ────────────────────────────
  if (dryRun) {
    await admin.from("payroll_email_log").insert({
      period_start: periodStart, period_end: periodEnd, period_label: periodLabel,
      recipient_emails: PAYROLL_RECIPIENTS, employee_count: rows.length,
      total_pkr: Math.round(totalPkr), total_usd: Number(totalUsd.toFixed(2)),
      fx_rate: fxRate, status: "dry_run", sent_by: user.id,
    });
    return json({
      ok: true, dryRun: true,
      message: `DRY RUN — payroll summary for ${periodLabel} computed (${rows.length} employee${rows.length !== 1 ? "s" : ""}, ${fmtPkr(totalPkr)} / ${fmtUsd(totalUsd)}). No email sent.`,
      ...summaryPayload,
    });
  }

  // ── Send ──────────────────────────────────────────────────────────────────
  const sendRes = await sendViaResend({
    to: PAYROLL_RECIPIENTS,
    subject,
    html,
    tags: [{ name: "email_type", value: "payroll_summary" }],
  });

  await admin.from("payroll_email_log").insert({
    period_start: periodStart, period_end: periodEnd, period_label: periodLabel,
    recipient_emails: PAYROLL_RECIPIENTS, employee_count: rows.length,
    total_pkr: Math.round(totalPkr), total_usd: Number(totalUsd.toFixed(2)),
    fx_rate: fxRate, status: sendRes.ok ? "sent" : "failed",
    error: sendRes.ok ? null : (sendRes.error ?? "unknown"), sent_by: user.id,
  });

  if (!sendRes.ok) return json({ ok: false, error: sendRes.error ?? "Email send failed", ...summaryPayload }, 502);

  return json({
    ok: true,
    message: `Payroll summary for ${periodLabel} sent to ${PAYROLL_RECIPIENTS.length} recipients.`,
    sentAt: now.toISOString(),
    ...summaryPayload,
  });
});
