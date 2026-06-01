import { supabase } from "./supabaseClient";

// Company OS — Adjusted timesheet report (read-only, admin). Per employee/day
// raw + applied-adjusted attendance metrics over a date range, with leave /
// correction / adjustment counts. NO salary / pay / payroll data anywhere.
// CSV export mirrors exportAccounts.ts style (UTF-8 BOM + CRLF, Excel-friendly).

export interface TimesheetDailyRow {
  team_member_id: string;
  display_name: string | null;
  employee_code: string | null;
  title: string | null;
  domain_role: string | null;
  work_date: string;
  gross_seconds: number;
  break_seconds: number;
  net_seconds: number;
  gross_adjustment_seconds: number;
  break_adjustment_seconds: number;
  net_adjustment_seconds: number;
  adjusted_gross_seconds: number;
  adjusted_break_seconds: number;
  adjusted_net_seconds: number;
  clock_sessions: number;
  break_sessions: number;
  applied_adjustments: number;
  reversed_adjustments: number;
  on_leave: boolean;
  pending_corrections: number;
  approved_corrections: number;
  has_open_session: boolean;
}

export interface EmployeeTimesheetSummary {
  team_member_id: string;
  display_name: string | null;
  employee_code: string | null;
  title: string | null;
  domain_role: string | null;
  gross_seconds: number;
  break_seconds: number;
  net_seconds: number;
  gross_adjustment_seconds: number;
  break_adjustment_seconds: number;
  net_adjustment_seconds: number;
  adjusted_gross_seconds: number;
  adjusted_break_seconds: number;
  adjusted_net_seconds: number;
  clock_sessions: number;
  break_sessions: number;
  applied_adjustments: number;
  reversed_adjustments: number;
  leave_days: number;
  pending_corrections: number;
  approved_corrections: number;
  has_adjustments: boolean;
  has_approved_leave: boolean;
  has_pending_correction: boolean;
  has_open_session: boolean;
  days: TimesheetDailyRow[];
}

