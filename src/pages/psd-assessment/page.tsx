import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import PSDAssessmentNavbar from "./components/PSDAssessmentNavbar";
import PSDStep1, { PSDStep1Data } from "./components/PSDStep1";
import PSDStep3Checkout from "./components/PSDStep3Checkout";
import Step2PersonalInfo, { Step2Data } from "../assessment/components/Step2PersonalInfo";
import StepIndicator from "../assessment/components/StepIndicator";
import ExitIntentOverlay from "../assessment/components/ExitIntentOverlay";
import { useAssessmentTracking } from "../../hooks/useAssessmentTracking";
import { logAudit, loggedFetch } from "@/lib/auditLogger";
import {
  buildAttributionJson,
  getAttribution,
  setConfirmationId as storeSetConfirmationId,
  buildFullSource,
} from "@/lib/attributionStore";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;
const RESUME_ORDER_URL = `${SUPABASE_URL}/functions/v1/get-resume-order`;

// Delegates to attributionStore — single source of truth
function getTrafficSource(): string { return buildFullSource(); }
function getLandingUrl(): string { return getAttribution().landing_url ?? window.location.href; }

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
  const [confirmationId, setConfirmationId] = useState(() => {
    const id = generateConfirmationId();
    storeSetConfirmationId(id);
    return id;
  });
  const [saving, setSaving] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(!!resumeConfirmationId);
  const [resumeNotFound, setResumeNotFound] = useState(false);
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
        body: JSON.stringify({ email, letterType: "psd" }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      setResendState(result.ok ? "sent" : "error");
    } catch {
      setResendState("error");
    }
  };
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
          void logAudit({
            actor_name: "system",
            actor_role: "system",
            object_type: "system",
            object_id: resumeConfirmationId,
            action: "resume_order_not_found",
            description: `PSD resume flow: order not found for confirmation ID ${resumeConfirmationId}`,
            metadata: {
              confirmation_id: resumeConfirmationId,
              letter_type: "psd",
              error: result.error ?? "not_found",
              timestamp: new Date().toISOString(),
            },
          });
          return;
        }

        if (result.order.already_paid) {
          navigate("/psd-assessment/thank-you");
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
      } catch (err) {
        setResumeNotFound(true);
        void logAudit({
          actor_name: "system",
          actor_role: "system",
          object_type: "system",
          object_id: resumeConfirmationId,
          action: "resume_order_network_error",
          description: `PSD resume flow: network/parse error for confirmation ID ${resumeConfirmationId}`,
          metadata: {
            confirmation_id: resumeConfirmationId,
            letter_type: "psd",
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

  const saveLeadToSupabase = async (step2Data: Step2Data) => {
    setSaving(true);
    const assessmentPayload = {
      ...step1,
      pets: step2Data.pets,
      dob: step2Data.dob,
      letterType: "psd",
    };

    // ── Capture full attribution via centralized store ─────────────────────
    const attr = getAttribution();
    const gclidVal       = attr.gclid;
    const fbclidVal      = attr.fbclid;
    const utmSourceVal   = attr.utm_source;
    const utmMediumVal   = attr.utm_medium;
    const utmCampaignVal = attr.utm_campaign;
    const utmTermVal     = attr.utm_term;
    const utmContentVal  = attr.utm_content;
    const landingUrlVal  = attr.landing_url;
    const attributionJsonVal = buildAttributionJson("step2_lead_psd");

    // Save via service_role edge function — bypasses RLS + CHECK constraints reliably
    try {
      await loggedFetch(
        "get-resume-order/upsert-psd-lead",
        RESUME_ORDER_URL,
        {
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
            gclid:        gclidVal,
            fbclid:       fbclidVal,
            utmSource:    utmSourceVal,
            utmMedium:    utmMediumVal,
            utmCampaign:  utmCampaignVal,
            utmTerm:      utmTermVal,
            utmContent:   utmContentVal,
            landingUrl:   landingUrlVal,
            sessionId:    attr.session_id,
            attributionJson: attributionJsonVal,
          }),
        },
        confirmationId,
      );
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
      <PSDAssessmentNavbar />

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
            <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
              <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-full mb-4">
                <i className="ri-error-warning-line text-amber-500 text-2xl"></i>
              </div>
              <h2 className="text-xl font-extrabold text-gray-900 mb-2">Link expired or not found</h2>
              <p className="text-sm text-gray-500 mb-6 max-w-sm">This resume link may have expired or already been used. Enter your email below to receive a new payment link, or start a fresh assessment.</p>

              {/* Resend payment link form */}
              <div className="w-full bg-white border border-gray-200 rounded-xl p-5 mb-5 text-left">
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
                        className="flex-1 px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-400 transition-colors"
                        onKeyDown={(e) => { if (e.key === "Enter") handleResendLink(); }}
                      />
                      <button
                        type="button"
                        onClick={handleResendLink}
                        disabled={resendState === "sending"}
                        className="whitespace-nowrap px-4 py-2.5 bg-amber-600 text-white text-sm font-bold rounded-lg hover:bg-amber-700 disabled:opacity-60 cursor-pointer transition-colors"
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
