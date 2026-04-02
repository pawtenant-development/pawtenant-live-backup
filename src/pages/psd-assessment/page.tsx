import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import PSDStep1, { PSDStep1Data } from "./components/PSDStep1";
import PSDStep3Checkout from "./components/PSDStep3Checkout";
import Step2PersonalInfo, { Step2Data } from "../assessment/components/Step2PersonalInfo";
import StepIndicator from "../assessment/components/StepIndicator";
import ExitIntentOverlay from "../assessment/components/ExitIntentOverlay";
import { supabase } from "../../lib/supabaseClient";
import { useAssessmentTracking } from "../../hooks/useAssessmentTracking";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;
const RESUME_ORDER_URL = `${SUPABASE_URL}/functions/v1/get-resume-order`;

function getTrafficSource(): string {
  const gclid = sessionStorage.getItem("gclid");
  const fbclid = sessionStorage.getItem("fbclid");
  const utmSource = sessionStorage.getItem("utm_source") ?? "";
  const referrer = sessionStorage.getItem("referrer") ?? document.referrer;
  if (gclid) return "Google Ads";
  if (fbclid) return "Facebook / Instagram Ads";
  if (utmSource.toLowerCase().includes("google")) return "Google Ads";
  if (utmSource.toLowerCase().includes("facebook") || utmSource.toLowerCase().includes("instagram")) return "Facebook / Instagram Ads";
  if (referrer) {
    try {
      const host = new URL(referrer).hostname;
      if (host.includes("google")) return "Google Organic";
      if (host.includes("bing")) return "Bing Organic";
      return `Referral: ${host}`;
    } catch { return referrer; }
  }
  return "Direct";
}

function getLandingUrl(): string {
  return sessionStorage.getItem("landing_url") ?? window.location.href;
}

const DEFAULT_STEP1: PSDStep1Data = {
  dogTasks: [],
  taskTraining: "",
  taskDescription: "",
  taskReliability: "",
  taskPublicAccess: "",
  taskEvidenceUrl: "",
  taskEvidenceType: "",
  dogDuration: "",
  emotionalFrequency: "",
  conditions: [],
  lifeChangeStress: "",
  dailyImpact: "",
  medication: "",
  medicationDetails: "",
  priorDiagnosis: "",
  specificDiagnosis: "",
  currentTreatment: "",
  treatmentDetails: "",
  dogHelpDescription: "",
  housingType: "",
};

const DEFAULT_STEP2: Step2Data = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dob: "",
  state: "",
  deliverySpeed: "",
  pets: [{ name: "", type: "Dog", age: "", breed: "", weight: "" }],
  additionalDocs: undefined,
};

function generateConfirmationId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const rand = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `PT-PSD${rand}`;
}

