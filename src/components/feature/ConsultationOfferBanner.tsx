/**
 * ConsultationOfferBanner — non-intrusive prompt for the unpaid lead
 * recovery funnel. PROTOTYPE — not wired into checkout / assessment by
 * default.
 *
 * Mount this near a checkout / assessment step when the team wants to
 * test the "speak with our care team first" pathway. The banner is:
 *   - dismissible (per-tab via sessionStorage)
 *   - hidden by default if `enabled` is false (so callers can gate it
 *     behind a feature flag, comms_settings toggle, or a config import)
 *   - low-emphasis (calm, no aggressive contrast)
 *   - links to /consultation-request, optionally pre-filling URL params
 *
 * Suggested placements (NONE wired in this commit):
 *   - top of src/pages/assessment/components/Step3Checkout.tsx
 *   - top of src/pages/psd-assessment/components/PSDStep3.tsx (PSD step 3)
 *   - sticky footer on /assessment when no payment activity for N seconds
 *
 * The banner does NOT interrupt payment intent / Stripe flows. It is a
 * passive link only.
 */
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

interface ConsultationOfferBannerProps {
  /** Feature flag — must be true for the banner to render. Default false. */
  enabled?: boolean;
  /** Optional email to prefill the form with. */
  email?: string | null;
  /** Optional order_id to link the resulting consultation request to. */
  orderId?: string | null;
  /** Optional confirmation_number to link the resulting consultation request to. */
  confirmationNumber?: string | null;
  /**
   * Source tag written into consultation_requests.source_context. Defaults
   * to "checkout_prompt"; pass "assessment_prompt" if mounting on an
   * earlier assessment step.
   */
  source?: "checkout_prompt" | "assessment_prompt";
  /**
   * Storage key for dismissal. Defaults per source so two simultaneous
   * mounts (e.g. assessment + checkout) don't share dismissal state.
   */
  dismissKey?: string;
}

const DEFAULT_KEY = "__pt_consultation_offer_dismissed";

function ssGet(key: string): string | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function ssSet(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export default function ConsultationOfferBanner({
  enabled = false,
  email,
  orderId,
  confirmationNumber,
  source = "checkout_prompt",
  dismissKey,
}: ConsultationOfferBannerProps) {
  const effectiveKey = dismissKey ?? `${DEFAULT_KEY}_${source}`;
  const [dismissed, setDismissed] = useState<boolean>(() => ssGet(effectiveKey) === "1");

  const href = useMemo(() => {
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    if (orderId) params.set("order_id", orderId);
    if (confirmationNumber) params.set("confirmation_number", confirmationNumber);
    params.set("source", source);
    const qs = params.toString();
    return qs ? `/consultation-request?${qs}` : "/consultation-request";
  }, [email, orderId, confirmationNumber, source]);

  const handleDismiss = useCallback(() => {
    ssSet(effectiveKey, "1");
    setDismissed(true);
  }, [effectiveKey]);

  if (!enabled || dismissed) return null;

  return (
    <div
      role="complementary"
      aria-label="Consultation window offer"
      className="rounded-xl border border-orange-100 bg-[#fdf8f3] px-4 py-3 flex items-start sm:items-center gap-3"
    >
      <div className="w-9 h-9 flex items-center justify-center rounded-lg bg-white text-orange-500 flex-shrink-0">
        <i className="ri-customer-service-2-line text-lg"></i>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">
          Prefer to speak with our care team first?
        </p>
        <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
          Request a quick consultation window — no payment required to talk
          through your ESA documentation process.
        </p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Link
          to={href}
          className="whitespace-nowrap text-xs px-3 py-1.5 rounded-md bg-orange-500 text-white font-semibold hover:bg-orange-600 cursor-pointer transition-colors"
        >
          Request window
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss consultation offer"
          className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-white hover:text-gray-600 cursor-pointer"
        >
          <i className="ri-close-line"></i>
        </button>
      </div>
    </div>
  );
}
