interface CompanyLeftRailProps {
  active: string;
  onSelect: (section: string) => void;
}

/**
 * Company portal left icon rail. Switches the portal section (Home, Performance,
 * HR/Forms, Policies, Help). Salary & Benefits live inside Performance.
 * "Workstation" opens the admin portal in a new tab. Hidden on mobile (top-bar
 * hamburger covers navigation).
 */

type RailItem =
  | { kind: "section"; id: string; icon: string; label: string }
  | { kind: "tab"; href: string; icon: string; label: string };

const ITEMS: RailItem[] = [
  { kind: "section", id: "home", icon: "ri-home-5-line", label: "Home" },
  { kind: "section", id: "myprofile", icon: "ri-id-card-line", label: "My Profile" },
  { kind: "section", id: "team", icon: "ri-team-line", label: "Team Directory" },
  { kind: "tab", href: "/admin-orders", icon: "ri-computer-line", label: "Workstation" },
  { kind: "section", id: "performance", icon: "ri-bar-chart-2-line", label: "Performance" },
  { kind: "section", id: "forms", icon: "ri-survey-line", label: "HR / Forms" },
  { kind: "section", id: "policies", icon: "ri-shield-check-line", label: "Policies" },
  { kind: "section", id: "help", icon: "ri-question-line", label: "Help" },
];

export default function CompanyLeftRail({ active, onSelect }: CompanyLeftRailProps) {
  return (
    <aside className="hidden sm:flex sticky top-14 self-start h-[calc(100vh-3.5rem)] w-14 flex-col items-center gap-1 border-r border-stone-200 bg-[#0f1e1a] py-3">
      {ITEMS.map((item) => {
        const isActive = item.kind === "section" && item.id === active;
        const label = (
          <span className="pointer-events-none absolute left-12 z-40 whitespace-nowrap rounded-md bg-stone-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {item.label}
          </span>
        );
        const cls = `group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
          isActive ? "bg-white/15 text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
        }`;
        return item.kind === "tab" ? (
          <a key={item.label} href={item.href} target="_blank" rel="noreferrer" className={cls} title={item.label}>
            <i className={`${item.icon} text-lg`} />
            {label}
          </a>
        ) : (
          <button key={item.label} type="button" onClick={() => onSelect(item.id)} className={cls} title={item.label}>
            <i className={`${item.icon} text-lg`} />
            {label}
          </button>
        );
      })}
    </aside>
  );
}
