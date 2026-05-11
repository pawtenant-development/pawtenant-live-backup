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

// ── Discriminated-union question definitions ────────────────────────────────

type RadioFieldId = Exclude<
  keyof Step1Data,
  "conditions" | "symptomDescription" | "medicationDetails" | "specificDiagnosis" | "treatmentDetails" | "hasESA" | "petSupport" | "petType"
>;

export interface RadioQuestion {
  kind: "radio";
  id: RadioFieldId;
  number: number;
  question: string;
  required: true;
  hint?: string;
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
  minLen: number;
  maxLen: number;
  check: (d: Step1Data) => boolean;
}

export type QuestionDef =
  | RadioQuestion
  | CheckboxQuestion
  | RadioWithTextQuestion
  | TextareaQuestion;

// ── The 12-question manifest ─────────────────────────────────────────────────

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
    kind: "radio",
    id: "dailyImpact",
    number: 5,
    question: "How often do your symptoms interfere with your daily life, work, or responsibilities?",
    required: true,
    options: FREQUENCY_OPTIONS,
    check: (d) => !!d.dailyImpact,
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
    options: [
      { label: "Apartment with a no-pet policy", value: "apt_nopet" },
      { label: "Condo or townhouse", value: "condo" },
      { label: "Renting a house", value: "house_rent" },
      { label: "College dorm or on-campus housing", value: "dorm" },
      { label: "Currently looking for housing", value: "looking" },
    ],
    check: (d) => !!d.housingType,
  },
];
