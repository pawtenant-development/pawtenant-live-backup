import {
  RECONCILIATION_STATUS_META,
  relativeFreshness,
  type ReconciliationStatus,
} from "../../../lib/accountsFinancialFlow";

// ── Accounts › Global header ────────────────────────────────────────────────
// One header for the whole Accounts workspace: which books period is open, the
// exact From/To dates every section below is using, how fresh the data is, the
// honest reconciliation status, the PKR→USD rate applied to salary figures, and
// the export action.
//
// The status badge is EVIDENCE-DRIVEN (resolveReconciliationStatus) — it reads
// "Balanced" only when the Stripe↔Orders bridge has explained every residual.
// It must never be decorated green while deltas are unexplained.

interface Props {
  rangeLabel: string;
  from: string;
  to: string;
  refreshedAtMs: number | null;
  nowMs: number;
  status: ReconciliationStatus;
  statusReasons: string[];
  fxRate: number;
  onFxRateChange: (rate: number) => void;
  onExport?: () => void;
  onOpenReconciliation?: () => void;
}

export default function AccountsHeader({
  rangeLabel, from, to, refreshedAtMs, nowMs, status, statusReasons,
  fxRate, onFxRateChange, onExport, onOpenReconciliation,
}: Props) {
  const meta = RECONCILIATION_STATUS_META[status];
  const toneCls =
    meta.tone === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : meta.tone === "warn" ? "text-amber-700 bg-amber-50 border-amber-200"
    : meta.tone === "bad" ? "text-rose-700 bg-rose-50 border-rose-200"
    : "text-gray-600 bg-gray-50 border-gray-200";
  const needsAttention = status === "needs_review" || status === "data_source_error";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-3">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-extrabold text-gray-900 truncate">{rangeLabel}</h2>
          <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <i className="ri-calendar-2-line text-gray-400"></i>
              <span className="font-semibold text-gray-700">{from || "—"}</span>
              <span className="text-gray-400">→</span>
              <span className="font-semibold text-gray-700">{to || "today"}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="ri-refresh-line text-gray-400"></i>
              Last refreshed {relativeFreshness(refreshedAtMs, nowMs)}
            </span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">
            Every section below uses this one date range.
          </p>
        </div>

        {/* Full width on phones so the badge / FX / export wrap instead of
            clipping past the viewport edge at 360–375px. */}
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto sm:shrink-0">
          <button
            type="button"
            onClick={onOpenReconciliation}
            disabled={!onOpenReconciliation}
            title={statusReasons.length > 0 ? statusReasons.join(" ") : "All Accounts totals reconcile for this range"}
            className={`inline-flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 border transition-colors ${toneCls} ${
              onOpenReconciliation ? "cursor-pointer hover:brightness-95" : "cursor-default"
            }`}
          >
            <i className={`${meta.icon} ${status === "updating" ? "animate-spin" : ""}`}></i>
            {meta.label}
            {needsAttention && statusReasons.length > 0 && (
              <span className="ml-0.5 rounded-full bg-white/70 px-1.5 text-[10px]">{statusReasons.length}</span>
            )}
          </button>

          <div className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-xl px-3 py-1.5">
            <span className="text-xs font-bold text-gray-500 whitespace-nowrap" title="Rate used to convert PKR salary figures to USD">
              PKR → USD
            </span>
            <input
              type="number" value={fxRate} min={1}
              onChange={(e) => onFxRateChange(Math.max(1, parseFloat(e.target.value) || 1))}
              className="w-16 px-2 py-1 border border-gray-200 rounded-lg text-xs text-gray-700 focus:outline-none focus:border-[#3b6ea5]"
            />
          </div>

          {onExport && (
            <button type="button" onClick={onExport}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">
              <i className="ri-file-excel-2-line text-emerald-600"></i>Export
            </button>
          )}
        </div>
      </div>

      {/* Honest disclosure — never hide a reconciliation problem behind a badge. */}
      {needsAttention && statusReasons.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-gray-100 pt-2.5">
          {statusReasons.map((r) => (
            <li key={r} className="text-[11px] text-amber-800 flex items-start gap-1.5">
              <i className="ri-error-warning-line mt-0.5 shrink-0"></i><span>{r}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
