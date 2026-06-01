import { useEffect, useMemo, useState } from "react";
import {
  fetchAllLeaveCorrections,
  reviewLeaveCorrection,
  LEAVE_CORRECTION_TYPE_LABEL,
  type LeaveCorrection,
} from "../../../lib/leaveCorrections";
import {
  fetchAllLeaveRequests,
  LEAVE_TYPE_LABEL,
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TONE,
  type LeaveRequest,
} from "../../../lib/employeeLeave";
import {
  fetchAllLeaveAdjustments,
  applyLeaveCorrectionAmendment,
  reverseLeaveAdjustment,
  appliedByCorrection,
  type LeaveAdjustment,
} from "../../../lib/leaveAdjustments";
import { fetchAllEmployees } from "../../../lib/employeeHr";
import { type TeamMember } from "../../../lib/teamMembers";

/**
 * Admin Leave Corrections / Amendments panel (Team → Leave Requests area).
 * Owner / admin_manager only. Approve/reject is a decision record — it does NOT
 * mutate the original leave request (original history preserved). Shows the
 * original leave alongside the requested change.
 */
const STATUS_FILTERS = ["pending", "all", "approved", "rejected", "cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function sortRows(a: LeaveCorrection, b: LeaveCorrection): number {
  if (a.status === "pending" && b.status !== "pending") return -1;
  if (b.status === "pending" && a.status !== "pending") return 1;
  return b.created_at.localeCompare(a.created_at);
}

