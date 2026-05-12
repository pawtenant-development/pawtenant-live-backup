import { useState } from "react";
import { CheckboxGroup, QuestionCard, RadioGroup } from "./step1/primitives";
import QuestionRouter from "./step1/QuestionRouter";

export interface Step1Data {
  // New form fields
  emotionalFrequency: string;
  conditions: string[];
  lifeChangeStress: string;
  challengeDuration: string;
  dailyImpact: string;
  sleepQuality: string;
  socialFunctioning: string;
  medication: string;
  medicationDetails: string;        // NEW — optional text: list medication(s)
  priorDiagnosis: string;
  specificDiagnosis: string;
  currentTreatment: string;
  treatmentDetails: string;         // NEW — optional text: describe treatment
  symptomDescription: string;
  housingType: string;
  // Legacy fields kept for backward compat with old orders (no longer collected)
  hasESA?: string;
  petSupport?: string[];
  petType?: string;
}

interface Step1AssessmentProps {
  data: Step1Data;
  onChange: (data: Step1Data) => void;
  onNext: () => void;
  /**
   * When true (via `?step1=v2` URL flag on /assessment), render the
   * one-question-at-a-time v2 flow instead of the legacy long-form layout.
   * Defaults to false. The legacy path remains the fallback and is fully
   * preserved below — flipping the flag is the kill-switch.
   */
  useStep1V2?: boolean;
}

const CONDITIONS = [
  "Anxiety or constant worry",
  "Depression or persistent low mood",
  "PTSD or trauma-related stress",
  "Panic attacks",
  "Difficulty sleeping or insomnia",
  "Social isolation or loneliness",
  "ADHD or difficulty focusing",
  "Phobias or specific fears",
  "Bipolar disorder",
  "Grief or loss",
  "Obsessive-compulsive behaviors",
  "Adjustment disorder or situational stress",
  "Emotional dysregulation",
];

const FREQUENCY_OPTIONS = [
  { label: "Rarely — a few times a month", value: "rarely" },
  { label: "Sometimes — a few times a week", value: "sometimes" },
  { label: "Often — most days", value: "often" },
  { label: "Almost always — daily or near-daily", value: "daily" },
];

// ── Shared UI Components ──────────────────────────────────────────────────────
// RadioGroup / CheckboxGroup / QuestionCard live in `./step1/primitives` so
// both the legacy long-form path (below) and the new one-question-at-a-time
// v2 router can import the exact same visuals.

// ── Main Component ────────────────────────────────────────────────────────────

