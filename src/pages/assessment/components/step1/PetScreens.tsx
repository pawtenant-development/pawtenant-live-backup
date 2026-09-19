// Step 1 — pet-section screens (one card per screen).
//
// ASSESSMENT-PET-SUPPORT-AND-STEP-STRUCTURE-001.
//
// Three screens, rendered ONE AT A TIME by QuestionRouter:
//   PetCountScreen          — how many pets (1-3, the paid-package range)
//   PetCardScreen           — one pet: details + how it helps + optional note
//   PetDifferentiationScreen— 2+ pets only: do they support you differently
//
// ASSESSMENT-PET-WORDING-003 (owner, 2026-08-26): the customer-facing word is
// "pet", never "animal". A SINGLE pet is "your pet" and is never numbered;
// TWO or THREE pets are "Pet 1", "Pet 2", "Pet 3". A pet the customer has
// named is always referred to by that name. Only the copy changed — the
// stored fields, the ids, the flow and the validation are untouched.
//
// Presentation only. Every visual comes from the shared step-1 primitives, so
// the pet screens look exactly like the clinical questions (same shaded
// unselected option, same strong selected state, same large touch targets).
//
// Honesty rules baked in here:
//   * every free-text box is OPTIONAL and says so;
//   * the reassurance callout says examples MAY REDUCE FOLLOW-UP QUESTIONS and
//     that approval is never guaranteed — it never claims answering more earns
//     an approval, and it makes no housing/landlord promise;
//   * the support selections are labelled as the customer's own description,
//     not as a finding.

import { CheckboxGroup, QuestionCard, RadioGroup } from "./primitives";
import type { PetInfo } from "../Step2PersonalInfo";
import {
  MAX_PETS,
  MIN_PETS,
  PET_DIFFERENTIATION_NOTE_MAX,
  PET_DIFFERENTIATION_OPTIONS,
  PET_NARRATIVE_MAX,
  PET_SUPPORT_OPTIONS,
  PET_TYPE_OPTIONS,
  petsLostByResize,
} from "./PetSection";

const inputClass =
  "w-full px-4 py-3 rounded-lg border-2 border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F97316] transition-colors";
const inputErrorClass =
  "w-full px-4 py-3 rounded-lg border-2 border-red-300 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-red-400 transition-colors";

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={htmlFor} className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wide">
        {label}
        {required ? (
          <span className="text-[#F97316] ml-0.5">*</span>
        ) : (
          <span className="text-slate-400 font-normal ml-1 lowercase">(optional)</span>
        )}
      </label>
      {children}
      {error && (
        <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
          <i className="ri-error-warning-line" aria-hidden="true"></i>
          This field is required
        </p>
      )}
    </div>
  );
}

/**
 * ASSESSMENT-PET-WORDING-003 — how a pet is referred to on screen.
 *
 * A typed name always wins. Otherwise a lone pet is "your pet" (never "Pet 1",
 * never "Animal 1") and a pet in a multi-pet request is "Pet N".
 */
function petLabel(name: string | undefined, index: number, total: number): string {
  const typed = name?.trim();
  if (typed) return typed;
  return total > 1 ? `Pet ${index + 1}` : "your pet";
}

/** Same label, capitalised for the START of a sentence ("Your pet is..."). */
function petLabelSentenceStart(name: string | undefined, index: number, total: number): string {
  const typed = name?.trim();
  if (typed) return typed;
  return total > 1 ? `Pet ${index + 1}` : "Your pet";
}

/** Quiet, truthful callout. Never promises an outcome. */
function ClarityCallout() {
  return (
    <div className="mt-4 rounded-lg bg-[#E8F1EE] border border-[#CFE2DC] px-3.5 py-3 flex items-start gap-2">
      <i className="ri-lightbulb-line text-[#1A5C4F] text-sm flex-shrink-0 mt-[1px]" aria-hidden="true"></i>
      <p className="text-[12px] leading-relaxed text-[#1A5C4F]">
        <span className="font-bold">Help make your case clearer.</span> Specific examples can help your
        provider understand your needs and may reduce follow-up questions. Approval is never guaranteed.
      </p>
    </div>
  );
}

