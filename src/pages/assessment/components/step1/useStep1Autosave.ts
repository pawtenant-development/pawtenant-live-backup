// Step 1 autosave — localStorage only.
//
// Design rules:
//  • Versioned key — bump `_v1` if Step1Data shape ever changes.
//  • TTL of 14 days — discards stale drafts so a stranger on a public
//    machine doesn't see week-old answers.
//  • Hydrate is OPT-IN by the caller: read returns a Draft, but the caller
//    must verify parent `data` is empty before applying it. This prevents
//    overwriting resume-fetched data (`?resume=`) or test-mode prefill
//    (`?testCheckout=1`).
//  • All localStorage access is wrapped in try/catch — Safari Private Mode
//    and quota errors must never block the assessment flow.

import { useEffect, useRef } from "react";
import type { Step1Data } from "../Step1Assessment";
import type { PetInfo } from "../Step2PersonalInfo";

const KEY = "pawtenant_step1_draft_v1";
const TTL_DAYS = 14;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
const DEBOUNCE_MS = 300;

interface Draft {
  data: Step1Data;
  currentIndex: number;
  savedAt: string;
  schemaVersion: 1;
  /**
   * ASSESSMENT-PET-SUPPORT-AND-STEP-STRUCTURE-001 — the pet cards now live in
   * Step 1, so a refresh mid-pet-section must restore them too.
   *
   * ADDITIVE and OPTIONAL, and the schemaVersion is deliberately NOT bumped: a
   * draft written before this task has no `pets` key, reads back cleanly as
   * `undefined`, and the caller simply keeps whatever the parent already holds.
   * Bumping the version would have thrown away every in-flight draft on deploy.
   */
  pets?: PetInfo[];
}

/** Returns true if every required Step 1 field is empty / unset. */
export function isStep1DataEmpty(d: Step1Data): boolean {
  return (
    !d.emotionalFrequency &&
    (d.conditions?.length ?? 0) === 0 &&
    !d.lifeChangeStress &&
    !d.challengeDuration &&
    !d.dailyImpact &&
    !d.sleepQuality &&
    !d.socialFunctioning &&
    !d.medication &&
    !d.priorDiagnosis &&
    !d.currentTreatment &&
    (!d.symptomDescription || d.symptomDescription.trim().length === 0) &&
    !d.housingType
  );
}

/** Read a draft from localStorage. Returns null on miss / expiry / parse error. */
export function readStep1Draft(): Draft | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    if (!parsed || parsed.schemaVersion !== 1) return null;
    if (!parsed.data || typeof parsed.currentIndex !== "number" || typeof parsed.savedAt !== "string") {
      return null;
    }
    const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
    if (!Number.isFinite(ageMs) || ageMs > TTL_MS) return null;
    return parsed as Draft;
  } catch {
    return null;
  }
}

/** Write a draft to localStorage. Best-effort; swallows quota / private-mode errors. */
export function writeStep1Draft(data: Step1Data, currentIndex: number, pets?: PetInfo[]): void {
  try {
    if (typeof window === "undefined") return;
    const payload: Draft = {
      data,
      currentIndex,
      savedAt: new Date().toISOString(),
      schemaVersion: 1,
      ...(pets ? { pets } : {}),
    };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Silently ignore — quota / private mode.
  }
}

/** Remove any saved draft. Called after Step 1 successfully advances to Step 2. */
export function clearStep1Draft(): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/**
 * Debounced writer hook. Persists the current draft 300ms after the last
 * change. Does NOT hydrate — the consumer should call `readStep1Draft()`
 * once during initial mount (after confirming the parent's `data` is empty).
 */
export function useStep1AutosaveWriter(
  data: Step1Data,
  currentIndex: number,
  pets: PetInfo[] | undefined,
  enabled: boolean,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serialized = JSON.stringify(data);
  const serializedPets = JSON.stringify(pets ?? null);

  useEffect(() => {
    if (!enabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      writeStep1Draft(data, currentIndex, pets);
    }, DEBOUNCE_MS);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, serializedPets, currentIndex, enabled]);
}
