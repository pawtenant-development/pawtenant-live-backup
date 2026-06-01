import { useEffect, useState } from "react";
import { Widget } from "./TeamWidget";
import {
  fetchMyLeaveRequests,
  submitMyLeaveRequest,
  cancelMyLeaveRequest,
  leaveDayCount,
  LEAVE_TYPES,
  LEAVE_TYPE_LABEL,
  LEAVE_STATUS_LABEL,
  LEAVE_STATUS_TONE,
  type LeaveRequest,
  type LeaveType,
} from "../../../lib/employeeLeave";
import {
  fetchMyLeaveCorrections,
  submitMyLeaveCorrection,
  cancelMyLeaveCorrection,
  leaveCorrectionFields,
  LEAVE_CORRECTION_TYPES,
  LEAVE_CORRECTION_TYPE_LABEL,
  type LeaveCorrection,
  type LeaveCorrectionType,
} from "../../../lib/leaveCorrections";
import {
  fetchMyLeaveAdjustments,
  appliedByCorrection,
  appliedByLeave,
  effectiveLeave,
  type LeaveAdjustment,
} from "../../../lib/leaveAdjustments";

/**
 * Employee self-service Leave panel (/company → HR / Forms).
 *
 * - Request leave (with live day/hours count + work_from_home type).
 * - My leave requests with status + cancel (pending only).
 * - Request a correction/amendment on any existing leave row (inline form).
 * - My leave corrections history.
 * RLS guarantees employees only ever see their OWN data. Writes go through the
 * employeeLeave / leaveCorrections RPCs. Not payroll.
 */
function fmtRange(start: string, end: string): string {
  const s = new Date(start).toLocaleDateString();
  const e = new Date(end).toLocaleDateString();
  return s === e ? s : `${s} → ${e}`;
}

const inputCls =
  "w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300";

