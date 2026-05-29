import { supabase } from "./supabaseClient";

/**
 * Attendance daily summary / recompute foundation (COS-052).
 *
 * Pure foundation. Manual trigger only. No cron, no payroll, no leave
 * approval, no automation. Owner / admin_manager only — server-side
 * RLS (`ads_admin_all`, `tce_admin_all`, `esa_admin_all`,
 * `team_members_admin_read`, `shift_templates_authenticated_read`,
 * `holidays_authenticated_read`) is the security boundary.
 *
 * Schema sufficiency check (per COS-052):
 *   The existing `attendance_daily_summary` table from COS-046 has
 *   every column the foundation needs:
 *     team_member_id, work_date, assignment_id, was_off_day,
 *     total_worked_minutes, first_clock_in_at, last_clock_out_at,
 *     was_late, late_minutes, was_absent, worked_on_off_day,
 *     computed_at, PK(team_member_id, work_date).
 *   The denormalized convenience columns mentioned in the brief
 *   (shift_template_id, scheduled_start_at, scheduled_end_at, status,
 *   notes) are NOT in the table. Foundation handles this by:
 *     - looking up shift_template via assignment_id at recompute time
 *     - reconstructing scheduled_start/end from work_date + template
 *     - deriving `status` at READ time via classifySummaryStatus()
 *   No SQL change is required for this phase.
 *
 * Overnight shift handling:
 *   work_date is GENERATED from clock_in_at AT TIME ZONE
 *   'Asia/Karachi', so a clock-in at 8:00 PM PKT on 2026-04-28
 *   anchors the entry to work_date = 2026-04-28 even if the shift
 *   ends at 4:00 AM the next calendar day. We use that same anchor
 *   for recompute. Scheduled-start / scheduled-end are reconstructed
 *   from `work_date + shift_template.start_time` and (if
 *   crosses_midnight) `work_date + 1 day + end_time`, in the
 *   template's timezone.
 *
 *   Edge case acknowledged: if an employee on an overnight shift
 *   does NOT clock in until AFTER midnight PKT, work_date will be
 *   the next calendar day rather than the shift's intended start
 *   day. The foundation accepts this as a known limitation;
 *   re-anchoring late clock-ins to the right shift work_date is a
 *   future hardening task and is intentionally NOT solved here.
 *
 * Timezone math is anchored on Asia/Karachi (UTC+05:00, no DST in
 * Pakistan). For any future shift_template with a different
 * timezone, the helper falls back to a +05:00 wall-clock parse and
 * logs a warning. Multi-timezone support is out of scope for COS-052.
 */

const PKT_OFFSET = "+05:00";

/**
 * COS-053 — Shift-window matching tolerance.
 *
 * When recomputing or reading a daily summary for a scheduled
 * employee, only `time_clock_entries` whose `clock_in_at` falls inside
 * `[scheduledStart - WINDOW_EARLY_MINUTES, scheduledEnd + WINDOW_LATE_MINUTES]`
 * are counted toward that work_date's summary. Out-of-window entries
 * on the same `work_date` are surfaced as `out_of_window_count` on
 * `SummaryDisplay` but never affect the stored summary row.
 *
 * Defaults (Pakistan Night Shift example, scheduled 20:00 → 04:00 PKT):
 *   - WINDOW_EARLY_MINUTES = 120  → window starts 18:00 PKT same day
 *   - WINDOW_LATE_MINUTES  = 360  → window ends   10:00 PKT next day
 *
 * A 05:01 PKT clock-in on the work_date is therefore correctly ignored
 * (it's before 18:00 of the same PKT day and outside the shift's
 * matching window).
 */
export const WINDOW_EARLY_MINUTES = 120;
export const WINDOW_LATE_MINUTES = 360;
const WINDOW_EARLY_MS = WINDOW_EARLY_MINUTES * 60_000;
const WINDOW_LATE_MS = WINDOW_LATE_MINUTES * 60_000;

