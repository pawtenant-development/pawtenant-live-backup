import { useEffect, useMemo, useState } from "react";
import {
  fetchAllLeaveRequests,
  reviewLeaveRequest,
  rangesOverlap,
  LEAVE_TYPE_LABEL,
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TONE,
  type LeaveRequest,
} from "../../../lib/employeeLeave";
import { fetchAllLeaveAdjustments, appliedByLeave, effectiveLeave, type LeaveAdjustment } from "../../../lib/leaveAdjustments";
import { fetchAllLeaveCorrections } from "../../../lib/leaveCorrections";
import { fetchAllEmployees } from "../../../lib/employeeHr";
import { DOMAIN_ROLE_LABEL, type TeamMember } from "../../../lib/teamMembers";

/**
 * Leave Requests admin sub-view (Team tab). Owner / admin_manager only — gated by
 * the parent toggle + DB RLS + the review RPC's own admin check. Lists all leave
 * requests (pending first), with employee identity joined client-side from
 * team_members. Approve/reject writes go through review_employee_leave_request.
 * Not linked to payroll/attendance.
 */
const STATUS_FILTERS = ["all", "pending", "approved", "rejected", "cancelled"] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const PERIOD_FILTERS = ["all", "this_month", "last_month"] as const;
type PeriodFilter = typeof PERIOD_FILTERS[number];
const PERIOD_LABEL: Record<PeriodFilter, string> = {
  all: "All time",
  this_month: "This month",
  last_month: "Last month",
};

// Inclusive [start, end] ISO-date bounds for a period; null = no date bound.
function periodBounds(p: PeriodFilter): { start: string; end: string } | null {
  if (p === "all") return null;
  const now = new Date();
  const ref = p === "last_month" ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: iso(start), end: iso(end) };
}

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function fmtDates(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString();
  const e = new Date(end).toLocaleDateString();
  return s === e ? s : `${s} → ${e}`;
}

// Pending sorts first; then newest submitted.
function sortRows(a: LeaveRequest, b: LeaveRequest): number {
  if (a.status === "pending" && b.status !== "pending") return -1;
  if (b.status === "pending" && a.status !== "pending") return 1;
  return b.created_at.localeCompare(a.created_at);
}

