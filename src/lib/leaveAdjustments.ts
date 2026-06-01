import { supabase } from "./supabaseClient";

// Company OS — Leave amendment ledger. Approved leave corrections are applied
// here as auditable overlays. Ledger-first: the original employee_leave_requests
// row is intentionally NOT mutated; the effective (applied) values live in
// applied_snapshot. Apply/reverse via admin-only SECURITY DEFINER RPCs; reads
// gated by RLS (own / admin-all).

export interface LeaveAdjustment {
  id: string;
  leave_request_id: string;
  leave_correction_request_id: string | null;
  team_member_id: string;
  original_snapshot: Record<string, unknown>;
  requested_snapshot: Record<string, unknown>;
  applied_snapshot: Record<string, unknown>;
  adjustment_type: string;
  status: string;
  applied_by: string | null;
  applied_at: string;
  reversed_by: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  created_at: string;
}

const COLS =
  "id, leave_request_id, leave_correction_request_id, team_member_id, original_snapshot, requested_snapshot, applied_snapshot, adjustment_type, status, applied_by, applied_at, reversed_by, reversed_at, reversal_reason, created_at";

export async function fetchMyLeaveAdjustments(teamMemberId: string): Promise<LeaveAdjustment[]> {
  const { data, error } = await supabase
    .from("employee_leave_adjustments")
    .select(COLS)
    .eq("team_member_id", teamMemberId)
    .order("applied_at", { ascending: false });
  if (error) { console.warn("[leaveAdjustments] fetchMine error", error); return []; }
  return (data as LeaveAdjustment[] | null) ?? [];
}

export async function fetchAllLeaveAdjustments(): Promise<LeaveAdjustment[]> {
  const { data, error } = await supabase
    .from("employee_leave_adjustments")
    .select(COLS)
    .order("applied_at", { ascending: false })
    .limit(500);
  if (error) { console.warn("[leaveAdjustments] fetchAll error", error); return []; }
  return (data as LeaveAdjustment[] | null) ?? [];
}

export async function applyLeaveCorrectionAmendment(requestId: string): Promise<string | null> {
  const { error } = await supabase.rpc("apply_leave_correction_amendment", { p_request_id: requestId });
  return error ? error.message : null;
}

export async function reverseLeaveAdjustment(adjustmentId: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc("reverse_leave_adjustment", { p_adjustment_id: adjustmentId, p_reason: reason });
  return error ? error.message : null;
}

/** Map of leave_correction_request_id → applied adjustment, for UI state. */
export function appliedByCorrection(adjustments: LeaveAdjustment[]): Map<string, LeaveAdjustment> {
  const m = new Map<string, LeaveAdjustment>();
  for (const a of adjustments) {
    if (a.status === "applied" && a.leave_correction_request_id) m.set(a.leave_correction_request_id, a);
  }
  return m;
}

/**
 * Map of leave_request_id → latest APPLIED (non-reversed) adjustment. When a
 * leave has multiple applied amendments, the most recent (by applied_at) wins.
 */
export function appliedByLeave(adjustments: LeaveAdjustment[]): Map<string, LeaveAdjustment> {
  const m = new Map<string, LeaveAdjustment>();
  // Sort applied_at descending so the first seen per leave is the latest.
  const sorted = [...adjustments]
    .filter((a) => a.status === "applied")
    .sort((a, b) => b.applied_at.localeCompare(a.applied_at));
  for (const a of sorted) {
    if (!m.has(a.leave_request_id)) m.set(a.leave_request_id, a);
  }
  return m;
}

/** Minimal raw leave shape needed to compute effective state. */
export interface RawLeaveLike {
  leave_type: string;
  start_date: string;
  end_date: string;
  partial_day: boolean | null;
  status: string;
}

export interface EffectiveLeave {
  leave_type: string;
  start_date: string;
  end_date: string;
  partial_day: boolean | null;
  status: string;
  has_applied_amendment: boolean;
  withdrawn_by_amendment: boolean;
  applied_adjustment_id: string | null;
  applied_at: string | null;
  amendment_type: string | null;
  original: RawLeaveLike;
}

function snapStr(snap: Record<string, unknown>, key: string): string | null {
  const v = snap?.[key];
  return v === null || v === undefined ? null : String(v);
}

/**
 * Effective leave state = original values overlaid by the latest applied,
 * non-reversed amendment (if any). Original is always preserved for comparison.
 * Reversed/pending amendments do NOT affect effective state (only `applied`
 * rows are passed in via appliedByLeave). `withdraw_approved_leave` amendments
 * set effective status to 'cancelled'.
 */
export function effectiveLeave(raw: RawLeaveLike, adj?: LeaveAdjustment | null): EffectiveLeave {
  const original: RawLeaveLike = {
    leave_type: raw.leave_type,
    start_date: raw.start_date,
    end_date: raw.end_date,
    partial_day: raw.partial_day,
    status: raw.status,
  };
  if (!adj || adj.status !== "applied") {
    return {
      ...original,
      has_applied_amendment: false,
      withdrawn_by_amendment: false,
      applied_adjustment_id: null,
      applied_at: null,
      amendment_type: null,
      original,
    };
  }
  const s = adj.applied_snapshot ?? {};
  const partialRaw = s.partial_day;
  const effStatus = snapStr(s, "status") ?? raw.status;
  return {
    leave_type: snapStr(s, "leave_type") ?? raw.leave_type,
    start_date: snapStr(s, "start_date") ?? raw.start_date,
    end_date: snapStr(s, "end_date") ?? raw.end_date,
    partial_day: partialRaw === null || partialRaw === undefined ? raw.partial_day : partialRaw === true,
    status: effStatus,
    has_applied_amendment: true,
    withdrawn_by_amendment: adj.adjustment_type === "withdraw_approved_leave" || effStatus === "cancelled",
    applied_adjustment_id: adj.id,
    applied_at: adj.applied_at,
    amendment_type: adj.adjustment_type,
    original,
  };
}
