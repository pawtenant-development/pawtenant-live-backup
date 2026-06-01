import { useEffect, useMemo, useState } from "react";
import {
  fetchAllAttendanceCorrections,
  reviewAttendanceCorrection,
  ATT_CORRECTION_TYPE_LABEL,
  CORRECTION_STATUS_LABEL,
  CORRECTION_STATUS_TONE,
  type AttendanceCorrection,
} from "../../../lib/attendanceCorrections";
import {
  fetchAllTimesheetAdjustments,
  applyAttendanceCorrection,
  reverseTimesheetAdjustment,
  appliedByRequest,
  type TimesheetAdjustment,
} from "../../../lib/timesheetAdjustments";
import { fmtSigned } from "../../../lib/attendanceNet";
import { fetchAllEmployees } from "../../../lib/employeeHr";
import { pktDateTimeShort } from "../../../lib/timezones";
import { DOMAIN_ROLE_LABEL, type TeamMember } from "../../../lib/teamMembers";

/**
 * Admin Attendance Corrections panel. Approve/reject (decision record) + APPLY an
 * approved correction into the auditable timesheet adjustment ledger. Apply uses
 * an admin-only RPC; if the impact can't be auto-computed it asks for manual
 * seconds. Applied corrections show impact + a Reverse action. Raw clock/break
 * rows are never mutated.
 */
