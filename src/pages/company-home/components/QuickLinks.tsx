import { Link } from "react-router-dom";
import { Widget } from "./TeamWidget";

interface QuickLinksProps {
  onNavigate?: (section: string) => void;
}

/**
 * Quick links widget for Home — shortcuts to portal sections plus the internal
 * Help / Runbook guide. Section shortcuts use the portal's section navigation.
 */
const SHORTCUTS: { section: string; label: string; icon: string }[] = [
  { section: "performance", label: "Performance", icon: "ri-bar-chart-2-line" },
  { section: "policies", label: "Policies", icon: "ri-shield-check-line" },
  { section: "forms", label: "HR / Forms", icon: "ri-survey-line" },
];

export default function QuickLinks({ onNavigate }: QuickLinksProps) {
  return (
    <div id="quicklinks">
      <Widget icon="ri-links-line" title="Quick Links">
        <div className="flex flex-wrap gap-2">
          {SHORTCUTS.map((s) => (
            <button
              key={s.section}
              type="button"
              onClick={() => onNavigate?.(s.section)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition-colors"
            >
              <i className={`${s.icon} text-sm`} />
              {s.label}
            </button>
          ))}
          <Link
            to="/admin-guide"
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 px-3 py-2 text-xs font-semibold text-stone-700 transition-colors"
          >
            <i className="ri-book-open-line text-sm" />
            Help / Runbook
          </Link>
        </div>
      </Widget>
    </div>
  );
}
