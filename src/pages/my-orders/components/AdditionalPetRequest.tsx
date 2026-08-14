// AdditionalPetRequest — customer-facing Additional Pet workflow inside /my-orders.
//
// ORDER-ADDITIONAL-PET-UI-STRIPE-QA-CLOSURE-001 §7.
//
// Every price and every eligibility decision comes from the server
// (create-additional-pet-request → resolve_additional_pet_pricing). This
// component NEVER computes, sends or displays a client-derived amount: it
// renders `pricing.amount_cents` exactly as returned. The $20 is a PACKAGE-TIER
// upgrade (single-pet → multi-pet), never described as a per-pet fee.
//
// Server actions used:
//   quote      → eligibility + price + existing requests (also self-heals a paid
//                but unconfirmed Stripe session)
//   create     → $20 → Stripe Checkout redirect; $0 → straight to provider review
//   update_pet → edit while draft / clarification (a clarification edit resubmits)
//   resume     → finish an abandoned payment without duplicating the request
//   cancel     → withdraw a not-yet-paid request

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import CustomerPortalSection from "./CustomerPortalSection";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const MAX_PETS = 3;

/** Canonical pet shape — must match orders.assessment_answers->'pets'. */
interface PetInput { name: string; type: string; breed: string; age: string; weight: string }
const EMPTY_PET: PetInput = { name: "", type: "", breed: "", age: "", weight: "" };

interface Pricing {
  eligible: boolean;
  outcome: "paid_upgrade" | "included" | "manual_review" | "blocked" | "resume_payment";
  code: string;
  amount_cents: number;
  // Pricing change 2026-07-28 ($20 -> $30). For an EXISTING request the server
  // returns THAT request's quoted amount, so a checkout created before the
  // change stays payable at the amount the customer was originally shown.
  currency?: string;
  pricing_version?: string | null;
  grandfathered?: boolean;
  current_price_cents?: number;
  active_status?: string;
  awaiting_payment?: boolean;
  current_pet_count?: number;
  target_pet_count?: number;
  max_total?: number;
  message?: string;
}

interface PetRequest {
  id: string;
  status: string;
  pricing_outcome: string;
  amount_cents: number;
  new_pet: PetInput | null;
  provider_decision: string | null;
  provider_decision_reason: string | null;
  letter_id: string | null;
  refund_amount_cents: number | null;
  paid_at: string | null;
  created_at: string;
}

export interface AdditionalPetOrder {
  id: string;
  confirmation_id: string;
  letter_type?: string | null;
}

/** Statuses that mean a request is still in flight — the CTA must not reappear. */
const ACTIVE = new Set([
  "draft", "manual_review_required", "payment_required", "checkout_created",
  "paid_pending_details", "pending_provider_review", "clarification_requested",
  "resubmitted", "approved_pending_document", "refund_pending",
]);

/** Customer-facing label + tone for every workflow status. Text always carries the
 *  meaning; colour is never the only signal (§7 accessibility). */
