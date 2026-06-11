import { useEffect, useMemo, useState } from "react";
import {
  type TeamMember,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_STATUSES,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  DOMAIN_ROLES,
  DOMAIN_ROLE_LABEL,
} from "../../../lib/teamMembers";
import {
  fetchAllEmployees,
  fetchHrPrivate,
  saveEmployeeMaster,
  saveHrPrivate,
  type EmployeeMasterPatch,
  type HrPrivatePatch,
} from "../../../lib/employeeHr";
import EmployeeDocumentsAdmin from "./EmployeeDocumentsAdmin";
import EmployeeDepartmentAccess from "./EmployeeDepartmentAccess";
import EmployeeCompensationAdmin from "./EmployeeCompensationAdmin";
import DepartmentsManagerCard from "./DepartmentsManagerCard";
import { fetchDepartments, type CompanyDepartment } from "../../../lib/companyOs";
import { listBundleKeys } from "../../../lib/permissions";

/**
 * Employee Master / HR Profile directory — admin Workstation (Team tab sub-view).
 *
 * Owner / admin_manager only (gated by the parent toggle + DB RLS). Manages the
 * HR master record on team_members plus sensitive salary/HR-notes in the
 * admin-only employee_hr_private table. NOT payroll — base salary is HR master
 * data only. Providers/customers are never shown here (team_members only).
 */

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  inactive: "bg-gray-100 text-gray-600 border-gray-200",
  terminated: "bg-rose-50 text-rose-700 border-rose-200",
  on_leave: "bg-amber-50 text-amber-700 border-amber-200",
};

interface FormState {
  master: EmployeeMasterPatch;
  hr: HrPrivatePatch;
}

