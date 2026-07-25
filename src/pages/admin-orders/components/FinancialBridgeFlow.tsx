import type { FlowStep } from "../../../lib/accountsFinancialFlow";

// ── Accounts › Financial bridge flow ────────────────────────────────────────
// Replaces the old row of disconnected KPI cards with the actual arithmetic:
//   Gross Charged − Refunds = Net Revenue − Provider Payments = Contribution
//   Before Stripe − Stripe Fees = Contribution After Stripe − Company Expenses
//   = Operating Net
//
// Reads left→right on desktop (horizontally scrollable inside its own
// container — the page never scrolls sideways) and top→bottom on mobile.
// Subtraction is communicated by an explicit "−" glyph and the word itself,
// never by colour alone. Every step is a button that opens the calculation
// drawer.

const fmtUsd = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtUsd0 = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

interface Props {
  steps: FlowStep[];
  onSelect: (step: FlowStep) => void;
  /** Key of the currently open step, for the active outline. */
  activeKey?: string | null;
}

export default function FinancialBridgeFlow({ steps, onSelect, activeKey }: Props) {
  const last = steps[steps.length - 1];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <i className="ri-flow-chart text-[#3b6ea5]"></i>How the money flows
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Each step subtracts from the one before it. Select any step to see its exact formula and source.
          </p>
        </div>
        {last && (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{last.label}</p>
            <p className={`text-xl font-extrabold tabular-nums ${last.runningUsd >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
              {fmtUsd(last.runningUsd)}
            </p>
          </div>
        )}
      </div>

      {/* ── Desktop / tablet: left → right ── */}
      <div className="hidden md:block overflow-x-auto -mx-1 px-1 pb-1">
        <div className="flex items-stretch gap-1.5 min-w-max">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-stretch gap-1.5">
              {i > 0 && (
                <div className="flex items-center shrink-0" aria-hidden="true">
                  <span className="text-gray-300 text-lg font-bold leading-none">
                    {s.kind === "delta" ? "−" : "="}
                  </span>
                </div>
              )}
              <StepTile step={s} active={activeKey === s.key} onSelect={onSelect} />
            </div>
          ))}
        </div>
      </div>

      {/* ── Mobile: top → bottom, stacked ── */}
      <div className="md:hidden divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
        {steps.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => onSelect(s)}
            className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-3 cursor-pointer transition-colors ${
              s.kind === "subtotal" ? "bg-gray-50/70" : "bg-white"
            } ${activeKey === s.key ? "ring-2 ring-inset ring-[#3b6ea5]" : "hover:bg-gray-50"}`}
          >
            <span className="flex items-center gap-2 min-w-0">
              <span className={`shrink-0 w-5 text-center text-sm font-extrabold ${s.kind === "delta" ? "text-rose-500" : "text-gray-300"}`}>
                {s.kind === "delta" ? "−" : "="}
              </span>
              <span className="min-w-0">
                <span className={`block text-xs truncate ${s.kind === "subtotal" ? "font-extrabold text-gray-900" : "font-semibold text-gray-600"}`}>
                  {s.label}
                </span>
                <span className="block text-[10px] text-gray-400 truncate">{s.formula}</span>
              </span>
            </span>
            <span className="shrink-0 flex items-center gap-1.5">
              <span className={`text-sm font-extrabold tabular-nums ${
                s.kind === "delta" ? "text-rose-500" : s.runningUsd < 0 ? "text-rose-600" : "text-gray-900"
              }`}>
                {fmtUsd0(s.kind === "delta" ? Math.abs(s.amountUsd) : s.runningUsd)}
              </span>
              <i className="ri-arrow-right-s-line text-gray-300"></i>
            </span>
          </button>
        ))}
      </div>

      <p className="mt-2.5 text-[11px] text-gray-400 leading-relaxed">
        <i className="ri-information-line mr-1"></i>
        Rows marked <span className="font-bold text-rose-500">−</span> are deducted; rows marked
        <span className="font-bold text-gray-500"> =</span> are running totals. Operating Net is an internal estimate, not finalized accounting.
      </p>
    </div>
  );
}

function StepTile({ step, active, onSelect }: { step: FlowStep; active: boolean; onSelect: (s: FlowStep) => void }) {
  const isSubtotal = step.kind === "subtotal";
  const value = isSubtotal ? step.runningUsd : Math.abs(step.amountUsd);
  const negativeTotal = isSubtotal && step.runningUsd < 0;

  return (
    <button
      type="button"
      onClick={() => onSelect(step)}
      title={step.tooltip}
      aria-label={`${step.label}: ${step.formula}`}
      className={`shrink-0 w-[128px] text-left rounded-xl border px-2.5 py-2.5 cursor-pointer transition-colors ${
        isSubtotal ? "bg-gray-50 border-gray-200 hover:bg-gray-100" : "bg-white border-dashed border-gray-200 hover:bg-gray-50"
      } ${active ? "ring-2 ring-[#3b6ea5] border-[#3b6ea5]" : ""}`}
    >
      <span className="flex items-center gap-1 mb-1">
        <span className={`text-[10px] font-bold uppercase tracking-wider leading-tight ${isSubtotal ? "text-gray-500" : "text-rose-400"}`}>
          {isSubtotal ? "Total" : "Less"}
        </span>
        <i className="ri-information-line text-gray-300 text-[11px] ml-auto"></i>
      </span>
      <span className={`block text-[11px] leading-tight mb-1 ${isSubtotal ? "font-extrabold text-gray-800" : "font-semibold text-gray-600"}`}>
        {step.label}
      </span>
      <span className={`block text-base font-extrabold tabular-nums ${
        !isSubtotal ? "text-rose-500" : negativeTotal ? "text-rose-600" : "text-gray-900"
      }`}>
        {!isSubtotal ? "−" : ""}{fmtUsd0(value)}
      </span>
    </button>
  );
}
