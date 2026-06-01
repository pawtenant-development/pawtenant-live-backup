// Company expenses + management-accounting helpers for the admin Payments
// "Accounts" tab. Internal P&L only — RLS restricts all reads/writes to
// admin/finance roles (see migration 20260602120000_company_expenses_and_pnl).
import { supabase } from "./supabaseClient";

// ── Allowed enums (mirror the DB CHECK constraints) ───────────────────────
export const EXPENSE_CATEGORIES = [
  "employee_salary", "provider_payout", "marketing", "google_ads", "facebook_meta",
  "seo", "subscription", "software", "utilities", "rent_office", "contractor",
  "refund_cost", "bank_fee", "tax", "other",
] as const;
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const EXPENSE_SOURCES = [
  "manual", "employee_salary", "provider_payout", "google_ads", "facebook_meta",
  "analytics_import", "system",
] as const;
export type ExpenseSource = typeof EXPENSE_SOURCES[number];

export const EXPENSE_STATUSES = ["confirmed", "estimated", "pending", "cancelled"] as const;
export type ExpenseStatus = typeof EXPENSE_STATUSES[number];

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  employee_salary: "Employee Salary",
  provider_payout: "Provider Payout",
  marketing: "Marketing / Ads",
  google_ads: "Google Ads",
  facebook_meta: "Facebook / Meta Ads",
  seo: "SEO",
  subscription: "Subscription",
  software: "Software / SaaS",
  utilities: "Utilities",
  rent_office: "Rent / Office",
  contractor: "Contractor",
  refund_cost: "Refund Cost",
  bank_fee: "Bank Fee",
  tax: "Tax",
  other: "Other / Miscellaneous",
};

// Marketing-family categories (used to roll up the Marketing line in the P&L).
export const MARKETING_CATEGORIES: ExpenseCategory[] = ["marketing", "google_ads", "facebook_meta", "seo"];

export interface CompanyExpense {
  id: string;
  brand: string | null;
  expense_date: string; // YYYY-MM-DD
  category: ExpenseCategory;
  subcategory: string | null;
  vendor: string | null;
  description: string | null;
  amount: number;
  currency: string;
  source: ExpenseSource;
  status: ExpenseStatus;
  recurring: boolean;
  recurring_period: string | null;
  related_team_member_id: string | null;
  related_order_id: string | null;
  related_provider_id: string | null;
  external_reference: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseInput {
  expense_date: string;
  category: ExpenseCategory;
  vendor?: string | null;
  description?: string | null;
  amount: number;
  currency?: string;
  source?: ExpenseSource;
  status?: ExpenseStatus;
  recurring?: boolean;
  recurring_period?: string | null;
}

export interface SalaryExpenseSummaryRow {
  currency: string;
  monthly_total: number;
  prorated_total: number;
  employee_count: number;
  range_days: number;
}

export interface ProviderPayoutRow {
  confirmation_id: string | null;
  order_id: string | null;
  doctor_amount: number | null;
  doctor_name: string | null;
  status: string | null;
}

// Provider work is "complete" only when the letter has been delivered to the
// patient — orders.doctor_status === 'patient_notified' (same signal EarningsPanel
// uses). A doctor_earnings row can exist BEFORE completion (assigned/under review),
// so payout existence alone must NOT drive the Business Net deduction.
export const PROVIDER_COMPLETED_STATUS = "patient_notified";

export type PayoutClass =
  | "none"                          // no provider / no earning, not completed → $0
  | "pending_estimated"             // assigned/known but work not completed → not deducted
  | "confirmed_completed"           // provider completed (earning) → deducted
  | "confirmed_from_rate"           // provider completed, no earning row, used per_order_rate → deducted
  | "confirmed_completed_refunded"  // completed then customer refunded → still deducted
  | "payout_missing_completed"      // completed but NO earning row / rate found → advisory, $0 deducted
  | "cancelled_before_completion"   // cancelled/archived before completion → $0
  | "cancelled";                    // earning explicitly cancelled → $0

export interface PayoutClassification {
  classification: PayoutClass;
  name: string | null;
  amount: number;     // payout figure for display
  deducted: number;   // amount actually subtracted from Business Net (confirmed only)
  estimated: number;  // amount shown as pending/forecast (never deducted)
  source?: "earning" | "rate" | "none";
  chainPaidCount?: number; // paid charges sharing this charge's recovery chain (duplicate advisory)
}

// One resolved payout per Stripe charge, from resolve_charge_payouts RPC.
// Resolution follows the parent_order_id recovery chain so recovery/child orders
// inherit the provider payout from the completed order in their chain.
export interface ChargePayoutResolution {
  payment_intent: string;
  order_id: string | null;
  confirmation_id: string | null;
  root_order_id: string | null;
  completed: boolean;
  provider_name: string | null;
  payout_amount: number | null;
  payout_source: "earning" | "rate" | "none";
  classification: string;
  chain_paid_count: number;
}

export async function fetchChargePayouts(paymentIntents: string[]): Promise<Record<string, ChargePayoutResolution>> {
  const map: Record<string, ChargePayoutResolution> = {};
  const ids = Array.from(new Set(paymentIntents.filter(Boolean)));
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error } = await supabase.rpc("resolve_charge_payouts", { p_payment_intents: ids.slice(i, i + 300) });
    if (error) { console.warn("[companyExpenses] resolve_charge_payouts error", error); continue; }
    (data ?? []).forEach((r) => {
      const row = r as ChargePayoutResolution;
      if (row.payment_intent) map[row.payment_intent] = { ...row, payout_amount: Number(row.payout_amount) || 0 };
    });
  }
  return map;
}

