import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { fireMetaPurchase, fireLead } from "@/lib/metaPixel";
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

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

// fireMetaPurchase and fireLead are imported from @/lib/metaPixel

const GOOGLE_REVIEW_URL = "https://g.page/r/YOUR_GOOGLE_PLACE_ID/review";

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

// ── REMOVED: raw orders.insert() from the thank-you page ─────────────────────
// Previously this function called supabase.from("orders").insert({...}) with
// payment_intent_id: null and status: "processing" for redirect-based payments.
// That caused two serious problems:
//   1. When the lead row already existed (normal case), the insert violated
//      the unique constraint on confirmation_id and failed silently.
//   2. When sessionStorage held a stale/different confirmationId, it CREATED
//      a ghost duplicate row that the webhook could never reconcile because
//      status was already "processing" but payment_intent_id was null.
//
// The thank-you page must not write to the orders table. Authority:
//   • Inline card path  → assessment/page.tsx → saveOrderToSupabase() writes
//     via the get-resume-order edge function BEFORE navigating here.
//   • Klarna / Amazon Pay / Checkout Session path → stripe-webhook handles
//     checkout.session.completed (sync) and async_payment_succeeded (async)
//     and calls markOrderProcessing on the existing lead row.
//
// If the webhook hasn't fired yet when the user lands here, the row will
// update within a few seconds — do NOT try to race it from the client.

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
        leadStatus: "Paid – Order Completed",
        confirmationId: order.confirmationId,
        orderTotal: order.price,
        deliverySpeed: order.deliverySpeed,
        selectedProvider: order.selectedProvider,
        pricingPlan: order.pricingPlan,
        planType: order.planType,
        numberOfPets: Array.isArray(step2.pets) ? step2.pets.length : 1,
        emotionalFrequency: step1.emotionalFrequency ?? "",
        mentalHealthConditions: Array.isArray(step1.conditions) ? step1.conditions.join(", ") : "",
        hasESA: step1.hasESA ?? "",
        housingType: step1.housingType ?? "",
        leadSource: "ESA Assessment Form – Stripe Payment Success",
        submittedAt: new Date().toISOString(),
        tags: ["ESA Assessment", "Paid Customer", "Stripe Checkout"],
      }),
    });
  } catch {
    // Silently fail — never block the thank-you page
  }
}

// ── Helpful Information While You Wait — calm post-purchase reassurance ─────
// Replaces the previous RenewalUpsellCard. No countdown, no upgrade button,
// no urgency, no price. Pure reassurance + practical guidance for the user
// while their provider review is in progress.
function HelpfulInfoCard({ email, confirmationId }: { email: string; confirmationId: string }) {
  const items = [
    {
      icon: "ri-mail-check-line",
      title: "Check your email for updates",
      desc: `We'll email ${email || "you"} when your licensed provider has reviewed your assessment and when your letter is ready.`,
    },
    {
      icon: "ri-bookmark-3-line",
      title: "Save your order ID",
      desc: `Keep ${confirmationId} handy — you'll use it if you ever need to reach support about this order.`,
    },
    {
      icon: "ri-question-answer-line",
      title: "What if my landlord has questions?",
      desc: "Your letter includes a unique QR verification ID so landlords can confirm authenticity directly — no health information is disclosed.",
    },
    {
      icon: "ri-customer-service-2-line",
      title: "Need help? Contact support",
      desc: "Email hello@pawtenant.com or call (409) 965-5885. Our team is here to answer any questions.",
    },
  ];

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 mb-8">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-[#f0faf7] rounded-xl border border-[#c3e8df]">
          <i className="ri-information-line text-[#1a5c4f] text-2xl"></i>
        </div>
        <div>
          <p className="text-base font-extrabold text-gray-900 mb-1">Helpful Information While You Wait</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            A few quick things to keep in mind while your evaluation is in progress.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.title} className="flex items-start gap-3 bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg flex-shrink-0 ring-1 ring-gray-100">
              <i className={`${item.icon} text-[#1a5c4f] text-base`}></i>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-gray-800 mb-0.5">{item.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Calm renewal reminder — no button, no price, no countdown */}
      <div className="mt-5 pt-5 border-t border-gray-100 flex items-start gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0 ring-1 ring-amber-100">
          <i className="ri-calendar-line text-amber-600 text-base"></i>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          ESA letters are typically valid for <strong className="text-gray-700">12 months</strong>. We&apos;ll remind you before renewal time, so there&apos;s no rush today.
        </p>
      </div>
    </div>
  );
}

