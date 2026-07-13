// packageEntitlement — single source of truth for the AUTHORITATIVE package
// entitlement patch written onto an order.
// RA-DOCUMENT-WORKFLOW-PORTALS-CONSISTENCY-001 (2026-07-11).
//
// Root-cause fix consolidation: package entitlement (package_key / billing_plan /
// includes_reasonable_accommodation_letter / package_display_name) used to be
// stamped ONLY by stripe-webhook. The webhook loses the reconciliation race to
// the frontend / check-payment-status fallback (and never fires in TEST), so
// combo orders silently saved as Standard and were offered the paid $70 add-on.
//
// The fix stamps entitlement at CHECKOUT-SETUP time from the SERVER-VALIDATED
// packageKey (create-payment-intent for cards, create-checkout-session for
// Klarna) — NEVER inferred from price. Every reconciliation path (webhook,
// check-payment-status) then only confirms payment status; none can downgrade a
// combo.

export const PACKAGE_DISPLAY_NAMES: Record<string, string> = {
  esa_standard: "ESA Letter",
  esa_ra_bundle: "ESA + Reasonable Accommodation Letter",
  psd_standard: "PSD Documentation",
  psd_ra_bundle: "PSD + Reasonable Accommodation Letter",
};

export function isRaBundleKey(packageKey: string): boolean {
  return packageKey === "esa_ra_bundle" || packageKey === "psd_ra_bundle";
}

/**
 * Build the authoritative order patch for a validated packageKey + billing plan.
 * Standard → includes_reasonable_accommodation_letter=false; RA bundle → true
 * (and additional_documentation_required=true, matching the webhook). This is the
 * ONLY place the entitlement patch shape is defined.
 */
export function packageEntitlementPatch(
  packageKey: string,
  billingPlan: "one_time" | "annual",
): Record<string, unknown> {
  const isRa = isRaBundleKey(packageKey);
  const patch: Record<string, unknown> = {
    package_key: packageKey,
    package_display_name: PACKAGE_DISPLAY_NAMES[packageKey] ?? "",
    billing_plan: billingPlan,
    includes_reasonable_accommodation_letter: isRa,
  };
  if (isRa) patch.additional_documentation_required = true;
  return patch;
}
