import { Widget } from "./TeamWidget";

/**
 * Right-hand help / policy side panel for the /company → HR / Forms dashboard.
 * Static, self-contained — gives the two-column forms layout a useful second
 * column (status of how requests are handled + the attendance/leave policy
 * notes) instead of leaving blank right-side space. No backend.
 */
const POLICY_NOTES: { icon: string; title: string; body: string }[] = [
  {
    icon: "ri-time-line",
    title: "30-minute late grace",
    body: "Clock-in within 30 minutes of your shift start is on time. 30 minutes or later counts as a half-day late.",
  },
  {
    icon: "ri-scales-3-line",
    title: "Half-day deduction",
    body: "A half-day late applies one half-day salary deduction for that date. Approved attendance corrections update this automatically.",
  },
  {
    icon: "ri-calendar-event-line",
    title: "Leave & time off",
    body: "Submit leave in advance where possible. Partial / half-day leave is supported. Pending leave does not affect payroll until reviewed.",
  },
];

export default function FormsHelpPanel() {
  return (
    <div className="space-y-4">
      <Widget icon="ri-information-line" title="How requests work">
        <ol className="space-y-2.5">
          {[
            { n: 1, t: "Submit a request", d: "Use the Leave or Attendance Correction form." },
            { n: 2, t: "HR / management review", d: "You'll see the status update on this page." },
            { n: 3, t: "Auto-applied", d: "Approved attendance corrections update attendance and payroll automatically." },
          ].map((s) => (
            <li key={s.n} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-stone-800 text-[10px] font-bold text-white">
                {s.n}
              </span>
              <span>
                <span className="block text-xs font-semibold text-stone-800">{s.t}</span>
                <span className="block text-[11px] leading-relaxed text-stone-500">{s.d}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <p className="flex items-start gap-2 text-[11px] leading-relaxed text-emerald-800">
            <i className="ri-checkbox-circle-line mt-0.5 flex-shrink-0" />
            <span>
              Requests are reviewed by HR / management. Approved attendance corrections update attendance
              and payroll automatically.
            </span>
          </p>
        </div>
      </Widget>

      <Widget icon="ri-shield-check-line" title="Policy quick notes">
        <ul className="space-y-3">
          {POLICY_NOTES.map((p) => (
            <li key={p.title} className="flex items-start gap-2.5">
              <i className={`${p.icon} mt-0.5 text-stone-400`} />
              <span>
                <span className="block text-xs font-semibold text-stone-700">{p.title}</span>
                <span className="block text-[11px] leading-relaxed text-stone-500">{p.body}</span>
              </span>
            </li>
          ))}
        </ul>
      </Widget>
    </div>
  );
}
