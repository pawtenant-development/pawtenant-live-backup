// Step 1 v2 — one-screen-at-a-time router.
//
// Reads the QuestionManifest, renders one card at a time, and delegates
// state mutations + the final transition to its parent (Step1Assessment →
// page.tsx). Tracks only errorVisible locally — the current question index is
// owned by page.tsx (ASSESSMENT-PROGRESS-CONSISTENCY-001). Hydrates from
// localStorage on mount only when the parent `data` is empty (so resume /
// test-mode flows are never overwritten). Clears the saved draft when the
// final screen advances to Step 2 via the existing onNext callback.
//
// Does NOT fire any tracking event, and NEVER logs an answer. The Step-1 →
// Step-2 view event is fired by page.tsx::goNext() exactly once when onNext()
// is invoked.
//
// ASSESSMENT-PRESENTATION-TRUST-001 (2026-08-21):
//   • a real progress indicator (bar + "Question X of N");
//   • AUTO-ADVANCE REMOVED — selecting an answer never navigates. Advancing is
//     always a deliberate Continue press, so a mis-tap cannot skip a question;
//   • a persistent, quiet trust strip below the card;
//   • testimonials at two reassurance points only, never on every screen.
// The manifest, the answer values, the safety hard-stop and the autosave
// contract are unchanged.
//
// ASSESSMENT-PET-SUPPORT-AND-STEP-STRUCTURE-001 (2026-08-26):
//   • the animal details moved OUT of Step 2 and now follow the clinical
//     questions here, still ONE card per screen;
//   • the sequence is built by buildStep1Screens(pets), the ONE canonical
//     source for position, total and progress — a screen that does not apply
//     (the 2+-animal comparison for a single animal) is not in the array, so
//     it can never be counted or reached;
//   • every animal keeps its own support selections and its own optional note.

import { useEffect, useRef, useState } from "react";
import type { Step1Data } from "../Step1Assessment";
import type { PetInfo } from "../Step2PersonalInfo";
import { QUESTION_MANIFEST, countAnsweredStep1 } from "./QuestionManifest";
import { QuestionView } from "./QuestionView";
import { PetCardScreen, PetCountScreen, PetDifferentiationScreen } from "./PetScreens";
import {
  buildStep1Screens,
  clampStep1Index,
  countAnsweredPetScreens,
  isStep1ScreenAnswered,
  resizePets,
} from "./PetSection";
import CrisisSupportPanel from "../../../../components/feature/CrisisSupportPanel";
import AssessmentTrustStrip from "../../../../components/feature/AssessmentTrustStrip";
import AssessmentTestimonial from "../../../../components/feature/AssessmentTestimonial";
import {
  clearStep1Draft,
  isStep1DataEmpty,
  readStep1Draft,
  useStep1AutosaveWriter,
} from "./useStep1Autosave";

interface QuestionRouterProps {
  data: Step1Data;
  onChange: (d: Step1Data) => void;
  /** The animal list. Owned by page.tsx (step2.pets) so the order payload,
   *  checkout pet count and every downstream consumer keep reading the SAME
   *  array they always did — only the screen it is collected on moved. */
  pets: PetInfo[];
  onPetsChange: (pets: PetInfo[]) => void;
  onNext: () => void;
  /**
   * ASSESSMENT-PROGRESS-CONSISTENCY-001 — the CANONICAL current screen index
   * (0-based). Owned by page.tsx so the page-level StepIndicator and this
   * router render the same number by construction; there is no second copy to
   * drift. The router never keeps its own index state.
   */
  currentIndex: number;
  onIndexChange: (index: number) => void;
}

// Reassurance points — deliberately sparse so the assessment stays focused.
// Indexes are 0-based positions in QUESTION_MANIFEST.
const TESTIMONIAL_AT: Record<number, number> = { 3: 0, 8: 1 };

