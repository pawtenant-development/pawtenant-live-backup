// src/pages/checkout-link/page.tsx
//
// ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001
// ASSESSMENT-CHECKOUT-REFRESH-AND-RESUME-PERSISTENCE-LIVE-INCIDENT-003
//
// The customer-facing DURABLE payment location:
//
//     https://pawtenant.com/checkout/<slug>
//
// WHAT THIS PAGE USED TO DO, AND WHY IT WAS THE BUG
// -------------------------------------------------
// It resolved the slug, then immediately did BOTH of these:
//
//     window.history.replaceState({}, "", "/checkout");   // slug destroyed
//     navigate("/psd-assessment", { replace: true });     // route left behind
//
// so the durable handle was thrown away at the exact moment it started
// mattering. From then on the customer stood on `/psd-assessment` (or
// `/assessment`) with the whole checkout state — current step, the server's
// assessment-complete verdict, restored identity, the Stripe client secret —
// living only in React component state.
//
// Pressing F5 remounted that component. `useState(1)` won. A customer who had
// just finished a 16-question clinical intake was returned to Question 1,
// "0 answered · Step 1 of 3". Reproduced on LIVE, twice, on both flows.
//
// WHAT IT DOES NOW
// ----------------
// The slug STAYS in the address bar and this route renders the checkout in
// place. `/checkout/<slug>` becomes the canonical browser location for payment,
// so the server — not browser memory — decides what the customer sees:
//
//     refresh            -> resolve again -> payment
//     hard refresh       -> resolve again -> payment
//     close and reopen   -> resolve again -> payment
//     second device      -> resolve again -> payment
//     order now paid     -> resolver declines -> the neutral screen below
//
// Nothing here depends on `currentStep`, `assessmentComplete`, an assessment
// token, React state, or a previous component mount.
//
// WHY IT RENDERS THE ASSESSMENT SHELL INSTEAD OF ITS OWN CHECKOUT
// --------------------------------------------------------------
// Secure Checkout is step 3 of the assessment route (gates: otp -> assurance ->
// package -> pay). Re-implementing it here would fork the Stripe
// payment-intent lifecycle, the duplicate-order guards and the package/plan
// restore logic — exactly the things this task must preserve. So the resolved
// order is handed to that screen as a PROP and this route becomes its host.
//
// SLUG CONFIDENTIALITY UNDER THE NEW SHAPE
// ----------------------------------------
// The slug is now visible in the address bar — that is the point, and it is the
// trade-off the owner accepted in exchange for a payment URL that survives a
// refresh. It is contained rather than hidden:
//   • it is in the PATH, never the query string, so it is not in
//     `location.search` where the tag stack reads `dl`;
//   • every URL capture surface masks it to `/checkout/:slug`
//     (see src/lib/checkoutSlugMask.ts, attributionStore and index.html);
//   • `no-referrer` is asserted for this view so no outbound request carries it;
//   • the route is noindex, so it can never be crawled or indexed;
//   • it is never logged, never written to storage, never sent to analytics and
//     never placed in an audit description or error payload.

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import SharedNavbar from "@/components/feature/SharedNavbar";
import SharedFooter from "@/components/feature/SharedFooter";
import { CHECKOUT_SLUG_RE } from "@/lib/checkoutSlugMask";

// The two checkout hosts. Lazy so an unresolved / failed slug never pays the
// cost of the Stripe bundle.
const AssessmentPage = lazy(() => import("../assessment/page"));
const PSDAssessmentPage = lazy(() => import("../psd-assessment/page"));

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
  /** Server's verdict on the PSD assessment. Boolean only — never values. */
  assessmentComplete?: boolean;
  /** COUNT only — drives multi-pet pricing. No pet detail is ever returned. */
  petCount: number;
}

/** Shown while the server decides what this customer should see.
 *
 *  This is the explicit RESOLVING state the incident asked for. Rendering the
 *  assessment optimistically and correcting it afterwards is what produced the
 *  Step-1 flash; a completed customer must never see Question 1, not even for
 *  one frame. */
function ResolvingCheckout() {
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

export default function CheckoutLinkPage() {
  const { slug = "" } = useParams();
  const ranRef = useRef(false);
  const [resume, setResume] = useState<CheckoutResumePayload | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const raw = slug.trim().toUpperCase();
    if (!CHECKOUT_SLUG_RE.test(raw)) { setFailed(true); return; }

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

        setResume(json.resume);
      } catch {
        setFailed(true);
      }
    })();
  }, [slug]);

  if (failed) {
    // Neutral. Discloses nothing about whether the order exists, was paid, was
    // refunded, or the slug was simply wrong.
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
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

  if (!resume) return <ResolvingCheckout />;

  const isPsd = String(resume.letterType ?? "").toLowerCase() === "psd";

  // The hosted assessment shell asserts `noindex` + `no-referrer` for itself
  // (it checks `isDurableCheckoutPath()`), so this route does not duplicate the
  // tags here — one owner per directive, no conflicting robots values.
  return (
    <>
      <Suspense fallback={<ResolvingCheckout />}>
        {isPsd
          ? <PSDAssessmentPage checkoutResume={resume as unknown as Record<string, unknown>} />
          : <AssessmentPage checkoutResume={resume as unknown as Record<string, unknown>} />}
      </Suspense>
    </>
  );
}
