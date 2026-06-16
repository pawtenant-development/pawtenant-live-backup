import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import {
  COMP_TYPES,
  COMP_TYPE_LABEL,
  fmtPkr,
  periodMonthLabel,
  requestCompensationAdjustment,
  updateCompensationAdjustment,
  deleteCompensationAdjustment,
} from "../../../lib/compensation";

/**
 * Per-employee compensation history + add/edit/delete (Employee HR Directory
 * detail panel, admin-gated by the parent). Reads the table directly (admin
 * RLS, non-deleted rows only); writes go through the SECURITY DEFINER RPCs
 * (request / update / delete), which enforce authz + audit logging server-side.
 * Owner/admin/finance may approve immediately via the auto-approve toggle.
 */

interface AdjustmentRow {
  id: string;
  period_month: string;
  type: string;
  amount_pkr: number;
  reason: string | null;
  status: "pending" | "approved" | "rejected";
  review_note: string | null;
  created_at: string;
}

const STATUS_TONE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-600 border-rose-200",
};

function currentMonthInput(): string {
  return new Date().toISOString().slice(0, 7);
}

interface Props {
  teamMemberId: string;
  displayName: string | null;
}

export default function EmployeeCompensationAdmin({ teamMemberId, displayName }: Props) {
  const [rows, setRows] = useState<AdjustmentRow[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [fType, setFType] = useState<string>("bonus");
  const [fMonth, setFMonth] = useState(currentMonthInput());
  const [fAmount, setFAmount] = useState("");
  const [fReason, setFReason] = useState("");
  const [fAutoApprove, setFAutoApprove] = useState(true);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [eType, setEType] = useState<string>("bonus");
  const [eMonth, setEMonth] = useState(currentMonthInput());
  const [eAmount, setEAmount] = useState("");
  const [eReason, setEReason] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("employee_compensation_adjustments")
      .select("id, period_month, type, amount_pkr, reason, status, review_note, created_at")
      .eq("team_member_id", teamMemberId)
      .is("deleted_at", null)
      .order("period_month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(24);
    if (error) {
      console.warn("[EmployeeCompensationAdmin] load error", error);
      setRows([]);
      return;
    }
    setRows((data as AdjustmentRow[] | null) ?? []);
  }, [teamMemberId]);

  useEffect(() => {
    setRows(null);
    setErr("");
    setShowAdd(false);
    setEditId(null);
    load();
  }, [load]);

  async function handleAdd() {
    const amt = parseFloat(fAmount);
    if (!fMonth || isNaN(amt) || amt === 0 || busy) {
      setErr("Enter a valid month and non-zero amount.");
      return;
    }
    setBusy(true);
    setErr("");
    const res = await requestCompensationAdjustment({
      teamMemberId,
      periodMonth: `${fMonth}-01`,
      type: fType,
      amountPkr: amt,
      reason: fReason || null,
      autoApprove: fAutoApprove,
    });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setShowAdd(false);
    setFAmount("");
    setFReason("");
    load();
  }

  function startEdit(r: AdjustmentRow) {
    setErr("");
    setEditId(r.id);
    setEType(r.type);
    setEMonth(r.period_month.slice(0, 7));
    setEAmount(String(r.amount_pkr));
    setEReason(r.reason ?? "");
  }

  async function handleEditSave() {
    if (!editId) return;
    const amt = parseFloat(eAmount);
    if (!eMonth || isNaN(amt) || amt === 0 || editBusy) {
      setErr("Enter a valid month and non-zero amount.");
      return;
    }
    setEditBusy(true);
    setErr("");
    const res = await updateCompensationAdjustment({
      adjustmentId: editId,
      type: eType,
      amountPkr: amt,
      periodMonth: `${eMonth}-01`,
      reason: eReason || null,
    });
    setEditBusy(false);
    if (res.error) { setErr(res.error); return; }
    setEditId(null);
    load();
  }

  async function handleDelete(r: AdjustmentRow) {
    if (!window.confirm(
      `Delete this ${COMP_TYPE_LABEL[r.type] ?? r.type} of ${fmtPkr(Math.abs(r.amount_pkr))} ` +
      `(${periodMonthLabel(r.period_month)})? It will stop affecting salary immediately.`
    )) return;
    setDeletingId(r.id);
    setErr("");
    const res = await deleteCompensationAdjustment(r.id, "Deleted from HR employee panel");
    setDeletingId(null);
    if (res.error) { setErr(res.error); return; }
    if (editId === r.id) setEditId(null);
    load();
  }

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
          Compensation — Bonuses / Commissions / Adjustments (PKR)
        </p>
        <button type="button" onClick={() => setShowAdd((s) => !s)}
          className="text-[11px] font-bold text-[#3b6ea5] hover:underline cursor-pointer">
          <i className={showAdd ? "ri-close-line" : "ri-add-line"} /> {showAdd ? "Cancel" : "Add adjustment"}
        </button>
      </div>

      {showAdd && (
        <div className="mb-2 rounded-lg border border-dashed border-[#b8cce4] bg-[#f5f9fd] px-3 py-2.5 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                placeholder="Performance bonus" className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs" />
            </label>
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
              <input type="checkbox" checked={fAutoApprove} onChange={(e) => setFAutoApprove(e.target.checked)} className="cursor-pointer" />
              Approve immediately (owner / admin / finance only — otherwise goes to Approvals)
            </label>
            <button type="button" onClick={handleAdd} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white cursor-pointer">
              {busy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-money-dollar-circle-line" />}
              {fAutoApprove ? "Add Approved" : "Submit for Approval"}
            </button>
          </div>
          {fType === "deduction" && (
            <p className="text-[10px] text-rose-500 font-semibold">
              Deductions reduce {displayName ?? "the employee"}&apos;s net payable for the month once approved.
            </p>
          )}
        </div>
      )}

      {err && (
        <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          <i className="ri-error-warning-line mr-1" />{err}
        </p>
      )}

      {rows === null ? (
        <p className="text-xs text-gray-400">Loading compensation history…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400">No bonuses, commissions or adjustments yet.</p>
      ) : (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="border-b border-gray-50 last:border-b-0">
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-gray-800">
                    {COMP_TYPE_LABEL[r.type] ?? r.type}
                    <span className="ml-1.5 font-semibold text-gray-400">{periodMonthLabel(r.period_month)}</span>
                  </p>
                  {(r.reason || r.review_note) && (
                    <p className="text-[11px] text-gray-400 truncate">
                      {r.reason}{r.review_note ? ` · Review: ${r.review_note}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs font-extrabold ${r.type === "deduction" || r.amount_pkr < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {r.type === "deduction" || r.amount_pkr < 0 ? "−" : "+"}{fmtPkr(Math.abs(r.amount_pkr))}
                  </span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold capitalize ${STATUS_TONE[r.status]}`}>
                    {r.status}
                  </span>
                  {r.status !== "rejected" && (
                    <button type="button" title="Edit" onClick={() => (editId === r.id ? setEditId(null) : startEdit(r))}
                      className="text-gray-400 hover:text-[#3b6ea5] cursor-pointer" aria-label="Edit adjustment">
                      <i className="ri-pencil-line" />
                    </button>
                  )}
                  <button type="button" title="Delete" disabled={deletingId === r.id} onClick={() => handleDelete(r)}
                    className="text-gray-400 hover:text-rose-600 cursor-pointer disabled:opacity-40" aria-label="Delete adjustment">
                    {deletingId === r.id ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-delete-bin-line" />}
                  </button>
                </div>
              </div>

              {editId === r.id && (
                <div className="mx-3 mb-2 rounded-lg border border-dashed border-[#b8cce4] bg-[#f5f9fd] px-3 py-2.5 space-y-2">
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
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setEditId(null)}
                      className="text-[11px] text-gray-400 hover:text-gray-600 cursor-pointer">Cancel</button>
                    <button type="button" onClick={handleEditSave} disabled={editBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white cursor-pointer">
                      {editBusy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-save-line" />}
                      Save changes
                    </button>
                  </div>
                  {r.status === "approved" && (
                    <p className="text-[10px] text-gray-400">
                      This row is approved — saving updates the salary snapshot and Accounts salary expense immediately.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-[10px] text-gray-400">
        Only <strong>approved</strong> rows affect the salary snapshot and Accounts salary expense. Pending rows appear
        in the Manager Approvals inbox; rejected rows never count. Deleting is soft (audit-logged) and stops the row counting.
      </p>
    </div>
  );
}
