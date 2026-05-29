import { useCallback, useEffect, useMemo, useState } from "react";
import {
  classifyAssignment,
  computeCrossesMidnight,
  createShiftAssignment,
  createShiftTemplate,
  DOW_LABELS,
  endShiftAssignment,
  fetchActiveShiftTemplates,
  fetchAllShiftTemplates,
  fetchShiftAssignments,
  formatOffDays,
  updateShiftTemplate,
  type ShiftAssignment,
  type ShiftTemplateFull,
  type ShiftTemplateLite,
} from "../../../lib/shiftsAdmin";
import {
  fetchActiveTeamMembersList,
  type AttendanceTeamMemberLite,
} from "../../../lib/attendanceAdmin";
import { pktDateString } from "../../../lib/timezones";

/**
 * ShiftsTab — Admin shift-assignment view (COS-051).
 *
 * Owner / admin_manager only — visibility is enforced by the parent
 * admin shell's `getVisibleTabs(...)` ladder; server-side RLS
 * (`esa_admin_all`, `team_members_admin_read`) is the second line of
 * defence.
 *
 * Out of scope: payroll, leave, cron, daily summary recompute,
 * destructive delete (use End Now / soft-end instead).
 */

type LoadState = "idle" | "loading" | "ready" | "error";

function fmtShiftClock(value: string | null | undefined): string {
  if (!value) return "—";
  const [hh, mm] = value.split(":");
  const h = Number(hh);
  const m = Number(mm ?? "0");
  if (Number.isNaN(h) || Number.isNaN(m)) return value;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mPad = String(m).padStart(2, "0");
  return `${h12}:${mPad} ${period}`;
}

function memberLabel(m: AttendanceTeamMemberLite | null): string {
  if (!m) return "Unknown";
  const name = m.display_name?.trim() || "Unnamed";
  return m.employee_code ? `${name} (${m.employee_code})` : name;
}

interface FormState {
  teamMemberId: string;
  shiftTemplateId: string;
  effectiveFrom: string;
  effectiveTo: string;
  weeklyOffDays: number[];
  notes: string;
}

function emptyForm(today: string): FormState {
  return {
    teamMemberId: "",
    shiftTemplateId: "",
    effectiveFrom: today,
    effectiveTo: "",
    weeklyOffDays: [],
    notes: "",
  };
}

