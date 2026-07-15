// psdAssessmentSchema — canonical, read-only PSD questionnaire definition + a
// light presentation-layer normalization adapter.
//
// PSD-PROVIDER-RAW-ASSESSMENT-001.
//
// This is the single source of truth for how a stored PSD `assessment_answers`
// object is turned into the exact question-and-answer pairs a licensed provider
// reviews. It is intentionally framework-agnostic (no React) so the mapping and
// normalization logic can be reasoned about and exercised in isolation.
//
// Design rules (do NOT break):
//  - Presentation-only. NEVER mutate the stored answers.
//  - Show the customer's ACTUAL answer. Resolve known option codes to their
//    original on-screen label; fall back to the raw value VERBATIM for any
//    unknown/legacy code (never discard it, never invent one).
//  - No pass/fail, no eligibility verdict, no clinical colouring lives here.
//
// The canonical form these labels mirror is `psd-assessment/components/PSDStep1.tsx`.

// ── Option code → original on-screen label maps ───────────────────────────────
// Keys and values are copied verbatim from the customer-facing PSD form so the
// provider sees exactly the wording the customer selected.

export const TASK_TRAINING_LABELS: Record<string, string> = {
  professional: "Professionally trained by a certified trainer",
  owner_trained: "Owner-trained (self-trained with the dog)",
  mixed: "Mix of professional and owner training",
  in_training: "Currently in training",
};

export const TASK_RELIABILITY_LABELS: Record<string, string> = {
  very_reliable: "Very reliably — performs the task consistently every time",
  mostly_reliable: "Mostly reliably — performs the task most of the time",
  inconsistent: "Sometimes — still learning, performs inconsistently",
  in_training: "Still in early training — not yet reliable",
};

export const TASK_PUBLIC_ACCESS_LABELS: Record<string, string> = {
  yes: "Yes — well-behaved and under control in public",
  mostly: "Mostly — minor issues but generally manageable",
  training: "Working on it — still training for public access",
  no: "No — not yet ready for public access",
};

export const DURATION_LABELS: Record<string, string> = {
  lt6months: "Less than 6 months",
  "6to12months": "6–12 months",
  "1to2years": "1–2 years",
  gt2years: "More than 2 years",
};

export const FREQ_LABELS: Record<string, string> = {
  rarely: "Rarely — a few times a month",
  sometimes: "Sometimes — a few times a week",
  often: "Often — most days",
  daily: "Almost always — daily or near-daily",
};

export const LIFE_CHANGE_LABELS: Record<string, string> = {
  yes_current: "Yes — currently going through a major life change",
  yes_recent: "Yes — recently went through one and still adjusting",
  no: "Not significantly — situation feels generally stable",
};

export const MEDICATION_LABELS: Record<string, string> = {
  yes_taking: "Yes, currently prescribed and taking",
  yes_not_taking: "Yes, prescribed but not currently taking",
  previous: "Previously prescribed, no longer taking",
  never: "No, never prescribed",
};

export const DIAGNOSIS_LABELS: Record<string, string> = {
  yes: "Yes, formal diagnosis",
  informal: "Told I may have a condition, not formally diagnosed",
  no: "No, never been evaluated",
  prefer_not: "Prefer not to say",
};

export const TREATMENT_LABELS: Record<string, string> = {
  active: "Yes, actively in treatment",
  previous: "Previously received treatment",
  considering: "No, but considering it",
  none: "No treatment at this time",
};

export const HOUSING_LABELS: Record<string, string> = {
  apt_nopet: "Apartment with no-pet policy",
  condo: "Condo or townhouse",
  house_rent: "Renting a house",
  dorm: "College dorm or on-campus housing",
  looking: "Currently looking for housing",
};

export const SAFETY_CHECK_LABELS: Record<string, string> = {
  no: "No",
  yes: "Yes",
};

// ── Canonical questionnaire, in the exact order the customer answered ──────────

export type PsdAnswerKind = "multi" | "single" | "text" | "evidence";