const STATUS_UI: Record<string, { label: string; detail: string; tone: string; icon: string }> = {
  payment_required: { label: "Payment required", tone: "amber", icon: "ri-bank-card-line",
    detail: "Complete the secure payment to send this pet for provider review." },
  checkout_created: { label: "Payment in progress", tone: "amber", icon: "ri-time-line",
    detail: "We're waiting for your payment to complete. You can resume it below." },
  paid_pending_details: { label: "Paid — details required", tone: "amber", icon: "ri-edit-line",
    detail: "Your payment was received. We need a little more information before review." },
  pending_provider_review: { label: "Pending provider review", tone: "review", icon: "ri-stethoscope-line",
    detail: "A licensed provider is reviewing this addition. Your current letter stays valid." },
  resubmitted: { label: "Resubmitted for review", tone: "review", icon: "ri-refresh-line",
    detail: "Thank you — your updated details were sent back to the provider." },
  clarification_requested: { label: "More information needed", tone: "amber", icon: "ri-question-answer-line",
    detail: "The provider needs more detail before deciding." },
  approved_pending_document: { label: "Approved — updating your document", tone: "emerald", icon: "ri-loader-4-line",
    detail: "Approved. We're preparing your updated document; your current letter stays valid until it is ready." },
  completed: { label: "Completed", tone: "emerald", icon: "ri-checkbox-circle-line",
    detail: "Your updated document has been issued." },
  rejected: { label: "Not approved", tone: "gray", icon: "ri-close-circle-line",
    detail: "The provider was unable to approve this addition." },
  refund_pending: { label: "Refund in progress", tone: "amber", icon: "ri-refund-2-line",
    detail: "We're processing your refund for this request." },
  refunded: { label: "Refunded", tone: "gray", icon: "ri-refund-2-line",
    detail: "The upgrade payment has been refunded in full." },
  manual_review_required: { label: "Manual review", tone: "gray", icon: "ri-customer-service-2-line",
    detail: "Our support team is reviewing this request." },
  cancelled: { label: "Cancelled", tone: "gray", icon: "ri-close-line",
    detail: "This request was cancelled. No payment was taken." },
  draft: { label: "Draft", tone: "gray", icon: "ri-draft-line", detail: "This request has not been submitted yet." },
  // Synthetic badge keys used only by the card mapper (owner wording 2026-07-28).
  payment_received: { label: "Payment received", tone: "emerald", icon: "ri-checkbox-circle-line",
    detail: "Your payment was received. We're processing your Additional Pet request." },
  provider_review: { label: "Provider review", tone: "review", icon: "ri-stethoscope-line",
    detail: "Your Additional Pet request has been received and is ready for provider review." },
  refund_action_required: { label: "Payment received — action required", tone: "amber", icon: "ri-refund-2-line",
    detail: "We're processing your refund for this request." },
};

const TONE_CHIP: Record<string, string> = {
  amber: "bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]",
  review: "bg-[#EFF6FF] text-[#2563EB] border-[#BFDBFE]",
  emerald: "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]",
  gray: "bg-[#f1f5f9] text-[#475569] border-[#e2e8f0]",
};

