import { useId, type ReactNode } from "react";

// ── Accounts › Collapsible section shell ────────────────────────────────────
// One accessible expand/collapse wrapper used by every major Accounts section
// (LIVE-ACCOUNTS-FINANCIAL-RECONCILIATION-UX-001 correction addendum §7).
//
// Behaviour contract:
//   • Children stay MOUNTED while collapsed (animated via grid-template-rows,
//     hidden with overflow + aria-hidden). Data fetching, onResult/onTotals
//     lifting and scroll anchors therefore keep working regardless of the
//     visual state — collapsing a section can never blank the header badge.
//   • Native <button> header → keyboard support for free; aria-expanded +
//     aria-controls wired; the label states the section name.
//   • The optional `summary` renders inside the header, so a collapsed
//     section still shows its compact status line (§7 "closed when healthy").
//   • No layout jump: the row animates rows-[0fr] ↔ rows-[1fr].

interface Props {
  /** DOM id for scroll anchors (sectionId(...)). Applied to the outer section. */
  id?: string;
  title: string;
  icon: string;
  subtitle?: string;
  /** Compact, always-visible status content on the right of the header. */
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** Amber attention dot next to the title (e.g. reconciliation needs review). */
  attention?: boolean;
  children: ReactNode;
}

export default function AccountsCollapsibleSection({
  id, title, icon, subtitle, summary, open, onToggle, attention = false, children,
}: Props) {
  const bodyId = useId();
  return (
    <section id={id} className="scroll-mt-4 mt-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={bodyId}
        aria-label={`${open ? "Collapse" : "Expand"} ${title}`}
        className="w-full flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl px-4 py-3 text-left cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <i
          className={`ri-arrow-right-s-line text-gray-400 text-lg shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          aria-hidden="true"
        ></i>
        <i className={`${icon} text-[#3b6ea5] shrink-0`} aria-hidden="true"></i>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-extrabold text-gray-900">
            {title}
            {attention && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" aria-label="needs review"></span>
            )}
          </span>
          {subtitle && <span className="block text-[11px] text-gray-400 truncate">{subtitle}</span>}
        </span>
        {summary && <span className="ml-auto shrink min-w-0 flex items-center gap-2 text-right">{summary}</span>}
      </button>

      <div
        id={bodyId}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        {/* visibility:hidden removes collapsed controls from the tab order
            while keeping children mounted (fetching + lifted state stay live). */}
        <div className={`overflow-hidden ${open ? "visible" : "invisible pointer-events-none"}`}>
          {children}
        </div>
      </div>
    </section>
  );
}
