import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildWorkbook } from "./workbook.ts";
import {
  BUSINESS_TIMEZONE,
  businessParts,
  businessMonth,
  previousBusinessMonth,
  isBusinessPeriodComplete,
  type BusinessPeriod,
} from "../_shared/businessTime.ts";

// send-monthly-business-report — v2, on the CANONICAL month-end payload.
// ---------------------------------------------------------------------------
// Emails a compact executive summary (HTML) with a styled .xlsx workbook to the
// active rows in monthly_report_recipients.
//
// MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001 — history
// ------------------------------------------------------------------
// v0 shipped only to TEST, wired to a TEST cron, pointed at the owner's real
// inbox, and emailed TEST figures as real performance for three months. It
// gated on the Asia/Karachi month-end and reported the CURRENT month, cutting
// off the final ~9 hours of every New York business month.
//
// The contract now
// ----------------
//   • ONE PAYLOAD. All figures come from public.get_monthly_business_report
//     (p_month), the canonical server-side payload. This function renders it;
//     it never recomputes a financial number. The payload's own reconciliation
//     block must pass or a real send is refused.
//   • Period = the PREVIOUS business month in America/New_York, and only once
//     it is genuinely over (isBusinessPeriodComplete).
//   • FAIL-CLOSED: assertSendable() must return no blockers. Wrong/unknown
//     environment, incomplete period, missing payload, failed reconciliation,
//     unavailable paid-media sync, QA fixtures in scope, or zero recipients
//     each block a real send. force overrides idempotency ONLY.
//   • dry_run NEVER sends and never reserves an idempotency row.
//
// Auth (mirrors send-payout-reminder): x-cron-secret OR service-role bearer OR
// an admin user JWT. Deployed with verify_jwt=false (custom auth below).

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const COMPANY_NAME = "PawTenant";
const SUPPORT_EMAIL = "hello@pawtenant.com";
const LOGO_URL = "https://pawtenant.com/assets/brand/pawtenant-logo-white-02.png";
const FROM_ADDRESS = `${COMPANY_NAME} <${SUPPORT_EMAIL}>`;
const REPORT_TYPE = "monthly_business";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function esc(v: unknown = ""): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
function usd(v: unknown): string {
  const n = num(v);
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}
function intf(v: unknown): string { return num(v).toLocaleString("en-US"); }
function pct(v: unknown): string { return v == null ? "—" : `${num(v)}%`; }

// ── Business-period helpers ──────────────────────────────────────────────────
interface ReportTarget {
  month: string;   // "YYYY-MM" — the canonical payload's ONLY period input
  start: string;   // "YYYY-MM-DD" inclusive, business timezone (run-log display)
  end: string;     // "YYYY-MM-DD" inclusive last day (run-log display)
  label: string;   // "July 2026"
  period: BusinessPeriod;
}

function toTarget(p: BusinessPeriod): ReportTarget {
  return { month: p.key, start: p.from, end: p.toInclusive, label: p.label, period: p };
}

function monthBounds(y: number, m0: number): ReportTarget {
  return toTarget(businessMonth(y, m0));
}