export default function MyLeavePanel({ teamMemberId }: { teamMemberId: string }) {
  const [rows, setRows] = useState<LeaveRequest[] | null>(null);
  const [corrections, setCorrections] = useState<LeaveCorrection[]>([]);
  const [leaveAdjustments, setLeaveAdjustments] = useState<LeaveAdjustment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [correctingId, setCorrectingId] = useState<string | null>(null);

  // Leave form
  const [leaveType, setLeaveType] = useState<LeaveType>("annual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [partialDay, setPartialDay] = useState(false);
  const [partialHours, setPartialHours] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [r, c, a] = await Promise.all([fetchMyLeaveRequests(teamMemberId), fetchMyLeaveCorrections(teamMemberId), fetchMyLeaveAdjustments(teamMemberId)]);
    setRows(r);
    setCorrections(c);
    setLeaveAdjustments(a);
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMyLeaveRequests(teamMemberId), fetchMyLeaveCorrections(teamMemberId), fetchMyLeaveAdjustments(teamMemberId)]).then(([r, c, a]) => {
      if (cancelled) return;
      setRows(r);
      setCorrections(c);
      setLeaveAdjustments(a);
    });
    return () => { cancelled = true; };
  }, [teamMemberId]);

  const appliedLeaveAdjByCorrection = appliedByCorrection(leaveAdjustments);
  const appliedLeaveAdjByLeave = appliedByLeave(leaveAdjustments);

  function resetForm() {
    setLeaveType("annual"); setStartDate(""); setEndDate("");
    setPartialDay(false); setPartialHours(""); setReason("");
  }

  const dayCount = leaveDayCount(startDate, endDate, partialDay);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    if (!startDate || !endDate) { setError("Please choose start and end dates."); return; }
    if (endDate < startDate) { setError("End date cannot be before start date."); return; }
    setSubmitting(true);
    const err = await submitMyLeaveRequest({
      leave_type: leaveType,
      start_date: startDate,
      end_date: endDate,
      partial_day: partialDay,
      partial_day_hours: partialDay && partialHours ? Number(partialHours) : null,
      reason: reason.trim() || null,
    });
    setSubmitting(false);
    if (err) { setError(err); return; }
    setOk("Leave request submitted.");
    resetForm();
    await load();
    setTimeout(() => setOk(null), 3500);
  }

  async function handleCancel(r: LeaveRequest) {
    setBusyId(r.id); setError(null);
    const err = await cancelMyLeaveRequest(r.id);
    if (err) setError(err); else await load();
    setBusyId(null);
  }

  const pendingCorrectionByLeave = new Set(
    corrections.filter((c) => c.status === "pending").map((c) => c.leave_request_id),
  );

  return (
    <div className="space-y-4">
      {/* Request form */}
      <Widget icon="ri-calendar-event-line" title="Request Leave">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-stone-500">Leave type</span>
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)} className={inputCls}>
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-stone-500">Reason (optional)</span>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short reason" className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-stone-500">Start date</span>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} required />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-stone-500">End date</span>
              <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={inputCls} required />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-stone-600">
              <input type="checkbox" checked={partialDay} onChange={(e) => setPartialDay(e.target.checked)} className="rounded border-stone-300" />
              Partial / half day
            </label>
            {partialDay && (
              <label className="inline-flex items-center gap-2 text-xs text-stone-600">
                Hours
                <input type="number" min="0" max="24" step="0.5" value={partialHours} onChange={(e) => setPartialHours(e.target.value)}
                  className="w-20 rounded-lg border border-stone-200 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-stone-300" />
              </label>
            )}
            {startDate && endDate && endDate >= startDate ? (
              <span className="ml-auto text-[11px] font-semibold text-stone-600">
                {partialDay
                  ? (partialHours ? `${partialHours} hours` : "Partial day")
                  : `${dayCount} day${dayCount === 1 ? "" : "s"}`}
              </span>
            ) : null}
          </div>

          {error && <p className="text-[11px] text-rose-600">{error}</p>}
          {ok && <p className="text-[11px] text-emerald-600">{ok}</p>}

          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-800 hover:bg-stone-900 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white">
            {submitting ? <><i className="ri-loader-4-line animate-spin" /> Submitting…</> : <><i className="ri-send-plane-line" /> Submit request</>}
          </button>
        </form>
      </Widget>

      {/* History */}
      <Widget icon="ri-history-line" title="My Leave Requests">
        {rows === null ? (
          <p className="text-xs text-stone-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-stone-500">You have not submitted any leave requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => {
              const eff = effectiveLeave(r, appliedLeaveAdjByLeave.get(r.id));
              const tone = LEAVE_STATUS_TONE[eff.status] ?? "bg-stone-100 text-stone-600 border-stone-200";
              const todayStr = new Date().toISOString().slice(0, 10);
              const onLeaveToday = eff.status === "approved" && eff.start_date <= todayStr && eff.end_date >= todayStr;
              const days = leaveDayCount(eff.start_date, eff.end_date, eff.partial_day ?? false);
              const hasPendingCorrection = pendingCorrectionByLeave.has(r.id);
              const canCorrect = r.status === "pending" || r.status === "approved";
              return (
                <li key={r.id} className="rounded-lg border border-stone-200 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-800">
                        {LEAVE_TYPE_LABEL[eff.leave_type] ?? eff.leave_type}
                        {eff.partial_day
                          ? <span className="text-stone-400"> · partial</span>
                          : <span className="text-stone-400"> · {days} day{days === 1 ? "" : "s"}</span>}
                      </p>
                      <p className="text-[11px] text-stone-500">{fmtRange(eff.start_date, eff.end_date)}</p>
                      {eff.has_applied_amendment ? (
                        <p className="mt-0.5 text-[10px] text-stone-400">
                          Original: {LEAVE_TYPE_LABEL[eff.original.leave_type] ?? eff.original.leave_type} · {fmtRange(eff.original.start_date, eff.original.end_date)}
                          {eff.applied_at ? ` · amended ${new Date(eff.applied_at).toLocaleDateString()}` : ""}
                        </p>
                      ) : null}
                      {r.reason ? <p className="mt-0.5 text-[11px] text-stone-500 truncate">“{r.reason}”</p> : null}
                      {r.manager_note ? <p className="mt-1 text-[11px] text-stone-600"><span className="font-semibold">Manager:</span> {r.manager_note}</p> : null}
                      <p className="mt-1 text-[10px] text-stone-400">Submitted {new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
                        {LEAVE_STATUS_LABEL[eff.status] ?? eff.status}
                      </span>
                      {eff.has_applied_amendment ? (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${eff.withdrawn_by_amendment ? "text-rose-600" : "text-[#3b6ea5]"}`}>
                          <i className="ri-git-merge-line" /> {eff.withdrawn_by_amendment ? "Withdrawn by amendment" : "Amended (effective)"}
                        </span>
                      ) : null}
                      {hasPendingCorrection ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600">
                          <i className="ri-edit-2-line" /> Correction pending
                        </span>
                      ) : null}
                      {onLeaveToday && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                          <i className="ri-calendar-check-line" /> On leave today
                        </span>
                      )}
                      <div className="flex items-center gap-1.5">
                        {canCorrect && !hasPendingCorrection && (
                          <button type="button" onClick={() => setCorrectingId(correctingId === r.id ? null : r.id)}
                            className="rounded-lg border border-stone-200 px-2.5 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100">
                            {correctingId === r.id ? "Close" : "Request correction"}
                          </button>
                        )}
                        {r.status === "pending" && (
                          <button type="button" onClick={() => handleCancel(r)} disabled={busyId === r.id}
                            className="rounded-lg border border-stone-200 px-2.5 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-60">
                            {busyId === r.id ? "…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {correctingId === r.id && (
                    <LeaveCorrectionForm
                      leave={r}
                      onDone={async () => { setCorrectingId(null); await load(); }}
                      onCancel={() => setCorrectingId(null)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Widget>

      {/* Leave corrections history */}
      {corrections.length > 0 && (
        <Widget icon="ri-edit-2-line" title="My Leave Corrections">
          <ul className="space-y-2">
            {corrections.map((c) => {
              const tone = LEAVE_STATUS_TONE[c.status] ?? "bg-stone-100 text-stone-600 border-stone-200";
              return (
                <li key={c.id} className="rounded-lg border border-stone-200 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-800">{LEAVE_CORRECTION_TYPE_LABEL[c.correction_type] ?? c.correction_type}</p>
                      {(c.requested_start_date || c.requested_end_date) ? (
                        <p className="text-[11px] text-stone-500">New: {c.requested_start_date ?? "—"} → {c.requested_end_date ?? "—"}</p>
                      ) : null}
                      {c.requested_leave_type ? <p className="text-[11px] text-stone-500">New type: {LEAVE_TYPE_LABEL[c.requested_leave_type] ?? c.requested_leave_type}</p> : null}
                      <p className="mt-0.5 text-[11px] text-stone-500 truncate">“{c.correction_reason}”</p>
                      {c.manager_note ? <p className="mt-1 text-[11px] text-stone-600"><span className="font-semibold">Manager:</span> {c.manager_note}</p> : null}
                      {(() => {
                        const adj = appliedLeaveAdjByCorrection.get(c.id);
                        if (!adj) return null;
                        const s = adj.applied_snapshot as Record<string, unknown>;
                        return (
                          <p className="mt-1 text-[11px] font-semibold text-emerald-700">
                            Effective: {LEAVE_TYPE_LABEL[String(s.leave_type)] ?? String(s.leave_type)} · {String(s.start_date)} → {String(s.end_date)} · {String(s.status)}
                          </p>
                        );
                      })()}
                      <p className="mt-1 text-[10px] text-stone-400">Submitted {new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {appliedLeaveAdjByCorrection.get(c.id) ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-semibold"><i className="ri-check-line" /> Applied</span>
                      ) : null}
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
                        {LEAVE_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                      {c.status === "pending" && (
                        <button type="button" onClick={async () => { setBusyId(c.id); await cancelMyLeaveCorrection(c.id); await load(); setBusyId(null); }}
                          disabled={busyId === c.id}
                          className="rounded-lg border border-stone-200 px-2.5 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-60">
                          {busyId === c.id ? "…" : "Cancel"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Widget>
      )}
    </div>
  );
}

function LeaveCorrectionForm({
  leave,
  onDone,
  onCancel,
}: {
  leave: LeaveRequest;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<LeaveCorrectionType>("change_dates");
  const [start, setStart] = useState(leave.start_date);
  const [end, setEnd] = useState(leave.end_date);
  const [newLeaveType, setNewLeaveType] = useState<LeaveType>((leave.leave_type as LeaveType) ?? "annual");
  const [partial, setPartial] = useState<boolean>(!!leave.partial_day);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const fields = leaveCorrectionFields(type);

  async function submit() {
    setErr(null);
    if (!reason.trim()) { setErr("Please add a correction reason."); return; }
    if (fields.dates && end < start) { setErr("End date cannot be before start date."); return; }
    setBusy(true);
    const e = await submitMyLeaveCorrection({
      leave_request_id: leave.id,
      correction_type: type,
      correction_reason: reason.trim(),
      requested_start_date: fields.dates ? start : null,
      requested_end_date: fields.dates ? end : null,
      requested_leave_type: fields.leaveType ? newLeaveType : null,
      requested_partial_day: fields.partial ? partial : null,
    });
    setBusy(false);
    if (e) { setErr(e); return; }
    onDone();
  }

  return (
    <div className="mt-2.5 rounded-lg bg-stone-50 p-3 space-y-2.5">
      <p className="text-[11px] font-semibold text-stone-600">Request a correction for this leave</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[10px] font-semibold text-stone-500">Correction type</span>
          <select value={type} onChange={(e) => setType(e.target.value as LeaveCorrectionType)} className={inputCls}>
            {LEAVE_CORRECTION_TYPES.map((t) => <option key={t} value={t}>{LEAVE_CORRECTION_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        {fields.leaveType && (
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold text-stone-500">New leave type</span>
            <select value={newLeaveType} onChange={(e) => setNewLeaveType(e.target.value as LeaveType)} className={inputCls}>
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
            </select>
          </label>
        )}
        {fields.dates && (
          <>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold text-stone-500">New start date</span>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-semibold text-stone-500">New end date</span>
              <input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} className={inputCls} />
            </label>
          </>
        )}
        {fields.partial && (
          <label className="inline-flex items-center gap-2 text-xs text-stone-600 sm:col-span-2">
            <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} className="rounded border-stone-300" />
            Make this a partial / half day
          </label>
        )}
      </div>
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold text-stone-500">Correction reason</span>
        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this change?" className={inputCls} />
      </label>
      {err && <p className="text-[11px] text-rose-600">{err}</p>}
      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={busy}
          className="rounded-lg bg-stone-800 hover:bg-stone-900 disabled:opacity-60 px-3 py-1.5 text-[11px] font-semibold text-white">
          {busy ? "Submitting…" : "Submit correction"}
        </button>
        <button type="button" onClick={onCancel}
          className="rounded-lg border border-stone-200 px-3 py-1.5 text-[11px] font-semibold text-stone-600 hover:bg-stone-100">
          Cancel
        </button>
      </div>
    </div>
  );
}
