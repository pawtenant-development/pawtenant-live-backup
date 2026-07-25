import { useEffect } from "react";
import {
  FLOW_SOURCE_LABEL,
  RECONCILIATION_STATUS_META,
  type FlowStep,
  type ReconciliationStatus,
} from "../../../lib/accountsFinancialFlow";

// ── Accounts › Calculation drawer ───────────────────────────────────────────
// Right-side drawer opened by clicking any metric in the financial flow. Shows
// the exact formula, the worked example for the SELECTED range, the source
// system, the date basis, transaction counts and the reconciliation status —
// so a first-time viewer can see where a number came from without guessing.
// PII-free by construction: it only ever renders FlowStep metadata.

const fmtUsd = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  step: FlowStep | null;
  rangeLabel: string;
  from: string;
  to: string;
  status: ReconciliationStatus;
  /** Extra child values shown under "Related values" (label → USD). */
  related?: { label: string; amountUsd: number }[];
  onClose: () => void;
}

export default function MetricCalculationDrawer({ step, rangeLabel, from, to, status, related = [], onClose }: Props) {
  // Escape closes; body scroll is locked while open.
  useEffect(() => {
    if (!step) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [step, onClose]);

  if (!step) return null;

  const meta = RECONCILIATION_STATUS_META[status];
  const toneCls =
    meta.tone === "ok" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : meta.tone === "warn" ? "text-amber-700 bg-amber-50 border-amber-200"
    : meta.tone === "bad" ? "text-rose-700 bg-rose-50 border-rose-200"
    : "text-gray-600 bg-gray-50 border-gray-200";

  return (
    <div className="fixed inset-0 z-[130] flex justify-end" role="dialog" aria-modal="true" aria-label={`${step.label} calculation`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose}></div>
      <div className="relative bg-white w-full sm:max-w-md h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">How this is calculated</p>
            <h3 className="text-base font-extrabold text-gray-900 mt-0.5 truncate">{step.label}</h3>
            <p className={`text-2xl font-extrabold mt-1 tabular-nums ${step.runningUsd < 0 ? "text-rose-600" : "text-gray-900"}`}>
              {fmtUsd(step.kind === "delta" ? step.amountUsd : step.runningUsd)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer">
            <i className="ri-close-line"></i>
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 flex-1">
          {/* Plain-English meaning */}
          <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5">
            {step.tooltip}
          </p>

          {/* Formula + worked example */}
          <Section title="Formula">
            <p className="text-xs font-semibold text-gray-800">{step.formula}</p>
            <p className="mt-1.5 text-xs font-mono tabular-nums text-[#3b6ea5] bg-[#eef4fa] border border-[#d6e4f0] rounded-lg px-3 py-2 break-words">
              {step.workedExample}
            </p>
          </Section>

          {/* Provenance */}
          <Section title="Where the number comes from">
            <Field label="Source" value={FLOW_SOURCE_LABEL[step.source]} />
            <Field label="Date basis" value={step.dateBasis} />
            <Field label="Selected range" value={`${rangeLabel} · ${from} → ${to}`} />
            {step.includedCount != null && (
              <Field label="Transactions included" value={step.includedCount.toLocaleString("en-US")} />
            )}
          </Section>

          {/* Related child values */}
          {related.length > 0 && (
            <Section title="Related values">
              <div className="divide-y divide-gray-100">
                {related.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="text-xs text-gray-600 truncate">{r.label}</span>
                    <span className={`text-xs font-bold tabular-nums shrink-0 ${r.amountUsd < 0 ? "text-rose-500" : "text-gray-800"}`}>
                      {fmtUsd(r.amountUsd)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Reconciliation status */}
          <Section title="Reconciliation status">
            <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2.5 py-1 border ${toneCls}`}>
              <i className={meta.icon}></i>{meta.label}
            </span>
          </Section>

          {/* Known limitation */}
          {step.limitation && (
            <Section title="Known limitation">
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                <i className="ri-information-line mr-1"></i>{step.limitation}
              </p>
            </Section>
          )}

          <p className="text-[11px] text-gray-400 leading-relaxed border-t border-gray-100 pt-3">
            Figures are internal management estimates for operating decisions, not finalized accounting.
            No customer details are shown in this panel.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-xs text-gray-500 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-gray-800 text-right">{value}</span>
    </div>
  );
}