// Map a resolver row → the display classification used by the UI/exports.
export function resolutionToClassification(
  res: ChargePayoutResolution | undefined,
  chargeRefunded: boolean,
): PayoutClassification {
  if (!res) return { classification: "none", name: null, amount: 0, deducted: 0, estimated: 0 };
  const amount = Number(res.payout_amount) || 0;
  const name = res.provider_name ?? null;
  const base = { name, source: res.payout_source, chainPaidCount: res.chain_paid_count };
  switch (res.classification) {
    case "confirmed_completed":
    case "confirmed_from_rate":
      return chargeRefunded
        ? { ...base, classification: "confirmed_completed_refunded", amount, deducted: amount, estimated: 0 }
        : { ...base, classification: res.classification as PayoutClass, amount, deducted: amount, estimated: 0 };
    case "pending_estimated":
      return { ...base, classification: "pending_estimated", amount, deducted: 0, estimated: amount };
    case "payout_missing_completed":
      return { ...base, classification: "payout_missing_completed", amount: 0, deducted: 0, estimated: 0 };
    case "cancelled_before_completion":
      return { ...base, classification: "cancelled_before_completion", amount, deducted: 0, estimated: 0 };
    default:
      return { ...base, classification: "none", amount: 0, deducted: 0, estimated: 0 };
  }
}

export interface OrderCompletion {
  doctor_status: string | null;
  order_status: string | null;
  order_id?: string | null;
  doctor_user_id?: string | null;
  doctor_name?: string | null;
}