const STATUS_FILTERS = ["pending", "all", "approved", "rejected", "cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}
function sortRows(a: AttendanceCorrection, b: AttendanceCorrection): number {
  if (a.status === "pending" && b.status !== "pending") return -1;
  if (b.status === "pending" && a.status !== "pending") return 1;
  return b.created_at.localeCompare(a.created_at);
}
function requestedSummary(r: AttendanceCorrection): string {
  const parts: string[] = [];
  if (r.requested_clock_in) parts.push(`In: ${pktDateTimeShort(r.requested_clock_in)}`);
  if (r.requested_clock_out) parts.push(`Out: ${pktDateTimeShort(r.requested_clock_out)}`);
  if (r.requested_break_start) parts.push(`Break start: ${pktDateTimeShort(r.requested_break_start)}`);
  if (r.requested_break_end) parts.push(`Break end: ${pktDateTimeShort(r.requested_break_end)}`);
  if (r.requested_break_minutes != null) parts.push(`Break: ${r.requested_break_minutes}m`);
  return parts.join(" · ");
}

export default function AttendanceCorrectionsAdmin() {
  const [rows, setRows] = useState<AttendanceCorrection[] | null>(null);
  const [employees, setEmployees] = useState<TeamMember[]>([]);
  const [adjustments, setAdjustments] = useState<TimesheetAdjustment[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Manual-apply modal state, keyed by correction id.
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [manualGrossMin, setManualGrossMin] = useState("");
  const [manualBreakMin, setManualBreakMin] = useState("");

  async function load() {
    const [r, emps, adj] = await Promise.all([fetchAllAttendanceCorrections(), fetchAllEmployees(), fetchAllTimesheetAdjustments()]);
    setRows(r); setEmployees(emps); setAdjustments(adj);
  }
  useEffect(() => { load(); }, []);

  const empById = useMemo(() => { const m = new Map<string, TeamMember>(); employees.forEach((e) => m.set(e.id, e)); return m; }, [employees]);
  const appliedMap = useMemo(() => appliedByRequest(adjustments), [adjustments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!q) return true;
        const e = empById.get(r.team_member_id);
        return (e?.display_name ?? "").toLowerCase().includes(q) || (e?.employee_code ?? "").toLowerCase().includes(q) || (e?.title ?? "").toLowerCase().includes(q);
      })
      .sort(sortRows);
  }, [rows, statusFilter, search, empById]);

  const pendingCount = (rows ?? []).filter((r) => r.status === "pending").length;

  async function handleReview(r: AttendanceCorrection, decision: "approved" | "rejected") {
    setBusyId(r.id); setError(null);
    const err = await reviewAttendanceCorrection(r.id, decision, noteDraft[r.id]?.trim() || null);
    if (err) setError(err); else { setNoteDraft((p) => { const n = { ...p }; delete n[r.id]; return n; }); await load(); }
    setBusyId(null);
  }

  async function handleApply(r: AttendanceCorrection, manual: boolean) {
    setBusyId(r.id); setError(null);
    const g = manual && manualGrossMin ? Math.round(Number(manualGrossMin) * 60) : null;
    const b = manual && manualBreakMin ? Math.round(Number(manualBreakMin) * 60) : null;
    const res = await applyAttendanceCorrection(r.id, g, b);
    if (!res.ok) {
      if (res.needsManual && !manual) { setManualFor(r.id); setManualGrossMin(""); setManualBreakMin(""); }
      else setError(res.error ?? "Could not apply.");
    } else {
      setManualFor(null); await load();
    }
    setBusyId(null);
  }

  async function handleReverse(adj: TimesheetAdjustment) {
    const reason = window.prompt("Reason for reversing this adjustment?");
    if (!reason || !reason.trim()) return;
    setBusyId(adj.id); setError(null);
    const err = await reverseTimesheetAdjustment(adj.id, reason.trim());
    if (err) setError(err); else await load();
    setBusyId(null);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-4">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-slate-900">Attendance Corrections</p>
          <p className="text-[11px] text-slate-500">
            {pendingCount > 0 ? <span className="font-semibold text-amber-600">{pendingCount} pending</span> : "No pending"} · approve, then apply to the timesheet (auditable; raw records unchanged).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…"
            className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-900" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-slate-700">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : CORRECTION_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="px-4 py-2 text-xs text-rose-600">{error}</p>}

      {rows === null ? (
        <div className="p-8 flex items-center justify-center text-slate-400"><i className="ri-loader-4-line animate-spin text-xl mr-2" /><span className="text-sm">Loading…</span></div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center">
          <i className="ri-time-line text-3xl text-slate-300" />
          <p className="mt-2 text-sm text-slate-700 font-semibold">No attendance corrections</p>
          <p className="mt-1 text-xs text-slate-500">Nothing matches the current filter.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {filtered.map((r) => {
            const e = empById.get(r.team_member_id);
            const tone = CORRECTION_STATUS_TONE[r.status] ?? "bg-gray-100 text-gray-600 border-gray-200";
            const isPending = r.status === "pending";
            const reqSummary = requestedSummary(r);
            const applied = appliedMap.get(r.id);
            return (
              <div key={r.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 flex items-center justify-center rounded-full bg-[#e8f0f9] text-[#3b6ea5] text-xs font-extrabold flex-shrink-0">{initials(e?.display_name ?? null)}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {e?.display_name ?? "Unknown employee"}
                        {e?.employee_code ? <span className="ml-1.5 text-xs font-medium text-gray-400">#{e.employee_code}</span> : null}
                      </p>
                      <p className="text-xs text-gray-500 truncate">{e?.title ?? "—"}{e?.domain_role ? ` · ${DOMAIN_ROLE_LABEL[e.domain_role] ?? e.domain_role}` : ""}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-700"><i className="ri-error-warning-line text-gray-400" /> {ATT_CORRECTION_TYPE_LABEL[r.correction_type] ?? r.correction_type}</span>
                        <span className="inline-flex items-center gap-1"><i className="ri-calendar-line text-gray-400" /> {new Date(r.correction_date).toLocaleDateString()}</span>
                      </div>
                      {reqSummary ? <p className="mt-1 text-[11px] text-slate-600"><span className="font-semibold">Requested:</span> {reqSummary}</p> : null}
                      <p className="mt-1 text-xs text-gray-500">“{r.reason}”</p>
                      {r.manager_note ? <p className="mt-1 text-xs text-gray-600"><span className="font-semibold">Manager note:</span> {r.manager_note}</p> : null}
                      {applied ? (
                        <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
                          <i className="ri-check-double-line" /> Applied {new Date(applied.applied_at).toLocaleDateString()} · net impact {fmtSigned(applied.net_adjustment_seconds)}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-gray-400">Submitted {new Date(r.created_at).toLocaleDateString()}{r.reviewed_at ? ` · reviewed ${new Date(r.reviewed_at).toLocaleDateString()}` : ""}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      {applied ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-[11px] font-bold"><i className="ri-check-line" /> Applied</span>
                      ) : null}
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${tone}`}>{CORRECTION_STATUS_LABEL[r.status] ?? r.status}</span>
                    </div>

                    {isPending && (
                      <div className="flex flex-col items-end gap-1.5 w-full max-w-[260px]">
                        <input type="text" value={noteDraft[r.id] ?? ""} onChange={(ev) => setNoteDraft((p) => ({ ...p, [r.id]: ev.target.value }))}
                          placeholder="Manager note (optional)"
                          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20" />
                        <div className="flex items-center gap-2">
                          <button type="button" disabled={busyId === r.id} onClick={() => handleReview(r, "rejected")} className="rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-60 px-3 py-1.5 text-xs font-bold">Reject</button>
                          <button type="button" disabled={busyId === r.id} onClick={() => handleReview(r, "approved")} className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-white">{busyId === r.id ? "…" : "Approve"}</button>
                        </div>
                      </div>
                    )}

                    {r.status === "approved" && !applied && (
                      <button type="button" disabled={busyId === r.id} onClick={() => handleApply(r, false)}
                        className="rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-white">
                        {busyId === r.id ? "…" : "Apply to Timesheet"}
                      </button>
                    )}
                    {r.status === "approved" && applied && (
                      <button type="button" disabled={busyId === applied.id} onClick={() => handleReverse(applied)}
                        className="rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold">Reverse</button>
                    )}
                  </div>
                </div>

                {/* Manual adjustment modal (when impact can't be auto-computed) */}
                {manualFor === r.id && (
                  <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 p-3">
                    <p className="text-[11px] font-semibold text-amber-800">No matching raw record found — enter the adjustment manually (minutes).</p>
                    <div className="mt-2 flex flex-wrap items-end gap-3">
                      <label className="block">
                        <span className="block text-[10px] font-semibold text-slate-500 mb-1">Work-time change (min, +/−)</span>
                        <input type="number" value={manualGrossMin} onChange={(e) => setManualGrossMin(e.target.value)} placeholder="e.g. 60 or -30"
                          className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
                      </label>
                      <label className="block">
                        <span className="block text-[10px] font-semibold text-slate-500 mb-1">Break change (min, +/−)</span>
                        <input type="number" value={manualBreakMin} onChange={(e) => setManualBreakMin(e.target.value)} placeholder="e.g. 15"
                          className="w-36 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs" />
                      </label>
                      <button type="button" disabled={busyId === r.id || (!manualGrossMin && !manualBreakMin)} onClick={() => handleApply(r, true)}
                        className="rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-white">Apply manual</button>
                      <button type="button" onClick={() => setManualFor(null)} className="rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 px-3 py-1.5 text-xs font-semibold">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