export default function QuestionRouter({
  data,
  onChange,
  pets,
  onPetsChange,
  onNext,
  currentIndex: incomingIndex,
  onIndexChange,
}: QuestionRouterProps) {
  const [errorVisible, setErrorVisible] = useState(false);
  // Set only while a smaller animal count would DISCARD already-entered
  // answers. Nothing is removed until the customer confirms.
  const [pendingCount, setPendingCount] = useState<number | null>(null);
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
    // A draft written before the pet section moved here has no `pets` key —
    // it reads back undefined and the parent list is left exactly as it was.
    if (Array.isArray(draft.pets) && draft.pets.length > 0) onPetsChange(draft.pets);
    // ASSESSMENT-FLOW-POSITION-INTEGRITY-002 — a SAVED POSITION IS NOT A
    // CREDENTIAL. This used to clamp only to the array bounds, so a stale or
    // partial draft resumed at its raw index and every screen before it was
    // silently skipped: index 10 opened on clinical question 11 with nothing
    // answered, index 14 opened straight on Pet 1 details. Clamp to the first
    // UNANSWERED screen instead, so a restored position can never be further
    // along than the customer actually got.
    const restoredPets =
      Array.isArray(draft.pets) && draft.pets.length > 0 ? draft.pets : pets;
    const safeIndex = clampStep1Index(draft.currentIndex, draft.data, restoredPets);
    onIndexChange(safeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── The ONE canonical screen sequence ────────────────────────────────────
  const screens = buildStep1Screens(pets);
  const total = screens.length;
  // The clamped position IS the canonical position from here down, so every
  // display, bound and autosave write reads exactly one value.
  //
  // Clamped on EVERY render, not just on hydrate: a stale parent index, a
  // corrupt draft, a shrunk animal list or a future bug can then never present
  // a screen whose prerequisites are unmet. This is also what makes the pet
  // section structurally unreachable until every required clinical question is
  // answered — the pet-count screen sits after all 13 of them.
  const currentIndex = clampStep1Index(incomingIndex, data, pets);
  const screen = screens[currentIndex];

  // Push the corrected position back to the owner whenever it was pulled down
  // (a shortened sequence, or a position the answers do not justify), so the
  // page header and the autosaved draft agree with what is on screen.
  useEffect(() => {
    if (incomingIndex !== currentIndex) onIndexChange(currentIndex);
  }, [incomingIndex, currentIndex, onIndexChange]);

  // ── Persist on changes ───────────────────────────────────────────────────
  // Writes the answers, the animals AND the current position, so Back, a
  // refresh and a resume all return to the same screen with the same answers.
  useStep1AutosaveWriter(data, currentIndex, pets, /* enabled */ true);

  // ── Smooth-scroll the active card into view on index change ──────────────
  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentIndex]);

  const def = screen.kind === "question" ? QUESTION_MANIFEST[screen.questionIndex] : null;
  const isLast = currentIndex === total - 1;
  const isFirst = currentIndex === 0;
  // ASSESSMENT-PROGRESS-CONSISTENCY-001: one shared answered-count source, now
  // covering the pet screens too — and only the screens that actually apply.
  const answeredCount = countAnsweredStep1(data) + countAnsweredPetScreens(data, pets);
  const progressPct = Math.round(((currentIndex + 1) / total) * 100);

  // Safety hard-stop: while the safety screen is answered "yes" the flow is
  // blocked — the crisis panel renders and the Continue button is withheld.
  // The user can change the answer to "no" to resume.
  const safetyBlocked = def?.id === "safetyCheck" && data.safetyCheck === "yes";

  const clearError = () => { if (errorVisible) setErrorVisible(false); };

  const update = (patch: Partial<Step1Data>) => {
    onChange({ ...data, ...patch });
    // Clear the error as soon as the user starts answering. Selecting an answer
    // deliberately does NOT navigate — see the header note on auto-advance.
    if (errorVisible) setErrorVisible(false);
  };

  /** Patch ONE animal by index. Every other animal is returned by reference,
   *  so Pet 1's answers can never be written onto Pet 2. */
  const updatePet = (petIndex: number, patch: Partial<PetInfo>) => {
    onPetsChange(pets.map((p, i) => (i === petIndex ? { ...p, ...patch } : p)));
    clearError();
  };

  const changePetCount = (next: number) => {
    onPetsChange(resizePets(pets, next));
    clearError();
  };

  const showError = () => {
    setErrorVisible(true);
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleContinue = () => {
    if (screen.kind === "question" && def) {
      if (!def.check(data)) {
        showError();
        return;
      }
    } else if (screen.kind === "petCount") {
      // A pending removal must be resolved (kept or confirmed) before moving on.
      if (pendingCount !== null) {
        showError();
        return;
      }
      if (data.petCountConfirmed !== true) onChange({ ...data, petCountConfirmed: true });
    } else if (!isStep1ScreenAnswered(screen, data, pets)) {
      showError();
      return;
    }
    setErrorVisible(false);
    if (isLast) {
      // Defensive sweep — should never fire, but guards against a desynced
      // index. If any earlier screen is unanswered, jump there.
      const firstMissing = screens.findIndex((s) => !isStep1ScreenAnswered(s, data, pets));
      if (firstMissing !== -1 && firstMissing !== currentIndex) {
        onIndexChange(firstMissing);
        setErrorVisible(true);
        return;
      }
      clearStep1Draft();
      onNext();
      return;
    }
    onIndexChange(currentIndex + 1);
  };

  const handleBack = () => {
    if (isFirst) return;
    setErrorVisible(false);
    setPendingCount(null);
    onIndexChange(currentIndex - 1);
  };

  const testimonialIndex =
    screen.kind === "question" ? TESTIMONIAL_AT[screen.questionIndex] : undefined;

  return (
    <div>
      {/* ASSESSMENT-PRESENTATION-TRUST-002 (owner, 2026-08-21): the step
          heading, its explanatory paragraph and the blue landlord-verification
          strip were REMOVED from the question flow so the first question sits
          higher and the screen stays focused on one question at a time.

          The page-level header, the green LiveStatusBanner and the trust strip
          below the card are rendered elsewhere and are deliberately untouched.
          The landlord-verification message still lives on the checkout,
          verification and educational pages — it was dropped only from here.

          Progress is now the first element in the flow, so no empty space is
          left behind. The guard asserts the removed copy cannot come back. */}

      {/* Progress */}
      <div className="mb-5 max-w-xl mx-auto">
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">
            Question {currentIndex + 1} of {total}
          </p>
          <p className="text-[12px] font-semibold text-slate-400">
            {answeredCount} answered
          </p>
        </div>
        <div
          className="h-2 w-full rounded-full bg-slate-100 overflow-hidden"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={currentIndex + 1}
          aria-label={`Assessment progress: question ${currentIndex + 1} of ${total}`}
        >
          <div
            className="h-full rounded-full bg-[#F97316] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Active screen — exactly one card is ever mounted. */}
      <div ref={cardRef}>
        {screen.kind === "question" && def && (
          <QuestionView def={def} data={data} onUpdate={update} hasError={errorVisible && !safetyBlocked} />
        )}
        {screen.kind === "petCount" && (
          <PetCountScreen
            pets={pets}
            onCountChange={changePetCount}
            pendingCount={pendingCount}
            onPendingCountChange={setPendingCount}
            hasError={errorVisible}
          />
        )}
        {screen.kind === "petCard" && (
          <PetCardScreen
            pet={pets[screen.petIndex]}
            petIndex={screen.petIndex}
            petTotal={pets.length}
            onPetChange={(patch) => updatePet(screen.petIndex, patch)}
            hasError={errorVisible}
          />
        )}
        {screen.kind === "petDifferentiation" && (
          <PetDifferentiationScreen
            value={data.petsDifferentiation ?? ""}
            note={data.petsDifferentiationNote ?? ""}
            onChange={update}
            hasError={errorVisible}
          />
        )}
      </div>

      {/* Crisis support — replaces the Continue button while the safety
          answer is "yes". No payment CTA, no sales copy, resources only. */}
      {safetyBlocked && <CrisisSupportPanel />}

      {/* Optional trained-task free-text note — shown on the housing question
          (the last clinical question; the final manifest question is now the
          safety screen, which must stay free of extra fields). Not required,
          not part of the progress count, no upsell. */}
      {def?.id === "housingType" && (
        <div className="mt-5 bg-white rounded-xl border border-slate-200 p-5 sm:p-6">
          <label htmlFor="trainedTaskDescription" className="block text-sm font-bold text-slate-900 mb-1.5">
            Does your pet perform any specific trained task?
            <span className="text-slate-400 font-normal lowercase text-[11px] ml-1">(optional)</span>
          </label>
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            If yes, briefly describe what your pet is trained to do. If not, you can write
            &ldquo;No&rdquo; or leave this blank. This helps the licensed provider understand your
            documentation path. PawTenant does not train, register, or certify service animals.
          </p>
          <textarea
            id="trainedTaskDescription"
            value={data.trainedTaskDescription ?? ""}
            onChange={(e) => update({ trainedTaskDescription: e.target.value })}
            placeholder="Example: My pet alerts me before panic episodes / No specific trained task"
            rows={3}
            maxLength={500}
            className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F97316] transition-colors resize-none"
          />
        </div>
      )}

      {/* Navigation */}
      <div className="mt-6 sm:mt-8 flex flex-col-reverse sm:flex-row sm:justify-between gap-3">
        <button
          type="button"
          onClick={handleBack}
          disabled={isFirst}
          className={`whitespace-nowrap w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border text-sm font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 ${
            isFirst
              ? "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
          }`}
          aria-label="Back to previous question"
        >
          <i className="ri-arrow-left-line" aria-hidden="true"></i>
          Back
        </button>
        {!safetyBlocked && (
          <button
            type="button"
            onClick={handleContinue}
            className="whitespace-nowrap w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 sm:px-10 py-4 sm:py-3.5 bg-[#F97316] text-white font-bold text-base sm:text-sm rounded-xl sm:rounded-lg hover:bg-[#EA580C] active:bg-[#C2410C] transition-colors cursor-pointer shadow-[0_8px_22px_-10px_rgba(249,115,22,0.5)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2"
            aria-label={isLast ? "Continue to your information" : `Continue to question ${currentIndex + 2} of ${total}`}
          >
            {isLast ? "Continue to Your Information" : "Continue"}
            <i className="ri-arrow-right-line" aria-hidden="true"></i>
          </button>
        )}
      </div>

      {/* Trust strip — consistent, quiet, and always below the question so it
          never competes with it. */}
      <AssessmentTrustStrip className="mt-6" />

      {/* Reassurance testimonial — only at the configured points. */}
      {testimonialIndex !== undefined && (
        <AssessmentTestimonial index={testimonialIndex} className="mt-4" />
      )}
    </div>
  );
}