export default function LeaveCorrectionsAdmin() {
  const [rows, setRows] = useState<LeaveCorrection[] | null>(null);
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<TeamMember[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [adjustments, setAdjustments] = useState<LeaveAdjustment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [c, l, emps, adj] = await Promise.all([fetchAllLeaveCorrections(), fetchAllLeaveRequests(), fetchAllEmployees(), fetchAllLeaveAdjustments()]);
    setRows(c); setLeaves(l); setEmployees(emps); setAdjustments(adj);
  }
  useEffect(() => { load(); }, []);

  const empById = useMemo(() => { const m = new Map<string, TeamMember>(); employees.forEach((e) => m.set(e.id, e)); return m; }, [employees]);
  const leaveById = useMemo(() => { const m = new Map<string, LeaveRequest>(); leaves.forEach((l) => m.set(l.id, l)); return m; }, [leaves]);
  const appliedMap = useMemo(() => appliedByCorrection(adjustments), [adjustments]);

  async function handleApply(r: LeaveCorrection) {
    setBusyId(r.id); setError(null);
    const err = await applyLeaveCorrectionAmendment(r.id);
    if (err) setError(err); else await load();
    setBusyId(null);
  }
  async function handleReverse(adj: LeaveAdjustment) {
    const reason = window.prompt("Reason for reversing this leave amendment?");
    if (!reason || !reason.trim()) return;
    setBusyId(adj.id); setError(null);
    const err = await reverseLeaveAdjustment(adj.id, reason.trim());
    if (err) setError(err); else await load();
    setBusyId(null);
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!q) return true;
        const e = empById.get(r.team_member_id);
        return (e?.display_name ?? "").toLowerCase().includes(q) || (e?.employee_code ?? "").toLowerCase().includes(q);
      })
      .sort(sortRows);
  }, [rows, statusFilter, search, empById]);

  const pendingCount = (rows ?? []).filter((r) => r.status === "pending").length;

  async function handleReview(r: LeaveCorrection, decision: "approved" | "rejected") {
    setBusyId(r.id); setError(null);
    const err = await reviewLeaveCorrection(r.id, decision, noteDraft[r.id]?.trim() || null);
    if (err) setError(err);
    else { setNoteDraft((p) => { const n = { ...p }; delete n[r.id]; return n; }); await load(); }
    setBusyId(null);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-base font-extrabold text-gray-900">Leave Corrections / Amendments</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {pendingCount > 0 ? <span className="font-semibold text-amber-600">{pendingCount} pending</span> : "No pending"} · approval is recorded; original leave is not auto-changed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600">
            {STATUS_FILTERS.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : LEAVE_STATUS_LABEL[s]}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-rose-600">{error}</p>}

      {rows === null ? (
        <div className="flex items-center justify-center py-12"><i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <i className="ri-edit-2-line text-2xl text-gray-300" />
          <p className="mt-2 text-sm font-bold text-gray-700">No leave corrections</p>
          <p className="text-xs text-gray-400 mt-1">Nothing matches the current filter.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const e = empById.get(r.team_member_id);
            const orig = leaveById.get(r.leave_request_id);
            const tone = LEAVE_STATUS_TONE[r.status] ?? "bg-gray-100 text-gray-600 border-gray-200";
            const isPending = r.status === "pending";
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 flex items-center justify-center rounded-full bg-[#e8f0f9] text-[#3b6ea5] text-xs font-extrabold flex-shrink-0">
                      {initials(e?.display_name ?? null)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {e?.display_name ?? "Unknown employee"}
                        {e?.employee_code ? <span className="ml-1.5 text-xs font-medium text-gray-400">#{e.employee_code}</span> : null}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-violet-700">
                        <i className="ri-edit-2-line" /> {LEAVE_CORRECTION_TYPE_LABEL[r.correction_type] ?? r.correction_type}
                      </p>
                      {orig ? (
                        <p className="mt-1 text-[11px] text-gray-500">
                          Original: {LEAVE_TYPE_LABEL[orig.leave_type] ?? orig.leave_type} · {orig.start_date} → {orig.end_date}
                          <span className={`ml-1.5 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${LEAVE_STATUS_TONE[orig.status] ?? ""}`}>
                            {LEAVE_STATUS_LABEL[orig.status] ?? orig.status}
                          </span>
                        </p>
                      ) : <p className="mt-1 text-[11px] text-gray-400">Original leave request not found.</p>}
                      {(r.requested_start_date || r.requested_end_date) ? (
                        <p className="text-[11px] text-gray-700">Requested dates: {r.requested_start_date ?? "—"} → {r.requested_end_date ?? "—"}</p>
                      ) : null}
                      {r.requested_leave_type ? <p className="text-[11px] text-gray-700">Requested type: {LEAVE_TYPE_LABEL[r.requested_leave_type] ?? r.requested_leave_type}</p> : null}
                      {r.requested_partial_day != null ? <p className="text-[11px] text-gray-700">Requested partial day: {r.requested_partial_day ? "Yes" : "No"}</p> : null}
                      <p className="mt-1 text-xs text-gray-500">“{r.correction_reason}”</p>
                      {r.manager_note ? <p className="mt-1 text-xs text-gray-600"><span className="font-semibold">Manager note:</span> {r.manager_note}</p> : null}
                      {(() => {
                        const adj = appliedMap.get(r.id);
                        if (!adj) return null;
                        const s = adj.applied_snapshot as Record<string, unknown>;
                        return (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                            Effective: {LEAVE_TYPE_LABEL[String(s.leave_type)] ?? String(s.leave_type)} · {String(s.start_date)} → {String(s.end_date)} · {String(s.status)}
                            <span className="ml-1 font-normal text-gray-400">(amendment applied {new Date(adj.applied_at).toLocaleDateString()})</span>
                          </p>
                        );
                      })()}
                      <p className="mt-1 text-[11px] text-gray-400">
                        Submitted {new Date(r.created_at).toLocaleDateString()}
                        {r.reviewed_at ? ` · reviewed ${new Date(r.reviewed_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <div className="flex items-center gap-1.5">
                      {appliedMap.get(r.id) ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 text-[11px] font-bold"><i className="ri-check-line" /> Applied</span>
                      ) : null}
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${tone}`}>
                        {LEAVE_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                    </div>
                    {r.status === "approved" && !appliedMap.get(r.id) && (
                      <button type="button" disabled={busyId === r.id} onClick={() => handleApply(r)}
                        className="rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-white">
                        {busyId === r.id ? "…" : "Apply Leave Amendment"}
                      </button>
                    )}
                    {r.status === "approved" && appliedMap.get(r.id) && (
                      <button type="button" disabled={busyId === appliedMap.get(r.id)!.id} onClick={() => handleReverse(appliedMap.get(r.id)!)}
                        className="rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 px-3 py-1.5 text-xs font-semibold">Reverse</button>
                    )}
                    {isPending && (
                      <div className="flex flex-col items-end gap-1.5 w-full max-w-[260px]">
                        <input type="text" value={noteDraft[r.id] ?? ""} onChange={(ev) => setNoteDraft((p) => ({ ...p, [r.id]: ev.target.value }))}
                          placeholder="Manager note (optional)"
                          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20" />
                        <div className="flex items-center gap-2">
                          <button type="button" disabled={busyId === r.id} onClick={() => handleReview(r, "rejected")}
                            className="rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-60 px-3 py-1.5 text-xs font-bold">Reject</button>
                          <button type="button" disabled={busyId === r.id} onClick={() => handleReview(r, "approved")}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-white">
                            {busyId === r.id ? "…" : "Approve"}</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
