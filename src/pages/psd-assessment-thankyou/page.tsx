import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { fireMetaPurchase, fireLead } from "@/lib/metaPixel";
import { fireMicrosoftPurchase } from "@/lib/microsoftUet";
import { linkSessionToOrder, markPaid, getSessionId } from "@/lib/visitorSession";
import { trackPaymentSuccess, trackRecoveryConversionIfFlagged } from "@/lib/trackEvent";
import { setEnhancedConversionUserData } from "@/lib/googleEnhancedConversions";

interface ThankYouState {
  firstName?: string;
  lastName?: string;
  email?: string;
  selectedProvider?: string;
  pricingPlan?: string;
  planType?: string;
  deliverySpeed?: string;
  price?: number;
  confirmationId?: string;
}

interface PendingOrder extends ThankYouState {
  _step1?: Record<string, unknown>;
  _step2?: Record<string, unknown>;
  _step3Plan?: string;
}

// ── 2026-06-18 THANK-YOU-SOURCE-OF-TRUTH ─────────────────────────────────────
// Safe public order shape returned by the check-payment-status edge function —
// the canonical record (actual amount charged, real plan, real assigned
// provider). Preferred over stale URL params / empty sessionStorage for display.
interface PublicOrder {
  confirmation_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  price?: number | null;
  plan_type?: string | null;
  delivery_speed?: string | null;
  letter_type?: string | null;
  coupon_code?: string | null;
  coupon_discount?: number | null;
  doctor_name?: string | null;
  status?: string | null;
  paid_at?: string | null;
}

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

const GOOGLE_REVIEW_URL = "https://www.google.com/search?sca_esv=0b1c7d926c8058f9&si=AL3DRZEsmMGCryMMFSHJ3StBhOdZ2-6yYkXd_doETEE1OR-qOcgBj58jmxujTZ7byPAw8npggXTcPRI82lkEhuTmamSruv_EA9uwdfELsrB4RPReQ-OPCTj609pZy3sSjc4oz_EHV8no&q=PawTenant+Reviews&sa=X&ved=2ahUKEwjV1eTEsI-VAxWmBtsEHda6N_IQ0bkNegQIIxAF&biw=1536&bih=730&dpr=1.25";

// Format a dollar amount for display. Whole dollars render without decimals
// ($120), fractional amounts keep two places ($89.50).
function formatUSD(n: number): string {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

const GUARANTEE_POINTS = [
  { icon: "ri-shield-check-line", label: "HIPAA Compliant" },
  { icon: "ri-lock-2-line", label: "256-bit SSL Encrypted" },
  { icon: "ri-award-line", label: "Licensed Professionals" },
  { icon: "ri-refund-2-line", label: "Money-Back Guarantee" },
  { icon: "ri-eye-off-line", label: "Confidential & Private" },
];

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;

async function fireGHLPaidLead(order: PendingOrder) {
  try {
    const step2 = (order._step2 ?? {}) as Record<string, unknown>;
    const step1 = (order._step1 ?? {}) as Record<string, unknown>;
    await fetch(GHL_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        webhookType: "assessment",
        firstName: order.firstName,
        lastName: order.lastName,
        email: order.email,
        phone: step2.phone ?? "",
        dateOfBirth: step2.dob ?? "",
        state: step2.state ?? "",
        leadStatus: "Paid – PSD Order Completed",
        confirmationId: order.confirmationId,
        orderTotal: order.price,
        deliverySpeed: order.deliverySpeed,
        selectedProvider: order.selectedProvider,
        pricingPlan: order.pricingPlan,
        planType: order.planType,
        letterType: "psd",
        dogTasks: Array.isArray(step1.dogTasks) ? (step1.dogTasks as string[]).join(", ") : "",
        mentalHealthConditions: Array.isArray(step1.conditions) ? (step1.conditions as string[]).join(", ") : "",
        leadSource: "PSD Assessment Form – Stripe Payment Success",
        submittedAt: new Date().toISOString(),
        tags: ["PSD Assessment", "Paid Customer", "PSD Letter"],
      }),
    });
  } catch {
    // Silently fail
  }
}

export default function PSDAssessmentThankYouPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locationState = (location.state as ThankYouState) ?? {};
  const [copied, setCopied] = useState(false);
  const paymentIntentParam = searchParams.get("payment_intent");
  const stripeSessionId = searchParams.get("session_id");
  const urlAmount = searchParams.get("amount");
  const urlOrderId = searchParams.get("order_id");
  const gtagConversionFired = useRef(false);

  const [resolvedState, setResolvedState] = useState<ThankYouState>(() => {
    try {
      const raw = sessionStorage.getItem("esa_pending_order");
      if (raw) return JSON.parse(raw) as PendingOrder;
    } catch { /* fall through */ }
    return locationState;
  });
  const webhookFired = useRef(false);
  const reconcilerFired = useRef(false);

  // Canonical order record fetched from the server (source of truth for the
  // displayed amount, plan, customer, and assigned provider).
  const [dbOrder, setDbOrder] = useState<PublicOrder | null>(null);

  // ── 2026-05-20 KLARNA-RECONCILIATION-SELF-HEAL (PSD thank-you arrival) ──
  // Same reconciliation as the ESA thank-you page. Idempotent on the server —
  // no-op when the order is already paid. We also consume the returned canonical
  // order so PSD shows the real amount/plan/customer instead of $120 defaults.
  useEffect(() => {
    if (reconcilerFired.current) return;
    const cid = urlOrderId || resolvedState.confirmationId || "";
    if (!stripeSessionId && !cid) return;
    reconcilerFired.current = true;
    const payload: { sessionId?: string; confirmationId?: string } = {};
    if (stripeSessionId) payload.sessionId = stripeSessionId;
    if (cid) payload.confirmationId = cid;
    fetch(`${SUPABASE_URL}/functions/v1/check-payment-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify(payload),
    })
      .then((r) => r.json())
      .then((j: { order?: PublicOrder | null }) => {
        if (j && j.order) setDbOrder(j.order);
      })
      .catch(() => { /* fire-and-forget — page still renders from URL/session */ });
  }, [stripeSessionId, urlOrderId]);

  useEffect(() => {
    const directSuccess = sessionStorage.getItem("esa_payment_success") === "true";
    const shouldReadStorage = stripeSessionId || paymentIntentParam || directSuccess;

    if (shouldReadStorage && !webhookFired.current) {
      webhookFired.current = true;
      const raw = sessionStorage.getItem("esa_pending_order");
      if (raw) {
        try {
          const order = JSON.parse(raw) as PendingOrder;
          setResolvedState(order);
          sessionStorage.removeItem("esa_pending_order");
          sessionStorage.removeItem("esa_payment_success");

          if (!directSuccess) {
            fireMetaPurchase({ value: order.price ?? 0, confirmationId: order.confirmationId ?? '', email: order.email, contentName: 'PSD Letter' });
            // Microsoft Ads (Bing/Yahoo/AOL) purchase — redirect path. Guarded + deduped (no-op on TEST).
            {
              const msStep2 = ((order as PendingOrder)._step2 ?? {}) as Record<string, unknown>;
              fireMicrosoftPurchase({ value: order.price ?? 0, confirmationId: order.confirmationId ?? '', email: order.email, phone: typeof msStep2.phone === "string" ? msStep2.phone : null });
            }
            // Phase-1: dedup-safe Lead via shared event_id `lead_<sessionId>`.
            {
              let sid: string | null = null;
              try { sid = getSessionId(); } catch { sid = null; }
              fireLead({ sessionId: sid ?? undefined, email: order.email ?? undefined });
            }
            try {
              if (order.confirmationId) {
                linkSessionToOrder(order.confirmationId);
                markPaid();
                trackPaymentSuccess(order.confirmationId, {
                  price: order.price ?? 0,
                  user_email: order.email ?? null,
                  letter_type: "psd",
                  arrival: "redirect",
                });
                trackRecoveryConversionIfFlagged(order.confirmationId, {
                  price: order.price ?? 0,
                  letter_type: "psd",
                  arrival: "redirect",
                });
              }
            } catch { /* never block thank-you render */ }
            fireGHLPaidLead(order);
          }
        } catch { /* silent */ }
      }
    }
  }, [stripeSessionId, paymentIntentParam]);

  // ── Canonical display values ──────────────────────────────────────────────
  // Source-of-truth priority: live order record from check-payment-status
  // (dbOrder) → navigate state (resolvedState) → safe default. PSD checkout does
  // not populate sessionStorage, so without the DB record every field would fall
  // back to a $120 / Priority default — which was the wrong-amount/plan bug.
  const firstName = dbOrder?.first_name || resolvedState.firstName || "there";
  const lastName = dbOrder?.last_name || resolvedState.lastName || "";
  const fullName = [firstName === "there" ? "" : firstName, lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const email = dbOrder?.email || resolvedState.email || "";
  const planType = dbOrder?.plan_type || resolvedState.planType || "One-Time Purchase";
  const deliverySpeed = dbOrder?.delivery_speed || resolvedState.deliverySpeed || "24h";

  // Amount paid: DB order price → URL ?amount= → session → base default.
  const price = dbOrder?.price ?? (urlAmount ? parseFloat(urlAmount) : (resolvedState.price ?? 120));
  const priceStr = formatUSD(price);

  // Provider shown ONLY when actually assigned (doctor_name set after pickup).
  const assignedProvider = (dbOrder?.doctor_name || "").trim();
  const hasProvider = assignedProvider.length > 0;

  // Labels derived from the canonical delivery_speed / plan_type. Handles every
  // stored variant ("24h", "24hours", "priority", "2-3days", "standard").
  const isPriority = /^24/.test(deliverySpeed) || deliverySpeed === "priority";
  const isSubscription = planType.toLowerCase().includes("subscription");
  const speedLabel = isPriority ? "Priority" : "Standard";
  const pricingPlan = isSubscription
    ? `Annual Subscription (${priceStr})`
    : `${speedLabel} (${priceStr})`;
  const deliveryLabel = isSubscription
    ? "Annual Subscription"
    : isPriority
      ? "Within 24 Hours"
      : "Within 2–3 Business Days";
  const deliveryShort = isPriority ? "24 hours" : "2–3 business days";

  // ── 2026-05-20 KLARNA-PHANTOM-ORDER-ID-FIX (PSD parity with ESA) ─────────
  // Same fix as src/pages/assessment-thankyou/page.tsx: prefer URL
  // `?order_id=` (set by create-checkout-session for every Stripe Checkout
  // Session) over the legacy phantom fallback. The fabricated
  // `PT-PSD${Date.now()}` default produced phantom IDs that did not exist
  // in the database after a cross-tab Klarna redirect where sessionStorage
  // is empty. Empty string here renders a calm "Processing" state.
  const confirmationId = urlOrderId || dbOrder?.confirmation_id || resolvedState.confirmationId || "";
  const hasConfirmationId = confirmationId.length > 0;

  const shareUrl = "https://pawtenant.com/psd-assessment";
  const shareText = "I just got my Psychiatric Service Dog letter through PawTenant — fast, professional, and ADA-compliant. Check them out if you need a PSD letter!";

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const shareLinks = [
    {
      label: "WhatsApp",
      icon: "ri-whatsapp-line",
      color: "bg-[#25D366] hover:bg-[#1ebe5c] text-white",
      href: `https://wa.me/?text=${encodeURIComponent(shareText + " " + shareUrl)}`,
    },
    {
      label: "Facebook",
      icon: "ri-facebook-fill",
      color: "bg-[#1877F2] hover:bg-[#1468d6] text-white",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: "X / Twitter",
      icon: "ri-twitter-x-line",
      color: "bg-gray-900 hover:bg-black text-white",
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: "Email",
      icon: "ri-mail-send-line",
      color: "bg-gray-600 hover:bg-gray-700 text-white",
      href: `mailto:?subject=Get%20Your%20PSD%20Letter%20%E2%80%94%20PawTenant&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`,
    },
  ];

  useEffect(() => {
    if (gtagConversionFired.current) return;

    // Read params directly from window.location so they're always fresh
    // (avoids stale closure over urlAmount / urlOrderId)
    const params = new URLSearchParams(window.location.search);
    const rawAmount = params.get("amount");
    const rawOrderId = params.get("order_id");
    const conversionValue = rawAmount ? parseFloat(rawAmount) : price;
    const transactionId = rawOrderId ?? confirmationId;

    console.log("[PSD Thank-You] Conversion params:", { rawAmount, rawOrderId, conversionValue, transactionId });

    fireMetaPurchase({ value: conversionValue, confirmationId: transactionId, email: resolvedState.email, contentName: 'PSD Letter' });
    // Microsoft Ads (Bing/Yahoo/AOL) purchase — inline-card path. Guarded + deduped (no-op on TEST).
    {
      const msStep2 = ((resolvedState as PendingOrder)._step2 ?? {}) as Record<string, unknown>;
      fireMicrosoftPurchase({ value: conversionValue, confirmationId: transactionId, email: resolvedState.email, phone: typeof msStep2.phone === "string" ? msStep2.phone : null });
    }

    // Phase 1 analytics: stitch session → order on inline-card arrival.
    try {
      if (transactionId) {
        linkSessionToOrder(transactionId);
        markPaid();
        trackPaymentSuccess(transactionId, {
          price: conversionValue,
          user_email: resolvedState.email ?? null,
          letter_type: "psd",
          arrival: "inline",
        });
        trackRecoveryConversionIfFlagged(transactionId, {
          price: conversionValue,
          letter_type: "psd",
          arrival: "inline",
        });
      }
    } catch { /* never block thank-you render */ }

    // Google Ads: try immediately, then poll every 100 ms for up to 10 s
    // gtag.js loads asynchronously — on SPA navigations it may not be ready at mount
    const fireGtag = () => {
      if (typeof window.gtag !== "function") return false;
      // Enhanced Conversions: set identity user_data BEFORE the conversion
      // event. Identity-only — no PSD/medical/provider/pet data.
      const pendingForEC = resolvedState as PendingOrder;
      const step2PSD = (pendingForEC._step2 ?? {}) as Record<string, unknown>;
      setEnhancedConversionUserData({
        email: resolvedState.email,
        phone: typeof step2PSD.phone === "string" ? step2PSD.phone : null,
        firstName: resolvedState.firstName,
        lastName: resolvedState.lastName,
        country: "US",
      });
      window.gtag("event", "conversion", {
        send_to: "AW-11509262282/paT2CKzfsJEcEMrPhfAq",
        value: conversionValue,
        currency: "USD",
        transaction_id: transactionId,
      });
      gtagConversionFired.current = true;
      console.log("[PSD Thank-You] Google Ads conversion fired ✓", { conversionValue, transactionId });
      return true;
    };

    // After gtag fires, mark google_tag_fired=true on the order so the backend
    // uploadClickConversions skips this order (prevents double-counting).
    const markGoogleTagFired = (txId: string) => {
      if (!txId) return;
      Promise.resolve(
        supabase
          .from("orders")
          .update({ google_tag_fired: true })
          .eq("confirmation_id", txId)
      )
        .then(() => {
          console.log("[PSD Thank-You] google_tag_fired=true set for", txId);
        })
        .catch(() => {
          // Non-critical — silently ignore
        });
    };

    if (fireGtag()) {
      markGoogleTagFired(transactionId);
    } else {
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds at 100 ms intervals
      const interval = setInterval(() => {
        attempts += 1;
        if (fireGtag()) {
          markGoogleTagFired(transactionId);
          clearInterval(interval);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          console.warn("[PSD Thank-You] gtag not available after 10 s — conversion skipped");
        }
      }, 100);
      return () => clearInterval(interval);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nextSteps = [
    {
      step: "01",
      icon: "ri-checkbox-circle-line",
      title: "Payment Confirmed",
      desc: `Your payment of ${priceStr} was processed successfully. You'll receive a receipt at ${email || "your email"}.`,
      done: true,
    },
    {
      step: "02",
      icon: "ri-stethoscope-line",
      title: "Evaluation In Progress",
      desc: `${hasProvider ? assignedProvider : "A licensed provider"} will review your assessment, consider your dog's trained tasks, and complete your PSD evaluation.`,
      done: false,
    },
    {
      step: "03",
      icon: "ri-service-line",
      title: `PSD Letter Delivered — ${deliveryLabel}`,
      desc: `Your PSD documentation will be emailed to ${email || "you"} once your licensed provider completes the evaluation.`,
      done: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-white to-orange-50">
      <title>PSD Letter Order Confirmed — PawTenant</title>
      <meta name="robots" content="noindex, nofollow" />

      {/* Minimal Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <img
            src="/assets/brand/pawtenant-logo-black-02.png"
            alt="PawTenant"
            className="h-10 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-4">
          <a
            href="tel:+14099655885"
            className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-amber-600 transition-colors cursor-pointer"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-phone-line text-amber-500"></i>
            </div>
            (409) 965-5885
          </a>
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
            <i className="ri-checkbox-circle-line text-green-500 text-xs"></i>
            <span className="text-xs font-semibold text-green-700">Payment Confirmed</span>
          </div>
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
        {/* ── Success Header ── */}
        <div className="text-center mb-10">
          {/* PSD Badge */}
          <div className="inline-flex items-center gap-2 bg-amber-100 border border-amber-300 rounded-full px-4 py-1.5 mb-5">
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-service-line text-amber-600 text-sm"></i>
            </div>
            <span className="text-xs font-extrabold text-amber-700 uppercase tracking-widest">Psychiatric Service Dog Letter</span>
          </div>

          <div className="w-20 h-20 flex items-center justify-center bg-green-100 rounded-full mx-auto mb-5">
            <i className="ri-checkbox-circle-fill text-green-500 text-4xl"></i>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            You&apos;re All Set, {firstName}!
          </h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
            Payment received. Your PSD evaluation is now underway. Your documentation will be delivered{" "}
            <strong className="text-gray-700">{deliveryShort}</strong>.
          </p>
        </div>

        {/* ── Customer Portal CTA — verified customers land straight in their
            portal; anyone without a session is routed to secure login by the
            /my-orders guard. ── */}
        <div className="mb-8 bg-[#0f1e1a] rounded-2xl p-6 sm:p-7 text-center">
          <div className="w-11 h-11 mx-auto flex items-center justify-center bg-white/10 rounded-xl mb-3">
            <i className="ri-user-star-line text-white text-xl"></i>
          </div>
          <p className="text-white font-extrabold text-lg mb-1">Your customer portal is ready</p>
          <p className="text-white/60 text-sm mb-4 max-w-sm mx-auto leading-relaxed">
            Track your order status and download your PSD letter the moment it&apos;s issued.
          </p>
          <button
            type="button"
            onClick={() => navigate("/my-orders")}
            className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3.5 bg-amber-600 text-white font-bold text-sm rounded-xl hover:bg-amber-700 active:bg-amber-800 transition-colors cursor-pointer"
          >
            <i className="ri-arrow-right-line"></i>
            Go to My Portal
          </button>
        </div>

        {/* ── ADA Notice Banner ── */}
        <div className="bg-amber-600 text-white rounded-2xl px-5 py-4 mb-8 flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-amber-500 rounded-lg flex-shrink-0 mt-0.5">
            <i className="ri-information-line text-white text-base"></i>
          </div>
          <div>
            <p className="text-sm font-extrabold mb-0.5">About Your PSD Documentation</p>
            <p className="text-xs text-amber-100 leading-relaxed">
              Your letter documents your licensed provider&apos;s evaluation in connection with the <strong>Americans with Disabilities Act (ADA)</strong>. Under the ADA, a service dog&apos;s access depends on the dog being individually trained to perform tasks for a disability — not on any letter, ID, or registration. This is separate from housing (Fair Housing Act / ESA).
            </p>
          </div>
        </div>

        {/* ── Confirmation Card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-6 pb-5 border-b border-gray-100">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">Order ID</p>
              {hasConfirmationId ? (
                <p className="text-sm font-bold text-gray-800 font-mono">{confirmationId}</p>
              ) : (
                <p className="text-sm font-bold text-gray-500 italic">Processing — your order ID will be emailed shortly</p>
              )}
            </div>
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <i className="ri-checkbox-circle-line text-green-500 text-sm"></i>
              <span className="text-xs font-semibold text-green-700">Payment Successful</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {fullName && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                  <i className="ri-user-3-line text-amber-500 text-base"></i>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Name</p>
                  <p className="text-sm font-semibold text-gray-800 break-words">{fullName}</p>
                </div>
              </div>
            )}
            {email && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                  <i className="ri-mail-line text-amber-500 text-base"></i>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Email</p>
                  <p className="text-sm font-semibold text-gray-800 break-words">{email}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                <i className="ri-price-tag-3-line text-amber-500 text-base"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium mb-0.5">Plan Purchased</p>
                <p className="text-sm font-semibold text-gray-800">{pricingPlan}</p>
                <p className="text-xs text-gray-400 mt-0.5">{planType}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                <i className="ri-bank-card-line text-amber-500 text-base"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium mb-0.5">Amount Paid</p>
                <p className="text-sm font-semibold text-gray-800">{priceStr}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                <i className="ri-timer-flash-line text-amber-500 text-base"></i>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400 font-medium mb-0.5">Estimated Delivery</p>
                <p className="text-sm font-semibold text-gray-800">{deliveryLabel}</p>
              </div>
            </div>
            {hasProvider && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                  <i className="ri-user-heart-line text-amber-500 text-base"></i>
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Assigned Provider</p>
                  <p className="text-sm font-semibold text-gray-800">{assignedProvider}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── What Happens Next ── */}
        <div className="mb-8">
          <h2 className="text-lg font-extrabold text-gray-900 mb-5 text-center">What Happens Next?</h2>
          <div className="flex flex-col gap-4">
            {nextSteps.map((item) => (
              <div
                key={item.step}
                className={`bg-white rounded-xl border p-5 flex gap-4 items-start ${item.done ? "border-green-200 bg-green-50/40" : "border-gray-100"}`}
              >
                <div className="flex-shrink-0">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${item.done ? "bg-green-100" : "bg-amber-100"}`}>
                    <i className={`${item.icon} text-lg ${item.done ? "text-green-500" : "text-amber-600"}`}></i>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-bold ${item.done ? "text-green-400" : "text-amber-500"}`}>{item.step}</span>
                    <p className="text-sm font-bold text-gray-800">{item.title}</p>
                    {item.done && (
                      <span className="text-xs font-bold text-green-600 bg-green-100 rounded-full px-2 py-0.5 whitespace-nowrap">Done</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Service Dog Access — informational, compliance-safe ── */}
        <div className="bg-white rounded-2xl border border-amber-100 p-6 sm:p-8 mb-8">
          <h3 className="text-base font-extrabold text-gray-900 mb-4 flex items-center gap-2">
            <div className="w-6 h-6 flex items-center justify-center"><i className="ri-shield-star-line text-amber-500"></i></div>
            Service Dog Access — What the ADA Covers
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: "ri-store-2-line", title: "Public Places", desc: "Trained service dogs are generally permitted in stores, restaurants, and other public spaces." },
              { icon: "ri-flight-takeoff-line", title: "Air Travel", desc: "Air travel is governed by the DOT, not the ADA. Airlines have their own service-dog forms — check with your airline before you fly." },
              { icon: "ri-hotel-line", title: "Hotels & Lodging", desc: "Hotels and other public accommodations generally may not deny access to a trained service dog." },
              { icon: "ri-building-line", title: "Workplace", desc: "Employers are required to consider reasonable accommodation requests; workplace rules differ from public-access rules." },
            ].map((r) => (
              <div key={r.title} className="flex items-start gap-3 bg-amber-50/60 rounded-xl px-4 py-3">
                <div className="w-8 h-8 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                  <i className={`${r.icon} text-amber-600 text-sm`}></i>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-800 mb-0.5">{r.title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 leading-relaxed mt-4">
            The ADA does not require service dogs to be certified, registered, or to wear ID, and staff may ask only whether the dog is a service animal and what task it performs. Your letter documents your provider&apos;s evaluation — it does not by itself guarantee access, which depends on your dog being individually trained to perform tasks for a disability.
          </p>
        </div>

        {/* ── Google Review Prompt ── */}
        <div className="bg-white rounded-2xl border border-amber-200 p-6 sm:p-8 mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="w-14 h-14 flex items-center justify-center rounded-2xl bg-amber-50 border border-amber-200">
                <i className="ri-google-fill text-3xl text-amber-500"></i>
              </div>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <div key={n} className="w-5 h-5 flex items-center justify-center">
                    <i className="ri-star-fill text-amber-400 text-lg"></i>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-base font-extrabold text-gray-900 mb-1">Happy with PawTenant? Leave us a review!</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                It takes less than 30 seconds and helps other service dog handlers find the support they need.
              </p>
            </div>
            <div className="flex-shrink-0">
              <a
                href={GOOGLE_REVIEW_URL}
                target="_blank"
                rel="nofollow noreferrer"
                className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-sm rounded-xl transition-colors cursor-pointer"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-star-smile-line"></i>
                </div>
                Write a Review
              </a>
            </div>
          </div>
        </div>

        {/* ── Social Share ── */}
        <div className="bg-white rounded-2xl border border-amber-100 p-6 sm:p-8 mb-8">
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-amber-100 rounded-xl">
              <i className="ri-share-circle-line text-amber-500 text-2xl"></i>
            </div>
            <div>
              <p className="text-base font-extrabold text-gray-900 leading-tight mb-1">Know someone who needs a PSD letter?</p>
              <p className="text-sm text-gray-500 leading-relaxed">
                Share PawTenant with fellow service dog handlers who need an ADA-compliant PSD letter from a licensed provider.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 mb-4">
            {shareLinks.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="nofollow noreferrer"
                className={`whitespace-nowrap inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer ${s.color}`}
              >
                <div className="w-4 h-4 flex items-center justify-center"><i className={s.icon}></i></div>
                {s.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
            <i className="ri-link text-gray-400 text-sm flex-shrink-0"></i>
            <span className="text-sm text-gray-500 flex-1 truncate">{shareUrl}</span>
            <button
              type="button"
              onClick={handleCopyLink}
              className={`whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                copied ? "bg-green-100 text-green-700" : "bg-amber-500 hover:bg-amber-600 text-white"
              }`}
            >
              <div className="w-3.5 h-3.5 flex items-center justify-center">
                <i className={copied ? "ri-checkbox-circle-line" : "ri-clipboard-line"}></i>
              </div>
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>

        {/* ── Contact Strip ── */}
        <div className="bg-amber-600 rounded-2xl p-6 sm:p-8 mb-8 text-white text-center">
          <p className="font-bold text-base mb-1">Questions about your PSD order?</p>
          <p className="text-amber-100 text-sm mb-5">Our team is here 7 days a week — reach out and we&apos;ll get back to you fast.</p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <a
              href="tel:+14099655885"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-amber-700 font-bold text-sm rounded-lg hover:bg-amber-50 transition-colors cursor-pointer"
            >
              <div className="w-4 h-4 flex items-center justify-center"><i className="ri-phone-line"></i></div>
              (409) 965-5885
            </a>
            <a
              href="mailto:hello@pawtenant.com"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-amber-500 text-white font-bold text-sm rounded-lg hover:bg-amber-400 transition-colors cursor-pointer"
            >
              <div className="w-4 h-4 flex items-center justify-center"><i className="ri-mail-line"></i></div>
              hello@pawtenant.com
            </a>
          </div>
        </div>

        {/* ── CTA Buttons ── */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
          <Link
            to="/"
            className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-gray-900 text-white font-bold text-sm rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-home-line"></i></div>
            Back to Home
          </Link>
          <Link
            to="/no-risk-guarantee"
            className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white border border-gray-200 text-gray-700 font-bold text-sm rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="w-4 h-4 flex items-center justify-center"><i className="ri-shield-check-line text-amber-500"></i></div>
            Our Money-Back Guarantee
          </Link>
        </div>

        {/* ── Trust Bar ── */}
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-xs text-gray-400 border-t border-gray-100 pt-6">
          {GUARANTEE_POINTS.map((g) => (
            <div key={g.label} className="flex items-center gap-1.5">
              <div className="w-4 h-4 flex items-center justify-center">
                <i className={`${g.icon} text-amber-400`}></i>
              </div>
              {g.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
