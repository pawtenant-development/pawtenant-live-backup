import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import AssessmentNavbar from "./components/AssessmentNavbar";
import StepIndicator from "./components/StepIndicator";
import Step1Assessment, { type Step1Data } from "./components/Step1Assessment";
import Step2PersonalInfo, { type Step2Data } from "./components/Step2PersonalInfo";
// Step 3 (payment) is code-split: Stripe.js, Klarna and the payment forms only
// load when the user reaches Step 3. Type is imported separately (type-only
// imports are erased at build time and do NOT pull the chunk into Steps 1–2).
import type { Step3Data } from "./components/Step3Checkout";
import ExitIntentOverlay from "./components/ExitIntentOverlay";
import WhatHappensNext from "./components/WhatHappensNext";
import LiveStatusBanner from "./components/LiveStatusBanner";
import StateSelectionStep from "./components/StateSelectionStep";
import CustomerOtpStep from "./components/CustomerOtpStep";
import AssuranceScreen from "./components/AssuranceScreen";
import PackageSelectionStep from "./components/PackageSelectionStep";
import type { StateAcknowledgment } from "./components/StateAcknowledgmentModal";
import { nextBookingGate } from "@/lib/bookingProgress";
import { isDirectCheckout, flowVersionProp } from "@/config/flowVersion";


import { getDoctorsForState, ALL_STATES } from "../../mocks/doctors";
import { supabase } from "../../lib/supabaseClient";
import { useAssessmentTracking } from "../../hooks/useAssessmentTracking";
import { fireMetaPurchase, fireLead, fireInitiateCheckout } from "@/lib/metaPixel";
import { logAudit, loggedFetch } from "@/lib/auditLogger";
import {
  buildAttributionJson,
  buildChannel,
  getAttribution,
  getFirstTouch,
  getLastTouch,
  setConfirmationId,
  setCouponCode,
  setSelectedState,
} from "@/lib/attributionStore";
import { markAssessmentStarted, markPaid, getSessionId } from "@/lib/visitorSession";
import { getEsaOneTimeTotal, getEsaAnnualTotal, getPackageTotal } from "@/config/pricing";
import type { PackageKey } from "@/config/pricing";
import { trackAssessmentStepView, trackAssessmentSubmitted, trackPaymentSuccess, trackAssessmentCompleted, trackRecoveryConversionIfFlagged, trackPostOtpDestination, trackPlanChanged, trackPackageChangeOpened, trackPackageSelected } from "@/lib/trackEvent";

// Lazy-loaded Step 3 checkout (payment) — split into its own bundle chunk.
const Step3Checkout = lazy(() => import("./components/Step3Checkout"));

// Lightweight fallback shown only while the payment chunk loads (usually instant).
function Step3LoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5]"></i>
      <p className="mt-3 text-sm font-semibold text-gray-500">Loading secure checkout…</p>
    </div>
  );
}

const defaultStep1: Step1Data = {
  safetyCheck: "",
  emotionalFrequency: "",
  conditions: [],
  lifeChangeStress: "",
  challengeDuration: "",
  dailyImpact: "",
  sleepQuality: "",
  socialFunctioning: "",
  medication: "",
  medicationDetails: "",
  priorDiagnosis: "",
  specificDiagnosis: "",
  currentTreatment: "",
  treatmentDetails: "",
  symptomDescription: "",
  housingType: "",
};

const defaultStep2: Step2Data = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dob: "",
  state: "",
  pets: [{ name: "", age: "", breed: "", type: "", weight: "" }],
  deliverySpeed: "",
  additionalDocs: undefined,
};

function getAssessmentBasePrice(
  petCount: number,
  _deliverySpeed: string,
  plan: "one-time" | "subscription",
  packageKey: PackageKey = "esa_standard",
): number {
  // RA bundle = flat $179 one-time / $159 annual; standard keeps tiered pricing.
  return getPackageTotal(packageKey, plan === "subscription" ? "annual" : "one_time", petCount);
}

function getDiscountedAssessmentPrice(basePrice: number, coupon: { code: string; discount: number } | null): number {
  return Math.max(0, basePrice - (coupon?.discount ?? 0));
}

// ─── Test / Dev prefill data ──────────────────────────────────────────────────
const testStep1: Step1Data = {
  safetyCheck: "no",
  emotionalFrequency: "daily",
  conditions: ["anxiety", "depression"],
  lifeChangeStress: "yes",
  challengeDuration: "more-than-1-year",
  dailyImpact: "moderate",
  sleepQuality: "poor",
  socialFunctioning: "somewhat-impaired",
  medication: "no",
  medicationDetails: "",
  priorDiagnosis: "yes",
  specificDiagnosis: "Generalized Anxiety Disorder",
  currentTreatment: "yes",
  treatmentDetails: "Weekly therapy sessions",
  symptomDescription: "I experience persistent anxiety that significantly impacts my daily functioning and ability to maintain stable housing.",
  housingType: "apartment",
};

const testStep2: Step2Data = {
  firstName: "Alex",
  lastName: "TestUser",
  email: "test@pawtenant.com",
  phone: "5551234567",
  dob: "1990-06-15",
  state: "TX",
  pets: [{ name: "Buddy", age: "3", breed: "Golden Retriever", type: "dog", weight: "65" }],
  deliverySpeed: "",
  additionalDocs: undefined,
};

const defaultStep3: Step3Data = {
  selectedDoctorId: "",
  plan: "one-time",
  nameOnCard: "",
};

// ─── Conversion Tracking Helpers ─────────────────────────────────────────────

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// fireMetaPurchase, fireLead, fireInitiateCheckout are imported from @/lib/metaPixel

/**
 * Fires Google Ads begin_checkout remarketing event when the user
 * completes Step 2 (personal info) and enters the checkout step.
 * Used to build a "Checkout Abandoned" audience in Google Ads for retargeting.
 */
function fireGoogleAdsBeginCheckout(estimatedPrice: number) {
  if (typeof window.gtag === "function") {
    window.gtag("event", "begin_checkout", {
      currency: "USD",
      value: estimatedPrice,
      items: [
        {
          item_id: "esa-letter",
          item_name: "ESA Letter",
          price: estimatedPrice,
          quantity: 1,
        },
      ],
    });
  }
}

// ─── Traffic Source Detection ─────────────────────────────────────────────────

function getTrafficSource(): string {
  const gclid = sessionStorage.getItem("gclid");
  const fbclid = sessionStorage.getItem("fbclid");
  const utmSource = sessionStorage.getItem("utm_source") ?? "";
  const utmMedium = sessionStorage.getItem("utm_medium") ?? "";
  const referrer = sessionStorage.getItem("referrer") ?? document.referrer;

  if (gclid) return "Google Ads";
  if (fbclid) return "Facebook / Instagram Ads";
  if (utmSource.toLowerCase().includes("google") && ["cpc", "ppc", "paid"].includes(utmMedium.toLowerCase()))
    return "Google Ads";
  if (utmSource.toLowerCase().includes("facebook") || utmSource.toLowerCase().includes("instagram"))
    return "Facebook / Instagram Ads";
  if (utmSource) return `${utmSource}${utmMedium ? ` / ${utmMedium}` : ""}`;
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host.includes("google")) return "Google Organic";
      if (host.includes("bing")) return "Bing Organic";
      if (host.includes("facebook") || host.includes("instagram")) return "Social (Organic)";
      if (host.includes("yahoo")) return "Yahoo Organic";
      return `Referral: ${host}`;
    } catch {
      return referrer;
    }
  }
  return "Direct";
}

