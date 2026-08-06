import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import PSDAssessmentNavbar from "./components/PSDAssessmentNavbar";
import PSDStep1, { PSDStep1Data } from "./components/PSDStep1";
// Step 3 (payment) is code-split — Stripe.js / Klarna / payment forms load only at Step 3.
import Step2PersonalInfo, { Step2Data } from "../assessment/components/Step2PersonalInfo";
import StepIndicator from "../assessment/components/StepIndicator";
import ExitIntentOverlay from "../assessment/components/ExitIntentOverlay";
import StateSelectionStep from "../assessment/components/StateSelectionStep";
import CustomerOtpStep from "../assessment/components/CustomerOtpStep";
import AssuranceScreen from "../assessment/components/AssuranceScreen";
import PackageSelectionStep from "../assessment/components/PackageSelectionStep";
import { supabase } from "../../lib/supabaseClient";
import { usePsdAutosave, storeAssessmentToken, readAssessmentToken, readDraft } from "./usePsdAutosave";
import { nextBookingGate } from "@/lib/bookingProgress";
import { readResumeToken, hadLegacyResumeParam } from "@/lib/resumeTokenParam";
import { isDirectCheckout, flowVersionProp } from "@/config/flowVersion";
import type { PackageKey } from "@/config/pricing";
import type { StateAcknowledgment } from "../assessment/components/StateAcknowledgmentModal";
import { getPsdOneTimeTotal } from "@/config/pricing";
import { useAssessmentTracking } from "../../hooks/useAssessmentTracking";
import { logAudit, loggedFetch } from "@/lib/auditLogger";
import { trackAssessmentSubmitted, trackPostOtpDestination, trackPackageChangeOpened, trackPackageSelected } from "@/lib/trackEvent";
import {
  buildAttributionJson,
  getAttribution,
  getFirstTouch,
  getLastTouch,
  setConfirmationId as storeSetConfirmationId,
  buildFullSource,
  stripCredentialParams,
} from "@/lib/attributionStore";

// Lazy-loaded PSD Step 3 checkout (payment) — split into its own bundle chunk.
const PSDStep3Checkout = lazy(() => import("./components/PSDStep3Checkout"));

// Lightweight fallback shown only while the payment chunk loads (usually instant).
function PSDStep3LoadingFallback() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5]"></i>
      <p className="mt-3 text-sm font-semibold text-gray-500">Loading secure checkout…</p>
    </div>
  );
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

const GHL_PROXY_URL = `${SUPABASE_URL}/functions/v1/ghl-webhook-proxy`;
const RESUME_ORDER_URL = `${SUPABASE_URL}/functions/v1/get-resume-order`;

// Delegates to attributionStore — single source of truth
function getTrafficSource(): string { return buildFullSource(); }
// Credential-stripped on BOTH paths — the live-URL fallback can run before the
// ?rt= scrub, and this value reaches the order row, GHL and analytics.
// ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §J
function getLandingUrl(): string {
  return stripCredentialParams(getAttribution().landing_url ?? window.location.href);
}