function StatusChip({ status }: { status: string }) {
  const ui = STATUS_UI[status] ?? STATUS_UI.draft;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${TONE_CHIP[ui.tone]}`}
    >
      <i className={`${ui.icon} text-xs`} aria-hidden="true"></i>
      {ui.label}
    </span>
  );
}

/**
 * THE customer-facing card mapper (owner decision 2026-07-28).
 *
 * The card used to use the submitted PET NAME as its heading, so a QA fixture
 * called "VerifyTwenty" read as the workflow title. The workflow state is the
 * heading; the pet name is a labelled detail underneath. Every server status
 * maps here — there is no second place that decides what the customer is told.
 *
 * `awaitingPayment` is deliberately derived from `paid_at`, not from the status
 * string: a request can be paid while the webhook is still landing, and the
 * customer must not be shown "Payment in progress" once the money is in.
 */
const AWAITING_PAYMENT = new Set(["draft", "payment_required", "checkout_created"]);

function customerCardState(r: PetRequest): { title: string; badgeStatus: string; detail: string } {
  const paid = !!r.paid_at;
  const s = r.status;

  if (!paid && AWAITING_PAYMENT.has(s)) {
    return {
      title: "Additional Pet Request",
      badgeStatus: s === "draft" ? "draft" : "checkout_created",
      detail: (STATUS_UI[s] ?? STATUS_UI.draft).detail,
    };
  }
  if (s === "paid_pending_details") {
    return {
      title: "Additional Pet Request — Payment Received",
      badgeStatus: "payment_received",
      detail: "Your payment was received. We're processing your Additional Pet request.",
    };
  }
  if (s === "refund_pending") {
    // Reached by the completed-order payment race: the payment settled after the
    // evaluation was finalised, so it was received but deliberately NOT applied.
    // The customer must not be told this succeeded, and must not be shown the
    // internal reason — only that support is handling it.
    return {
      title: "Additional Pet Request — Payment Received",
      badgeStatus: "refund_action_required",
      detail: "Your payment was received, but this pet could not be added because your evaluation was already completed. Our support team is reviewing it and will be in touch — you do not need to do anything.",
    };
  }
  if (s === "completed") {
    return { title: "Additional Pet Added", badgeStatus: "completed", detail: STATUS_UI.completed.detail };
  }
  if (s === "rejected") {
    return { title: "Additional Pet Request — Not Approved", badgeStatus: "rejected", detail: STATUS_UI.rejected.detail };
  }
  if (s === "refunded") {
    return { title: "Additional Pet Request — Refunded", badgeStatus: "refunded", detail: STATUS_UI.refunded.detail };
  }
  if (s === "cancelled") {
    return { title: "Additional Pet Request — Cancelled", badgeStatus: "cancelled", detail: STATUS_UI.cancelled.detail };
  }
  if (s === "clarification_requested") {
    return { title: "Additional Pet Under Review", badgeStatus: s, detail: STATUS_UI.clarification_requested.detail };
  }
  if (s === "approved_pending_document") {
    return { title: "Additional Pet Under Review", badgeStatus: s, detail: STATUS_UI.approved_pending_document.detail };
  }
  if (s === "manual_review_required") {
    return { title: "Additional Pet Under Review", badgeStatus: s, detail: STATUS_UI.manual_review_required.detail };
  }
  // pending_provider_review, resubmitted, and any paid state not named above.
  return {
    title: "Additional Pet Under Review",
    badgeStatus: "provider_review",
    detail: "Your Additional Pet request has been received and is ready for provider review.",
  };
}

export default function AdditionalPetRequest({
  order, highlightSuccess,
}: { order: AdditionalPetOrder; highlightSuccess?: boolean }) {
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [requests, setRequests] = useState<PetRequest[]>([]);
  const [allowedTypes, setAllowedTypes] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [pet, setPet] = useState<PetInput>(EMPTY_PET);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const callFn = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Your session has expired — please sign in again.");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-additional-pet-request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, orderId: order.id, siteUrl: window.location.origin, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const err = new Error(data?.error ?? `Request failed (HTTP ${res.status})`);
      (err as Error & { code?: string }).code = data?.code;
      throw err;
    }
    return data;
  }, [order.id]);

  const load = useCallback(async () => {
    try {
      const d = await callFn("quote");
      setPricing((d.pricing ?? null) as Pricing | null);
      setRequests((d.requests ?? []) as PetRequest[]);
      setAllowedTypes((d.allowedPetTypes ?? []) as string[]);
    } catch {
      setPricing(null);            // fail soft — the rest of the portal still renders
      setRequests([]);
    } finally {
      setLoaded(true);
    }
  }, [callFn]);

  useEffect(() => { load(); }, [load, highlightSuccess]);

  const activeRequest = useMemo(
    () => requests.find((r) => ACTIVE.has(r.status)) ?? null, [requests]);
  const historic = useMemo(
    () => requests.filter((r) => !ACTIVE.has(r.status)), [requests]);

  // ── Modal accessibility: focus trap + restore focus on close ───────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    // Capture the opener NOW rather than reading the ref during cleanup: by
    // cleanup time the ref may already point at a different node (React
    // re-renders the CTA into the active-request panel once a request exists).
    const openerAtOpen = openerRef.current;
    firstFieldRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      if (e.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes).filter((n) => !n.hasAttribute("disabled"));
      const first = list[0]; const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Restore focus to the control that opened the dialog.
      //
      // Prefer the OPENER REF over the previously-focused element. `prev` is
      // document.activeElement at open time, which is <body> whenever the dialog
      // was opened without focusing the trigger first (a programmatic click, or
      // a browser that does not focus buttons on click). Falling back to `prev`
      // in that case strands focus on <body> and a keyboard user restarts from
      // the top of the page. Only fall back to `prev` when the opener is gone
      // from the DOM (e.g. the CTA is replaced by the active-request panel).
      const target = openerAtOpen && document.contains(openerAtOpen) ? openerAtOpen : prev;
      target?.focus?.();
    };
  }, [open]);

  const isPsd = (order.letter_type ?? "").toLowerCase() === "psd";
  const petTypes = allowedTypes.length ? allowedTypes : (isPsd ? ["dog"] : ["dog", "cat", "other"]);

  function validate(p: PetInput): string {
    if (!p.name.trim()) return "Please enter your pet's name.";
    if (p.name.trim().length > 60) return "That pet name is too long.";
    if (!p.type) return "Please select the type of animal.";
    if (isPsd && p.type !== "dog") return "A Psychiatric Service Dog letter can only cover a dog.";
    if (!p.breed.trim()) return "Please enter your pet's breed.";
    return "";
  }

  async function submitNew() {
    const v = validate(pet);
    if (v) { setError(v); return; }
    setBusy(true); setError("");
    try {
      const d = await callFn("create", { pet });
      if (d.checkoutUrl) { window.location.href = d.checkoutUrl as string; return; }
      setOpen(false); setPet(EMPTY_PET);
      setNotice(d.message as string ?? "Your request has been sent for provider review.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  async function submitClarification() {
    if (!activeRequest) return;
    const v = validate(pet);
    if (v) { setError(v); return; }
    setBusy(true); setError("");
    try {
      await callFn("update_pet", { requestId: activeRequest.id, pet });
      setOpen(false);
      setNotice("Thank you — your updated details were sent back to the provider.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  async function resume() {
    setBusy(true); setError("");
    try {
      const d = await callFn("resume");
      if (d.checkoutUrl) { window.location.href = d.checkoutUrl as string; return; }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resume the payment. Please try again.");
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!activeRequest) return;
    setBusy(true); setError("");
    try {
      await callFn("cancel", { requestId: activeRequest.id });
      setNotice("Your request was cancelled. No payment was taken.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't cancel this request.");
    } finally { setBusy(false); }
  }

  if (!loaded || !pricing) return null;

  const dollars = (cents: number) => `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
  const outcome = pricing.outcome;

  // ── Header status slot ────────────────────────────────────────────────────
  // ONE mapper drives both the badge and the card heading, so they can never
  // disagree (e.g. "Payment in progress" beside a paid request).
  const cardState = activeRequest ? customerCardState(activeRequest) : null;

  const headerRight = activeRequest && cardState
    ? <StatusChip status={cardState.badgeStatus} />
    : <span className="text-[11px] text-gray-500">
        {typeof pricing.current_pet_count === "number"
          ? `${pricing.current_pet_count} of ${pricing.max_total ?? MAX_PETS} pets`
          : null}
      </span>;

  return (
    <CustomerPortalSection
      title="Additional Pet"
      icon="ri-add-circle-line"
      tone={activeRequest ? "review" : "blue"}
      headerRight={headerRight}
    >
      <div className="space-y-3 max-w-full">
        {notice && (
          <p role="status" className="rounded-lg border border-[#A7F3D0] bg-[#ECFDF5] px-3 py-2 text-xs text-[#047857] leading-relaxed break-words">
            {notice}
          </p>
        )}
        {error && !open && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 leading-relaxed break-words">
            {error}
          </p>
        )}

        {/* ── ACTIVE REQUEST — the CTA is deliberately not rendered ─────────── */}
        {activeRequest ? (
          <div className="rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3 space-y-2.5">
            {/* Owner decision 2026-07-28: the WORKFLOW STATE is the heading; the
                submitted pet name is a labelled detail. It used to be the title,
                so a QA fixture named "VerifyTwenty" read as the card's name. */}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 break-words">
                  {cardState.title}
                </p>
                {activeRequest.new_pet?.name && (
                  <p className="mt-0.5 text-xs text-gray-700 break-words">
                    <span className="font-semibold text-gray-500">Pet:</span>{" "}
                    {activeRequest.new_pet.name}
                  </p>
                )}
                <p className="text-xs text-gray-500 break-words">
                  {[activeRequest.new_pet?.type, activeRequest.new_pet?.breed]
                    .filter(Boolean).join(" · ")}
                </p>
              </div>
              <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">
                {activeRequest.pricing_outcome === "paid_upgrade"
                  ? dollars(activeRequest.amount_cents)
                  : "No charge"}
              </span>
            </div>

            <p className="text-xs text-gray-600 leading-relaxed">
              {cardState.detail}
            </p>

            {activeRequest.status === "clarification_requested" && activeRequest.provider_decision_reason && (
              <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#B45309] mb-1">
                  Message from your provider
                </p>
                <p className="text-xs text-[#92400E] leading-relaxed break-words">
                  {activeRequest.provider_decision_reason}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {activeRequest.status === "clarification_requested" && (
                <button
                  ref={openerRef}
                  type="button"
                  onClick={() => { setPet(activeRequest.new_pet ?? EMPTY_PET); setError(""); setOpen(true); }}
                  className="rounded-lg bg-[#1a5c4f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#14483e] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#1a5c4f]"
                >
                  Update pet details
                </button>
              )}
              {/* Pricing change 2026-07-28 ($20 -> $30). The button above already
                  shows THIS request's own quoted amount, so a checkout created
                  before the change correctly reads $20 — but without a word of
                  explanation that looks like a bug next to today's $30 price.
                  `grandfathered` is computed server-side (request version differs
                  from the current one); the client never compares prices. */}
              {pricing?.grandfathered && activeRequest.pricing_outcome === "paid_upgrade" && !activeRequest.paid_at && (
                <p className="w-full rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[11px] leading-relaxed text-[#92400E]">
                  Your existing checkout was created at the previous{" "}
                  {dollars(activeRequest.amount_cents)} price and will remain valid at
                  that amount.
                </p>
              )}
              {(activeRequest.status === "payment_required" || activeRequest.status === "checkout_created") && (
                <>
                  <button type="button" onClick={resume} disabled={busy}
                    className="rounded-lg bg-[#f97316] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#ea580c] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#f97316]">
                    {busy ? "Opening…" : `Complete payment (${dollars(activeRequest.amount_cents)})`}
                  </button>
                  <button type="button" onClick={cancel} disabled={busy}
                    className="rounded-lg border border-[#e2e8f0] px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400">
                    Cancel request
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* ── PAID: package-tier upgrade at the CURRENT server price ──── */}
            {outcome === "paid_upgrade" && (
              <>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Your package currently covers one pet. Upgrading to the multi-pet
                  package lets this order cover up to {pricing.max_total ?? MAX_PETS} pets
                  in total. This is a one-time upgrade of your package, not a charge
                  per pet.
                </p>
                <button
                  ref={openerRef}
                  type="button"
                  onClick={() => { setPet(EMPTY_PET); setError(""); setOpen(true); }}
                  className="w-full sm:w-auto rounded-lg bg-[#1a5c4f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#14483e] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#1a5c4f]"
                >
                  Add another pet — {dollars(pricing.amount_cents)}
                </button>
              </>
            )}

            {/* ── INCLUDED: $0 ─────────────────────────────────────────────── */}
            {outcome === "included" && (
              <>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Your current package already covers this pet. No additional payment
                  is required. Provider review is still required before an updated
                  document can be issued.
                </p>
                <button
                  ref={openerRef}
                  type="button"
                  onClick={() => { setPet(EMPTY_PET); setError(""); setOpen(true); }}
                  className="w-full sm:w-auto rounded-lg bg-[#1a5c4f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#14483e] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#1a5c4f]"
                >
                  Add another pet
                </button>
              </>
            )}

            {/* ── MANUAL REVIEW: never a price, never a checkout ─────────────
                GATING-002 owner correction. This state is now reached ONLY when
                the server has a SPECIFIC, machine-readable reason it cannot
                classify the order (missing entitlement snapshot, contradictory
                pet count, unreconstructable legacy package). It is no longer
                shown merely because the order is unassigned, under review, has
                Additional Documentation, or carries a partial refund.
                The customer is not asked to chase Support — Admin resolves it
                from the order's More menu and this state updates itself. */}
            {outcome === "manual_review" && (
              <p className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 text-xs text-gray-600 leading-relaxed">
                We need to review this order before another pet can be added.
                PawTenant Support will confirm whether the pet is included in your
                package or requires the Additional Pet upgrade.
              </p>
            )}

            {/* ── COMPLETED / CLINICALLY LOCKED ────────────────────────────────
                ADDITIONAL-PET-...-GATING-002. The evaluation is finalised and a
                document may already be issued, so a pet can never be added to
                it. No form, no price, no checkout — the only forward path is a
                NEW evaluation that includes every pet. The customer's existing
                documents stay fully accessible above; nothing here hides or
                replaces them. */}
            {outcome === "blocked" && pricing.code === "order_completed" && (
              <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-3 space-y-2.5">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Your previous evaluation is complete. To include another pet, start a
                  new evaluation and include all pets that need to be covered.
                </p>
                <a
                  href="/assessment"
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#1a5c4f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#14483e] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#1a5c4f] sm:w-auto"
                >
                  <i className="ri-add-circle-line" aria-hidden="true"></i>
                  Start a New Evaluation
                </a>
              </div>
            )}

            {/* ── BLOCKED: accurate reason, no payment action ──────────────── */}
            {outcome === "blocked" && pricing.code !== "order_completed" && (
              <p className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5 text-xs text-gray-600 leading-relaxed">
                {pricing.code === "max_pets_reached"
                  ? `This order already covers the maximum of ${pricing.max_total ?? MAX_PETS} pets.`
                  : pricing.message ?? "Adding another pet is not available for this order."}
              </p>
            )}
          </>
        )}

        {/* ── HISTORY: completed / rejected / refunded ──────────────────────── */}
        {historic.length > 0 && (
          <div className="pt-1 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Previous requests
            </p>
            {historic.map((r) => (
              <div key={r.id} className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-800 break-words">
                    {r.new_pet?.name || "Additional pet"}
                    {r.new_pet?.type ? <span className="font-normal text-gray-500"> · {r.new_pet.type}</span> : null}
                  </p>
                  <StatusChip status={r.status} />
                </div>

                {r.status === "completed" && (
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Your updated document is shown first in <strong>My Documents</strong>.
                    Your original letter and its verification record remain available and
                    continue to verify unchanged.
                  </p>
                )}

                {(r.status === "rejected" || r.status === "refunded" || r.status === "refund_pending") && (
                  <div className="space-y-1.5">
                    {r.provider_decision_reason && (
                      <p className="text-xs text-gray-600 leading-relaxed break-words">
                        <span className="font-semibold text-gray-700">Provider decision: </span>
                        {r.provider_decision_reason}
                      </p>
                    )}
                    {r.status === "refunded" && (
                      <p className="text-xs text-gray-600 leading-relaxed">
                        <span className="font-semibold text-gray-700">Refund: </span>
                        {dollars(r.refund_amount_cents ?? r.amount_cents)} refunded in full.
                        Refunds typically appear on your statement within 5–10 business days.
                      </p>
                    )}
                    {r.amount_cents === 0 && r.status === "rejected" && (
                      <p className="text-xs text-gray-600 leading-relaxed">
                        No payment was taken for this request.
                      </p>
                    )}
                    <p className="text-xs text-gray-500 leading-relaxed">
                      Your original order and your existing letter are unaffected and
                      remain valid.
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Revision history is deliberately NOT repeated here — MyDocumentsCard
            already renders the active document first with Previous Document
            Versions beneath it. Duplicating it would show two copies of the
            same history and split the customer's mental model of "my documents". */}
      </div>

      {/* ── Pet form modal ─────────────────────────────────────────────────── */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-3 py-4 overflow-y-auto"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="addpet-title"
            className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-[#e2e8f0] max-h-full overflow-y-auto"
          >
            <div className="px-4 sm:px-5 py-4 border-b border-[#f1f5f9]">
              <h3 id="addpet-title" className="text-base font-bold text-gray-900">
                {activeRequest?.status === "clarification_requested"
                  ? "Update pet details" : "Add another pet"}
              </h3>
              <p className="mt-1 text-xs text-gray-500 leading-relaxed">
                {activeRequest?.status === "clarification_requested"
                  ? "Update the details below and we'll send them straight back to your provider. No further payment is required."
                  : outcome === "paid_upgrade"
                    ? `Upgrading your package to cover up to ${pricing.max_total ?? MAX_PETS} pets is a one-time ${dollars(pricing.amount_cents)} charge.`
                    : "Your package already covers this pet — no payment is required."}
              </p>
            </div>

            <div className="px-4 sm:px-5 py-4 space-y-3">
              <div>
                <label htmlFor="addpet-name" className="block text-xs font-semibold text-gray-700 mb-1">
                  Pet name
                </label>
                <input
                  id="addpet-name" ref={firstFieldRef} type="text" value={pet.name}
                  onChange={(e) => setPet({ ...pet, name: e.target.value })}
                  maxLength={60} autoComplete="off"
                  className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]"
                />
              </div>

              <div>
                <label htmlFor="addpet-type" className="block text-xs font-semibold text-gray-700 mb-1">
                  Type of animal
                </label>
                <select
                  id="addpet-type" value={pet.type}
                  onChange={(e) => setPet({ ...pet, type: e.target.value })}
                  className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]"
                >
                  <option value="">Select…</option>
                  {petTypes.map((t) => (
                    <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                  ))}
                </select>
                {isPsd && (
                  <p className="mt-1 text-[11px] text-gray-500">
                    A Psychiatric Service Dog letter can only cover a dog.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="addpet-breed" className="block text-xs font-semibold text-gray-700 mb-1">
                  Breed
                </label>
                <input
                  id="addpet-breed" type="text" value={pet.breed}
                  onChange={(e) => setPet({ ...pet, breed: e.target.value })}
                  maxLength={60} autoComplete="off"
                  className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="addpet-age" className="block text-xs font-semibold text-gray-700 mb-1">
                    Age <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="addpet-age" type="text" value={pet.age}
                    onChange={(e) => setPet({ ...pet, age: e.target.value })}
                    maxLength={20} autoComplete="off"
                    className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]"
                  />
                </div>
                <div>
                  <label htmlFor="addpet-weight" className="block text-xs font-semibold text-gray-700 mb-1">
                    Weight <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="addpet-weight" type="text" value={pet.weight}
                    onChange={(e) => setPet({ ...pet, weight: e.target.value })}
                    maxLength={20} autoComplete="off"
                    className="w-full rounded-lg border border-[#e2e8f0] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]"
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 leading-relaxed break-words">
                  {error}
                </p>
              )}
            </div>

            <div className="px-4 sm:px-5 py-3 border-t border-[#f1f5f9] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button" onClick={() => setOpen(false)} disabled={busy}
                className="rounded-lg border border-[#e2e8f0] px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={activeRequest?.status === "clarification_requested" ? submitClarification : submitNew}
                disabled={busy}
                className="rounded-lg bg-[#1a5c4f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#14483e] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#1a5c4f]"
              >
                {busy
                  ? "Working…"
                  : activeRequest?.status === "clarification_requested"
                    ? "Send to provider"
                    : outcome === "paid_upgrade"
                      ? `Add this pet for ${dollars(pricing.amount_cents)}`
                      : "Submit for provider review"}
              </button>
            </div>
          </div>
        </div>
      )}
    </CustomerPortalSection>
  );
}