function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, "0")}`;
}

// ── Resend ───────────────────────────────────────────────────────────────────
async function sendViaResend(opts: {
  to: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string; content_type: string }>;
}): Promise<{ ok: boolean; id: string | null; error: string | null }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, id: null, error: "RESEND_API_KEY not set" };
  try {
    const body: Record<string, unknown> = { from: FROM_ADDRESS, to: opts.to, subject: opts.subject, html: opts.html };
    if (opts.attachments?.length) body.attachments = opts.attachments;
    body.tags = [{ name: "email_type", value: "monthly_business_report" }];
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, id: null, error: `Resend ${res.status}: ${txt}` };
    let id: string | null = null;
    try { id = JSON.parse(txt)?.id ?? null; } catch { /* ignore */ }
    return { ok: true, id, error: null };
  } catch (err) {
    return { ok: false, id: null, error: String(err) };
  }
}

// ── Environment identity ─────────────────────────────────────────────────────
// Resolved from the Supabase project ref in SUPABASE_URL — the one value that
// cannot be spoofed by a mislabelled env var. An unrecognised ref is UNKNOWN and
// is treated exactly like TEST: it does not send.
const LIVE_PROJECT_REF = "cvwbozlbbmrjxznknouq";
const TEST_PROJECT_REF = "opudhofjbydrljgleofq";

type EnvLabel = "LIVE" | "TEST" | "UNKNOWN";

function resolveEnvironment(supabaseUrl: string): EnvLabel {
  if (supabaseUrl.includes(LIVE_PROJECT_REF)) return "LIVE";
  if (supabaseUrl.includes(TEST_PROJECT_REF)) return "TEST";
  return "UNKNOWN";
}

// ── QA fixture markers ───────────────────────────────────────────────────────
// EXACT canonical markers only (kept in lockstep with the payload RPC's scan).
// Deliberately NOT a broad text match: a real customer named "Qatar Testa" or a
// genuine order whose notes mention "test" must never be excluded from the
// company's own financial reporting.
const QA_CONFIRMATION_RE = /^PT-LIVE-PENDINGQA-\d{2,4}$/;
const QA_EMAIL_TLD_RE = /@[^@\s]+\.test$/i;

export function isQaFixtureRow(row: { confirmation_id?: string | null; email?: string | null }): boolean {
  const cid = (row.confirmation_id ?? "").trim();
  const email = (row.email ?? "").trim();
  return (cid !== "" && QA_CONFIRMATION_RE.test(cid)) || (email !== "" && QA_EMAIL_TLD_RE.test(email));
}

// ── Fail-closed send gate ────────────────────────────────────────────────────
// Returns the reasons a REAL send must not happen. Empty array = sendable.
// Every condition blocks outright; none is a warning, and `force` bypasses
// none of them (force exists only to re-send a month whose idempotency row
// already exists).
export function assertSendable(input: {
  environment: EnvLabel;
  period: { endExclusiveMs: number };
  now: Date;
  report: Report | null;
  adSpendAvailable: boolean;
  reconciled: boolean;
  qaRowsInScope: number;
  recipients: string[];
}): string[] {
  const blockers: string[] = [];

  if (input.environment !== "LIVE") {
    blockers.push(
      `environment is ${input.environment}, not LIVE — a business report may only be sent from the production project. ` +
      `This is the exact failure that emailed three months of TEST figures as real performance.`,
    );
  }
  if (input.now.getTime() < input.period.endExclusiveMs) {
    blockers.push(
      `the reporting period has not ended in ${BUSINESS_TIMEZONE} — sending now would truncate the tail of its own window.`,
    );
  }
  if (!input.report || typeof input.report !== "object") {
    blockers.push("the canonical financial payload could not be loaded.");
  }
  if (!input.reconciled) {
    blockers.push(
      "the canonical payload failed its internal reconciliation checks — summary and detail do not agree to the cent.",
    );
  }
  if (!input.adSpendAvailable) {
    blockers.push(
      "paid-media spend is unavailable for this period — Operating Net would be overstated. " +
      "Missing data is not zero spend.",
    );
  }
  if (input.qaRowsInScope > 0) {
    blockers.push(`${input.qaRowsInScope} QA fixture row(s) fall inside the reporting period.`);
  }
  if (input.recipients.length === 0) {
    blockers.push("no active recipients resolved.");
  }
  return blockers;
}

// ── Report typing (loose) ────────────────────────────────────────────────────
type Report = Record<string, any>;

function deltaHtml(curr: number, prev: number): string {
  if (!prev) return curr ? `<span style="color:#059669;">▲ new</span>` : "—";
  const pctChange = ((curr - prev) / Math.abs(prev)) * 100;
  const up = pctChange >= 0;
  return `<span style="color:${up ? "#059669" : "#dc2626"};">${up ? "▲" : "▼"} ${Math.abs(pctChange).toFixed(1)}%</span>`;
}

