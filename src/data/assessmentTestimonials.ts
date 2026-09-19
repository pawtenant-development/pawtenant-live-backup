/**
 * Assessment reassurance testimonials — ASSESSMENT-PRESENTATION-TRUST-001.
 *
 * ⚠️  EVERY record in this file is a TEST PLACEHOLDER. None of them is a real
 *     customer, a real quote, a real name, or a real location. They exist so the
 *     assessment layout can be reviewed on TEST with realistic text volume.
 *
 * They are marked `placeholder: true` and are rendered ONLY when
 * isPlaceholderContentAllowed() is true (TEST Supabase project). The build guard
 * scripts/check-assessment-presentation.mjs fails a non-TEST production build
 * that still contains placeholder records.
 *
 * LIVE ROLLOUT REQUIREMENT (do NOT skip):
 *   Replace this array with VERIFIED PawTenant reviews only. Each shipped record
 *   must carry documented provenance in `sourceNote` — where the review was
 *   collected, when, and the customer's consent to publish — and must set
 *   `placeholder: false`. Do not invent names, photos, locations, ratings or
 *   quotes, and do not paraphrase a real review into a stronger claim than the
 *   customer made.
 *
 * Copy rules these records must keep obeying (see the refund-guarantee guard):
 *   • no promise that a letter is guaranteed to be accepted;
 *   • no claim that a landlord cannot deny a letter;
 *   • no "instant"/"guaranteed" approval language;
 *   • no clinical outcome promises.
 */

export interface AssessmentTestimonial {
  id: string;
  /** TRUE = synthetic TEST content. Must be false for anything shipped to LIVE. */
  placeholder: boolean;
  /** Display name. For placeholders this is deliberately obviously fake. */
  name: string;
  /** Short context line (e.g. "Renting with a no-pet policy"). */
  context: string;
  quote: string;
  /** Provenance for verified reviews. Placeholders say so explicitly. */
  sourceNote: string;
}

export const ASSESSMENT_TESTIMONIALS: AssessmentTestimonial[] = [
  {
    id: "placeholder-1",
    placeholder: true,
    name: "TEST PLACEHOLDER — not a real customer",
    context: "Sample copy for layout review only",
    quote:
      "The questions were straightforward and I could tell a real person would be reading my answers. It did not feel like a form designed to sell me something.",
    sourceNote: "SYNTHETIC PLACEHOLDER — written for TEST layout review. Not a customer review.",
  },
  {
    id: "placeholder-2",
    placeholder: true,
    name: "TEST PLACEHOLDER — not a real customer",
    context: "Sample copy for layout review only",
    quote:
      "I appreciated being told up front that approval depends on the clinical evaluation. The process was clear about what would happen at each step.",
    sourceNote: "SYNTHETIC PLACEHOLDER — written for TEST layout review. Not a customer review.",
  },
];

/** Records safe to render in the current environment. */
export function visibleTestimonials(
  allowPlaceholders: boolean,
  all: AssessmentTestimonial[] = ASSESSMENT_TESTIMONIALS,
): AssessmentTestimonial[] {
  return all.filter((t) => !t.placeholder || allowPlaceholders);
}
