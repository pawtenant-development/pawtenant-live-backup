// THE partner manual-order form.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002, restructured by
// PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 into the canonical four steps:
//   1. Service (ESA / PSD)           3. Pet details (one or more animals)
//   2. Customer details              4. Clinical questionnaire + preview + attestation + submit
// (An admin picks the partner first; a partner user is locked to their own.)
//
// ONE canonical wizard, mounted twice:
//   * the partner portal, where the organisation is locked to the signed-in
//     partner user and nothing in this component can change it; and
//   * the PawTenant admin Partner Platform, where an admin picks the partner
//     first and everything after that is identical.
//
// The questionnaire is PASTED, never uploaded or extracted. The text is stored
// verbatim; the parsed question/answer blocks shown in the preview are sent
// alongside it and the database re-checks that they are lossless before
// storing them (raw text always wins).
//
// WHAT THIS COMPONENT MUST NEVER DO
//   * Send a partner id it was not given. In partner mode `partnerId` is
//     undefined and the database derives the organisation from the session, so
//     a tampered client cannot submit for someone else.
//   * Log, analyse or otherwise copy the questionnaire text. It goes into the
//     submission call and into the preview, nowhere else.
//   * Render the questionnaire as HTML. It is written with textContent-safe
//     React children, so pasted markup stays inert text.
//   * Decide eligibility. A partner submission is intake, never approval; the
//     order enters the normal provider review workflow.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { US_STATES } from "../../lib/usStates";
import {
  MAX_ORDER_PETS,
  MAX_QUESTIONNAIRE_CHARS,
  PARTNER_PET_TYPES,
  emptyPartnerCustomer,
  emptyPartnerPet,
  maxAssessmentDob,
  validatePartnerOrder,
  type PartnerOrderCustomer,
  type PartnerOrderErrors,
  type PartnerOrderPet,
} from "../../lib/assessmentIdentityRules";
import {
  parsePartnerQuestionnaire,
  questionnaireIsLossless,
  type ParsedQuestionnaire,
} from "../../lib/partnerQuestionnaire";
// PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 — canonical psd_v1
// answers for a manual PSD order. Visibly unavailable until the backend
// contract (p_psd_answers) is applied; see lib/partnerPsdIntake.ts.
import {
  PARTNER_PSD_MANUAL_INTAKE_ENABLED,
  PARTNER_PSD_UNAVAILABLE_REASON,
  compactPsdAnswers,
  psdManualAnswerProblems,
} from "../../lib/partnerPsdIntake";
import PartnerPsdQuestionnaire, { usePsdCatalog, type PsdAnswerDraft } from "./PartnerPsdQuestionnaire";

export interface WizardPartnerOption {
  id: string;
  display_name: string;
  allowed_services: string[] | null;
  status?: string;
}

export interface PartnerRateSummary {
  service: string;
  amount_cents: number;
  currency: string;
  version: number;
}

export interface PartnerOrderSubmitted {
  order_id: string;
  confirmation_id: string;
  partner_order_id: string;
  replayed: boolean;
}

interface Props {
  /** "partner" locks the organisation to the session. "admin" asks first. */
  mode: "partner" | "admin";
  /** Admin mode: the partners this admin may submit for. */
  partners?: WizardPartnerOption[];
  /** Partner mode: the signed-in partner, for display and service gating. */
  lockedPartner?: WizardPartnerOption;
  /** Active partner charges, shown before submit (admin loads its own). */
  rates?: PartnerRateSummary[];
  /** Partner mode only — drafts are scoped to the partner user that owns them. */
  allowDraft?: boolean;
  /** Resume a saved draft. */
  initialDraft?: {
    id: string;
    service: string | null;
    form: Record<string, unknown> | null;
    questionnaire_text: string | null;
    partner_reference: string | null;
  } | null;
  onSubmitted: (result: PartnerOrderSubmitted) => void;
  onCancel: () => void;
  onDraftSaved?: () => void;
}

type Service = "esa" | "psd" | "";

const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

const field =
  "w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-gray-900 transition-colors text-gray-800";
const fieldErr =
  "w-full px-3.5 py-2.5 text-sm border border-red-400 rounded-lg bg-white focus:outline-none focus:border-red-400 transition-colors text-gray-800";