// Single source of truth for how a provider payout affects Business Net.
// Works even when no earning row exists, using the order's completion/assignment.
export function classifyPayout(
  payout: ProviderPayoutRow | undefined,
  completion: OrderCompletion | undefined,
  chargeRefunded: boolean,
): PayoutClassification {
  const completed = completion?.doctor_status === PROVIDER_COMPLETED_STATUS;
  const os = (completion?.order_status ?? "").toLowerCase();
  const cancelledOrder = os === "cancelled" || os === "archived";
  const assigned = !!completion?.doctor_user_id;
  const completionName = completion?.doctor_name ?? null;

  // (a) A usable earning row exists → drive the figure from it.
  if (payout && (payout.status ?? "") !== "cancelled") {
    const name = payout.doctor_name ?? completionName;
    const amount = typeof payout.doctor_amount === "number" ? payout.doctor_amount : 0;
    if (completed) {
      return { classification: chargeRefunded ? "confirmed_completed_refunded" : "confirmed_completed", name, amount, deducted: amount, estimated: 0 };
    }
    if (cancelledOrder) return { classification: "cancelled_before_completion", name, amount, deducted: 0, estimated: amount };
    return { classification: "pending_estimated", name, amount, deducted: 0, estimated: amount };
  }

  // (b) Earning explicitly cancelled → no cost.
  if (payout && (payout.status ?? "") === "cancelled") {
    return { classification: "cancelled", name: payout.doctor_name ?? completionName, amount: 0, deducted: 0, estimated: 0 };
  }

  // (c) No earning row — fall back to order/provider state.
  if (completed) {
    // Completed but no payout record found. Flag for admin; do NOT fabricate a figure.
    return { classification: "payout_missing_completed", name: completionName, amount: 0, deducted: 0, estimated: 0 };
  }
  if (cancelledOrder) return { classification: "cancelled_before_completion", name: completionName, amount: 0, deducted: 0, estimated: 0 };
  if (assigned) return { classification: "pending_estimated", name: completionName, amount: 0, deducted: 0, estimated: 0 };
  return { classification: "none", name: null, amount: 0, deducted: 0, estimated: 0 };
}

// Short human label for payment rows / exports (caller prepends the provider name).
export function payoutLabel(p: PayoutClassification): string {
  switch (p.classification) {
    case "none": return "provider —";
    case "pending_estimated": return p.estimated > 0
      ? `provider pending est. $${p.estimated.toFixed(2)} not deducted`
      : "provider pending (not completed)";
    case "confirmed_completed": return `provider confirmed $${p.deducted.toFixed(2)}`;
    case "confirmed_from_rate": return `provider confirmed from rate $${p.deducted.toFixed(2)}`;
    case "confirmed_completed_refunded": return `provider confirmed $${p.deducted.toFixed(2)} (order refunded)`;
    case "payout_missing_completed": return "provider missing payout on completed order";
    case "cancelled_before_completion": return "provider cancelled / no payout";
    case "cancelled": return "provider cancelled / no payout";
  }
}

// ── Date-range helper — mirrors the Payments tab period/custom range ──────
export function resolveRange(
  period: "7d" | "30d" | "90d",
  customActive: boolean,
  customFrom: string,
  customTo: string,
): { from: string; to: string; days: number } {
  const today = new Date();
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  if (customActive && customFrom) {
    const from = customFrom;
    const to = customTo || toIso(today);
    const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1);
    return { from, to, days };
  }
  const days = period === "7d" ? 7 : period === "90d" ? 90 : 30;
  const fromD = new Date(today);
  fromD.setDate(fromD.getDate() - (days - 1));
  return { from: toIso(fromD), to: toIso(today), days };
}

// ── CRUD ───────────────────────────────────────────────────────────────────
export async function listExpenses(from: string, to: string): Promise<CompanyExpense[]> {
  const { data, error } = await supabase
    .from("company_expenses")
    .select("*")
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("expense_date", { ascending: false });
  if (error) { console.warn("[companyExpenses] list error", error); return []; }
  return (data ?? []) as CompanyExpense[];
}

export async function addExpense(input: ExpenseInput): Promise<{ ok: boolean; error?: string; row?: CompanyExpense }> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id ?? null;
  const { data, error } = await supabase
    .from("company_expenses")
    .insert({
      expense_date: input.expense_date,
      category: input.category,
      vendor: input.vendor ?? null,
      description: input.description ?? null,
      amount: input.amount,
      currency: input.currency ?? "USD",
      source: input.source ?? "manual",
      status: input.status ?? "confirmed",
      recurring: input.recurring ?? false,
      recurring_period: input.recurring_period ?? null,
      created_by: uid,
      updated_by: uid,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, row: data as CompanyExpense };
}

