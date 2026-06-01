import { useEffect, useState } from "react";
import {
  fetchManagerDisplay,
  type TeamMember,
  EMPLOYMENT_TYPE_LABEL,
  EMPLOYMENT_STATUS_LABEL,
  DOMAIN_ROLE_LABEL,
} from "../../../lib/teamMembers";

interface MyProfilePanelProps {
  member: TeamMember;
}

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/**
 * Employee self-view of their own HR record (team_members, self-readable via
 * RLS). Read-only — editing lives in the admin Workstation. Salary / HR notes
 * are intentionally NOT shown (they live in employee_hr_private, admin-only).
 */
export default function MyProfilePanel({ member }: MyProfilePanelProps) {
  const [managerName, setManagerName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!member.manager_id) {
      setManagerName(null);
      return;
    }
    fetchManagerDisplay(member.manager_id).then((row) => {
      if (!cancelled) setManagerName(row?.display_name ?? null);
    });
    return () => { cancelled = true; };
  }, [member.manager_id]);

  const displayName = (member.display_name?.trim() || "Team Member").trim();
  const rows: { label: string; value: string }[] = [
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
    { label: "Date of Birth", value: member.date_of_birth || "—" },
    { label: "Address", value: member.address || "—" },
    { label: "Emergency Contact", value: member.emergency_contact_name || "—" },
    { label: "Emergency Phone", value: member.emergency_contact_phone || "—" },
  ];

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-stone-900">My Profile</h1>
        <p className="text-xs text-stone-500">Your employee record · managed by HR</p>
      </div>

      <div className="max-w-2xl rounded-2xl border border-stone-200 bg-white shadow-sm p-5">
        <div className="flex items-center gap-3 pb-4 border-b border-stone-100">
          <div className="h-14 w-14 rounded-xl bg-stone-100 overflow-hidden flex items-center justify-center text-lg font-semibold text-stone-500">
            {member.display_picture_url ? (
              <img src={member.display_picture_url} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span>{initialsOf(displayName)}</span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-stone-900 truncate">{displayName}</h2>
            <p className="text-xs text-stone-500 truncate">
              {member.title || "Employee"}
              {member.department ? <span className="text-stone-400"> · {member.department}</span> : null}
            </p>
          </div>
        </div>

        <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          {rows.map((r) => (
            <div key={r.label} className="flex items-start justify-between gap-3 border-b border-stone-100 py-2.5">
              <dt className="text-xs font-medium text-stone-500">{r.label}</dt>
              <dd className="text-sm font-medium text-stone-800 text-right break-words">{r.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-[11px] text-stone-400">
          To update your details, contact HR / your reporting authority. Salary and HR notes are not
          shown here.
        </p>
      </div>
    </section>
  );
}
