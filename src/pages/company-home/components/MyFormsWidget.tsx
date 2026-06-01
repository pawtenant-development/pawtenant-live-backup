import { Widget } from "./TeamWidget";

/**
 * My Forms / HR Requests widget — entry points for employee self-service
 * requests. UI foundation: actions are disabled placeholders until the request
 * backends (leave, attendance correction, benefit claim) are built (fast-follow).
 */
const FORMS: { label: string; icon: string; hint: string }[] = [
  { label: "Leave Request", icon: "ri-calendar-event-line", hint: "Apply for leave" },
  { label: "Attendance Correction", icon: "ri-time-line", hint: "Fix a clock entry" },
  { label: "Benefit Claim", icon: "ri-heart-pulse-line", hint: "Medical fund claim" },
];

export default function MyFormsWidget() {
  return (
    <div id="forms">
      <Widget
        icon="ri-survey-line"
        title="My Forms / HR Requests"
        action={<span className="text-[10px] font-semibold text-stone-400">SOON</span>}
      >
        <ul className="space-y-1.5">
          {FORMS.map((f) => (
            <li key={f.label}>
              <button
                type="button"
                disabled
                title="Request forms coming soon"
                className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-stone-200 px-2.5 py-2 text-left hover:bg-stone-50 cursor-not-allowed"
              >
                <i className={`${f.icon} text-stone-400`} />
                <span className="flex-1">
                  <span className="block text-xs font-medium text-stone-700">{f.label}</span>
                  <span className="block text-[11px] text-stone-400">{f.hint}</span>
                </span>
                <i className="ri-add-line text-stone-300" />
              </button>
            </li>
          ))}
        </ul>
      </Widget>
    </div>
  );
}