// ── Owner insights (3–5 bullets, derived from the payload — no new math beyond
//     display-level comparisons of numbers the payload already contains) ──────
export function buildInsights(r: Report, prev: Report | null): string[] {
  const out: string[] = [];
  const pnl = r.pnl ?? {}, acq = r.acquisition ?? {}, g = acq.google_ads ?? {}, gb = g.backend ?? {};
  const channels: Report[] = acq.cross_channel ?? [];
  const topCh = channels[0];

  if (topCh && num(topCh.pct_revenue) > 0) {
    out.push(`${topCh.channel === "google_ads" ? "Google Ads" : topCh.channel} drove ${pct(topCh.pct_orders)} of paid orders and ${pct(topCh.pct_revenue)} of revenue (${usd(topCh.revenue)}).`);
  }
  if (g.connection === "synced" && gb.refund_adjusted_roas != null) {
    out.push(`Google Ads refund-adjusted ROAS was ${num(gb.refund_adjusted_roas)}x on ${usd(g.spend_usd)} spend (CPA ${usd(gb.cpa)}; ${intf(gb.refund_count)} refunds, ${usd(gb.refund_amount)}).`);
  } else if (g.connection !== "synced") {
    out.push(`Google Ads spend is ${String(g.connection).replace(/_/g, " ")} for this period — paid-media performance cannot be assessed until the sync completes.`);
  }
  if (prev?.pnl?.operating_net != null && pnl.operating_net != null) {
    const cur = num(pnl.operating_net), pv = num(prev.pnl.operating_net);
    const dir = cur >= pv ? "up" : "down";
    out.push(`Operating Net ${usd(cur)} is ${dir} from ${usd(pv)} last month (${!pv ? "n/a" : Math.abs(((cur - pv) / Math.abs(pv)) * 100).toFixed(1) + "%"}).`);
  }
  const refRate = num(r.operations?.refund_rate);
  if (refRate > 0) {
    out.push(`Refund rate ${refRate}% of paid orders (${intf(pnl.refund_count)} refunds, ${usd(pnl.refund_amount)}).`);
  }
  const unknown = num(acq.attribution_quality?.unknown_or_unattributed);
  if (unknown > 0) {
    out.push(`${intf(unknown)} paid order(s) have no attribution — channel shares understate the true source mix.`);
  }
  const org = r.organic_search?.backend_attribution;
  if (out.length < 5 && org && num(org.organic_orders) > 0) {
    out.push(`Organic search contributed ${intf(org.organic_orders)} paid orders (${usd(org.organic_revenue)}) with no media cost.`);
  }
  return out.slice(0, 5);
}

