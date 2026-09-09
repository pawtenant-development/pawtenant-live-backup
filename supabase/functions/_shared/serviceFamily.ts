// ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001 — the edge-function mirror of
// public.classify_order_service_family(...) / public.order_service_family(...).
//
// WHY A MIRROR AND NOT A DB CALL
// The 30-day notification functions are invoked by pg_net from
// reopen_due_official_letter_orders() with a service-role key. They already hold
// a service-role Supabase client, so they COULD call the RPC — but a fail-closed
// gate must not depend on a second round trip that can time out. The gate is
// therefore computed locally from the same four authoritative fields, and the
// guard asserts the two implementations agree on every fixture.
//
// THE CONTRACT (identical to the SQL, deliberately asymmetric):
//
//     any PSD evidence  -> "psd"      — wins over any ESA evidence
//     otherwise ESA     -> "esa"
//     otherwise         -> "unknown"
//
// Only "esa" is ever eligible for the 30-day official-letter workflow, so PSD
// AND unknown both fail closed.
//
// confirmation_id is NEVER read. An order id is a display reference that lands
// in analytics, referrers and support threads; it is not a product record, and
// legacy ids do not carry a product marker reliably.

export type ServiceFamily = "esa" | "psd" | "unknown";

/** The exact `orders` columns this classifier reads. Every caller must SELECT
 *  all four — omitting one silently weakens the classification to "unknown",
 *  which fails closed but would also exclude a genuine ESA order. */
export const SERVICE_FAMILY_COLUMNS =
  "letter_type, package_key, package_display_name, plan_type" as const;

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

  // PSD evidence always wins. Covers "psd", "psd-consultation", "psd_standard",
  // "psd_ra_bundle", "PSD Documentation", "PSD + Reasonable Accommodation
  // Letter", "PSD Consultation" and any future psd-prefixed value.
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

/** The 30-day official-letter product gate. ESA only — nothing else, ever. */
export function isEsaThirtyDayProduct(o: ServiceFamilyFields): boolean {
  return classifyServiceFamily(o) === "esa";
}

