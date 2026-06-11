import { useEffect, useState } from "react";
import { Widget } from "./TeamWidget";
import { fetchMyDepartmentMembers, type MyDepartmentMember } from "../../../lib/companyOs";
import {
  COMP_TYPES,
  COMP_TYPE_LABEL,
  requestCompensationAdjustment,
} from "../../../lib/compensation";

/**
 * Team Bonus Request — visible ONLY to employees who coordinate a department
 * (team coordinator / domain owner / can_request_bonus flag — the
 * get_my_department_members RPC returns rows only for them, and for global
 * admins). Submits a compensation request that lands in the Manager Approvals
 * inbox; the coordinator cannot approve their own request.
 */

export default function TeamBonusRequestWidget({ selfTeamMemberId }: { selfTeamMemberId: string }) {
  const [members, setMembers] = useState<MyDepartmentMember[] | null>(null);
  const [fMember, setFMember] = useState("");
  const [fType, setFType] = useState<string>("bonus");
  const [fMonth, setFMonth] = useState(new Date().toISOString().slice(0, 7));
  const [fAmount, setFAmount] = useState("");
  const [fReason, setFReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyDepartmentMembers().then((rows) => {
      if (!cancelled) setMembers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Distinct members, excluding self (you can't request your own bonus here).
  const options = (members ?? []).reduce<MyDepartmentMember[]>((acc, m) => {
    if (m.team_member_id === selfTeamMemberId) return acc;
    if (!acc.some((x) => x.team_member_id === m.team_member_id)) acc.push(m);
    return acc;
  }, []);

  // Not a coordinator (RPC returned nothing usable) → render nothing.
  if (members !== null && options.length === 0) return null;
  if (members === null) return null;

  async function handleSubmit() {
    const amt = parseFloat(fAmount);
    if (!fMember || !fMonth || isNaN(amt) || amt === 0 || busy) {
      setMsg({ ok: false, text: "Select a team member and enter a valid amount." });
      return;
    }
    setBusy(true);
    setMsg(null);
    const res = await requestCompensationAdjustment({
      teamMemberId: fMember,
      periodMonth: `${fMonth}-01`,
      type: fType,
      amountPkr: amt,
      reason: fReason || null,
    });
    setBusy(false);
    if (res.error) {
      setMsg({ ok: false, text: res.error });
      return;
    }
    setFAmount("");
    setFReason("");
    setMsg({ ok: true, text: "Request submitted — sent to Approvals for review." });
  }

  return (
    <Widget icon="ri-team-line" title="Team Bonus Request">
      <div className="space-y-2 py-1">
        <select value={fMember} onChange={(e) => setFMember(e.target.value)}
          className="w-full rounded-lg border border-stone-200 px-2 h-9 text-xs bg-white">
          <option value="">— Team member —</option>
          {options.map((m) => (
            <option key={m.team_member_id} value={m.team_member_id}>
              {m.display_name ?? m.employee_code ?? m.team_member_id}
              {m.department_name ? ` · ${m.department_name}` : ""}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <select value={fType} onChange={(e) => setFType(e.target.value)}
            className="rounded-lg border border-stone-200 px-2 h-9 text-xs bg-white">
            {COMP_TYPES.filter((t) => t !== "deduction").map((t) => (
              <option key={t} value={t}>{COMP_TYPE_LABEL[t]}</option>
            ))}
          </select>
          <input type="month" value={fMonth} onChange={(e) => setFMonth(e.target.value)}
            className="rounded-lg border border-stone-200 px-2 h-9 text-xs bg-white" />
        </div>
        <input type="number" step="1" value={fAmount} onChange={(e) => setFAmount(e.target.value)}
          placeholder="Amount (PKR)" className="w-full rounded-lg border border-stone-200 px-2.5 h-9 text-xs" />
        <input type="text" value={fReason} onChange={(e) => setFReason(e.target.value)}
          placeholder="Why does this team member deserve it?" className="w-full rounded-lg border border-stone-200 px-2.5 h-9 text-xs" />
        <button type="button" onClick={handleSubmit} disabled={busy}
          className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#0f1e1a] hover:bg-[#1a2e29] disabled:opacity-50 px-3 py-2 text-xs font-semibold text-white cursor-pointer">
          {busy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-send-plane-line" />}
          Submit for Approval
        </button>
        {msg && (
          <p className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
            {msg.text}
          </p>
        )}
        <p className="text-[10px] leading-snug text-stone-400">
          Requests go to management for approval. You can&apos;t approve your own request.
        </p>
      </div>
    </Widget>
  );
}
