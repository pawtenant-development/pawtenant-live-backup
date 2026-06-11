import { useState } from "react";
import {
  createDepartment,
  updateDepartment,
  type CompanyDepartment,
} from "../../../lib/companyOs";

/**
 * Departments manager — collapsible card on top of the Employee HR Directory.
 * Owner/admin_manager only (RLS enforces; parent already gates the directory).
 * Add new departments/domains, rename, or deactivate (soft — assignments and
 * history stay intact; inactive departments can't receive new assignments).
 */

interface Props {
  departments: CompanyDepartment[];
  onChanged: () => void;
}

export default function DepartmentsManagerCard({ departments, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [fName, setFName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function handleAdd() {
    if (!fName.trim() || busy) return;
    setBusy(true);
    setErr("");
    const e = await createDepartment({ code: fName, name: fName });
    setBusy(false);
    if (e) { setErr(e); return; }
    setFName("");
    onChanged();
  }

  async function handleRename(id: string) {
    if (!renameValue.trim()) { setRenamingId(null); return; }
    setErr("");
    const e = await updateDepartment(id, { name: renameValue.trim() });
    if (e) { setErr(e); return; }
    setRenamingId(null);
    onChanged();
  }

  async function handleToggleActive(d: CompanyDepartment) {
    setErr("");
    const e = await updateDepartment(d.id, { is_active: !d.is_active });
    if (e) { setErr(e); return; }
    onChanged();
  }

  const activeCount = departments.filter((d) => d.is_active).length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white mb-4">
      <button type="button" onClick={() => setOpen((s) => !s)}
        className="flex w-full items-center justify-between px-4 py-3 cursor-pointer">
        <span className="flex items-center gap-2">
          <i className="ri-building-2-line text-[#3b6ea5]" />
          <span className="text-sm font-bold text-gray-800">Company Departments</span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500">{activeCount} active</span>
        </span>
        <i className={`${open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-gray-400`} />
      </button>

      {open && (
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {departments.map((d) => (
              <div key={d.id}
                className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 ${d.is_active ? "border-gray-200 bg-gray-50/50" : "border-gray-100 bg-gray-50 opacity-60"}`}>
                {renamingId === d.id ? (
                  <input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRename(d.id); if (e.key === "Escape") setRenamingId(null); }}
                    onBlur={() => handleRename(d.id)}
                    autoFocus
                    className="flex-1 min-w-0 rounded border border-[#b8cce4] px-1.5 h-7 text-xs"
                  />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700" title={d.code}>
                    {d.name}
                    {!d.is_active && <span className="ml-1 text-[9px] font-bold text-gray-400 uppercase">inactive</span>}
                  </span>
                )}
                <span className="flex items-center gap-1.5 shrink-0">
                  <button type="button" title="Rename"
                    onClick={() => { setRenamingId(d.id); setRenameValue(d.name); }}
                    className="text-gray-300 hover:text-[#3b6ea5] cursor-pointer"><i className="ri-pencil-line text-sm" /></button>
                  <button type="button" title={d.is_active ? "Deactivate (keeps history)" : "Reactivate"}
                    onClick={() => handleToggleActive(d)}
                    className={`cursor-pointer ${d.is_active ? "text-gray-300 hover:text-rose-500" : "text-gray-300 hover:text-emerald-600"}`}>
                    <i className={`${d.is_active ? "ri-toggle-fill" : "ri-toggle-line"} text-sm`} />
                  </button>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <input
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="New department name (e.g. Quality Assurance)"
              className="flex-1 rounded-lg border border-gray-200 px-2.5 h-9 text-sm"
            />
            <button type="button" onClick={handleAdd} disabled={!fName.trim() || busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-50 px-3 py-2 text-xs font-bold text-white cursor-pointer whitespace-nowrap">
              {busy ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-add-line" />}
              Add Department
            </button>
          </div>

          {err && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
              <i className="ri-error-warning-line mr-1" />{err}
            </p>
          )}
          <p className="mt-2 text-[10px] text-gray-400">
            Departments are company-wide domains. Deactivating keeps all history and assignments; it only hides the
            department from new assignments. Employee access is managed per-employee under “Departments &amp; Access”.
          </p>
        </div>
      )}
    </div>
  );
}