const btnPrimary =
  "px-5 py-2.5 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
const btnSecondary =
  "px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 cursor-pointer";

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

function Err({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-red-600">{msg}</p> : null;
}

function newRequestId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* fall through to the manual id below */ }
  return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Turn a Postgres error into something a partner can act on. */
function humaniseSubmitError(message: string): string {
  if (message.includes("no_active_rate")) {
    return "This partner has no active rate for the selected service, so the order cannot be submitted yet. Your draft has been kept — ask your account contact to set the rate, then submit again.";
  }
  if (message.includes("duplicate_partner_reference")) {
    return "That partner reference is already used by another order. Change the reference or open the existing order.";
  }
  if (message.includes("partner_mismatch")) return "You are not authorized to submit for that partner.";
  if (message.includes("partner_not_active")) return "This partner organization is not active.";
  if (message.includes("authorization_confirmation_required")) {
    return "Confirm the information is accurate and authorized for clinical review.";
  }
  if (message.includes("questionnaire_blocks_not_lossless")) {
    return "The questionnaire preview did not match the pasted text. Re-check the text and try again.";
  }
  if (message.startsWith("validation_failed") || message.includes("validation_failed")) {
    return "Some information is missing or invalid. Go back and check the highlighted fields.";
  }
  return message;
}

/**
 * The provider-facing preview of a pasted questionnaire: exactly what the
 * neutral assessment will show, built from the same parser. Text children
 * only — pasted markup is inert.
 */
export function QuestionnairePreview({ parsed }: { parsed: ParsedQuestionnaire | null }) {
  if (!parsed) {
    return <p className="text-sm text-gray-400">Paste the questionnaire to see how it will appear to the provider.</p>;
  }
  return (
    <div className="space-y-3" data-questionnaire-preview>
      {parsed.blocks.map((b) => (
        <div key={b.number} className="flex gap-3">
          <div className="w-6 h-6 flex items-center justify-center border border-gray-900 text-gray-900 text-[11px] font-bold rounded-full flex-shrink-0 mt-0.5">
            {b.number}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gray-900 break-words">{b.question}</p>
            {b.answer ? (
              <p className="text-sm text-gray-900 whitespace-pre-wrap break-words mt-1 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">{b.answer}</p>
            ) : (
              <p className="text-sm italic text-gray-500 mt-1">No answer recorded for this question.</p>
            )}
          </div>
        </div>
      ))}
      {parsed.additional.length > 0 && (
        <div>
          <p className="text-sm font-bold text-gray-900">Additional Questionnaire Information</p>
          <p className="text-xs text-gray-500 mb-1">
            {parsed.blocks.length === 0
              ? "No numbered questions were recognised, so the text will be shown exactly as pasted."
              : "Text outside the numbered questions, shown exactly as pasted."}
          </p>
          <p className="text-sm text-gray-900 whitespace-pre-wrap break-words bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
            {parsed.additional.join("\n")}
          </p>
        </div>
      )}
    </div>
  );
}

