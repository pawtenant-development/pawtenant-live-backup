/**
 * Placeholder-content gate — ASSESSMENT-PRESENTATION-TRUST-001.
 *
 * Some content exists ONLY to develop and review a layout on TEST. Synthetic
 * testimonials are the case this module was written for: they are not real
 * customer reviews, so they must never be visible to a real customer.
 *
 * Two independent layers keep them off LIVE, both keyed to this one constant:
 *
 *   1. RUNTIME  — components ask isPlaceholderContentAllowed() before rendering
 *                 anything marked as a placeholder. On LIVE the app talks to the
 *                 LIVE Supabase project, so the answer is false and the content
 *                 does not render even if the data file were copied across.
 *   2. BUILD    — scripts/check-assessment-presentation.mjs fails the build when
 *                 placeholder records exist and the build is NOT pointed at the
 *                 TEST project. LIVE's production build supplies the LIVE
 *                 Supabase URL, so porting placeholder data breaks that build
 *                 instead of shipping silently.
 *
 * Layer 1 alone would fail open if the env var were unset; layer 2 alone would
 * fail open for a runtime env change. Together, placeholder content ships only
 * where it is explicitly allowed.
 *
 * LIVE must replace placeholder testimonials with verified PawTenant reviews
 * carrying documented provenance — never by flipping this gate.
 */

/** Supabase project ref for the TEST environment (pawtenant-test). */
export const TEST_SUPABASE_PROJECT_REF = "opudhofjbydrljgleofq";

/**
 * True only when this build/runtime is pointed at the TEST Supabase project.
 * Anything unset, malformed, or pointed elsewhere (LIVE included) is false —
 * the gate fails CLOSED.
 */
export function isPlaceholderContentAllowed(
  supabaseUrl: string | undefined = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string | undefined,
): boolean {
  if (typeof supabaseUrl !== "string" || supabaseUrl.length === 0) return false;
  return supabaseUrl.includes(TEST_SUPABASE_PROJECT_REF);
}
