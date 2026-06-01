import { supabase } from "./supabaseClient";

// Company OS — Attendance correction requests. Employees submit/cancel their own
// (SECURITY DEFINER RPCs); admin reviews. Reads gated by RLS (own / admin-all).
// Approval is a decision record only — it does NOT mutate time_clock_entries or
// employee_break_records. Not payroll.

export type AttendanceCorrectionType =
  | "missed_clock_in"
  | "missed_clock_out"
  | "wrong_clock_in"
  | "wrong_clock_out"
  | "missed_break_start"
  | "missed_break_end"
  | "wrong_break"
  | "other";

export type CorrectionStatus = "pending" | "approved" | "rejected" | "cancelled";

export const ATT_CORRECTION_TYPES: AttendanceCorrectionType[] = [
  "missed_clock_in",
  "missed_clock_out",
  "wrong_clock_in",
  "wrong_clock_out",
  "missed_break_start",
  "missed_break_end",
  "wrong_break",
  "other",
];

export const ATT_CORRECTION_TYPE_LABEL: Record<string, string> = {
  missed_clock_in: "Missed clock-in",
  missed_clock_out: "Missed clock-out",
  wrong_clock_in: "Wrong clock-in time",
  wrong_clock_out: "Wrong clock-out time",
  missed_break_start: "Missed break start",
  missed_break_end: "Missed break end",
  wrong_break: "Wrong break duration/time",
  other: "Other attendance issue",
};

export const CORRECTION_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export const CORRECTION_STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

export interface AttendanceCorrection {
  id: string;
  team_member_id: string;
  correction_date: string;
  correction_type: string;
  requested_clock_in: string | null;
  requested_clock_out: string | null;
  requested_break_start: string | null;
  requested_break_end: string | null;
  requested_break_minutes: number | null;
  reason: string;
  employee_note: string | null;
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
  "id, team_member_id, correction_date, correction_type, requested_clock_in, requested_clock_out, requested_break_start, requested_break_end, requested_break_minutes, reason, employee_note, status, manager_note, reviewed_by, reviewed_at, cancelled_at, cancelled_reason, created_at, updated_at";

/** Caller's own attendance correction requests (RLS self-read). [] on error. */
export async function fetchMyAttendanceCorrections(teamMemberId: string): Promise<AttendanceCorrection[]> {
  const { data, error } = await supabase
    .from("employee_attendance_correction_requests")
    .select(COLS)
    .eq("team_member_id", teamMemberId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[attendanceCorrections] fetchMine error", error);
    return [];
  }
  return (data as AttendanceCorrection[] | null) ?? [];
}

/** Admin: all attendance correction requests (RLS admin-only). [] on error. */
export async function fetchAllAttendanceCorrections(): Promise<AttendanceCorrection[]> {
  const { data, error } = await supabase
    .from("employee_attendance_correction_requests")
    .select(COLS)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[attendanceCorrections] fetchAll error", error);
    return [];
  }
  return (data as AttendanceCorrection[] | null) ?? [];
}

export interface SubmitAttendanceCorrectionInput {
  correction_date: string;
  correction_type: AttendanceCorrectionType;
  reason: string;
  requested_clock_in?: string | null;
  requested_clock_out?: string | null;
  requested_break_start?: string | null;
  requested_break_end?: string | null;
  requested_break_minutes?: number | null;
  employee_note?: string | null;
}

export async function submitMyAttendanceCorrection(input: SubmitAttendanceCorrectionInput): Promise<string | null> {
  const { error } = await supabase.rpc("submit_my_attendance_correction_request", {
    p_correction_date: input.correction_date,
    p_correction_type: input.correction_type,
    p_reason: input.reason,
    p_requested_clock_in: input.requested_clock_in ?? null,
    p_requested_clock_out: input.requested_clock_out ?? null,
    p_requested_break_start: input.requested_break_start ?? null,
    p_requested_break_end: input.requested_break_end ?? null,
    p_requested_break_minutes: input.requested_break_minutes ?? null,
    p_employee_note: input.employee_note ?? null,
  });
  return error ? error.message : null;
}

export async function cancelMyAttendanceCorrection(requestId: string, reason?: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("cancel_my_attendance_correction_request", {
    p_request_id: requestId,
    p_reason: reason ?? null,
  });
  return error ? error.message : null;
}

export async function reviewAttendanceCorrection(
  requestId: string,
  decision: "approved" | "rejected",
  managerNote?: string | null,
): Promise<string | null> {
  const { error } = await supabase.rpc("review_attendance_correction_request", {
    p_request_id: requestId,
    p_decision: decision,
    p_manager_note: managerNote ?? null,
  });
  return error ? error.message : null;
}

/** Which requested fields are relevant for a given correction type (drives the form). */
export function correctionFields(type: AttendanceCorrectionType): {
  clockIn: boolean; clockOut: boolean; breakStart: boolean; breakEnd: boolean; breakMinutes: boolean;
} {
  switch (type) {
    case "missed_clock_in":
    case "wrong_clock_in":
      return { clockIn: true, clockOut: false, breakStart: false, breakEnd: false, breakMinutes: false };
    case "missed_clock_out":
    case "wrong_clock_out":
      return { clockIn: false, clockOut: true, breakStart: false, breakEnd: false, breakMinutes: false };
    case "missed_break_start":
      return { clockIn: false, clockOut: false, breakStart: true, breakEnd: false, breakMinutes: false };
    case "missed_break_end":
      return { clockIn: false, clockOut: false, breakStart: false, breakEnd: true, breakMinutes: false };
    case "wrong_break":
      return { clockIn: false, clockOut: false, breakStart: true, breakEnd: true, breakMinutes: true };
    default:
      return { clockIn: false, clockOut: false, breakStart: false, breakEnd: false, breakMinutes: false };
  }
}
