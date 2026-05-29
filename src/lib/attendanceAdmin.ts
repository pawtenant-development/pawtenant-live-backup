import { supabase } from "./supabaseClient";

/**
 * Admin-side attendance read helpers (COS-048 Phase 2c).
 *
 * Read-only. No mutation, no clock-entry edit/delete/close. Operational
 * RBAC is enforced server-side by the existing `tce_admin_all`,
 * `esa_admin_all`, `team_members_admin_read`, and
 * `shift_templates_authenticated_read` policies. Non-admin callers will
 * see an empty result set.
 *
 * Embedded PostgREST joins are intentionally avoided — we run a small
 * primary query plus two lookup queries and join in JS. This is
 * resilient to PostgREST schema-cache or FK-name surprises and keeps the
 * query plan obvious.
 */

export interface AttendanceTeamMemberLite {
  id: string;
  display_name: string | null;
  employee_code: string | null;
  is_active: boolean;
}

export interface AttendanceShiftTemplateLite {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
}

export interface AttendanceEntry {
  id: string;
  team_member_id: string;
  assignment_id: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  work_date: string;
  was_late: boolean | null;
  late_minutes: number | null;
  source: string | null;
  member: AttendanceTeamMemberLite | null;
  shift: AttendanceShiftTemplateLite | null;
}

interface RawTimeClockEntry {
  id: string;
  team_member_id: string;
  assignment_id: string | null;
  clock_in_at: string;
  clock_out_at: string | null;
  work_date: string;
  was_late: boolean | null;
  late_minutes: number | null;
  source: string | null;
}

interface RawAssignmentLink {
  id: string;
  shift_template_id: string;
}

/**
 * Fetch the active team_members list (used to populate the employee
 * filter dropdown). Sorted by employee_code ascending so the founders
 * appear first.
 */
export async function fetchActiveTeamMembersList(): Promise<AttendanceTeamMemberLite[]> {
  const { data, error } = await supabase
    .from("team_members")
    .select("id, display_name, employee_code, is_active")
    .eq("is_active", true)
    .order("employee_code", { ascending: true });

  if (error) {
    console.warn("[attendanceAdmin] fetchActiveTeamMembersList error", error);
    return [];
  }

  return (data as AttendanceTeamMemberLite[] | null) ?? [];
}

/**
 * Fetch time_clock_entries for a PKT work_date range, optionally filtered
 * by a single team_member_id. Joins to team_members + shift_templates are
 * done in JS via two follow-up batched lookups.
 *
 * Hard cap of 500 rows mirrors the COS-038 ORDERS_INITIAL_LIMIT discipline.
 */
export async function fetchAttendanceEntries(params: {
  fromWorkDatePkt: string;
  toWorkDatePkt: string;
  teamMemberId?: string | null;
}): Promise<AttendanceEntry[]> {
  const { fromWorkDatePkt, toWorkDatePkt, teamMemberId } = params;

  let q = supabase
    .from("time_clock_entries")
    .select(
      "id, team_member_id, assignment_id, clock_in_at, clock_out_at, work_date, was_late, late_minutes, source",
    )
    .gte("work_date", fromWorkDatePkt)
    .lte("work_date", toWorkDatePkt)
    .order("work_date", { ascending: false })
    .order("clock_in_at", { ascending: false })
    .limit(500);

  if (teamMemberId) {
    q = q.eq("team_member_id", teamMemberId);
  }

  const { data: rawEntries, error } = await q;
  if (error) {
    console.warn("[attendanceAdmin] fetchAttendanceEntries entries error", error);
    return [];
  }

  const entries = (rawEntries as RawTimeClockEntry[] | null) ?? [];
  if (entries.length === 0) return [];

  const memberIds = Array.from(
    new Set(entries.map((e) => e.team_member_id).filter(Boolean)),
  );
  const assignmentIds = Array.from(
    new Set(
      entries
        .map((e) => e.assignment_id)
        .filter((v): v is string => Boolean(v)),
    ),
  );

  const memberPromise = memberIds.length
    ? supabase
        .from("team_members")
        .select("id, display_name, employee_code, is_active")
        .in("id", memberIds)
    : Promise.resolve({ data: [] as AttendanceTeamMemberLite[], error: null });

  const assignmentPromise = assignmentIds.length
    ? supabase
        .from("employee_shift_assignments")
        .select("id, shift_template_id")
        .in("id", assignmentIds)
    : Promise.resolve({ data: [] as RawAssignmentLink[], error: null });

  const [memberRes, assignmentRes] = await Promise.all([
    memberPromise,
    assignmentPromise,
  ]);

  if (memberRes.error) {
    console.warn("[attendanceAdmin] fetchAttendanceEntries members error", memberRes.error);
  }
  if (assignmentRes.error) {
    console.warn("[attendanceAdmin] fetchAttendanceEntries assignments error", assignmentRes.error);
  }

  const memberById = new Map<string, AttendanceTeamMemberLite>();
  for (const m of (memberRes.data as AttendanceTeamMemberLite[] | null) ?? []) {
    memberById.set(m.id, m);
  }

  const assignmentToTemplate = new Map<string, string>();
  for (const a of (assignmentRes.data as RawAssignmentLink[] | null) ?? []) {
    if (a.id && a.shift_template_id) {
      assignmentToTemplate.set(a.id, a.shift_template_id);
    }
  }

  const templateIds = Array.from(new Set(Array.from(assignmentToTemplate.values())));
  const templateById = new Map<string, AttendanceShiftTemplateLite>();
  if (templateIds.length) {
    const { data: rawTemplates, error: templateErr } = await supabase
      .from("shift_templates")
      .select("id, name, start_time, end_time")
      .in("id", templateIds);

    if (templateErr) {
      console.warn("[attendanceAdmin] fetchAttendanceEntries templates error", templateErr);
    }

    for (const t of (rawTemplates as AttendanceShiftTemplateLite[] | null) ?? []) {
      templateById.set(t.id, t);
    }
  }

  return entries.map((e) => {
    const member = memberById.get(e.team_member_id) ?? null;
    let shift: AttendanceShiftTemplateLite | null = null;
    if (e.assignment_id) {
      const tplId = assignmentToTemplate.get(e.assignment_id);
      if (tplId) shift = templateById.get(tplId) ?? null;
    }
    return {
      id: e.id,
      team_member_id: e.team_member_id,
      assignment_id: e.assignment_id,
      clock_in_at: e.clock_in_at,
      clock_out_at: e.clock_out_at,
      work_date: e.work_date,
      was_late: e.was_late,
      late_minutes: e.late_minutes,
      source: e.source,
      member,
      shift,
    };
  });
}

/**
 * Format minutes as e.g. "7h 32m" (whole hours + minutes), or "0m" if
 * the entry is closed but worked < 1 minute. Returns null for open
 * sessions — callers should render an "In progress" pill instead.
 */
export function formatWorkedMinutes(entry: AttendanceEntry): string | null {
  if (!entry.clock_out_at) return null;
  const start = new Date(entry.clock_in_at).getTime();
  const end = new Date(entry.clock_out_at).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "—";
  const minutes = Math.round((end - start) / 60000);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes - h * 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Convenience: shifts a PKT date string ('YYYY-MM-DD') by N days. Used to
 * compute the default 7-day window. Pure string math — no TZ surprises.
 */
export function shiftPktDateString(pktDate: string, deltaDays: number): string {
  const [yStr, mStr, dStr] = pktDate.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return pktDate;
  // Construct as UTC to avoid local-DST drift; we only do +/- whole days.
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
