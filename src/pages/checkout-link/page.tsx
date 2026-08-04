// src/pages/checkout-link/page.tsx
//
// ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001
//
// Customer entry point for the stable recovery link:
//
//     https://pawtenant.com/checkout/<slug>
//
// This is a thin, credential-safe bridge. It resolves the slug server-side and
// hands the resolved order to the assessment route IN MEMORY, then replaces the
// history entry so the slug never persists in the address bar.
//
// WHY HAND OFF INSTEAD OF RENDERING CHECKOUT HERE:
// Secure Checkout is step 3 of the assessment route (gates: otp → assurance →
// package → pay). Re-implementing it here would fork the Stripe payment-intent
// lifecycle, the duplicate-order guards and the package/plan restore logic —
// exactly the things this task must preserve. So we reuse that screen rather
// than clone it.
//
// SLUG CONFIDENTIALITY:
//   • the payload is passed on `window.__ptCheckoutResume` — memory only, never
//     sessionStorage or localStorage;
//   • `history.replaceState` drops the slug from the URL BEFORE the handoff, so
//     the tag stack never reports it as `dl`/`dr` (the same failure that made
//     `?rt=` leak into nine third-party beacons);
//   • the slug is never logged, never sent to analytics, never put in an audit
//     description or an error payload.

import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";

// 8 = legacy slugs already in customer inboxes; 12 = current format.
// Exactly these two lengths — never an arbitrary-length wildcard.
const SLUG_RE = /^([2-9A-HJ-NP-TV-Z]{8}|[2-9A-HJ-NP-TV-Z]{12})$/;

export interface CheckoutResumePayload {
  confirmationId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  letterType: string | null;
  packageKey: string | null;
  billingPlan: string | null;
  planType: string | null;
  deliverySpeed: string | null;
  price: number | null;
  couponCode: string | null;
  couponDiscount: number | null;
  otpVerified: boolean;
  /** COUNT only — drives multi-pet pricing. No pet detail is ever returned. */
  petCount: number;
}

export default function CheckoutLinkPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const ranRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Scrub the slug from the address bar synchronously, before any await and
    // before the tag stack can read location. Keep the raw value in a local.
    const raw = slug.trim().toUpperCase();
    try {
      window.history.replaceState({}, "", "/checkout");
    } catch { /* non-fatal */ }

    if (!SLUG_RE.test(raw)) { setFailed(true); return; }

    (async () => {
      try {
        const url = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
        const key = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

        const res = await fetch(`${url}/functions/v1/resolve-checkout-link`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({ slug: raw }),
        });

        const json = (await res.json()) as { ok?: boolean; resume?: CheckoutResumePayload };
        if (!json?.ok || !json.resume) { setFailed(true); return; }

        // Memory-only handoff. Never persisted.
        (window as unknown as { __ptCheckoutResume?: CheckoutResumePayload }).__ptCheckoutResume =
          json.resume;

        const isPsd = String(json.resume.letterType ?? "").toLowerCase() === "psd";
        navigate(isPsd ? "/psd-assessment" : "/assessment", { replace: true });
      } catch {
        setFailed(true);
      }
    })();
  }, [slug, navigate]);

  if (failed) {
    // Neutral. Discloses nothing about whether the order exists, was paid, was
    // refunded, or the slug was simply wrong.
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <SharedNavbar />
        <main className="flex-1 flex items-center justify-center px-5 py-20">
          <div className="max-w-md w-full text-center">
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-slate-900 mb-3">
              This order is no longer available for payment
            </h1>
            <p className="text-[15px] text-slate-600 leading-relaxed mb-7">
              It may already be complete, or this link may have been replaced. If you
              think this is a mistake, our team can help.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                to="/my-orders"
                className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-semibold text-[15px] px-6 py-3 rounded-md transition-colors"
              >
                Go to My Orders
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold text-[15px] px-6 py-3 rounded-md transition-colors"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </main>
        <SharedFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div
          className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"
          aria-hidden
        />
        <p className="text-[15px] text-slate-600">Opening your secure checkout…</p>
      </div>
    </div>
  );
}