// ── HTML email — compact executive summary (§J) ─────────────────────────────
// Table-based layout (no flex — Gmail-safe), single column, max 620px.
// Nothing in here recomputes a financial number; every figure is read from the
// canonical payload verbatim and only FORMATTED.
export function buildEmail(
  r: Report,
  prev: Report | null,
  label: string,
  attach: { kind: string; filename: string; sheets?: string[] },
  env: EnvLabel,
  payroll: Report | null = null,
): string {
  const pnl = r.pnl ?? {}, rev = r.revenue ?? {}, ops = r.operations ?? {}, acq = r.acquisition ?? {};
  const g = acq.google_ads ?? {}, m = acq.meta_ads ?? {}, ms = acq.microsoft_ads ?? {};
  const meta = r.meta ?? {};
  const queue = ops.queue_now ?? {};
  const channels: Report[] = acq.cross_channel ?? [];
  const chBy = (k: string) => channels.find((c) => c.channel === k);

  const adSpendAvailable = r.ad_spend_available === true;
  const netVal = num(pnl.operating_net);
  const netColor = netVal >= 0 ? "#065F46" : "#B42318";

  // §J: Operating Net must never be shown as a positive figure when a required
  // input (paid media) is unavailable.
  const netCell = adSpendAvailable
    ? `<span style="color:${netColor};">${usd(netVal)}</span>`
    : `<span style="color:#92400E;font-size:14px;">unavailable<br/><span style="font-size:10px;font-weight:400;">paid media not synced</span></span>`;
  const adSpendCell = adSpendAvailable || num(g.days_synced_in_period) > 0
    ? usd(pnl.ad_spend)
    : `<span style="color:#92400E;font-size:14px;">${esc(String(g.connection ?? "not connected").replace(/_/g, " "))}</span>`;

  const insights = buildInsights(r, prev);
  const warnings: string[] = r.data_warnings ?? [];

  const card = (lbl: string, val: string, sub = "") => `
    <td width="50%" style="padding:4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;">
        <tr><td style="padding:10px 14px;">
          <p style="margin:0 0 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">${esc(lbl)}</p>
          <p style="margin:0;font-size:20px;font-weight:800;color:#111827;font-family:Arial,Helvetica,sans-serif;">${val}</p>
          ${sub ? `<p style="margin:2px 0 0;font-size:10px;color:#9CA3AF;font-family:Arial,Helvetica,sans-serif;">${sub}</p>` : ""}
        </td></tr>
      </table>
    </td>`;

  const sectionTitle = (t: string) => `
    <p style="margin:18px 0 6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:#374151;font-family:Arial,Helvetica,sans-serif;">${esc(t)}</p>`;

  const acqRow = (name: string, c: Report | undefined, extra = "") => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #EEF0F3;font-size:12px;font-weight:600;color:#374151;font-family:Arial,Helvetica,sans-serif;">${esc(name)}</td>
      <td align="right" style="padding:7px 10px;border-bottom:1px solid #EEF0F3;font-size:12px;color:#111827;font-family:Arial,Helvetica,sans-serif;">${c ? intf(c.orders) : "0"}</td>
      <td align="right" style="padding:7px 10px;border-bottom:1px solid #EEF0F3;font-size:12px;color:#111827;font-family:Arial,Helvetica,sans-serif;">${c ? usd(c.revenue) : "$0.00"}</td>
      <td align="right" style="padding:7px 10px;border-bottom:1px solid #EEF0F3;font-size:11px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">${extra || (c ? pct(c.pct_revenue) : "—")}</td>
    </tr>`;

  const stateLine = (name: string, state: string, detail = "") => `
    <p style="margin:4px 0 0;font-size:11px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">
      <strong>${esc(name)}:</strong> ${esc(state.replace(/_/g, " "))}${detail ? ` — ${esc(detail)}` : ""}</p>`;

  const freshness = [
    `Generated ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`,
    `covers ${esc(meta.from ?? r.period?.from)} → ${esc(meta.to_inclusive ?? r.period?.to)} (${esc(BUSINESS_TIMEZONE)})`,
    g.last_synced_day ? `Google Ads synced through ${esc(g.last_synced_day)}` : `Google Ads: ${esc(String(g.connection ?? "not connected").replace(/_/g, " "))}`,
  ].join(" · ");

  const envStatement = env === "LIVE"
    ? `All figures in this report come from LIVE PawTenant production data.`
    : `TEST PREVIEW — figures come from the ${esc(env)} environment and are NOT production data. This build never sends automatically.`;
  const envBanner = env === "LIVE" ? "" : `
    <tr><td style="padding:0 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FEF3C7;border:1px solid #F59E0B;border-radius:8px;margin-top:12px;">
        <tr><td style="padding:8px 12px;font-size:12px;font-weight:800;color:#92400E;font-family:Arial,Helvetica,sans-serif;">⚠ ${esc(env)} PREVIEW — NOT PRODUCTION DATA</td></tr>
      </table>
    </td></tr>`;

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F3F4F6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;background:#FFFFFF;border-radius:16px;border:1px solid #E5E7EB;">

  <tr><td style="padding:22px 24px;background:#0f2e26;border-radius:16px 16px 0 0;" align="center">
    <img src="${LOGO_URL}" width="150" alt="${COMPANY_NAME}" style="display:block;margin:0 auto 8px;" />
    <h1 style="margin:0;font-size:19px;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;">Monthly Business Report</h1>
    <p style="margin:4px 0 0;color:#9fd6c6;font-size:13px;font-family:Arial,Helvetica,sans-serif;">${esc(label)} · ${esc(BUSINESS_TIMEZONE)}</p>
  </td></tr>

  ${envBanner}

  <tr><td style="padding:10px 24px 0;">
    <p style="margin:0;font-size:10px;color:#9CA3AF;font-family:Arial,Helvetica,sans-serif;word-break:break-word;">${freshness}</p>
  </td></tr>

  <tr><td style="padding:6px 20px 0;">
    ${sectionTitle("Executive Financials")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${card("Gross Revenue", usd(pnl.gross_revenue), `${intf(rev.paid_orders)} paid orders`)}${card("Operating Net", netCell, adSpendAvailable ? "after all expenses" : "")}</tr>
      <tr>${card("Paid Orders", intf(rev.paid_orders), `AOV ${usd(rev.avg_order_value)}`)}${card("Ad Spend", adSpendCell, g.last_synced_day ? `synced through ${esc(g.last_synced_day)}` : "")}</tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 20px;">
    ${sectionTitle("Operations")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${card("Completed", intf(ops.completed_orders), "this month")}${card("Refund Rate", pct(ops.refund_rate), `${intf(pnl.refund_count)} refunds · ${usd(pnl.refund_amount)}`)}</tr>
      <tr>${card("Under Review", intf(queue.under_review), "now")}${card("Pending Delivery", intf(queue.pending_delivery), "now")}</tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 24px;">
    ${sectionTitle("Acquisition")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;">
      <tr style="background:#F9FAFB;">
        <th align="left" style="padding:6px 10px;font-size:10px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">Channel</th>
        <th align="right" style="padding:6px 10px;font-size:10px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">Orders</th>
        <th align="right" style="padding:6px 10px;font-size:10px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">Revenue</th>
        <th align="right" style="padding:6px 10px;font-size:10px;color:#6B7280;font-family:Arial,Helvetica,sans-serif;">Share</th>
      </tr>
      ${acqRow("Google Ads", chBy("google_ads"))}
      ${acqRow("Organic Search", chBy("organic_search"))}
      ${acqRow("Direct", chBy("direct"))}
      ${chBy("chatgpt") ? acqRow("ChatGPT", chBy("chatgpt")) : ""}
      ${chBy("unknown") ? acqRow("Unknown / Unattributed", chBy("unknown")) : ""}
    </table>
    ${stateLine("Meta Ads", String(m.connection ?? "not_connected"), m.spend_usd != null ? `${usd(m.spend_usd)} across ${intf(m.days_synced_in_period)} synced day(s)` : "")}
    ${stateLine("Microsoft/Bing Ads", String(ms.label ?? ms.connection ?? "Not connected"))}
    ${stateLine("Organic (GSC)", r.organic_search?.gsc?.connected ? "connected" : "not integrated — backend attribution only")}
    ${stateLine("Site traffic", r.traffic?.connected ? "connected" : "Traffic analytics not connected")}
  </td></tr>

  ${insights.length ? `<tr><td style="padding:0 24px;">
    ${sectionTitle("Owner Insights")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:8px;">
      <tr><td style="padding:10px 14px;">
        ${insights.map((i) => `<p style="margin:0 0 6px;font-size:12px;color:#14532D;font-family:Arial,Helvetica,sans-serif;">• ${esc(i)}</p>`).join("")}
      </td></tr>
    </table>
  </td></tr>` : ""}

  ${prev ? `<tr><td style="padding:0 24px;">
    ${sectionTitle("Month over Month")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E5E7EB;border-radius:8px;">
      ${[
        ["Gross Revenue", num(pnl.gross_revenue), num(prev.pnl?.gross_revenue), usd],
        ["Paid Orders", num(rev.paid_orders), num(prev.revenue?.paid_orders), intf],
        ["Operating Net", num(pnl.operating_net), num(prev.pnl?.operating_net), usd],
      ].map(([lbl, cur, pv, fmt]: any[]) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #EEF0F3;font-size:12px;font-weight:600;color:#374151;font-family:Arial,Helvetica,sans-serif;">${esc(lbl)}</td>
        <td align="right" style="padding:6px 10px;border-bottom:1px solid #EEF0F3;font-size:12px;color:#111827;font-family:Arial,Helvetica,sans-serif;">${fmt(cur)}</td>
        <td align="right" style="padding:6px 10px;border-bottom:1px solid #EEF0F3;font-size:12px;color:#9CA3AF;font-family:Arial,Helvetica,sans-serif;">${fmt(pv)}</td>
        <td align="right" style="padding:6px 10px;border-bottom:1px solid #EEF0F3;font-size:12px;font-family:Arial,Helvetica,sans-serif;">${deltaHtml(cur, pv)}</td>
      </tr>`).join("")}
    </table>
  </td></tr>` : ""}

  ${payroll?.totals ? `<tr><td style="padding:0 24px;">
    ${sectionTitle("Payroll (memo)")}
    <p style="margin:0;font-size:12px;color:#374151;font-family:Arial,Helvetica,sans-serif;">
      Net payroll ${usd(payroll.totals.net_payroll_usd)} for ${intf(payroll.totals.employees_included)} employees.
      Per-employee detail is in the attached workbook only — not in this email.</p>
  </td></tr>` : ""}

  ${warnings.length ? `<tr><td style="padding:0 24px;">
    ${sectionTitle("Data Quality")}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;">
      <tr><td style="padding:10px 14px;">
        ${warnings.map((w) => `<p style="margin:0 0 5px;font-size:11px;color:#92400E;font-family:Arial,Helvetica,sans-serif;word-break:break-word;">⚠ ${esc(w)}</p>`).join("")}
      </td></tr>
    </table>
  </td></tr>` : ""}

  <tr><td style="padding:14px 24px 4px;">
    ${sectionTitle("Attachment")}
    <p style="margin:0;font-size:12px;color:#374151;font-family:Arial,Helvetica,sans-serif;">
      ${attach.kind === "xlsx" ? `Excel workbook <strong>${esc(attach.filename)}</strong>` : `CSV file <strong>${esc(attach.filename)}</strong>`}${attach.sheets?.length ? ` — sheets: ${esc(attach.sheets.join(", "))}.` : "."}
    </p>
  </td></tr>

  <tr><td align="center" style="padding:12px 24px 20px;">
    <a href="https://pawtenant.com/admin-orders" style="display:inline-block;background:#0f2e26;color:#FFFFFF;padding:11px 24px;border-radius:9px;text-decoration:none;font-weight:700;font-size:13px;font-family:Arial,Helvetica,sans-serif;">Open Admin Dashboard →</a>
  </td></tr>

  <tr><td style="padding:14px 24px;background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 16px 16px;" align="center">
    <p style="font-size:11px;color:#6B7280;margin:0;font-family:Arial,Helvetica,sans-serif;">${envStatement}</p>
    <p style="font-size:10px;color:#9CA3AF;margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;">${COMPANY_NAME} · Automated Monthly Business Report · USD${g.currency === "PKR" ? " (Google Ads converted at FX 280 PKR/USD)" : ""} · ${SUPPORT_EMAIL}</p>
  </td></tr>
</table></td></tr></table></body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Derived from the project ref ONLY. A mislabelled ENVIRONMENT variable must
  // never be able to promote TEST into LIVE.
  const ENV_LABEL = resolveEnvironment(supabaseUrl);

  // ── Auth (cron secret OR service key OR admin JWT) ──
  let isAuthorized = false;
  const cronSecret = Deno.env.get("MONTHLY_REPORT_CRON_SECRET")
    ?? Deno.env.get("PAYOUT_CRON_SECRET") ?? Deno.env.get("LEAD_FOLLOWUP_CRON_SECRET") ?? "";
  if (cronSecret && (req.headers.get("x-cron-secret") ?? "") === cronSecret) isAuthorized = true;
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
  if (!isAuthorized && token === serviceKey) isAuthorized = true;
  if (!isAuthorized && token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    if (user) {
      const { data: profile } = await supabase
        .from("doctor_profiles").select("is_admin, role").eq("user_id", user.id).maybeSingle();
      isAuthorized = profile?.is_admin === true ||
        ["owner", "admin_manager", "finance"].includes((profile?.role as string) ?? "");
    }
  }
  if (!isAuthorized) return json({ error: "Unauthorized" }, 401);

  // ── Params (POST body or query string) ──
  const url = new URL(req.url);
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const qMonth = url.searchParams.get("month") ?? body?.month ?? null;        // 'YYYY-MM'
  const dryRun = url.searchParams.get("dry_run") === "true" || body?.dry_run === true;
  const force = url.searchParams.get("force") === "true" || body?.force === true;
  const sendToOverride = url.searchParams.get("send_to_override") ?? body?.send_to_override ?? null;
  // QA hook: include the workbook base64 in a dry-run response (admin-only path).
  const includeAttachment = url.searchParams.get("include_attachment") === "true" || body?.include_attachment === true;

  // ── Determine reporting month (America/New_York) ──
  // Default = the PREVIOUS business month, i.e. the one that has actually
  // finished. Reporting the CURRENT month truncates it (the July incident).
  const now = new Date();
  const nowParts = businessParts(now);
  let target: ReportTarget;
  if (qMonth && /^\d{4}-\d{2}$/.test(qMonth)) {
    const [yy, mm] = qMonth.split("-").map(Number);
    target = monthBounds(yy, mm - 1);
  } else {
    target = toTarget(previousBusinessMonth(now));
  }

  // The period must be OVER in business time. dry runs may preview an unfinished
  // month (clearly flagged); a real send may not, and force cannot override it.
  const periodComplete = isBusinessPeriodComplete(target.period, now);
  if (!periodComplete && !dryRun) {
    return json({
      ok: true, skipped: true, environment: ENV_LABEL, month: target.month,
      businessTimezone: BUSINESS_TIMEZONE,
      businessNow: `${nowParts.year}-${String(nowParts.month0 + 1).padStart(2, "0")}-${String(nowParts.day).padStart(2, "0")} ${String(nowParts.hour).padStart(2, "0")}:${String(nowParts.minute).padStart(2, "0")}`,
      message:
        `${target.label} is not over yet in ${BUSINESS_TIMEZONE} (ends ${target.period.endExclusive.toISOString()}). ` +
        `Reporting now would truncate the tail of the month. Use dry_run=true to preview.`,
    });
  }

  // ── §H DELIVERY-DISABLED GATE (owner-review no-send protection) ──
  // A run row whose delivery_allowed = false is TERMINAL for automated
  // delivery: neither the cron nor force can send that month. July 2026 is
  // seeded this way so the recurring schedule can never backfill it; the owner
  // flips the flag in the database deliberately to permit a manual resend.
  // Dry runs still preview. Schema-tolerant: on a project whose runs table has
  // no delivery_allowed column the field is undefined and the gate is inert.
  if (!dryRun) {
    const { data: guardRow } = await supabase
      .from("monthly_business_report_runs")
      .select("*")
      .eq("report_month", target.month).eq("report_type", REPORT_TYPE)
      .maybeSingle();
    if (guardRow && (guardRow as Report).delivery_allowed === false) {
      return json({
        ok: true, skipped: true, deliveryDisabled: true, environment: ENV_LABEL,
        month: target.month, runStatus: (guardRow as Report).status,
        message:
          `Delivery for ${target.label} is DISABLED (${(guardRow as Report).status}). ` +
          `Nothing was emailed and nothing will be until delivery_allowed is deliberately re-enabled.`,
      });
    }
  }

  // ── Idempotency reservation (skip for dry runs) ──
  let runId: string | null = null;
  if (!dryRun) {
    const { data: ins, error: insErr } = await supabase
      .from("monthly_business_report_runs")
      .insert({
        report_month: target.month, report_type: REPORT_TYPE,
        period_start: target.start, period_end: target.end,
        status: "pending", generated_at: new Date().toISOString(),
      })
      .select("id").maybeSingle();

    if (insErr) {
      if ((insErr as { code?: string }).code === "23505") {
        const { data: existing } = await supabase
          .from("monthly_business_report_runs")
          .select("id, status, sent_at").eq("report_month", target.month).eq("report_type", REPORT_TYPE).maybeSingle();
        if (existing?.status === "sent" && !force) {
          return json({
            ok: true, skipped: true, alreadySent: true, environment: ENV_LABEL,
            month: target.month, sentAt: existing.sent_at,
            message: `Monthly report for ${target.label} was already sent. Pass force=true to resend.`,
          });
        }
        runId = existing?.id ?? null;
        if (runId) {
          await supabase.from("monthly_business_report_runs")
            .update({ status: "pending", error_message: null, generated_at: new Date().toISOString() })
            .eq("id", runId);
        }
      } else {
        return json({ error: `Run-log insert failed: ${insErr.message}` }, 500);
      }
    } else {
      runId = ins?.id ?? null;
    }
  }

  try {
    // ── THE canonical payload (current + previous month) ──
    // One RPC, one payload; this function renders it and never recomputes.
    const { data: report, error: rErr } = await supabase
      .rpc("get_monthly_business_report", { p_month: target.month });
    if (rErr) throw new Error(`report rpc: ${rErr.message}`);
    const { data: prevReport } = await supabase
      .rpc("get_monthly_business_report", { p_month: prevMonthKey(target.month) });
    // Confidential payroll detail (service-role gated RPC). Goes into the Excel
    // "Salary Payroll" sheet + a high-level memo line only.
    const { data: payroll } = await supabase
      .rpc("get_monthly_salary_payroll", { p_from: target.start, p_to: target.end });

    // ── Recipients ──
    let toList: string[];
    if (sendToOverride && String(sendToOverride).includes("@")) {
      toList = [String(sendToOverride).toLowerCase().trim()];
    } else {
      const { data: recips } = await supabase
        .from("monthly_report_recipients").select("email").eq("is_active", true);
      toList = Array.from(new Set(((recips ?? []) as { email: string }[])
        .map((r) => (r.email ?? "").toLowerCase().trim()).filter((e) => e.includes("@"))));
      if (toList.length === 0) {
        toList = [(Deno.env.get("MONTHLY_REPORT_FALLBACK_EMAIL") ?? SUPPORT_EMAIL).toLowerCase().trim()];
      }
    }

    // ── QA fixtures + paid-media availability + reconciliation: from the payload ──
    // The payload computes all three server-side with the same canonical
    // markers; unknown is never treated as clean.
    const rep = (report ?? null) as Report | null;
    const qaRowsInScope = rep ? num(rep.qa_fixture_rows_in_period) : -1;
    const adSpendAvailable = rep?.ad_spend_available === true;
    const reconciled = rep?.reconciliation?.reconciled === true;

    // ── FAIL-CLOSED SEND GATE ──
    const blockers = assertSendable({
      environment: ENV_LABEL,
      period: { endExclusiveMs: target.period.endExclusive.getTime() },
      now,
      report: rep,
      adSpendAvailable,
      reconciled,
      qaRowsInScope: qaRowsInScope < 0 ? 1 : qaRowsInScope,
      recipients: toList,
    });

    // ── Build attachment + email (render-only consumers of the payload) ──
    const attach = buildWorkbook(rep as Report, (prevReport as Report) ?? null, target.label, target.month, (payroll as Report) ?? null, ENV_LABEL);
    const html = buildEmail(rep as Report, (prevReport as Report) ?? null, target.label,
      { kind: attach.kind, filename: attach.filename, sheets: attach.sheets }, ENV_LABEL, (payroll as Report) ?? null);
    const subject = `PawTenant Monthly Report — ${target.label} — ${usd((rep as Report)?.pnl?.gross_revenue)} revenue`;

    if (dryRun) {
      return json({
        ok: true, dryRun: true, environment: ENV_LABEL, month: target.month,
        businessTimezone: BUSINESS_TIMEZONE,
        period: {
          from: target.start, to: target.end,
          startUtc: target.period.start.toISOString(),
          endExclusiveUtc: target.period.endExclusive.toISOString(),
          complete: periodComplete,
        },
        wouldSendTo: toList,
        wouldSend: blockers.length === 0,
        sendBlockers: blockers,
        adSpendAvailable, reconciled, qaRowsInScope,
        attachmentKind: attach.kind, attachmentFile: attach.filename,
        attachmentSheets: attach.sheets,
        attachmentBytes: attach.content ? Math.round(attach.content.length * 0.75) : 0,
        attachmentError: attach.error,
        attachmentBase64: includeAttachment ? attach.content : undefined,
        emailHtml: includeAttachment ? html : undefined,
        subject, report, payroll,
      });
    }

    // A blocked send is a hard stop. It is recorded as blocked so the run log
    // shows WHY nothing went out, rather than looking like a silent success.
    if (blockers.length > 0) {
      if (runId) {
        await supabase.from("monthly_business_report_runs").update({
          status: "blocked",
          error_message: blockers.join(" | "),
          recipient_count: 0,
        }).eq("id", runId);
      }
      return json({
        ok: false, blocked: true, environment: ENV_LABEL, month: target.month,
        businessTimezone: BUSINESS_TIMEZONE,
        blockers,
        message: `Report NOT sent: ${blockers.length} blocker(s). Nothing was emailed.`,
      }, 412);
    }

    const sent = await sendViaResend({
      to: toList, subject, html,
      attachments: [{ filename: attach.filename, content: attach.content, content_type: attach.content_type }],
    });

    // ── Finalize run log ──
    if (runId) {
      await supabase.from("monthly_business_report_runs").update({
        status: sent.ok ? "sent" : "failed",
        recipient_count: toList.length,
        recipients: toList,
        email_provider_message_ids: sent.id ? [sent.id] : [],
        attachment_path: attach.filename,
        error_message: sent.ok ? null : sent.error,
        sent_at: sent.ok ? new Date().toISOString() : null,
      }).eq("id", runId);
    }

    // ── Comms audit (best-effort, non-blocking) ──
    try {
      await supabase.from("communications").insert({
        type: "email", direction: "outbound",
        email_to: toList.join(", "), email_from: SUPPORT_EMAIL,
        subject, slug: "monthly_business_report",
        template_source: "hardcoded", status: sent.ok ? "sent" : "failed",
        sent_by: "system", twilio_sid: sent.id,
        dedupe_key: `monthly_business_report:${target.month}`,
      });
    } catch { /* ignore */ }

    if (!sent.ok) return json({ ok: false, environment: ENV_LABEL, month: target.month, error: sent.error, sentTo: toList }, 502);

    return json({
      ok: true, environment: ENV_LABEL, month: target.month, period: { from: target.start, to: target.end },
      message: `Monthly report for ${target.label} sent to ${toList.length} recipient(s).`,
      sentTo: toList, attachmentKind: attach.kind, messageId: sent.id, runId,
    });
  } catch (err) {
    if (runId) {
      await supabase.from("monthly_business_report_runs")
        .update({ status: "failed", error_message: String(err) }).eq("id", runId);
    }
    return json({ error: String(err) }, 500);
  }
});