function toNum(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

function normalizeRow(r: Record<string, unknown>): TimesheetDailyRow {
  return {
    team_member_id: (r.team_member_id as string) ?? "",
    display_name: (r.display_name as string | null) ?? null,
    employee_code: (r.employee_code as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    domain_role: (r.domain_role as string | null) ?? null,
    work_date: (r.work_date as string) ?? "",
    gross_seconds: toNum(r.gross_seconds),
    break_seconds: toNum(r.break_seconds),
    net_seconds: toNum(r.net_seconds),
    gross_adjustment_seconds: toNum(r.gross_adjustment_seconds),
    break_adjustment_seconds: toNum(r.break_adjustment_seconds),
    net_adjustment_seconds: toNum(r.net_adjustment_seconds),
    adjusted_gross_seconds: toNum(r.adjusted_gross_seconds),
    adjusted_break_seconds: toNum(r.adjusted_break_seconds),
    adjusted_net_seconds: toNum(r.adjusted_net_seconds),
    clock_sessions: toNum(r.clock_sessions),
    break_sessions: toNum(r.break_sessions),
    applied_adjustments: toNum(r.applied_adjustments),
    reversed_adjustments: toNum(r.reversed_adjustments),
    on_leave: r.on_leave === true,
    pending_corrections: toNum(r.pending_corrections),
    approved_corrections: toNum(r.approved_corrections),
    has_open_session: r.has_open_session === true,
  };
}

/** Admin: per employee/day adjusted timesheet rows for a PKT range. [] on error. */
export async function fetchTeamAdjustedTimesheetRange(start: string, end: string): Promise<TimesheetDailyRow[]> {
  const { data, error } = await supabase.rpc("get_team_adjusted_timesheet_range", { p_start: start, p_end: end });
  if (error) {
    console.warn("[timesheetReport] fetchTeamAdjustedTimesheetRange error", error);
    return [];
  }
  return ((data as Record<string, unknown>[] | null) ?? []).map(normalizeRow);
}

/** Aggregate per-day rows into one summary per employee (sums + flags + days). */
export function summarize(rows: TimesheetDailyRow[]): EmployeeTimesheetSummary[] {
  const byId = new Map<string, EmployeeTimesheetSummary>();
  for (const r of rows) {
    let s = byId.get(r.team_member_id);
    if (!s) {
      s = {
        team_member_id: r.team_member_id,
        display_name: r.display_name,
        employee_code: r.employee_code,
        title: r.title,
        domain_role: r.domain_role,
        gross_seconds: 0, break_seconds: 0, net_seconds: 0,
        gross_adjustment_seconds: 0, break_adjustment_seconds: 0, net_adjustment_seconds: 0,
        adjusted_gross_seconds: 0, adjusted_break_seconds: 0, adjusted_net_seconds: 0,
        clock_sessions: 0, break_sessions: 0, applied_adjustments: 0, reversed_adjustments: 0,
        leave_days: 0, pending_corrections: 0, approved_corrections: 0,
        has_adjustments: false, has_approved_leave: false, has_pending_correction: false, has_open_session: false,
        days: [],
      };
      byId.set(r.team_member_id, s);
    }
    s.gross_seconds += r.gross_seconds;
    s.break_seconds += r.break_seconds;
    s.net_seconds += r.net_seconds;
    s.gross_adjustment_seconds += r.gross_adjustment_seconds;
    s.break_adjustment_seconds += r.break_adjustment_seconds;
    s.net_adjustment_seconds += r.net_adjustment_seconds;
    s.adjusted_gross_seconds += r.adjusted_gross_seconds;
    s.adjusted_break_seconds += r.adjusted_break_seconds;
    s.adjusted_net_seconds += r.adjusted_net_seconds;
    s.clock_sessions += r.clock_sessions;
    s.break_sessions += r.break_sessions;
    s.applied_adjustments += r.applied_adjustments;
    s.reversed_adjustments += r.reversed_adjustments;
    s.pending_corrections += r.pending_corrections;
    s.approved_corrections += r.approved_corrections;
    if (r.on_leave) s.leave_days += 1;
    if (r.applied_adjustments > 0) s.has_adjustments = true;
    if (r.on_leave) s.has_approved_leave = true;
    if (r.pending_corrections > 0) s.has_pending_correction = true;
    if (r.has_open_session) s.has_open_session = true;
    s.days.push(r);
  }
  const out = Array.from(byId.values());
  out.forEach((s) => s.days.sort((a, b) => a.work_date.localeCompare(b.work_date)));
  out.sort((a, b) => (a.display_name ?? "").localeCompare(b.display_name ?? ""));
  return out;
}

/** Decimal hours (2dp) — Excel-summable. */
export function secToHours(seconds: number): string {
  return (Math.round((seconds / 3600) * 100) / 100).toFixed(2);
}

function flagsFor(s: EmployeeTimesheetSummary): string {
  const f: string[] = [];
  if (s.has_adjustments) f.push("Adjusted");
  if (s.has_approved_leave) f.push("Approved leave");
  if (s.has_pending_correction) f.push("Pending correction");
  if (s.has_open_session) f.push("Open session");
  return f.join("; ");
}
function dayFlags(r: TimesheetDailyRow): string {
  const f: string[] = [];
  if (r.applied_adjustments > 0) f.push("Adjusted");
  if (r.on_leave) f.push("Approved leave");
  if (r.pending_corrections > 0) f.push("Pending correction");
  if (r.has_open_session) f.push("Open session");
  return f.join("; ");
}

function roleLabel(s: { title: string | null; domain_role: string | null }): string {
  return [s.title, s.domain_role].filter(Boolean).join(" / ");
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "string" ? value : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

function download(rows: string[][], filename: string): void {
  const body = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const csv = "﻿" + body; // UTF-8 BOM so Excel renders cleanly
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Summary CSV — one row per employee. Times in decimal hours. No salary/pay. */
export function exportTimesheetSummaryCSV(summaries: EmployeeTimesheetSummary[], start: string, end: string): void {
  const rows: string[][] = [];
  rows.push(["PawTenant — Adjusted Timesheet Summary (no salary/pay)"]);
  rows.push(["Date range", `${start} to ${end}`]);
  rows.push([]);
  rows.push([
    "Employee", "Employee Code", "Role/Domain/Title", "Date Range Start", "Date Range End",
    "Raw Gross (hrs)", "Raw Break (hrs)", "Raw Net (hrs)",
    "Gross Adjustments (hrs)", "Break Adjustments (hrs)", "Net Adjustments (hrs)",
    "Adjusted Gross (hrs)", "Adjusted Break (hrs)", "Adjusted Net (hrs)",
    "Clock Sessions", "Break Sessions", "Applied Adjustments", "Reversed Adjustments",
    "Approved Leave Days", "Pending Corrections", "Approved Corrections", "Flags",
  ]);
  for (const s of summaries) {
    rows.push([
      s.display_name ?? "Unknown", s.employee_code ?? "", roleLabel(s), start, end,
      secToHours(s.gross_seconds), secToHours(s.break_seconds), secToHours(s.net_seconds),
      secToHours(s.gross_adjustment_seconds), secToHours(s.break_adjustment_seconds), secToHours(s.net_adjustment_seconds),
      secToHours(s.adjusted_gross_seconds), secToHours(s.adjusted_break_seconds), secToHours(s.adjusted_net_seconds),
      String(s.clock_sessions), String(s.break_sessions), String(s.applied_adjustments), String(s.reversed_adjustments),
      String(s.leave_days), String(s.pending_corrections), String(s.approved_corrections), flagsFor(s),
    ]);
  }
  download(rows, `pawtenant-timesheet-summary-${start}_to_${end}.csv`);
}

/** Daily CSV — one row per employee/date. Times in decimal hours. No salary/pay. */
export function exportTimesheetDailyCSV(summaries: EmployeeTimesheetSummary[], start: string, end: string): void {
  const rows: string[][] = [];
  rows.push(["PawTenant — Adjusted Timesheet Daily Detail (no salary/pay)"]);
  rows.push(["Date range", `${start} to ${end}`]);
  rows.push([]);
  rows.push([
    "Employee", "Employee Code", "Date",
    "Raw Gross (hrs)", "Raw Break (hrs)", "Raw Net (hrs)",
    "Gross Adjustment (hrs)", "Break Adjustment (hrs)", "Net Adjustment (hrs)",
    "Adjusted Gross (hrs)", "Adjusted Break (hrs)", "Adjusted Net (hrs)",
    "Approved Leave", "Pending Corrections", "Applied Adjustments", "Notes/Flags",
  ]);
  for (const s of summaries) {
    for (const r of s.days) {
      rows.push([
        s.display_name ?? "Unknown", s.employee_code ?? "", r.work_date,
        secToHours(r.gross_seconds), secToHours(r.break_seconds), secToHours(r.net_seconds),
        secToHours(r.gross_adjustment_seconds), secToHours(r.break_adjustment_seconds), secToHours(r.net_adjustment_seconds),
        secToHours(r.adjusted_gross_seconds), secToHours(r.adjusted_break_seconds), secToHours(r.adjusted_net_seconds),
        r.on_leave ? "Yes" : "", String(r.pending_corrections), String(r.applied_adjustments), dayFlags(r),
      ]);
    }
  }
  download(rows, `pawtenant-timesheet-daily-${start}_to_${end}.csv`);
}
