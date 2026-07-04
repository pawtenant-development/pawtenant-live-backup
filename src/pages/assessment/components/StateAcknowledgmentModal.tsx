// State-law acknowledgment modal — shown immediately when the customer selects
// a state that requires a provider-relationship / waiting period (AR/CA/IA/LA/MT),
// BEFORE they can continue past Step 2. This moves the acknowledgment from the
// Step 3 payment card (where it previously lived as a checkbox) to the moment
// the state is chosen, so nobody reaches checkout without understanding letter
// timing in their state.
//
// The acknowledgment evidence (state, service, copy version, timestamp, price
// shown) is returned to the caller and persisted into orders.assessment_answers
// via the existing lead/order upsert path — no new table or column required.
// Step 3 renders a confirmed summary when this early acknowledgment exists and
// falls back to its original checkbox for resumed orders that predate it.

import { createPortal } from "react-dom";
import { isComplianceState } from "./StateComplianceBanner";
import { US_STATES } from "../../../lib/usStates";

/** Bump when the acknowledgment copy changes so stored evidence stays auditable. */
export const STATE_ACK_VERSION = "2026-07-02.v1";

export interface StateAcknowledgment {
  /** Two-letter state code the user acknowledged (uppercase). */
  state: string;
  /** Service the acknowledgment was shown for ("esa"). */
  service: string;
  /** Copy version identifier — pairs with STATE_ACK_VERSION. */
  version: string;
  /** Exact acknowledgment sentence the user accepted. */
  text: string;
  /** ISO timestamp of the acknowledgment click. */
  acknowledgedAt: string;
  /** One-time price (USD) displayed in the flow at acknowledgment time. */
  priceShown: number;
}

export function stateNameFor(code: string): string {
  const match = US_STATES.find((s) => s.code === (code ?? "").toUpperCase());
  return match?.name ?? code;
}

/** The sentence the user agrees to — stored verbatim as evidence. */
export function buildStateAckText(stateCode: string, service: string = "esa"): string {
  const name = stateNameFor(stateCode);
  const doc = service === "psd" ? "PSD documentation" : "ESA documentation";
  return (
    `I understand that ${name} requires a provider relationship/evaluation period before ` +
    `certain ${doc} can be issued, that PawTenant can begin my evaluation today, ` +
    `and that the timing of my signed letter may depend on ${name}'s rules.`
  );
}

/** Build the full evidence object at acknowledgment time. */
export function buildStateAcknowledgment(stateCode: string, service: string, priceShown: number): StateAcknowledgment {
  return {
    state: (stateCode ?? "").toUpperCase(),
    service,
    version: STATE_ACK_VERSION,
    text: buildStateAckText(stateCode, service),
    acknowledgedAt: new Date().toISOString(),
    priceShown,
  };
}

interface StateAcknowledgmentModalProps {
  open: boolean;
  state: string;
  priceShown: number;
  /** "esa" (default) or "psd" — adjusts the documentation wording + button color. */
  service?: "esa" | "psd";
  onAcknowledge: (ack: StateAcknowledgment) => void;
  onPickDifferentState: () => void;
}

export default function StateAcknowledgmentModal({
  open,
  state,
  priceShown,
  service = "esa",
  onAcknowledge,
  onPickDifferentState,
}: StateAcknowledgmentModalProps) {
  if (!open || !isComplianceState(state)) return null;

  const name = stateNameFor(state);
  const isCA = (state ?? "").toUpperCase() === "CA";
  const isPsd = service === "psd";
  const docPhrase = isPsd ? "PSD documentation" : "ESA documentation";
  const letterPhrase = isPsd ? "PSD letter" : "ESA letter";
  const primaryBtn = isPsd
    ? "bg-amber-600 hover:bg-amber-700 active:bg-amber-800 shadow-[0_8px_22px_-10px_rgba(217,119,6,0.5)]"
    : "bg-[#F97316] hover:bg-[#EA580C] active:bg-[#C2410C] shadow-[0_8px_22px_-10px_rgba(249,115,22,0.5)]";

  return createPortal(
    <div
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-slate-900/55 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="state-ack-title"
    >
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-amber-100 bg-amber-50/70 flex items-start gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-amber-100 rounded-xl flex-shrink-0 ring-1 ring-amber-200">
            <i className="ri-shield-star-line text-amber-700 text-lg"></i>
          </div>
          <div className="min-w-0">
            <h2 id="state-ack-title" className="text-base sm:text-lg font-extrabold text-gray-900 leading-snug">
              One thing to know about {name}
            </h2>
            <p className="text-xs text-amber-800/90 mt-1">Takes 20 seconds — then your evaluation continues.</p>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-4 space-y-3">
          <p className="text-sm text-gray-700 leading-relaxed">
            {isCA ? (
              <>
                California law requires at least a <strong>30-day provider relationship</strong> before
                a {letterPhrase} can be issued.
              </>
            ) : (
              <>
                {name} requires a <strong>provider relationship or evaluation period</strong> before
                certain {docPhrase} can be issued.
              </>
            )}
          </p>
          <div className="rounded-xl bg-[#E8F1EE]/70 border border-[#CFE2DC] px-4 py-3 space-y-2">
            <p className="text-sm text-gray-800 flex items-start gap-2">
              <i className="ri-checkbox-circle-fill text-[#1A5C4F] text-base flex-shrink-0 mt-px"></i>
              <span><strong>Your evaluation begins today.</strong> Your answers go to a licensed provider right away.</span>
            </p>
            <p className="text-sm text-gray-800 flex items-start gap-2">
              <i className="ri-time-line text-[#1A5C4F] text-base flex-shrink-0 mt-px"></i>
              <span>Your signed letter is issued after the state-required period is complete — and only if clinically appropriate. Approval is not automatic.</span>
            </p>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            By continuing, you confirm you understand that PawTenant can begin your evaluation today
            and that your signed letter&apos;s timing may depend on {name}&apos;s rules.
          </p>
        </div>

        {/* Actions */}
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-1 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onAcknowledge(buildStateAcknowledgment(state, service, priceShown))}
            className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 text-white font-bold text-sm rounded-xl transition-colors cursor-pointer ${primaryBtn}`}
          >
            I understand — continue my evaluation
            <i className="ri-arrow-right-line"></i>
          </button>
          <button
            type="button"
            onClick={onPickDifferentState}
            className="w-full inline-flex items-center justify-center px-6 py-2.5 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors cursor-pointer"
          >
            I need to pick a different state
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
