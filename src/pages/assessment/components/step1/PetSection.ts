// Step 1 — pet section contract.
//
// ASSESSMENT-PET-SUPPORT-AND-STEP-STRUCTURE-001 (owner, 2026-08-26).
//
// The pet details used to live in Step 2 ("Your Information"), which meant the
// provider received the clinical picture and the animal picture from two
// unrelated places and never learned what any INDIVIDUAL animal actually does
// for the customer. Step 1 now runs:
//
//     13 clinical questions  ->  how many animals  ->  one card per animal
//                            ->  (2+ animals only) how they differ
//
// Design rules this file enforces:
//   * ONE canonical screen sequence. Position, total and progress are all
//     derived from `buildStep1Screens()`, so a hidden/inapplicable screen can
//     never be counted (the 2+-animal screen does not exist for one animal).
//   * The pet COUNT is `pets.length`. It is never stored a second time, so the
//     count and the cards cannot disagree and a pet can never be duplicated.
//   * Every pet keeps its OWN support selections and its OWN optional note.
//     There is no shared/global pet narrative.
//   * Descriptive text is ALWAYS optional and never gates progression.
//   * Nothing here is a clinical conclusion. These are customer-reported
//     statements for the licensed provider to evaluate. Approval is never
//     implied, promised or automated.
//
// Storage contract (additive, backward compatible):
//   assessment_answers.pets[i].supportFunctions : string[]  (may be absent)
//   assessment_answers.pets[i].supportNarrative : string    (may be absent)
//   assessment_answers.pets[i].vaccinated       : boolean   (may be absent)
//   assessment_answers.pets[i].petId            : string    (may be absent)
//   assessment_answers.petsDifferentiation      : string    (may be absent)
//   assessment_answers.petsDifferentiationNote  : string    (may be absent)
// A historical order carries NONE of these. Every reader must fail safe to
// empty — never block, never invent an answer.

import type { Step1Data } from "../Step1Assessment";
import type { PetInfo } from "../Step2PersonalInfo";
import { QUESTION_MANIFEST } from "./QuestionManifest";

/** The paid-package range. Mirrors src/config/pricing.ts (1-2 / exactly 3).
 *  This module NEVER prices anything — it only refuses counts the package has
 *  never covered, so a resized list cannot drive the price resolver out of range. */
export const MIN_PETS = 1;
export const MAX_PETS = 3;

/**
 * Version stamped into orders.assessment_answers.assessmentVersion.
 *
 * 1 (implicit, never written) — clinical answers + pets[] with name/type/
 *   breed/age/weight only. Pet details were collected in Step 2.
 * 2 — pet section runs inside Step 1 and each pet may additionally carry
 *   petId / vaccinated / supportFunctions / supportNarrative, plus the
 *   top-level petsDifferentiation / petsDifferentiationNote.
 *
 * PURELY ADDITIVE: a row with no `assessmentVersion` is a version-1 row and
 * every reader must render it unchanged. Nothing reads this value to gate
 * access, pricing or eligibility — it exists so a human can tell the two
 * shapes apart.
 */
export const ASSESSMENT_ANSWERS_VERSION = 2;

/** Optional narrative cap. Generous enough for a real example, small enough to
 *  stay a "tell us briefly", not an essay. */
export const PET_NARRATIVE_MAX = 600;
export const PET_DIFFERENTIATION_NOTE_MAX = 600;

export const PET_TYPE_OPTIONS = ["Dog", "Cat", "Bird", "Rabbit", "Hamster", "Guinea Pig", "Other"];

/**
 * How this animal helps. Plain language, multi-select, deliberately concrete.
 * These are the customer's own report — they are NOT a diagnosis, NOT a score
 * and NOT an eligibility rule. Nothing in the flow reads this list to decide
 * anything; it is evidence for the reviewing provider.
 */
export const PET_SUPPORT_OPTIONS: string[] = [
  "Helps me feel calm or grounded",
  "Provides physical comfort or affection",
  "Interrupts anxiety, panic or overthinking",
  "Helps me sleep or settle at night",
  "Helps me get out of bed or stay motivated",
  "Helps me maintain a daily routine",
  "Reduces loneliness or social withdrawal",
  "Supports me during grief or major life changes",
  "Helps me complete daily responsibilities",
  "Helps me feel safe in my home",
  "Other",
];

/** Shown ONLY when the customer is requesting documentation for 2+ animals. */
export const PET_DIFFERENTIATION_OPTIONS: { label: string; value: string }[] = [
  { label: "Yes — they help with different symptoms", value: "different_symptoms" },
  { label: "Yes — they help at different times or in different situations", value: "different_situations" },
  { label: "Yes — they have different temperaments or interaction styles", value: "different_temperaments" },
  { label: "They provide similar support", value: "similar_support" },
  { label: "I am not sure", value: "not_sure" },
];

