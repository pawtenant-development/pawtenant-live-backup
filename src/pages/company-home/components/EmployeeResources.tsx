import type { TeamMember } from "../../../lib/teamMembers";

interface EmployeeResourcesProps {
  member: TeamMember;
}

/**
 * Employee Resources — professional foundation section grouping the documents
 * and references an employee needs. UI only: contract/signature, document
 * upload, and a permissions backend are intentionally NOT implemented here
 * (fast-follow). Uses existing employee fields where available.
 */
export default function EmployeeResources({ member }: EmployeeResourcesProps) {
  const role = member.title || "Employee";
  const dept = member.department || "—";
  const authority = member.authority_level || "—";

  const tiles: { icon: string; title: string; body: string; badge?: string }[] = [
    {
      icon: "ri-draft-line",
      title: "Signing Letter & Contract Terms",
      body: "Your offer letter and contract terms. Digital signing arrives in a later phase.",
      badge: "Soon",
    },
    {
      icon: "ri-shield-check-line",
      title: "Company Policies",
      body: "Attendance, leave, salary, benefits, communication and access policies.",
    },
    {
      icon: "ri-survey-line",
      title: "HR Forms",
      body: "Leave, attendance correction and benefit claim requests (coming soon).",
      badge: "Soon",
    },
    {
      icon: "ri-heart-pulse-line",
      title: "Benefits Information",
      body: "Emergency Medical Fund and employee support — eligibility via HR approval.",
    },
    {
      icon: "ri-user-star-line",
      title: "Role & Responsibilities",
      body: `${role} · ${dept}. Authority level: ${authority}.`,
    },
    {
      icon: "ri-shield-keyhole-line",
      title: "Permissions & Access",
      body: "Your access is granted by role and team membership. Managed by admins.",
    },
  ];

  return (
    <section id="resources" className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-2">
        <i className="ri-folder-3-line text-stone-400" />
        <h2 className="text-sm font-semibold text-stone-700">Employee Resources</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {tiles.map((t) => (
          <div
            key={t.title}
            className="flex gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3"
          >
            <div className="h-9 w-9 shrink-0 rounded-lg bg-white border border-stone-200 flex items-center justify-center text-stone-500">
              <i className={`${t.icon}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-stone-800">{t.title}</h3>
                {t.badge ? (
                  <span className="rounded bg-stone-200 px-1 py-0.5 text-[9px] font-semibold text-stone-500">
                    {t.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{t.body}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
