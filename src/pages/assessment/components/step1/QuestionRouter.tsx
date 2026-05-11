// Step 1 v2 — one-question-at-a-time router.
//
// Reads the QuestionManifest, renders one card at a time, and delegates
// state mutations + the final transition to its parent (Step1Assessment →
// page.tsx). Tracks only currentIndex + errorVisible locally. Hydrates from
// localStorage on mount only when the parent `data` is empty (so resume /
// test-mode flows are never overwritten). Clears the saved draft when the
// final question advances to Step 2 via the existing onNext callback.
//
// Does NOT fire any tracking event. The Step-1 → Step-2 view event is
// fired by page.tsx::goNext() exactly once when onNext() is invoked.

import { useEffect, useRef, useState } from "react";
import type { Step1Data } from "../Step1Assessment";
import { QUESTION_MANIFEST } from "./QuestionManifest";
import { QuestionView } from "./QuestionView";
import {
  clearStep1Draft,
  isStep1DataEmpty,
  readStep1Draft,
  useStep1AutosaveWriter,
} from "./useStep1Autosave";

interface QuestionRouterProps {
  data: Step1Data;
  onChange: (d: Step1Data) => void;
  onNext: () => void;
}

export default function QuestionRouter({ data, onChange, onNext }: QuestionRouterProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorVisible, setErrorVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);

  // ── Hydrate from localStorage on mount (only if parent data is empty) ─────
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    if (!isStep1DataEmpty(data)) {
      // Parent data is already populated (resume / test-mode / re-mount).
      // Defer to parent. Do NOT touch localStorage.
      return;
    }
    const draft = readStep1Draft();
    if (!draft) return;
    onChange(draft.data);
    const safeIndex = Math.min(
      Math.max(0, draft.currentIndex),
      QUESTION_MANIFEST.length - 1,
    );
    setCurrentIndex(safeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Persist on changes ───────────────────────────────────────────────────
  useStep1AutosaveWriter(data, currentIndex, /* enabled */ true);

  // ── Smooth-scroll the active card into view on index change ──────────────
  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentIndex]);

  const def = QUESTION_MANIFEST[currentIndex];
  const total = QUESTION_MANIFEST.length;
  const isLast = currentIndex === total - 1;
  const isFirst = currentIndex === 0;

  const update = (patch: Partial<Step1Data>) => {
    onChange({ ...data, ...patch });
    // Clear the error as soon as the user starts answering.
    if (errorVisible) setErrorVisible(false);
  };

  const handleContinue = () => {
    if (!def.check(data)) {
      setErrorVisible(true);
      cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setErrorVisible(false);
    if (isLast) {
      // Defensive sweep — should never fire, but guards against a desynced
      // index. If any earlier question is unanswered, jump there.
      const firstMissing = QUESTION_MANIFEST.findIndex((q) => !q.check(data));
      if (firstMissing !== -1) {
        setCurrentIndex(firstMissing);
        setErrorVisible(true);
        return;
      }
      clearStep1Draft();
      onNext();
      return;
    }
    setCurrentIndex((i) => i + 1);
  };

  const handleBack = () => {
    if (isFirst) return;
    setErrorVisible(false);
    setCurrentIndex((i) => i - 1);
  };

  return (
    <div>
      {/* Header — matches legacy copy */}
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-extrabold text-gray-900">Mental Health Assessment</h2>
        <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">
          This confidential screening helps a licensed mental health professional evaluate your eligibility for an ESA letter. All answers are protected under HIPAA.
        </p>
      </div>

      {/* Landlord Verification Badge — identical to legacy */}
      <div className="mb-5 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-[#2c5282] rounded-lg flex-shrink-0">
          <i className="ri-shield-check-fill text-white text-sm"></i>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold text-[#2c5282]">Landlord-Verifiable Letter Included</p>
          <p className="text-xs text-[#2c5282]/70 mt-0.5">Every PawTenant letter includes a unique QR Verification ID — landlords can confirm authenticity instantly, no health info disclosed.</p>
        </div>
        <a
          href="/ESA-letter-verification"
          target="_blank"
          rel="noopener noreferrer"
          className="whitespace-nowrap text-xs font-bold text-[#2c5282] hover:underline cursor-pointer flex-shrink-0 flex items-center gap-1"
        >
          <i className="ri-external-link-line text-xs"></i>Learn more
        </a>
      </div>

      {/* Active question card */}
      <div ref={cardRef}>
        <QuestionView def={def} data={data} onUpdate={update} hasError={errorVisible} />
      </div>

      {/* Navigation */}
      <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          disabled={isFirst}
          className={`whitespace-nowrap w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border text-sm font-bold transition-colors ${
            isFirst
              ? "bg-gray-50 border-gray-100 text-gray-300 cursor-not-allowed"
              : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50 cursor-pointer"
          }`}
          aria-label="Back to previous question"
        >
          <i className="ri-arrow-left-line"></i>
          Back
        </button>
        <button
          type="button"
          onClick={handleContinue}
          className="whitespace-nowrap w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 sm:px-10 py-4 sm:py-3.5 bg-[#F97316] text-white font-bold text-base sm:text-sm rounded-xl sm:rounded-lg hover:bg-[#EA580C] active:bg-[#C2410C] transition-colors cursor-pointer shadow-[0_8px_22px_-10px_rgba(249,115,22,0.5)]"
          aria-label={isLast ? "Continue to your information" : `Continue to question ${currentIndex + 2} of ${total}`}
        >
          {isLast ? "Continue to Your Information" : `Continue · ${currentIndex + 1} of ${total}`}
          <i className="ri-arrow-right-line"></i>
        </button>
      </div>
    </div>
  );
}