function getLandingUrl(): string {
  return sessionStorage.getItem("landing_url") ?? window.location.href;
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;

// REMOVED: GOOGLE_SHEETS_WEBHOOK_URL and SHEETS_SECRET removed from the browser bundle.
// All Sheets syncing is handled exclusively by the sync-to-sheets edge function
// via triggerSheetsFullSync(), which is already called after every lead save and payment.

/**
 * Triggers a full sync of all DB orders to Google Sheets (fire-and-forget).
 * Runs in the background so it never blocks user flow.
 * Ensures all columns (Letter Type, Order Status, Payment Status) are correct.
 */
function triggerSheetsFullSync(): void {
  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
  // Small delay so the DB write completes before we read it back
  setTimeout(() => {
    fetch(`${supabaseUrl}/functions/v1/sync-to-sheets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    }).catch(() => { /* silent — never block user flow */ });
  }, 2000);
}

/** Fires the early lead to GHL after Step 2 (for abandonment capture) */
async function fireGHLEarlyLead(step1: Step1Data, step2: Step2Data, confirmationId: string) {
  try {
    // ── 1. Fire the EXACT 8-field assessment_started event (required by GHL workflow) ──
    await fetch(GHL_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        webhookType: "main",
        eventType: "assessment_started",
        firstName: step2.firstName,
        lastName: step2.lastName,
        email: step2.email,
        phone: step2.phone,
        state: step2.state,
        confirmationId,
        amount: 0,
      }),
    });

    // ── 2. Also fire the extended abandonment lead (for GHL custom fields / tags) ──
    await fetch(GHL_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        webhookType: "assessment",
        firstName: step2.firstName,
        lastName: step2.lastName,
        email: step2.email,
        phone: step2.phone,
        dateOfBirth: step2.dob,
        state: step2.state,
        leadStatus: "Incomplete \u2013 Abandoned at Checkout",
        confirmationId,
        numberOfPets: step2.pets.length,
        pets: step2.pets.map((p, i) => ({
          petNumber: i + 1,
          name: p.name,
          type: p.type,
          breed: p.breed,
          age: p.age,
        })),
        emotionalFrequency: step1.emotionalFrequency,
        mentalHealthConditions: step1.conditions.join(", "),
        lifeChangeStress: step1.lifeChangeStress,
        housingType: step1.housingType,
        leadSource: "ESA Assessment Form \u2013 Step 2 Submitted",
        landingUrl: getLandingUrl(),
        trafficSource: getTrafficSource(),
        submittedAt: new Date().toISOString(),
        tags: ["ESA Assessment", "Step 2 Completed", "Needs Follow-up"],
      }),
    });
  } catch {
    // Silently fail
  }
}

/** Fires the final complete lead to GHL after payment (Step 3) */
async function fireGHLFinalLead(
  step1: Step1Data,
  step2: Step2Data,
  step3: Step3Data,
  selectedDocName: string,
  price: number,
  confirmationId: string,
) {
  try {
    await fetch(GHL_PROXY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        webhookType: "assessment",
        firstName: step2.firstName,
        lastName: step2.lastName,
        email: step2.email,
        phone: step2.phone,
        dateOfBirth: step2.dob,
        state: step2.state,
        leadStatus: "Paid \u2013 Order Completed",
        confirmationId,
        orderTotal: price,
        deliverySpeed: "",
        selectedProvider: selectedDocName,
        pricingPlan: step3.plan === "subscription" ? `Annual ($${price})` : `One-Time ($${price})`,
        planType: step3.plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
        cardHolderName: step3.nameOnCard,
        smsConsentGiven: step3.smsConsent === true,
        numberOfPets: step2.pets.length,
        pets: step2.pets.map((p, i) => ({
          petNumber: i + 1,
          name: p.name,
          type: p.type,
          breed: p.breed,
          age: p.age,
          weight: p.weight,
        })),
        emotionalFrequency: step1.emotionalFrequency,
        mentalHealthConditions: step1.conditions.join(", "),
        lifeChangeStress: step1.lifeChangeStress,
        challengeDuration: step1.challengeDuration,
        dailyImpact: step1.dailyImpact,
        sleepQuality: step1.sleepQuality,
        socialFunctioning: step1.socialFunctioning,
        priorDiagnosis: step1.priorDiagnosis,
        specificDiagnosis: step1.specificDiagnosis,
        currentTreatment: step1.currentTreatment,
        treatmentDetails: step1.treatmentDetails,
        medication: step1.medication,
        medicationDetails: step1.medicationDetails,
        housingType: step1.housingType,
        leadSource: "ESA Assessment Form \u2013 Paid",
        landingUrl: getLandingUrl(),
        trafficSource: getTrafficSource(),
        submittedAt: new Date().toISOString(),
        tags: [
          "ESA Assessment",
          "Paid Customer",
          step3.plan === "subscription" ? "Subscription" : "One-Time",
          ...(step3.smsConsent === true ? ["SMS Opted-In"] : ["SMS Opted-Out"]),
        ],
      }),
    });
  } catch {
    // Silently fail
  }
}

// ── Main Assessment Page ─────────────────────────────────────────────────────

export default function AssessmentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preSelectedDoctorId = searchParams.get("doctor") ?? "";
  const resumeConfirmationId = searchParams.get("resume") ?? "";
  // TRACK 2 · REPEAT-CUSTOMER-NEW-ESA-LINK-TEST
  // Opt-in flag: when present on a resume URL, pre-fill still runs so the
  // customer's identity stays loaded, but we land on Step 1 instead of jumping
  // to Step 3. This lets repeat-customer "new pet" flows review/edit pet info
  // before checkout. Email CTA appends &edit=pet for this purpose.
  // Default behavior (no flag) is unchanged → still jumps to Step 3.
  const resumeEditPet = (searchParams.get("edit") ?? "").toLowerCase() === "pet";
  // Pre-select state from ?state=CA param (used by state landing pages + ad campaigns)
  const preSelectedState = searchParams.get("state") ?? "";
  // Step 1 v2 (one-question-at-a-time) is now the DEFAULT.
  // `?step1=v1` is the emergency kill switch back to the legacy long-form
  // render — any other value (or no param) resolves to V2.
  const useStep1V2 = (searchParams.get("step1") ?? "").toLowerCase() !== "v1";
  // POST-OTP-DIRECT-CHECKOUT-001: verified customers land on Secure Checkout
  // directly (AssuranceScreen + PackageSelectionStep no longer auto-shown; the
  // package screen stays reachable via the checkout "Change package" control).
  const directCheckout = isDirectCheckout();

  // ── Referral + traffic source tracking ───────────────────────────────────
  // ?ref= accepts ANY value — ?ref=fb-june-promo, ?ref=google-brand, etc.
  // Fires "Assessment Started" events to GHL + Google Sheets on mount.
  const tracking = useAssessmentTracking({
    letterType: "esa",
    isResume: !!resumeConfirmationId,
  });
  // Convenience alias used throughout for Supabase referred_by field
  const referredBy = tracking.ref || tracking.fullSource || null;

  const [currentStep, setCurrentStep] = useState(1);
  // ── Flow gates (2026-07 restructure) ──────────────────────────────────────
  // State is collected FIRST (before the questionnaire) so the 30-day
  // acknowledgment fires early. After "Your Information" the customer verifies
  // their email via a 6-digit OTP, then sees an assurance screen, then pays.
  const [stateConfirmed, setStateConfirmed] = useState(false);
  const [checkoutGate, setCheckoutGate] = useState<"otp" | "assurance" | "package" | "pay">("otp");
  const [otpVerified, setOtpVerified] = useState(false);
  const verifiedEmailRef = useRef("");
  // Where OTP verification should land the customer next. First-time flow →
  // "assurance"; a resume of a package-selected lead → "pay"; else → "package".
  // (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001)
  const postOtpGateRef = useRef<"assurance" | "package" | "pay">("assurance");
  const [step1, setStep1] = useState<Step1Data>(defaultStep1);
  const [step2, setStep2] = useState<Step2Data>({ ...defaultStep2, state: preSelectedState });
  const [step3, setStep3] = useState<Step3Data>({ selectedDoctorId: preSelectedDoctorId, plan: "one-time" });
  // RA bundle selection (PACKAGE-RA-LETTER-BUNDLE-001): esa_standard | esa_ra_bundle.
  // Optional preselect from the ESA cost-page combo CTA (?package=esa_ra_bundle):
  // pre-highlights the RA card only — OTP and server-side pricing are unaffected;
  // the customer still confirms on the package step.
  const [selectedPackage, setSelectedPackage] = useState<PackageKey>(() => {
    try {
      return new URLSearchParams(window.location.search).get("package") === "esa_ra_bundle"
        ? "esa_ra_bundle" : "esa_standard";
    } catch { return "esa_standard"; }
  });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [stripeClientSecret, setStripeClientSecret] = useState("");
  const [stripeSecretLoading, setStripeSecretLoading] = useState(false);
  const [stripeSecretError, setStripeSecretError] = useState("");
  const [stripePaymentIntentId, setStripePaymentIntentId] = useState("");
  const stripeSecretInFlight = useRef(false); // dedupe concurrent calls
  const [resumeLoading, setResumeLoading] = useState(!!resumeConfirmationId);
  const [resumeNotFound, setResumeNotFound] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  // Legacy-resume pricing: the server (create-payment-intent) is authoritative
  // and returns the actual pre-discount base it charged (basePriceAmount). We
  // mirror it here so the checkout UI always shows the SAME amount that will be
  // charged — including a preserved original quote on a resumed old lead.
  // null = use the current-pricing computed display.
  const [quotedBasePriceDollars, setQuotedBasePriceDollars] = useState<number | null>(null);

  // ── Sync confirmation ID + coupon into attribution store ─────────────────
  useEffect(() => {
    setConfirmationId(confirmationId.current);
    // Flag the visitor session as having started the assessment (fire-and-forget).
    markAssessmentStarted();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (appliedCoupon?.code) setCouponCode(appliedCoupon.code);
  }, [appliedCoupon]);

  useEffect(() => {
    if (preSelectedState) setSelectedState(preSelectedState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedState]);
  // SECURITY (CHECKOUT-PRICING-PHASED-SUBSCRIPTION-CONTINUATION-002 Phase 0):
  // `?testCheckout=1` pre-fills fake data and jumps straight to the payment step,
  // bypassing the state + OTP gates (see the effect below). It is a LOCAL-DEV QA
  // affordance ONLY. `import.meta.env.DEV` is statically replaced with `false` in
  // any production build (`vite build`), so this whole shortcut is dead-code-
  // eliminated on every deployed site (Vercel TEST and LIVE) — the query param is
  // inert in production and can no longer bypass OTP. It still works under
  // `vite dev` (localhost) for QA.
  const isTestMode = import.meta.env.DEV && searchParams.get("testCheckout") === "1";
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const handleResendLink = async () => {
    const email = resendEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
    setResendState("sending");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ email, letterType: "esa" }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      setResendState(result.ok ? "sent" : "error");
    } catch {
      setResendState("error");
    }
  };
  // Stripe removed - payment processing disabled

  // Generate once per session
  const confirmationId = useRef(`PT-${Date.now().toString(36).toUpperCase()}`);

  // ── answeredInStep1 must be computed BEFORE any effect that uses it ────────
  const answeredInStep1 = [
    step1.safetyCheck,
    step1.emotionalFrequency,
    step1.conditions.length > 0 ? "yes" : "",
    step1.lifeChangeStress,
    step1.challengeDuration,
    step1.dailyImpact,
    step1.sleepQuality,
    step1.socialFunctioning,
    step1.medication,
    step1.priorDiagnosis,
    step1.currentTreatment,
    step1.symptomDescription && step1.symptomDescription.trim().length >= 10 ? "yes" : "",
    step1.housingType,
  ].filter(Boolean).length;

  // ── Subscription cleanup refs ─────────────────────────────────────────────
  // Track the current subscription ID so we can cancel it if the user
  // changes plan before paying, preventing "Incomplete" subscriptions piling up.
  const subscriptionIdRef = useRef<string | null>(null);
  const paymentCompletedRef = useRef(false);
  // Which state's waiting-period acknowledgment has already been audit-logged
  // this session — prevents duplicate audit rows when Step 2 is revisited.
  const stateAckAuditRef = useRef<string | null>(null);

  // ── Resume flow: if ?resume=CONFIRMATION_ID, pre-fill and jump to step 3 ──
  useEffect(() => {
    if (!resumeConfirmationId) return;

    const fetchLead = async () => {
      setResumeLoading(true);
      try {
        // Use edge function (service role key) to bypass RLS — anon client can't
        // read back orders it inserted because RLS requires auth.uid() = user_id
        const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
        const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

        const res = await fetch(`${supabaseUrl}/functions/v1/get-resume-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({ confirmationId: resumeConfirmationId }),
        });

        const result = await res.json() as {
          ok: boolean;
          order?: Record<string, unknown> & { already_paid?: boolean };
          error?: string;
        };

        if (!result.ok || !result.order) {
          setResumeNotFound(true);
          setResumeLoading(false);
          // Log the failure so we can track how often resume links fail
          void logAudit({
            actor_name: "system",
            actor_role: "system",
            object_type: "system",
            object_id: resumeConfirmationId,
            action: "resume_order_not_found",
            description: `Resume flow: order not found for confirmation ID ${resumeConfirmationId}`,
            metadata: {
              confirmation_id: resumeConfirmationId,
              error: result.error ?? "not_found",
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        // Already paid — don't show checkout again, go straight to thank-you
        if (result.order.already_paid) {
          navigate("/assessment/thank-you");
          return;
        }

        const data = result.order;

        const answers = (data.assessment_answers ?? {}) as Record<string, unknown>;

        setStep1({
          safetyCheck: (answers.safetyCheck as string) ?? "",
          emotionalFrequency: (answers.emotionalFrequency as string) ?? "",
          conditions: (answers.conditions as string[]) ?? [],
          lifeChangeStress: (answers.lifeChangeStress as string) ?? "",
          challengeDuration: (answers.challengeDuration as string) ?? "",
          dailyImpact: (answers.dailyImpact as string) ?? "",
          sleepQuality: (answers.sleepQuality as string) ?? "",
          socialFunctioning: (answers.socialFunctioning as string) ?? "",
          medication: (answers.medication as string) ?? "",
          medicationDetails: (answers.medicationDetails as string) ?? "",
          priorDiagnosis: (answers.priorDiagnosis as string) ?? "",
          specificDiagnosis: (answers.specificDiagnosis as string) ?? "",
          currentTreatment: (answers.currentTreatment as string) ?? "",
          treatmentDetails: (answers.treatmentDetails as string) ?? "",
          symptomDescription: (answers.symptomDescription as string) ?? "",
          housingType: (answers.housingType as string) ?? "",
          // 2026 HUD trained-task free-text note (Step 1). Backward-compat: an
          // older order may only have the legacy Step 2 button value
          // (`trainedTask` = "yes"/"no"/"unsure") — surface it as readable text
          // so nothing is lost; otherwise load the new free-text field.
          trainedTaskDescription:
            (answers.trainedTaskDescription as string) ??
            (typeof answers.trainedTask === "string" && answers.trainedTask
              ? answers.trainedTask === "yes"
                ? "Yes"
                : answers.trainedTask === "no"
                  ? "No"
                  : answers.trainedTask === "unsure"
                    ? "Not sure"
                    : (answers.trainedTask as string)
              : ""),
        });

        const loadedStep2: Step2Data = {
          firstName: (data.first_name as string) ?? "",
          lastName: (data.last_name as string) ?? "",
          email: (data.email as string) ?? "",
          phone: (data.phone as string) ?? "",
          dob: (answers.dob as string) ?? "",
          state: (data.state as string) ?? "",
          pets: (answers.pets as Step2Data["pets"]) ?? [{ name: "", age: "", breed: "", type: "", weight: "" }],
          deliverySpeed: (data.delivery_speed as string) ?? "",
          additionalDocs: (answers.additionalDocs as Step2Data["additionalDocs"]) ?? undefined,
          stateAcknowledgment: (answers.stateAcknowledgment as Step2Data["stateAcknowledgment"]) ?? undefined,
        };
        setStep2(loadedStep2);

        // Pre-seed the displayed price from the saved quote so the resumed
        // checkout immediately shows the ORIGINAL price (not the recalculated
        // current one). The server confirms/refines this via basePriceAmount
        // when the PaymentIntent is minted below.
        {
          const savedPrice = typeof data.price === "number" ? data.price : null;
          if (savedPrice != null && savedPrice > 0) setQuotedBasePriceDollars(savedPrice);
        }

        // Use the existing confirmation ID so payment upserts the right row
        confirmationId.current = resumeConfirmationId;

        // ── 2026-05-19 ATTR-RESUME-SESSION-LINKING ─────────────────────
        // Bridge this NEW browser session to the EXISTING order so the
        // Attribution / Journey tab can stitch the original Session 1
        // (Facebook → assessment → abandon) together with this resume /
        // recovery Session 2 (/r/manual → checkout → payment).
        //
        // link_session_to_order is bidirectional + COALESCE-safe:
        //   • visitor_sessions[currentSid].confirmation_id = COALESCE(...)
        //     — stamps the NEW session row with the order's confirmation_id
        //   • orders.session_id stays untouched when already set (the
        //     ORIGINAL Session 1 id is preserved as the "primary").
        //
        // Fire-and-forget — failures must never block the resume flow.
        try {
          const currentSid = getSessionId();
          if (currentSid) {
            void supabase
              .rpc("link_session_to_order", {
                p_session_id: currentSid,
                p_confirmation_id: resumeConfirmationId,
              })
              .then(() => { /* swallowed — best effort */ });
          }
        } catch { /* ignore */ }
        // TRACK 2 · REPEAT-CUSTOMER-NEW-ESA-LINK-TEST
        // When ?edit=pet is set (repeat-customer new-pet flow) land on Step 1
        // so the customer reviews/edits pet info first. Skip the eager
        // fetchClientSecret call — Step 3 will trigger it normally when the
        // customer reaches checkout. Otherwise keep the existing jump-to-Step-3
        // behavior for every other resume use case.
        setStateConfirmed(true);

        // ── Deterministic, auth-gated resume routing
        //    (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001) ──
        // Restore the saved package (authoritative identity — never inferred from
        // price) so a package-selected lead resumes at checkout; a no-package lead
        // resumes at the package step.
        const savedPackageKey = typeof data.package_key === "string" ? data.package_key : null;
        if (savedPackageKey === "esa_ra_bundle" || savedPackageKey === "esa_standard") {
          setSelectedPackage(savedPackageKey);
        }
        // Restore the saved billing plan so a resumed ANNUAL lead stays annual
        // (previously always reverted to one-time). billing_plan: "annual" | "one_time".
        const savedBillingPlan = typeof data.billing_plan === "string" ? data.billing_plan : null;
        if (savedBillingPlan === "annual") setStep3((s) => ({ ...s, plan: "subscription" }));
        else if (savedBillingPlan === "one_time") setStep3((s) => ({ ...s, plan: "one-time" }));
        const nextGate = nextBookingGate({
          confirmation_id: resumeConfirmationId,
          letter_type: (data.letter_type as string) ?? "esa",
          status: (data.status as string) ?? "lead",
          package_key: savedPackageKey,
        });

        // A confirmation ID in a URL is not authentication. Only skip OTP when the
        // visitor already holds a Supabase session for THIS order's email; otherwise
        // require OTP (the code goes to the order's email — only the owner can
        // complete it) before any checkout data is actionable.
        const orderEmail = (loadedStep2.email ?? "").trim().toLowerCase();
        let sessionEmail = "";
        try {
          const { data: sess } = await supabase.auth.getUser();
          sessionEmail = (sess?.user?.email ?? "").trim().toLowerCase();
        } catch { /* ignore — treat as unauthenticated */ }
        const alreadyAuthed = !!orderEmail && sessionEmail === orderEmail;

        if (resumeEditPet) {
          // Repeat-customer new-pet review: land on Step 1; the normal Step 2 → OTP
          // path handles auth. Skip the eager PI mint.
          setOtpVerified(alreadyAuthed);
          verifiedEmailRef.current = alreadyAuthed ? orderEmail : "";
          setCurrentStep(1);
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else if (alreadyAuthed) {
          setOtpVerified(true);
          verifiedEmailRef.current = orderEmail;
          // Direct-checkout: an authenticated resume is never forced through the
          // package screen — land on pay with the restored package/plan.
          const landGate = directCheckout ? "pay" : nextGate;
          setCheckoutGate(landGate);
          setCurrentStep(3);
          window.scrollTo({ top: 0, behavior: "smooth" });
          if (landGate === "pay") fetchClientSecret(loadedStep2, resumeConfirmationId);
        } else {
          setOtpVerified(false);
          verifiedEmailRef.current = "";
          postOtpGateRef.current = nextGate;
          setCheckoutGate("otp");
          setCurrentStep(3);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (err) {
        setResumeNotFound(true);
        // Log network/parse errors so we can distinguish them from "not found"
        void logAudit({
          actor_name: "system",
          actor_role: "system",
          object_type: "system",
          object_id: resumeConfirmationId,
          action: "resume_order_network_error",
          description: `Resume flow: network or parse error for confirmation ID ${resumeConfirmationId}`,
          metadata: {
            confirmation_id: resumeConfirmationId,
            error: err instanceof Error ? err.message : String(err),
            timestamp: new Date().toISOString(),
          },
        });
      } finally {
        setResumeLoading(false);
      }
    };

    fetchLead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Payment processing removed - Stripe integration disabled

  // ── Test / Dev shortcut — ?testCheckout=1 pre-fills all steps and jumps to step 3 ──
  useEffect(() => {
    if (!isTestMode) return;
    setStep1(testStep1);
    setStep2(testStep2);
    // Test shortcut bypasses the state + OTP gates and lands on the package step.
    setStateConfirmed(true);
    setOtpVerified(true);
    verifiedEmailRef.current = testStep2.email.trim().toLowerCase();
    setCheckoutGate("package");
    setCurrentStep(3);
    window.scrollTo(0, 0);
    fetchClientSecret(testStep2, confirmationId.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTestMode]);

  // ── Cancel orphaned subscription on unmount (if payment never completed) ──
  useEffect(() => {
    return () => {
      if (subscriptionIdRef.current && !paymentCompletedRef.current) {
        const subId = subscriptionIdRef.current;
        const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
        const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
        subscriptionIdRef.current = null;
        fetch(`${supabaseUrl}/functions/v1/create-payment-intent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
          body: JSON.stringify({ action: "cancel_subscription", cancelSubscriptionId: subId }),
        }).catch(() => { });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Retry fetchClientSecret when step 3 mounts with a valid email ────────
  // Covers the case where the initial call was skipped (empty email at the
  // time of the resume/test-mode trigger) but the email is now available.
  useEffect(() => {
    if (currentStep !== 3 || checkoutGate !== "pay") return; // only mint at the checkout gate
    if (stripeClientSecret) return; // already have one — don't re-fetch
    const email = step2.email?.trim();
    if (!email || !email.includes("@") || !email.includes(".")) return;
    fetchClientSecret(step2, confirmationId.current, appliedCoupon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, checkoutGate, step2.email]);

  // ── Fetch Stripe client_secret from server ────────────────────────────────
  // Accepts step2 data directly so it works both from goNext (current state)
  // and from the resume useEffect (state hasn't updated yet).
  const fetchClientSecret = async (s2: Step2Data, confId: string, coupon: { code: string; discount: number } | null = null, pkg: PackageKey = selectedPackage) => {
    // Guard: email must be a valid non-empty address before calling Stripe
    if (!s2.email || !s2.email.includes("@") || !s2.email.includes(".")) return;
    // In-flight lock — prevents duplicate concurrent calls (resume + retry + useEffect)
    if (stripeSecretInFlight.current) return;
    stripeSecretInFlight.current = true;
    setStripeSecretLoading(true);
    setStripeSecretError("");
    // NOTE: payment_attempted is intentionally NOT fired here. Creating/refreshing
    // a PaymentIntent is not a payment attempt — the customer has not pressed Pay.
    // payment_attempted now fires in the Stripe form components at the moment the
    // customer presses the final Pay button and Stripe confirmation begins.
    // Read attribution + canonical session id once. Six fields ONLY into Stripe.
    let attrForStripe = { utm_source: null as string | null, utm_campaign: null as string | null, gclid: null as string | null, fbclid: null as string | null };
    try {
      const a = getAttribution();
      attrForStripe = {
        utm_source:   a.utm_source,
        utm_campaign: a.utm_campaign,
        gclid:        a.gclid,
        fbclid:       a.fbclid,
      };
    } catch { /* ignore */ }
    let sessionIdForStripe: string | null = null;
    try { sessionIdForStripe = getSessionId(); } catch { sessionIdForStripe = null; }
    let channelForStripe: string | null = null;
    try { channelForStripe = buildChannel(); } catch { channelForStripe = null; }
    try {
      const res = await loggedFetch(
        "create-payment-intent",
        `${SUPABASE_URL}/functions/v1/create-payment-intent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({
            deliverySpeed: "",
            petCount: s2.pets?.length ?? 1,
            email: s2.email,
            confirmationId: confId,
            firstName: s2.firstName,
            lastName: s2.lastName,
            state: s2.state,
            // fetchClientSecret mints the ONE-TIME PaymentIntent only — the
            // subscription plan mints its own PI at pay time via
            // subscriptionParams / StripeCardForm, and stripeClientSecret is
            // consumed only by the one-time StripePaymentForm. Hard-code the
            // plan so this call can never read a stale `step3.plan` closure:
            // switching Subscribe→One-time called fetchClientSecret right after
            // setStep3(next), so `step3.plan` was still "subscription", which
            // minted a subscription PI and wrote its annual amount into
            // quotedBasePriceDollars — collapsing the one-time price onto the
            // subscription price (P0 CHECKOUT-PRICING-STABILITY-001).
            plan: "one-time",
            packageKey: pkg,
            couponCode: coupon?.code ?? "",
            // ── Phase 1: minimal attribution into Stripe metadata ─────────
            // Six fields only. NEVER include full attribution_json — the
            // canonical store is in orders.attribution_json / *_touch_json.
            sessionId:   sessionIdForStripe,
            utmSource:   attrForStripe.utm_source,
            utmCampaign: attrForStripe.utm_campaign,
            gclid:       attrForStripe.gclid,
            fbclid:      attrForStripe.fbclid,
            channel:     channelForStripe,
          }),
        },
        confId,
      );
      const result = (await res.json()) as { clientSecret?: string; paymentIntentId?: string; basePriceAmount?: number; error?: string };
      if (result.clientSecret) {
        setStripeClientSecret(result.clientSecret);
        setStripePaymentIntentId(result.paymentIntentId ?? "");
        setStripeSecretError("");
        // Server-authoritative pre-discount base (cents). Mirror it into the UI
        // so the displayed amount always equals what will actually be charged —
        // including a locked legacy quote on a resumed order.
        if (typeof result.basePriceAmount === "number" && result.basePriceAmount > 0) {
          setQuotedBasePriceDollars(result.basePriceAmount / 100);
        }
      } else {
        const errMsg = result.error ?? "Payment setup failed. Please try again.";
        setStripeSecretError(errMsg);
        void logAudit({
          actor_name: "assessment_flow",
          actor_role: "client",
          object_type: "payment",
          object_id: confId,
          action: "stripe_no_client_secret",
          description: `create-payment-intent returned no clientSecret: ${errMsg}`,
          metadata: {
            confirmation_id: confId,
            error: errMsg,
            email_present: !!s2.email,
            delivery_speed: "",
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "Network error — please check your connection.";
      setStripeSecretError(errMsg);
      // loggedFetch already logged the network error
    } finally {
      setStripeSecretLoading(false);
      stripeSecretInFlight.current = false;
    }
  };

  // ── Step navigation ────────────────────────────────────────────────────────
  // ── State-first gate handlers ─────────────────────────────────────────────
  const handleStateChange = (nextState: string) => {
    setStep2((s) => ({
      ...s,
      state: nextState,
      // Invalidate a stale acknowledgment when the state changes.
      stateAcknowledgment:
        s.stateAcknowledgment && s.stateAcknowledgment.state === nextState.toUpperCase()
          ? s.stateAcknowledgment
          : undefined,
    }));
  };
  const handleStateConfirm = (nextState: string, ack?: StateAcknowledgment) => {
    setStep2((s) => ({ ...s, state: nextState, stateAcknowledgment: ack ?? s.stateAcknowledgment }));
    setStateConfirmed(true);
    setCurrentStep(1);
    window.scrollTo(0, 0);
  };
  const handleViewPortal = () => {
    // The customer is authenticated after OTP (magic-link session established in
    // CustomerOtpStep). Send them to their portal focused on this saved order.
    navigate(`/my-orders?order=${encodeURIComponent(confirmationId.current)}`);
  };
  const handleOtpVerified = () => {
    setOtpVerified(true);
    verifiedEmailRef.current = step2.email.trim().toLowerCase();
    // Direct-checkout flow → straight to the pay surface (Assurance + Package are
    // no longer mandatory; the package screen stays reachable via "Change package").
    // Legacy → the resume-resolved gate (assurance / package / pay).
    const target = directCheckout ? "pay" : postOtpGateRef.current;
    postOtpGateRef.current = "assurance";
    // Reuse the one-time PaymentIntent already minted on Step 2 → 3; mint only if
    // it is missing (e.g. eager mint failed) so we never duplicate an identical PI.
    if (target === "pay" && !stripeClientSecret) {
      fetchClientSecret(step2, confirmationId.current, appliedCoupon, selectedPackage);
    }
    setCheckoutGate(target);
    trackPostOtpDestination(confirmationId.current, target, flowVersionProp());
    window.scrollTo(0, 0);
  };

  const goNext = async () => {
    // Structured event: about to advance from currentStep — log the next view.
    // Fire-and-forget. Step 1 view is already fired by useAssessmentTracking.
    try {
      if (currentStep === 1) trackAssessmentStepView(2, "esa");
      else if (currentStep === 2) trackAssessmentStepView(3, "esa");
    } catch { /* analytics must never block the user */ }

    if (currentStep === 2) {
      // Decide the checkout gate: fresh (or changed) email → OTP first; an
      // already-verified matching email → straight to the pay surface.
      const needOtp =
        !otpVerified || verifiedEmailRef.current !== step2.email.trim().toLowerCase();
      if (needOtp) { setOtpVerified(false); setCheckoutGate("otp"); }
      else setCheckoutGate(directCheckout ? "pay" : "package");
      // Fire lead tracking
      fireGHLEarlyLead(step1, step2, confirmationId.current);
      // Save lead FIRST and await it — saveLeadToSupabase may rewrite
      // confirmationId.current if email-based dedup matched an existing row.
      // Stripe client_secret MUST be minted against the canonical id so the
      // webhook resolves to the correct order row.
      const leadResult = await saveLeadToSupabase();
      // HARD BLOCK: if the email already has a PAID order, refuse to advance
      // to Step 3. Relying on React state (checkoutError) here was a stale-
      // closure bug — setCheckoutError doesn't update the closure synchronously,
      // so Step 3 was reached and Stripe was still able to charge. Use the
      // return value instead.
      if (leadResult.emailConflict) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Fire begin_checkout for Google Ads "Abandoned Checkout" remarketing audience
      const estimate = getAssessmentBasePrice(step2.pets.length, "", step3.plan);
      fireGoogleAdsBeginCheckout(estimate);
      // Facebook Pixel: Lead (personal info collected) + InitiateCheckout (entering payment)
      // Phase-1: pass sessionId + email so Pixel and CAPI mirror dedup via shared event_id.
      let sidForMeta: string | null = null;
      try { sidForMeta = getSessionId(); } catch { sidForMeta = null; }
      fireLead({ sessionId: sidForMeta ?? undefined, email: step2.email });
      fireInitiateCheckout({
        value: estimate,
        content_name: "ESA Letter Checkout",
        sessionId: sidForMeta ?? undefined,
        email: step2.email,
      });
      // Fetch Stripe client_secret — uses canonical confirmationId.current
      fetchClientSecret(step2, confirmationId.current);
    }
    setCurrentStep((s) => s + 1);
    // Use instant scroll for reliable cross-browser / iOS mobile behaviour
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const goBack = () => {
    // Stripe removed - cleanup not needed
    setCurrentStep((s) => s - 1);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  // ── RA bundle package selection (PACKAGE-RA-LETTER-BUNDLE-001) ──────────────
  // The one-time PaymentIntent amount is minted server-side; when the package
  // changes on the one-time plan we re-mint so the card charge matches the new
  // package (subscription mints its own PI at pay time from subscriptionParams).
  const handlePackageChange = (pkg: string) => {
    const next = (pkg === "esa_ra_bundle" ? "esa_ra_bundle" : "esa_standard") as PackageKey;
    setSelectedPackage(next);
    // Clear the previous package's server-quoted base so the checkout shows the
    // correct price for the new package immediately (no stale flicker); the
    // re-mint below re-confirms it (incl. any resume/legacy lock).
    setQuotedBasePriceDollars(null);
    if (step3.plan !== "subscription") {
      fetchClientSecret(step2, confirmationId.current, appliedCoupon, next);
    }
  };

  // Dedicated package step → advance to checkout with the chosen package (mints the
  // one-time PI for it; annual mints its own PI at pay time from subscriptionParams).
  const handlePackageSelect = (pkg: string) => {
    const next = (pkg === "esa_ra_bundle" ? "esa_ra_bundle" : "esa_standard");
    trackPackageSelected(confirmationId.current, next, { flow_version: flowVersionProp() });
    handlePackageChange(pkg);
    setCheckoutGate("pay");
    window.scrollTo(0, 0);
  };

  // Wrap the Step3 onChange so switching BACK to one-time re-mints the PI with
  // the currently selected package (its amount may be stale from a prior mint).
  const handleStep3Change = (next: Step3Data) => {
    const switchingToOneTime = next.plan !== "subscription" && step3.plan === "subscription";
    if (next.plan !== step3.plan) {
      trackPlanChanged(confirmationId.current, next.plan === "subscription" ? "annual" : "one-time", { flow_version: flowVersionProp() });
    }
    setStep3(next);
    if (switchingToOneTime) {
      fetchClientSecret(step2, confirmationId.current, appliedCoupon, selectedPackage);
    }
  };

  /** Called only if the user somehow clicks "Load Payment Form" fallback button */
  const handleSubmit = async () => {
    setSubmitting(true);
    setCheckoutError("");
    // Stripe removed
    const petCount = step2.pets.length;
    const additionalDocTypes = (step2.additionalDocs?.types ?? []).filter((t) => t !== "ESA Letter");
    const additionalDocCount = additionalDocTypes.length;
    const baseEstimate = getAssessmentBasePrice(petCount, "", step3.plan) * 100;
    const estimatedPrice = baseEstimate + additionalDocCount * 3000;
    const selectedDoc = getDoctorsForState(step2.state).find((d) => d.id === step3.selectedDoctorId);
    const docName = selectedDoc ? `${selectedDoc.name}, ${selectedDoc.title}` : "";

    const pendingOrder = {
      firstName: step2.firstName,
      lastName: step2.lastName,
      email: step2.email,
      selectedProvider: docName,
      pricingPlan: step3.plan === "subscription" ? "Annual" : "One-Time",
      planType: step3.plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
      deliverySpeed: "",
      petCount,
      price: estimatedPrice / 100,
      confirmationId: confirmationId.current,
      _step1: step1,
      _step2: step2,
      _step3Plan: step3.plan,
    };
    sessionStorage.setItem("esa_pending_order", JSON.stringify(pendingOrder));

    try {
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/create-payment-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          plan: step3.plan,
          petCount,
          deliverySpeed: "",
          email: step2.email,
          customerName: `${step2.firstName} ${step2.lastName}`,
          additionalDocCount,
          metadata: {
            confirmationId: confirmationId.current,
            firstName: step2.firstName,
            lastName: step2.lastName,
            email: step2.email,
            phone: step2.phone,
            state: step2.state,
            selectedProvider: docName,
            planType: step3.plan,
            deliverySpeed: "",
            petCount: String(petCount),
            additionalDocCount: String(additionalDocCount),
          },
        }),
      });
      // Stripe create-payment-intent removed
      throw new Error("Payment processing temporarily unavailable.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setCheckoutError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Save lead to Supabase after Step 2 via the service-role edge function.
   *
   * CRITICAL: the edge function may return a DIFFERENT confirmationId when
   * email-based dedup matches an existing unpaid lead. We MUST adopt it so
   * downstream calls (Stripe PI creation, payment upsert, webhook metadata,
   * auto-assign) all operate on the canonical row. Without this step, a
   * duplicate paid row is created alongside the original unpaid lead.
   */
  const saveLeadToSupabase = async (): Promise<{ emailConflict: boolean; error?: string }> => {
    const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
    const estimatedPrice = getAssessmentBasePrice(step2.pets.length, "", "one-time");

    const attr = getAttribution();
    const attributionJsonVal = buildAttributionJson("step2_lead");
    // Phase 1 analytics: capture both touches + canonical session id for backend persist.
    let firstTouchVal = null;
    let lastTouchVal = null;
    let sessionIdVal: string | null = null;
    try { firstTouchVal = getFirstTouch(); } catch { firstTouchVal = null; }
    try { lastTouchVal = getLastTouch(); } catch { lastTouchVal = null; }
    try { sessionIdVal = getSessionId(); } catch { sessionIdVal = null; }

    let emailConflict = false;
    let conflictError: string | undefined;

    try {
      const res = await loggedFetch(
        "get-resume-order/upsert-lead",
        `${supabaseUrl}/functions/v1/get-resume-order`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            action: "upsert",
            confirmationId: confirmationId.current,
            email: step2.email,
            firstName: step2.firstName,
            lastName: step2.lastName,
            phone: step2.phone,
            state: step2.state,
            deliverySpeed: "",
            price: estimatedPrice,
            letterType: "esa",
            status: "lead",
            referredBy: referredBy ?? "",
            gclid: attr.gclid,
            fbclid: attr.fbclid,
            utmSource: attr.utm_source,
            utmMedium: attr.utm_medium,
            utmCampaign: attr.utm_campaign,
            utmTerm: attr.utm_term,
            utmContent: attr.utm_content,
            landingUrl: attr.landing_url,
            attributionJson: attributionJsonVal,
            sessionId: sessionIdVal,
            firstTouchJson: firstTouchVal,
            lastTouchJson: lastTouchVal,
            assessmentAnswers: {
              ...step1,
              pets: step2.pets,
              dob: step2.dob,
              additionalDocs: step2.additionalDocs ?? null,
              // State-law waiting-period acknowledgment evidence (AR/CA/IA/LA/MT)
              // — captured at state selection in Step 2, null for other states.
              stateAcknowledgment: step2.stateAcknowledgment ?? null,
            },
          }),
        },
        confirmationId.current,
      );

      try {
        const result = (await res.json()) as {
          ok?: boolean;
          confirmationId?: string;
          idDiverged?: boolean;
          emailConflict?: boolean;
          error?: string;
        };

        if (result?.emailConflict) {
          // A PAID order already exists for this email — block progression.
          const msg = result.error ?? "An order already exists for this email. Please use a different email.";
          setCheckoutError(msg);
          emailConflict = true;
          conflictError = msg;
          // Invalidate any stale Stripe client_secret so a later refetch can't
          // accidentally charge against an orphaned PI if the user retries.
          setStripeClientSecret("");
          setStripePaymentIntentId("");
        }

        if (
          result?.ok &&
          result.confirmationId &&
          result.confirmationId !== confirmationId.current
        ) {
          console.info(
            `[saveLeadToSupabase] adopting canonical confirmationId ${result.confirmationId} (was ${confirmationId.current})`,
          );
          confirmationId.current = result.confirmationId;
          setConfirmationId(result.confirmationId);
          // Invalidate any Stripe client_secret so a fresh PI is minted with
          // the canonical confirmation_id in metadata. The useEffect at step 3
          // will refetch automatically.
          setStripeClientSecret("");
          setStripePaymentIntentId("");
        }

        // Funnel: assessment answers persisted (lead upsert succeeded). Fired
        // once per order, only on a real ok result and not on an email conflict.
        if (result?.ok && !result.emailConflict) {
          try { trackAssessmentSubmitted(confirmationId.current, "esa"); } catch { /* analytics never blocks */ }
        }
      } catch {
        // Response not JSON — row was still written server-side; continue.
      }
    } catch {
      // Edge function call failed (network / cold start). Do NOT fall back to
      // a raw client insert — the previous raw insert bypassed all dedup and
      // created duplicate rows. Surface a soft warning and let the user retry.
      console.warn("[saveLeadToSupabase] edge function failed — lead not saved");
    }

    // Skip Sheets sync when we rejected the lead for an email conflict —
    // nothing was written to the DB.
    if (!emailConflict) {
      triggerSheetsFullSync();
    }

    // Surface the state-law acknowledgment in the admin audit timeline (once
    // per acknowledged state per session). The full evidence object also lives
    // in orders.assessment_answers.stateAcknowledgment.
    const ack = step2.stateAcknowledgment;
    if (!emailConflict && ack && stateAckAuditRef.current !== ack.state) {
      stateAckAuditRef.current = ack.state;
      void logAudit({
        actor_name: "assessment_flow",
        actor_role: "client",
        object_type: "order",
        object_id: confirmationId.current,
        action: "state_waiting_period_acknowledged",
        description: `Customer acknowledged the ${ack.state} waiting-period notice at state selection (v${ack.version}, price shown $${ack.priceShown}).`,
        metadata: {
          confirmation_id: confirmationId.current,
          state: ack.state,
          service: ack.service,
          version: ack.version,
          acknowledged_at: ack.acknowledgedAt,
          price_shown: ack.priceShown,
        },
      });
    }

    return { emailConflict, error: conflictError };
  };

  /**
   * Save order to Supabase after successful payment via the service-role edge
   * function. The edge function now REFUSES to create a new row for payment
   * upserts — if no existing lead row matches by confirmationId, payment
   * intent, or email, it returns 404 and we log loudly (this should never
   * happen in a correctly-flowing session; if it does, the webhook is still
   * the safety net).
   */
  const saveOrderToSupabase = async (
    price: number,
    docName: string,
    paymentIntentId?: string,
    paymentMethod?: string,
  ) => {
    const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
    const paidAt = new Date().toISOString();
    const attr = getAttribution();

    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/get-resume-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          action: "upsert",
          confirmationId: confirmationId.current,
          email: step2.email,
          firstName: step2.firstName,
          lastName: step2.lastName,
          state: step2.state,
          phone: step2.phone,
          deliverySpeed: "",
          letterType: "esa",
          status: "processing",
          price,
          paymentIntentId: paymentIntentId ?? null,
          paymentMethod: paymentMethod ?? null,
          paidAt,
          selectedProvider: docName,
          planType: step3.plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
          addonServices: (step3.addonServices ?? []).length > 0 ? step3.addonServices : null,
          referredBy: referredBy ?? "",
          gclid: attr.gclid,
          fbclid: attr.fbclid,
          utmSource: attr.utm_source,
          utmMedium: attr.utm_medium,
          utmCampaign: attr.utm_campaign,
          utmTerm: attr.utm_term,
          utmContent: attr.utm_content,
          landingUrl: attr.landing_url,
          attributionJson: buildAttributionJson("payment_confirmed"),
          // Always include pets, dob and additionalDocs so the payment upsert
          // doesn't overwrite the full assessment saved at lead time.
          assessmentAnswers: {
            ...step1,
            pets: step2.pets,
            dob: step2.dob,
            additionalDocs: step2.additionalDocs ?? null,
            stateAcknowledgment: step2.stateAcknowledgment ?? null,
          },
        }),
      });

      const result = (await res.json()) as {
        ok?: boolean;
        confirmationId?: string;
        idDiverged?: boolean;
        missingOrder?: boolean;
        alreadyPaid?: boolean;
        error?: string;
      };

      if (!result?.ok) {
        if (result?.missingOrder) {
          console.error(
            `[saveOrderToSupabase] REFUSED: no existing row for ${confirmationId.current}. ` +
              `Webhook will be the sole writer. Error: ${result.error}`,
          );
        } else {
          console.error("[saveOrderToSupabase] edge function upsert failed:", result?.error);
        }
        return;
      }

      if (result.confirmationId && result.confirmationId !== confirmationId.current) {
        console.info(
          `[saveOrderToSupabase] adopting canonical confirmationId ${result.confirmationId} (was ${confirmationId.current})`,
        );
        confirmationId.current = result.confirmationId;
        setConfirmationId(result.confirmationId);
      }

      console.info("[saveOrderToSupabase] ✓ payment recorded against canonical row");
    } catch (err) {
      console.error("[saveOrderToSupabase] network error:", err);
    }
  };

  /** Auto-assign the selected doctor immediately after payment is confirmed */
  const autoAssignDoctor = (doctorEmail: string, confId: string): void => {
    if (!doctorEmail) return;
    const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
    fetch(`${supabaseUrl}/functions/v1/assign-doctor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        confirmationId: confId,
        doctorEmail,
      }),
    }).catch(() => {
      // Silently fail — assignment can be done manually from admin panel if this fails
    });
  };

  /**
   * Called before Stripe Checkout redirect (Klarna / QR).
   * Stores the pending order in sessionStorage so the thank-you page can
   * fire GHL, Meta Pixel, PDF generation, etc. on return.
   */
  const handleBeforeRedirect = () => {
    const isSubscription = step3.plan === "subscription";
    const basePrice = getAssessmentBasePrice(step2.pets.length, "", step3.plan);
    const price = getDiscountedAssessmentPrice(basePrice, appliedCoupon);

    const selectedDoc = getDoctorsForState(step2.state).find((d) => d.id === step3.selectedDoctorId);
    const docName = selectedDoc ? `${selectedDoc.name}, ${selectedDoc.title}` : "";
    const pricingLabel = isSubscription ? `Annual ($${price})` : `One-Time ($${price})`;
    const planType = isSubscription ? "Subscription (Annual)" : "One-Time Purchase";

    const pendingOrder = {
      firstName: step2.firstName,
      lastName: step2.lastName,
      email: step2.email,
      selectedProvider: docName,
      pricingPlan: pricingLabel,
      planType,
      deliverySpeed: "",
      price,
      couponCode: appliedCoupon?.code ?? "",
      couponDiscount: appliedCoupon?.discount ?? 0,
      confirmationId: confirmationId.current,
      _step1: step1 as unknown as Record<string, unknown>,
      _step2: step2 as unknown as Record<string, unknown>,
      _step3Plan: step3.plan,
    };
    sessionStorage.setItem("esa_pending_order", JSON.stringify(pendingOrder));
  };

  /** Called when Stripe confirms payment successfully (inline card) */
  const handlePaymentSuccess = async (paymentIntentId: string) => {
    paymentCompletedRef.current = true; // prevent unmount cleanup from cancelling the subscription
    markPaid();
    const selectedDoc = getDoctorsForState(step2.state).find((d) => d.id === step3.selectedDoctorId);
    // Compute correct price based on actual pet count + plan + selected package
    // (RA bundle = flat $179/$159). Must match the server-charged amount so the
    // client order write never overwrites the webhook's price.
    const basePrice = getAssessmentBasePrice(step2.pets.length, "", step3.plan, selectedPackage);
    const price = getDiscountedAssessmentPrice(basePrice, appliedCoupon);
    const docName = selectedDoc ? `${selectedDoc.name}, ${selectedDoc.title}` : "";

    // Phase-3 funnel events — fire-and-forget, deduped by confirmation_id.
    // Both calls are wrapped so an analytics failure can never block the
    // post-payment flow (markPaid + Meta Purchase + GHL final lead + order
    // save + assign-doctor all still run regardless).
    try {
      trackAssessmentCompleted(confirmationId.current, "esa", {
        plan: step3.plan,
        pet_count: step2.pets?.length ?? 1,
      });
      trackPaymentSuccess(confirmationId.current, {
        plan: step3.plan,
        price,
        payment_intent_id: paymentIntentId,
        user_email: step2.email,
        letter_type: "esa",
      });
      // Phase-3B: if the user got here via /r/<stage>, fire recovery_conversion.
      trackRecoveryConversionIfFlagged(confirmationId.current, {
        price,
        payment_intent_id: paymentIntentId,
        letter_type: "esa",
      });
    } catch { /* analytics must never block payment success */ }

    // Read payment method stored in session storage by Step3Checkout
    const paymentMethod = (() => {
      try {
        return JSON.parse(sessionStorage.getItem("esa_pending_order") ?? "{}").paymentMethod ?? "card";
      } catch { return "card"; }
    })();

    sessionStorage.setItem("esa_payment_success", "true");
    fireMetaPurchase({ value: price, confirmationId: confirmationId.current, email: step2.email, contentName: "ESA Letter" });
    // NOTE: Google Ads conversion fires on the thank-you page via its own useEffect
    // using the real label AW-11509262282/Va-eCP6ZvpEcEMrPhfAq — do NOT fire here
    fireGHLFinalLead(step1, step2, step3, docName, price, confirmationId.current);

    // Update Google Sheets with confirmed order + payment status (via edge function sync)
    // triggerSheetsFullSync() below handles this automatically after the order is saved.

    // Await order save so assign-doctor can find the row immediately
    await saveOrderToSupabase(price, docName, paymentIntentId, paymentMethod);

    // ── 2026-05-19 EMAIL-ORDER-CONFIRMATION-AUTO ──────────────────────
    // Belt-and-braces: fire resend-confirmation-email from the client
    // immediately after the order is saved. The stripe-webhook also
    // calls this endpoint when payment_intent.succeeded arrives, but
    // webhook delivery is asynchronous and occasionally delayed or
    // dropped (especially during Stripe redeliveries or staging URL
    // changes). The function dedupes server-side via the communications
    // table (reserveEmailSend → dedupe_key), so calling it twice — once
    // here, once from the webhook — sends exactly one email. This is
    // the customer-facing guarantee that pays for itself the first time
    // a webhook misses.
    //
    // Fire-and-forget. The .catch() swallows any error so the
    // navigate() and the rest of the post-payment flow are never blocked.
    try {
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
      void fetch(`${supabaseUrl}/functions/v1/resend-confirmation-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ confirmationId: confirmationId.current, source: "client_fallback" }),
      }).catch(() => { /* swallow — webhook is the canonical sender */ });
    } catch { /* never block payment success */ }

    // Sync Google Sheets after payment (ensures all columns are correct)
    triggerSheetsFullSync();

    // ── Auto-note: flag provider preference if patient came via a doctor referral link ──
    if (selectedDoc && confirmationId.current) {
      try {
        const { data: savedOrder } = await supabase
          .from("orders")
          .select("id")
          .eq("confirmation_id", confirmationId.current)
          .maybeSingle();
        if (savedOrder?.id) {
          const stateLabel = ALL_STATES.find((s) => s.code === step2.state)?.name ?? step2.state;
          await supabase.from("doctor_notes").insert({
            order_id: savedOrder.id,
            doctor_user_id: null,
            note: `Provider Preference (Auto): Patient booked via ${docName}'s referral page. ${docName} is licensed in ${stateLabel}. Please prioritize assigning this patient to ${docName} as their preferred provider.`,
          });
        }
      } catch { /* best-effort — never block the main flow */ }
    }

    // ── Auto-assign the doctor the patient selected in Step 3 ──────────────
    // Uses the doctor's email from DOCTORS mock data (must match doctor_contacts table)
    if (selectedDoc?.email) {
      autoAssignDoctor(selectedDoc.email, confirmationId.current);
    }

    navigate(`/assessment/thank-you?amount=${price}&order_id=${confirmationId.current}&payment_intent_id=${paymentIntentId}`);
  };

  // Stripe payment error handler removed

  const selectedDoc = getDoctorsForState(step2.state).find((d) => d.id === step3.selectedDoctorId);
  const docDisplayName = selectedDoc ? `${selectedDoc.name}, ${selectedDoc.title}` : "";

  // answeredInStep1 already computed above — remove the duplicate declaration below
  // Compute the same progress % used in StepIndicator
  function getProgressPercent(): number {
    if (currentStep === 1) return Math.round((answeredInStep1 / 13) * 30);
    if (currentStep === 2) return 42;
    if (currentStep === 3) return 78;
    return 100;
  }

  const handleCouponApplied = async (coupon: { code: string; discount: number } | null) => {
    console.info("[assessment] coupon state changed", {
      code: coupon?.code ?? null,
      discount: coupon?.discount ?? 0,
      plan: step3.plan,
    });
    setAppliedCoupon(coupon);

    // Card one-time payments must refresh the client secret so Stripe charges
    // the backend-owned discounted amount instead of a stale PaymentIntent.
    if (step3.plan !== "one-time") return;

    setStripeClientSecret("");
    setStripePaymentIntentId("");
    setStripeSecretError("");

    try {
      await fetchClientSecret(step2, confirmationId.current, coupon);
      console.info("[assessment] payment intent refreshed for coupon", { code: coupon?.code ?? null });
    } catch (err) {
      console.warn("[handleCouponApplied] failed to refresh payment intent for coupon:", err);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <title>Get Your ESA Letter Online — Free Assessment | PawTenant</title>
      <meta name="robots" content="index, follow" />
      {/* Discount popup — only appears on checkout step, 18s delay */}






      {/* Exit Intent Overlay */}
      <ExitIntentOverlay
        progressPercent={getProgressPercent()}
        currentStep={currentStep}
        onStay={() => { }}
      />

      {/* Minimal Navbar */}
      <AssessmentNavbar />



      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {/* Resume loading state */}
        {resumeLoading ? (
          <div className="flex flex-col items-center justify-center py-32">
            <i className="ri-loader-4-line animate-spin text-4xl text-[#1A5C4F] mb-4"></i>
            <p className="text-base font-bold text-gray-700 mb-1">Loading your saved assessment...</p>
            <p className="text-sm text-gray-400 mb-6">This only takes a second.</p>
          </div>
        ) : resumeNotFound ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
            <div className="w-16 h-16 flex items-center justify-center bg-[#E8F1EE] rounded-full mb-4">
              <i className="ri-error-warning-line text-[#1A5C4F] text-2xl"></i>
            </div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-2">Link expired or not found</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm">This payment link may have expired or already been used. Enter your email below to receive a new payment link, or start a fresh assessment.</p>

            {/* Resend payment link form */}
            <div className="w-full bg-white border border-gray-100 rounded-xl p-5 mb-5 text-left">
              <p className="text-xs font-bold text-gray-700 mb-3 uppercase tracking-wide">Resend my payment link</p>
              {resendState === "sent" ? (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <i className="ri-checkbox-circle-fill text-green-500"></i>
                  <span className="text-sm font-semibold">Check your inbox — we sent a new payment link.</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#1A5C4F] transition-colors"
                      onKeyDown={(e) => { if (e.key === "Enter") handleResendLink(); }}
                    />
                    <button
                      type="button"
                      onClick={handleResendLink}
                      disabled={resendState === "sending"}
                      className="whitespace-nowrap px-4 py-2.5 bg-[#1A5C4F] text-white text-sm font-bold rounded-lg hover:bg-[#14493E] disabled:opacity-60 cursor-pointer transition-colors"
                    >
                      {resendState === "sending" ? <i className="ri-loader-4-line animate-spin"></i> : "Send Link"}
                    </button>
                  </div>
                  {resendState === "error" && (
                    <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                      <i className="ri-error-warning-line"></i>
                      Couldn&apos;t find an order for that email. Try starting a fresh assessment or call us at 409-965-5885.
                    </p>
                  )}
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => { setResumeNotFound(false); setCurrentStep(1); }}
              className="whitespace-nowrap flex items-center gap-2 px-6 py-3 bg-[#1A5C4F] text-white font-bold rounded-xl hover:bg-[#14493E] cursor-pointer transition-colors"
            >
              <i className="ri-arrow-right-line"></i>Start Fresh Assessment
            </button>
          </div>
        ) : !stateConfirmed ? (
          <>
            {/* STATE FIRST — collected before the questionnaire so the 30-day
                acknowledgment (AR/CA/IA/LA/MT) fires early. */}
            <div className="text-center mb-6">
              <p className="text-[#1A5C4F] text-xs font-bold tracking-[0.22em] uppercase mb-2">ESA Assessment</p>
            </div>
            <StateSelectionStep
              state={step2.state}
              service="esa"
              priceShown={getEsaOneTimeTotal(1)}
              existingAck={step2.stateAcknowledgment}
              onChange={handleStateChange}
              onConfirm={handleStateConfirm}
            />
            <WhatHappensNext />
          </>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-4">
              <p className="text-[#1A5C4F] text-xs font-bold tracking-[0.22em] uppercase mb-2">ESA Assessment</p>
              {resumeConfirmationId && currentStep === 3 ? (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Complete Your Payment</h1>
                  <div className="mt-3 inline-flex items-center gap-2 bg-[#E8F1EE] border border-[#CFE2DC] rounded-full px-4 py-2">
                    <i className="ri-save-3-line text-[#1A5C4F] text-sm"></i>
                    <span className="text-sm font-semibold text-[#1A5C4F]">Your assessment answers have been restored</span>
                  </div>
                </>
              ) : currentStep === 3 ? (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                    Secure Checkout
                  </h1>
                  <div className="mt-3 inline-flex items-center gap-2 bg-[#E8F1EE] border border-[#CFE2DC] rounded-full px-4 py-2">
                    <i className="ri-save-3-line text-[#1A5C4F] text-sm"></i>
                    <span className="text-sm font-semibold text-[#1A5C4F]">Your assessment answers are saved</span>
                  </div>
                </>
              ) : (
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Get Your ESA Letter</h1>
              )}
            </div>

            {/* Full Step Indicator — sits in the page flow (not fixed).
                Hidden on Step 3 so the checkout surface stays focused on
                the secure-payment area (no progress bar, no Done checks,
                no motivational copy competing with the Pay CTA). */}
            {currentStep !== 3 && (
              <StepIndicator
                currentStep={currentStep}
                answeredInStep1={answeredInStep1}
                totalInStep1={13}
              />
            )}

            {/* Live status banner — only show on Step 1 to keep checkout focused */}
            {currentStep === 1 && <LiveStatusBanner />}

            {/* Test mode banner — hidden on Step 3 to keep checkout focused */}
            {isTestMode && currentStep !== 3 && (
              <div className="mb-4 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 flex items-center justify-center bg-amber-200 rounded-lg flex-shrink-0">
                    <i className="ri-flask-line text-amber-700 text-sm"></i>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-extrabold text-amber-800">Test Mode Active</p>
                    <p className="text-[10px] text-amber-600">Pre-filled with test data · Alex TestUser · TX · Buddy</p>
                  </div>
                </div>
                <a
                  href="/assessment"
                  className="whitespace-nowrap text-[10px] font-bold text-amber-700 hover:text-amber-900 border border-amber-300 rounded-lg px-2.5 py-1.5 bg-white transition-colors cursor-pointer flex-shrink-0"
                >
                  Exit Test
                </a>
              </div>
            )}

            {/* Checkout error banner */}
            {checkoutError && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-xl px-5 py-4 flex items-start gap-3">
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className="ri-error-warning-line text-red-500"></i>
                </div>
                <div>
                  <p className="text-sm font-bold text-red-800">Payment setup failed</p>
                  <p className="text-xs text-red-600 mt-0.5">{checkoutError} — please try again or call 409-965-5885 for help.</p>
                </div>
              </div>
            )}

            {/* Form Steps */}
            <div className="bg-transparent">
              {currentStep === 1 && (
                <Step1Assessment data={step1} onChange={setStep1} onNext={goNext} useStep1V2={useStep1V2} />
              )}
              {currentStep === 2 && (
                <Step2PersonalInfo
                  data={step2}
                  onChange={setStep2}
                  onNext={goNext}
                  onBack={goBack}
                  onEditState={() => { setStateConfirmed(false); window.scrollTo(0, 0); }}
                />
              )}
              {/* Checkout gates: email OTP → assurance → payment. */}
              {currentStep === 3 && checkoutGate === "otp" && (
                <CustomerOtpStep
                  email={step2.email}
                  firstName={step2.firstName}
                  confirmationId={confirmationId.current}
                  letterType="esa"
                  accent="esa"
                  onVerified={handleOtpVerified}
                  onBack={goBack}
                />
              )}
              {currentStep === 3 && checkoutGate === "assurance" && (
                <AssuranceScreen
                  letterType="esa"
                  accent="esa"
                  onContinue={() => { setCheckoutGate("package"); window.scrollTo(0, 0); }}
                  onViewPortal={handleViewPortal}
                  onBack={() => setCheckoutGate("otp")}
                />
              )}
              {currentStep === 3 && checkoutGate === "package" && (
                <PackageSelectionStep
                  letterType="esa"
                  accent="esa"
                  petCount={step2.pets.length}
                  selectedPackage={selectedPackage}
                  onSelect={handlePackageSelect}
                  onBack={() => setCheckoutGate(directCheckout ? "pay" : "assurance")}
                  confirmationId={confirmationId.current}
                />
              )}
              {currentStep === 3 && checkoutGate === "pay" && (
                <Suspense fallback={<Step3LoadingFallback />}>
                  <Step3Checkout
                    step1={step1}
                    step2={step2}
                    data={step3}
                    onChange={handleStep3Change}
                    packageKey={selectedPackage}
                    onPackageChange={handlePackageChange}
                    onChangePackage={() => { trackPackageChangeOpened(confirmationId.current, "esa"); setCheckoutGate("package"); window.scrollTo(0, 0); }}
                    onSubmit={handleSubmit}
                    onBack={goBack}
                    submitting={submitting}
                    preSelectedDoctorId={preSelectedDoctorId}
                    stripeClientSecret={stripeClientSecret}
                    stripeSecretLoading={stripeSecretLoading}
                    stripeSecretError={stripeSecretError}
                    onRetryClientSecret={() => fetchClientSecret(step2, confirmationId.current, appliedCoupon)}
                    onPaymentSuccess={handlePaymentSuccess}
                    confirmationId={confirmationId.current}
                    onCouponApplied={handleCouponApplied}
                    appliedCoupon={appliedCoupon}
                    petCount={step2.pets.length}
                    onBeforeRedirect={handleBeforeRedirect}
                    quotedBasePrice={quotedBasePriceDollars ?? undefined}
                  />
                </Suspense>
              )}
            </div>

            {/* What Happens Next timeline */}
            <WhatHappensNext />


          </>
        )}
      </div>
    </div>
  );
}
