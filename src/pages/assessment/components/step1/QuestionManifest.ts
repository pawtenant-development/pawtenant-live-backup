// Step 1 — declarative question manifest.
//
// Single source of truth for the 12-question screener used by the v2
// one-question-at-a-time router. The `id` fields are typed against the
// existing Step1Data shape so a renamed/removed field fails TypeScript
// compile before runtime. The `check` predicates mirror the original
// `REQUIRED_FIELDS` list in Step1Assessment.tsx exactly — there is only
// one source of truth for validation rules and it lives here.

import type { Step1Data } from "../Step1Assessment";

// ── Shared option sets (mirrors legacy file) ────────────────────────────────

export const FREQUENCY_OPTIONS: { label: string; value: string }[] = [
  { label: "Rarely — a few times a month", value: "rarely" },
  { label: "Sometimes — a few times a week", value: "sometimes" },
  { label: "Often — most days", value: "often" },
  { label: "Almost always — daily or near-daily", value: "daily" },
];

export const CONDITIONS: string[] = [
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

/**
 * ASSESSMENT-FUNCTIONAL-IMPACT-DETAIL-002 (owner, 2026-08-26).
 *
 * The functional-impact question already asked HOW OFTEN symptoms interfere.
 * The reviewing provider repeatedly had to come back and ask WHAT becomes
 * harder, so that is now captured on the SAME screen — no new screen, no new
 * essay. Customer-reported areas of difficulty; not a diagnosis, not a score,
 * and nothing here decides eligibility.
 */
export const FUNCTIONAL_IMPACT_OPTIONS: string[] = [
  "Sleeping",
  "Concentrating",
  "Working or studying",
  "Getting out of bed or staying motivated",
  "Maintaining a daily routine",
  "Completing household responsibilities",
  "Caring for myself",
  "Leaving home",
  "Interacting with others",
  "Isolation or withdrawal",
  "Other",
];

/** Cap for the optional companion explanation. Short by design. */
export const FUNCTIONAL_IMPACT_NOTE_MAX = 400;

// ── Discriminated-union question definitions ────────────────────────────────

type RadioFieldId = Exclude<
  keyof Step1Data,
  | "conditions" | "symptomDescription" | "medicationDetails" | "specificDiagnosis" | "treatmentDetails"
  | "hasESA" | "petSupport" | "petType"
  // Pet-section fields are answered by the pet screens, never by a manifest
  // radio question — the manifest stays the 13 clinical questions only.
  | "petCountConfirmed" | "petsDifferentiation" | "petsDifferentiationNote"
  // Answered by the multi-select companion on the functional-impact screen,
  // never by a plain radio question.
  | "functionalImpactAreas" | "functionalImpactNote"
>;

export interface RadioQuestion {
  kind: "radio";
  id: RadioFieldId;
  number: number;
  question: string;
  required: true;
  hint?: string;
  /** Short plain-language explanation of WHY this question is asked. Presentation
   *  only — never part of validation, scoring or the clinical rules. */
  context?: string;
  options: { label: string; value: string }[];
  check: (d: Step1Data) => boolean;
}

export interface CheckboxQuestion {
  kind: "checkbox";
  id: "conditions";
  number: number;
  question: string;
  required: true;
  hint?: string;
  /** Short plain-language explanation of WHY this question is asked. Presentation
   *  only — never part of validation, scoring or the clinical rules. */
  context?: string;
  options: string[];
  check: (d: Step1Data) => boolean;
}

export interface RadioWithTextQuestion {
  kind: "radio+text";
  id: "medication" | "priorDiagnosis" | "currentTreatment";
  number: number;
  question: string;
  required: true;
  hint?: string;
  /** Short plain-language explanation of WHY this question is asked. Presentation
   *  only — never part of validation, scoring or the clinical rules. */
  context?: string;
  options: { label: string; value: string }[];
  check: (d: Step1Data) => boolean;
  conditionalField: "medicationDetails" | "specificDiagnosis" | "treatmentDetails";
  conditionalLabel: string;
  conditionalPlaceholder: string;
  showWhen: (val: string) => boolean;
  clearWhen: (val: string) => boolean;
}

export interface TextareaQuestion {
  kind: "textarea";
  id: "symptomDescription";
  number: number;
  question: string;
  required: true;
  hint?: string;
  /** Short plain-language explanation of WHY this question is asked. Presentation
   *  only — never part of validation, scoring or the clinical rules. */
  context?: string;
  minLen: number;
  maxLen: number;
  check: (d: Step1Data) => boolean;
}

/**
 * The functional-impact question: the ORIGINAL frequency radio (id, number and
 * answer VALUES untouched) plus a required multi-select companion and an
 * optional short explanation, all on ONE screen.
 */
export interface RadioWithImpactQuestion {
  kind: "radio+impact";
  id: "dailyImpact";
  number: number;
  question: string;
  required: true;
  hint?: string;
  context?: string;
  options: { label: string; value: string }[];
  check: (d: Step1Data) => boolean;
  /** Required multi-select — what actually becomes harder. */
  impactField: "functionalImpactAreas";
  impactQuestion: string;
  impactOptions: string[];
  /** ALWAYS optional, and only offered once an area has been selected, so it is
   *  conditional on the customer actually reporting interference. */
  impactNoteField: "functionalImpactNote";
  impactNoteLabel: string;
  impactNotePlaceholder: string;
  impactNoteMax: number;
}

export type QuestionDef =
  | RadioQuestion
  | CheckboxQuestion
  | RadioWithTextQuestion
  | RadioWithImpactQuestion
  | TextareaQuestion;

// ── The 13-question manifest ─────────────────────────────────────────────────
// The FINAL question is a safety screen. When the answer is "yes" the router
// hard-stops the flow and shows CrisisSupportPanel — no continue, no checkout —
// until the user changes the answer. See QuestionRouter.tsx.

/**
 * ASSESSMENT-PROGRESS-CONSISTENCY-001 — the ONE answered-count source.
 *
 * Both progress displays (the page-level StepIndicator and the in-flow router
 * counter) must report the same number, so both call THIS. Counting by the
 * manifest's own `check` predicates is what makes it canonical: a question is
 * "answered" if and only if it would pass validation.
 *
 * The page previously counted a truthy `safetyCheck` field, so answering the
 * safety screen "yes" — which the manifest deliberately treats as NOT satisfied,
 * because it hard-stops the flow — inflated the header's count by one.
 */
export function countAnsweredStep1(data: Step1Data): number {
  return QUESTION_MANIFEST.filter((q) => q.check(data)).length;
}

export const QUESTION_MANIFEST: QuestionDef[] = [
  {
    kind: "radio",
    id: "emotionalFrequency",
    number: 1,
    question: "How often do you experience emotional distress, anxiety, or depression?",
    required: true,
    options: FREQUENCY_OPTIONS,
    check: (d) => !!d.emotionalFrequency,
  },
  {
    kind: "checkbox",
    id: "conditions",
    number: 2,
    question: "Which of the following do you currently experience? (Select all that apply)",
    required: true,
    context:
      "Select everything that applies. This is not a diagnosis — it gives the licensed professional reviewing your evaluation a starting picture of what you are experiencing.",
    options: CONDITIONS,
    check: (d) => d.conditions.length > 0,
  },
  {
    kind: "radio",
    id: "lifeChangeStress",
    number: 3,
    question: "Have you experienced a major life change or transition that is impacting your mental health or causing stress?",
    required: true,
    hint: "e.g., moving, divorce, job loss, illness, grief, relationship changes",
    options: [
      { label: "Yes — currently going through a major life change", value: "yes_current" },
      { label: "Yes — recently went through one and still adjusting", value: "yes_recent" },
      { label: "Not significantly — my situation feels generally stable", value: "no" },
    ],
    check: (d) => !!d.lifeChangeStress,
  },
  {
    kind: "radio",
    id: "challengeDuration",
    number: 4,
    question: "How long have you been experiencing these challenges?",
    required: true,
    options: [
      { label: "Less than 3 months", value: "lt3months" },
      { label: "3–6 months", value: "3to6months" },
      { label: "6–12 months", value: "6to12months" },
      { label: "1–2 years", value: "1to2years" },
      { label: "More than 2 years", value: "gt2years" },
    ],
    check: (d) => !!d.challengeDuration,
  },
  {
    // ASSESSMENT-FUNCTIONAL-IMPACT-DETAIL-002: the frequency radio below is the
    // ORIGINAL question — same id, same number, same answer values. What is new
    // is the companion multi-select on the same screen, which is the detail the
    // reviewing provider kept having to ask for.
    kind: "radio+impact",
    id: "dailyImpact",
    number: 5,
    question: "How often do your symptoms interfere with your daily life, work, or responsibilities?",
    required: true,
    options: FREQUENCY_OPTIONS,
    check: (d) => !!d.dailyImpact && (d.functionalImpactAreas?.length ?? 0) > 0,
    impactField: "functionalImpactAreas",
    impactQuestion: "When your symptoms interfere with daily functioning, what becomes more difficult?",
    impactOptions: FUNCTIONAL_IMPACT_OPTIONS,
    impactNoteField: "functionalImpactNote",
    impactNoteLabel: "Optional: add a short example",
    impactNotePlaceholder: "Example: I miss morning shifts because I cannot get out of bed.",
    impactNoteMax: FUNCTIONAL_IMPACT_NOTE_MAX,
  },
  {
    kind: "radio",
    id: "sleepQuality",
    number: 6,
    question: "How often do you experience difficulty sleeping or disrupted sleep?",
    required: true,
    options: FREQUENCY_OPTIONS,
    check: (d) => !!d.sleepQuality,
  },
  {
    kind: "radio",
    id: "socialFunctioning",
    number: 7,
    question: "How often does your mental health cause you to withdraw from social activities or relationships?",
    required: true,
    options: FREQUENCY_OPTIONS,
    check: (d) => !!d.socialFunctioning,
  },
  {
    kind: "radio+text",
    id: "medication",
    number: 8,
    question: "Are you currently taking any prescribed medication for a mental health condition?",
    required: true,
    context:
      "Medication is not required to qualify, and taking it does not disqualify you. The professional reviewing your evaluation asks because it is part of a complete clinical picture.",
    options: [
      { label: "Yes, currently prescribed and taking", value: "yes_taking" },
      { label: "Yes, prescribed but not currently taking", value: "yes_not_taking" },
      { label: "Previously prescribed, no longer taking", value: "previous" },
      { label: "No, never prescribed", value: "never" },
    ],
    check: (d) => !!d.medication,
    conditionalField: "medicationDetails",
    conditionalLabel: "If comfortable, please list the medication(s)",
    conditionalPlaceholder: "e.g., Sertraline (Zoloft), Escitalopram (Lexapro), Buspirone...",
    showWhen: (v) => !!v && v !== "never",
    clearWhen: (v) => v === "never",
  },
  {
    kind: "radio+text",
    id: "priorDiagnosis",
    number: 9,
    question: "Have you previously received a mental health diagnosis from a licensed professional?",
    required: true,
    context:
      "A previous diagnosis is not required. Answering “no” does not count against you — your evaluation is based on what you describe here.",
    options: [
      { label: "Yes, I have a formal diagnosis", value: "yes" },
      { label: "I have been told I may have a condition, but not formally diagnosed", value: "informal" },
      { label: "No, I have never been evaluated", value: "no" },
      { label: "I prefer not to say", value: "prefer_not" },
    ],
    check: (d) => !!d.priorDiagnosis,
    conditionalField: "specificDiagnosis",
    conditionalLabel: "If comfortable, please share your specific diagnosis",
    conditionalPlaceholder: "e.g., Generalized Anxiety Disorder, Major Depressive Disorder, Adjustment Disorder...",
    showWhen: (v) => v === "yes" || v === "informal",
    clearWhen: (v) => v === "no" || v === "prefer_not",
  },
  {
    kind: "radio+text",
    id: "currentTreatment",
    number: 10,
    question: "Are you currently receiving mental health treatment or therapy?",
    required: true,
    options: [
      { label: "Yes, I am actively in treatment", value: "active" },
      { label: "Previously received treatment", value: "previous" },
      { label: "No, but I am considering it", value: "considering" },
      { label: "No treatment at this time", value: "none" },
    ],
    check: (d) => !!d.currentTreatment,
    conditionalField: "treatmentDetails",
    conditionalLabel: "Please describe your current or past treatment",
    conditionalPlaceholder: "e.g., Weekly individual therapy with a CBT therapist, Group therapy for anxiety...",
    showWhen: (v) => v === "active" || v === "previous",
    clearWhen: (v) => v === "none" || v === "considering",
  },
  {
    kind: "textarea",
    id: "symptomDescription",
    number: 11,
    question: "In your own words, please describe your symptoms and what you are going through.",
    required: true,
    hint: "This helps your provider better understand your experience and how your ESA supports your well-being. Please share as much as you feel comfortable with.",
    minLen: 10,
    maxLen: 1000,
    check: (d) => d.symptomDescription.trim().length >= 10,
  },
  {
    kind: "radio",
    id: "housingType",
    number: 12,
    question: "What type of housing do you currently live in?",
    required: true,
    context:
      "Your housing situation is the context an ESA letter is written for. It does not change whether you qualify — that depends on your clinical evaluation.",
    options: [
      { label: "Apartment with a no-pet policy", value: "apt_nopet" },
      { label: "Condo or townhouse", value: "condo" },
      { label: "Renting a house", value: "house_rent" },
      { label: "College dorm or on-campus housing", value: "dorm" },
      { label: "Currently looking for housing", value: "looking" },
    ],
    check: (d) => !!d.housingType,
  },
  {
    kind: "radio",
    id: "safetyCheck",
    number: 13,
    question: "Are you currently having thoughts of harming yourself or others?",
    required: true,
    hint: "We ask this to keep you safe. Your answer is confidential.",
    options: [
      { label: "No", value: "no" },
      { label: "Yes", value: "yes" },
    ],
    check: (d) => d.safetyCheck === "no",
  },
];
