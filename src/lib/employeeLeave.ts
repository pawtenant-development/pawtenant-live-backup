import { supabase } from "./supabaseClient";

// Company OS — Employee Leave & Absence Requests.
// Employees submit/cancel their OWN requests (SECURITY DEFINER RPCs).
// Admin (owner/admin_manager + is_admin) reads all (RLS) and reviews via RPC.
// Employees can only read their own rows (RLS). Not linked to payroll yet.

export type LeaveType =
  | "annual"
  | "sick"
  | "casual"
  | "emergency"
  | "unpaid"
  | "half_day"
  | "work_from_home"
  | "other";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

export const LEAVE_TYPES: LeaveType[] = [
  "annual",
  "sick",
  "casual",
  "emergency",
  "unpaid",
  "half_day",
  "work_from_home",
  "other",
];

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Annual",
  sick: "Sick",
  casual: "Casual",
  emergency: "Emergency",
  unpaid: "Unpaid",
  half_day: "Half Day",
  work_from_home: "Work From Home",
  other: "Other",
};

/** Inclusive whole-day count for a leave range (1 for same-day / partial). */
export function leaveDayCount(startDate: string, endDate: string, partialDay = false): number {
  if (!startDate || !endDate) return 0;
  if (partialDay) return 1;
  const s = new Date(`${startDate}T00:00:00`);
  const e = new Date(`${endDate}T00:00:00`);
  const diff = Math.round((e.getTime() - s.getTime()) / 86400000);
  return diff >= 0 ? diff + 1 : 0;
}

/** True when two inclusive [start,end] date ranges overlap. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export const LEAVE_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

/** Tailwind tone classes per status badge. */
export const LEAVE_STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

export interface LeaveRequest {
  id: string;
  team_member_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  partial_day: boolean;
  partial_day_hours: number | null;
  reason: string | null;
  status: string;
  employee_note: string | null;
  manager_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLS =
  "id, team_member_id, leave_type, start_date, end_date, partial_day, partial_day_hours, reason, status, employee_note, manager_note, reviewed_by, reviewed_at, cancelled_by, cancelled_at, created_at, updated_at";

/** Current employee's own leave requests (RLS self-read). Returns [] on error. */
export async function fetchMyLeaveRequests(teamMemberId: string): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from("employee_leave_requests")
    .select(SELECT_COLS)
    .eq("team_member_id", teamMemberId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[employeeLeave] fetchMyLeaveRequests error", error);
    return [];
  }
  return (data as LeaveRequest[] | null) ?? [];
}

/** Admin: all leave requests (RLS admin-only read-all). Returns [] on error. */
export async function fetchAllLeaveRequests(): Promise<LeaveRequest[]> {
  const { data, error } = await supabase
    .from("employee_leave_requests")
    .select(SELECT_COLS)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[employeeLeave] fetchAllLeaveRequests error", error);
    return [];
  }
  return (data as LeaveRequest[] | null) ?? [];
}

export interface SubmitLeaveInput {
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  partial_day: boolean;
  partial_day_hours?: number | null;
  reason?: string | null;
  employee_note?: string | null;
}

/** Employee submits a new leave request (status 'pending'). Error message or null. */
export async function submitMyLeaveRequest(input: SubmitLeaveInput): Promise<string | null> {
  const { error } = await supabase.rpc("submit_my_leave_request", {
    p_leave_type: input.leave_type,
    p_start_date: input.start_date,
    p_end_date: input.end_date,
    p_partial_day: input.partial_day,
    p_partial_day_hours: input.partial_day ? input.partial_day_hours ?? null : null,
    p_reason: input.reason ?? null,
    p_employee_note: input.employee_note ?? null,
  });
  return error ? error.message : null;
}

/** Employee cancels their OWN pending request. Error message or null. */
export async function cancelMyLeaveRequest(requestId: string): Promise<string | null> {
  const { error } = await supabase.rpc("cancel_my_leave_request", { p_request_id: requestId });
  return error ? error.message : null;
}

/** Admin approves/rejects a pending request with an optional note. Error message or null. */
export async function reviewLeaveRequest(
  requestId: string,
  status: "approved" | "rejected",
  managerNote?: string | null,
): Promise<string | null> {
  const { error } = await supabase.rpc("review_employee_leave_request", {
    p_request_id: requestId,
    p_status: status,
    p_manager_note: managerNote ?? null,
  });
  return error ? error.message : null;
}

/** True when an approved request's date range covers today (local date). */
export function isApprovedLeaveToday(r: LeaveRequest, today = new Date()): boolean {
  if (r.status !== "approved") return false;
  const d = today.toISOString().slice(0, 10);
  return r.start_date <= d && r.end_date >= d;
}
