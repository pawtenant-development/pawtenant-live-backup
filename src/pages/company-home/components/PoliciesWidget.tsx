import { Widget } from "./TeamWidget";

/**
 * Policies / documents widget — links to company policy docs. UI foundation:
 * entries are placeholders until a documents backend / storage is wired up.
 */
const POLICIES: { label: string; icon: string }[] = [
  { label: "Attendance Policy", icon: "ri-time-line" },
  { label: "Leave Policy", icon: "ri-calendar-event-line" },
  { label: "Salary Snapshot Policy", icon: "ri-money-dollar-circle-line" },
  { label: "Benefits Policy", icon: "ri-heart-pulse-line" },
  { label: "Internal Communication Policy", icon: "ri-mail-line" },
  { label: "Permissions & Access Policy", icon: "ri-shield-keyhole-line" },
];

export default function PoliciesWidget() {
  return (
    <div id="policies">
      <Widget icon="ri-file-list-3-line" title="Policies & Documents">
        <ul className="space-y-1">
          {POLICIES.map((p) => (
            <li key={p.label}>
              <button
                type="button"
                disabled
                title="Document library coming soon"
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-xs text-stone-600 hover:bg-stone-50 cursor-not-allowed"
              >
                <i className={`${p.icon} text-stone-400`} />
                <span className="flex-1">{p.label}</span>
                <i className="ri-arrow-right-s-line text-stone-300" />
              </button>
            </li>
          ))}
        </ul>
      </Widget>
    </div>
  );
}