// ── Pet list helpers ────────────────────────────────────────────────────────

/** Clamp any count to the range the paid package actually covers. */
export function clampPetCount(n: unknown): number {
  const raw = Math.floor(Number(n));
  if (!Number.isFinite(raw)) return MIN_PETS;
  return Math.min(MAX_PETS, Math.max(MIN_PETS, raw));
}

/** Stable per-pet identifier. Index alone is not enough once a middle pet can
 *  be removed, so every card carries an id that travels with its answers. */
function mintPetId(index: number): string {
  return `pet_${index + 1}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeEmptyPet(index = 0, type = ""): PetInfo {
  return {
    petId: mintPetId(index),
    name: "",
    age: "",
    breed: "",
    type,
    weight: "",
    vaccinated: false,
    supportFunctions: [],
    supportNarrative: "",
  };
}

/** True when the customer has typed nothing at all into this card. Used to
 *  decide whether shrinking the list would DISCARD real information. */
export function isPetEmpty(pet: PetInfo | undefined): boolean {
  if (!pet) return true;
  return (
    !pet.name?.trim() &&
    !pet.age?.trim() &&
    !pet.breed?.trim() &&
    !pet.type?.trim() &&
    !pet.weight?.trim() &&
    !pet.vaccinated &&
    (pet.supportFunctions?.length ?? 0) === 0 &&
    !pet.supportNarrative?.trim()
  );
}

/**
 * Resize the pet list to `next`.
 *
 * GROW  — appends fresh, distinct cards. Never clones an existing pet, so two
 *         animals can never end up with the same answers.
 * SHRINK— drops from the END only, so every remaining pet keeps its own,
 *         already-entered answers at its own index.
 * The array identity of surviving pets is preserved by reference.
 */
export function resizePets(pets: PetInfo[], next: number, defaultType = ""): PetInfo[] {
  const target = clampPetCount(next);
  const current = pets.length;
  if (target === current) return pets;
  if (target < current) return pets.slice(0, target);
  const grown = pets.slice();
  for (let i = current; i < target; i += 1) grown.push(makeEmptyPet(i, defaultType));
  return grown;
}

/** Which pets would be thrown away by shrinking to `next`, ignoring untouched
 *  blank cards (dropping an empty card discards nothing). */
export function petsLostByResize(pets: PetInfo[], next: number): number[] {
  const target = clampPetCount(next);
  if (target >= pets.length) return [];
  const lost: number[] = [];
  for (let i = target; i < pets.length; i += 1) {
    if (!isPetEmpty(pets[i])) lost.push(i);
  }
  return lost;
}

/** Normalise a list loaded from an order / draft. Historical rows have no
 *  support fields at all — they must load as EMPTY, never as an error and
 *  never as a manufactured answer. */
export function normalizePets(raw: unknown, defaultType = ""): PetInfo[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: PetInfo[] = [];
  for (let i = 0; i < Math.min(list.length, MAX_PETS); i += 1) {
    const p = (list[i] ?? {}) as Partial<PetInfo> & Record<string, unknown>;
    out.push({
      petId: typeof p.petId === "string" && p.petId ? p.petId : mintPetId(i),
      name: typeof p.name === "string" ? p.name : "",
      age: typeof p.age === "string" ? p.age : typeof p.age === "number" ? String(p.age) : "",
      breed: typeof p.breed === "string" ? p.breed : "",
      type: typeof p.type === "string" ? p.type : "",
      weight: typeof p.weight === "string" ? p.weight : typeof p.weight === "number" ? String(p.weight) : "",
      vaccinated: p.vaccinated === true,
      supportFunctions: Array.isArray(p.supportFunctions)
        ? (p.supportFunctions as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
      supportNarrative: typeof p.supportNarrative === "string" ? p.supportNarrative : "",
    });
  }
  if (out.length === 0) out.push(makeEmptyPet(0, defaultType));
  return out;
}

// ── The canonical Step 1 screen sequence ────────────────────────────────────

export type Step1Screen =
  | { kind: "question"; questionIndex: number }
  | { kind: "petCount" }
  | { kind: "petCard"; petIndex: number }
  | { kind: "petDifferentiation" };

/**
 * THE canonical sequence. Position, total, progress and the Back/Continue
 * bounds all read this one function, so they cannot disagree — and a screen
 * that does not apply (the 2+-animal comparison for a single animal) is not in
 * the array at all, so it can never be counted.
 */
export function buildStep1Screens(pets: PetInfo[]): Step1Screen[] {
  // Raw length, bounded to the package range. NOT clampPetCount(): an empty
  // array must produce ZERO pet cards rather than a card for a pet that is not
  // there. The live flow always holds at least one pet; this is the fail-safe.
  const count = Math.min(MAX_PETS, Math.max(0, Math.floor(pets.length) || 0));
  const screens: Step1Screen[] = QUESTION_MANIFEST.map((_q, i) => ({
    kind: "question" as const,
    questionIndex: i,
  }));
  screens.push({ kind: "petCount" });
  for (let i = 0; i < count; i += 1) screens.push({ kind: "petCard", petIndex: i });
  if (count >= 2) screens.push({ kind: "petDifferentiation" });
  return screens;
}

/** Index of the first pet-section screen (i.e. the count screen). */
export function petSectionStartIndex(): number {
  return QUESTION_MANIFEST.length;
}

// ── Completion predicates ───────────────────────────────────────────────────
//
// Required: the fields the existing document contract already required (name,
// type, breed, age) plus at least one support selection, which is the whole
// point of this task and costs one tap. Optional, ALWAYS: weight, vaccination
// status and every free-text box.

export function isPetCardComplete(pet: PetInfo | undefined, requireType = true): boolean {
  if (!pet) return false;
  if (!pet.name?.trim()) return false;
  if (requireType && !pet.type?.trim()) return false;
  if (!pet.breed?.trim()) return false;
  if (!pet.age?.trim()) return false;
  return (pet.supportFunctions?.length ?? 0) > 0;
}

export function isPetCountConfirmed(data: Step1Data): boolean {
  return data.petCountConfirmed === true;
}

export function isDifferentiationAnswered(data: Step1Data): boolean {
  return !!data.petsDifferentiation;
}

/** Is the screen at `index` of `screens` satisfied? Used for both the Continue
 *  gate and the answered count, so "answered" always means "would validate". */
export function isStep1ScreenAnswered(
  screen: Step1Screen,
  data: Step1Data,
  pets: PetInfo[],
  requireType = true,
): boolean {
  switch (screen.kind) {
    case "question":
      return QUESTION_MANIFEST[screen.questionIndex].check(data);
    case "petCount":
      return isPetCountConfirmed(data);
    case "petCard":
      return isPetCardComplete(pets[screen.petIndex], requireType);
    case "petDifferentiation":
      return isDifferentiationAnswered(data);
    default:
      return false;
  }
}

/**
 * ASSESSMENT-FLOW-POSITION-INTEGRITY-002 — the index a restored/requested
 * position may NEVER exceed.
 *
 * ROOT CAUSE this closes (reproduced on hosted TEST 2026-08-26): the router
 * restored a saved `currentIndex` clamped only to the ARRAY BOUNDS. Any stale,
 * partial, cross-version or hand-edited draft therefore dropped the visitor at
 * that raw position, skipping every screen before it. A draft holding index 10
 * with zero answers opened the assessment on clinical question 11 ("0
 * answered"), so the customer saw only questions 11-13 and went straight into
 * the pet section; a draft holding index 14 opened directly on Pet 1 details
 * with NO clinical question answered at all. That is exactly the reported
 * "pet details before the clinical assessment" and "only 2-3 questions".
 *
 * The rule: a position is only legitimate if every screen before it is
 * satisfied. Returns the index of the FIRST unsatisfied screen, or the last
 * index when everything is answered.
 */
export function firstUnansweredStep1Screen(
  data: Step1Data,
  pets: PetInfo[],
  requireType = true,
): number {
  const screens = buildStep1Screens(pets);
  const idx = screens.findIndex((s) => !isStep1ScreenAnswered(s, data, pets, requireType));
  return idx === -1 ? Math.max(0, screens.length - 1) : idx;
}

/**
 * THE position gate. Every rendered position goes through this, not just the
 * restored one — so a stale parent index, a corrupt draft, a shrunk animal list
 * or a future bug can never present a screen whose prerequisites are unmet.
 *
 * In particular this is what makes the pet section STRUCTURALLY unreachable
 * until every required clinical question has been answered: the pet-count
 * screen sits at index QUESTION_MANIFEST.length, so it cannot be shown while
 * any earlier clinical screen is still unsatisfied.
 *
 * Going BACK is always allowed — the clamp only ever pulls a position DOWN.
 */
export function clampStep1Index(
  requested: number,
  data: Step1Data,
  pets: PetInfo[],
  requireType = true,
): number {
  const total = buildStep1Screens(pets).length;
  const bounded = Math.min(Math.max(0, Math.floor(requested) || 0), Math.max(0, total - 1));
  return Math.min(bounded, firstUnansweredStep1Screen(data, pets, requireType));
}

/** Answered count for the PET screens only. The clinical count stays with the
 *  canonical `countAnsweredStep1()` helper so both progress displays keep
 *  reading one shared source (ASSESSMENT-PROGRESS-CONSISTENCY-001). */
export function countAnsweredPetScreens(
  data: Step1Data,
  pets: PetInfo[],
  requireType = true,
): number {
  return buildStep1Screens(pets)
    .filter((s) => s.kind !== "question")
    .filter((s) => isStep1ScreenAnswered(s, data, pets, requireType)).length;
}
