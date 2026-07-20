// POST-OTP-DIRECT-CHECKOUT-001 — centralized post-OTP funnel routing switch.
//
//   "direct_checkout_v1"  → OTP verified → Secure Checkout (pay) directly.
//                           The AssuranceScreen and PackageSelectionStep are NOT
//                           auto-shown after OTP. PackageSelectionStep stays fully
//                           reachable through the checkout "Change package" control.
//   "legacy_post_otp_flow" → OTP verified → Assurance → Package → Pay (prior flow).
//
// TEST default = direct_checkout_v1.
//
// Rollback WITHOUT reverting code (either mechanism works):
//   • build-time default flip:  set env  VITE_POST_OTP_FLOW=legacy
//   • per-session override:      append  ?postOtpFlow=legacy   to the URL
//   • ?postOtpFlow=direct forces the new flow even when the env default is legacy.
//
// This mirrors the existing `?step1=v1` kill-switch convention (assessment page).

export type PostOtpFlow = "direct_checkout_v1" | "legacy_post_otp_flow";

/** Analytics labels for the privacy-safe `flow_version` event property. */
export const FLOW_VERSION_DIRECT = "post_otp_direct_checkout_v1";
export const FLOW_VERSION_LEGACY = "legacy_post_otp_flow";

function readUrlOverride(search?: string): PostOtpFlow | null {
  try {
    const raw = new URLSearchParams(
      search ?? (typeof window !== "undefined" ? window.location.search : ""),
    ).get("postOtpFlow");
    const v = (raw ?? "").toLowerCase();
    if (v === "legacy" || v === "legacy_post_otp_flow") return "legacy_post_otp_flow";
    if (v === "direct" || v === "direct_checkout_v1") return "direct_checkout_v1";
  } catch {
    /* SSR / no window — fall through to env default */
  }
  return null;
}

/** Resolve the active post-OTP flow (URL override wins over env default). */
export function getPostOtpFlow(search?: string): PostOtpFlow {
  const override = readUrlOverride(search);
  if (override) return override;
  const env = (import.meta.env.VITE_POST_OTP_FLOW ?? "").toString().toLowerCase();
  if (env === "legacy" || env === "legacy_post_otp_flow") return "legacy_post_otp_flow";
  return "direct_checkout_v1"; // default: new direct-to-checkout flow
}

/** True when verified customers should land directly on the checkout pay gate. */
export function isDirectCheckout(search?: string): boolean {
  return getPostOtpFlow(search) === "direct_checkout_v1";
}

/** Privacy-safe `flow_version` value for analytics on the active flow. */
export function flowVersionProp(search?: string): string {
  return isDirectCheckout(search) ? FLOW_VERSION_DIRECT : FLOW_VERSION_LEGACY;
}