export default function PartnerOrderWizard({
  mode, partners = [], lockedPartner, rates = [], allowDraft = false,
  initialDraft = null, onSubmitted, onCancel, onDraftSaved,
}: Props) {
  const draftForm = (initialDraft?.form ?? {}) as Record<string, unknown>;

  // The idempotency key for THIS attempt. Created once and kept across
  // re-renders, refreshes of a resumed draft and repeated clicks, so the
  // database recognises a repeat as a replay and returns the SAME order.
  const [clientRequestId] = useState<string>(
    () => (typeof draftForm.clientRequestId === "string" && draftForm.clientRequestId) || newRequestId(),
  );

  // Steps: 0 partner (admin only) · 1 service · 2 customer · 3 pets · 4 questionnaire+submit · 5 created
  const [step, setStep] = useState<number>(mode === "admin" ? 0 : 1);
  const [partnerId, setPartnerId] = useState<string>(
    mode === "partner" ? (lockedPartner?.id ?? "") : (typeof draftForm.partnerId === "string" ? draftForm.partnerId : ""),
  );
  const [service, setService] = useState<Service>((initialDraft?.service as Service) ?? "");
  const [customer, setCustomer] = useState<PartnerOrderCustomer>(
    () => ({ ...emptyPartnerCustomer(), ...((draftForm.customer as object) ?? {}) }),
  );
  const [pets, setPets] = useState<PartnerOrderPet[]>(
    () => (Array.isArray(draftForm.pets) && draftForm.pets.length > 0
      ? (draftForm.pets as PartnerOrderPet[])
      : [emptyPartnerPet((initialDraft?.service as Service) ?? "")]),
  );
  const [questionnaire, setQuestionnaire] = useState<string>(initialDraft?.questionnaire_text ?? "");
  const [psdAnswers, setPsdAnswers] = useState<PsdAnswerDraft>(
    () => ((draftForm.psdAnswers as PsdAnswerDraft) ?? {}),
  );
  const psdCatalog = usePsdCatalog();
  const [partnerReference, setPartnerReference] = useState<string>(initialDraft?.partner_reference ?? "");
  const [authorizationConfirmed, setAuthorizationConfirmed] = useState(false);
  const [errors, setErrors] = useState<PartnerOrderErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(initialDraft?.id ?? null);
  const [result, setResult] = useState<PartnerOrderSubmitted | null>(null);

  // Belt and braces against a double click: React state updates are async, so
  // the ref is what actually blocks the second call within the same tick.
  const inFlight = useRef(false);

  const activePartner: WizardPartnerOption | undefined = useMemo(
    () => (mode === "partner" ? lockedPartner : partners.find((p) => p.id === partnerId)),
    [mode, lockedPartner, partners, partnerId],
  );

  const allowedServices = activePartner?.allowed_services ?? [];
  const serviceAllowed = (s: "esa" | "psd") =>
    (allowedServices.length === 0 || allowedServices.includes(s)) && (s !== "psd" || PARTNER_PSD_MANUAL_INTAKE_ENABLED);
  /** True only when a PSD order can carry canonical answers end to end. */
  const psdIntakeActive = service === "psd" && PARTNER_PSD_MANUAL_INTAKE_ENABLED;
  const psdProblems = psdIntakeActive ? psdManualAnswerProblems(compactPsdAnswers(psdAnswers), psdCatalog.catalog) : [];

  // ADMIN MODE: the partner is chosen inside the wizard, so its rates cannot be
  // passed in. Load the active cards for whichever partner was picked.
  const [adminRates, setAdminRates] = useState<PartnerRateSummary[]>([]);
  useEffect(() => {
    if (mode !== "admin" || !partnerId) { setAdminRates([]); return; }
    let cancelled = false;
    void (async () => {
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from("partner_rate_cards")
        .select("service, wholesale_unit_price_cents, currency, version, effective_to")
        .eq("partner_id", partnerId)
        .lte("effective_from", nowIso)
        .order("version", { ascending: false });
      if (cancelled) return;
      const active = (data ?? []).filter((r) => !r.effective_to || new Date(r.effective_to) > new Date());
      const seen = new Set<string>();
      setAdminRates(active.filter((r) => (seen.has(r.service) ? false : (seen.add(r.service), true)))
        .map((r) => ({
          service: r.service as string,
          amount_cents: r.wholesale_unit_price_cents as number,
          currency: (r.currency as string) ?? "USD",
          version: r.version as number,
        })));
    })();
    return () => { cancelled = true; };
  }, [mode, partnerId]);

  const effectiveRates = mode === "admin" ? adminRates : rates;
  const rateForService = useMemo(
    () => effectiveRates.find((r) => r.service === service) ?? null,
    [effectiveRates, service],
  );

  // Switching to PSD makes every animal a dog, because that is the only shape
  // the PSD workflow accepts. Switching away leaves the values alone.
  useEffect(() => {
    if (service !== "psd") return;
    setPets((prev) => prev.map((p) => (p.type ? p : { ...p, type: "Dog" })));
  }, [service]);

  // The live preview: the SAME parser the admin, provider and PDF surfaces use.
  const parsed = useMemo<ParsedQuestionnaire | null>(
    () => (questionnaire.trim() ? parsePartnerQuestionnaire(questionnaire) : null),
    [questionnaire],
  );
  const parsedLossless = useMemo(
    () => (parsed ? questionnaireIsLossless(questionnaire, parsed) : false),
    [parsed, questionnaire],
  );

  const updateCustomer = (k: keyof PartnerOrderCustomer, v: string) =>
    setCustomer((prev) => ({ ...prev, [k]: v }));
  const updatePet = (i: number, k: keyof PartnerOrderPet, v: string) =>
    setPets((prev) => prev.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addPet = () =>
    setPets((prev) => (prev.length >= MAX_ORDER_PETS ? prev : [...prev, emptyPartnerPet(service)]));
  const removePet = (i: number) =>
    setPets((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const draftPayload = useCallback(
    () => ({ clientRequestId, partnerId, customer, pets, psdAnswers }),
    [clientRequestId, partnerId, customer, pets, psdAnswers],
  );

  const saveDraft = useCallback(async () => {
    if (!allowDraft) return;
    setSavingDraft(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc("partner_portal_save_draft", {
        p_draft_id: draftId,
        p_service: service || null,
        p_form: draftPayload(),
        p_questionnaire: questionnaire || null,
        p_reference: partnerReference || null,
      });
      if (error) throw error;
      if (typeof data === "string") setDraftId(data);
      onDraftSaved?.();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Could not save the draft.");
    } finally {
      setSavingDraft(false);
    }
  }, [allowDraft, draftId, service, draftPayload, questionnaire, partnerReference, onDraftSaved]);

  // Per-step validation reuses the ONE rule set; each step only surfaces the
  // errors that belong to it, so a blank questionnaire cannot block step 2.
  const validateAll = (opts: { authorization: boolean }) =>
    validatePartnerOrder({ service, customer, pets, questionnaire, authorizationConfirmed: opts.authorization });

  const customerKeys: (keyof PartnerOrderErrors)[] = ["firstName", "lastName", "email", "phone", "dob", "state"];
  const stepHasErrors = (e: PartnerOrderErrors, keys: string[], prefix?: string) =>
    Object.keys(e).some((k) => keys.includes(k) || (prefix ? k.startsWith(prefix) : false));

  const goToPets = () => {
    const e = validateAll({ authorization: true });
    const own: PartnerOrderErrors = {};
    for (const k of Object.keys(e) as (keyof PartnerOrderErrors)[]) {
      if (customerKeys.includes(k)) own[k] = e[k];
    }
    setErrors(own);
    if (!stepHasErrors(e, customerKeys as string[])) setStep(3);
  };

  const goToQuestionnaire = () => {
    const e = validateAll({ authorization: true });
    const own: PartnerOrderErrors = {};
    for (const k of Object.keys(e)) if (k === "pets" || k.startsWith("pet_")) own[k] = e[k];
    setErrors(own);
    if (!stepHasErrors(e, ["pets"], "pet_")) setStep(4);
  };

  const submit = async () => {
    if (inFlight.current) return;
    const e = validatePartnerOrder({ service, customer, pets, questionnaire, authorizationConfirmed });
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setSubmitError("Some information is missing or invalid. Check the highlighted fields.");
      return;
    }
    if (service === "psd" && !PARTNER_PSD_MANUAL_INTAKE_ENABLED) {
      setSubmitError(PARTNER_PSD_UNAVAILABLE_REASON);
      return;
    }
    if (psdIntakeActive && psdProblems.length > 0) {
      setSubmitError(`The PSD assessment is incomplete: ${psdProblems.join("; ")}.`);
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc("partner_submit_manual_order", {
        // Partner mode sends null: the database resolves the organisation from
        // the session, so nothing here can name someone else's partner.
        p_partner_id: mode === "admin" ? partnerId : null,
        p_service: service,
        p_customer: customer,
        p_pets: pets,
        p_questionnaire_text: questionnaire,
        // The preview's parsed blocks travel with the verbatim text. They are
        // stored only if the database proves them lossless; otherwise the raw
        // text alone is stored and every reader re-parses it.
        p_questionnaire_blocks: parsed && parsedLossless ? parsed.blocks : null,
        p_questionnaire_additional: parsed && parsedLossless ? parsed.additional : null,
        p_partner_reference: partnerReference || null,
        p_authorization_confirmed: authorizationConfirmed,
        p_client_request_id: clientRequestId,
        p_draft_id: draftId,
        // The canonical psd_v1 answers travel ONLY when the backend contract is
        // live; the key is omitted otherwise so the call cannot silently hit a
        // function that would discard it.
        ...(psdIntakeActive ? { p_psd_answers: compactPsdAnswers(psdAnswers) } : {}),
      });
      if (error) throw error;
      const r = data as PartnerOrderSubmitted;
      setResult(r);
      setStep(5);
      onSubmitted(r);
    } catch (err) {
      setSubmitError(humaniseSubmitError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
      inFlight.current = false;
    }
  };

  // ── Created ───────────────────────────────────────────────────────────────
  if (step === 5 && result) {
    return (
      <div className="max-w-xl mx-auto text-center py-10 px-4">
        <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto mb-4">
          <i className="ri-check-line text-2xl text-emerald-600"></i>
        </div>
        <h2 className="text-xl font-bold text-gray-900">Order created</h2>
        <p className="text-sm text-gray-500 mt-2">
          {result.replayed
            ? "This submission was already received — here is the same order, not a duplicate."
            : "The order has entered the clinical review workflow. No customer communication was sent."}
        </p>
        <div className="mt-5 inline-block rounded-xl border border-gray-200 bg-gray-50 px-6 py-4">
          <p className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">PawTenant Order ID</p>
          <p className="text-lg font-bold font-mono text-gray-900 mt-1 break-all">{result.confirmation_id}</p>
        </div>
        <div className="mt-6">
          <button type="button" onClick={onCancel} className={btnPrimary}>
            Back to orders
          </button>
        </div>
      </div>
    );
  }

  const stepLabels = mode === "admin"
    ? ["Partner", "Service", "Customer", "Pets", "Questionnaire"]
    : ["Service", "Customer", "Pets", "Questionnaire"];
  const stepIndex = mode === "admin" ? step : step - 1;

  return (
    <div className="max-w-3xl mx-auto pb-10">
      {/* Progress */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-6 text-[11px] font-semibold" aria-label="Steps">
        {stepLabels.map((l, i) => (
          <li key={l} className="flex items-center gap-2">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
              i < stepIndex ? "bg-emerald-500 text-white"
                : i === stepIndex ? "bg-gray-900 text-white" : "bg-gray-200 text-gray-500"}`}>
              {i < stepIndex ? <i className="ri-check-line"></i> : i + 1}
            </span>
            <span className={i === stepIndex ? "text-gray-900" : "text-gray-400"}>{l}</span>
            {i < stepLabels.length - 1 && <i className="ri-arrow-right-s-line text-gray-300"></i>}
          </li>
        ))}
      </ol>

      {submitError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {submitError}
        </div>
      )}

      {/* ── Step 0 (admin): partner ───────────────────────────────────────── */}
      {step === 0 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900">Which partner is this order for?</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            The order is recorded against this organization and priced at its active rate.
          </p>
          <div className="space-y-2">
            {partners.length === 0 && (
              <p className="text-sm text-gray-500">No active partner organizations.</p>
            )}
            {partners.map((p) => (
              <button key={p.id} type="button" onClick={() => setPartnerId(p.id)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors cursor-pointer ${
                  partnerId === p.id ? "border-gray-900 bg-gray-50" : "border-gray-200 hover:border-gray-300"}`}>
                <span className="text-sm font-semibold text-gray-900">{p.display_name}</span>
                {p.allowed_services && p.allowed_services.length > 0 && (
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {p.allowed_services.map((s) => s.toUpperCase()).join(" · ")}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onCancel} className={btnSecondary}>Cancel</button>
            <button type="button" disabled={!partnerId} onClick={() => setStep(1)} className={btnPrimary}>Continue</button>
          </div>
        </section>
      )}

      {/* ── Step 1: service ───────────────────────────────────────────────── */}
      {step === 1 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900">What is this order for?</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            {activePartner ? `${activePartner.display_name} · ` : ""}Choose the service. It is never inferred from the text you paste later.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {([
              { v: "esa" as const, t: "ESA", d: "Emotional Support Animal assessment" },
              { v: "psd" as const, t: "PSD", d: "Psychiatric Service Dog assessment" },
            ]).map((o) => {
              const enabled = serviceAllowed(o.v);
              return (
                <button key={o.v} type="button" disabled={!enabled}
                  onClick={() => { setService(o.v); setErrors({}); }}
                  className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                    !enabled ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                      : service === o.v ? "border-gray-900 bg-gray-50 cursor-pointer"
                      : "border-gray-200 hover:border-gray-300 cursor-pointer"}`}>
                  <span className="block text-sm font-bold text-gray-900">{o.t}</span>
                  <span className="block text-xs text-gray-500 mt-1">{o.d}</span>
                  {!enabled && (
                    <span className="block text-[11px] text-gray-500 mt-2" data-service-unavailable={o.v}>
                      {o.v === "psd" && !PARTNER_PSD_MANUAL_INTAKE_ENABLED ? PARTNER_PSD_UNAVAILABLE_REASON : "Not enabled for this partner"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <Err msg={errors.service} />
          <div className="flex gap-3 mt-6">
            <button type="button" onClick={() => (mode === "admin" ? setStep(0) : onCancel())} className={btnSecondary}>
              {mode === "admin" ? "Back" : "Cancel"}
            </button>
            <button type="button" disabled={!service} onClick={() => setStep(2)} className={btnPrimary}>Continue</button>
          </div>
        </section>
      )}

      {/* ── Step 2: customer details ──────────────────────────────────────── */}
      {step === 2 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900">Customer details</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Use the customer&apos;s full legal name exactly as it should appear on their documentation.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label required>Legal first name</Label>
              <input className={errors.firstName ? fieldErr : field} value={customer.firstName}
                autoComplete="off" onChange={(ev) => updateCustomer("firstName", ev.target.value)} />
              <Err msg={errors.firstName} />
            </div>
            <div>
              <Label required>Legal last name</Label>
              <input className={errors.lastName ? fieldErr : field} value={customer.lastName}
                autoComplete="off" onChange={(ev) => updateCustomer("lastName", ev.target.value)} />
              <Err msg={errors.lastName} />
            </div>
            <div>
              <Label required>Email</Label>
              <input type="email" autoComplete="off" className={errors.email ? fieldErr : field} value={customer.email}
                onChange={(ev) => updateCustomer("email", ev.target.value)} />
              <Err msg={errors.email} />
            </div>
            <div>
              <Label required>Phone</Label>
              <input type="tel" autoComplete="off" className={errors.phone ? fieldErr : field} value={customer.phone}
                onChange={(ev) => updateCustomer("phone", ev.target.value)} />
              <Err msg={errors.phone} />
            </div>
            <div>
              <Label required>Date of birth</Label>
              <input type="date" max={maxAssessmentDob()} className={errors.dob ? fieldErr : field} value={customer.dob}
                onChange={(ev) => updateCustomer("dob", ev.target.value)} />
              <Err msg={errors.dob} />
            </div>
            <div>
              <Label required>State</Label>
              <select className={errors.state ? fieldErr : field} value={customer.state}
                onChange={(ev) => updateCustomer("state", ev.target.value)}>
                <option value="">Select a state</option>
                {US_STATES.map((s) => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
              <Err msg={errors.state} />
            </div>
            <div className="sm:col-span-2">
              <Label>Street address</Label>
              <input className={field} value={customer.addressLine1 ?? ""} autoComplete="off"
                onChange={(ev) => updateCustomer("addressLine1", ev.target.value)} />
            </div>
            <div>
              <Label>City</Label>
              <input className={field} value={customer.city ?? ""} autoComplete="off"
                onChange={(ev) => updateCustomer("city", ev.target.value)} />
            </div>
            <div>
              <Label>ZIP code</Label>
              <input className={field} value={customer.postalCode ?? ""} autoComplete="off" inputMode="numeric"
                onChange={(ev) => updateCustomer("postalCode", ev.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Partner reference (optional)</Label>
              <input className={field} value={partnerReference}
                onChange={(ev) => setPartnerReference(ev.target.value)}
                placeholder="Your own customer or order reference" />
              <p className="mt-1 text-xs text-gray-400">
                Shown to you and to the admin team only. It never reaches the reviewing provider.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-6">
            <button type="button" onClick={() => setStep(1)} className={btnSecondary}>Back</button>
            <button type="button" onClick={goToPets} className={btnPrimary}>Continue to pets</button>
            {allowDraft && (
              <button type="button" onClick={saveDraft} disabled={savingDraft} className={btnSecondary}>
                {savingDraft ? "Saving…" : "Save draft"}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Step 3: pet details ───────────────────────────────────────────── */}
      {step === 3 && (
        <section>
          <h2 className="text-lg font-bold text-gray-900">Pet details</h2>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            {service === "psd"
              ? "A psychiatric service dog order covers task-trained dogs only."
              : `Up to ${MAX_ORDER_PETS} animals on one order.`}
          </p>
          <Err msg={errors.pets} />
          <div className="space-y-4">
            {pets.map((p, i) => (
              <div key={i} className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-gray-700">Animal {i + 1}</span>
                  {pets.length > 1 && (
                    <button type="button" onClick={() => removePet(i)}
                      className="text-xs font-semibold text-red-600 hover:text-red-700 cursor-pointer">
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label required>Pet name</Label>
                    <input className={errors[`pet_${i}_name`] ? fieldErr : field} value={p.name}
                      onChange={(ev) => updatePet(i, "name", ev.target.value)} />
                    <Err msg={errors[`pet_${i}_name`]} />
                  </div>
                  <div>
                    <Label required>Animal type</Label>
                    <select className={errors[`pet_${i}_type`] ? fieldErr : field} value={p.type}
                      onChange={(ev) => updatePet(i, "type", ev.target.value)}>
                      <option value="">Select a type</option>
                      {(service === "psd" ? ["Dog"] : PARTNER_PET_TYPES).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <Err msg={errors[`pet_${i}_type`]} />
                  </div>
                  <div>
                    <Label required>Breed</Label>
                    <input className={errors[`pet_${i}_breed`] ? fieldErr : field} value={p.breed}
                      onChange={(ev) => updatePet(i, "breed", ev.target.value)} />
                    <Err msg={errors[`pet_${i}_breed`]} />
                  </div>
                  <div>
                    <Label required>Age</Label>
                    <input className={errors[`pet_${i}_age`] ? fieldErr : field} value={p.age}
                      onChange={(ev) => updatePet(i, "age", ev.target.value)} placeholder="e.g. 4" />
                    <Err msg={errors[`pet_${i}_age`]} />
                  </div>
                  <div>
                    <Label>Weight (lbs)</Label>
                    <input className={field} value={p.weight ?? ""}
                      onChange={(ev) => updatePet(i, "weight", ev.target.value)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          {pets.length < MAX_ORDER_PETS && (
            <button type="button" onClick={addPet}
              className="mt-3 inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-dashed border-gray-300 text-xs font-semibold text-gray-600 hover:border-gray-400 cursor-pointer">
              <i className="ri-add-line"></i>Add another animal
            </button>
          )}
          <div className="flex flex-wrap gap-3 pt-6">
            <button type="button" onClick={() => setStep(2)} className={btnSecondary}>Back</button>
            <button type="button" onClick={goToQuestionnaire} className={btnPrimary}>Continue to questionnaire</button>
            {allowDraft && (
              <button type="button" onClick={saveDraft} disabled={savingDraft} className={btnSecondary}>
                {savingDraft ? "Saving…" : "Save draft"}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Step 4: clinical questionnaire · preview · attestation · submit ── */}
      {step === 4 && (
        <section className="space-y-6">
          {psdIntakeActive && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h2 className="text-lg font-bold text-gray-900">PSD assessment answers</h2>
              {psdCatalog.error && <p className="mt-1 text-xs text-red-600">The PSD question catalog could not be read; submission is blocked until it can.</p>}
              <div className="mt-3">
                <PartnerPsdQuestionnaire catalog={psdCatalog.catalog} value={psdAnswers} onChange={setPsdAnswers} />
              </div>
              {psdProblems.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-xs text-amber-700">{psdProblems.map((x) => <li key={x}>{x}</li>)}</ul>
              )}
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-gray-900">Clinical questionnaire</h2>
            <p className="text-sm text-gray-500 mt-1">
              Copy the customer&apos;s completed mental-health questionnaire — questions and answers — and paste
              it below with its original numbering. Nothing is summarised, rewritten or used to decide
              eligibility; a licensed provider reviews it exactly as written.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <Label required>Questionnaire questions and answers</Label>
              <textarea
                className={`${errors.questionnaire ? fieldErr : field} font-mono text-[13px] leading-relaxed min-h-[320px]`}
                value={questionnaire}
                maxLength={MAX_QUESTIONNAIRE_CHARS}
                spellCheck={false}
                aria-describedby="questionnaire-help"
                onChange={(ev) => setQuestionnaire(ev.target.value)}
                placeholder={"1 How often do you experience emotional distress, anxiety, or depression?\nOften - most days\n2 Which of the following do you currently experience? (Select all that apply)\nAnxiety or constant worry; Difficulty sleeping\n3 …"}
              />
              <div className="flex items-center justify-between mt-1">
                <Err msg={errors.questionnaire} />
                <span className="text-xs text-gray-400 ml-auto" id="questionnaire-help">
                  {questionnaire.length.toLocaleString()} / {MAX_QUESTIONNAIRE_CHARS.toLocaleString()}
                </span>
              </div>
              {parsed && parsed.blocks.length === 0 && (
                <p className="mt-2 text-xs text-amber-700">
                  No numbered questions were recognised. The text will still be shown to the provider, exactly as pasted, under “Additional Questionnaire Information”.
                </p>
              )}
              {parsed && parsed.blocks.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  {parsed.blocks.length} question{parsed.blocks.length === 1 ? "" : "s"} recognised
                  {parsed.additional.length > 0 ? ` · ${parsed.additional.length} additional line${parsed.additional.length === 1 ? "" : "s"}` : ""}.
                </p>
              )}
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Preview — how the provider will see it
              </p>
              <div className="max-h-[420px] overflow-y-auto pr-1">
                <QuestionnairePreview parsed={parsed} />
              </div>
            </div>
          </div>

          {/* Compact summary of what will be submitted */}
          <dl className="rounded-xl border border-gray-200 divide-y divide-gray-100 text-sm">
            {[
              ["Partner", activePartner?.display_name ?? "—"],
              ["Service", service.toUpperCase()],
              ["Customer", `${customer.firstName} ${customer.lastName}`.trim() || "—"],
              ["Animals", pets.map((p) => p.name).filter(Boolean).join(", ") || "—"],
              ["Partner reference", partnerReference || "—"],
              ["Partner charge", rateForService
                ? `${money(rateForService.amount_cents, rateForService.currency)} (rate v${rateForService.version}, frozen at submission)`
                : "Confirmed at submission"],
            ].map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2">
                <dt className="w-36 shrink-0 text-xs font-semibold text-gray-500">{k}</dt>
                <dd className="text-gray-900 break-words min-w-0">{v}</dd>
              </div>
            ))}
          </dl>

          <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4 cursor-pointer">
            <input type="checkbox" className="mt-0.5 w-4 h-4 cursor-pointer" checked={authorizationConfirmed}
              onChange={(ev) => setAuthorizationConfirmed(ev.target.checked)} />
            <span className="text-sm text-gray-700">
              I confirm this information is accurate and authorized for clinical review.
              <Err msg={errors.authorizationConfirmed} />
            </span>
          </label>

          <p className="text-xs text-gray-500">
            Submitting creates an order for clinical review. It is not an approval and does not decide
            eligibility. No email or text message is sent to the customer.
          </p>

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setStep(3)} disabled={submitting} className={btnSecondary}>Back</button>
            <button type="button" onClick={submit} disabled={submitting || !authorizationConfirmed || (psdIntakeActive && psdProblems.length > 0)} className={btnPrimary}>
              {submitting ? "Submitting…" : "Submit order"}
            </button>
            {allowDraft && (
              <button type="button" onClick={saveDraft} disabled={savingDraft || submitting} className={btnSecondary}>
                {savingDraft ? "Saving…" : "Save draft"}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