export default function LeaveRequestsAdmin() {
  const [rows, setRows] = useState<LeaveRequest[] | null>(null);
  const [employees, setEmployees] = useState<TeamMember[]>([]);
  const [adjustments, setAdjustments] = useState<LeaveAdjustment[]>([]);
  const [pendingCorrLeaveIds, setPendingCorrLeaveIds] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [search, setSearch] = useState("");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [r, emps, adj, corr] = await Promise.all([
      fetchAllLeaveRequests(), fetchAllEmployees(), fetchAllLeaveAdjustments(), fetchAllLeaveCorrections(),
    ]);
    setRows(r);
    setEmployees(emps);
    setAdjustments(adj);
    setPendingCorrLeaveIds(new Set(corr.filter((c) => c.status === "pending").map((c) => c.leave_request_id)));
  }
  useEffect(() => { load(); }, []);

  const empById = useMemo(() => {
    const m = new Map<string, TeamMember>();
    employees.forEach((e) => m.set(e.id, e));
    return m;
  }, [employees]);

  // Reviewer lookup by auth user_id (reviewed_by → reviewer display name).
  const empByUserId = useMemo(() => {
    const m = new Map<string, TeamMember>();
    employees.forEach((e) => { if (e.user_id) m.set(e.user_id, e); });
    return m;
  }, [employees]);

  const appliedMap = useMemo(() => appliedByLeave(adjustments), [adjustments]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const bounds = periodBounds(periodFilter);
    return (rows ?? [])
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!bounds) return true;
        // A request is "in" a month if its leave range overlaps that month.
        return r.start_date <= bounds.end && r.end_date >= bounds.start;
      })
      .filter((r) => {
        if (!q) return true;
        const e = empById.get(r.team_member_id);
        return (
          (e?.display_name ?? "").toLowerCase().includes(q) ||
          (e?.employee_code ?? "").toLowerCase().includes(q) ||
          (e?.title ?? "").toLowerCase().includes(q)
        );
      })
      .sort(sortRows);
  }, [rows, statusFilter, periodFilter, search, empById]);

  const pendingCount = (rows ?? []).filter((r) => r.status === "pending").length;

  // True when this request overlaps another APPROVED leave for the same employee.
  function hasApprovedOverlap(r: LeaveRequest): boolean {
    return (rows ?? []).some(
      (o) =>
        o.id !== r.id &&
        o.team_member_id === r.team_member_id &&
        o.status === "approved" &&
        rangesOverlap(r.start_date, r.end_date, o.start_date, o.end_date),
    );
  }

  async function handleReview(r: LeaveRequest, status: "approved" | "rejected") {
    setBusyId(r.id);
    setError(null);
    const err = await reviewLeaveRequest(r.id, status, noteDraft[r.id]?.trim() || null);
    if (err) setError(err);
    else {
      setNoteDraft((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
      await load();
    }
    setBusyId(null);
  }

  return (
    <div>
      {/* Header + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-extrabold text-gray-900">Leave &amp; Absence Requests</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {pendingCount > 0 ? <span className="font-semibold text-amber-600">{pendingCount} pending</span> : "No pending requests"} · review employee leave.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search employee…"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20">
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>{s === "all" ? "All statuses" : LEAVE_STATUS_LABEL[s]}</option>
            ))}
          </select>
          <select value={periodFilter} onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20">
            {PERIOD_FILTERS.map((p) => (
              <option key={p} value={p}>{PERIOD_LABEL[p]}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="mb-3 text-xs text-rose-600">{error}</p>}

      {rows === null ? (
        <div className="flex items-center justify-center py-20">
          <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <div className="w-11 h-11 flex items-center justify-center bg-gray-100 rounded-xl mx-auto mb-3">
            <i className="ri-calendar-event-line text-gray-400 text-lg" />
          </div>
          <p className="text-sm font-bold text-gray-700">No leave requests</p>
          <p className="text-xs text-gray-400 mt-1">Nothing matches the current filter.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => {
            const e = empById.get(r.team_member_id);
            const eff = effectiveLeave(r, appliedMap.get(r.id));
            const tone = LEAVE_STATUS_TONE[eff.status] ?? "bg-gray-100 text-gray-600 border-gray-200";
            const isPending = r.status === "pending";
            const todayStr = new Date().toISOString().slice(0, 10);
            const onLeaveToday = eff.status === "approved" && eff.start_date <= todayStr && eff.end_date >= todayStr;
            const hasPendingAmendment = pendingCorrLeaveIds.has(r.id);
            return (
              <div key={r.id} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  {/* Employee + leave details */}
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 flex items-center justify-center rounded-full bg-[#e8f0f9] text-[#3b6ea5] text-xs font-extrabold flex-shrink-0">
                      {initials(e?.display_name ?? null)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">
                        {e?.display_name ?? "Unknown employee"}
                        {e?.employee_code ? <span className="ml-1.5 text-xs font-medium text-gray-400">#{e.employee_code}</span> : null}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {e?.title ?? "—"}
                        {e?.domain_role ? ` · ${DOMAIN_ROLE_LABEL[e.domain_role] ?? e.domain_role}` : ""}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                        <span className="inline-flex items-center gap-1 font-semibold text-gray-700">
                          <i className="ri-bookmark-line text-gray-400" /> {LEAVE_TYPE_LABEL[eff.leave_type] ?? eff.leave_type}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <i className="ri-calendar-line text-gray-400" /> {fmtDates(eff.start_date, eff.end_date)}
                          {eff.partial_day ? <span className="text-gray-400"> (partial)</span> : null}
                        </span>
                        {onLeaveToday && (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                            <i className="ri-calendar-check-line" /> On leave today
                          </span>
                        )}
                      </div>
                      {eff.has_applied_amendment && (
                        <p className="mt-1 text-[11px] text-gray-400">
                          Original: {LEAVE_TYPE_LABEL[eff.original.leave_type] ?? eff.original.leave_type} · {fmtDates(eff.original.start_date, eff.original.end_date)}
                          {eff.applied_at ? ` · amendment applied ${new Date(eff.applied_at).toLocaleDateString()}` : ""}
                        </p>
                      )}
                      {hasApprovedOverlap(r) && (
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600">
                          <i className="ri-alert-line" /> Overlaps an existing approved leave for this employee
                        </p>
                      )}
                      {r.reason ? <p className="mt-1 text-xs text-gray-500">“{r.reason}”</p> : null}
                      {r.manager_note ? <p className="mt-1 text-xs text-gray-600"><span className="font-semibold">Manager note:</span> {r.manager_note}</p> : null}
                      <p className="mt-1 text-[11px] text-gray-400">
                        Submitted {new Date(r.created_at).toLocaleDateString()}
                        {r.reviewed_at ? ` · reviewed ${new Date(r.reviewed_at).toLocaleDateString()}` : ""}
                        {r.reviewed_at && r.reviewed_by && empByUserId.get(r.reviewed_by)?.display_name
                          ? ` by ${empByUserId.get(r.reviewed_by)?.display_name}`
                          : ""}
                        {r.cancelled_at ? ` · cancelled ${new Date(r.cancelled_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Status + actions */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${tone}`}>
                      {LEAVE_STATUS_LABEL[eff.status] ?? eff.status}
                    </span>
                    {eff.has_applied_amendment && (
                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${eff.withdrawn_by_amendment ? "text-rose-600" : "text-[#3b6ea5]"}`}>
                        <i className="ri-git-merge-line" /> {eff.withdrawn_by_amendment ? "Withdrawn by amendment" : "Effective amendment applied"}
                      </span>
                    )}
                    {hasPendingAmendment && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-600">
                        <i className="ri-edit-2-line" /> Pending amendment
                      </span>
                    )}
                    {isPending && (
                      <div className="flex flex-col items-end gap-1.5 w-full max-w-[260px]">
                        <input type="text" value={noteDraft[r.id] ?? ""}
                          onChange={(ev) => setNoteDraft((prev) => ({ ...prev, [r.id]: ev.target.value }))}
                          placeholder="Manager note (optional)"
                          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20" />
                        <div className="flex items-center gap-2">
                          <button type="button" disabled={busyId === r.id} onClick={() => handleReview(r, "rejected")}
                            className="rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-60 px-3 py-1.5 text-xs font-bold">
                            Reject
                          </button>
                          <button type="button" disabled={busyId === r.id} onClick={() => handleReview(r, "approved")}
                            className="rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 px-3 py-1.5 text-xs font-bold text-white">
                            {busyId === r.id ? "…" : "Approve"}
                          </button>
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