export default function EmployeeHrDirectory() {
  const [employees, setEmployees] = useState<TeamMember[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ master: {}, hr: {} });
  const [hrLoaded, setHrLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deptFilter, setDeptFilter] = useState<string>("all");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [allDepartments, setAllDepartments] = useState<CompanyDepartment[]>([]);

  async function loadList() {
    const rows = await fetchAllEmployees();
    setEmployees(rows);
  }

  async function loadDepartments() {
    setAllDepartments(await fetchDepartments(true));
  }

  useEffect(() => {
    loadList();
    loadDepartments();
  }, []);

  const departments = useMemo(() => {
    const set = new Set<string>();
    (employees ?? []).forEach((e) => { if (e.department) set.add(e.department); });
    return Array.from(set).sort();
  }, [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employees ?? []).filter((e) => {
      if (statusFilter !== "all" && (e.employment_status ?? "active") !== statusFilter) return false;
      if (deptFilter !== "all" && (e.department ?? "") !== deptFilter) return false;
      if (!q) return true;
      return (
        (e.display_name ?? "").toLowerCase().includes(q) ||
        (e.employee_code ?? "").toLowerCase().includes(q) ||
        (e.workspace_email ?? "").toLowerCase().includes(q) ||
        (e.personal_email ?? "").toLowerCase().includes(q) ||
        (e.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [employees, search, statusFilter, deptFilter]);

  const selected = useMemo(
    () => (employees ?? []).find((e) => e.id === selectedId) ?? null,
    [employees, selectedId],
  );

  async function selectEmployee(emp: TeamMember) {
    setSelectedId(emp.id);
    setHrLoaded(false);
    setToast(null);
    setForm({
      master: {
        display_name: emp.display_name,
        workspace_email: emp.workspace_email,
        personal_email: emp.personal_email,
        phone: emp.phone,
        emergency_contact_name: emp.emergency_contact_name,
        emergency_contact_phone: emp.emergency_contact_phone,
        date_of_birth: emp.date_of_birth,
        joining_date: emp.joining_date,
        employment_type: emp.employment_type,
        employment_status: emp.employment_status ?? "active",
        department: emp.department,
        title: emp.title,
        authority_level: emp.authority_level,
        domain_role: emp.domain_role,
        manager_id: emp.manager_id,
        address: emp.address,
        primary_department_id: emp.primary_department_id,
        permission_bundle: emp.permission_bundle,
      },
      hr: {},
    });
    const hr = await fetchHrPrivate(emp.id);
    setForm((prev) => ({
      ...prev,
      hr: {
        base_salary: hr?.base_salary ?? null,
        salary_currency: hr?.salary_currency ?? "PKR",
        payment_method: hr?.payment_method ?? null,
        payroll_notes: hr?.payroll_notes ?? null,
        hr_notes: hr?.hr_notes ?? null,
      },
    }));
    setHrLoaded(true);
  }

  function setMaster<K extends keyof EmployeeMasterPatch>(key: K, value: EmployeeMasterPatch[K]) {
    setForm((p) => ({ ...p, master: { ...p.master, [key]: value } }));
  }
  function setHr<K extends keyof HrPrivatePatch>(key: K, value: HrPrivatePatch[K]) {
    setForm((p) => ({ ...p, hr: { ...p.hr, [key]: value } }));
  }

  async function handleSave() {
    if (!selectedId || saving) return;
    setSaving(true);
    setToast(null);
    const e1 = await saveEmployeeMaster(selectedId, form.master);
    const e2 = await saveHrPrivate(selectedId, form.hr);
    if (e1 || e2) {
      setToast({ ok: false, msg: e1 || e2 || "Save failed." });
    } else {
      setToast({ ok: true, msg: "Employee profile saved." });
      await loadList();
    }
    setSaving(false);
  }

  return (
    <div>
      <DepartmentsManagerCard departments={allDepartments} onChanged={loadDepartments} />
      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* List */}
      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="p-3 border-b border-gray-100 space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2.5 h-9">
            <i className="ri-search-line text-gray-400 text-sm" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, code, email, phone"
              className="flex-1 bg-transparent text-sm outline-none"
            />
          </div>
          <div className="flex gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="flex-1 rounded-lg border border-gray-200 text-xs px-2 h-8">
              <option value="all">All statuses</option>
              {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{EMPLOYMENT_STATUS_LABEL[s]}</option>)}
            </select>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="flex-1 rounded-lg border border-gray-200 text-xs px-2 h-8">
              <option value="all">All domains</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {employees === null ? (
            <p className="px-3 py-6 text-center text-xs text-gray-400">Loading employees…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-gray-400">No employees match.</p>
          ) : (
            filtered.map((e) => {
              const st = e.employment_status ?? "active";
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => selectEmployee(e)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left border-b border-gray-50 hover:bg-gray-50 ${selectedId === e.id ? "bg-[#e8f0f9]" : ""}`}
                >
                  <span className="h-8 w-8 shrink-0 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-[10px] font-bold text-gray-500">
                    {e.display_picture_url ? <img src={e.display_picture_url} alt="" className="h-full w-full object-cover" /> : initials(e.display_name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-gray-800 truncate">{e.display_name || "Unnamed"}</span>
                    <span className="block text-[11px] text-gray-400 truncate">
                      {e.employee_code ? `#${e.employee_code}` : "—"}{e.title ? ` · ${e.title}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${STATUS_TONE[st] ?? STATUS_TONE.active}`}>
                    {EMPLOYMENT_STATUS_LABEL[st] ?? st}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail / edit */}
      <div className="rounded-xl border border-gray-200 bg-white">
        {!selected ? (
          <div className="flex h-full min-h-[300px] items-center justify-center p-8 text-center">
            <div>
              <i className="ri-id-card-line text-3xl text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">Select an employee to view and edit their HR profile.</p>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="h-12 w-12 rounded-xl bg-gray-100 overflow-hidden flex items-center justify-center text-base font-bold text-gray-500">
                {selected.display_picture_url ? <img src={selected.display_picture_url} alt="" className="h-full w-full object-cover" /> : initials(selected.display_name)}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-gray-900 truncate">{selected.display_name || "Unnamed"}</h3>
                <p className="text-[11px] text-gray-400">Employee ID {selected.employee_code ?? "—"} · system-managed</p>
              </div>
            </div>

            <Section title="Identity & Contact">
              <Field label="Full name"><Text value={form.master.display_name} onChange={(v) => setMaster("display_name", v)} /></Field>
              <Field label="Job title"><Text value={form.master.title} onChange={(v) => setMaster("title", v)} /></Field>
              <Field label="Work email"><Text value={form.master.workspace_email} onChange={(v) => setMaster("workspace_email", v)} /></Field>
              <Field label="Personal email"><Text value={form.master.personal_email} onChange={(v) => setMaster("personal_email", v)} /></Field>
              <Field label="Phone"><Text value={form.master.phone} onChange={(v) => setMaster("phone", v)} /></Field>
              <Field label="Address"><Text value={form.master.address} onChange={(v) => setMaster("address", v)} /></Field>
            </Section>

            <Section title="Employment">
              <Field label="Primary department">
                <Select
                  value={form.master.primary_department_id ?? ""}
                  onChange={(v) => {
                    // Keep the legacy free-text department in sync with the
                    // selected master department (display/back-compat only —
                    // real access lives in Departments & Access below).
                    const dept = allDepartments.find((d) => d.id === v) ?? null;
                    setForm((p) => ({
                      ...p,
                      master: {
                        ...p.master,
                        primary_department_id: v || null,
                        department: dept ? dept.name : p.master.department,
                      },
                    }));
                  }}
                >
                  <option value="">—</option>
                  {allDepartments.filter((d) => d.is_active).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Company OS Role">
                <Select value={form.master.domain_role ?? ""} onChange={(v) => setMaster("domain_role", v || null)}>
                  <option value="">—</option>
                  {DOMAIN_ROLES.map((r) => <option key={r} value={r}>{DOMAIN_ROLE_LABEL[r]}</option>)}
                </Select>
              </Field>
              <Field label="Permission bundle">
                <Select value={form.master.permission_bundle ?? ""} onChange={(v) => setMaster("permission_bundle", v || null)}>
                  <option value="">—</option>
                  {listBundleKeys().map((b) => <option key={b} value={b}>{b.replace(/_/g, " ")}</option>)}
                </Select>
              </Field>
              <Field label="Authority level (legacy)"><Text value={form.master.authority_level} onChange={(v) => setMaster("authority_level", v)} /></Field>
              <Field label="Employment type">
                <Select value={form.master.employment_type ?? ""} onChange={(v) => setMaster("employment_type", v || null)}>
                  <option value="">—</option>
                  {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABEL[t]}</option>)}
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.master.employment_status ?? "active"} onChange={(v) => setMaster("employment_status", v)}>
                  {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{EMPLOYMENT_STATUS_LABEL[s]}</option>)}
                </Select>
              </Field>
              <Field label="Reporting manager">
                <Select value={form.master.manager_id ?? ""} onChange={(v) => setMaster("manager_id", v || null)}>
                  <option value="">— None —</option>
                  {(employees ?? []).filter((m) => m.id !== selected.id).map((m) => (
                    <option key={m.id} value={m.id}>{m.display_name || m.employee_code || m.id}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Joining date"><Date value={form.master.joining_date} onChange={(v) => setMaster("joining_date", v)} /></Field>
              <Field label="Date of birth"><Date value={form.master.date_of_birth} onChange={(v) => setMaster("date_of_birth", v)} /></Field>
            </Section>

            <Section title="Emergency Contact">
              <Field label="Contact name"><Text value={form.master.emergency_contact_name} onChange={(v) => setMaster("emergency_contact_name", v)} /></Field>
              <Field label="Contact phone"><Text value={form.master.emergency_contact_phone} onChange={(v) => setMaster("emergency_contact_phone", v)} /></Field>
            </Section>

            <Section title="HR Record (private · not final payroll)">
              {!hrLoaded ? (
                <p className="col-span-full text-xs text-gray-400">Loading HR record…</p>
              ) : (
                <>
                  <Field label="Base salary (HR record)">
                    <input
                      type="number" min="0" step="0.01"
                      value={form.hr.base_salary ?? ""}
                      onChange={(e) => setHr("base_salary", e.target.value === "" ? null : Number(e.target.value))}
                      className="w-full rounded-lg border border-gray-200 px-2.5 h-9 text-sm"
                    />
                  </Field>
                  <Field label="Currency"><Text value={form.hr.salary_currency} onChange={(v) => setHr("salary_currency", v)} /></Field>
                  <Field label="Payment method / payroll"><Text value={form.hr.payment_method} onChange={(v) => setHr("payment_method", v)} /></Field>
                  <Field label="Payroll notes" full><Textarea value={form.hr.payroll_notes} onChange={(v) => setHr("payroll_notes", v)} /></Field>
                  <Field label="Internal HR notes (admin only)" full><Textarea value={form.hr.hr_notes} onChange={(v) => setHr("hr_notes", v)} /></Field>
                </>
              )}
            </Section>

            <EmployeeDepartmentAccess teamMemberId={selected.id} departments={allDepartments} />

            <EmployeeCompensationAdmin teamMemberId={selected.id} displayName={selected.display_name} />

            <EmployeeDocumentsAdmin teamMemberId={selected.id} />

            {toast && (
              <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${toast.ok ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                <i className={`mr-1 ${toast.ok ? "ri-checkbox-circle-line" : "ri-error-warning-line"}`} />{toast.msg}
              </div>
            )}

            <div className="mt-4 flex justify-end">
              <button type="button" onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-[#3b6ea5] hover:bg-[#2d5a8e] disabled:opacity-60 px-4 py-2.5 text-sm font-bold text-white">
                {saving ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-save-line" />}
                {saving ? "Saving…" : "Save Employee"}
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}
function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}
function Text({ value, onChange }: { value: string | null | undefined; onChange: (v: string) => void }) {
  return <input type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-gray-200 px-2.5 h-9 text-sm" />;
}
function Date({ value, onChange }: { value: string | null | undefined; onChange: (v: string | null) => void }) {
  return <input type="date" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className="w-full rounded-lg border border-gray-200 px-2.5 h-9 text-sm" />;
}
function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-gray-200 px-2 h-9 text-sm bg-white">{children}</select>;
}
function Textarea({ value, onChange }: { value: string | null | undefined; onChange: (v: string) => void }) {
  return <textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm resize-y" />;
}
