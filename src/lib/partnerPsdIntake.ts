// partnerPsdIntake — PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
//
// Manual (portal / admin) PSD partner orders need the CANONICAL `psd_v1`
// clinical answers, because `psd_assessment_status()` — the assignment gate —
// judges every PSD order against that catalog. The structured answer form
// (PartnerPsdQuestionnaire) and the client-side twin of the server validator
// live here.
//
// ⛔ BACKEND CONTRACT NOT YET APPLIED.
// `partner_submit_manual_order` on TEST still has NO `p_psd_answers`
// parameter and still passes `p_target_assessment_version => NULL`, so a PSD
// order submitted today lands as `portal.manual.v1` and can never be
// assigned. The migration that adds the parameter is PROPOSED, not applied:
//   docs/PROPOSED-partner-psd-manual-intake-canonical-answers.md
// Until it is applied, PSD manual intake stays VISIBLY UNAVAILABLE — the
// service tile is disabled with the reason below. Flipping the flag before
// the migration would ship a form whose answers the database silently
// discards, which is exactly what this task forbids. The build guard ties
// the flag to the presence of the applied migration file.

export const PARTNER_PSD_MANUAL_INTAKE_ENABLED = false;

export const PARTNER_PSD_UNAVAILABLE_REASON =
  "PSD partner orders are not available yet. The structured PSD questionnaire the clinical team requires is waiting on a backend change that has not been approved. ESA orders are unaffected.";

/** Canonical assessment version the manual PSD answers are stored under. */
export const PARTNER_PSD_TARGET_ASSESSMENT_VERSION = "psd_v1";

/** Answers whose canonical shape is an array of strings (mirrors the SQL twin). */
export const PSD_ARRAY_ANSWER_KEYS = new Set(["conditions", "dogTasks"]);

/** Keys that would claim a clinical decision. Never accepted (mirrors the SQL twin). */
export const PSD_CLAIM_KEYS = new Set([
  "complete", "eligible", "eligibility", "approved", "approval",
  "qualified", "qualifies", "decision", "outcome", "passed",
]);

export interface PsdCatalogEntry { question_id: string; required: boolean; sort_order: number }

/** Client twin of `partner_manual_psd_answers_problems(jsonb)`: fails closed on
 *  an empty catalog, refuses unknown / claim keys, requires every required
 *  question, and checks each value's shape. Duplicates cannot exist in a JSON
 *  object, so the server's duplicate refusal is structural here. */
export function psdManualAnswerProblems(
  answers: Record<string, unknown>,
  catalog: PsdCatalogEntry[],
): string[] {
  if (!catalog || catalog.length === 0) return ["psd question catalog unavailable"];
  const known = new Set(catalog.map((c) => c.question_id));
  const problems: string[] = [];
  for (const key of Object.keys(answers)) {
    if (PSD_CLAIM_KEYS.has(key)) return [`${key} is not accepted: clinical eligibility is determined by PawTenant clinicians, never submitted`];
    if (!known.has(key)) return [`unknown question: ${key}`];
  }
  for (const c of catalog) {
    if (c.required && !(c.question_id in answers)) problems.push(`missing required question: ${c.question_id}`);
  }
  for (const [key, val] of Object.entries(answers)) {
    if (PSD_ARRAY_ANSWER_KEYS.has(key)) {
      const ok = Array.isArray(val) && val.length > 0 && val.length <= 64 &&
        val.every((e) => typeof e === "string" && e.trim() !== "" && e.length <= 500);
      if (!ok) problems.push(`${key}: must be a non-empty array of short strings`);
    } else {
      const ok = typeof val === "string" && val.trim() !== "" && val.length <= 4000;
      if (!ok) problems.push(`${key}: must be a non-empty string`);
    }
  }
  return problems;
}

/** Only answered questions travel; blanks are omitted so "missing required"
 *  is decided by the validator, never by an empty string sneaking through. */
export function compactPsdAnswers(draft: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(draft)) {
    if (Array.isArray(v)) { const arr = v.map(String).filter((s) => s.trim() !== ""); if (arr.length > 0) out[k] = arr; }
    else if (typeof v === "string" && v.trim() !== "") out[k] = v;
  }
  return out;
}
