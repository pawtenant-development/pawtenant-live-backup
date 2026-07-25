// ── Accounts › In-page section navigation ───────────────────────────────────
// A compact segmented control that scrolls to a section within the Accounts
// subtab. Deliberately visually SUBORDINATE to the existing
// Accounts / Payments & Refunds / Reconciliation Tool page tabs — it is a
// jump-list, not a competing tab bar. Scrolls horizontally on narrow screens
// inside its own container, so the page never overflows sideways.

export type AccountsSection =
  | "overview"
  | "channels"
  | "marketing"
  | "expenses"
  | "reconciliation";

export const ACCOUNTS_SECTIONS: { key: AccountsSection; label: string; icon: string }[] = [
  { key: "overview",       label: "Overview",            icon: "ri-dashboard-line" },
  { key: "channels",       label: "Channel Contribution", icon: "ri-pie-chart-line" },
  { key: "marketing",      label: "Marketing",           icon: "ri-megaphone-line" },
  { key: "expenses",       label: "Expenses & Books",    icon: "ri-wallet-3-line" },
  { key: "reconciliation", label: "Reconciliation",      icon: "ri-scales-3-line" },
];

/** DOM id for a section anchor — one definition shared by the nav and the sections. */
export const sectionId = (s: AccountsSection): string => `accounts-section-${s}`;

interface Props {
  active: AccountsSection;
  onNavigate: (s: AccountsSection) => void;
  /** Sections needing attention get a dot (e.g. reconciliation deltas). */
  attention?: Partial<Record<AccountsSection, boolean>>;
}

export default function AccountsSectionNav({ active, onNavigate, attention = {} }: Props) {
  return (
    <nav aria-label="Accounts sections" className="mb-4 -mx-1 px-1 overflow-x-auto">
      <div className="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1 min-w-max">
        {ACCOUNTS_SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onNavigate(s.key)}
            aria-current={active === s.key ? "true" : undefined}
            className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              active === s.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <i className={s.icon}></i>
            {s.label}
            {attention[s.key] && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="needs review"></span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
}