export interface DailySummaryRow {
  team_member_id: string;
  work_date: string;
  assignment_id: string | null;
  was_off_day: boolean;
  total_worked_minutes: number;
  first_clock_in_at: string | null;
  last_clock_out_at: string | null;
  was_late: boolean;
  late_minutes: number;
  was_absent: boolean;
  worked_on_off_day: boolean;
  computed_at: string;
}

export type SummaryStatus =
  | "not_scheduled"
  | "off_day"
  | "holiday"
  | "absent"
  | "incomplete"
  | "late"
  | "present";

export interface SummaryDisplay {
  row: DailySummaryRow;
  status: SummaryStatus;
  member: {
    id: string;
    display_name: string | null;
    employee_code: string | null;
  } | null;
  shift: {
    id: string;
    name: string;
    start_time: string;
    end_time: string;
    crosses_midnight: boolean;
    grace_minutes: number;
    timezone: string;
  } | null;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  is_holiday: boolean;
  /**
   * Count of time_clock_entries on this work_date that fell OUTSIDE
   * the shift's tolerance window (COS-053). 0 when no shift is
   * scheduled or all entries fell inside. Computed at read time;
   * never stored on the summary row.
   */
  out_of_window_count: number;
}

interface ShiftTemplateRow {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  timezone: string | null;
  crosses_midnight: boolean | null;
  grace_minutes: number | null;
  is_active: boolean;
}

interface AssignmentRow {
  id: string;
  team_member_id: string;
  shift_template_id: string;
  weekly_off_days: number[] | null;
  effective_from: string;
  effective_to: string | null;
}

interface ClockEntryRow {
  team_member_id: string;
  clock_in_at: string;
  clock_out_at: string | null;
  work_date: string;
}

interface TeamMemberRow {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  is_active: boolean;
}

interface HolidayRow {
  holiday_date: string;
  name: string;
}

function normalizeTime(value: string): string {
  // Accept "HH:mm" or "HH:mm:ss"; produce "HH:mm:ss".
  if (!value) return "00:00:00";
  return value.length === 5 ? `${value}:00` : value;
}

/**
 * Construct an ISO instant for a wall-clock pktDate + time. The
 * shift_template.timezone is honored when it equals "Asia/Karachi"
 * (the only currently-used value); otherwise we fall back to +05:00
 * and log a warning.
 */
function pktWallClockToInstant(
  pktDate: string,
  hhmmss: string,
  timezone: string | null,
): Date {
  if (timezone && timezone !== "Asia/Karachi") {
    console.warn(
      "[attendanceSummary] non-Asia/Karachi timezone fallback",
      { timezone, pktDate, hhmmss },
    );
  }
  return new Date(`${pktDate}T${normalizeTime(hhmmss)}${PKT_OFFSET}`);
}

function addDaysPkt(pktDate: string, delta: number): string {
  const [yStr, mStr, dStr] = pktDate.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return pktDate;
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + delta);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * PKT day-of-week (0 = Sunday, 6 = Saturday) for a YYYY-MM-DD string.
 * Computed via UTC noon to avoid TZ drift.
 */
