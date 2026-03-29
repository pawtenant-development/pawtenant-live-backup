import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface PlanInfo {
  name: string;
  petTier: "1" | "2" | "3";
  billingCycle: "onetime" | "annual";
  price: string;
}

interface Props {
  plan: PlanInfo | null;
  onClose: () => void;
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export default function RenewalCheckoutModal({ plan, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Lock background scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  if (!plan) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) { setError("Please enter your email address."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError("Please enter a valid email address."); return; }

    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-renewal-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim() || undefined,
          petCount: parseInt(plan.petTier, 10),
          billingCycle: plan.billingCycle,
        }),
      });

      const data = await res.json() as { url?: string; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Failed to create checkout session.");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const cycleLabel = plan.billingCycle === "annual" ? "Annual Subscription" : "One-Time Renewal";
  const cycleIcon = plan.billingCycle === "annual" ? "ri-loop-right-line" : "ri-refresh-line";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-orange-500 px-6 pt-6 pb-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-5 h-5 flex items-center justify-center">
                  <i className={`${cycleIcon} text-white text-sm`}></i>
                </div>
                <span className="text-white/80 text-xs font-semibold uppercase tracking-widest">{cycleLabel}</span>
              </div>
              <h2 className="text-white text-xl font-bold">Renew ESA Letter — {plan.name}</h2>
              <p className="text-orange-100 text-sm mt-1">
                {plan.billingCycle === "annual" ? `${plan.price}/year, auto-renews annually` : `${plan.price} one-time payment`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white transition-colors cursor-pointer flex-shrink-0"
            >
              <i className="ri-close-line text-xl"></i>
            </button>
          </div>
        </div>

        {/* Plan summary pill */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center gap-3 bg-orange-50 border border-orange-100 rounded-xl p-3">
            <div className="w-8 h-8 flex items-center justify-center bg-orange-500 rounded-lg flex-shrink-0">
              <i className="ri-file-check-2-line text-white text-sm"></i>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900">
                {plan.name} — Updated ESA Letter
              </p>
              <p className="text-xs text-gray-500">New issue date · FHA-compliant · Delivered within 24 hrs</p>
            </div>
            <span className="text-orange-600 font-bold text-sm whitespace-nowrap">{plan.price}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 pt-3">
          <p className="text-xs text-gray-500 mb-4 leading-relaxed">
            Enter your details below and we&apos;ll take you straight to secure checkout. Your updated letter will be delivered to this email.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                First Name <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g. Sarah"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
              />
              <p className="text-xs text-gray-400 mt-1">Your renewed letter will be sent here</p>
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
              <div className="w-4 h-4 flex items-center justify-center flex-shrink-0 mt-0.5">
                <i className="ri-error-warning-line text-red-500 text-xs"></i>
              </div>
              <p className="text-xs text-red-600 leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="whitespace-nowrap w-full mt-4 py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white font-bold text-sm rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <i className="ri-loader-4-line animate-spin"></i>
                Preparing Checkout…
              </>
            ) : (
              <>
                <i className="ri-lock-line"></i>
                Continue to Secure Checkout
              </>
            )}
          </button>

          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-3">
            <div className="flex items-center gap-1 text-gray-400 text-xs">
              <div className="w-3 h-3 flex items-center justify-center">
                <i className="ri-shield-check-line text-green-500"></i>
              </div>
              SSL Secure
            </div>
            <div className="flex items-center gap-1 text-gray-400 text-xs">
              <div className="w-3 h-3 flex items-center justify-center">
                <i className="ri-refund-2-line text-green-500"></i>
              </div>
              Money-back guarantee
            </div>
            <div className="flex items-center gap-1 text-gray-400 text-xs">
              <div className="w-3 h-3 flex items-center justify-center">
                <i className="ri-bank-card-line text-green-500"></i>
              </div>
              Powered by Stripe
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
