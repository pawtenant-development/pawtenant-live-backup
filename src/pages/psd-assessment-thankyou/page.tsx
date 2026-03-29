import { useEffect, useState, useRef } from "react";
import { Link, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";

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

    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInErr) { setDone(true); return; }
    setDone(true);
  };

  if (alreadyHasAccount) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
        <p className="text-sm font-bold text-gray-800 mb-2">Already have an account?</p>
        <p className="text-xs text-gray-500 mb-4">Sign in to track your order and download your PSD letter anytime.</p>
        <button
          type="button"
          onClick={() => navigate("/customer-login")}
          className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 cursor-pointer"
        >
          <i className="ri-login-box-line"></i>Sign In to My Orders
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
          <p className="text-xs text-green-700">You&apos;re signed in. Track your order and download your PSD letter anytime.</p>
          <button
            type="button"
            onClick={() => navigate("/my-orders")}
            className="whitespace-nowrap mt-3 inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 cursor-pointer"
          >
            <i className="ri-user-line"></i>Go to My Orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-amber-100 p-6 sm:p-8 mb-8">
      <div className="flex items-start gap-4 mb-5">
        <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-amber-50 rounded-xl border border-amber-200">
          <i className="ri-user-heart-line text-amber-600 text-2xl"></i>
        </div>
        <div>
          <p className="text-base font-extrabold text-gray-900 mb-1">Create a free account to track your order</p>
          <p className="text-sm text-gray-500 leading-relaxed">
            Set a password and get instant access to your order status and download your PSD letter anytime.
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
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-amber-600"
          />
          <button
            type="submit"
            disabled={loading}
            className="whitespace-nowrap w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 transition-colors cursor-pointer disabled:opacity-60"
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

export default function PSDAssessmentThankYouPage() {
  const location = useLocation();
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
            if (typeof window.fbq === "function") {
              window.fbq("track", "Purchase", {
                value: order.price,
                currency: "USD",
                content_name: "PSD Letter",
              });
              window.fbq("track", "Lead");
            }
            fireGHLPaidLead(order);
          }
        } catch { /* silent */ }
      }
    }
  }, [stripeSessionId, paymentIntentParam]);

  const {
    firstName = "there",
    email = "",
    selectedProvider = "your assigned provider",
    pricingPlan = "Priority ($120)",
    planType = "One-Time Purchase",
    price = 120,
    confirmationId = `PT-PSD${Date.now().toString(36).toUpperCase()}`,
  } = resolvedState;

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

    // Meta Pixel fires immediately — it has its own internal queue
    if (typeof window.fbq === "function") {
      window.fbq("track", "Purchase", {
        value: conversionValue,
        currency: "USD",
        content_name: "PSD Letter",
      });
    }

    // Google Ads: try immediately, then poll every 100 ms for up to 10 s
    // gtag.js loads asynchronously — on SPA navigations it may not be ready at mount
    const fireGtag = () => {
      if (typeof window.gtag !== "function") return false;
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

    if (!fireGtag()) {
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds at 100 ms intervals
      const interval = setInterval(() => {
        attempts += 1;
        if (fireGtag() || attempts >= maxAttempts) {
          clearInterval(interval);
          if (attempts >= maxAttempts && !gtagConversionFired.current) {
            console.warn("[PSD Thank-You] gtag not available after 10 s — conversion skipped");
          }
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
      desc: `Your payment of $${price} was processed successfully. You&apos;ll receive a receipt at ${email || "your email"}.`,
      done: true,
    },
    {
      step: "02",
      icon: "ri-stethoscope-line",
      title: "ADA Evaluation In Progress",
      desc: `${selectedProvider} will review your assessment, verify your dog&apos;s trained tasks, and complete your licensed PSD evaluation.`,
      done: false,
    },
    {
      step: "03",
      icon: "ri-service-line",
      title: "PSD Letter Delivered — Priority (Within 24 Hours)",
      desc: `Your official, HIPAA-compliant Psychiatric Service Dog letter will be emailed to ${email || "you"} and complies with the Americans with Disabilities Act (ADA).`,
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
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
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
            Payment received. Your PSD evaluation is now underway. Your official letter will be delivered within{" "}
            <strong className="text-gray-700">24 hours</strong>.
          </p>
        </div>

        {/* ── ADA Notice Banner ── */}
        <div className="bg-amber-600 text-white rounded-2xl px-5 py-4 mb-8 flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-amber-500 rounded-lg flex-shrink-0 mt-0.5">
            <i className="ri-information-line text-white text-base"></i>
          </div>
          <div>
            <p className="text-sm font-extrabold mb-0.5">ADA Compliance — What This Means For You</p>
            <p className="text-xs text-amber-100 leading-relaxed">
              Your PSD letter is issued under the <strong>Americans with Disabilities Act (ADA)</strong>. This grants public access rights for your service dog — restaurants, stores, hotels, and transportation. It operates separately from housing (Fair Housing Act / ESA).
            </p>
          </div>
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
                <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                  <i className="ri-mail-line text-amber-500 text-base"></i>
                </div>
                <div>
                  <p className="text-xs text-gray-400 font-medium mb-0.5">Letter Delivered To</p>
                  <p className="text-sm font-semibold text-gray-800">{email}</p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                <i className="ri-user-heart-line text-amber-500 text-base"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Assigned Provider</p>
                <p className="text-sm font-semibold text-gray-800">{selectedProvider}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                <i className="ri-price-tag-3-line text-amber-500 text-base"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Plan Purchased</p>
                <p className="text-sm font-semibold text-gray-800">{pricingPlan}</p>
                <p className="text-xs text-gray-400 mt-0.5">{planType}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                <i className="ri-timer-flash-line text-amber-500 text-base"></i>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Estimated Delivery</p>
                <p className="text-sm font-semibold text-gray-800">Within 24 Hours</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Create Account Prompt ── */}
        {email && <CreateAccountPrompt email={email} />}

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

        {/* ── PSD Rights Summary ── */}
        <div className="bg-white rounded-2xl border border-amber-100 p-6 sm:p-8 mb-8">
          <h3 className="text-base font-extrabold text-gray-900 mb-4 flex items-center gap-2">
            <div className="w-6 h-6 flex items-center justify-center"><i className="ri-shield-star-line text-amber-500"></i></div>
            Your PSD Rights Under the ADA
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: "ri-store-2-line", title: "Public Access", desc: "Your dog can accompany you to stores, restaurants, and public spaces" },
              { icon: "ri-flight-takeoff-line", title: "Air Travel", desc: "Airlines must allow your service dog in the cabin with documentation" },
              { icon: "ri-hotel-line", title: "Hotels & Lodging", desc: "Hotels cannot refuse entry or charge fees for your service dog" },
              { icon: "ri-building-line", title: "Workplace", desc: "Employers must provide reasonable accommodation for your service dog" },
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
