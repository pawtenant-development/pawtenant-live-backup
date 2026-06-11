import { supabase } from "./supabaseClient";

// Compensation adjustments — monthly bonus / commission / adjustment /
// reimbursement / deduction with a pending → approved/rejected lifecycle.
//
// All writes go through SECURITY DEFINER RPCs that enforce the rules
// server-side (department-scoped request/approve flags, owner-target block,
// self-review fence, approval_requests mirror). Pending rows never touch
// salary; approved rows feed get_salary_expense_* and get_my_salary_snapshot.

export const COMP_TYPES = ["bonus", "commission", "adjustment", "reimbursement", "deduction"] as const;
export type CompType = (typeof COMP_TYPES)[number];

export const COMP_TYPE_LABEL: Record<string, string> = {
  bonus: "Bonus",
  commission: "Commission",
  adjustment: "Adjustment",
  reimbursement: "Reimbursement",
  deduction: "Deduction",
};

export type CompStatus = "pending" | "approved" | "rejected";

export interface CompensationAdjustmentRow {
  id: string;
  team_member_id: string;
  display_name: string | null;
  employee_code: string | null;
  department_name: string | null;
  period_month: string; // YYYY-MM-DD (first of month)
  comp_type: string;
  amount_pkr: number;
  reason: string | null;
  status: CompStatus;
  requested_by_name: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface MyCompensationAdjustment {
  id: string;
  period_month: string;
  comp_type: string;
  amount_pkr: number;
  reason: string | null;
  status: CompStatus;
  reviewed_at: string | null;
  created_at: string;
}

/** "June 2026" from a period_month date string. */
export function periodMonthLabel(periodMonth: string): string {
  const [y, m] = periodMonth.split("-").map(Number);
  if (!y || !m) return periodMonth;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function fmtPkr(amount: number): string {
  return `PKR ${Math.round(Number(amount) || 0).toLocaleString("en-US")}`;
}

/**
 * Create a compensation request. Server-side authz:
 *   owner/admin_manager + finance role → always (autoApprove honored);
 *   department roles with can_request_bonus → for employees in their departments.
 * Returns { id } or { error }.
 */
export async function requestCompensationAdjustment(input: {
  teamMemberId: string;
  periodMonth: string; // any date in the target month
  type: CompType | string;
  amountPkr: number;
  reason?: string | null;
  autoApprove?: boolean;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await supabase.rpc("request_compensation_adjustment", {
    p_team_member_id: input.teamMemberId,
    p_period_month: input.periodMonth,
    p_type: input.type,
    p_amount_pkr: input.amountPkr,
    p_reason: input.reason ?? null,
    p_auto_approve: input.autoApprove ?? false,
  });
  if (error) return { error: error.message };
  return { id: data as string };
}

/** Approve / reject a pending adjustment. Returns resulting status or error. */
export async function reviewCompensationAdjustment(
  adjustmentId: string,
  decision: "approved" | "rejected",
  note?: string | null,
): Promise<{ status?: string; error?: string }> {
  const { data, error } = await supabase.rpc("review_compensation_adjustment", {
    p_adjustment_id: adjustmentId,
    p_decision: decision,
    p_note: note ?? null,
  });
  if (error) return { error: error.message };
  return { status: data as string };
}

/** Adjustments whose period_month falls in [from..to]. Admin/finance = all; others = dept-scoped. */
export async function fetchCompensationAdjustments(
  from: string,
  to: string,
): Promise<CompensationAdjustmentRow[]> {
  const { data, error } = await supabase.rpc("get_compensation_adjustments", {
    p_from: from,
    p_to: to,
  });
  if (error) {
    console.warn("[compensation] get_compensation_adjustments error", error);
    return [];
  }
  return (data ?? []) as CompensationAdjustmentRow[];
}

/** The calling employee's own adjustments (self-scoped RPC, for /company). */
export async function fetchMyCompensationAdjustments(): Promise<MyCompensationAdjustment[]> {
  const { data, error } = await supabase.rpc("get_my_compensation_adjustments");
  if (error) {
    console.warn("[compensation] get_my_compensation_adjustments error", error);
    return [];
  }
  return (data ?? []) as MyCompensationAdjustment[];
}