function dowOfPktDate(pktDate: string): number {
  const [yStr, mStr, dStr] = pktDate.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return 0;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

interface ComputeContext {
  members: TeamMemberRow[];
  assignmentsByMember: Map<string, AssignmentRow[]>;
  shiftsById: Map<string, ShiftTemplateRow>;
  entriesByMember: Map<string, ClockEntryRow[]>;
  holidayByDate: Map<string, HolidayRow>;
}

interface ComputedSummary {
  row: DailySummaryRow;
  scheduled_start_at: string | null;
  scheduled_end_at: string | null;
  is_holiday: boolean;
  shift: ShiftTemplateRow | null;
}

function computeOneMemberOneDay(
  member: TeamMemberRow,
  pktDate: string,
  ctx: ComputeContext,
  computedAtIso: string,
): ComputedSummary {
  const memberAssignments = ctx.assignmentsByMember.get(member.id) ?? [];
  const assignment =
    memberAssignments.find(
      (a) =>
        a.effective_from <= pktDate &&
        (a.effective_to === null || a.effective_to >= pktDate),
    ) ?? null;

  const shift = assignment
    ? ctx.shiftsById.get(assignment.shift_template_id) ?? null
    : null;

  const dow = dowOfPktDate(pktDate);
  const offByWeekly =
    !!assignment && (assignment.weekly_off_days ?? []).includes(dow);
  const holiday = ctx.holidayByDate.get(pktDate) ?? null;
  const isHoliday = holiday !== null;
  const isOffDay = offByWeekly || isHoliday;

  // Scheduled window — reconstructed from shift template + work_date.
  // Computed BEFORE entry iteration so we can filter clock-ins by the
  // tolerance window (COS-053).
  let scheduledStart: Date | null = null;
  let scheduledEnd: Date | null = null;
  if (shift && shift.is_active) {
    const tz = shift.timezone ?? "Asia/Karachi";
    scheduledStart = pktWallClockToInstant(pktDate, shift.start_time, tz);
    const endDate =
      shift.crosses_midnight === true ? addDaysPkt(pktDate, 1) : pktDate;
    scheduledEnd = pktWallClockToInstant(endDate, shift.end_time, tz);
  }

  // Tolerance window for matching clock-ins to this shift's
  // work_date. When no shift is scheduled, do not filter — status
  // will be `not_scheduled` anyway and an admin may still want to see
  // raw clock activity on that day.
  const hasWindow = scheduledStart !== null && scheduledEnd !== null;
  const windowStartMs = hasWindow
    ? (scheduledStart as Date).getTime() - WINDOW_EARLY_MS
    : Number.NEGATIVE_INFINITY;
  const windowEndMs = hasWindow
    ? (scheduledEnd as Date).getTime() + WINDOW_LATE_MS
    : Number.POSITIVE_INFINITY;

  const memberEntries = ctx.entriesByMember.get(member.id) ?? [];

  // COS-054: for overnight shifts, also accept entries whose
  // GENERATED work_date is pktDate + 1. This re-anchors after-midnight
  // clock-ins that operationally belong to the previous evening's
  // shift (e.g. clock-in at 2026-04-29 01:30 PKT for a 2026-04-28
  // 20:00 → 04:00 shift produces work_date = 2026-04-29 because
  // work_date is GENERATED from `clock_in_at AT TIME ZONE 'Asia/Karachi'`).
  // Double-counting is prevented by the tolerance window: D's window
  // ends 10:00 PKT on D+1 morning, while D+1's window starts at
  // 18:00 PKT same day — the 8-hour gap means no entry's clock_in
  // can fall in both adjacent shifts' windows.
  // For non-overnight shifts and not_scheduled members, candidates
  // are still strictly entries with work_date == pktDate so a
  // not_scheduled row never shows next-day activity.
  const isOvernightShift =
    !!shift && shift.is_active && shift.crosses_midnight === true;
  const pktDateNext = addDaysPkt(pktDate, 1);
  const dayEntries = memberEntries.filter((e) =>
    e.work_date === pktDate ||
    (isOvernightShift && e.work_date === pktDateNext),
  );

  let firstClockIn: Date | null = null;
  let lastClockOut: Date | null = null;
  let totalWorkedMs = 0;
  for (const e of dayEntries) {
    const inAt = new Date(e.clock_in_at);
    const inMs = inAt.getTime();
    // COS-053 + COS-054: ignore entries whose clock_in falls outside
    // the shift-matching tolerance window. The window naturally
    // partitions adjacent overnight shifts so an entry can only be
    // counted toward at most one day.
    if (hasWindow && (inMs < windowStartMs || inMs > windowEndMs)) {
      continue;
    }
    if (!firstClockIn || inAt < firstClockIn) firstClockIn = inAt;
    if (e.clock_out_at) {
      const outAt = new Date(e.clock_out_at);
      if (!lastClockOut || outAt > lastClockOut) lastClockOut = outAt;
      const ms = outAt.getTime() - inAt.getTime();
      if (ms > 0) totalWorkedMs += ms;
    }
  }
  const totalWorkedMinutes = Math.floor(totalWorkedMs / 60000);

  // Lateness: only meaningful if there's a scheduled start AND a
  // clock-in. Off-days / holidays / no-assignment don't get late math.
  let wasLate = false;
  let lateMinutes = 0;
  if (assignment && shift && shift.is_active && firstClockIn && !isOffDay) {
    const grace = shift.grace_minutes ?? 0;
    const threshold = new Date(
      (scheduledStart as Date).getTime() + grace * 60_000,
    );
    if (firstClockIn > threshold) {
      wasLate = true;
      lateMinutes = Math.max(
        0,
        Math.ceil((firstClockIn.getTime() - threshold.getTime()) / 60_000),
      );
    }
  }

  // Absent: scheduled (assignment + non-off-day) AND no clock-in at all.
  const wasAbsent =
    !!assignment && !isOffDay && firstClockIn === null;

  // Worked on off-day: off (weekly off / holiday) AND someone clocked in.
  const workedOnOffDay = isOffDay && firstClockIn !== null;

  const row: DailySummaryRow = {
    team_member_id: member.id,
    work_date: pktDate,
    assignment_id: assignment?.id ?? null,
    was_off_day: isOffDay,
    total_worked_minutes: totalWorkedMinutes,
    first_clock_in_at: firstClockIn ? firstClockIn.toISOString() : null,
    last_clock_out_at: lastClockOut ? lastClockOut.toISOString() : null,
    was_late: wasLate,
    late_minutes: lateMinutes,
    was_absent: wasAbsent,
    worked_on_off_day: workedOnOffDay,
    computed_at: computedAtIso,
  };

  return {
    row,
    scheduled_start_at: scheduledStart ? scheduledStart.toISOString() : null,
    scheduled_end_at: scheduledEnd ? scheduledEnd.toISOString() : null,
    is_holiday: isHoliday,
    shift,
  };
}

/**
 * Read-time classifier. Pure function over a stored summary row plus
 * a couple of contextual flags. Status is derived rather than stored
 * so we don't need a `status` column on the table.
 *
 * Priority order (mutually exclusive):
 *   not_scheduled > holiday > off_day > absent > incomplete > late > present
 */
export function classifySummaryStatus(args: {
  row: DailySummaryRow;
  hasShift: boolean;
  isHoliday: boolean;
}): SummaryStatus {
  const { row, hasShift, isHoliday } = args;
  if (!row.assignment_id || !hasShift) return "not_scheduled";
  if (isHoliday) return "holiday";
  if (row.was_off_day) return "off_day";
  if (row.was_absent) return "absent";
  if (row.first_clock_in_at && !row.last_clock_out_at) return "incomplete";
  if (row.was_late) return "late";
  if (row.first_clock_in_at && row.last_clock_out_at) return "present";
  return "not_scheduled";
}

/**
 * Recompute the daily summary for a single PKT date. If
 * `teamMemberId` is provided, only that member; otherwise every
 * currently-active team_members row. Upserts in batch.
 */
export async function recomputeAttendanceForDay(args: {
  pktDate: string;
  teamMemberId?: string | null;
}): Promise<{ ok: true; recomputed: number } | { error: string }> {
  const { pktDate, teamMemberId } = args;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pktDate)) {
    return { error: "Invalid PKT date — expected YYYY-MM-DD." };
  }

  // 1. Members in scope.
  let memberQuery = supabase
    .from("team_members")
    .select("id, display_name, employee_code, is_active");
  if (teamMemberId) {
    memberQuery = memberQuery.eq("id", teamMemberId);
  } else {
    memberQuery = memberQuery.eq("is_active", true);
  }
  const memberRes = await memberQuery;
  if (memberRes.error) {
    console.warn("[attendanceSummary] members error", memberRes.error);
    return { error: memberRes.error.message || "Could not load team members." };
  }
  const members = (memberRes.data as TeamMemberRow[] | null) ?? [];
  if (members.length === 0) {
    return { ok: true, recomputed: 0 };
  }
  const memberIds = members.map((m) => m.id);

  // 2. Assignments covering this date for these members.
  const assignmentRes = await supabase
    .from("employee_shift_assignments")
    .select("id, team_member_id, shift_template_id, weekly_off_days, effective_from, effective_to")
    .in("team_member_id", memberIds)
    .lte("effective_from", pktDate)
    .or(`effective_to.is.null,effective_to.gte.${pktDate}`);
  if (assignmentRes.error) {
    console.warn("[attendanceSummary] assignments error", assignmentRes.error);
    return { error: assignmentRes.error.message || "Could not load assignments." };
  }
  const assignments = (assignmentRes.data as AssignmentRow[] | null) ?? [];

  // 3. Shift templates referenced by those assignments.
  const shiftIds = Array.from(new Set(assignments.map((a) => a.shift_template_id)));
  const shifts: ShiftTemplateRow[] = [];
  if (shiftIds.length > 0) {
    const shiftRes = await supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time, timezone, crosses_midnight, grace_minutes, is_active")
      .in("id", shiftIds);
    if (shiftRes.error) {
      console.warn("[attendanceSummary] shifts error", shiftRes.error);
      return { error: shiftRes.error.message || "Could not load shift templates." };
    }
    for (const s of (shiftRes.data as ShiftTemplateRow[] | null) ?? []) shifts.push(s);
  }

  // 4. Time clock entries — pull both pktDate AND pktDate + 1 so an
  //    overnight shift on pktDate can pick up after-midnight clock-ins
  //    whose GENERATED work_date is the next PKT calendar day
  //    (COS-054 re-anchoring). Per-member filtering by
  //    crosses_midnight + tolerance window happens inside
  //    computeOneMemberOneDay so non-overnight rows never see
  //    next-day activity.
  const pktDateNextForFetch = addDaysPkt(pktDate, 1);
  const entryRes = await supabase
    .from("time_clock_entries")
    .select("team_member_id, clock_in_at, clock_out_at, work_date")
    .in("team_member_id", memberIds)
    .in("work_date", [pktDate, pktDateNextForFetch]);
  if (entryRes.error) {
    console.warn("[attendanceSummary] entries error", entryRes.error);
    return { error: entryRes.error.message || "Could not load clock entries." };
  }
  const entries = (entryRes.data as ClockEntryRow[] | null) ?? [];

  // 5. Holiday for this date (if any).
  const holidayRes = await supabase
    .from("holidays")
    .select("holiday_date, name")
    .eq("holiday_date", pktDate)
    .maybeSingle();
  if (holidayRes.error) {
    console.warn("[attendanceSummary] holidays error", holidayRes.error);
    // Non-fatal — treat as no holiday.
  }
  const holiday = (holidayRes.data as HolidayRow | null) ?? null;

  // 6. Build context maps.
  const ctx: ComputeContext = {
    members,
    assignmentsByMember: new Map(),
    shiftsById: new Map(),
    entriesByMember: new Map(),
    holidayByDate: new Map(),
  };
  for (const a of assignments) {
    const list = ctx.assignmentsByMember.get(a.team_member_id) ?? [];
    list.push(a);
    ctx.assignmentsByMember.set(a.team_member_id, list);
  }
  // Sort each member's assignments by effective_from DESC so the
  // "most recent" picker matches what clock_in_for_current_user does.
  for (const list of ctx.assignmentsByMember.values()) {
    list.sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1));
  }
  for (const s of shifts) ctx.shiftsById.set(s.id, s);
  for (const e of entries) {
    const list = ctx.entriesByMember.get(e.team_member_id) ?? [];
    list.push(e);
    ctx.entriesByMember.set(e.team_member_id, list);
  }
  if (holiday) ctx.holidayByDate.set(holiday.holiday_date, holiday);

  // 7. Compute + upsert.
  const computedAtIso = new Date().toISOString();
  const summaryRows: DailySummaryRow[] = [];
  for (const m of members) {
    const computed = computeOneMemberOneDay(m, pktDate, ctx, computedAtIso);
    summaryRows.push(computed.row);
  }

  if (summaryRows.length === 0) {
    return { ok: true, recomputed: 0 };
  }

  const upsertRes = await supabase
    .from("attendance_daily_summary")
    .upsert(summaryRows, { onConflict: "team_member_id,work_date" });
  if (upsertRes.error) {
    console.warn("[attendanceSummary] upsert error", upsertRes.error);
    return { error: upsertRes.error.message || "Could not save summary rows." };
  }

  return { ok: true, recomputed: summaryRows.length };
}