export interface PsdQuestion {
  /** Display number, matching the customer-facing form where applicable. */
  n: number;
  /** Stored key in `assessment_answers`. */
  key: string;
  /** Exact question wording shown to the customer. */
  label: string;
  kind: PsdAnswerKind;
  /** Code → label map for single-select questions. */
  options?: Record<string, string>;
  /** Optional free-text follow-up stored under a sibling key. */
  followUp?: { key: string; label: string };
}

export const PSD_QUESTIONNAIRE_ITEMS: PsdQuestion[] = [
  {
    n: 1,
    key: "dogTasks",
    label: "What specific tasks does your dog perform to help with your disability?",
    kind: "multi",
  },
  {
    n: 2,
    key: "taskTraining",
    label: "How were these tasks trained?",
    kind: "single",
    options: TASK_TRAINING_LABELS,
  },
  {
    n: 3,
    key: "taskDescription",
    label: "Describe exactly how your dog performs each task — step by step.",
    kind: "text",
  },
  {
    n: 4,
    key: "taskReliability",
    label: "How reliably does your dog perform these tasks on cue or when needed?",
    kind: "single",
    options: TASK_RELIABILITY_LABELS,
  },
  {
    n: 5,
    key: "taskPublicAccess",
    label:
      "Is your dog able to accompany you in public spaces (stores, restaurants, transit) without disruptive behavior?",
    kind: "single",
    options: TASK_PUBLIC_ACCESS_LABELS,
  },
  {
    n: 6,
    key: "taskEvidence",
    label: "Task training evidence",
    kind: "evidence",
  },
  {
    n: 7,
    key: "dogDuration",
    label: "How long has your dog been performing these tasks for you?",
    kind: "single",
    options: DURATION_LABELS,
  },
  {
    n: 8,
    key: "emotionalFrequency",
    label: "How often do you experience emotional distress, anxiety, or depression?",
    kind: "single",
    options: FREQ_LABELS,
  },
  {
    n: 9,
    key: "conditions",
    label: "Which of the following do you currently experience?",
    kind: "multi",
  },
  {
    n: 10,
    key: "lifeChangeStress",
    label:
      "Have you experienced a major life change or transition that is impacting your mental health?",
    kind: "single",
    options: LIFE_CHANGE_LABELS,
  },
  {
    n: 11,
    key: "dailyImpact",
    label:
      "How often do your symptoms interfere with your daily life, work, or responsibilities?",
    kind: "single",
    options: FREQ_LABELS,
  },
  {
    n: 12,
    key: "medication",
    label: "Are you currently taking any prescribed medication for a mental health condition?",
    kind: "single",
    options: MEDICATION_LABELS,
    followUp: { key: "medicationDetails", label: "Medication(s) listed" },
  },
  {
    n: 13,
    key: "priorDiagnosis",
    label:
      "Have you previously received a mental health diagnosis from a licensed professional?",
    kind: "single",
    options: DIAGNOSIS_LABELS,
    followUp: { key: "specificDiagnosis", label: "Specific diagnosis shared" },
  },
  {
    n: 14,
    key: "currentTreatment",
    label: "Are you currently receiving mental health treatment or therapy?",
    kind: "single",
    options: TREATMENT_LABELS,
    followUp: { key: "treatmentDetails", label: "Treatment described" },
  },
  {
    n: 15,
    key: "dogHelpDescription",
    label:
      "In your own words, describe how your dog helps you manage your disability and daily life.",
    kind: "text",
  },
  {
    n: 16,
    key: "housingType",
    label: "What type of housing do you currently live in?",
    kind: "single",
    options: HOUSING_LABELS,
  },
  {
    n: 17,
    key: "safetyCheck",
    label: "Are you currently having thoughts of harming yourself or others?",
    kind: "single",
    options: SAFETY_CHECK_LABELS,
  },
];

// ── Types for the parts of the answer object we present ────────────────────────

export interface PsdPet {
  name?: string;
  type?: string;
  age?: string;
  breed?: string;
  weight?: string;
}

