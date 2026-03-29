import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import StepIndicator from "./components/StepIndicator";
import Step1Assessment, { type Step1Data } from "./components/Step1Assessment";
import Step2PersonalInfo, { type Step2Data } from "./components/Step2PersonalInfo";
import Step3Checkout, { type Step3Data } from "./components/Step3Checkout";
import ExitIntentOverlay from "./components/ExitIntentOverlay";
import WhatHappensNext from "./components/WhatHappensNext";
import LiveStatusBanner from "./components/LiveStatusBanner";
import DiscountPopup from "../../components/feature/DiscountPopup";
import { getDoctorsForState, ALL_STATES } from "../../mocks/doctors";
import { supabase } from "../../lib/supabaseClient";
import { useAssessmentTracking } from "../../hooks/useAssessmentTracking";

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

function fireFacebookPixel(price: number) {
  if (typeof window.fbq === "function") {
    window.fbq("track", "Purchase", { value: price, currency: "USD", content_name: "ESA Letter Assessment" });
    window.fbq("track", "Lead");
  }
}

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
const ESA_LETTER_URL = `${SUPABASE_URL}/functions/v1/generate-esa-letter`;

const GOOGLE_SHEETS_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbx04WIFe4-Fg2GqofuS9lrNWuFcA-IUNtQ_gK07x7Uz8Mjtk4ZTGBmSnSYfKki7NJrfIg/exec";

const SHEETS_SECRET = "pt-esa-2026-xK9m";

/**
 * Sends lead data to Google Sheets.
 * Columns: Timestamp | Confirmation ID | First Name | Last Name |
 * Email | Phone | State | Letter Type | Order Status |
 * Payment Status | Landing URL | Traffic Source | Ref
 */
async function fireGoogleSheetsWebhook(
  step2: Step2Data,
  confirmationId: string,
  ref: string = "",
) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) return;
  try {
    const source = getTrafficSource();
    const payload = {
      secret: SHEETS_SECRET,
      action: "lead",
      timestamp: new Date().toISOString(),
      confirmationId,
      firstName: step2.firstName,
      lastName: step2.lastName,
      email: step2.email,
      phone: step2.phone,
      state: ALL_STATES.find((s) => s.code === step2.state)?.name ?? step2.state,
      letterType: "ESA",
      orderStatus: "Lead – Checkout Not Completed",
      paymentStatus: "Unpaid",
      landingUrl: getLandingUrl(),
      // If ?ref= is present, show it prominently so you can sort/filter by source
      trafficSource: ref ? `${ref} (${source})` : source,
      ref,
    };
    await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Silently fail — never block user flow
  }
}

/**
 * Fires after successful payment to update the Google Sheet row
 * with order status and payment status.
 */
async function fireGoogleSheetsPaymentUpdate(opts: {
  confirmationId: string;
  orderStatus: string;
  paymentStatus: string;
}) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL) return;
  try {
    const payload = {
      secret: SHEETS_SECRET,
      action: "payment_update",
      confirmationId: opts.confirmationId,
      orderStatus: opts.orderStatus,
      paymentStatus: opts.paymentStatus,
    };
    await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Silently fail
  }
}

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
        leadStatus: "Incomplete – Abandoned at Checkout",
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
        leadSource: "ESA Assessment Form – Step 2 Submitted",
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
        leadStatus: "Paid – Order Completed",
        confirmationId,
        orderTotal: price,
        deliverySpeed: step2.deliverySpeed,
        selectedProvider: selectedDocName,
        pricingPlan: step2.deliverySpeed === "2-3days" ? "Standard ($90)" : "Priority 24h ($115)",
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
        leadSource: "ESA Assessment Form – Paid",
        landingUrl: getLandingUrl(),
        trafficSource: getTrafficSource(),
        submittedAt: new Date().toISOString(),
        tags: [
          "ESA Assessment",
          "Paid Customer",
          step2.deliverySpeed === "2-3days" ? "Standard Delivery" : "Priority Delivery",
          step3.plan === "subscription" ? "Subscription" : "One-Time",
          ...(step3.smsConsent === true ? ["SMS Opted-In"] : ["SMS Opted-Out"]),
        ],
      }),
    });
  } catch {
    // Silently fail
  }
}

