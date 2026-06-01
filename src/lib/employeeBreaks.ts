import { supabase } from "./supabaseClient";
import { pktDateString } from "./timezones";

// Company OS — Employee Break / Lunch / Away tracking (true break timer).
// Employees start/end their OWN breaks via SECURITY DEFINER RPCs; reads are
// gated by RLS (own rows for employees; all rows for admin). Presence is
// updated by the RPCs. Not linked to payroll; does not change Time In/Out.

export type BreakType =
  | "break"
  | "lunch"
  | "washroom"
  | "away"
  | "meeting"
  | "prayer"
  | "other";

export type BreakStatus = "active" | "completed" | "cancelled";

export const BREAK_TYPES: BreakType[] = [
  "break",
  "lunch",
  "washroom",
  "away",
  "meeting",
  "prayer",
  "other",
];

export const BREAK_TYPE_LABEL: Record<string, string> = {
  break: "Break",
  lunch: "Lunch",
  washroom: "Washroom",
  away: "Away",
  meeting: "Meeting",
  prayer: "Prayer",
  other: "Other",
};

export const BREAK_TYPE_ICON: Record<string, string> = {
  break: "ri-cup-line",
  lunch: "ri-restaurant-line",
  washroom: "ri-drop-line",
  away: "ri-walk-line",
  meeting: "ri-group-line",
  prayer: "ri-moon-line",
  other: "ri-more-line",
};

export interface BreakRecord {
  id: string;
  team_member_id: string;
  time_clock_entry_id: string | null;
  break_type: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  employee_note: string | null;
  created_at: string;
}

const SELECT_COLS =
  "id, team_member_id, time_clock_entry_id, break_type, status, started_at, ended_at, duration_seconds, employee_note, created_at";

/** The caller's break records (RLS self-read). Returns [] on error. */
export async function fetchMyBreakRecords(teamMemberId: string, limit = 50): Promise<BreakRecord[]> {
  const { data, error } = await supabase
    .from("employee_break_records")
    .select(SELECT_COLS)
    .eq("team_member_id", teamMemberId)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[employeeBreaks] fetchMyBreakRecords error", error);
    return [];
  }
  return (data as BreakRecord[] | null) ?? [];
}

/** Admin: all break records, newest first (RLS admin-only). Returns [] on error. */
export async function fetchAllBreakRecords(limit = 500): Promise<BreakRecord[]> {
  const { data, error } = await supabase
    .from("employee_break_records")
    .select(SELECT_COLS)
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[employeeBreaks] fetchAllBreakRecords error", error);
    return [];
  }
  return (data as BreakRecord[] | null) ?? [];
}

/** Start a break (employee must be clocked in). Error message or null. */
export async function startMyBreak(breakType: BreakType, note?: string | null): Promise<string | null> {
  const { error } = await supabase.rpc("start_my_break", {
    p_break_type: breakType,
    p_employee_note: note ?? null,
  });
  return error ? error.message : null;
}

/** End the caller's active break. Error message or null. */
export async function endMyBreak(): Promise<string | null> {
  const { error } = await supabase.rpc("end_my_break");
  return error ? error.message : null;
}

/** Cancel (discard) the caller's active break. Error message or null. */
export async function cancelMyBreak(recordId: string): Promise<string | null> {
  const { error } = await supabase.rpc("cancel_my_break", { p_record_id: recordId });
  return error ? error.message : null;
}

/** True when this record's PKT start day is today. */
export function isToday(r: BreakRecord, now = new Date()): boolean {
  return pktDateString(new Date(r.started_at)) === pktDateString(now);
}

/** The single active break in a list, if any. */
export function activeBreak(records: BreakRecord[]): BreakRecord | null {
  return records.find((r) => r.status === "active") ?? null;
}

/**
 * Total break seconds for today (PKT). Completed/cancelled breaks contribute
 * their stored duration; an active break contributes live elapsed time (now -
 * started_at). Only breaks whose PKT start day is today are counted.
 */
export function todayBreakSeconds(records: BreakRecord[], nowMs = Date.now()): number {
  const now = new Date(nowMs);
  let total = 0;
  for (const r of records) {
    if (!isToday(r, now)) continue;
    if (r.status === "active") {
      total += Math.max(0, Math.floor((nowMs - new Date(r.started_at).getTime()) / 1000));
    } else if (r.duration_seconds != null) {
      total += r.duration_seconds;
    }
  }
  return total;
}

/** Today's completed/cancelled + active break records (PKT), newest first. */
export function todayBreaks(records: BreakRecord[], now = new Date()): BreakRecord[] {
  return records.filter((r) => isToday(r, now));
}

/** Format seconds as HH:MM. */
export function fmtHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Format seconds as "Xh Ym" / "Ym" / "Xs". */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
