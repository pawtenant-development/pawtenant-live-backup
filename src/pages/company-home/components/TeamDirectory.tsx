import { useEffect, useMemo, useState } from "react";
import {
  fetchTeamPresence,
  PRESENCE_DOT,
  AWAY_LABEL,
  type PresenceRow,
} from "../../../lib/presence";
import {
  fetchManagerDisplay,
  fetchTeamMemberById,
  type TeamMember,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  DOMAIN_ROLE_LABEL,
} from "../../../lib/teamMembers";
import { fetchHrPrivate, type EmployeeHrPrivate } from "../../../lib/employeeHr";

interface TeamDirectoryProps {
  /** Owner/admin_manager: enables the richer "View Profile" drawer. */
  isManager: boolean;
  reloadToken?: number;
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Team Directory for /company. Everyone sees a safe directory (name, code,
 * title, department, photo, presence) from the SECURITY DEFINER get_team_presence
 * RPC — no personal/contact/salary data. Managers (owner/admin_manager) get a
 * "View Profile" drawer with richer contact/employment fields, fetched from
 * team_members (admin RLS). Salary / HR notes are never shown here.
 */
export default function TeamDirectory({ isManager, reloadToken }: TeamDirectoryProps) {
  const [rows, setRows] = useState<PresenceRow[] | null>(null);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTeamPresence().then((data) => { if (!cancelled) setRows(data); });
    return () => { cancelled = true; };
  }, [reloadToken]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows ?? [];
    return (rows ?? []).filter((r) =>
      (r.display_name ?? "").toLowerCase().includes(q) ||
      (r.employee_code ?? "").toLowerCase().includes(q) ||
      (r.title ?? "").toLowerCase().includes(q) ||
      (r.department ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">Team Directory</h1>
          <p className="text-xs text-stone-500">
            {isManager ? "Manager view — open a profile for full contact details." : "Your team at a glance."}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 h-9 w-full sm:max-w-xs">
          <i className="ri-search-line text-stone-400 text-sm" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, title, dept"
            className="flex-1 bg-transparent text-sm outline-none"
          />
        </div>
      </div>

      {rows === null ? (
        <p className="text-xs text-stone-400">Loading team…</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-stone-400">No team members match.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => (
            <div key={r.team_member_id} className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div className="h-11 w-11 rounded-full bg-stone-100 overflow-hidden flex items-center justify-center text-sm font-semibold text-stone-500">
                    {r.display_picture_url ? (
                      <img src={r.display_picture_url} alt={r.display_name || ""} className="h-full w-full object-cover" />
                    ) : (
                      initialsOf(r.display_name)
                    )}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${PRESENCE_DOT[r.presence]}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-stone-900 truncate">{r.display_name || "—"}</p>
                  <p className="text-[11px] text-stone-500 truncate">
                    {r.title || "Team member"}{r.department ? ` · ${r.department}` : ""}
                  </p>
                  <p className="text-[10px] text-stone-400">
                    {r.employee_code ? `#${r.employee_code}` : ""}
                    {r.is_clocked_in ? ` · ${AWAY_LABEL[r.away_status]}` : " · Offline"}
                  </p>
                </div>
              </div>
              {isManager ? (
                <button
                  type="button"
                  onClick={() => setOpenId(r.team_member_id)}
                  className="mt-3 w-full rounded-lg bg-stone-100 hover:bg-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700"
                >
                  <i className="ri-eye-line mr-1" /> View Profile
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {openId && isManager ? (
        <EmployeeDrawer teamMemberId={openId} canSeeSalary={isManager} onClose={() => setOpenId(null)} />
      ) : null}
    </section>
  );
}

function EmployeeDrawer({ teamMemberId, canSeeSalary, onClose }: { teamMemberId: string; canSeeSalary: boolean; onClose: () => void }) {
  const [member, setMember] = useState<TeamMember | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hr, setHr] = useState<EmployeeHrPrivate | null>(null);
  const [hrLoaded, setHrLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchTeamMemberById(teamMemberId).then(async (m) => {
      if (cancelled) return;
      setMember(m);
      setLoading(false);
      if (m?.manager_id) {
        const mg = await fetchManagerDisplay(m.manager_id);
        if (!cancelled) setManagerName(mg?.display_name ?? null);
      }
    });
    return () => { cancelled = true; };
  }, [teamMemberId]);

  // Sensitive HR/salary — only attempted for authorized viewers; RLS is the real
  // gate (non-admins get nothing). Safe fallback on empty/blocked.
  useEffect(() => {
    if (!canSeeSalary) return;
    let cancelled = false;
    setHrLoaded(false);
    fetchHrPrivate(teamMemberId).then((row) => {
      if (cancelled) return;
      setHr(row);
      setHrLoaded(true);
    });
    return () => { cancelled = true; };
  }, [teamMemberId, canSeeSalary]);

  const rows: { label: string; value: string }[] = member
    ? [
        { label: "Employee ID", value: member.employee_code || "—" },
        { label: "Job Title", value: member.title || "—" },
        { label: "Domain", value: member.department || "—" },
        { label: "Role Level", value: member.domain_role ? (DOMAIN_ROLE_LABEL[member.domain_role] ?? member.domain_role) : "—" },
        { label: "Authority Level", value: member.authority_level || "—" },
        { label: "Reporting Manager", value: member.manager_id ? (managerName ?? "—") : "—" },
        { label: "Employment Type", value: member.employment_type ? (EMPLOYMENT_TYPE_LABEL[member.employment_type] ?? member.employment_type) : "—" },
        { label: "Status", value: member.employment_status ? (EMPLOYMENT_STATUS_LABEL[member.employment_status] ?? member.employment_status) : "—" },
        { label: "Joining Date", value: member.joining_date || "—" },
        { label: "Work Email", value: member.workspace_email || "—" },
        { label: "Personal Email", value: member.personal_email || "—" },
        { label: "Phone", value: member.phone || "—" },
        { label: "Address", value: member.address || "—" },
        { label: "Date of Birth", value: member.date_of_birth || "—" },
        { label: "Emergency Contact", value: member.emergency_contact_name || "—" },
        { label: "Emergency Phone", value: member.emergency_contact_phone || "—" },
      ]
    : [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/30" />
      <div className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-stone-200 bg-white px-4 py-3">
          <h2 className="text-sm font-semibold text-stone-900">Employee Profile</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-500">
            <i className="ri-close-line text-lg" />
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="text-xs text-stone-400">Loading…</p>
          ) : !member ? (
            <p className="text-xs text-stone-400">Profile unavailable (you may not have access).</p>
          ) : (
            <>
              <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
                <div className="h-14 w-14 rounded-xl bg-stone-100 overflow-hidden flex items-center justify-center text-lg font-semibold text-stone-500">
                  {member.display_picture_url ? (
                    <img src={member.display_picture_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    initialsOf(member.display_name)
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-stone-900 truncate">{member.display_name || "—"}</h3>
                  <p className="text-xs text-stone-500 truncate">{member.title || "Employee"}</p>
                </div>
              </div>

              <dl className="mt-2">
                {rows.map((r) => (
                  <div key={r.label} className="flex items-start justify-between gap-3 border-b border-stone-100 py-2.5">
                    <dt className="text-xs font-medium text-stone-500">{r.label}</dt>
                    <dd className="text-sm font-medium text-stone-800 text-right break-words">{r.value}</dd>
                  </div>
                ))}
              </dl>

              {canSeeSalary ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                    <i className="ri-lock-2-line" /> Private HR / Accounts Record
                  </div>
                  {!hrLoaded ? (
                    <p className="text-xs text-stone-400">Loading HR record…</p>
                  ) : !hr ? (
                    <p className="text-xs text-stone-500">No HR / salary record on file yet.</p>
                  ) : (
                    <dl>
                      {[
                        { label: "Base Salary (HR record)", value: hr.base_salary != null ? `${hr.salary_currency ?? "PKR"} ${Number(hr.base_salary).toLocaleString()}` : "—" },
                        { label: "Currency", value: hr.salary_currency || "—" },
                        { label: "Payment Method", value: hr.payment_method || "—" },
                        { label: "Payroll Notes", value: hr.payroll_notes || "—" },
                        { label: "HR Notes", value: hr.hr_notes || "—" },
                      ].map((r) => (
                        <div key={r.label} className="flex items-start justify-between gap-3 border-b border-amber-100 py-2 last:border-0">
                          <dt className="text-xs font-medium text-amber-800/80">{r.label}</dt>
                          <dd className="text-sm font-medium text-stone-800 text-right break-words">{r.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <p className="mt-1.5 text-[10px] text-amber-700/80">
                    Base salary is an HR record, not final payroll.
                  </p>
                </div>
              ) : null}

              <a
                href="/admin-orders"
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#0f1e1a] hover:bg-[#1a2e29] px-3 py-2 text-xs font-semibold text-white"
              >
                <i className="ri-edit-line" /> Edit in Workstation
                <i className="ri-external-link-line text-[10px]" />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
