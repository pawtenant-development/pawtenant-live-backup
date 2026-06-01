/**
 * Company feed — announcements / notices column.
 *
 * UI foundation only: notices are static samples. A real announcements backend
 * (table + RLS + admin authoring) is a fast-follow; nothing here writes data.
 */

interface Notice {
  category: string;
  title: string;
  author: string;
  date: string;
  body: string;
  icon: string;
  tone: "brand" | "blue" | "amber" | "green";
}

const NOTICES: Notice[] = [
  {
    category: "Company OS",
    title: "Welcome to PawTenant Company OS",
    author: "People & Culture",
    date: "Today",
    body: "Your new employee portal is your home base — clock in, set your status, view your shift, salary snapshot, benefits and company policies, all in one place.",
    icon: "ri-home-smile-line",
    tone: "brand",
  },
  {
    category: "Attendance",
    title: "Attendance & shift tracking reminder",
    author: "Operations",
    date: "This week",
    body: "Please clock in from the portal at the start of your shift and clock out when you finish. Your worked hours and late status are recorded automatically.",
    icon: "ri-time-line",
    tone: "blue",
  },
  {
    category: "Payroll",
    title: "Payroll & salary snapshot notice",
    author: "Finance",
    date: "Monthly",
    body: "Your estimated salary snapshot is available in the sidebar. Final payroll figures are confirmed by Finance each cycle — close any pending payroll queries before the 23rd.",
    icon: "ri-money-dollar-circle-line",
    tone: "green",
  },
  {
    category: "Policies",
    title: "Company policy documents available",
    author: "HR",
    date: "Always",
    body: "Attendance, Leave, Salary, Benefits, Internal Communication and Access policies are listed under Policies. Please review them and reach out to HR with any questions.",
    icon: "ri-file-list-3-line",
    tone: "amber",
  },
];

const TONE: Record<Notice["tone"], string> = {
  brand: "bg-[#0f1e1a]/5 text-[#0f1e1a]",
  blue: "bg-blue-50 text-blue-600",
  amber: "bg-amber-50 text-amber-600",
  green: "bg-emerald-50 text-emerald-600",
};

export default function CompanyFeed() {
  return (
    <section id="feed" className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold text-stone-700">Company Notices</h2>
        <span className="text-[11px] text-stone-400">Sample content · live feed coming soon</span>
      </div>

      {NOTICES.map((n) => (
        <article key={n.title} className="rounded-2xl border border-stone-200 bg-white shadow-sm p-4 sm:p-5">
          <div className="flex gap-3">
            <div className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${TONE[n.tone]}`}>
              <i className={`${n.icon} text-lg`} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-500">
                  {n.category}
                </span>
                <span className="text-[11px] text-stone-400">
                  {n.author} · {n.date}
                </span>
              </div>
              <h3 className="mt-1.5 text-sm font-semibold text-stone-900">{n.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-stone-600">{n.body}</p>
              <button
                type="button"
                disabled
                title="Full announcements coming soon"
                className="mt-2.5 text-xs font-semibold text-[#0f1e1a]/70 cursor-not-allowed"
              >
                View details →
              </button>
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
