import { supabase } from "./supabaseClient";

// Company OS — Timesheet adjustment ledger. Approved attendance corrections are
// applied here as auditable overlays (never mutating raw clock/break rows).
// Apply/reverse go through admin-only SECURITY DEFINER RPCs; reads are gated by
// RLS (own rows for employees, all rows for admin). Not payroll.

export type AdjustmentStatus = "applied" | "reversed";

export interface TimesheetAdjustment {
  id: string;
  team_member_id: string;
  source_type: string;
  source_request_id: string | null;
  adjustment_date: string;
  adjustment_kind: string;
  original_snapshot: Record<string, unknown>;
  requested_snapshot: Record<string, unknown>;
  applied_snapshot: Record<string, unknown>;
  gross_adjustment_seconds: number;
  break_adjustment_seconds: number;
  net_adjustment_seconds: number;
  reason: string | null;
  manager_note: string | null;
  status: string;
  applied_by: string | null;
  applied_at: string;
  reversed_by: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
  created_at: string;
}

export const ADJ_KIND_LABEL: Record<string, string> = {
  clock_in: "Clock-in",
  clock_out: "Clock-out",
  clock_in_out: "Clock in/out",
  break_start: "Break start",
  break_end: "Break end",
  break_duration: "Break duration",
  add_work_time: "Added work time",
  subtract_work_time: "Reduced work time",
  other: "Other",
};

const COLS =
  "id, team_member_id, source_type, source_request_id, adjustment_date, adjustment_kind, original_snapshot, requested_snapshot, applied_snapshot, gross_adjustment_seconds, break_adjustment_seconds, net_adjustment_seconds, reason, manager_note, status, applied_by, applied_at, reversed_by, reversed_at, reversal_reason, created_at";

/** Caller's own timesheet adjustments (RLS self-read), optionally by date range. */
export async function fetchMyTimesheetAdjustments(teamMemberId: string, start?: string, end?: string): Promise<TimesheetAdjustment[]> {
  let q = supabase.from("employee_timesheet_adjustments").select(COLS).eq("team_member_id", teamMemberId);
  if (start) q = q.gte("adjustment_date", start);
  if (end) q = q.lte("adjustment_date", end);
  const { data, error } = await q.order("applied_at", { ascending: false });
  if (error) { console.warn("[timesheetAdjustments] fetchMine error", error); return []; }
  return (data as TimesheetAdjustment[] | null) ?? [];
}

/** Admin: all timesheet adjustments (RLS admin-only). */
export async function fetchAllTimesheetAdjustments(): Promise<TimesheetAdjustment[]> {
  const { data, error } = await supabase
    .from("employee_timesheet_adjustments")
    .select(COLS)
    .order("applied_at", { ascending: false })
    .limit(500);
  if (error) { console.warn("[timesheetAdjustments] fetchAll error", error); return []; }
  return (data as TimesheetAdjustment[] | null) ?? [];
}

export interface ApplyResult { ok: boolean; needsManual?: boolean; error?: string }

/** Apply an approved attendance correction. Optional manual seconds override. */
export async function applyAttendanceCorrection(
  requestId: string,
  manualGrossSeconds?: number | null,
  manualBreakSeconds?: number | null,
): Promise<ApplyResult> {
  const { error } = await supabase.rpc("apply_attendance_correction_to_timesheet", {
    p_request_id: requestId,
    p_manual_gross_seconds: manualGrossSeconds ?? null,
    p_manual_break_seconds: manualBreakSeconds ?? null,
  });
  if (!error) return { ok: true };
  const msg = error.message || "Could not apply correction.";
  return { ok: false, needsManual: msg.includes("needs manual review"), error: msg };
}

export async function reverseTimesheetAdjustment(adjustmentId: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc("reverse_timesheet_adjustment", { p_adjustment_id: adjustmentId, p_reason: reason });
  return error ? error.message : null;
}

/** Map of source_request_id → the applied (non-reversed) adjustment, for UI state. */
export function appliedByRequest(adjustments: TimesheetAdjustment[]): Map<string, TimesheetAdjustment> {
  const m = new Map<string, TimesheetAdjustment>();
  for (const a of adjustments) {
    if (a.status === "applied" && a.source_request_id) m.set(a.source_request_id, a);
  }
  return m;
}
