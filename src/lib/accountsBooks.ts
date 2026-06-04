// Monthly Books Summary data layer. Fetches one wide window of Stripe payment
// history (via the existing stripe-payment-history edge fn) and buckets charges
// by calendar month, so previous months' books can be shown without N requests.
// Read-only. No salary/payroll amounts are fetched here (salary is layered on by
// the caller from the admin-only aggregate RPC).
import { supabase, getAdminToken, getAdminUserToken } from "./supabaseClient";
import { monthKeyOfUnix } from "./accountsPeriods";
import { fetchChargePayouts, resolutionToClassification, type ChargePayoutResolution } from "./companyExpenses";

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export interface BooksCharge {
  amount: number;
  fee?: number;
  net?: number;
  amount_refunded: number;
  payment_intent: string | null;
  created: number; // unix seconds
}

export interface MonthChargeAgg {
  gross: number;
  fees: number;
  refunds: number;
  payouts: number;   // confirmed/deducted provider payouts (USD)
  businessNet: number; // gross - fees - refunds - payouts
  chargeCount: number;
}

// Fetch raw charges for [from,to] from the edge function (same source the
// Payments tab uses). Returns [] on failure (caller degrades gracefully).
export async function fetchBooksCharges(from: string, to: string): Promise<BooksCharge[]> {
  try {
    const token = await getAdminToken();
    const res = await fetch(`${supabaseUrl}/functions/v1/stripe-payment-history?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as { ok: boolean; charges?: BooksCharge[]; error?: string };
    if (!json.ok) { console.warn("[accountsBooks] history error", json.error); return []; }
    return (json.charges ?? []) as BooksCharge[];
  } catch (err) {
    console.warn("[accountsBooks] fetch error", err);
    return [];
  }
}

// Bucket charges by "YYYY-MM" with the same payout/business-net logic the
// Accounts panel + export use (confirmed provider payouts only are deducted).
export function bucketChargesByMonth(
  charges: BooksCharge[],
  resolutionMap: Record<string, ChargePayoutResolution>,
): Record<string, MonthChargeAgg> {
  const out: Record<string, MonthChargeAgg> = {};
  for (const c of charges) {
    const key = monthKeyOfUnix(c.created);
    const agg = out[key] ?? { gross: 0, fees: 0, refunds: 0, payouts: 0, businessNet: 0, chargeCount: 0 };
    const fee = typeof c.fee === "number" ? c.fee : 0;
    const net = typeof c.net === "number" ? c.net : c.amount - fee;
    const res = c.payment_intent ? resolutionMap[c.payment_intent] : undefined;
    const pc = resolutionToClassification(res, c.amount_refunded > 0);
    agg.gross += c.amount;
    agg.fees += fee;
    agg.refunds += c.amount_refunded;
    agg.payouts += pc.deducted;
    agg.businessNet += net - c.amount_refunded - pc.deducted;
    agg.chargeCount += 1;
    out[key] = agg;
  }
  return out;
}

// Resolve payouts for a charge set (re-uses the parent-chain-aware resolver).
export async function resolveBooksPayouts(charges: BooksCharge[]): Promise<Record<string, ChargePayoutResolution>> {
  const pis = charges.map((c) => c.payment_intent).filter((v): v is string => !!v);
  if (pis.length === 0) return {};
  return fetchChargePayouts(pis);
}

// One month's books computed from the SAME source the Accounts panel uses, so the
// Monthly Books Summary row matches the panel exactly:
//   • gross / fees / refunds / counts come straight from the stripe-payment-history
//     SUMMARY (refunds counted by REFUND date, like the panel — NOT by the charge's
//     created month, which is what bucketChargesByMonth did and why refunds drifted).
//   • businessNet = net_after_fees − confirmed provider payouts == panel contributionMargin.
//   • payouts use the same parent-chain-aware resolver + completed-only deduction.
export interface PanelMonthAgg {
  gross: number;        // summary.total_revenue
  fees: number;         // summary.total_fees
  refunds: number;      // summary.total_refunded (by refund date)
  netAfterFees: number; // summary.net_after_fees (gross − refunds − fees)
  payouts: number;      // confirmed provider payouts deducted
  businessNet: number;  // netAfterFees − payouts  (== panel Contribution Margin)
  chargeCount: number;  // summary.charge_count (paid orders)
  refundCount: number;  // summary.refund_count
}

const EMPTY_MONTH_AGG: PanelMonthAgg = {
  gross: 0, fees: 0, refunds: 0, netAfterFees: 0, payouts: 0, businessNet: 0, chargeCount: 0, refundCount: 0,
};

export async function fetchBooksMonthAgg(from: string, to: string): Promise<PanelMonthAgg> {
  try {
    const token = await getAdminToken();
    const res = await fetch(`${supabaseUrl}/functions/v1/stripe-payment-history?from=${from}&to=${to}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json() as {
      ok: boolean;
      summary?: {
        total_revenue: number; total_fees?: number; total_refunded: number;
        net_after_fees?: number; net_revenue: number; charge_count: number; refund_count: number;
      };
      charges?: BooksCharge[];
      error?: string;
    };
    if (!json.ok || !json.summary) { console.warn("[accountsBooks] month agg error", json.error); return { ...EMPTY_MONTH_AGG }; }
    const s = json.summary;
    const charges = (json.charges ?? []) as BooksCharge[];
    const resMap = await resolveBooksPayouts(charges);
    let payouts = 0;
    for (const c of charges) {
      const r = c.payment_intent ? resMap[c.payment_intent] : undefined;
      payouts += resolutionToClassification(r, c.amount_refunded > 0).deducted;
    }
    const gross = s.total_revenue;
    const fees = s.total_fees ?? 0;
    const refunds = s.total_refunded;
    const netAfterFees = s.net_after_fees ?? (gross - refunds - fees);
    return {
      gross, fees, refunds, netAfterFees, payouts,
      businessNet: netAfterFees - payouts,
      chargeCount: s.charge_count, refundCount: s.refund_count,
    };
  } catch (err) {
    console.warn("[accountsBooks] month agg fetch error", err);
    return { ...EMPTY_MONTH_AGG };
  }
}

// ── Monthly close / lock ───────────────────────────────────────────────────
// A closed month stores a JSON snapshot of its figures; source data is never
// mutated. Admin/finance gated server-side (close/reopen RPCs re-check role).
export interface BooksSnapshot {
  month_key: string;
  period_start: string;
  period_end: string;
  label: string;
  gross: number;
  fees: number;
  refunds: number;
  payouts: number;
  businessNet: number;
  expenses: number;
  salary: number;
  operatingNet: number;
  expenseCount: number;
  chargeCount: number;
  snapshotAt: string; // client ISO timestamp the figures were computed
}

export interface AccountingPeriod {
  id: string;
  period_start: string;
  period_end: string;
  label: string | null;
  status: "open" | "review" | "closed";
  snapshot_json: BooksSnapshot | null;
  notes: string | null;
  closed_by: string | null;
  closed_at: string | null;
  reopened_by: string | null;
  reopened_at: string | null;
  updated_at: string | null;
}

export async function fetchAccountingPeriods(from: string, to: string): Promise<AccountingPeriod[]> {
  const { data, error } = await supabase.rpc("get_company_accounting_periods", { p_from: from, p_to: to });
  if (error) { console.warn("[accountsBooks] periods rpc error", error); return []; }
  return (data ?? []) as AccountingPeriod[];
}

export async function closeAccountingPeriod(
  periodStart: string, periodEnd: string, label: string, snapshot: BooksSnapshot, notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("close_company_accounting_period", {
    p_period_start: periodStart, p_period_end: periodEnd, p_label: label, p_snapshot: snapshot, p_notes: notes ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reopenAccountingPeriod(id: string, reason?: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc("reopen_company_accounting_period", { p_id: id, p_reason: reason ?? null });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Monthly payroll summary email ──────────────────────────────────────────
// Internal owner/admin notification only. Calls the send-payroll-summary-email
// edge function, which builds the summary from the SAME salary RPC the Accounts
// panel uses (owners excluded server-side) and emails the fixed recipients below.
// This never moves money and never triggers payroll processing.
export const PAYROLL_RECIPIENTS = ["eservices.dm@gmail.com", "omer_kam@yahoo.com"];

export interface PayrollSendResult {
  ok: boolean;
  dryRun?: boolean;
  message?: string;
  error?: string;
  employeeCount?: number;
  totalPkr?: number;
  totalUsd?: number;
  recipients?: string[];
  sentAt?: string;
}

export async function sendPayrollSummaryEmail(args: {
  periodStart: string; periodEnd: string; periodLabel: string; fxRate: number; dryRun?: boolean;
}): Promise<PayrollSendResult> {
  // verify_jwt is on for this function → must send a real admin user JWT (not anon).
  const token = await getAdminUserToken();
  if (!token) return { ok: false, error: "Your admin session expired. Please re-login and try again." };
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-payroll-summary-email`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        period_start: args.periodStart, period_end: args.periodEnd,
        period_label: args.periodLabel, fx_rate: args.fxRate, dryRun: args.dryRun ?? false,
      }),
    });
    const json = await res.json().catch(() => ({})) as PayrollSendResult & { error?: string };
    if (!res.ok || json.ok === false) {
      return { ...json, ok: false, error: json.error ?? `Send failed (${res.status})` };
    }
    return { ...json, ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error sending payroll summary" };
  }
}

export interface PayrollSendLogRow {
  period_start: string;
  period_end: string;
  status: string;
  sent_at: string;
  recipient_emails: string[];
  employee_count: number;
}

// Latest successful send per period within [from,to], keyed "start__end".
// RLS-gated (admin/finance) — returns {} for non-admins.
export async function fetchPayrollSendLog(from: string, to: string): Promise<Record<string, PayrollSendLogRow>> {
  const { data, error } = await supabase
    .from("payroll_email_log")
    .select("period_start, period_end, status, sent_at, recipient_emails, employee_count")
    .gte("period_start", from)
    .lte("period_end", to)
    .eq("status", "sent")
    .order("sent_at", { ascending: false });
  if (error) { console.warn("[accountsBooks] payroll log error", error); return {}; }
  const map: Record<string, PayrollSendLogRow> = {};
  for (const r of (data ?? []) as PayrollSendLogRow[]) {
    const key = `${r.period_start}__${r.period_end}`;
    if (!map[key]) map[key] = r; // first row per period = newest (ordered desc)
  }
  return map;
}
