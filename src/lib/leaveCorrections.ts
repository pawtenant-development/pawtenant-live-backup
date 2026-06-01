import { supabase } from "./supabaseClient";
import type { LeaveType } from "./employeeLeave";

// Company OS — Leave correction / amendment requests. Employees request changes
// to one of their OWN leave requests (SECURITY DEFINER RPCs); admin reviews.
// Reads gated by RLS (own / admin-all). Approval is a decision record only — it
// does NOT mutate the original employee_leave_requests row (history preserved).

export type LeaveCorrectionType =
  | "change_dates"
  | "change_leave_type"
  | "change_duration"
  | "withdraw_approved_leave"
  | "extend_leave"
  | "correct_reason"
  | "other";

export const LEAVE_CORRECTION_TYPES: LeaveCorrectionType[] = [
  "change_dates",
  "change_leave_type",
  "change_duration",
  "withdraw_approved_leave",
  "extend_leave",
  "correct_reason",
  "other",
];

export const LEAVE_CORRECTION_TYPE_LABEL: Record<string, string> = {
  change_dates: "Change dates",
  change_leave_type: "Change leave type",
  change_duration: "Change to/from half day",
  withdraw_approved_leave: "Withdraw / cancel approved leave",
  extend_leave: "Extend leave",
  correct_reason: "Correct reason",
  other: "Other",
};

export interface LeaveCorrection {
  id: string;
  leave_request_id: string;
  team_member_id: string;
  correction_type: string;
  requested_start_date: string | null;
  requested_end_date: string | null;
  requested_leave_type: string | null;
  requested_partial_day: boolean | null;
  requested_duration_hours: number | null;
  correction_reason: string;
  status: string;
  manager_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancelled_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  updated_at: string;
}

const COLS =
  "id, leave_request_id, team_member_id, correction_type, requested_start_date, requested_end_date, requested_leave_type, requested_partial_day, requested_duration_hours, correction_reason, status, manager_note, reviewed_by, reviewed_at, cancelled_at, cancelled_reason, created_at, updated_at";

/** Caller's own leave correction requests (RLS self-read). [] on error. */
export async function fetchMyLeaveCorrections(teamMemberId: string): Promise<LeaveCorrection[]> {
  const { data, error } = await supabase
    .from("employee_leave_correction_requests")
    .select(COLS)
    .eq("team_member_id", teamMemberId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[leaveCorrections] fetchMine error", error);
    return [];
  }
  return (data as LeaveCorrection[] | null) ?? [];
}

/** Admin: all leave correction requests (RLS admin-only). [] on error. */
export async function fetchAllLeaveCorrections(): Promise<LeaveCorrection[]> {
  const { data, error } = await supabase
    .from("employee_leave_correction_requests")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[leaveCorrections] fetchAll error", error);
    return [];
  }
  return (data as LeaveCorrection[] | null) ?? [];
}

export interface SubmitLeaveCorrectionInput {
  leave_request_id: string;
  correction_type: LeaveCorrectionType;
  correction_reason: string;
  requested_start_date?: string | null;
  requested_end_date?: string | null;
  requested_leave_type?: LeaveType | null;
  requested_partial_day?: boolean | null;
  requested_duration_hours?: number | null;
}

export async function submitMyLeaveCorrection(input: SubmitLeaveCorrectionInput): Promise<string | null> {
  const { error } = await supabase.rpc("submit_my_leave_correction_request", {
    p_leave_request_id: input.leave_request_id,
    p_correction_type: input.correction_type,
    p_correction_reason: input.correction_reason,
    p_requested_start_date: input.requested_start_date ?? null,
    p_requested_end_date: input.requested_end_date ?? null,
    p_requested_leave_type: input.requested_leave_type ?? null,
    p_requested_partial_day: input.requested_partial_day ?? null,
    p_requested_duration_hours: input.requested_duration_hours ?? null,
  });
  return error ? error.message : null;
}

export async function cancelMyLeaveCorrection(requestId: string, reason?: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("cancel_my_leave_correction_request", {
    p_request_id: requestId,
    p_reason: reason ?? null,
  });
  return error ? error.message : null;
}

export async function reviewLeaveCorrection(
  requestId: string,
  decision: "approved" | "rejected",
  managerNote?: string | null,
): Promise<string | null> {
  const { error } = await supabase.rpc("review_leave_correction_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_manager_note: managerNote ?? null,
  });
  return error ? error.message : null;
}

/** Which requested fields are relevant for a given leave-correction type. */
export function leaveCorrectionFields(type: LeaveCorrectionType): {
  dates: boolean; leaveType: boolean; partial: boolean;
} {
  switch (type) {
    case "change_dates":
    case "extend_leave":
      return { dates: true, leaveType: false, partial: false };
    case "change_leave_type":
      return { dates: false, leaveType: true, partial: false };
    case "change_duration":
      return { dates: false, leaveType: false, partial: true };
    default:
      return { dates: false, leaveType: false, partial: false };
  }
}