// ── Social Share Section (enhanced) ────────────────────────────────────────────
function SocialShareSection({ shareLinks, shareUrl, copied, onCopy }: {
  shareLinks: Array<{ label: string; icon: string; color: string; href: string }>;
  shareUrl: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-orange-100 p-6 sm:p-8 mb-8">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-orange-100 rounded-xl">
          <i className="ri-share-circle-line text-orange-500 text-2xl"></i>
        </div>
        <div>
          <p className="text-base font-extrabold text-gray-900 leading-tight mb-1">
            Know someone who needs an ESA letter?
          </p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Help a friend or family member protect their bond with their pet. Share PawTenant and let them get the same fast, legitimate coverage you just got.
          </p>
        </div>
      </div>

      {/* Share buttons */}
      <div className="flex flex-wrap gap-2.5 mb-4">
        {shareLinks.map((s) => (
          <a
            key={s.label}
            href={s.href}
            target="_blank"
            rel="nofollow noreferrer"
            className={`whitespace-nowrap inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer ${s.color}`}
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className={s.icon}></i>
            </div>
            {s.label}
          </a>
        ))}
      </div>

      {/* Copy link */}
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3">
        <i className="ri-link text-gray-400 text-sm flex-shrink-0"></i>
        <span className="text-sm text-gray-500 flex-1 truncate">{shareUrl}</span>
        <button
          type="button"
          onClick={onCopy}
          className={`whitespace-nowrap flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${copied ? "bg-green-100 text-green-700" : "bg-orange-500 hover:bg-orange-600 text-white"
            }`}
        >
          <div className="w-3.5 h-3.5 flex items-center justify-center">
            <i className={copied ? "ri-checkbox-circle-line" : "ri-clipboard-line"}></i>
          </div>
          {copied ? "Copied!" : "Copy Link"}
        </button>
      </div>
    </div>
  );
}

// ── Create Account Prompt ─────────────────────────────────────────────────────
function CreateAccountPrompt({ email }: { email: string }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [alreadyHasAccount, setAlreadyHasAccount] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    setLoading(true);
    setError("");

    // Use edge function so NO confirmation email is sent — no bounce risk
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-customer-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });

    const json = await res.json() as { ok: boolean; error?: string; userId?: string };

    if (!json.ok) {
      if (json.error === "already_exists") {
        setAlreadyHasAccount(true);
        setLoading(false);
        return;
      }
      setError(json.error ?? "Failed to create account. Please try again.");
      setLoading(false);
      return;
    }

    // Sign in immediately — account is confirmed, no email step needed
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInErr) {
      // Account was created successfully but auto sign-in failed — still show success
      setDone(true);
      return;
    }
    setDone(true);
  };

  if (alreadyHasAccount) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
        <p className="text-sm font-bold text-gray-800 mb-2">Already have an account?</p>
        <p className="text-xs text-gray-500 mb-4">Sign in to track your order and re-download your ESA letter anytime.</p>
        <button
          type="button"
          onClick={() => navigate("/customer-login")}
          className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] cursor-pointer"
        >
          <i className="ri-login-box-line"></i>
          Sign In to My Orders
        </button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-6 mb-8 flex items-start gap-3">
        <div className="w-10 h-10 flex items-center justify-center bg-green-100 rounded-full flex-shrink-0">
          <i className="ri-checkbox-circle-fill text-green-500 text-xl"></i>
        </div>
        <div>
          <p className="text-sm font-bold text-green-800 mb-1">Account created &amp; ready!</p>
          <p className="text-xs text-green-700">You&apos;re signed in. Track your order and re-download your ESA letter anytime.</p>
          <button
            type="button"
            onClick={() => navigate("/my-orders")}
            className="whitespace-nowrap mt-3 inline-flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] cursor-pointer"
          >
            <i className="ri-user-line"></i>
            Go to My Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-orange-100 p-6 sm:p-8 mb-8">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-[#f0faf7] rounded-xl border border-[#c3e8df]">
          <i className="ri-user-heart-line text-[#1a5c4f] text-2xl"></i>
        </div>
        <div>
          <p className="text-base font-extrabold text-gray-900 mb-1">Create a free account to track your order</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Set a password and get instant access to your order status, and re-download your ESA letter anytime — no need to contact support.
          </p>
        </div>
      </div>
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
          <i className="ri-mail-line text-gray-400 text-sm flex-shrink-0"></i>
          <span className="text-sm text-gray-600 truncate">{email}</span>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Choose a password (min. 6 chars)"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#1a5c4f]"
          />
          <button
            type="submit"
            disabled={loading}
            className="whitespace-nowrap w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] transition-colors cursor-pointer disabled:opacity-60"
          >
            {loading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-shield-check-line"></i>}
            {loading ? "Creating..." : "Create Account"}
          </button>
        </div>
        <p className="text-xs text-gray-400">Free forever. No credit card required.</p>
      </form>
    </div>
  );
}

