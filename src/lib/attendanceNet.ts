import { supabase } from "./supabaseClient";

// Company OS — Attendance net worked time. Read-only wrappers over the
// SECURITY DEFINER RPCs (get_my_today_attendance_summary,
// get_my_attendance_summary_range, get_team_attendance_summary_for_date).
// gross − break = net. Live values include open clock + active break elapsed.
// Employee RPCs return own data only; team RPC is admin-only (server-enforced).

export interface DayAttendanceSummary {
  work_date: string;
  gross_seconds: number;
  break_seconds: number;
  net_seconds: number;
  first_clock_in: string | null;
  last_clock_out: string | null;
  active_clocked_in: boolean;
  active_break: boolean;
  break_count: number;
  // Timesheet adjustment overlay (applied, non-reversed). Default 0 / false when
  // no adjustments exist so existing UI stays unchanged.
  gross_adjustment_seconds: number;
  break_adjustment_seconds: number;
  net_adjustment_seconds: number;
  adjusted_gross_seconds: number;
  adjusted_break_seconds: number;
  adjusted_net_worked_seconds: number;
  has_adjustments: boolean;
}

export interface TeamAttendanceSummaryRow extends DayAttendanceSummary {
  team_member_id: string;
  display_name: string | null;
  employee_code: string | null;
  title: string | null;
  domain_role: string | null;
  on_leave: boolean;
}

function toNum(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDay(r: Record<string, unknown>): DayAttendanceSummary {
  const gross = toNum(r.gross_seconds);
  const brk = toNum(r.break_seconds);
  const gAdj = toNum(r.gross_adjustment_seconds);
  const bAdj = toNum(r.break_adjustment_seconds);
  return {
    work_date: (r.work_date as string) ?? "",
    gross_seconds: gross,
    break_seconds: brk,
    net_seconds: toNum(r.net_seconds),
    first_clock_in: (r.first_clock_in as string | null) ?? null,
    last_clock_out: (r.last_clock_out as string | null) ?? null,
    active_clocked_in: r.active_clocked_in === true,
    active_break: r.active_break === true,
    break_count: toNum(r.break_count),
    gross_adjustment_seconds: gAdj,
    break_adjustment_seconds: bAdj,
    net_adjustment_seconds: r.net_adjustment_seconds != null ? toNum(r.net_adjustment_seconds) : gAdj - bAdj,
    adjusted_gross_seconds: r.adjusted_gross_seconds != null ? toNum(r.adjusted_gross_seconds) : gross + gAdj,
    adjusted_break_seconds: r.adjusted_break_seconds != null ? toNum(r.adjusted_break_seconds) : brk + bAdj,
    adjusted_net_worked_seconds: r.adjusted_net_worked_seconds != null
      ? toNum(r.adjusted_net_worked_seconds)
      : Math.max(0, (gross + gAdj) - (brk + bAdj)),
    has_adjustments: r.has_adjustments === true,
  };
}

/** Signed seconds as "+Xh Ym" / "−Xh Ym" / "0m". */
export function fmtSigned(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "−" : "+";
  const s = Math.abs(Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const body = h > 0 ? (m === 0 ? `${h}h` : `${h}h ${m}m`) : `${m}m`;
  return totalSeconds === 0 ? "0m" : `${sign}${body}`;
}

/** Caller's today summary (PKT). null on error. */
export async function fetchMyTodaySummary(): Promise<DayAttendanceSummary | null> {
  const { data, error } = await supabase.rpc("get_my_today_attendance_summary");
  if (error) {
    console.warn("[attendanceNet] fetchMyTodaySummary error", error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  return row ? normalizeDay(row as Record<string, unknown>) : null;
}

/** Caller's per-day summaries for a PKT range (inclusive). [] on error. */
export async function fetchMySummaryRange(startDate: string, endDate: string): Promise<DayAttendanceSummary[]> {
  const { data, error } = await supabase.rpc("get_my_attendance_summary_range", {
    p_start: startDate,
    p_end: endDate,
  });
  if (error) {
    console.warn("[attendanceNet] fetchMySummaryRange error", error);
    return [];
  }
  return ((data as Record<string, unknown>[] | null) ?? []).map(normalizeDay);
}

/** Admin: team summary for one PKT date. [] on error / not authorized. */
export async function fetchTeamSummaryForDate(date: string): Promise<TeamAttendanceSummaryRow[]> {
  const { data, error } = await supabase.rpc("get_team_attendance_summary_for_date", { p_date: date });
  if (error) {
    console.warn("[attendanceNet] fetchTeamSummaryForDate error", error);
    return [];
  }
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    ...normalizeDay(r),
    team_member_id: (r.team_member_id as string) ?? "",
    display_name: (r.display_name as string | null) ?? null,
    employee_code: (r.employee_code as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    domain_role: (r.domain_role as string | null) ?? null,
    on_leave: r.on_leave === true,
  }));
}

/** Live net seconds: gross/break may include open/active elapsed already from the
 *  RPC snapshot, so net is just the stored difference (never negative). */
export function netSeconds(s: DayAttendanceSummary): number {
  return Math.max(0, s.net_seconds);
}

/** Format seconds as "Xh Ym" / "Ym" / "0m". */
export function fmtHrsMins(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m === 0 ? `${h}h` : `${h}h ${m}m`;
  return `${m}m`;
}

/** Short weekday + day label for a PKT 'YYYY-MM-DD' (stable across TZs). */
export function fmtDayLabel(pktDate: string): string {
  if (!pktDate) return "";
  const [y, m, d] = pktDate.split("-").map(Number);
  if (!y || !m || !d) return pktDate;
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Add whole days to a PKT 'YYYY-MM-DD' string (no TZ drift). */
export function shiftPktDay(pktDate: string, delta: number): string {
  const [y, m, d] = pktDate.split("-").map(Number);
  if (!y || !m || !d) return pktDate;
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + delta);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
