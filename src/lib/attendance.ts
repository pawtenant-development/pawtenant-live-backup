import { supabase } from "./supabaseClient";
import { pktDateString } from "./timezones";

export interface OpenTimeClockEntry {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  was_late: boolean | null;
  late_minutes: number | null;
}

export interface ActiveShiftAssignment {
  id: string;
  shift_template_id: string;
  effective_from: string;
  effective_to: string | null;
  weekly_off_days: number[] | null;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  timezone: string | null;
  crosses_midnight: boolean | null;
  grace_minutes: number | null;
  is_active: boolean;
}

export interface TodayShiftContext {
  openEntry: OpenTimeClockEntry | null;
  assignment: ActiveShiftAssignment | null;
  shift: ShiftTemplate | null;
}

/**
 * Read the caller's current attendance context for "today" (PKT).
 *
 * - `openEntry`  : the caller's currently open `time_clock_entries` row, if any.
 * - `assignment` : the caller's active `employee_shift_assignments` row whose
 *                  effective range covers today's PKT calendar date.
 * - `shift`      : the linked `shift_templates` row, if the assignment exists
 *                  and the template is active.
 *
 * RLS already enforces self-only visibility on all three tables, so this is
 * safe to call as the authenticated user. Errors are logged and surfaced as
 * `null` values; the caller decides how to render.
 */
export async function fetchTodayShiftContext(
  teamMemberId: string,
): Promise<TodayShiftContext> {
  const todayPkt = pktDateString(new Date());

  const openEntryPromise = supabase
    .from("time_clock_entries")
    .select("id, clock_in_at, clock_out_at, was_late, late_minutes")
    .eq("team_member_id", teamMemberId)
    .is("clock_out_at", null)
    .maybeSingle();

  const assignmentPromise = supabase
    .from("employee_shift_assignments")
    .select("id, shift_template_id, effective_from, effective_to, weekly_off_days")
    .eq("team_member_id", teamMemberId)
    .lte("effective_from", todayPkt)
    .or(`effective_to.is.null,effective_to.gte.${todayPkt}`)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [openEntryRes, assignmentRes] = await Promise.all([
    openEntryPromise,
    assignmentPromise,
  ]);

  if (openEntryRes.error) {
    console.warn("[attendance] fetchTodayShiftContext openEntry error", openEntryRes.error);
  }
  if (assignmentRes.error) {
    console.warn("[attendance] fetchTodayShiftContext assignment error", assignmentRes.error);
  }

  const openEntry = (openEntryRes.data as OpenTimeClockEntry | null) ?? null;
  const assignment = (assignmentRes.data as ActiveShiftAssignment | null) ?? null;

  let shift: ShiftTemplate | null = null;
  if (assignment?.shift_template_id) {
    const shiftRes = await supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time, timezone, crosses_midnight, grace_minutes, is_active")
      .eq("id", assignment.shift_template_id)
      .maybeSingle();

    if (shiftRes.error) {
      console.warn("[attendance] fetchTodayShiftContext shift error", shiftRes.error);
    } else {
      shift = (shiftRes.data as ShiftTemplate | null) ?? null;
    }
  }

  return { openEntry, assignment, shift };
}

/**
 * Idempotent clock-in via the `clock_in_for_current_user` RPC.
 *
 * Returns the new (or pre-existing open) `time_clock_entries.id` on success,
 * or `null` if the RPC errored. Callers should refetch context after this
 * resolves to get the canonical state.
 */
export async function clockInCurrentUser(): Promise<string | null> {
  const { data, error } = await supabase.rpc("clock_in_for_current_user");
  if (error) {
    console.warn("[attendance] clockInCurrentUser error", error);
    return null;
  }
  return (data as string | null) ?? null;
}

/**
 * Clock-out via the `clock_out_for_current_user` RPC.
 *
 * Returns the closed `time_clock_entries.id` on success, or `null` if there
 * was no open session (no-op) or the RPC errored.
 */
export async function clockOutCurrentUser(): Promise<string | null> {
  const { data, error } = await supabase.rpc("clock_out_for_current_user");
  if (error) {
    console.warn("[attendance] clockOutCurrentUser error", error);
    return null;
  }
  return (data as string | null) ?? null;
}

/** A single time-clock entry for the employee dashboard's attendance card. */
export interface TodayAttendanceEntry {
  id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  was_late: boolean | null;
  late_minutes: number | null;
}

/**
 * Read the caller's most recent `time_clock_entries` row whose PKT `work_date`
 * is today. Returns the row whether it is open (in progress) or closed.
 *
 * Self-only by RLS (`tce_self_read`). Returns `null` when there is no entry for
 * today or on error. Used by the /company "Today's Attendance" card.
 */
export async function fetchMyTodayAttendance(
  teamMemberId: string,
): Promise<TodayAttendanceEntry | null> {
  const todayPkt = pktDateString(new Date());
  const { data, error } = await supabase
    .from("time_clock_entries")
    .select("id, clock_in_at, clock_out_at, was_late, late_minutes")
    .eq("team_member_id", teamMemberId)
    .eq("work_date", todayPkt)
    .order("clock_in_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[attendance] fetchMyTodayAttendance error", error);
    return null;
  }
  return (data as TodayAttendanceEntry | null) ?? null;
}

/**
 * True when the caller currently has an OPEN time-clock session (any
 * `time_clock_entries` row with `clock_out_at IS NULL`), regardless of which
 * `work_date` it belongs to. Mirrors the `is_clocked_in` flag computed by
 * `get_team_presence()` so the employee presence dot stays consistent.
 *
 * Self-only by RLS. Returns `false` on error.
 */
export async function isCurrentlyClockedIn(teamMemberId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("time_clock_entries")
    .select("id")
    .eq("team_member_id", teamMemberId)
    .is("clock_out_at", null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[attendance] isCurrentlyClockedIn error", error);
    return false;
  }
  return !!data;
}
