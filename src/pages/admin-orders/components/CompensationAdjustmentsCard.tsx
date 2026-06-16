import { useCallback, useEffect, useState } from "react";
import {
  COMP_TYPES,
  COMP_TYPE_LABEL,
  fmtPkr,
  periodMonthLabel,
  fetchCompensationAdjustments,
  requestCompensationAdjustment,
  reviewCompensationAdjustment,
  updateCompensationAdjustment,
  deleteCompensationAdjustment,
  type CompensationAdjustmentRow,
} from "../../../lib/compensation";
import { fetchMyDepartmentMembers, type MyDepartmentMember } from "../../../lib/companyOs";

/**
 * Compensation Adjustments — Accounts panel card. Lists bonus / commission /
 * adjustment rows for the selected range, lets reviewers approve/reject
 * pending requests, add new ones, and edit / delete existing rows. All
 * authorization is server-side (RPCs); this card just surfaces backend errors.
 * Approved amounts flow into Estimated Salary Expense automatically — every
 * change calls onChanged() so those totals refresh immediately.
 */

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-600 border-rose-200",
};

interface Props {
  from: string;
  to: string;
  /** owner/admin_manager/finance — controls auto-approve + review/edit/delete buttons. */
  canManage: boolean;
  /** Called after any change so the salary expense figures refresh. */
  onChanged: () => void;
}

