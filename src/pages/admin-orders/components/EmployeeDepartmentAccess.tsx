import { useCallback, useEffect, useState } from "react";
import {
  fetchMemberDepartmentRoles,
  assignDepartmentRole,
  updateDepartmentRole,
  endDepartmentRole,
  assignmentFlagLabels,
  DEPARTMENT_ROLE_LEVELS,
  DEPARTMENT_ROLE_LABEL,
  type CompanyDepartment,
  type DepartmentRoleAssignment,
} from "../../../lib/companyOs";

/**
 * Departments & Access — per-employee many-to-many department role editor
 * (Employee HR Directory detail panel). One employee can hold roles in many
 * departments; ending one assignment never touches the others. Delegation
 * limits are enforced by RLS (non-admin managers can't mint domain owners or
 * grant permission-management they don't hold).
 */

const FLAG_DEFS = [
  { key: "can_manage_people", label: "Manage people" },
  { key: "can_manage_permissions", label: "Manage permissions" },
  { key: "can_view_salary", label: "View salary" },
  { key: "can_request_bonus", label: "Request bonus" },
  { key: "can_approve_bonus", label: "Approve bonus" },
] as const;

type FlagKey = (typeof FLAG_DEFS)[number]["key"];

interface Props {
  teamMemberId: string;
  departments: CompanyDepartment[];
}

export default function EmployeeDepartmentAccess({ teamMemberId, departments }: Props) {
  const [assignments, setAssignments] = useState<DepartmentRoleAssignment[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fDept, setFDept] = useState("");
  const [fLevel, setFLevel] = useState<string>("user");
  const [fFlags, setFFlags] = useState<Record<FlagKey, boolean>>({
    can_manage_people: false,
    can_manage_permissions: false,
    can_view_salary: false,
    can_request_bonus: false,
    can_approve_bonus: false,
  });

  const deptName = useCallback(
    (id: string) => departments.find((d) => d.id === id)?.name ?? "Unknown department",
    [departments],
  );

  const load = useCallback(async () => {
    setAssignments(await fetchMemberDepartmentRoles(teamMemberId));
  }, [teamMemberId]);

  useEffect(() => {
    setAssignments(null);
    setErr("");
    setShowAdd(false);
    setEditingId(null);
    load();
  }, [load]);

  const assignedDeptIds = new Set((assignments ?? []).map((a) => a.department_id));
  const availableDepts = departments.filter((d) => d.is_active && !assignedDeptIds.has(d.id));

  async function handleAdd() {
    if (!fDept || busy) return;
    setBusy(true);
    setErr("");
    const e = await assignDepartmentRole({
      team_member_id: teamMemberId,
      department_id: fDept,
      role_level: fLevel,
      ...fFlags,
    });
    setBusy(false);
    if (e) { setErr(e); return; }
    setShowAdd(false);
    setFDept("");
    setFLevel("user");
    setFFlags({ can_manage_people: false, can_manage_permissions: false, can_view_salary: false, can_request_bonus: false, can_approve_bonus: false });
    load();
  }

  async function handleToggleFlag(a: DepartmentRoleAssignment, key: FlagKey) {
    setErr("");
    const e = await updateDepartmentRole(a.id, { [key]: !a[key] });
    if (e) { setErr(e); return; }
    load();
  }

  async function handleLevelChange(a: DepartmentRoleAssignment, level: string) {
    setErr("");
    const e = await updateDepartmentRole(a.id, { role_level: level });
    if (e) { setErr(e); return; }
    load();
  }

  async function handleEnd(a: DepartmentRoleAssignment) {
    if (!window.confirm(`End ${deptName(a.department_id)} access? Other department assignments are not affected.`)) return;
    setErr("");
    const e = await endDepartmentRole(a.id);
    if (e) { setErr(e); return; }
    load();
  }

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Departments &amp; Access</p>
        {availableDepts.length > 0 && (
          <button type="button" onClick={() => setShowAdd((s) => !s)}
            className="text-[11px] font-bold text-[#3b6ea5] hover:underline cursor-pointer">
            <i className={showAdd ? "ri-close-line" : "ri-add-line"} /> {showAdd ? "Cancel" : "Assign department"}
          </button>
        )}
      </div>

      {assignments === null ? (
        <p className="text-xs text-gray-400">Loading department access…</p>
      ) : assignments.length === 0 && !showAdd ? (
        <p className="text-xs text-gray-400">No department assignments yet. Assign one so this employee appears in a domain.</p>
      ) : (
        <div className="space-y-2">
          {assignments.map((a) => {
            const isEditing = editingId === a.id;
            const flagChips = assignmentFlagLabels(a);
            return (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-gray-50/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <span className="text-xs font-bold text-gray-800">{deptName(a.department_id)}</span>
                    <span className="rounded-full bg-[#e8f0f9] border border-[#b8cce4] px-2 py-0.5 text-[10px] font-bold text-[#3b6ea5]">
                      {DEPARTMENT_ROLE_LABEL[a.role_level] ?? a.role_level}
                    </span>
                    {flagChips.map((f) => (
                      <span key={f} className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">{f}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => setEditingId(isEditing ? null : a.id)}
                      className="text-[11px] font-semibold text-gray-400 hover:text-[#3b6ea5] cursor-pointer">
                      {isEditing ? "Done" : "Edit"}
                    </button>
                    <button type="button" onClick={() => handleEnd(a)} title="End this department assignment"
                      className="text-[11px] font-semibold text-gray-400 hover:text-rose-500 cursor-pointer">
                      Remove
                    </button>
                  </div>
                </div>
                {isEditing && (
                  <div className="mt-2 border-t border-gray-200 pt-2 space-y-2">
                    <label className="block">
                      <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Role in this department</span>
                      <select value={a.role_level} onChange={(e) => handleLevelChange(a, e.target.value)}
                        className="w-full sm:w-60 rounded-lg border border-gray-200 px-2 h-8 text-xs bg-white">
                        {DEPARTMENT_ROLE_LEVELS.map((l) => <option key={l} value={l}>{DEPARTMENT_ROLE_LABEL[l]}</option>)}
                      </select>
                    </label>
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {FLAG_DEFS.map((f) => (
                        <label key={f.key} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                          <input type="checkbox" checked={a[f.key]} onChange={() => handleToggleFlag(a, f.key)} className="cursor-pointer" />
                          {f.label}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {showAdd && (
            <div className="rounded-lg border border-dashed border-[#b8cce4] bg-[#f5f9fd] px-3 py-2.5 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Department</span>
                  <select value={fDept} onChange={(e) => setFDept(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs bg-white">
                    <option value="">— Select —</option>
                    {availableDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] font-semibold text-gray-500 mb-0.5">Role level</span>
                  <select value={fLevel} onChange={(e) => setFLevel(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-2 h-8 text-xs bg-white">
                    {DEPARTMENT_ROLE_LEVELS.map((l) => <option key={l} value={l}>{DEPARTMENT_ROLE_LABEL[l]}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {FLAG_DEFS.map((f) => (
                  <label key={f.key} className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={fFlags[f.key]}
                      onChange={(e) => setFFlags((p) => ({ ...p, [f.key]: e.target.checked }))} className="cursor-pointer" />
                    {f.label}
                  </label>
                ))}
              </div>
              <button type="button" onClick={handleAdd} disabled={!fDept || busy}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white cursor-pointer">
                {busy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-user-add-line" />}
                Assign
              </button>
            </div>
          )}
        </div>
      )}

      {err && (
        <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
          <i className="ri-error-warning-line mr-1" />{err}
        </p>
      )}
    </div>
  );
}