// ── Screen 1 · How many pets ───────────────────────────────────────────────

interface PetCountScreenProps {
  pets: PetInfo[];
  onCountChange: (next: number) => void;
  /** Set while a shrink would discard already-entered answers. */
  pendingCount: number | null;
  onPendingCountChange: (next: number | null) => void;
  hasError: boolean;
}

export function PetCountScreen({
  pets,
  onCountChange,
  pendingCount,
  onPendingCountChange,
  hasError,
}: PetCountScreenProps) {
  const current = pets.length;
  const options = [];
  for (let n = MIN_PETS; n <= MAX_PETS; n += 1) {
    options.push({
      label: n === 1 ? "1 pet" : `${n} pets`,
      value: String(n),
    });
  }

  const select = (raw: string) => {
    const next = Number(raw);
    if (next === current) {
      onPendingCountChange(null);
      return;
    }
    const lost = petsLostByResize(pets, next);
    if (lost.length > 0) {
      // Never discard typed answers silently — confirm first.
      onPendingCountChange(next);
      return;
    }
    onPendingCountChange(null);
    onCountChange(next);
  };

  const lostForPending = pendingCount === null ? [] : petsLostByResize(pets, pendingCount);

  return (
    <div>
      <QuestionCard
        number={0}
        question="How many pets are you requesting ESA documentation for?"
        required
        hasError={hasError}
        variant="focus"
        context="Your package covers up to three pets. Every pet you list is reviewed individually by the licensed provider."
        renderWithLabelId={(labelId) => (
          <>
            <RadioGroup
              name="petCount"
              value={String(pendingCount ?? current)}
              options={options}
              size="large"
              labelledBy={labelId}
              onChange={select}
            />
            {pendingCount !== null && lostForPending.length > 0 && (
              <div
                className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3.5"
                role="alert"
              >
                <p className="text-[13px] font-bold text-amber-900 flex items-start gap-2">
                  <i className="ri-alert-line flex-shrink-0 mt-[1px]" aria-hidden="true"></i>
                  <span>
                    This removes the information you already entered for{" "}
                    {lostForPending.map((i) => `Pet ${i + 1}`).join(" and ")}.
                  </span>
                </p>
                <div className="mt-3 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => onPendingCountChange(null)}
                    className="whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border-2 border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Keep my information
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = pendingCount;
                      onPendingCountChange(null);
                      if (next !== null) onCountChange(next);
                    }}
                    className="whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors cursor-pointer"
                  >
                    Yes, remove {lostForPending.length > 1 ? "them" : `Pet ${lostForPending[0] + 1}`}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      />
    </div>
  );
}

// ── Screen 2 · One pet ─────────────────────────────────────────────────────

interface PetCardScreenProps {
  /** Undefined only in an impossible desynced state — the card degrades to an
   *  empty form instead of throwing. */
  pet: PetInfo | undefined;
  petIndex: number;
  petTotal: number;
  onPetChange: (patch: Partial<PetInfo>) => void;
  hasError: boolean;
  /** PSD locks the pet type to Dog; ESA lets the customer choose. */
  lockedType?: string;
}

export function PetCardScreen({
  pet,
  petIndex,
  petTotal,
  onPetChange,
  hasError,
  lockedType,
}: PetCardScreenProps) {
  const idBase = `pet-${petIndex}`;
  const displayName = petLabel(pet?.name, petIndex, petTotal);
  const displayNameLead = petLabelSentenceStart(pet?.name, petIndex, petTotal);
  const support = pet?.supportFunctions ?? [];
  const narrative = pet?.supportNarrative ?? "";
  const missing = (v: string | undefined) => hasError && !v?.trim();

  return (
    <div className="space-y-4">
      <QuestionCard
        number={0}
        question={petTotal > 1 ? `Tell us about Pet ${petIndex + 1}` : "Tell us about your pet"}
        required
        hasError={hasError}
        variant="focus"
        hint={
          petTotal > 1
            ? "Each pet is described separately so your provider can review them individually."
            : undefined
        }
        renderWithLabelId={() => (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* The heading already establishes which pet this card is for, so the
                field labels stay plain — never "Pet 1 name". */}
            <Field label="Pet name" htmlFor={`${idBase}-name`} required error={missing(pet?.name)}>
              <input
                id={`${idBase}-name`}
                type="text"
                value={pet?.name ?? ""}
                onChange={(e) => onPetChange({ name: e.target.value.slice(0, 60) })}
                placeholder="Buddy"
                className={missing(pet?.name) ? inputErrorClass : inputClass}
              />
            </Field>

            {lockedType ? (
              <Field label="Pet type" htmlFor={`${idBase}-type`}>
                <div
                  id={`${idBase}-type`}
                  className={`${inputClass} bg-slate-50 text-slate-500 flex items-center gap-2`}
                >
                  <i className="ri-service-line text-amber-600" aria-hidden="true"></i>
                  <span className="font-semibold">{lockedType}</span>
                </div>
              </Field>
            ) : (
              <Field label="Pet type" htmlFor={`${idBase}-type`} required error={missing(pet?.type)}>
                <select
                  id={`${idBase}-type`}
                  value={pet?.type ?? ""}
                  onChange={(e) => onPetChange({ type: e.target.value })}
                  className={missing(pet?.type) ? inputErrorClass : inputClass}
                >
                  <option value="">Select type</option>
                  {PET_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <Field label="Breed" htmlFor={`${idBase}-breed`} required error={missing(pet?.breed)}>
              <input
                id={`${idBase}-breed`}
                type="text"
                value={pet?.breed ?? ""}
                onChange={(e) => onPetChange({ breed: e.target.value.slice(0, 60) })}
                placeholder="Golden Retriever"
                className={missing(pet?.breed) ? inputErrorClass : inputClass}
              />
            </Field>

            <Field label="Age (years)" htmlFor={`${idBase}-age`} required error={missing(pet?.age)}>
              <input
                id={`${idBase}-age`}
                type="number"
                inputMode="numeric"
                min={0}
                max={30}
                value={pet?.age ?? ""}
                onChange={(e) => onPetChange({ age: e.target.value.replace(/\D/g, "").slice(0, 2) })}
                onKeyDown={(e) => {
                  if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
                }}
                placeholder="e.g. 3"
                className={missing(pet?.age) ? inputErrorClass : inputClass}
              />
            </Field>

            <Field label="Weight (lbs)" htmlFor={`${idBase}-weight`}>
              <input
                id={`${idBase}-weight`}
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={pet?.weight ?? ""}
                onChange={(e) => onPetChange({ weight: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                onKeyDown={(e) => {
                  if (["e", "E", "+", "-", "."].includes(e.key)) e.preventDefault();
                }}
                placeholder="e.g. 55"
                className={inputClass}
              />
            </Field>

            <div className="sm:col-span-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={pet?.vaccinated === true}
                onClick={() => onPetChange({ vaccinated: !pet?.vaccinated })}
                className={`w-full text-left px-4 py-3.5 min-h-[56px] rounded-xl border-2 text-[14px] font-semibold transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F97316] focus-visible:ring-offset-2 ${
                  pet?.vaccinated
                    ? "border-[#F97316] bg-[#FFEDD5] text-[#9A3412] shadow-[0_2px_10px_-4px_rgba(249,115,22,0.45)]"
                    : "border-slate-200 bg-[#F8FAFC] text-slate-700 hover:border-[#F97316]/60 hover:bg-[#FFF7ED]"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className={`w-5 h-5 flex-shrink-0 rounded flex items-center justify-center border-2 ${
                      pet?.vaccinated ? "border-[#F97316] bg-[#F97316]" : "border-slate-300"
                    }`}
                    aria-hidden="true"
                  >
                    {pet?.vaccinated && <i className="ri-check-line text-white text-xs leading-none"></i>}
                  </span>
                  <span className="break-words min-w-0">
                    {displayNameLead} is up to date on vaccinations
                    <span className="block text-[11px] font-normal text-slate-500 mt-0.5">
                      Optional. Housing providers may ask for licensing and vaccination proof.
                    </span>
                  </span>
                </span>
              </button>
            </div>
          </div>
        )}
      />

      {/* How this pet helps — customer-reported, multi-select. */}
      <QuestionCard
        number={0}
        question={`How does ${displayName} help when your symptoms are difficult?`}
        required
        hasError={hasError && support.length === 0}
        variant="focus"
        hint="Select everything that applies."
        context="This is your own description, shared with the licensed provider reviewing your evaluation. It is not a diagnosis and it does not decide the outcome."
        renderWithLabelId={(labelId) => (
          <CheckboxGroup
            values={support}
            options={PET_SUPPORT_OPTIONS}
            size="large"
            labelledBy={labelId}
            onChange={(vals) => onPetChange({ supportFunctions: vals })}
          />
        )}
      />

      {/* Optional per-pet narrative. NEVER required, never blocks Continue. */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8">
        <div className="max-w-xl mx-auto">
          <label htmlFor={`${idBase}-narrative`} className="block text-sm font-bold text-slate-900 mb-1.5">
            Optional: Tell your provider what {displayName} does that helps you.
            <span className="text-slate-400 font-normal lowercase text-[11px] ml-1">(optional)</span>
          </label>
          <textarea
            id={`${idBase}-narrative`}
            value={narrative}
            onChange={(e) => onPetChange({ supportNarrative: e.target.value.slice(0, PET_NARRATIVE_MAX) })}
            placeholder={`Example: When I start to panic, ${displayName} climbs into my lap until my breathing slows.`}
            rows={4}
            maxLength={PET_NARRATIVE_MAX}
            className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F97316] transition-colors resize-none"
          />
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span className="text-xs text-slate-400">You can leave this blank and continue.</span>
            <span className="text-xs font-semibold text-slate-400 flex-shrink-0" aria-live="polite">
              {narrative.length} / {PET_NARRATIVE_MAX}
            </span>
          </div>
          <ClarityCallout />
        </div>
      </div>
    </div>
  );
}

// ── Screen 3 · Two or more pets only ───────────────────────────────────────

interface PetDifferentiationScreenProps {
  value: string;
  note: string;
  onChange: (patch: { petsDifferentiation?: string; petsDifferentiationNote?: string }) => void;
  hasError: boolean;
}

export function PetDifferentiationScreen({
  value,
  note,
  onChange,
  hasError,
}: PetDifferentiationScreenProps) {
  return (
    <div className="space-y-4">
      <QuestionCard
        number={0}
        question="Do your pets support you in different ways?"
        required
        hasError={hasError}
        variant="focus"
        context="Providers are often asked why more than one pet is needed. Answering here usually saves a follow-up message later."
        renderWithLabelId={(labelId) => (
          <RadioGroup
            name="petsDifferentiation"
            value={value}
            options={PET_DIFFERENTIATION_OPTIONS}
            size="large"
            labelledBy={labelId}
            onChange={(v) => onChange({ petsDifferentiation: v })}
          />
        )}
      />

      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-8">
        <div className="max-w-xl mx-auto">
          <label htmlFor="pets-differentiation-note" className="block text-sm font-bold text-slate-900 mb-1.5">
            Optional: Explain what support you would lose if you could keep only one of them.
            <span className="text-slate-400 font-normal lowercase text-[11px] ml-1">(optional)</span>
          </label>
          <textarea
            id="pets-differentiation-note"
            value={note}
            onChange={(e) =>
              onChange({ petsDifferentiationNote: e.target.value.slice(0, PET_DIFFERENTIATION_NOTE_MAX) })
            }
            placeholder="Example: One settles me at night; the other is the reason I leave the house during the day."
            rows={4}
            maxLength={PET_DIFFERENTIATION_NOTE_MAX}
            className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#F97316] transition-colors resize-none"
          />
          <div className="flex items-center justify-between mt-1.5 gap-2">
            <span className="text-xs text-slate-400">You can leave this blank and continue.</span>
            <span className="text-xs font-semibold text-slate-400 flex-shrink-0" aria-live="polite">
              {note.length} / {PET_DIFFERENTIATION_NOTE_MAX}
            </span>
          </div>
          <ClarityCallout />
        </div>
      </div>
    </div>
  );
}