export default function Step1Assessment({ data, onChange, onNext, useStep1V2 = false }: Step1AssessmentProps) {
  // Hooks must run on every render regardless of branch (Rules of Hooks).
  // The v2 short-circuit below ignores this state and renders QuestionRouter.
  const [errors, setErrors] = useState<string[]>([]);

  // v2 path — gated by the `?step1=v2` URL flag passed in from page.tsx.
  // Renders the one-question-at-a-time flow. The legacy long-form render
  // below is preserved verbatim as the fallback and is the kill-switch.
  if (useStep1V2) {
    return <QuestionRouter data={data} onChange={onChange} onNext={onNext} />;
  }

  const update = (field: keyof Step1Data, val: string | string[]) => {
    onChange({ ...data, [field]: val });
  };

  const updateMulti = (fields: Partial<Step1Data>) => {
    onChange({ ...data, ...fields });
  };

  const REQUIRED_FIELDS: Array<{ key: keyof Step1Data; check: () => boolean }> = [
    { key: "emotionalFrequency", check: () => !!data.emotionalFrequency },
    { key: "conditions", check: () => data.conditions.length > 0 },
    { key: "lifeChangeStress", check: () => !!data.lifeChangeStress },
    { key: "challengeDuration", check: () => !!data.challengeDuration },
    { key: "dailyImpact", check: () => !!data.dailyImpact },
    { key: "sleepQuality", check: () => !!data.sleepQuality },
    { key: "socialFunctioning", check: () => !!data.socialFunctioning },
    { key: "medication", check: () => !!data.medication },
    { key: "priorDiagnosis", check: () => !!data.priorDiagnosis },
    { key: "currentTreatment", check: () => !!data.currentTreatment },
    { key: "symptomDescription", check: () => data.symptomDescription.trim().length >= 10 },
    { key: "housingType", check: () => !!data.housingType },
  ];

  const answeredCount = REQUIRED_FIELDS.filter((f) => f.check()).length;
  const totalRequired = REQUIRED_FIELDS.length;
  const pct = Math.round((answeredCount / totalRequired) * 100);

  const validate = () => {
    const missing = REQUIRED_FIELDS.filter((f) => !f.check()).map((f) => f.key as string);
    setErrors(missing);
    return missing.length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const hasErr = (field: string) => errors.includes(field);

  const showDiagnosisText = data.priorDiagnosis === "yes" || data.priorDiagnosis === "informal";

  return (
    <div>
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-extrabold text-gray-900">Mental Health Assessment</h2>
        <p className="text-gray-500 text-sm mt-2 max-w-lg mx-auto">
          This confidential screening helps a licensed mental health professional evaluate your eligibility for an ESA letter. All answers are protected under HIPAA.
        </p>
      </div>

      {/* Landlord Verification Badge */}
      <div className="mb-5 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-[#2c5282] rounded-lg flex-shrink-0">
          <i className="ri-shield-check-fill text-white text-sm"></i>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold text-[#2c5282]">Landlord-Verifiable Letter Included</p>
          <p className="text-xs text-[#2c5282]/70 mt-0.5">Every PawTenant letter includes a unique QR Verification ID — landlords can confirm authenticity instantly, no health info disclosed.</p>
        </div>
        <a href="/esa-letter-verification" target="_blank" rel="noopener noreferrer"
          className="whitespace-nowrap text-xs font-bold text-[#2c5282] hover:underline cursor-pointer flex-shrink-0 flex items-center gap-1">
          <i className="ri-external-link-line text-xs"></i>Learn more
        </a>
      </div>

      {errors.length > 0 && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg px-5 py-4 text-sm text-red-700 flex items-center gap-2">
          <i className="ri-error-warning-line text-base"></i>
          Please answer all required questions before continuing.
        </div>
      )}

      <div className="space-y-5">

        {/* Q1 — Emotional frequency */}
        <QuestionCard
          number={1}
          question="How often do you experience emotional distress, anxiety, or depression?"
          required
          hasError={hasErr("emotionalFrequency")}
        >
          <RadioGroup
            name="emotionalFrequency"
            value={data.emotionalFrequency}
            onChange={(v) => update("emotionalFrequency", v)}
            options={FREQUENCY_OPTIONS}
          />
        </QuestionCard>

        {/* Q2 — Conditions checklist */}
        <QuestionCard
          number={2}
          question="Which of the following do you currently experience? (Select all that apply)"
          required
          hasError={hasErr("conditions")}
        >
          <CheckboxGroup
            values={data.conditions}
            options={CONDITIONS}
            onChange={(v) => update("conditions", v)}
          />
        </QuestionCard>

        {/* Q3 — Life change / Adjustment Disorder screen */}
        <QuestionCard
          number={3}
          question="Have you experienced a major life change or transition that is impacting your mental health or causing stress?"
          hint="e.g., moving, divorce, job loss, illness, grief, relationship changes"
          required
          hasError={hasErr("lifeChangeStress")}
        >
          <RadioGroup
            name="lifeChangeStress"
            value={data.lifeChangeStress}
            onChange={(v) => update("lifeChangeStress", v)}
            options={[
              { label: "Yes — currently going through a major life change", value: "yes_current" },
              { label: "Yes — recently went through one and still adjusting", value: "yes_recent" },
              { label: "Not significantly — my situation feels generally stable", value: "no" },
            ]}
          />
        </QuestionCard>

        {/* Q4 — Duration */}
        <QuestionCard
          number={4}
          question="How long have you been experiencing these challenges?"
          required
          hasError={hasErr("challengeDuration")}
        >
          <RadioGroup
            name="challengeDuration"
            value={data.challengeDuration}
            onChange={(v) => update("challengeDuration", v)}
            options={[
              { label: "Less than 3 months", value: "lt3months" },
              { label: "3–6 months", value: "3to6months" },
              { label: "6–12 months", value: "6to12months" },
              { label: "1–2 years", value: "1to2years" },
              { label: "More than 2 years", value: "gt2years" },
            ]}
          />
        </QuestionCard>

        {/* Q5 — Daily impact (consistent scale) */}
        <QuestionCard
          number={5}
          question="How often do your symptoms interfere with your daily life, work, or responsibilities?"
          required
          hasError={hasErr("dailyImpact")}
        >
          <RadioGroup
            name="dailyImpact"
            value={data.dailyImpact}
            onChange={(v) => update("dailyImpact", v)}
            options={FREQUENCY_OPTIONS}
          />
        </QuestionCard>

        {/* Q6 — Sleep (consistent scale) */}
        <QuestionCard
          number={6}
          question="How often do you experience difficulty sleeping or disrupted sleep?"
          required
          hasError={hasErr("sleepQuality")}
        >
          <RadioGroup
            name="sleepQuality"
            value={data.sleepQuality}
            onChange={(v) => update("sleepQuality", v)}
            options={FREQUENCY_OPTIONS}
          />
        </QuestionCard>

        {/* Q7 — Social functioning (consistent scale) */}
        <QuestionCard
          number={7}
          question="How often does your mental health cause you to withdraw from social activities or relationships?"
          required
          hasError={hasErr("socialFunctioning")}
        >
          <RadioGroup
            name="socialFunctioning"
            value={data.socialFunctioning}
            onChange={(v) => update("socialFunctioning", v)}
            options={FREQUENCY_OPTIONS}
          />
        </QuestionCard>

        {/* Q8 — Medication */}
        <QuestionCard
          number={8}
          question="Are you currently taking any prescribed medication for a mental health condition?"
          required
          hasError={hasErr("medication")}
        >
          <RadioGroup
            name="medication"
            value={data.medication}
            onChange={(v) => updateMulti({ medication: v, ...(v === "never" ? { medicationDetails: "" } : {}) })}
            options={[
              { label: "Yes, currently prescribed and taking", value: "yes_taking" },
              { label: "Yes, prescribed but not currently taking", value: "yes_not_taking" },
              { label: "Previously prescribed, no longer taking", value: "previous" },
              { label: "No, never prescribed", value: "never" },
            ]}
          />
          {data.medication && data.medication !== "never" && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                If comfortable, please list the medication(s) <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={data.medicationDetails}
                onChange={(e) => update("medicationDetails", e.target.value)}
                placeholder="e.g., Sertraline (Zoloft), Escitalopram (Lexapro), Buspirone..."
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#F97316] transition-colors"
              />
            </div>
          )}
        </QuestionCard>

        {/* Q9 — Prior diagnosis (+ conditional specific diagnosis text) */}
        <QuestionCard
          number={9}
          question="Have you previously received a mental health diagnosis from a licensed professional?"
          required
          hasError={hasErr("priorDiagnosis")}
        >
          <RadioGroup
            name="priorDiagnosis"
            value={data.priorDiagnosis}
            onChange={(v) => updateMulti({ priorDiagnosis: v, ...(v === "no" || v === "prefer_not" ? { specificDiagnosis: "" } : {}) })}
            options={[
              { label: "Yes, I have a formal diagnosis", value: "yes" },
              { label: "I have been told I may have a condition, but not formally diagnosed", value: "informal" },
              { label: "No, I have never been evaluated", value: "no" },
              { label: "I prefer not to say", value: "prefer_not" },
            ]}
          />
          {showDiagnosisText && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                If comfortable, please share your specific diagnosis <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={data.specificDiagnosis}
                onChange={(e) => update("specificDiagnosis", e.target.value)}
                placeholder="e.g., Generalized Anxiety Disorder, Major Depressive Disorder, Adjustment Disorder..."
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#F97316] transition-colors"
              />
            </div>
          )}
        </QuestionCard>

        {/* Q10 — Current treatment */}
        <QuestionCard
          number={10}
          question="Are you currently receiving mental health treatment or therapy?"
          required
          hasError={hasErr("currentTreatment")}
        >
          <RadioGroup
            name="currentTreatment"
            value={data.currentTreatment}
            onChange={(v) => updateMulti({ currentTreatment: v, ...(v === "none" || v === "considering" ? { treatmentDetails: "" } : {}) })}
            options={[
              { label: "Yes, I am actively in treatment", value: "active" },
              { label: "Previously received treatment", value: "previous" },
              { label: "No, but I am considering it", value: "considering" },
              { label: "No treatment at this time", value: "none" },
            ]}
          />
          {(data.currentTreatment === "active" || data.currentTreatment === "previous") && (
            <div className="mt-4">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Please describe your current or past treatment <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={data.treatmentDetails}
                onChange={(e) => update("treatmentDetails", e.target.value)}
                placeholder="e.g., Weekly individual therapy with a CBT therapist, Group therapy for anxiety..."
                className="w-full px-4 py-3 rounded-lg border-2 border-gray-200 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-[#F97316] transition-colors"
              />
            </div>
          )}
        </QuestionCard>

        {/* Q11 — Open-ended symptom description */}
        <QuestionCard
          number={11}
          question="In your own words, please describe your symptoms and what you are going through."
          hint="This helps your provider better understand your experience and how your ESA supports your well-being. Please share as much as you feel comfortable with."
          required
          hasError={hasErr("symptomDescription")}
        >
          <textarea
            value={data.symptomDescription}
            onChange={(e) => update("symptomDescription", e.target.value)}
            placeholder="For example: I have been dealing with persistent anxiety for the past year. I find it hard to sleep and often feel overwhelmed in social situations. My dog helps me stay calm and feel grounded..."
            rows={5}
            maxLength={1000}
            className={`w-full px-4 py-3 rounded-lg border-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none transition-colors resize-none ${
              hasErr("symptomDescription") ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#F97316]"
            }`}
          />
          <div className="flex items-center justify-between mt-1.5 gap-2">
            {data.symptomDescription.trim().length > 0 && data.symptomDescription.trim().length < 10 ? (
              <span className="text-xs text-red-500">Please write at least a few words to describe your experience.</span>
            ) : (
              <span className="text-xs text-gray-400">Your response is confidential and only visible to your assigned provider.</span>
            )}
            <span
              className={`text-xs font-semibold ml-2 flex-shrink-0 ${
                data.symptomDescription.length === 0
                  ? "text-gray-400"
                  : data.symptomDescription.trim().length < 10
                    ? "text-red-500"
                    : data.symptomDescription.length >= 950
                      ? "text-amber-600"
                      : "text-emerald-600"
              }`}
              aria-live="polite"
            >
              {data.symptomDescription.trim().length < 10 ? `${data.symptomDescription.length} / 1000 · 10 min` : `${data.symptomDescription.length} / 1000`}
            </span>
          </div>
        </QuestionCard>

        {/* Q12 — Housing type */}
        <QuestionCard
          number={12}
          question="What type of housing do you currently live in?"
          required
          hasError={hasErr("housingType")}
        >
          <RadioGroup
            name="housingType"
            value={data.housingType}
            onChange={(v) => update("housingType", v)}
            options={[
              { label: "Apartment with a no-pet policy", value: "apt_nopet" },
              { label: "Condo or townhouse", value: "condo" },
              { label: "Renting a house", value: "house_rent" },
              { label: "College dorm or on-campus housing", value: "dorm" },
              { label: "Currently looking for housing", value: "looking" },
            ]}
          />
        </QuestionCard>

      </div>

      <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={handleNext}
          className="whitespace-nowrap w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 sm:px-10 py-4 sm:py-3.5 bg-[#F97316] text-white font-bold text-base sm:text-sm rounded-xl sm:rounded-lg hover:bg-[#EA580C] active:bg-[#C2410C] transition-colors cursor-pointer shadow-[0_8px_22px_-10px_rgba(249,115,22,0.5)]"
        >
          Continue to Your Information
          <i className="ri-arrow-right-line"></i>
        </button>
      </div>
    </div>
  );
}