// ─── Main Assessment Page ─────────────────────────────────────────────────────

export default function AssessmentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preSelectedDoctorId = searchParams.get("doctor") ?? "";
  const resumeConfirmationId = searchParams.get("resume") ?? "";

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
  const [step2, setStep2] = useState<Step2Data>(defaultStep2);
  const [step3, setStep3] = useState<Step3Data>({ selectedDoctorId: preSelectedDoctorId, plan: "one-time" });
  const [submitting, setSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [resolvedPriceCents, setResolvedPriceCents] = useState<number | null>(null);
  const [resumeLoading, setResumeLoading] = useState(!!resumeConfirmationId);
  const [resumeNotFound, setResumeNotFound] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount: number } | null>(null);
  const [resolvedBasePriceCents, setResolvedBasePriceCents] = useState<number | null>(null);

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

  // Fixed indicator height measurement — ResizeObserver handles dynamic updates
  const indicatorRef = useRef<HTMLDivElement>(null);
  const [indicatorHeight, setIndicatorHeight] = useState(0);

  // ── Subscription cleanup refs ─────────────────────────────────────────────
  // Track the current subscription ID so we can cancel it if the user
  // changes plan before paying, preventing "Incomplete" subscriptions piling up.
  const subscriptionIdRef = useRef<string | null>(null);
  const paymentCompletedRef = useRef(false);

  useEffect(() => {
    if (!indicatorRef.current) return;
    const update = () => {
      if (indicatorRef.current) setIndicatorHeight(indicatorRef.current.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(indicatorRef.current);
    return () => observer.disconnect();
  // ResizeObserver handles all dynamic size changes — no extra deps needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        setStep2({
          firstName: (data.first_name as string) ?? "",
          lastName: (data.last_name as string) ?? "",
          email: (data.email as string) ?? "",
          phone: (data.phone as string) ?? "",
          dob: (answers.dob as string) ?? "",
          state: (data.state as string) ?? "",
          pets: (answers.pets as Step2Data["pets"]) ?? [{ name: "", age: "", breed: "", type: "", weight: "" }],
          deliverySpeed: (data.delivery_speed as string) ?? "",
          additionalDocs: (answers.additionalDocs as Step2Data["additionalDocs"]) ?? undefined,
        });

        // Use the existing confirmation ID so payment upserts the right row
        confirmationId.current = resumeConfirmationId;
        setCurrentStep(3);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        setResumeNotFound(true);
      } finally {
        setResumeLoading(false);
      }
    };

    fetchLead();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-initialize payment intent when step 3 loads or plan/addons change ──
  useEffect(() => {
    if (currentStep !== 3) return;
    setClientSecret(null);
    setPaymentError("");
    setResolvedPriceCents(null);
    setResolvedBasePriceCents(null);

    const petCount = step2.pets.length;
    const selectedDoc = getDoctorsForState(step2.state).find((d) => d.id === step3.selectedDoctorId);
    const docName = selectedDoc ? `${selectedDoc.name}, ${selectedDoc.title}` : "";

    // Count extra documents beyond the standard ESA Letter
    const additionalDocTypes = (step2.additionalDocs?.types ?? []).filter((t) => t !== "ESA Letter");
    const additionalDocCount = additionalDocTypes.length;

    // Optimistic local price (cents) used until Stripe responds
    const is2to3Days = step2.deliverySpeed === "2-3days";
    const baseEstimate = step3.plan === "subscription" ? 10000 : (is2to3Days ? 9000 : 11500);
    const estimatedPrice = baseEstimate + additionalDocCount * 3000;

    const pendingOrder = {
      firstName: step2.firstName,
      lastName: step2.lastName,
      email: step2.email,
      selectedProvider: docName,
      pricingPlan: is2to3Days ? "Standard" : "Priority 24h",
      planType: step3.plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
      deliverySpeed: step2.deliverySpeed,
      petCount,
      price: estimatedPrice / 100,
      confirmationId: confirmationId.current,
      _step1: step1,
      _step2: step2,
      _step3Plan: step3.plan,
    };
    sessionStorage.setItem("esa_pending_order", JSON.stringify(pendingOrder));

    const addonServices = step3.addonServices ?? [];

    let cancelled = false;
    // Capture the subscription ID that was active when this effect started.
    // We'll pass it to the edge function so it can cancel the old one before
    // creating a new subscription — prevents "Incomplete" pile-up in Stripe.
    const prevSubscriptionId = subscriptionIdRef.current;

    const init = async () => {
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
            deliverySpeed: step2.deliverySpeed,
            email: step2.email,
            customerName: `${step2.firstName} ${step2.lastName}`,
            additionalDocCount,
            addonServices,
            couponCode: appliedCoupon?.code ?? null,
            couponDiscount: appliedCoupon?.discount ?? null,
            // Pass old subscription ID so edge function can cancel it first
            cancelSubscriptionId: prevSubscriptionId,
            metadata: {
              confirmationId: confirmationId.current,
              firstName: step2.firstName,
              lastName: step2.lastName,
              email: step2.email,
              phone: step2.phone,
              state: step2.state,
              selectedProvider: docName,
              planType: step3.plan,
              deliverySpeed: step2.deliverySpeed,
              petCount: String(petCount),
              additionalDocCount: String(additionalDocCount),
              addonServices: JSON.stringify(addonServices),
              ...(appliedCoupon ? { couponCode: appliedCoupon.code, couponDiscount: String(appliedCoupon.discount) } : {}),
            },
          }),
        });
        const json = await res.json() as { clientSecret?: string; amount?: number; basePriceAmount?: number; priceId?: string; subscriptionId?: string; error?: string };
        if (!cancelled) {
          if (json.clientSecret) {
            setClientSecret(json.clientSecret);
            // Store the new subscription ID so the next plan change can cancel it
            subscriptionIdRef.current = json.subscriptionId ?? null;
            if (json.amount) {
              setResolvedPriceCents(json.amount);
              if (json.basePriceAmount) setResolvedBasePriceCents(json.basePriceAmount);
              // Update sessionStorage with the real price
              try {
                const stored = JSON.parse(sessionStorage.getItem("esa_pending_order") ?? "{}");
                stored.price = json.amount / 100;
                stored.priceId = json.priceId ?? "";
                sessionStorage.setItem("esa_pending_order", JSON.stringify(stored));
              } catch {
                // ignore
              }
            }
          } else {
            setCheckoutError(json.error ?? "Failed to initialize payment.");
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
          setCheckoutError(msg);
        }
      } finally {
        if (!cancelled) setSubmitting(false);
      }
    };

    setSubmitting(true);
    // Debounce: wait 350ms before firing — prevents rapid plan toggles from
    // hammering the API and creating duplicate incomplete subscriptions.
    const timer = setTimeout(() => { init(); }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, step3.plan, JSON.stringify(step3.addonServices ?? []), appliedCoupon?.code]);

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
        }).catch(() => {});
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Step navigation ────────────────────────────────────────────────────────
  const goNext = async () => {
    if (currentStep === 2) {
      // Fire lead tracking
      fireGHLEarlyLead(step1, step2, confirmationId.current);
      fireGoogleSheetsWebhook(step2, confirmationId.current, tracking.ref);
      // Save lead to Supabase so it appears immediately in the admin portal
      saveLeadToSupabase();
      // Fire begin_checkout for Google Ads "Abandoned Checkout" remarketing audience
      const is2to3Days = step2.deliverySpeed === "2-3days";
      fireGoogleAdsBeginCheckout(is2to3Days ? 90 : 115);
    }
    setCurrentStep((s) => s + 1);
    // Use instant scroll for reliable cross-browser / iOS mobile behaviour
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const goBack = () => {
    setClientSecret(null);
    setPaymentError("");
    setResolvedPriceCents(null);
    setResolvedBasePriceCents(null);
    setCurrentStep((s) => s - 1);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  /** Called only if the user somehow clicks "Load Payment Form" fallback button */
  const handleSubmit = async () => {
    setSubmitting(true);
    setCheckoutError("");
    setPaymentError("");
    const petCount = step2.pets.length;
    const is2to3Days = step2.deliverySpeed === "2-3days";
    const additionalDocTypes = (step2.additionalDocs?.types ?? []).filter((t) => t !== "ESA Letter");
    const additionalDocCount = additionalDocTypes.length;
    const baseEstimate = step3.plan === "subscription" ? 10000 : (is2to3Days ? 9000 : 11500);
    const estimatedPrice = baseEstimate + additionalDocCount * 3000;
    const selectedDoc = getDoctorsForState(step2.state).find((d) => d.id === step3.selectedDoctorId);
    const docName = selectedDoc ? `${selectedDoc.name}, ${selectedDoc.title}` : "";

    const pendingOrder = {
      firstName: step2.firstName,
      lastName: step2.lastName,
      email: step2.email,
      selectedProvider: docName,
      pricingPlan: is2to3Days ? "Standard" : "Priority 24h",
      planType: step3.plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
      deliverySpeed: step2.deliverySpeed,
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
          deliverySpeed: step2.deliverySpeed,
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
            deliverySpeed: step2.deliverySpeed,
            petCount: String(petCount),
            additionalDocCount: String(additionalDocCount),
          },
        }),
      });
      const json = await res.json() as { clientSecret?: string; amount?: number; priceId?: string; error?: string };
      if (json.clientSecret) {
        setClientSecret(json.clientSecret);
        if (json.amount) setResolvedPriceCents(json.amount);
      } else {
        throw new Error(json.error ?? "Failed to initialize payment.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setCheckoutError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /** Trigger ESA letter PDF generation — fire-and-forget, never blocks UX */
  const triggerEsaLetterGeneration = (confId: string) => {
    fetch(ESA_LETTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({ confirmationId: confId }),
    }).catch(() => {
      // Silently ignore — PDF generation is best-effort from the client trigger
    });
  };

  /** Save lead to Supabase after Step 2 — uses service-role edge function to guarantee bypass of RLS */
  const saveLeadToSupabase = async () => {
    const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;
    const is2to3Days = step2.deliverySpeed === "2-3days";
    const estimatedPrice = is2to3Days ? 90 : 115;

    // Primary: service-role edge function (bypasses all RLS + CHECK constraints)
    try {
      await fetch(`${supabaseUrl}/functions/v1/get-resume-order`, {
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
          deliverySpeed: step2.deliverySpeed,
          price: estimatedPrice,
          letterType: "esa",
          status: "lead",
          referredBy: referredBy ?? "",
          assessmentAnswers: {
            ...step1,
            pets: step2.pets,
            dob: step2.dob,
            additionalDocs: step2.additionalDocs ?? null,
          },
        }),
      });
    } catch {
      // Fallback: direct anon client insert
      try {
        await supabase.from("orders").insert({
          user_id: null,
          confirmation_id: confirmationId.current,
          email: step2.email,
          first_name: step2.firstName,
          last_name: step2.lastName,
          state: step2.state,
          phone: step2.phone,
          delivery_speed: step2.deliverySpeed,
          price: estimatedPrice,
          payment_intent_id: null,
          letter_type: "esa",
          status: "lead",
          referred_by: referredBy,
          additional_documents_requested: step2.additionalDocs ?? null,
          assessment_answers: {
            ...step1,
            pets: step2.pets,
            dob: step2.dob,
            additionalDocs: step2.additionalDocs ?? null,
          },
        });
      } catch {
        // Silently fail — never block user flow
      }
    }

    // Trigger full Google Sheets sync so letterType/orderStatus/paymentStatus are correct
    triggerSheetsFullSync();
  };

  /** Save order to Supabase after successful payment — upserts the existing lead record */
  const saveOrderToSupabase = async (price: number, docName: string, paymentIntentId?: string, paymentMethod?: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("orders").upsert({
        user_id: user?.id ?? null,
        confirmation_id: confirmationId.current,
        email: step2.email,
        first_name: step2.firstName,
        last_name: step2.lastName,
        state: step2.state,
        phone: step2.phone,
        selected_provider: docName,
        plan_type: step3.plan === "subscription" ? "Subscription (Annual)" : "One-Time Purchase",
        delivery_speed: step2.deliverySpeed,
        price,
        payment_intent_id: paymentIntentId ?? null,
        payment_method: paymentMethod ?? null,
        letter_type: "esa",
        referred_by: referredBy,
        additional_documents_requested: step2.additionalDocs ?? null,
        addon_services: (step3.addonServices ?? []).length > 0 ? step3.addonServices : null,
        // IMPORTANT: always include pets, dob and additionalDocs so the
        // payment upsert doesn't overwrite the full assessment saved at lead time.
        assessment_answers: {
          ...step1,
          pets: step2.pets,
          dob: step2.dob,
          additionalDocs: step2.additionalDocs ?? null,
        },
        letter_url: null,
        status: "processing",
      }, { onConflict: "confirmation_id", ignoreDuplicates: false });
      if (error) {
        console.error("[saveOrderToSupabase] Upsert failed:", error.message, error.details, error.hint);
      }
    } catch (err) {
      console.error("[saveOrderToSupabase] Unexpected error:", err);
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

  /** Called when Stripe confirms payment successfully (inline card) */
  const handlePaymentSuccess = async (paymentIntentId: string) => {
    paymentCompletedRef.current = true; // prevent unmount cleanup from cancelling the subscription
    const selectedDoc = getDoctorsForState(step2.state).find((d) => d.id === step3.selectedDoctorId);
    // Use real price from Stripe; fall back to local estimate
    const is2to3Days = step2.deliverySpeed === "2-3days";
    const price = resolvedPriceCents != null
      ? resolvedPriceCents / 100
      : (step3.plan === "subscription" ? 100 : (is2to3Days ? 90 : 115));
    const docName = selectedDoc ? `${selectedDoc.name}, ${selectedDoc.title}` : "";

    // Read payment method stored in session storage by Step3Checkout
    const paymentMethod = (() => {
      try {
        return JSON.parse(sessionStorage.getItem("esa_pending_order") ?? "{}").paymentMethod ?? "card";
      } catch { return "card"; }
    })();

    sessionStorage.setItem("esa_payment_success", "true");
    fireFacebookPixel(price);
    // NOTE: Google Ads conversion fires on the thank-you page via its own useEffect
    // using the real label AW-11509262282/Va-eCP6ZvpEcEMrPhfAq — do NOT fire here
    fireGHLFinalLead(step1, step2, step3, docName, price, confirmationId.current);

    // Update Google Sheets with confirmed order + payment status
    fireGoogleSheetsPaymentUpdate({
      confirmationId: confirmationId.current,
      orderStatus: "Processing – Pending Review",
      paymentStatus: "Paid",
    });

    // Await order save so assign-doctor and generate-esa-letter can find the row immediately
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

    // Trigger PDF generation (fire-and-forget — user navigates away)
    triggerEsaLetterGeneration(confirmationId.current);

    console.log("[Assessment] navigate → /assessment/thank-you", {
      amount: price,
      order_id: paymentIntentId,
      resolvedPriceCents,
      rawPrice: price,
      paymentIntentId,
      urlWillBe: `/assessment/thank-you?amount=${price}&order_id=${paymentIntentId}`,
    });
    navigate(`/assessment/thank-you?amount=${price}&order_id=${paymentIntentId}`);
  };

  const handlePaymentError = (error: string) => {
    setPaymentError(error);
  };

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

  return (
    <div className="min-h-screen bg-orange-50">
      <title>Get Your ESA Letter Online — Free Assessment | PawTenant</title>
      <meta name="description" content="Complete our free emotional support animal assessment and get a legitimate ESA letter from a licensed mental health professional. Same-day delivery, HIPAA compliant, 100% money-back guarantee." />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href="https://www.pawtenant.com/assessment" />
      {/* Discount popup — only appears on checkout step, 18s delay */}
      {currentStep === 3 && <DiscountPopup key="checkout-discount" delayMs={18000} />}

      {/* Exit Intent Overlay */}
      <ExitIntentOverlay
        progressPercent={getProgressPercent()}
        currentStep={currentStep}
        onStay={() => {}}
      />

      {/* Minimal Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="flex items-center gap-2 cursor-pointer">
          <img
            src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant"
            className="h-10 w-auto object-contain"
          />
        </Link>
        <div className="flex items-center gap-5">
          <a
            href="tel:+14099655885"
            className="hidden sm:flex items-center gap-1.5 text-sm text-gray-600 hover:text-orange-500 transition-colors cursor-pointer"
          >
            <div className="w-5 h-5 flex items-center justify-center">
              <i className="ri-phone-line text-orange-500"></i>
            </div>
            409-965-5885
          </a>
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded-full px-3 py-1.5">
            <i className="ri-shield-check-line text-orange-500 text-xs"></i>
            <span className="text-xs font-semibold text-orange-700">HIPAA Secure</span>
          </div>
        </div>
      </nav>

      {/* ── FIXED Slim Progress Bar — only the bar + % follows on scroll ── */}
      {!resumeLoading && !resumeNotFound && (
        <div
          ref={indicatorRef}
          className="fixed top-16 left-0 right-0 z-40 w-full bg-white border-b border-orange-100"
        >
          <div className="max-w-6xl mx-auto px-6 py-2.5 flex items-center gap-3">
            <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-orange-400 to-orange-500 rounded-full transition-all duration-700 ease-out"
                style={{ width: `${Math.max(getProgressPercent(), 3)}%` }}
              />
            </div>
            <span className="text-xs font-bold text-orange-500 whitespace-nowrap">
              {getProgressPercent()}% complete
            </span>
          </div>
        </div>
      )}

      {/* Spacer that matches the fixed band height so content isn't hidden behind it */}
      {!resumeLoading && !resumeNotFound && (
        <div style={{ height: indicatorHeight }} aria-hidden="true" />
      )}

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
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 flex items-center justify-center bg-orange-100 rounded-full mb-4">
              <i className="ri-error-warning-line text-orange-500 text-2xl"></i>
            </div>
            <h2 className="text-xl font-extrabold text-gray-900 mb-2">Link expired or not found</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-sm">This payment link may have expired or already been used. Start a fresh assessment below.</p>
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
                  <h1 className="text-3xl font-extrabold text-gray-900">Complete Your Payment</h1>
                  <div className="mt-3 inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-full px-4 py-2">
                    <i className="ri-save-3-line text-orange-500 text-sm"></i>
                    <span className="text-sm font-semibold text-orange-700">Your assessment answers have been restored</span>
                  </div>
                </>
              ) : (
                <h1 className="text-3xl font-extrabold text-gray-900">Get Your ESA Letter</h1>
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
                  clientSecret={clientSecret}
                  paymentError={paymentError}
                  onPaymentSuccess={handlePaymentSuccess}
                  onPaymentError={handlePaymentError}
                  resolvedPriceCents={resolvedPriceCents}
                  resolvedBasePriceCents={resolvedBasePriceCents}
                  confirmationId={confirmationId.current}
                  onCouponApplied={setAppliedCoupon}
                  appliedCoupon={appliedCoupon}
                />
              )}
            </div>

            {/* What Happens Next timeline */}
            <WhatHappensNext />

            {/* Trust Footer */}
            <div className="mt-10 flex flex-wrap justify-center gap-6 text-xs text-gray-400">
              {[
                { icon: "ri-shield-check-line", label: "HIPAA Compliant" },
                { icon: "ri-lock-line", label: "256-bit SSL Encrypted" },
                { icon: "ri-award-line", label: "Licensed Professionals" },
                { icon: "ri-refund-2-line", label: "Money-Back Guarantee" },
                { icon: "ri-eye-off-line", label: "Information Confidential" },
              ].map((t) => (
                <div key={t.label} className="flex items-center gap-1.5">
                  <div className="w-4 h-4 flex items-center justify-center">
                    <i className={`${t.icon} text-orange-400`}></i>
                  </div>
                  {t.label}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
