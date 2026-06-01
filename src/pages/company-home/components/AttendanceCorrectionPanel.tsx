import { useEffect, useState } from "react";
import { Widget } from "./TeamWidget";
import {
  fetchMyAttendanceCorrections,
  submitMyAttendanceCorrection,
  cancelMyAttendanceCorrection,
  correctionFields,
  ATT_CORRECTION_TYPES,
  ATT_CORRECTION_TYPE_LABEL,
  CORRECTION_STATUS_LABEL,
  CORRECTION_STATUS_TONE,
  type AttendanceCorrection,
  type AttendanceCorrectionType,
} from "../../../lib/attendanceCorrections";

/**
 * Employee Attendance Correction Request panel (/company → HR / Forms).
 * Collapsible form + own history. RLS guarantees employees see only their own
 * requests. Approval by admin is a decision record — it does not change actual
 * clock/break data (yet). Cancel allowed on pending only.
 */
function dtLocalToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AttendanceCorrectionPanel({ teamMemberId }: { teamMemberId: string }) {
  const [rows, setRows] = useState<AttendanceCorrection[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form
  const [date, setDate] = useState("");
  const [type, setType] = useState<AttendanceCorrectionType>("missed_clock_in");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [breakMinutes, setBreakMinutes] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  async function load() { setRows(await fetchMyAttendanceCorrections(teamMemberId)); }
  useEffect(() => {
    let cancelled = false;
    fetchMyAttendanceCorrections(teamMemberId).then((d) => { if (!cancelled) setRows(d); });
    return () => { cancelled = true; };
  }, [teamMemberId]);

  const fields = correctionFields(type);

  function resetForm() {
    setDate(""); setType("missed_clock_in"); setClockIn(""); setClockOut("");
    setBreakStart(""); setBreakEnd(""); setBreakMinutes(""); setReason(""); setNote("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    if (!date) { setError("Please choose the date to correct."); return; }
    if (!reason.trim()) { setError("Please add a reason."); return; }
    setSubmitting(true);
    const err = await submitMyAttendanceCorrection({
      correction_date: date,
      correction_type: type,
      reason: reason.trim(),
      requested_clock_in: fields.clockIn ? dtLocalToIso(clockIn) : null,
      requested_clock_out: fields.clockOut ? dtLocalToIso(clockOut) : null,
      requested_break_start: fields.breakStart ? dtLocalToIso(breakStart) : null,
      requested_break_end: fields.breakEnd ? dtLocalToIso(breakEnd) : null,
      requested_break_minutes: fields.breakMinutes && breakMinutes ? Number(breakMinutes) : null,
      employee_note: note.trim() || null,
    });
    setSubmitting(false);
    if (err) { setError(err); return; }
    setOk("Correction request submitted.");
    resetForm();
    await load();
    setTimeout(() => setOk(null), 3500);
  }

  async function handleCancel(r: AttendanceCorrection) {
    setBusyId(r.id); setError(null);
    const err = await cancelMyAttendanceCorrection(r.id);
    if (err) setError(err); else await load();
    setBusyId(null);
  }

  const inputCls = "w-full rounded-lg border border-stone-200 px-3 py-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-300";
  const pendingCount = (rows ?? []).filter((r) => r.status === "pending").length;

  return (
    <Widget
      icon="ri-time-line"
      title="Attendance Correction"
      action={
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-stone-100 hover:bg-stone-200 px-2.5 py-1 text-[11px] font-semibold text-stone-700">
          {open ? "Close" : "New request"}
        </button>
      }
    >
      {open && (
        <form onSubmit={handleSubmit} className="space-y-3 mb-4 rounded-lg bg-stone-50 p-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-stone-500">Issue type</span>
              <select value={type} onChange={(e) => setType(e.target.value as AttendanceCorrectionType)} className={inputCls}>
                {ATT_CORRECTION_TYPES.map((t) => <option key={t} value={t}>{ATT_CORRECTION_TYPE_LABEL[t]}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-stone-500">Date to correct</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required />
            </label>
            {fields.clockIn && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-stone-500">Correct clock-in</span>
                <input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className={inputCls} />
              </label>
            )}
            {fields.clockOut && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-stone-500">Correct clock-out</span>
                <input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className={inputCls} />
              </label>
            )}
            {fields.breakStart && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-stone-500">Correct break start</span>
                <input type="datetime-local" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} className={inputCls} />
              </label>
            )}
            {fields.breakEnd && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-stone-500">Correct break end</span>
                <input type="datetime-local" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} className={inputCls} />
              </label>
            )}
            {fields.breakMinutes && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-stone-500">Break minutes</span>
                <input type="number" min="0" max="600" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} className={inputCls} />
              </label>
            )}
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-stone-500">Reason</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What went wrong?" className={inputCls} required />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-stone-500">Note (optional)</span>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          </label>
          {error && <p className="text-[11px] text-rose-600">{error}</p>}
          {ok && <p className="text-[11px] text-emerald-600">{ok}</p>}
          <button type="submit" disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-stone-800 hover:bg-stone-900 disabled:opacity-60 px-4 py-2 text-xs font-semibold text-white">
            {submitting ? <><i className="ri-loader-4-line animate-spin" /> Submitting…</> : <><i className="ri-send-plane-line" /> Submit correction</>}
          </button>
        </form>
      )}

      {!open && error ? <p className="mb-2 text-[11px] text-rose-600">{error}</p> : null}
      {!open && ok ? <p className="mb-2 text-[11px] text-emerald-600">{ok}</p> : null}

      {rows === null ? (
        <p className="text-xs text-stone-400">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-stone-500">No attendance corrections submitted yet.</p>
      ) : (
        <>
          {pendingCount > 0 ? <p className="mb-2 text-[11px] text-amber-600 font-semibold">{pendingCount} pending</p> : null}
          <ul className="space-y-2">
            {rows.map((r) => {
              const tone = CORRECTION_STATUS_TONE[r.status] ?? "bg-stone-100 text-stone-600 border-stone-200";
              return (
                <li key={r.id} className="rounded-lg border border-stone-200 px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-stone-800">{ATT_CORRECTION_TYPE_LABEL[r.correction_type] ?? r.correction_type}</p>
                      <p className="text-[11px] text-stone-500">{new Date(r.correction_date).toLocaleDateString()}</p>
                      <p className="mt-0.5 text-[11px] text-stone-500 truncate">“{r.reason}”</p>
                      {r.manager_note ? <p className="mt-1 text-[11px] text-stone-600"><span className="font-semibold">Manager:</span> {r.manager_note}</p> : null}
                      <p className="mt-1 text-[10px] text-stone-400">
                        Submitted {new Date(r.created_at).toLocaleDateString()}
                        {r.reviewed_at ? ` · reviewed ${new Date(r.reviewed_at).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
                        {CORRECTION_STATUS_LABEL[r.status] ?? r.status}
                      </span>
                      {r.status === "pending" && (
                        <button type="button" onClick={() => handleCancel(r)} disabled={busyId === r.id}
                          className="rounded-lg border border-stone-200 px-2.5 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-100 disabled:opacity-60">
                          {busyId === r.id ? "…" : "Cancel"}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Widget>
  );
}
