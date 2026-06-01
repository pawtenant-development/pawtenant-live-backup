/**
 * Links the employee portal to the existing Workstation (admin orders portal).
 * Opens in a NEW TAB so the employee keeps their Company Home open as the
 * primary clock-in / status surface. Secondary-action styling — the main
 * workday controls live in the Workday panel, not here.
 *
 * Plain anchor with target="_blank" + rel="noreferrer" (no opener leak).
 */
export default function EnterWorkstationButton() {
  return (
    <a
      href="/admin-orders"
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white hover:bg-stone-50 px-4 py-2 text-sm font-semibold text-stone-700 shadow-sm transition-colors"
    >
      <i className="ri-briefcase-line text-base"></i>
      Enter Workstation
      <i className="ri-external-link-line text-xs text-stone-400"></i>
    </a>
  );
}