export interface PsdEvidence {
  present: boolean;
  /** Original evidence type as chosen by the customer (video | photo | link | ""). */
  type: string;
  url: string;
  /** True only for real, openable http(s) links. blob:/data: refs are not openable. */
  openable: boolean;
}

// ── Normalization adapter (read-only) ─────────────────────────────────────────
//
// Historical PSD orders in both TEST and LIVE store a single flat, camelCase
// object. This adapter is deliberately light, but it is defensive so that:
//  - a nested wrapper ({ answers: {...} } / { assessment: {...} }) is unwrapped;
//  - a small set of legacy key aliases resolves to the canonical key;
//  - nothing is ever mutated, dropped, or invented.

const KEY_ALIASES: Record<string, string> = {
  // Reserved for legacy key drift. Kept explicit (currently identity) so a future
  // rename can be handled in the presentation layer without a data migration.
  // e.g. dog_tasks: "dogTasks",
};

const KNOWN_KEYS: string[] = [
  ...PSD_QUESTIONNAIRE_ITEMS.flatMap((q) =>
    q.followUp ? [q.key, q.followUp.key] : [q.key],
  ),
  "pets",
  "dob",
  "taskEvidenceType",
  "taskEvidenceUrl",
];

function countKnownKeys(obj: Record<string, unknown>): number {
  return Object.keys(obj).filter((k) => KNOWN_KEYS.includes(k)).length;
}

/**
 * Returns a normalized, read-only copy of the raw answers:
 *  - unwraps a nested container if it holds more known keys than the top level;
 *  - applies legacy key aliases.
 * Values are never coerced or altered — only re-keyed.
 */
export function normalizePsdAnswers(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};

  // Choose the object that actually carries the questionnaire answers. Flat
  // objects (the norm) win; a nested wrapper is used only if it clearly holds
  // more of the known keys.
  let source: Record<string, unknown> = raw;
  let best = countKnownKeys(raw);
  for (const candidateKey of ["answers", "assessment", "psd", "data"]) {
    const nested = raw[candidateKey];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const n = countKnownKeys(nested as Record<string, unknown>);
      if (n > best) {
        source = nested as Record<string, unknown>;
        best = n;
      }
    }
  }

  const out: Record<string, unknown> = { ...source };
  for (const [legacy, canonical] of Object.entries(KEY_ALIASES)) {
    if (legacy in out && !(canonical in out)) {
      out[canonical] = out[legacy];
    }
  }
  return out;
}

/** True when a stored value counts as actually answered (not empty). */
export function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Resolves a single-select code to its original label. Unknown/legacy codes are
 * returned VERBATIM (as a trimmed string) rather than discarded.
 */
export function resolvePsdOptionLabel(
  options: Record<string, string> | undefined,
  value: unknown,
): string {
  if (value === undefined || value === null) return "";
  const raw = String(value);
  if (options && Object.prototype.hasOwnProperty.call(options, raw)) {
    return options[raw];
  }
  return raw;
}

/** Selected labels for a multi-select answer, verbatim, empties filtered out. */
export function getPsdMultiValues(
  answers: Record<string, unknown>,
  key: string,
): string[] {
  const v = answers[key];
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter((s) => s.trim().length > 0);
}

/** Free-text answer, verbatim (untrimmed content preserved except outer check). */
export function getPsdText(answers: Record<string, unknown>, key: string): string {
  const v = answers[key];
  if (v === undefined || v === null) return "";
  return String(v);
}

export function getPsdPets(answers: Record<string, unknown>): PsdPet[] {
  const v = answers.pets;
  if (!Array.isArray(v)) return [];
  return v.filter((p) => p && typeof p === "object") as PsdPet[];
}

export function getPsdEvidence(answers: Record<string, unknown>): PsdEvidence {
  const url = getPsdText(answers, "taskEvidenceUrl").trim();
  const type = getPsdText(answers, "taskEvidenceType").trim();
  return {
    present: url.length > 0 || type.length > 0,
    type,
    url,
    openable: /^https?:\/\//i.test(url),
  };
}
