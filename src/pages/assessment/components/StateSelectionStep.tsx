// StateSelectionStep — the FIRST step of the ESA/PSD assessment. State is
// collected up front so the 30-day acknowledgment (AR/CA/IA/LA/MT) appears
// before the customer spends time on the deep questionnaire. On a compliance
// state the acknowledgment modal fires immediately; the customer cannot
// continue until they acknowledge. The evidence is handed to the parent and
// persisted into orders.assessment_answers.stateAcknowledgment on lead save.

import { useEffect, useRef, useState } from "react";
import { US_STATES } from "../../../lib/usStates";
import StateComplianceBanner, { isComplianceState } from "./StateComplianceBanner";
import StateAcknowledgmentModal, { type StateAcknowledgment } from "./StateAcknowledgmentModal";
import Hud2026UpdateBanner from "../../../components/feature/Hud2026UpdateBanner";

interface Props {
  state: string;
  service: "esa" | "psd";
  /** Starting one-time price (USD) shown at acknowledgment time (1 pet/dog). */
  priceShown: number;
  existingAck?: StateAcknowledgment;
  onChange: (state: string) => void;
  onConfirm: (state: string, ack?: StateAcknowledgment) => void;
}

export default function StateSelectionStep({ state, service, priceShown, existingAck, onChange, onConfirm }: Props) {
  const [ack, setAck] = useState<StateAcknowledgment | undefined>(existingAck);
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  const stateUpper = (state ?? "").toUpperCase();
  const requiresAck = isComplianceState(state);
  const hasValidAck = !!ack && ack.state === stateUpper;
  const isPsd = service === "psd";
  const primaryBg = isPsd ? "bg-amber-600 hover:bg-amber-700 active:bg-amber-800" : "bg-[#F97316] hover:bg-[#EA580C] active:bg-[#C2410C]";

  // Open the modal as soon as a compliance state is chosen without a valid ack.
  useEffect(() => {
    if (requiresAck && !hasValidAck) setModalOpen(true);
    else setModalOpen(false);
  }, [stateUpper, requiresAck, hasValidAck]);

  const handleSelect = (next: string) => {
    setError(false);
    if (ack && ack.state !== next.toUpperCase()) setAck(undefined); // state changed → invalidate ack
    onChange(next);
  };

  const handleContinue = () => {
    if (!state) { setError(true); selectRef.current?.focus(); return; }
    if (requiresAck && !hasValidAck) { setModalOpen(true); return; }
    onConfirm(state, ack);
  };

  return (
    <div className="max-w-xl mx-auto">
      <div className="text-center mb-6">
        <div className={`w-12 h-12 mx-auto flex items-center justify-center rounded-xl mb-3 ${isPsd ? "bg-amber-50" : "bg-[#E8F1EE]"}`}>
          <i className={`ri-map-pin-2-line text-xl ${isPsd ? "text-amber-700" : "text-[#1A5C4F]"}`}></i>
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900">Where do you live?</h2>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-md mx-auto">
          We ask first because a few states have rules that affect when a signed
          {isPsd ? " PSD" : " ESA"} letter can be issued. This takes a few seconds.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
          Your State <span className={isPsd ? "text-amber-600" : "text-[#F97316]"}>*</span>
        </label>
        <select
          ref={selectRef}
          value={state}
          onChange={(e) => handleSelect(e.target.value)}
          className={`w-full px-4 py-3 text-sm border rounded-lg bg-white focus:outline-none transition-colors text-gray-800 ${
            error ? "border-red-400" : `border-gray-200 ${isPsd ? "focus:border-amber-400" : "focus:border-[#F97316]"}`
          }`}
        >
          <option value="">Select your state</option>
          {US_STATES.map((s) => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
        {error && (
          <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
            <i className="ri-error-warning-line"></i>Please select your state to continue.
          </p>
        )}

        {/* Compliance banner + acknowledged chip */}
        {requiresAck && <StateComplianceBanner state={state} service={service} className={hasValidAck ? "mt-4 mb-2" : "mt-4"} />}
        {requiresAck && hasValidAck && (
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
            <i className="ri-checkbox-circle-fill text-emerald-600 text-sm flex-shrink-0"></i>
            <p className="text-xs text-emerald-800">
              <span className="font-bold">State notice acknowledged.</span> Your evaluation can begin today —
              letter timing follows your state&apos;s rules.
            </p>
          </div>
        )}

        {state && (
          <Hud2026UpdateBanner state={state} variant="compact" className="mt-4" />
        )}
      </div>

      <button
        type="button"
        onClick={handleContinue}
        className={`mt-6 w-full inline-flex items-center justify-center gap-2 px-8 py-4 text-white font-bold text-base rounded-xl transition-colors cursor-pointer shadow-[0_8px_22px_-10px_rgba(249,115,22,0.5)] ${primaryBg}`}
      >
        Continue to Assessment
        <i className="ri-arrow-right-line"></i>
      </button>

      <StateAcknowledgmentModal
        open={modalOpen}
        state={state}
        service={service}
        priceShown={priceShown}
        onAcknowledge={(a) => { setAck(a); setModalOpen(false); }}
        onPickDifferentState={() => { setModalOpen(false); setTimeout(() => selectRef.current?.focus(), 50); }}
      />
    </div>
  );
}
