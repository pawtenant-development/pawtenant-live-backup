import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import AssessmentNavbar from "./components/AssessmentNavbar";
import StepIndicator from "./components/StepIndicator";
import Step1Assessment, { type Step1Data } from "./components/Step1Assessment";
import Step2PersonalInfo, { type Step2Data } from "./components/Step2PersonalInfo";
import Step3Checkout, { type Step3Data } from "./components/Step3Checkout";
import ExitIntentOverlay from "./components/ExitIntentOverlay";
import WhatHappensNext from "./components/WhatHappensNext";
import LiveStatusBanner from "./components/LiveStatusBanner";


import { getDoctorsForState, ALL_STATES } from "../../mocks/doctors";
import { supabase } from "../../lib/supabaseClient";
import { useAssessmentTracking } from "../../hooks/useAssessmentTracking";
import { fireMetaPurchase, fireLead, fireInitiateCheckout } from "@/lib/metaPixel";
import { logAudit, loggedFetch } from "@/lib/auditLogger";
import {
  buildAttributionJson,
  getAttribution,
  setConfirmationId,
  setCouponCode,
  setSelectedState,
} from "@/lib/attributionStore";

const defaultStep1: Step1Data = {
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

function getAssessmentBasePrice(petCount: number, _deliverySpeed: string, plan: "one-time" | "subscription"): number {
  const n = Math.max(1, Math.min(3, petCount));
  if (plan === "subscription") return 99 + (n - 1) * 20;
  return 110 + (n - 1) * 25;
}

function getDiscountedAssessmentPrice(basePrice: number, coupon: { code: string; discount: number } | null): number {
  return Math.max(0, basePrice - (coupon?.discount ?? 0));
}

// ─── Test / Dev prefill data ──────────────────────────────────────────────────
const testStep1: Step1Data = {
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
  // Pre-select state from ?state=CA param (used by state landing pages + ad campaigns)
  const preSelectedState = searchParams.get("state") ?? "";

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
  const [step1, setStep1] = useState<Step1Data>(defaultStep1);
  const [step2, setStep2] = useState<Step2Data>({ ...defaultStep2, state: preSelectedState });
  const [step3, setStep3] = useState<Step3Data>({ selectedDoctorId: preSelectedDoctorId, plan: "one-time" });
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

  // ── Sync confirmation ID + coupon into attribution store ─────────────────
  useEffect(() => {
    setConfirmationId(confirmationId.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (appliedCoupon?.code) setCouponCode(appliedCoupon.code);
  }, [appliedCoupon]);

  useEffect(() => {
    if (preSelectedState) setSelectedState(preSelectedState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedState]);
  const isTestMode = searchParams.get("testCheckout") === "1";
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
        };
        setStep2(loadedStep2);

        // Use the existing confirmation ID so payment upserts the right row
        confirmationId.current = resumeConfirmationId;
        setCurrentStep(3);
        window.scrollTo({ top: 0, behavior: "smooth" });
        // Fetch Stripe client_secret immediately for resume flow
        fetchClientSecret(loadedStep2, resumeConfirmationId);
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
    if (currentStep !== 3) return;
    if (stripeClientSecret) return; // already have one — don't re-fetch
    const email = step2.email?.trim();
    if (!email || !email.includes("@") || !email.includes(".")) return;
    fetchClientSecret(step2, confirmationId.current, appliedCoupon);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, step2.email]);

  // ── Fetch Stripe client_secret from server ────────────────────────────────
  // Accepts step2 data directly so it works both from goNext (current state)
  // and from the resume useEffect (state hasn't updated yet).
  const fetchClientSecret = async (s2: Step2Data, confId: string, coupon: { code: string; discount: number } | null = null) => {
    // Guard: email must be a valid non-empty address before calling Stripe
    if (!s2.email || !s2.email.includes("@") || !s2.email.includes(".")) return;
    // In-flight lock — prevents duplicate concurrent calls (resume + retry + useEffect)
    if (stripeSecretInFlight.current) return;
    stripeSecretInFlight.current = true;
    setStripeSecretLoading(true);
    setStripeSecretError("");
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
            plan: step3.plan,
            couponCode: coupon?.code ?? "",
          }),
        },
        confId,
      );
      const result = (await res.json()) as { clientSecret?: string; paymentIntentId?: string; error?: string };
      if (result.clientSecret) {
        setStripeClientSecret(result.clientSecret);
        setStripePaymentIntentId(result.paymentIntentId ?? "");
        setStripeSecretError("");
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
  const goNext = async () => {
    if (currentStep === 2) {
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
      fireLead();
      fireInitiateCheckout({ value: estimate, content_name: "ESA Letter Checkout" });
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
            assessmentAnswers: {
              ...step1,
              pets: step2.pets,
              dob: step2.dob,
              additionalDocs: step2.additionalDocs ?? null,
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
      _step1: step1 as Record<string, unknown>,
      _step2: step2 as Record<string, unknown>,
      _step3Plan: step3.plan,
    };
    sessionStorage.setItem("esa_pending_order", JSON.stringify(pendingOrder));
  };

  /** Called when Stripe confirms payment successfully (inline card) */
  const handlePaymentSuccess = async (paymentIntentId: string) => {
    paymentCompletedRef.current = true; // prevent unmount cleanup from cancelling the subscription
    const selectedDoc = getDoctorsForState(step2.state).find((d) => d.id === step3.selectedDoctorId);
    // Compute correct price based on actual pet count + delivery speed + plan
    const basePrice = getAssessmentBasePrice(step2.pets.length, "", step3.plan);
    const price = getDiscountedAssessmentPrice(basePrice, appliedCoupon);
    const docName = selectedDoc ? `${selectedDoc.name}, ${selectedDoc.title}` : "";

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
    if (currentStep === 1) return Math.round((answeredInStep1 / 12) * 30);
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
    <div className="min-h-screen bg-orange-50">
      <title>Get Your ESA Letter Online — Free Assessment | PawTenant</title>
      <meta name="description" content="Complete our free emotional support animal assessment and get a legitimate ESA letter from a licensed mental health professional. Same-day delivery, HIPAA compliant, 100% money-back guarantee." />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href="https://www.pawtenant.com/assessment" />
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
            <i className="ri-loader-4-line animate-spin text-4xl text-orange-500 mb-4"></i>
            <p className="text-base font-bold text-gray-700 mb-1">Loading your saved assessment...</p>
            <p className="text-sm text-gray-400 mb-6">This only takes a second.</p>
          </div>
        ) : resumeNotFound ? (
          <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
            <div className="w-16 h-16 flex items-center justify-center bg-orange-100 rounded-full mb-4">
              <i className="ri-error-warning-line text-orange-500 text-2xl"></i>
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
                      className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-orange-400 transition-colors"
                      onKeyDown={(e) => { if (e.key === "Enter") handleResendLink(); }}
                    />
                    <button
                      type="button"
                      onClick={handleResendLink}
                      disabled={resendState === "sending"}
                      className="whitespace-nowrap px-4 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 disabled:opacity-60 cursor-pointer transition-colors"
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
              className="whitespace-nowrap flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-bold rounded-xl hover:bg-orange-600 cursor-pointer transition-colors"
            >
              <i className="ri-arrow-right-line"></i>Start Fresh Assessment
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-4">
              <p className="text-orange-500 text-xs font-bold tracking-widest uppercase mb-2">ESA Assessment</p>
              {resumeConfirmationId && currentStep === 3 ? (
                <>
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Complete Your Payment</h1>
                  <div className="mt-3 inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-2">
                    <i className="ri-save-3-line text-orange-500 text-sm"></i>
                    <span className="text-sm font-semibold text-orange-700">Your assessment answers have been restored</span>
                  </div>
                </>
              ) : (
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">Get Your ESA Letter</h1>
              )}
            </div>

            {/* Full Step Indicator — sits in the page flow (not fixed) */}
            <StepIndicator
              currentStep={currentStep}
              answeredInStep1={answeredInStep1}
              totalInStep1={12}
            />

            {/* Live status banner — only show on Step 1 to keep checkout focused */}
            {currentStep === 1 && <LiveStatusBanner />}

            {/* Test mode banner */}
            {isTestMode && (
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
                <Step1Assessment data={step1} onChange={setStep1} onNext={goNext} />
              )}
              {currentStep === 2 && (
                <Step2PersonalInfo data={step2} onChange={setStep2} onNext={goNext} onBack={goBack} />
              )}
              {currentStep === 3 && (
                <Step3Checkout
                  step1={step1}
                  step2={step2}
                  data={step3}
                  onChange={setStep3}
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
                />
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