export default function AssessmentThankYouPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const locationState = (location.state as ThankYouState) ?? {};
  const [copied, setCopied] = useState(false);

  // ── URL-param values for Google Ads conversion ────────────────────────────
  // Support ?amount=197.00&order_id=PT-ABC123 for dynamic conversion values
  const urlAmount = searchParams.get("amount");
  const urlOrderId = searchParams.get("order_id");

  // Guard: fire the Google Ads conversion only once per page load
  const gtagConversionFired = useRef(false);

  // Three ways to arrive here:
  // 1. Card payment confirmed inline → esa_payment_success flag in sessionStorage + direct navigate
  // 2. Redirect-based method (Klarna / Amazon Pay) → ?payment_intent=pi_xxx in URL
  // 3. Legacy Stripe Checkout → ?session_id=cs_xxx in URL
  const stripeSessionId = searchParams.get("session_id");
  const paymentIntentParam = searchParams.get("payment_intent");
  const [resolvedState, setResolvedState] = useState<ThankYouState>(() => {
    // Read from sessionStorage synchronously on first render so planType is
    // immediately available — prevents any flash of the renewal upsell card
    // for customers who already purchased a subscription.
    try {
      const raw = sessionStorage.getItem("esa_pending_order");
      if (raw) {
        const parsed = JSON.parse(raw) as PendingOrder;
        return parsed;
      }
    } catch {
      // Malformed storage — fall through to locationState
    }
    return locationState;
  });
  const webhookFired = useRef(false);

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
          // Clear storage so it doesn't re-fire on refresh
          sessionStorage.removeItem("esa_pending_order");
          sessionStorage.removeItem("esa_payment_success");

          // Fire conversion pixels (only for redirect-based arrivals; inline fires in assessment/page.tsx)
          if (!directSuccess) {
            // Enhanced Meta Purchase with eventID + external_id
            fireMetaPurchase({
              value: order.price ?? 0,
              confirmationId: order.confirmationId ?? '',
              email: order.email,
            });
            // Phase-1: dedup-safe Lead via shared event_id `lead_<sessionId>`.
            // Pixel + CAPI fire from the same browser sessionId so Meta dedups
            // even when fireLead() is also called at Step-2 transition.
            {
              let sid: string | null = null;
              try { sid = getSessionId(); } catch { sid = null; }
              fireLead({ sessionId: sid ?? undefined, email: order.email ?? undefined });
            }
            // Mark gtag as already-handled so the bottom useEffect skips it
            gtagConversionFired.current = true;
            if (typeof window.gtag === "function") {
              const convVal = urlAmount ? parseFloat(urlAmount) : (order.price ?? 0);
              const txId = urlOrderId ?? order.confirmationId ?? "";
              // Enhanced Conversions: set identity user_data BEFORE the
              // conversion event so Google can match this purchase to the
              // ad click that drove it. Identity-only — no medical/ESA data.
              const step2Redirect = (order._step2 ?? {}) as Record<string, unknown>;
              setEnhancedConversionUserData({
                email: order.email,
                phone: typeof step2Redirect.phone === "string" ? step2Redirect.phone : null,
                firstName: order.firstName,
                lastName: order.lastName,
                country: "US",
              });
              console.log("[ESA Thank-You] Google Ads conversion (redirect path):", {
                send_to: "AW-11509262282/Va-eCP6ZvpEcEMrPhfAq",
                value: convVal,
                transaction_id: txId,
              });
              window.gtag("event", "conversion", {
                send_to: "AW-11509262282/Va-eCP6ZvpEcEMrPhfAq",
                value: convVal,
                currency: "USD",
                transaction_id: txId,
              });
            }
            // Phase 1 analytics: stitch session → order on paid arrival.
            try {
              if (order.confirmationId) {
                linkSessionToOrder(order.confirmationId);
                markPaid();
                // Phase-3 funnel event — deduped by confirmation_id.
                trackPaymentSuccess(order.confirmationId, {
                  price: convVal,
                  user_email: order.email ?? null,
                  letter_type: "esa",
                  arrival: "redirect",
                });
                trackRecoveryConversionIfFlagged(order.confirmationId, {
                  price: convVal,
                  letter_type: "esa",
                  arrival: "redirect",
                });
              }
            } catch { /* never block thank-you render */ }
            // Order persistence is handled exclusively by the stripe-webhook
            // for redirect-based methods — see note above the removed
            // saveOrderToSupabase() function. Do NOT write from the client.
            fireGHLPaidLead(order);
          }
        } catch {
          // Malformed storage — silently ignore
        }
      }
    }
  }, [stripeSessionId, paymentIntentParam, urlAmount, urlOrderId]);

  // Use URL ?amount= as the authoritative price (actual Stripe charge amount)
  // Fall back to session storage price if URL param is absent
  const urlAmountParsed = urlAmount ? parseFloat(urlAmount) : null;

  const {
    firstName = "there",
    email = "",
    selectedProvider = "your assigned provider",
    planType = "One-Time Purchase",
    deliverySpeed = "2-3days",
    confirmationId = `PT-${Date.now().toString(36).toUpperCase()}`,
  } = resolvedState;

  // Authoritative price: URL param wins over session storage
  const price = urlAmountParsed ?? resolvedState.price ?? 90;

  // Rebuild pricingPlan label from actual price + delivery speed so it's always accurate
  const speedLabel = deliverySpeed === "24hours" ? "Priority" : "Standard";
  const pricingPlan = resolvedState.pricingPlan ?? `${speedLabel} ($${price})`;

  const deliveryLabel = deliverySpeed === "24hours" ? "Within 24 Hours" : "Within 2–3 Business Days";
  const deliveryShort = deliverySpeed === "24hours" ? "24 hours" : "2–3 business days";

  const shareUrl = "https://pawtenant.com/assessment";
  const shareText = "I just got my ESA letter through PawTenant — fast, easy, and totally legit. If you have an emotional support animal, check them out!";

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
      href: `mailto:?subject=Get%20Your%20ESA%20Letter%20Fast%20%E2%80%94%20PawTenant&body=${encodeURIComponent(shareText + "\n\n" + shareUrl)}`,
    },
  ];

  // ── Single authoritative Google Ads ESA Purchase conversion ─────────────
  useEffect(() => {
    if (gtagConversionFired.current) return;

    const params = new URLSearchParams(window.location.search);
    const amount = params.get("amount");
    const orderId = params.get("order_id");

    const conversionValue = amount ? parseFloat(amount) : price;
    const transactionId = orderId ?? confirmationId;

    console.log("[ESA Thank-You] Conversion params:", { amount, orderId, conversionValue, transactionId });

    // Enhanced Meta Purchase with eventID + external_id
    fireMetaPurchase({
      value: conversionValue,
      confirmationId: transactionId,
      email,
    });

    // Phase 1 analytics: stitch session → order on inline-card arrival.
    try {
      if (transactionId) {
        linkSessionToOrder(transactionId);
        markPaid();
        // Phase-3 funnel event — deduped, will no-op if already fired
        // from assessment/page.tsx for this confirmation_id.
        trackPaymentSuccess(transactionId, {
          price: conversionValue,
          user_email: email ?? null,
          letter_type: "esa",
          arrival: "inline",
        });
        trackRecoveryConversionIfFlagged(transactionId, {
          price: conversionValue,
          letter_type: "esa",
          arrival: "inline",
        });
      }
    } catch { /* never block thank-you render */ }

    const fireGtag = (): boolean => {
      if (gtagConversionFired.current) return true; // already fired
      if (typeof window.gtag !== "function") return false;
      gtagConversionFired.current = true;
      // Enhanced Conversions: set identity user_data BEFORE the conversion
      // event so Google can match this purchase to the ad click that drove
      // it. Identity-only fields — no medical/ESA/provider/pet data.
      const pendingForEC = resolvedState as PendingOrder;
      const step2Inline = (pendingForEC._step2 ?? {}) as Record<string, unknown>;
      setEnhancedConversionUserData({
        email,
        phone: typeof step2Inline.phone === "string" ? step2Inline.phone : null,
        firstName: pendingForEC.firstName,
        lastName: pendingForEC.lastName,
        country: "US",
      });
      console.log("[ESA Thank-You] Google Ads conversion fired ✓", {
        send_to: "AW-11509262282/Va-eCP6ZvpEcEMrPhfAq",
        value: conversionValue,
        currency: "USD",
        transaction_id: transactionId,
      });
      window.gtag("event", "conversion", {
        send_to: "AW-11509262282/Va-eCP6ZvpEcEMrPhfAq",
        value: conversionValue,
        currency: "USD",
        transaction_id: transactionId,
      });
      return true;
    };

    // After gtag fires, mark google_tag_fired=true on the order so the backend
    // uploadClickConversions skips this order (prevents double-counting).
    const markGoogleTagFired = (txId: string) => {
      if (!txId) return;
      supabase
        .from("orders")
        .update({ google_tag_fired: true })
        .eq("confirmation_id", txId)
        .then(() => {
          console.log("[ESA Thank-You] google_tag_fired=true set for", txId);
        })
        .catch(() => {
          // Non-critical — silently ignore
        });
    };

    // Try immediately — if gtag is already loaded we're done
    if (fireGtag()) {
      markGoogleTagFired(transactionId);
      return;
    }

    // Otherwise poll every 100 ms for up to 10 seconds (100 attempts)
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (fireGtag()) {
        markGoogleTagFired(transactionId);
        clearInterval(interval);
      } else if (attempts >= 100) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);



  const nextSteps = [
    {
      step: "01",
      icon: "ri-checkbox-circle-line",
      title: "Payment Confirmed",
      desc: `Your payment of $${price} was processed successfully. You'll receive a receipt at ${email || "your email"}.`,
      done: true,
    },
    {
      step: "02",
      icon: "ri-stethoscope-line",
      title: "Evaluation In Progress",
      desc: `${selectedProvider} will review your assessment and complete your licensed evaluation.`,
      done: false,
    },
    {
      step: "03",
      icon: "ri-file-text-line",
      title: `ESA Letter Delivered — ${deliveryLabel}`,
      desc: `Your official, HIPAA-compliant ESA letter will be emailed to ${email || "you"} and is ready to present to any landlord or housing provider.`,
      done: false,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50">
      {/* Prevent search engines from indexing the thank-you page */}
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
            className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-orange-500 transition-colors cursor-pointer"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-phone-line text-orange-500"></i>
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
          <div className="w-20 h-20 flex items-center justify-center bg-green-100 rounded-full mx-auto mb-5">
            <i className="ri-checkbox-circle-fill text-green-500 text-4xl"></i>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            You&apos;re All Set, {firstName}!
          </h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
            Payment received. Your evaluation is now underway and your ESA letter will be delivered in{" "}
            <strong className="text-gray-700">{deliveryShort}</strong>.
          </p>
        </div>

        {/* ── Confirmation Card ── */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8 mb-8">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-6 pb-5 border-b border-gray-100">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">Order ID</p>
              <p className="text-sm font-bold text-gray-800 font-mono">{confirmationId}</p>
            </div>
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
              <i className="ri-checkbox-circle-line text-green-500 text-sm"></i>
              <span className="text-xs font-semibold text-green-700">Payment Successful</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {email && (
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                  <i className="ri-mail-line text-orange-500 text-base"></i>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Letter Delivered To</p>
                  <p className="text-sm font-semibold text-gray-800">{email}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                <i className="ri-user-heart-line text-orange-500 text-base"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Assigned Provider</p>
                <p className="text-sm font-semibold text-gray-800">{selectedProvider}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                <i className="ri-price-tag-3-line text-orange-500 text-base"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Plan Purchased</p>
                <p className="text-sm font-semibold text-gray-800">{pricingPlan}</p>
                <p className="text-xs text-gray-400 mt-0.5">{planType}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                <i className="ri-timer-flash-line text-orange-500 text-base"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Estimated Delivery</p>
                <p className="text-sm font-semibold text-gray-800">{deliveryLabel}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Create Account Prompt ── */}
        {email && <CreateAccountPrompt email={email} />}

        {/* ── Helpful Information While You Wait — calm post-purchase reassurance ── */}
        <HelpfulInfoCard email={email} confirmationId={confirmationId} />

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
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl ${item.done ? "bg-green-100" : "bg-orange-100"}`}>
                    <i className={`${item.icon} text-lg ${item.done ? "text-green-500" : "text-orange-500"}`}></i>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`text-xs font-bold ${item.done ? "text-green-400" : "text-orange-400"}`}>{item.step}</span>
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
              <p className="text-base font-extrabold text-gray-900 mb-1">
                Loving PawTenant? Leave us a quick Google review!
              </p>
              <p className="text-sm text-gray-500 leading-relaxed">
                It takes less than 30 seconds and helps other pet owners find the protection their furry family members deserve.
              </p>
            </div>
            <div className="flex-shrink-0">
              <a
                href={GOOGLE_REVIEW_URL}
                target="_blank"
                rel="nofollow noreferrer"
                className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-3 bg-amber-400 hover:bg-amber-500 text-white font-extrabold text-sm rounded-xl transition-colors cursor-pointer"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <i className="ri-star-smile-line"></i>
                </div>
                Write a Review
              </a>
            </div>
          </div>
        </div>

        {/* ── Social Share (enhanced) ── */}
        <SocialShareSection
          shareLinks={shareLinks}
          shareUrl={shareUrl}
          copied={copied}
          onCopy={handleCopyLink}
        />

        {/* ── Contact Strip ── */}
        <div className="bg-orange-500 rounded-2xl p-6 sm:p-8 mb-8 text-white text-center">
          <p className="font-bold text-base mb-1">Questions about your order?</p>
          <p className="text-orange-100 text-sm mb-5">
            Our team is here to help — reach out any time and we&apos;ll get back to you fast.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <a
              href="tel:+14099655885"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-orange-600 font-bold text-sm rounded-lg hover:bg-orange-50 transition-colors cursor-pointer"
            >
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-phone-line"></i>
              </div>
              (409) 965-5885
            </a>
            <a
              href="mailto:hello@pawtenant.com"
              className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-3 bg-orange-400 text-white font-bold text-sm rounded-lg hover:bg-orange-300 transition-colors cursor-pointer"
            >
              <div className="w-4 h-4 flex items-center justify-center">
                <i className="ri-mail-line"></i>
              </div>
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
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-home-line"></i>
            </div>
            Back to Home
          </Link>
          <Link
            to="/no-risk-guarantee"
            className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-white border border-gray-200 text-gray-700 font-bold text-sm rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              <i className="ri-shield-check-line text-orange-500"></i>
            </div>
            Our Money-Back Guarantee
          </Link>
        </div>

        {/* ── Trust Bar ── */}
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 text-xs text-gray-400 border-t border-gray-100 pt-6">
          {GUARANTEE_POINTS.map((g) => (
            <div key={g.label} className="flex items-center gap-1.5">
              <div className="w-4 h-4 flex items-center justify-center">
                <i className={`${g.icon} text-orange-400`}></i>
              </div>
              {g.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