export async function updateExpense(id: string, patch: Partial<ExpenseInput>): Promise<{ ok: boolean; error?: string }> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id ?? null;
  const { error } = await supabase
    .from("company_expenses")
    .update({ ...patch, updated_by: uid })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Soft-cancel keeps the audit trail; hard delete fully removes.
export async function cancelExpense(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("company_expenses").update({ status: "cancelled" }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteExpense(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("company_expenses").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ── Estimated salary expense (aggregate only, admin/finance RPC) ──────────
export async function fetchSalaryExpense(from: string, to: string): Promise<SalaryExpenseSummaryRow[]> {
  const { data, error } = await supabase.rpc("get_salary_expense_summary", { p_from: from, p_to: to });
  if (error) { console.warn("[companyExpenses] salary rpc error", error); return []; }
  return (data ?? []) as SalaryExpenseSummaryRow[];
}

export interface SalaryDetailRow {
  team_member_id: string;
  display_name: string | null;
  employee_code: string | null;
  base_salary: number;
  salary_currency: string;
  employment_status: string;
  is_active: boolean;
  prorated_amount: number;
  included: boolean;
  exclude_reason: string | null;
}

// Admin-only per-employee salary breakdown (diagnostic). Gated server-side.
export async function fetchSalaryDetail(from: string, to: string): Promise<SalaryDetailRow[]> {
  const { data, error } = await supabase.rpc("get_salary_expense_detail", { p_from: from, p_to: to });
  if (error) { console.warn("[companyExpenses] salary detail rpc error", error); return []; }
  return (data ?? []) as SalaryDetailRow[];
}

// ── Provider payouts (doctor_earnings) keyed by confirmation_id ───────────
// Cost = non-cancelled payouts. Refunded orders still owe the provider
// (handled upstream in EarningsPanel) so we do NOT zero those out here.
// Builds a payout lookup keyed by BOTH confirmation_id and order_id so a charge
// can resolve its payout even if one key is missing/mismatched. Queries by both
// keys to catch earnings whose confirmation_id differs from the order's.
export async function fetchProviderPayouts(
  confirmationIds: string[],
  orderIds: string[] = [],
): Promise<Record<string, ProviderPayoutRow>> {
  const map: Record<string, ProviderPayoutRow> = {};
  const addRows = (rows: unknown[] | null) => {
    (rows ?? []).forEach((r) => {
      const row = r as ProviderPayoutRow;
      const cancelled = (row.status ?? "") === "cancelled";
      // Don't let a cancelled row overwrite a usable one under the same key.
      if (row.confirmation_id && !(map[row.confirmation_id] && cancelled)) map[row.confirmation_id] = row;
      if (row.order_id && !(map[row.order_id] && cancelled)) map[row.order_id] = row;
    });
  };
  const cols = "confirmation_id, order_id, doctor_amount, doctor_name, status";
  const confIds = Array.from(new Set(confirmationIds.filter(Boolean)));
  for (let i = 0; i < confIds.length; i += 200) {
    const { data, error } = await supabase.from("doctor_earnings").select(cols).in("confirmation_id", confIds.slice(i, i + 200));
    if (error) { console.warn("[companyExpenses] payouts (conf) error", error); continue; }
    addRows(data);
  }
  const oids = Array.from(new Set(orderIds.filter(Boolean)));
  for (let i = 0; i < oids.length; i += 200) {
    const { data, error } = await supabase.from("doctor_earnings").select(cols).in("order_id", oids.slice(i, i + 200));
    if (error) { console.warn("[companyExpenses] payouts (order) error", error); continue; }
    addRows(data);
  }
  return map;
}
