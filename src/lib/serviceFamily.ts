/**
 * ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001 — the client mirror of
 * `public.classify_order_service_family(...)` and of the edge-function copy in
 * `supabase/functions/_shared/serviceFamily.ts`.
 *
 * THREE COPIES, ONE CONTRACT. The database owns the decision — nothing here can
 * admit an order the server excluded, and nothing here writes. These functions
 * exist so admin and portal SURFACES can stop offering 30-day controls and stop
 * projecting 30-day state for a product the rule does not cover. The guard
 * script transpiles and executes all three against the same fixture table, so
 * they cannot drift.
 *
 * THE CONTRACT (deliberately asymmetric):
 *
 *     any PSD evidence  -> "psd"      — wins over any ESA evidence
 *     otherwise ESA     -> "esa"
 *     otherwise         -> "unknown"
 *
 * Only "esa" is ever eligible for the 30-day official-letter workflow, so PSD
 * AND unknown both fail closed. TEST holds a real contradiction row
 * (letter_type='psd' with package_key='esa_standard' and
 * package_display_name='ESA Letter'); the asymmetry reads it as PSD, which is
 * the safe reading — a wrongly-excluded ESA order is a missing reminder, a
 * wrongly-included PSD order is a false clinical obligation and two wrong emails.
 *
 * NEVER `confirmation_id`. The portal's own `isPSD()` display helpers accept an
 * id-substring fallback for LABELLING; a lifecycle rule may not. An order id is
 * a display reference, not a product record.
 */

export type ServiceFamily = "esa" | "psd" | "unknown";

/** The `orders` columns every 30-day decision must select. */
export const SERVICE_FAMILY_COLUMNS = [
  "letter_type",
  "package_key",
  "package_display_name",
  "plan_type",
] as const;

export interface ServiceFamilyFields {
  letter_type?: string | null;
  package_key?: string | null;
  package_display_name?: string | null;
  plan_type?: string | null;
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

/** PURE. Four authoritative product fields in, one family out. */
export function classifyServiceFamily(o: ServiceFamilyFields): ServiceFamily {
  const lt = norm(o.letter_type);
  const pk = norm(o.package_key);
  const pdn = norm(o.package_display_name);
  const pt = norm(o.plan_type);

  if (
    lt.startsWith("psd") || pk.startsWith("psd") || pdn.startsWith("psd") || pt.startsWith("psd")
    || pdn.includes("psychiatric service dog") || pt.includes("psychiatric service dog")
  ) return "psd";

  if (
    lt.startsWith("esa") || pk.startsWith("esa") || pdn.startsWith("esa")
    || pdn.includes("emotional support animal") || pt.includes("emotional support animal")
  ) return "esa";

  return "unknown";
}

/** The 30-day official-letter PRODUCT gate. ESA only — nothing else, ever. */
export function isEsaThirtyDayProduct(o: ServiceFamilyFields): boolean {
  return classifyServiceFamily(o) === "esa";
}

/**
 * The states whose provider relationship rule drives the official-letter cycle.
 * Mirrors `public.is_thirty_day_official_letter_state()` and COMPLIANCE_STATES
 * in the assessment's StateComplianceBanner.
 */
export const THIRTY_DAY_OFFICIAL_LETTER_STATES = ["AR", "CA", "IA", "LA", "MT"] as const;

export function isThirtyDayOfficialLetterState(state?: string | null): boolean {
  return (THIRTY_DAY_OFFICIAL_LETTER_STATES as readonly string[])
    .includes((state ?? "").trim().toUpperCase());
}

/**
 * The FULL client-side eligibility gate — the mirror of
 * `public.is_official_letter_30_day_eligible(...)`. Product AND state.
 */
export function isOfficialLetter30DayEligible(
  o: ServiceFamilyFields & { state?: string | null },
): boolean {
  return isThirtyDayOfficialLetterState(o.state) && isEsaThirtyDayProduct(o);
}

/**
 * Should a 30-day lifecycle MARKER on this row be believed?
 *
 * A non-ESA order may still be carrying `official_letter_reopened_at` from
 * before the rule was scoped. That timestamp is history and is deliberately not
 * erased, so every projection that reads it must ask this first — otherwise a
 * PSD order keeps rendering as "Reopened" / "Correction required" for a 30-day
 * cycle it was never in.
 */
export function thirtyDayMarkersApply(o: ServiceFamilyFields): boolean {
  return isEsaThirtyDayProduct(o);
}