export default function CompensationAdjustmentsCard({ from, to, canManage, onChanged }: Props) {
  const [rows, setRows] = useState<CompensationAdjustmentRow[] | null>(null);
  const [members, setMembers] = useState<MyDepartmentMember[]>([]);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  // Add form
  const [fMember, setFMember] = useState("");
  const [fType, setFType] = useState<string>("bonus");
  const [fMonth, setFMonth] = useState(from.slice(0, 7));
  const [fAmount, setFAmount] = useState("");
  const [fReason, setFReason] = useState("");
  const [fAutoApprove, setFAutoApprove] = useState(false);
  const [saving, setSaving] = useState(false);
  // Edit form
  const [editRow, setEditRow] = useState<CompensationAdjustmentRow | null>(null);
  const [eType, setEType] = useState<string>("bonus");
  const [eMonth, setEMonth] = useState(from.slice(0, 7));
  const [eAmount, setEAmount] = useState("");
  const [eReason, setEReason] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  const load = useCallback(async () => {
    setRows(await fetchCompensationAdjustments(from, to));
  }, [from, to]);

  useEffect(() => {
    setRows(null);
    setFMonth(from.slice(0, 7));
    setEditRow(null);
    load();
  }, [load, from]);

  useEffect(() => {
    fetchMyDepartmentMembers().then(setMembers);
  }, []);

  const pending = (rows ?? []).filter((r) => r.status === "pending");
  const decided = (rows ?? []).filter((r) => r.status !== "pending");
  const approvedTotal = (rows ?? [])
    .filter((r) => r.status === "approved")
    .reduce((s, r) => s + (r.comp_type === "deduction" ? -Math.abs(r.amount_pkr) : r.amount_pkr), 0);

  // Distinct selectable employees (the RPC can return one row per shared department).
  const memberOptions = members.reduce<MyDepartmentMember[]>((acc, m) => {
    if (!acc.some((x) => x.team_member_id === m.team_member_id)) acc.push(m);
    return acc;
  }, []);

  async function handleReview(row: CompensationAdjustmentRow, decision: "approved" | "rejected", note?: string) {
    setBusyId(row.id);
    setErr("");
    const res = await reviewCompensationAdjustment(row.id, decision, note ?? null);
    setBusyId(null);
    if (res.error) { setErr(res.error); return; }
    setRejectingId(null);
    setRejectNote("");
    await load();
    onChanged();
  }

  async function handleAdd() {
    const amt = parseFloat(fAmount);
    if (!fMember || !fMonth || isNaN(amt) || amt === 0) {
      setErr("Select an employee and enter a valid month and non-zero amount.");
      return;
    }
    setSaving(true);
    setErr("");
    const res = await requestCompensationAdjustment({
      teamMemberId: fMember,
      periodMonth: `${fMonth}-01`,
      type: fType,
      amountPkr: amt,
      reason: fReason || null,
      autoApprove: fAutoApprove && canManage,
    });
    setSaving(false);
    if (res.error) { setErr(res.error); return; }
    setShowAdd(false);
    setFAmount("");
    setFReason("");
    await load();
    onChanged();
  }

  function startEdit(r: CompensationAdjustmentRow) {
    setErr("");
    setShowAdd(false);
    setRejectingId(null);
    setEditRow(r);
    setEType(r.comp_type);
    setEMonth(r.period_month.slice(0, 7));
    setEAmount(String(r.amount_pkr));
    setEReason(r.reason ?? "");
  }

  async function handleEditSave() {
    if (!editRow) return;
    const amt = parseFloat(eAmount);
    if (!eMonth || isNaN(amt) || amt === 0) {
      setErr("Enter a valid month and non-zero amount.");
      return;
    }
    setEditBusy(true);
    setErr("");
    const res = await updateCompensationAdjustment({
      adjustmentId: editRow.id,
      type: eType,
      amountPkr: amt,
      periodMonth: `${eMonth}-01`,
      reason: eReason || null,
    });
    setEditBusy(false);
    if (res.error) { setErr(res.error); return; }
    setEditRow(null);
    await load();
    onChanged();
  }

  async function handleDelete(r: CompensationAdjustmentRow) {
    if (!window.confirm(
      `Delete this ${COMP_TYPE_LABEL[r.comp_type] ?? r.comp_type} of ${fmtPkr(Math.abs(r.amount_pkr))} ` +
      `for ${r.display_name ?? "employee"} (${periodMonthLabel(r.period_month)})? ` +
      `It will stop affecting salary/accounts immediately.`
    )) return;
    setBusyId(r.id);
    setErr("");
    const res = await deleteCompensationAdjustment(r.id, "Deleted from Accounts panel");
    setBusyId(null);
    if (res.error) { setErr(res.error); return; }
    if (editRow?.id === r.id) setEditRow(null);
    await load();
    onChanged();
  }

  const total = rows?.length ?? 0;

  return (
    <div className="border-b border-gray-100">
      <button type="button" onClick={() => setOpen((s) => !s)}
        className="w-full px-5 py-3 flex items-center justify-between gap-3 cursor-pointer">
        <div className="flex items-center gap-2 min-w-0">
          <i className="ri-hand-coin-line text-[#3b6ea5]" />
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold text-gray-800">
              Compensation Adjustments
              {pending.length > 0 && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                  {pending.length} pending
                </span>
              )}
            </p>
            <p className="text-xs text-gray-400">
              Bonuses, commissions &amp; adjustments for this range. Approved rows feed the salary expense above.
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          {approvedTotal !== 0 && (
            <p className={`text-sm font-extrabold ${approvedTotal > 0 ? "text-emerald-600" : "text-rose-500"}`}>
              {approvedTotal > 0 ? "+" : "−"}{fmtPkr(Math.abs(approvedTotal))}
            </p>
          )}
          <span className="text-[10px] font-semibold text-[#3b6ea5]">
            {open ? "Hide" : `${total} record${total === 1 ? "" : "s"}`} <i className={open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} />
          </span>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-4 space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={() => setShowAdd((s) => !s)}
              className="text-[11px] font-bold text-[#3b6ea5] hover:underline cursor-pointer">
              <i className={showAdd ? "ri-close-line" : "ri-add-line"} /> {showAdd ? "Cancel" : "New adjustment"}
            </button>
          </div>

          {showAdd && (
            <div className="rounded-lg border border-dashed border-[#b8cce4] bg-[#f5f9fd] px-3 py-2.5 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <label className="block col-span-2 sm:col-span-1">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Employee</span>
                  <select value={fMember} onChange={(e) => setFMember(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs bg-white">
                    <option value="">— Select —</option>
                    {memberOptions.map((m) => (
                      <option key={m.team_member_id} value={m.team_member_id}>
                        {m.display_name ?? m.employee_code ?? m.team_member_id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Type</span>
                  <select value={fType} onChange={(e) => setFType(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs bg-white">
                    {COMP_TYPES.map((t) => <option key={t} value={t}>{COMP_TYPE_LABEL[t]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Month</span>
                  <input type="month" value={fMonth} onChange={(e) => setFMonth(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs bg-white" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Amount (PKR)</span>
                  <input type="number" step="1" value={fAmount} onChange={(e) => setFAmount(e.target.value)}
                    placeholder="5000" className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Reason</span>
                  <input type="text" value={fReason} onChange={(e) => setFReason(e.target.value)}
                    placeholder="Reason / comment" className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs" />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {canManage ? (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={fAutoApprove} onChange={(e) => setFAutoApprove(e.target.checked)} className="cursor-pointer" />
                    Approve immediately
                  </label>
                ) : (
                  <span className="text-[11px] text-gray-400">Request will go to the Approvals inbox for review.</span>
                )}
                <button type="button" onClick={handleAdd} disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white cursor-pointer">
                  {saving ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-check-line" />}
                  {fAutoApprove && canManage ? "Add Approved" : "Submit Request"}
                </button>
              </div>
            </div>
          )}

          {editRow && (
            <div className="rounded-lg border border-dashed border-[#b8cce4] bg-[#f5f9fd] px-3 py-2.5 space-y-2">
              <p className="text-[11px] font-bold text-gray-600">
                <i className="ri-pencil-line mr-1" />Editing — {editRow.display_name ?? "employee"}
                <span className="ml-1 font-normal text-gray-400">(employee can&apos;t be changed)</span>
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Type</span>
                  <select value={eType} onChange={(e) => setEType(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs bg-white">
                    {COMP_TYPES.map((t) => <option key={t} value={t}>{COMP_TYPE_LABEL[t]}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Month</span>
                  <input type="month" value={eMonth} onChange={(e) => setEMonth(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs bg-white" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Amount (PKR)</span>
                  <input type="number" step="1" value={eAmount} onChange={(e) => setEAmount(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs" />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Reason</span>
                  <input type="text" value={eReason} onChange={(e) => setEReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs" />
                </label>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-[10px] text-gray-400">
                  {editRow.status === "approved"
                    ? "Approved — saving updates the salary expense immediately."
                    : "Pending — stays pending; the Approvals inbox is updated."}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setEditRow(null)}
                    className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                  <button type="button" onClick={handleEditSave} disabled={editBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white cursor-pointer">
                    {editBusy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-save-line" />}
                    Save changes
                  </button>
                </div>
              </div>
            </div>
          )}

          {err && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              <i className="ri-error-warning-line mr-1" />{err}
            </p>
          )}

          {rows === null ? (
            <p className="text-xs text-gray-400">Loading adjustments…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-gray-400">No compensation adjustments in this range.</p>
          ) : (
            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr_auto] gap-2 px-3 py-1.5 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <span>Employee</span><span>Type · Month</span><span className="text-right">Amount</span><span>Status</span><span>Requested / reviewed</span><span className="text-right">Actions</span>
              </div>
              {[...pending, ...decided].map((r) => (
                <div key={r.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_1.4fr_auto] gap-2 px-3 py-2 text-xs border-t border-gray-100 items-center">
                  <span className="truncate font-semibold text-gray-700">
                    {r.display_name ?? r.employee_code ?? "—"}
                    {r.department_name && <span className="block text-[10px] font-normal text-gray-400 truncate">{r.department_name}</span>}
                  </span>
                  <span className="text-gray-600">
                    {COMP_TYPE_LABEL[r.comp_type] ?? r.comp_type}
                    <span className="block text-[10px] text-gray-400">{periodMonthLabel(r.period_month)}</span>
                  </span>
                  <span className={`text-right font-bold ${r.comp_type === "deduction" || r.amount_pkr < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {r.comp_type === "deduction" || r.amount_pkr < 0 ? "−" : "+"}{fmtPkr(Math.abs(r.amount_pkr))}
                  </span>
                  <span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold capitalize ${STATUS_TONE[r.status]}`}>{r.status}</span>
                  </span>
                  <span className="text-[10px] text-gray-400 truncate" title={r.reason ?? undefined}>
                    {r.requested_by_name ?? "—"}
                    {r.reviewed_by_name ? ` → ${r.reviewed_by_name}` : ""}
                    {r.reason ? ` · ${r.reason}` : ""}
                  </span>
                  <span className="flex items-center gap-1.5 justify-end">
                    {canManage && rejectingId === r.id ? (
                      <span className="flex items-center gap-1">
                        <input value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} placeholder="Reason (optional)"
                          className="w-32 rounded border border-rose-200 px-1.5 h-7 text-[11px]" autoFocus />
                        <button type="button" disabled={busyId === r.id} onClick={() => handleReview(r, "rejected", rejectNote)}
                          className="rounded bg-rose-600 hover:bg-rose-700 px-2 py-1 text-[10px] font-bold text-white cursor-pointer disabled:opacity-50">
                          Reject
                        </button>
                        <button type="button" onClick={() => { setRejectingId(null); setRejectNote(""); }}
                          className="text-[10px] text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                      </span>
                    ) : canManage ? (
                      <>
                        {r.status === "pending" && (
                          <>
                            <button type="button" disabled={busyId === r.id} onClick={() => handleReview(r, "approved")}
                              className="rounded bg-[#3b6ea5] hover:bg-[#2d5a8e] px-2 py-1 text-[10px] font-bold text-white cursor-pointer disabled:opacity-50">
                              {busyId === r.id ? <i className="ri-loader-4-line animate-spin" /> : "Approve"}
                            </button>
                            <button type="button" disabled={busyId === r.id} onClick={() => setRejectingId(r.id)}
                              className="rounded border border-rose-200 bg-rose-50 hover:bg-rose-100 px-2 py-1 text-[10px] font-bold text-rose-600 cursor-pointer disabled:opacity-50">
                              Reject
                            </button>
                          </>
                        )}
                        {r.status !== "rejected" && (
                          <button type="button" title="Edit" onClick={() => (editRow?.id === r.id ? setEditRow(null) : startEdit(r))}
                            className="text-gray-400 hover:text-[#3b6ea5] cursor-pointer" aria-label="Edit adjustment">
                            <i className="ri-pencil-line" />
                          </button>
                        )}
                        <button type="button" title="Delete" disabled={busyId === r.id} onClick={() => handleDelete(r)}
                          className="text-gray-400 hover:text-rose-600 cursor-pointer disabled:opacity-40" aria-label="Delete adjustment">
                          {busyId === r.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-delete-bin-line" />}
                        </button>
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-400">
            Pending adjustments never affect salary. Approving or editing an approved row updates the salary expense and the
            employee&apos;s snapshot immediately. Deleting is soft (audit-logged). Requesters cannot review their own requests (owner/admin excepted).
          </p>
        </div>
      )}
    </div>
  );
}