export default function PSDAssessmentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const resumeConfirmationId = searchParams.get("resume") ?? "";

  // ?ref= captures any value: ?ref=fb-psd-promo, ?ref=tiktok-ad1, etc.
  // Fires "Assessment Started" event to GHL + Google Sheets on mount.
  const tracking = useAssessmentTracking({
    letterType: "psd",
    isResume: !!resumeConfirmationId,
  });
  const referredBy = tracking.ref || tracking.fullSource || null;

  const [step, setStep] = useState(1);
  const [step1, setStep1] = useState<PSDStep1Data>(DEFAULT_STEP1);
  const [step2, setStep2] = useState<Step2Data>(DEFAULT_STEP2);
  const [confirmationId, setConfirmationId] = useState(generateConfirmationId);
  const [saving, setSaving] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(!!resumeConfirmationId);
  const [resumeNotFound, setResumeNotFound] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reliable cross-browser + iOS mobile scroll to top on step change
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [step]);

  // ── Resume flow: ?resume=CONFIRMATION_ID ─────────────────────────────────
  useEffect(() => {
    if (!resumeConfirmationId) return;

    const fetchLead = async () => {
      setResumeLoading(true);
      try {
        const res = await fetch(RESUME_ORDER_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
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

        if (result.order.already_paid) {
          navigate("/assessment/thank-you");
          return;
        }

        const data = result.order;
        const answers = (data.assessment_answers ?? {}) as Record<string, unknown>;

        // Restore step 1 PSD answers
        setStep1({
          dogTasks: (answers.dogTasks as string[]) ?? [],
          taskTraining: (answers.taskTraining as string) ?? "",
          taskDescription: (answers.taskDescription as string) ?? "",
          taskReliability: (answers.taskReliability as string) ?? "",
          taskPublicAccess: (answers.taskPublicAccess as string) ?? "",
          taskEvidenceUrl: (answers.taskEvidenceUrl as string) ?? "",
          taskEvidenceType: (answers.taskEvidenceType as string) ?? "",
          dogDuration: (answers.dogDuration as string) ?? "",
          emotionalFrequency: (answers.emotionalFrequency as string) ?? "",
          conditions: (answers.conditions as string[]) ?? [],
          lifeChangeStress: (answers.lifeChangeStress as string) ?? "",
          dailyImpact: (answers.dailyImpact as string) ?? "",
          medication: (answers.medication as string) ?? "",
          medicationDetails: (answers.medicationDetails as string) ?? "",
          priorDiagnosis: (answers.priorDiagnosis as string) ?? "",
          specificDiagnosis: (answers.specificDiagnosis as string) ?? "",
          currentTreatment: (answers.currentTreatment as string) ?? "",
          treatmentDetails: (answers.treatmentDetails as string) ?? "",
          dogHelpDescription: (answers.dogHelpDescription as string) ?? "",
          housingType: (answers.housingType as string) ?? "",
        });

        // Restore step 2 personal info
        setStep2({
          firstName: (data.first_name as string) ?? "",
          lastName: (data.last_name as string) ?? "",
          email: (data.email as string) ?? "",
          phone: (data.phone as string) ?? "",
          dob: (answers.dob as string) ?? "",
          state: (data.state as string) ?? "",
          deliverySpeed: (data.delivery_speed as string) ?? "",
          pets: (answers.pets as Step2Data["pets"]) ?? [{ name: "", type: "Dog", age: "", breed: "", weight: "" }],
          additionalDocs: undefined,
        });

        // Use the saved confirmation ID so payment upserts the right row
        setConfirmationId(resumeConfirmationId);
        setStep(3);
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

  const saveLeadToSupabase = async (step2Data: Step2Data) => {
    setSaving(true);
    const assessmentPayload = {
      ...step1,
      pets: step2Data.pets,
      dob: step2Data.dob,
      letterType: "psd",
    };

    // Save via service_role edge function — bypasses RLS + CHECK constraints reliably
    try {
      await fetch(RESUME_ORDER_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          action: "upsert",
          confirmationId,
          email: step2Data.email,
          firstName: step2Data.firstName,
          lastName: step2Data.lastName,
          phone: step2Data.phone,
          state: step2Data.state,
          deliverySpeed: "priority",
          assessmentAnswers: assessmentPayload,
          letterType: "psd",
          status: "lead",
          referredBy: referredBy ?? "",
        }),
      });
    } catch {
      // silent — GHL webhook + Google Sheets still fire below
    }

    // Trigger full Google Sheets sync after 2s so all columns are correct
    setTimeout(() => {
      fetch(`${SUPABASE_URL}/functions/v1/sync-to-sheets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }).catch(() => {});
    }, 2000);

    // Fire GHL early lead (abandonment capture — same as ESA)
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
          firstName: step2Data.firstName,
          lastName: step2Data.lastName,
          email: step2Data.email,
          phone: step2Data.phone,
          dateOfBirth: step2Data.dob,
          state: step2Data.state,
          leadStatus: "Incomplete – Abandoned at Checkout",
          confirmationId,
          letterType: "psd",
          numberOfPets: step2Data.pets.length,
          pets: step2Data.pets.map((p, i) => ({
            petNumber: i + 1,
            name: p.name,
            type: p.type || "Dog",
            breed: p.breed,
            age: p.age,
          })),
          dogTasks: step1.dogTasks?.join(", ") ?? "",
          conditions: step1.conditions?.join(", ") ?? "",
          priorDiagnosis: step1.priorDiagnosis ?? "",
          leadSource: "PSD Assessment Form – Step 2 Submitted",
          ref: referredBy ?? "",
          landingUrl: getLandingUrl(),
          trafficSource: referredBy ? `${referredBy} (${getTrafficSource()})` : getTrafficSource(),
          submittedAt: new Date().toISOString(),
          tags: ["PSD Assessment", "Step 2 Completed", "Needs Follow-up"],
        }),
      });
    } catch {
      // Silently fail — never block user flow
    }

    setSaving(false);
  };

  const handleStep2Next = async () => {
    await saveLeadToSupabase(step2);
    setStep(3);
  };

  return (
    <div className="min-h-screen bg-[#f8f7f4]" ref={topRef}>
      <ExitIntentOverlay
        progressPercent={step === 1 ? 33 : step === 2 ? 66 : 90}
        currentStep={step}
        onStay={() => {}}
        letterType="psd"
      />
      <title>Psychiatric Service Dog Letter Online — ADA Compliant PSD Letter | PawTenant</title>
      <meta name="description" content="Get a legitimate Psychiatric Service Dog (PSD) letter from a licensed mental health professional. ADA compliant, HIPAA secure, delivered within 24 hours. Start your free PSD assessment." />
      <meta name="robots" content="index, follow" />
      <link rel="canonical" href="https://www.pawtenant.com/psd-assessment" />
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-6 h-16 flex items-center justify-between sticky top-0 z-50">
        <Link to="/" className="cursor-pointer">
          <img src="https://static.readdy.ai/image/0ebec347de900ad5f467b165b2e63531/65581e17205c1f897a31ed7f1352b5f3.png"
            alt="PawTenant" className="h-10 w-auto object-contain" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold text-amber-700">
            <i className="ri-shield-star-line"></i>Psychiatric Service Dog Letter
          </span>
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <i className="ri-lock-2-line text-green-500"></i>
            <span className="hidden sm:inline">HIPAA Secured</span>
          </div>
        </div>
      </nav>

      {/* PSD Banner */}
      <div className="bg-amber-600 text-white text-center py-2.5 px-4">
        <p className="text-xs font-bold flex items-center justify-center gap-2">
          <i className="ri-service-line"></i>
          PSD letters comply with the Americans with Disabilities Act (ADA) — not the Fair Housing Act. Your dog must perform specific trained tasks.
          <i className="ri-service-line"></i>
        </p>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <StepIndicator
          currentStep={step}
          steps={[
            { label: "PSD Assessment", step: 1 },
            { label: "Your Information", step: 2 },
            { label: "Checkout", step: 3 },
          ]}
        />

        <div className="mt-6">
          {/* Resume loading state */}
          {resumeLoading ? (
            <div className="flex flex-col items-center justify-center py-32">
              <i className="ri-loader-4-line animate-spin text-4xl text-amber-500 mb-4"></i>
              <p className="text-base font-bold text-gray-700 mb-1">Loading your saved assessment...</p>
              <p className="text-sm text-gray-400">This only takes a second.</p>
            </div>
          ) : resumeNotFound ? (
            <div className="flex flex-col items-center justify-center py-32 text-center">
              <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-full mb-4">
                <i className="ri-error-warning-line text-amber-500 text-2xl"></i>
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 mb-2">Link expired or not found</h2>
              <p className="text-sm text-gray-500 mb-6 max-w-sm">This resume link may have expired or already been used. Start a fresh PSD assessment below.</p>
              <button
                type="button"
                onClick={() => { setResumeNotFound(false); setStep(1); }}
                className="whitespace-nowrap flex items-center gap-2 px-6 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 cursor-pointer transition-colors"
              >
                <i className="ri-arrow-right-line"></i>Start Fresh Assessment
              </button>
            </div>
          ) : (
            <>
              {resumeConfirmationId && step === 3 && (
                <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <i className="ri-save-3-line text-amber-500 text-sm flex-shrink-0"></i>
                  <span className="text-sm font-semibold text-amber-800">Your PSD assessment answers have been restored — complete your payment below.</span>
                </div>
              )}

              {step === 1 && (
                <PSDStep1
                  data={step1}
                  onChange={setStep1}
                  onNext={() => setStep(2)}
                />
              )}

              {step === 2 && (
                <Step2PersonalInfo
                  data={step2}
                  onChange={setStep2}
                  onNext={handleStep2Next}
                  onBack={() => setStep(1)}
                  mode="psd"
                />
              )}

              {step === 3 && (
                <PSDStep3Checkout
                  step1={step1}
                  step2={step2}
                  confirmationId={confirmationId}
                  onBack={() => setStep(2)}
                />
              )}
            </>
          )}
        </div>

        {saving && (
          <p className="text-xs text-gray-400 mt-4 flex items-center justify-center gap-1">
            <i className="ri-loader-4-line animate-spin"></i>Saving progress...
          </p>
        )}

        {/* Trust strip */}
        {!resumeLoading && !resumeNotFound && (
          <div className="mt-6 grid grid-cols-3 gap-2">
            {[
              { icon: "ri-shield-check-line", label: "HIPAA Compliant", color: "text-green-500" },
              { icon: "ri-award-line", label: "Licensed Providers", color: "text-orange-500" },
              { icon: "ri-refund-2-line", label: "Money-Back", color: "text-amber-500" },
            ].map((b) => (
              <div key={b.label} className="flex flex-col items-center gap-1 bg-white border border-gray-100 rounded-xl py-3 px-2 text-center">
                <div className="w-6 h-6 flex items-center justify-center"><i className={`${b.icon} ${b.color} text-base`}></i></div>
                <span className="text-xs font-semibold text-gray-600 leading-tight">{b.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