/**
 * Read computed daily-summary rows for a PKT date, joined to
 * team_members + shift_templates + holidays for display. Used by the
 * read-back table after recompute.
 */
export async function fetchDailySummariesForDate(args: {
  pktDate: string;
  teamMemberId?: string | null;
}): Promise<SummaryDisplay[]> {
  const { pktDate, teamMemberId } = args;

  let q = supabase
    .from("attendance_daily_summary")
    .select(
      "team_member_id, work_date, assignment_id, was_off_day, total_worked_minutes, first_clock_in_at, last_clock_out_at, was_late, late_minutes, was_absent, worked_on_off_day, computed_at",
    )
    .eq("work_date", pktDate);
  if (teamMemberId) {
    q = q.eq("team_member_id", teamMemberId);
  }

  const rowsRes = await q;
  if (rowsRes.error) {
    console.warn("[attendanceSummary] fetchDailySummariesForDate error", rowsRes.error);
    return [];
  }
  const rows = (rowsRes.data as DailySummaryRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const memberIds = Array.from(new Set(rows.map((r) => r.team_member_id)));
  const assignmentIds = Array.from(
    new Set(rows.map((r) => r.assignment_id).filter((v): v is string => Boolean(v))),
  );

  const memberPromise = memberIds.length
    ? supabase
        .from("team_members")
        .select("id, display_name, employee_code, is_active")
        .in("id", memberIds)
    : Promise.resolve({ data: [] as TeamMemberRow[], error: null });

  const assignmentPromise = assignmentIds.length
    ? supabase
        .from("employee_shift_assignments")
        .select("id, shift_template_id")
        .in("id", assignmentIds)
    : Promise.resolve({ data: [] as { id: string; shift_template_id: string }[], error: null });

  const holidayPromise = supabase
    .from("holidays")
    .select("holiday_date, name")
    .eq("holiday_date", pktDate)
    .maybeSingle();

  // COS-053 + COS-054: also pull the raw clock entries for the date
  // (and the next date for overnight re-anchoring visibility) so we
  // can surface a count of out-of-shift-window entries per row.
  const pktDateNext = addDaysPkt(pktDate, 1);
  const entriesPromise = memberIds.length
    ? supabase
        .from("time_clock_entries")
        .select("team_member_id, clock_in_at, clock_out_at, work_date")
        .in("team_member_id", memberIds)
        .in("work_date", [pktDate, pktDateNext])
    : Promise.resolve({ data: [] as ClockEntryRow[], error: null });

  const [memberRes, assignmentRes, holidayRes, entriesRes] = await Promise.all([
    memberPromise,
    assignmentPromise,
    holidayPromise,
    entriesPromise,
  ]);

  const memberById = new Map<string, TeamMemberRow>();
  for (const m of (memberRes.data as TeamMemberRow[] | null) ?? []) memberById.set(m.id, m);

  const assignmentToTemplate = new Map<string, string>();
  for (const a of (assignmentRes.data as { id: string; shift_template_id: string }[] | null) ?? []) {
    assignmentToTemplate.set(a.id, a.shift_template_id);
  }

  const templateIds = Array.from(new Set(Array.from(assignmentToTemplate.values())));
  const templateById = new Map<string, ShiftTemplateRow>();
  if (templateIds.length > 0) {
    const tplRes = await supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time, timezone, crosses_midnight, grace_minutes, is_active")
      .in("id", templateIds);
    for (const t of (tplRes.data as ShiftTemplateRow[] | null) ?? []) {
      templateById.set(t.id, t);
    }
  }

  const isHoliday = (holidayRes.data as HolidayRow | null) !== null;

  // COS-053: index entries by member for the out-of-window count.
  const entriesByMember = new Map<string, ClockEntryRow[]>();
  for (const e of (entriesRes.data as ClockEntryRow[] | null) ?? []) {
    const list = entriesByMember.get(e.team_member_id) ?? [];
    list.push(e);
    entriesByMember.set(e.team_member_id, list);
  }

  return rows.map((row) => {
    const member = memberById.get(row.team_member_id) ?? null;
    let shift: ShiftTemplateRow | null = null;
    if (row.assignment_id) {
      const tplId = assignmentToTemplate.get(row.assignment_id);
      if (tplId) shift = templateById.get(tplId) ?? null;
    }
    let scheduled_start_at: string | null = null;
    let scheduled_end_at: string | null = null;
    let windowStartMs = Number.NEGATIVE_INFINITY;
    let windowEndMs = Number.POSITIVE_INFINITY;
    if (shift && shift.is_active) {
      const tz = shift.timezone ?? "Asia/Karachi";
      const startInstant = pktWallClockToInstant(
        row.work_date,
        shift.start_time,
        tz,
      );
      const endDate =
        shift.crosses_midnight === true ? addDaysPkt(row.work_date, 1) : row.work_date;
      const endInstant = pktWallClockToInstant(endDate, shift.end_time, tz);
      scheduled_start_at = startInstant.toISOString();
      scheduled_end_at = endInstant.toISOString();
      windowStartMs = startInstant.getTime() - WINDOW_EARLY_MS;
      windowEndMs = endInstant.getTime() + WINDOW_LATE_MS;
    }

    // COS-053 + COS-054: count entries that fell OUTSIDE the shift's
    // tolerance window. Only meaningful when a scheduled window
    // exists; for not_scheduled members this stays 0.
    // Candidate scope:
    //   - overnight shift: entries on work_date OR work_date + 1
    //   - non-overnight  : entries on work_date only
    // This keeps the count meaningful: re-anchored next-day entries
    // that DID get captured for D's window aren't double-flagged on
    // D+1 (they're outside D+1's window but they were the
    // intentional re-anchor case for D).
    let outOfWindowCount = 0;
    if (shift && shift.is_active) {
      const isOvernightShift = shift.crosses_midnight === true;
      const memberEntries = entriesByMember.get(row.team_member_id) ?? [];
      for (const e of memberEntries) {
        if (
          e.work_date !== row.work_date &&
          !(isOvernightShift && e.work_date === pktDateNext)
        ) {
          continue;
        }
        const inMs = new Date(e.clock_in_at).getTime();
        if (inMs < windowStartMs || inMs > windowEndMs) outOfWindowCount += 1;
      }
    }

    return {
      row,
      status: classifySummaryStatus({
        row,
        hasShift: shift !== null && shift.is_active,
        isHoliday,
      }),
      member: member
        ? {
            id: member.id,
            display_name: member.display_name,
            employee_code: member.employee_code,
          }
        : null,
      shift: shift
        ? {
            id: shift.id,
            name: shift.name,
            start_time: shift.start_time,
            end_time: shift.end_time,
            crosses_midnight: shift.crosses_midnight === true,
            grace_minutes: shift.grace_minutes ?? 0,
            timezone: shift.timezone ?? "Asia/Karachi",
          }
        : null,
      scheduled_start_at,
      scheduled_end_at,
      is_holiday: isHoliday,
      out_of_window_count: outOfWindowCount,
    };
  });
}

/**
 * Display label for a SummaryStatus. UI badge tone is derived in the
 * component (kept out of the lib so styling stays in components).
 */
export function summaryStatusLabel(s: SummaryStatus): string {
  switch (s) {
    case "present":
      return "Present";
    case "late":
      return "Late";
    case "incomplete":
      return "Incomplete";
    case "absent":
      return "Absent";
    case "off_day":
      return "Off day";
    case "holiday":
      return "Holiday";
    case "not_scheduled":
      return "Not scheduled";
  }
}

/**
 * Format minutes as "Hh Mm" / "Mm" / "—". Mirrors attendanceAdmin's
 * formatWorkedMinutes style but works on a numeric input.
 */
export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null) return "—";
  if (mins <= 0) return "0m";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins - h * 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