const DEFAULT_STEP1: PSDStep1Data = {
  safetyCheck: "",
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
  const resumeConfirmationId = searchParams.get("resume") ?? (hadLegacyResumeParam(searchParams) ? "legacy" : "");
  // `?rt=` carries an expiring, single-use, order-bound resume token. Read once,
  // then scrubbed from the URL before the exchange await (see the resume effect
  // below) so it never persists in history, referrers or logs.
  // ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001
  // Read via the helper: the pre-boot inline script has already scrubbed the
  // address bar, so the raw value now arrives in memory rather than in the URL.
  const resumeToken = readResumeToken(searchParams);
  // ORDER-STABLE-SIMPLE-CHECKOUT-RESUME-LINKS-001 — memory-only stable handoff.
  const checkoutResume =
    typeof window !== "undefined"
      ? (window as unknown as { __ptCheckoutResume?: Record<string, unknown> }).__ptCheckoutResume
      : undefined;
  // POST-OTP-DIRECT-CHECKOUT-001: verified customers land on checkout directly.
  const directCheckout = isDirectCheckout();

  // ?ref= captures any value: ?ref=fb-psd-promo, ?ref=tiktok-ad1, etc.
  // Fires "Assessment Started" event to GHL + Google Sheets on mount.
  const tracking = useAssessmentTracking({
    letterType: "psd",
    isResume: !!resumeConfirmationId || !!resumeToken,
  });
  const referredBy = tracking.ref || tracking.fullSource || null;

  const [step, setStep] = useState(1);
  // ── Flow gates (2026-07 restructure) — state first, OTP before checkout ──
  const [stateConfirmed, setStateConfirmed] = useState(false);
  const [checkoutGate, setCheckoutGate] = useState<"otp" | "assurance" | "package" | "pay">("otp");
  // Optional preselect from the PSD cost-page combo CTA (?package=psd_ra_bundle):
  // pre-highlights the RA card only — OTP and server-side pricing are unaffected.
  const [selectedPackage, setSelectedPackage] = useState<PackageKey>(() => {
    try {
      return new URLSearchParams(window.location.search).get("package") === "psd_ra_bundle"
        ? "psd_ra_bundle" : "psd_standard";
    } catch { return "psd_standard"; }
  });
  // Restored billing plan on resume (POST-OTP-DIRECT-CHECKOUT-001) — passed to
  // PSDStep3Checkout so a resumed annual customer stays annual.
  const [resumedPlan, setResumedPlan] = useState<"onetime" | "subscription" | null>(null);
  const [otpVerified, setOtpVerified] = useState(false);
  const verifiedEmailRef = useRef("");
  // Post-OTP routing target: first-time → "assurance"; resume → "package"/"pay".
  // (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001)
  const postOtpGateRef = useRef<"assurance" | "package" | "pay">("assurance");
  // PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001: incremental server
  // persistence. Answers no longer wait for the end of the flow.
  const autosave = usePsdAutosave();

  // ── Continue PSD Assessment handoff (/continue/<slug>) ──────────────────
  // PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001.
  //
  // The resolver already authorised this order and left the payload in memory
  // (never storage — it holds customer identity). We rehydrate identity + pets
  // here and pull the CLINICAL answers from the server with the write
  // credential, then land on the questions. The server has already decided
  // this order is incomplete; the client does not re-litigate it.
  useEffect(() => {
    const handoff = (window as unknown as { __ptContinueAssessment?: Record<string, unknown> })
      .__ptContinueAssessment;
    if (!handoff) return;
    try { delete (window as unknown as { __ptContinueAssessment?: unknown }).__ptContinueAssessment; }
    catch { /* non-fatal */ }

    (async () => {
      const o = handoff as Record<string, unknown>;
      setConfirmationId(String(o.confirmationId ?? ""));
      setStep2((prev) => ({
        ...prev,
        firstName: String(o.firstName ?? ""),
        lastName:  String(o.lastName ?? ""),
        email:     String(o.email ?? ""),
        phone:     String(o.phone ?? ""),
        state:     String(o.state ?? ""),
        dob:       String(o.dob ?? ""),
        pets: Array.isArray(o.pets) && (o.pets as unknown[]).length > 0
          ? (o.pets as Step2Data["pets"])
          : prev.pets,
      }));
      const pk = typeof o.packageKey === "string" ? o.packageKey : null;
      if (pk === "psd_ra_bundle" || pk === "psd_standard") setSelectedPackage(pk);
      setStateConfirmed(true);

      // Clinical answers come from the authenticated load — never from the URL
      // and never from the resolver payload.
      try {
        const tok = readAssessmentToken();
        if (tok) {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/psd-assessment-answers`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
            },
            body: JSON.stringify({ action: "load", token: tok }),
          });
          const j = await res.json().catch(() => null) as {
            answers?: Record<string, unknown>; revisions?: Record<string, number>;
          } | null;
          if (j?.answers) setStep1((prev) => ({ ...prev, ...(j.answers as Partial<PSDStep1Data>) }));
          if (j?.revisions) autosave.seedRevisions(j.revisions);
        }
      } catch { /* the questions still render; answers simply start empty */ }

      const route = String(o.route ?? "continue_assessment");
      setStep(route === "resume_checkout" ? 3 : 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Restore any step-1 answers drafted before the order existed. Without this,
  // a refresh mid-questionnaire still looked like total loss to the customer
  // even though the answers were on disk.
  useEffect(() => {
    const d = readDraft();
    if (Object.keys(d).length === 0) return;
    setStep1((prev) => ({ ...prev, ...(d as Partial<PSDStep1Data>) }));
  }, []);
  const [step1, setStep1] = useState<PSDStep1Data>(DEFAULT_STEP1);
  const [step2, setStep2] = useState<Step2Data>(DEFAULT_STEP2);
  const [confirmationId, setConfirmationId] = useState(() => {
    const id = generateConfirmationId();
    storeSetConfirmationId(id);
    return id;
  });
  const [saving, setSaving] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(!!resumeConfirmationId || !!resumeToken);
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

  // ── Resume flow: ?rt=<secure token> ──────────────────────────────────────
  // ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001 §D
  //
  // This flow carries the most sensitive payload in the product — a PSD
  // assessment includes the customer's mental-health intake (conditions,
  // diagnosis, treatment, medication). It is released ONLY in exchange for an
  // expiring, single-use, order-bound token. A confirmation id in a URL is a
  // display reference and never unlocks any of it.
  useEffect(() => {
    if (!resumeConfirmationId && !resumeToken && !checkoutResume) return;

    const fetchLead = async () => {
      setResumeLoading(true);
      try {
        // ── Legacy ?resume=<confirmationId>: NO order data, ever. ───────────
        // Falls through to the safe "request a new link" screen below.
        if (!resumeToken && !checkoutResume) {
          setResumeNotFound(true);
          setResumeLoading(false);
          return;
        }

        // ── Secure path: SCRUB the raw token from the URL FIRST, then POST it.
        // Scrubbing before the await keeps it out of history, referrers and any
        // third-party script that reads location.search later in the page life.
        let stableOrder: (Record<string, unknown> & { already_paid?: boolean }) | null = null;
        let stableOtpVerified = false;
        if (checkoutResume) {
          try {
            delete (window as unknown as { __ptCheckoutResume?: unknown }).__ptCheckoutResume;
          } catch { /* non-fatal */ }
          const cr = checkoutResume as Record<string, unknown>;
          stableOrder = {
            confirmation_id: cr.confirmationId, first_name: cr.firstName,
            last_name: cr.lastName, email: cr.email, phone: cr.phone, state: cr.state,
            delivery_speed: cr.deliverySpeed, price: cr.price, plan_type: cr.planType,
            letter_type: cr.letterType, package_key: cr.packageKey,
            billing_plan: cr.billingPlan,
            // Only the pet COUNT is restored — enough for multi-pet pricing,
            // no intake detail. Blank entries are never rendered because
            // checkout resume does not show the assessment.
            assessment_answers: {
              pets: Array.from({ length: Math.max(Number(cr.petCount ?? 1) || 1, 1) },
                () => ({ name: "", age: "", breed: "", type: "", weight: "" })),
            },
            already_paid: false,
          };
          stableOtpVerified = cr.otpVerified === true;
        }

        const rawToken = resumeToken;
        try {
          const u = new URL(window.location.href);
          if (u.searchParams.has("rt")) {
            u.searchParams.delete("rt");
            window.history.replaceState({}, "", u.pathname + u.search + u.hash);
          }
        } catch { /* non-fatal */ }

        const res = stableOrder ? null : await fetch(`${SUPABASE_URL}/functions/v1/exchange-resume-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify({ token: rawToken, purpose: "resume_assessment" }),
        });

        const exchanged = (res ? await res.json() : { ok: false }) as {
          ok?: boolean;
          resume?: Record<string, unknown> & { alreadyPaid?: boolean; assessmentAnswers?: unknown };
        };

        // Map onto the shape the prefill code below already understands, so that
        // logic stays untouched.
        const result = stableOrder
          ? { ok: true, order: stableOrder }
          : exchanged.ok && exchanged.resume
          ? {
              ok: true,
              order: {
                confirmation_id: exchanged.resume.confirmationId,
                first_name: exchanged.resume.firstName,
                last_name: exchanged.resume.lastName,
                email: exchanged.resume.email,
                phone: exchanged.resume.phone,
                state: exchanged.resume.state,
                delivery_speed: exchanged.resume.deliverySpeed,
                price: exchanged.resume.price,
                plan_type: exchanged.resume.planType,
                letter_type: exchanged.resume.letterType,
                package_key: exchanged.resume.packageKey,
                billing_plan: exchanged.resume.billingPlan,
                status: exchanged.resume.status,
                assessment_answers: exchanged.resume.assessmentAnswers ?? {},
                already_paid: !!exchanged.resume.alreadyPaid,
              } as Record<string, unknown> & { already_paid?: boolean },
            }
          : { ok: false as const, order: undefined, error: "invalid_or_expired" };

        if (!result.ok || !result.order) {
          setResumeNotFound(true);
          setResumeLoading(false);
          void logAudit({
            actor_name: "system",
            actor_role: "system",
            object_type: "system",
            object_id: null,
            action: "resume_token_invalid",
            description: "PSD resume flow: resume token invalid, expired, revoked or already used",
            metadata: {
              // No confirmation id and no token — an invalid exchange tells us
              // nothing about which order was meant, and we must not guess.
              letter_type: "psd",
              error: "invalid_or_expired",
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
          safetyCheck: (answers.safetyCheck as string) ?? "",
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

        // The confirmation id now comes from the token EXCHANGE — the URL no
        // longer carries one — so payment still upserts the right row.
        const resumedConfirmationId = String(data.confirmation_id ?? "");
        setConfirmationId(resumedConfirmationId);
        setStateConfirmed(true);

        // ── Deterministic, auth-gated resume routing
        //    (UNPAID-CUSTOMER-PORTAL-AND-RESUME-CONTINUITY-001) ──
        // Restore the saved package (authoritative identity — never inferred from
        // price); package-selected lead → checkout, no-package lead → package step.
        const savedPackageKey = typeof data.package_key === "string" ? data.package_key : null;
        if (savedPackageKey === "psd_ra_bundle" || savedPackageKey === "psd_standard") {
          setSelectedPackage(savedPackageKey);
        }
        // Restore the saved billing plan so a resumed ANNUAL lead stays annual.
        const savedBillingPlan = typeof data.billing_plan === "string" ? data.billing_plan : null;
        if (savedBillingPlan === "annual") setResumedPlan("subscription");
        else if (savedBillingPlan === "one_time") setResumedPlan("onetime");
        const nextGate = nextBookingGate({
          confirmation_id: resumedConfirmationId,
          letter_type: (data.letter_type as string) ?? "psd",
          status: (data.status as string) ?? "lead",
          package_key: savedPackageKey,
        });

        // A confirmation ID in a URL is not authentication. Only skip OTP when the
        // visitor already holds a Supabase session for THIS order's email; else
        // require OTP (code goes to the order's email) before checkout.
        const orderEmail = ((data.email as string) ?? "").trim().toLowerCase();
        let sessionEmail = "";
        try {
          const { data: sess } = await supabase.auth.getUser();
          sessionEmail = (sess?.user?.email ?? "").trim().toLowerCase();
        } catch { /* ignore — treat as unauthenticated */ }
        const alreadyAuthed =
          (!!orderEmail && sessionEmail === orderEmail) || stableOtpVerified;

        if (alreadyAuthed) {
          setOtpVerified(true);
          verifiedEmailRef.current = orderEmail;
          setCheckoutGate(directCheckout ? "pay" : nextGate);
        } else {
          setOtpVerified(false);
          verifiedEmailRef.current = "";
          postOtpGateRef.current = nextGate;
          setCheckoutGate("otp");
        }
        // ── Where a resume actually lands ────────────────────────────────
        // PSD-ASSESSMENT-ANSWERS-PERSISTENCE-AND-RECOVERY-001.
        //
        // This used to be an unconditional `setStep(3)` — every resume went
        // straight to checkout regardless of whether the clinical answers
        // existed. For an order whose answers were blank that was a closed
        // loop: the customer could never reach the questions again, which is
        // exactly what "I tried the assessment several times" looked like from
        // the outside.
        //
        // A resume now lands on the QUESTIONS whenever required answers are
        // still missing, and on checkout only when the assessment is actually
        // complete. Completeness is the SERVER's answer, not a client guess.
        let requiredComplete = false;
        try {
          const tok = readAssessmentToken();
          if (tok) {
            const st = await fetch(`${SUPABASE_URL}/functions/v1/psd-assessment-answers`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
              },
              body: JSON.stringify({ action: "status", token: tok }),
            });
            const sj = await st.json().catch(() => null) as { status?: { complete?: boolean } } | null;
            requiredComplete = sj?.status?.complete === true;
          }
        } catch { /* unknown -> treat as incomplete and show the questions */ }

        setStep(requiredComplete ? 3 : 1);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        setResumeNotFound(true);
        void logAudit({
          actor_name: "system",
          actor_role: "system",
          object_type: "system",
          object_id: null,
          action: "resume_order_network_error",
          description: "PSD resume flow: network/parse error during secure token exchange",
          metadata: {
            // No confirmation id: a failed exchange never tells us which order
            // was meant, and we must not guess one from the URL.
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
    // Dual-touch snapshots so the admin Attribution/Journey tab hydrates
    // for PSD orders the same way it does for ESA. The edge function
    // applies first-touch as sticky and last-touch as overwritable.
    let firstTouchVal = null;
    let lastTouchVal  = null;
    try { firstTouchVal = getFirstTouch(); } catch { firstTouchVal = null; }
    try { lastTouchVal  = getLastTouch();  } catch { lastTouchVal  = null; }

    // Save via service_role edge function — bypasses RLS + CHECK constraints reliably
    try {
      const upsertRes = await loggedFetch(
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
            firstTouchJson: firstTouchVal,
            lastTouchJson:  lastTouchVal,
            attributionJson: attributionJsonVal,
          }),
        },
        confirmationId,
      );
      // Funnel: PSD assessment answers persisted. loggedFetch only throws on a
      // hard network error, so a 4xx/5xx still resolves — gate on the response
      // status or this would claim a submit the server actually rejected.
      // The upsert mints the order-bound autosave credential exactly once.
      // Store it before anything else can throw, or the customer keeps typing
      // into a form that has quietly stopped persisting.
      try {
        const upsertJson = await upsertRes?.clone().json().catch(() => null) as { assessmentToken?: string } | null;
        storeAssessmentToken(upsertJson?.assessmentToken);
        // The lead now exists, so the step-1 answers held only in the local
        // draft can finally become authoritative server rows. Until this point
        // there was no order to attach them to.
        await autosave.flushDraft();
      } catch { /* autosave degrades; the lead is still saved */ }
      if (upsertRes?.ok) {
        try { trackAssessmentSubmitted(confirmationId, "psd"); } catch { /* analytics never blocks */ }
      }
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

  // ── State-first + OTP gate handlers ───────────────────────────────────────
  const handleStateChange = (nextState: string) => {
    setStep2((s) => ({
      ...s,
      state: nextState,
      stateAcknowledgment:
        s.stateAcknowledgment && s.stateAcknowledgment.state === nextState.toUpperCase()
          ? s.stateAcknowledgment
          : undefined,
    }));
  };
  const handleStateConfirm = (nextState: string, ack?: StateAcknowledgment) => {
    setStep2((s) => ({ ...s, state: nextState, stateAcknowledgment: ack ?? s.stateAcknowledgment }));
    setStateConfirmed(true);
    setStep(1);
    window.scrollTo(0, 0);
  };
  const handleViewPortal = () => {
    navigate(`/my-orders?order=${encodeURIComponent(confirmationId)}`);
  };
  const handleOtpVerified = () => {
    setOtpVerified(true);
    verifiedEmailRef.current = step2.email.trim().toLowerCase();
    // Direct-checkout → straight to pay (Assurance + Package no longer mandatory;
    // the package screen stays reachable via "Change package"). Legacy → resolved gate.
    const target = directCheckout ? "pay" : postOtpGateRef.current;
    postOtpGateRef.current = "assurance";
    setCheckoutGate(target);
    trackPostOtpDestination(confirmationId, target, flowVersionProp());
    window.scrollTo(0, 0);
  };

  const handleStep2Next = async () => {
    await saveLeadToSupabase(step2);
    const needOtp = !otpVerified || verifiedEmailRef.current !== step2.email.trim().toLowerCase();
    if (needOtp) { setOtpVerified(false); setCheckoutGate("otp"); }
    else setCheckoutGate(directCheckout ? "pay" : "package");
    setStep(3);
  };

  // Dedicated PSD package step → advance to checkout with the chosen package.
  // PSDStep3Checkout re-mints the PI when selectedPackage changes.
  const handlePackageSelect = (pkg: string) => {
    const next = (pkg === "psd_ra_bundle" ? "psd_ra_bundle" : "psd_standard") as PackageKey;
    trackPackageSelected(confirmationId, next, { flow_version: flowVersionProp() });
    setSelectedPackage(next);
    setCheckoutGate("pay");
    window.scrollTo(0, 0);
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
      <meta name="robots" content="index, follow" />
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

      {/* ── 2026-05-21 PSD-STEP3-ESA-WRAPPER ────────────────────────────────
          On Step 3 we use ESA's exact outer wrapper (max-w-6xl / md:px-6 /
          md:py-10) so the lg:grid-cols-5 checkout grid in PSDStep3Checkout
          gets the same column widths, sticky right column, and central
          alignment ESA Step 3 has. Steps 1/2 keep the narrower max-w-3xl
          form container they were tuned for. */}
      <div
        className={
          step === 3
            ? "max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-10"
            : "max-w-3xl mx-auto px-4 py-8"
        }
      >
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
          ) : !stateConfirmed ? (
            /* STATE FIRST — collected before the questionnaire so the 30-day
               acknowledgment (AR/CA/IA/LA/MT) fires early. */
            <StateSelectionStep
              state={step2.state}
              service="psd"
              priceShown={getPsdOneTimeTotal(1)}
              existingAck={step2.stateAcknowledgment}
              onChange={handleStateChange}
              onConfirm={handleStateConfirm}
            />
          ) : (
            <>
              {(resumeConfirmationId || resumeToken) && step === 3 && (
                <div className="mb-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <i className="ri-save-3-line text-amber-500 text-sm flex-shrink-0"></i>
                  <span className="text-sm font-semibold text-amber-800">Your PSD assessment answers have been restored — complete your payment below.</span>
                </div>
              )}

              {step === 1 && (
                <>
                <PSDStep1
                  data={step1}
                  onChange={setStep1}
                  onAnswerChange={(qid, val) => autosave.saveAnswer(qid, val)}
                  onNext={() => setStep(2)}
                />
                {/* Save state. The customer must never be told "Saved" for a
                    write the server did not accept — a silent failure here is
                    indistinguishable from a working product until a provider
                    opens an empty assessment. */}
                <div aria-live="polite" className="mt-3 flex items-center justify-end gap-1.5 text-xs font-semibold min-h-[20px]">
                  {autosave.saveState === "saving" && (
                    <span className="text-gray-500 flex items-center gap-1.5">
                      <i className="ri-loader-4-line animate-spin"></i>Saving…</span>
                  )}
                  {autosave.saveState === "saved" && (
                    <span className="text-emerald-600 flex items-center gap-1.5">
                      <i className="ri-checkbox-circle-fill"></i>Saved</span>
                  )}
                  {autosave.saveState === "retrying" && (
                    <span className="text-amber-600 flex items-center gap-1.5">
                      <i className="ri-refresh-line animate-spin"></i>Save failed — retrying…</span>
                  )}
                  {autosave.saveState === "failed" && (
                    <span className="text-red-600 flex items-center gap-1.5">
                      <i className="ri-error-warning-line"></i>
                      Could not save your last answer. Check your connection — your other answers are safe.</span>
                  )}
                </div>
                </>
              )}

              {step === 2 && (
                <Step2PersonalInfo
                  data={step2}
                  onChange={setStep2}
                  onNext={handleStep2Next}
                  onBack={() => setStep(1)}
                  mode="psd"
                  onEditState={() => { setStateConfirmed(false); window.scrollTo(0, 0); }}
                />
              )}

              {/* Checkout gates: email OTP → assurance → payment. */}
              {step === 3 && checkoutGate === "otp" && (
                <CustomerOtpStep
                  email={step2.email}
                  firstName={step2.firstName}
                  confirmationId={confirmationId}
                  letterType="psd"
                  accent="psd"
                  onVerified={handleOtpVerified}
                  onBack={() => setStep(2)}
                />
              )}
              {step === 3 && checkoutGate === "assurance" && (
                <AssuranceScreen
                  letterType="psd"
                  accent="psd"
                  onContinue={() => { setCheckoutGate("package"); window.scrollTo(0, 0); }}
                  onViewPortal={handleViewPortal}
                  onBack={() => setCheckoutGate("otp")}
                />
              )}
              {step === 3 && checkoutGate === "package" && (
                <PackageSelectionStep
                  letterType="psd"
                  accent="psd"
                  petCount={step2.pets.length}
                  selectedPackage={selectedPackage}
                  onSelect={handlePackageSelect}
                  onBack={() => setCheckoutGate(directCheckout ? "pay" : "assurance")}
                  confirmationId={confirmationId}
                />
              )}
              {step === 3 && checkoutGate === "pay" && (
                <Suspense fallback={<PSDStep3LoadingFallback />}>
                  <PSDStep3Checkout
                    step1={step1}
                    step2={step2}
                    confirmationId={confirmationId}
                    packageKey={selectedPackage}
                    onChangePackage={() => { trackPackageChangeOpened(confirmationId, "psd"); setCheckoutGate("package"); window.scrollTo(0, 0); }}
                    initialPlan={resumedPlan ?? undefined}
                    onBack={() => setStep(2)}
                  />
                </Suspense>
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