export default function ShiftsTab() {
  const [state, setState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [members, setMembers] = useState<AttendanceTeamMemberLite[]>([]);
  const [templates, setTemplates] = useState<ShiftTemplateLite[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);

  const today = pktDateString(new Date());
  const [form, setForm] = useState<FormState>(() => emptyForm(today));
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [endingId, setEndingId] = useState<string | null>(null);
  const [endMsg, setEndMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setState("loading");
    setErrorMessage(null);
    try {
      const [m, t, a] = await Promise.all([
        fetchActiveTeamMembersList(),
        fetchActiveShiftTemplates(),
        fetchShiftAssignments(),
      ]);
      setMembers(m);
      setTemplates(t);
      setAssignments(a);
      setState("ready");
    } catch (err) {
      console.warn("[ShiftsTab] reload error", err);
      setErrorMessage("Could not load shifts. Please try again.");
      setState("error");
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  function toggleOffDay(day: number) {
    setForm((f) =>
      f.weeklyOffDays.includes(day)
        ? { ...f, weeklyOffDays: f.weeklyOffDays.filter((d) => d !== day) }
        : { ...f, weeklyOffDays: [...f.weeklyOffDays, day].sort((a, b) => a - b) },
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setCreateMsg(null);

    if (!form.teamMemberId) return setCreateMsg("Pick an employee.");
    if (!form.shiftTemplateId) return setCreateMsg("Pick a shift template.");
    if (!form.effectiveFrom) return setCreateMsg("Pick an effective start date.");
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
      return setCreateMsg("End date must be on or after the start date.");
    }

    setSubmitting(true);
    const res = await createShiftAssignment({
      teamMemberId: form.teamMemberId,
      shiftTemplateId: form.shiftTemplateId,
      effectiveFrom: form.effectiveFrom,
      effectiveTo: form.effectiveTo || null,
      weeklyOffDays: form.weeklyOffDays,
      notes: form.notes || null,
    });
    if ("error" in res) {
      setCreateMsg(res.error);
    } else {
      setCreateMsg("Assignment created.");
      setForm(emptyForm(today));
      await reload();
    }
    setSubmitting(false);
  }

  async function handleEnd(id: string) {
    if (endingId) return;
    setEndingId(id);
    setEndMsg(null);
    const res = await endShiftAssignment(id, today);
    if ("error" in res) {
      setEndMsg(res.error);
    } else {
      setEndMsg("Assignment ended.");
      await reload();
    }
    setEndingId(null);
  }

  const grouped = useMemo(() => {
    const active: ShiftAssignment[] = [];
    const pending: ShiftAssignment[] = [];
    const ended: ShiftAssignment[] = [];
    for (const a of assignments) {
      const c = classifyAssignment(a, today);
      if (c === "active") active.push(a);
      else if (c === "pending") pending.push(a);
      else ended.push(a);
    }
    return { active, pending, ended };
  }, [assignments, today]);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-base font-extrabold text-gray-900">Shift Assignments</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Assign employees to shift templates. Effective dates are PKT. Ending an
          assignment is non-destructive — the row stays for history.
        </p>
      </div>

      {/* Shift template management (create/edit) — refreshes the assignment
          template dropdown via onChanged. */}
      <ShiftTemplatesManager onChanged={reload} />

      {/* New Assignment form */}
      <form
        onSubmit={handleCreate}
        className="bg-white border border-slate-200 rounded-xl p-4 mb-4"
      >
        <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-3">
          New Assignment
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              Employee
            </label>
            <select
              value={form.teamMemberId}
              onChange={(e) => setForm((f) => ({ ...f, teamMemberId: e.target.value }))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="">— Select employee —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {memberLabel(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              Shift Template
            </label>
            <select
              value={form.shiftTemplateId}
              onChange={(e) => setForm((f) => ({ ...f, shiftTemplateId: e.target.value }))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            >
              <option value="">— Select shift template —</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {fmtShiftClock(t.start_time)} – {fmtShiftClock(t.end_time)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              Effective From (PKT)
            </label>
            <input
              type="date"
              value={form.effectiveFrom}
              onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>

          <div className="flex flex-col">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              Effective To (optional)
            </label>
            <input
              type="date"
              value={form.effectiveTo}
              onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>

          <div className="flex flex-col sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              Weekly Off Days
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DOW_LABELS.map((d) => {
                const on = form.weeklyOffDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleOffDay(d.value)}
                    className={`px-2.5 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                      on
                        ? "bg-[#3b6ea5] text-white border-[#3b6ea5]"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {d.short}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:col-span-2">
            <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">
              Notes (optional)
            </label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Free-text note for this assignment"
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] disabled:opacity-60 text-white"
          >
            {submitting ? "Creating…" : "Create Assignment"}
          </button>
          {createMsg ? (
            <span
              className={`text-xs font-semibold ${
                createMsg.toLowerCase().includes("created")
                  ? "text-emerald-700"
                  : "text-rose-700"
              }`}
            >
              {createMsg}
            </span>
          ) : null}
        </div>
      </form>

      {endMsg ? (
        <div
          className={`rounded-md border px-3 py-2 text-sm mb-3 ${
            endMsg.toLowerCase().includes("ended")
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-700"
          }`}
        >
          {endMsg}
        </div>
      ) : null}

      {state === "error" && errorMessage ? (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 flex items-center justify-center text-slate-400">
          <i className="ri-loader-4-line animate-spin text-xl mr-2"></i>
          <span className="text-sm">Loading shifts…</span>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="space-y-5">
          <AssignmentSection
            title="Active"
            sub="Currently in effect (no end date or end date in the future)"
            tone="emerald"
            rows={grouped.active}
            today={today}
            endingId={endingId}
            onEnd={handleEnd}
          />
          {grouped.pending.length > 0 ? (
            <AssignmentSection
              title="Scheduled"
              sub="Effective start date is in the future"
              tone="sky"
              rows={grouped.pending}
              today={today}
              endingId={endingId}
              onEnd={handleEnd}
            />
          ) : null}
          {grouped.ended.length > 0 ? (
            <AssignmentSection
              title="Ended"
              sub="History — read-only"
              tone="slate"
              rows={grouped.ended}
              today={today}
              endingId={endingId}
              onEnd={handleEnd}
              hideEndButton
            />
          ) : null}
          {grouped.active.length === 0 && grouped.pending.length === 0 && grouped.ended.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
              <i className="ri-calendar-line text-3xl text-slate-300"></i>
              <p className="mt-2 text-sm text-slate-700 font-semibold">
                No shift assignments yet.
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Use the form above to create your first one.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AssignmentSection({
  title,
  sub,
  tone,
  rows,
  today,
  endingId,
  onEnd,
  hideEndButton,
}: {
  title: string;
  sub: string;
  tone: "emerald" | "sky" | "slate";
  rows: ShiftAssignment[];
  today: string;
  endingId: string | null;
  onEnd: (id: string) => void;
  hideEndButton?: boolean;
}) {
  const toneBg =
    tone === "emerald"
      ? "bg-emerald-50/60"
      : tone === "sky"
        ? "bg-sky-50/60"
        : "bg-slate-50";
  const toneText =
    tone === "emerald"
      ? "text-emerald-800"
      : tone === "sky"
        ? "text-sky-800"
        : "text-slate-700";

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className={`px-4 py-2.5 border-b border-slate-200 ${toneBg} flex items-center justify-between`}>
        <p className={`text-sm font-extrabold ${toneText}`}>
          {title} <span className="ml-1 text-xs font-semibold opacity-60">({rows.length})</span>
        </p>
        <p className="text-[11px] text-slate-500">{sub}</p>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-slate-500">No rows in this group.</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="text-left font-bold px-4 py-2">Employee</th>
                  <th className="text-left font-bold px-4 py-2">Shift</th>
                  <th className="text-left font-bold px-4 py-2">Effective Range</th>
                  <th className="text-left font-bold px-4 py-2">Off Days</th>
                  <th className="text-left font-bold px-4 py-2">Notes</th>
                  {!hideEndButton ? <th className="px-4 py-2"></th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <DesktopRow
                    key={r.id}
                    row={r}
                    today={today}
                    endingId={endingId}
                    onEnd={onEnd}
                    hideEndButton={hideEndButton}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {/* Mobile cards */}
          <div className="lg:hidden divide-y divide-slate-100">
            {rows.map((r) => (
              <MobileCard
                key={r.id}
                row={r}
                today={today}
                endingId={endingId}
                onEnd={onEnd}
                hideEndButton={hideEndButton}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Shift Templates manager (create/edit shifts) ───────────────────────────

interface TemplateFormState {
  name: string;
  startTime: string;
  endTime: string;
  graceMinutes: string;
  timezone: string;
  description: string;
  isActive: boolean;
}

const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  name: "",
  startTime: "",
  endTime: "",
  graceMinutes: "0",
  timezone: "Asia/Karachi",
  description: "",
  isActive: true,
};

function toHHMM(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  return `${(h ?? "00").padStart(2, "0")}:${(m ?? "00").padStart(2, "0")}`;
}

function ShiftTemplatesManager({ onChanged }: { onChanged: () => void }) {
  const [templates, setTemplates] = useState<ShiftTemplateFull[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [open, setOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TemplateFormState>(EMPTY_TEMPLATE_FORM);
  const [saving, setSaving] = useState<boolean>(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTemplates(await fetchAllShiftTemplates());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_TEMPLATE_FORM);
    setMsg(null);
    setOpen(true);
  }

  function startEdit(t: ShiftTemplateFull) {
    setEditingId(t.id);
    setForm({
      name: t.name ?? "",
      startTime: toHHMM(t.start_time),
      endTime: toHHMM(t.end_time),
      graceMinutes: String(t.grace_minutes ?? 0),
      timezone: t.timezone ?? "Asia/Karachi",
      description: t.description ?? "",
      isActive: t.is_active,
    });
    setMsg(null);
    setOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setMsg(null);
    if (!form.name.trim()) return setMsg("Shift name is required.");
    if (!form.startTime || !form.endTime) return setMsg("Start and end time are required.");

    setSaving(true);
    const input = {
      name: form.name,
      description: form.description,
      timezone: form.timezone,
      start_time: form.startTime,
      end_time: form.endTime,
      grace_minutes: Math.max(0, parseInt(form.graceMinutes || "0", 10) || 0),
      is_active: form.isActive,
    };
    const res = editingId
      ? await updateShiftTemplate(editingId, input)
      : await createShiftTemplate(input);
    setSaving(false);
    if ("error" in res) {
      setMsg(res.error);
      return;
    }
    setMsg(editingId ? "Shift updated." : "Shift created.");
    setOpen(false);
    setForm(EMPTY_TEMPLATE_FORM);
    setEditingId(null);
    await load();
    onChanged();
  }

  const overnightPreview =
    !!form.startTime && !!form.endTime && computeCrossesMidnight(form.startTime, form.endTime);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">
            Shift Templates
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Define shift hours. Overnight shifts (end at/before start, e.g. 8:00 PM → 4:00 AM)
            are detected automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={open && editingId === null ? () => setOpen(false) : startCreate}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] text-white"
        >
          {open && editingId === null ? "Close" : "New Shift"}
        </button>
      </div>

      {open ? (
        <form onSubmit={handleSave} className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-3">
            {editingId ? "Edit Shift" : "New Shift"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col sm:col-span-2">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Shift Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Pakistan Night Shift"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Start Time</label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">End Time</label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Grace / Late Threshold (min)</label>
              <input
                type="number"
                min={0}
                value={form.graceMinutes}
                onChange={(e) => setForm((f) => ({ ...f, graceMinutes: e.target.value }))}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Timezone</label>
              <input
                type="text"
                value={form.timezone}
                onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                placeholder="Asia/Karachi"
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
              />
            </div>
            <div className="flex flex-col sm:col-span-2">
              <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold mb-1">Notes (optional)</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white text-slate-900"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
              />
              Active (selectable for new assignments)
            </label>
          </div>

          {form.startTime && form.endTime ? (
            <p className="mt-2 text-[11px] text-slate-500">
              {overnightPreview ? (
                <span className="font-semibold text-amber-700">Overnight shift detected</span>
              ) : (
                <span>Same-day shift</span>
              )}{" "}
              · {fmtShiftClock(form.startTime)} – {fmtShiftClock(form.endTime)}
            </p>
          ) : null}

          <div className="mt-3 flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#3b6ea5] hover:bg-[#2f5a8a] disabled:opacity-60 text-white"
            >
              {saving ? "Saving…" : editingId ? "Save Changes" : "Create Shift"}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setEditingId(null); setForm(EMPTY_TEMPLATE_FORM); }}
              className="px-3 py-2 text-sm font-semibold rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700"
            >
              Cancel
            </button>
            {msg ? (
              <span className={`text-xs font-semibold ${msg.toLowerCase().includes("required") || msg.toLowerCase().includes("could not") ? "text-rose-700" : "text-emerald-700"}`}>
                {msg}
              </span>
            ) : null}
          </div>
        </form>
      ) : msg ? (
        <p className={`text-xs font-semibold mb-3 ${msg.toLowerCase().includes("could not") ? "text-rose-700" : "text-emerald-700"}`}>{msg}</p>
      ) : null}

      {loading ? (
        <div className="flex items-center text-slate-400 text-sm py-2">
          <i className="ri-loader-4-line animate-spin mr-2"></i>Loading shifts…
        </div>
      ) : templates.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No shift templates yet. Create one above.</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900 truncate">{t.name}</span>
                  {t.crosses_midnight ? (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-700">Overnight</span>
                  ) : null}
                  {!t.is_active ? (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-200 text-slate-600">Inactive</span>
                  ) : null}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {fmtShiftClock(t.start_time)} – {fmtShiftClock(t.end_time)} · grace {t.grace_minutes ?? 0}m · {t.timezone ?? "Asia/Karachi"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => startEdit(t)}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 flex-shrink-0"
              >
                Edit
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DesktopRow({
  row,
  today,
  endingId,
  onEnd,
  hideEndButton,
}: {
  row: ShiftAssignment;
  today: string;
  endingId: string | null;
  onEnd: (id: string) => void;
  hideEndButton?: boolean;
}) {
  const member = row.member;
  const memberName = member?.display_name?.trim() || "Unknown";
  const code = member?.employee_code ?? null;
  const shiftName = row.shift?.name ?? "—";
  const startEnd =
    row.shift && row.shift.start_time && row.shift.end_time
      ? `${fmtShiftClock(row.shift.start_time)} – ${fmtShiftClock(row.shift.end_time)}`
      : "";
  const effective = `${row.effective_from} → ${row.effective_to ?? "open"}`;
  const offDays = formatOffDays(row.weekly_off_days);
  const isEnded = !!row.effective_to && row.effective_to <= today;

  return (
    <tr className={isEnded ? "opacity-70" : ""}>
      <td className="px-4 py-3 align-top">
        <div className="font-semibold text-slate-900 truncate">{memberName}</div>
        {code ? <div className="font-mono text-[11px] text-slate-500">{code}</div> : null}
      </td>
      <td className="px-4 py-3 align-top text-slate-700">
        <div className="font-semibold">{shiftName}</div>
        {startEnd ? <div className="text-[11px] text-slate-500">{startEnd}</div> : null}
      </td>
      <td className="px-4 py-3 align-top text-slate-700 font-mono text-xs">{effective}</td>
      <td className="px-4 py-3 align-top text-slate-700 text-xs">{offDays}</td>
      <td className="px-4 py-3 align-top text-slate-600 text-xs break-words max-w-xs">
        {row.notes ?? <span className="text-slate-400">—</span>}
      </td>
      {!hideEndButton ? (
        <td className="px-4 py-3 align-top text-right">
          <button
            type="button"
            onClick={() => onEnd(row.id)}
            disabled={endingId === row.id}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700"
          >
            {endingId === row.id ? "Ending…" : "End Now"}
          </button>
        </td>
      ) : null}
    </tr>
  );
}

function MobileCard({
  row,
  today,
  endingId,
  onEnd,
  hideEndButton,
}: {
  row: ShiftAssignment;
  today: string;
  endingId: string | null;
  onEnd: (id: string) => void;
  hideEndButton?: boolean;
}) {
  const member = row.member;
  const memberName = member?.display_name?.trim() || "Unknown";
  const code = member?.employee_code ?? null;
  const shiftName = row.shift?.name ?? "—";
  const startEnd =
    row.shift && row.shift.start_time && row.shift.end_time
      ? `${fmtShiftClock(row.shift.start_time)} – ${fmtShiftClock(row.shift.end_time)}`
      : "";
  const isEnded = !!row.effective_to && row.effective_to <= today;

  return (
    <div className={`px-4 py-3 ${isEnded ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">{memberName}</div>
          <div className="text-[11px] text-slate-500 truncate">
            {code ? <span className="font-mono">{code}</span> : null}
            {code && shiftName !== "—" ? <span> · </span> : null}
            {shiftName !== "—" ? shiftName : null}
          </div>
        </div>
        {!hideEndButton ? (
          <button
            type="button"
            onClick={() => onEnd(row.id)}
            disabled={endingId === row.id}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 flex-shrink-0"
          >
            {endingId === row.id ? "Ending…" : "End Now"}
          </button>
        ) : null}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <div>
          <span className="text-slate-500">Range:</span>{" "}
          <span className="font-mono text-slate-800">
            {row.effective_from} → {row.effective_to ?? "open"}
          </span>
        </div>
        <div>
          <span className="text-slate-500">Hours:</span>{" "}
          <span className="text-slate-800">{startEnd || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Off:</span>{" "}
          <span className="text-slate-800">{formatOffDays(row.weekly_off_days)}</span>
        </div>
        {row.notes ? (
          <div className="col-span-2">
            <span className="text-slate-500">Notes:</span>{" "}
            <span className="text-slate-700 break-words">{row.notes}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
