// OrderAdditionalPetPanel — admin visibility for the Additional Pet workflow
// (ORDER-ADDITIONAL-PET-UI-STRIPE-QA-CLOSURE-001 §8).
//
// Self-contained by design (same pattern as OrderRaOverviewStatus): it fetches
// its own rows, so it never depends on which columns the frozen
// OrderDetailModal's order query happened to select, and the modal needs only a
// one-line mount per variant.
//
// Three variants, one component:
//   "overview" — concise read-only summary at the top of the Overview tab
//   "payments" — a SEPARATE add-on transaction row, never combined with the
//                original order price
//   "documents"— the revision this request produced, alongside the original,
//                with their DISTINCT verification IDs
//
// Reads only. Every write in this workflow belongs to the customer, the provider
// decision function, or the Stripe webhook.

import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

export type AdditionalPetVariant = "overview" | "payments" | "documents";

interface PetRequestRow {
  id: string;
  status: string;
  pricing_outcome: string;
  amount_cents: number;
  currency: string;
  new_pet: { name?: string; type?: string; breed?: string; age?: string; weight?: string } | null;
  prior_pet_count: number;
  target_pet_count: number;
  provider_decision: string | null;
  provider_decision_at: string | null;
  provider_decision_reason: string | null;
  assigned_provider_user_id: string | null;
  document_version_id: string | null;
  letter_id: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  refund_amount_cents: number | null;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  stripe_refund_id: string | null;
  manual_review_reason: string | null;
  created_at: string;
}

interface VersionRow {
  id: string; version: number; letter_id: string | null; is_active: boolean;
  approval_status: string; revision_reason: string | null; activated_at: string | null;
}

/** Status → admin label + semantic tone. Text always carries the meaning. */
const STATUS: Record<string, { label: string; tone: "amber" | "blue" | "green" | "red" | "gray" }> = {
  draft: { label: "Draft", tone: "gray" },
  manual_review_required: { label: "Manual review", tone: "amber" },
  payment_required: { label: "Payment required", tone: "amber" },
  checkout_created: { label: "Checkout created", tone: "amber" },
  paid_pending_details: { label: "Paid — details required", tone: "amber" },
  pending_provider_review: { label: "Pending provider review", tone: "blue" },
  clarification_requested: { label: "Clarification requested", tone: "amber" },
  resubmitted: { label: "Resubmitted", tone: "blue" },
  approved_pending_document: { label: "Approved — document pending", tone: "blue" },
  completed: { label: "Completed", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  refund_pending: { label: "Refund pending", tone: "amber" },
  refunded: { label: "Refunded", tone: "gray" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

const TONE: Record<string, string> = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  red: "bg-red-50 text-red-700 border-red-200",
  gray: "bg-slate-50 text-slate-600 border-slate-200",
};

function Chip({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.draft;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONE[s.tone]}`}>
      {s.label}
    </span>
  );
}

const fmt = (d: string | null) =>
  d ? new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

/** Price label. Two formulas never share a label: a $0 request is "Included",
 *  a manual-review request has no price at all. */
function priceLabel(r: PetRequestRow): string {
  if (r.pricing_outcome === "paid_upgrade") return `$${(r.amount_cents / 100).toFixed(2)}`;
  if (r.pricing_outcome === "included") return "Included / No charge";
  return "Manual review — no price";
}

export default function OrderAdditionalPetPanel({
  orderId, variant = "overview", onOpenProviderTab,
}: { orderId: string; variant?: AdditionalPetVariant; onOpenProviderTab?: () => void }) {
  const [req, setReq] = useState<PetRequestRow | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [orderHasProvider, setOrderHasProvider] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: rows } = await supabase
          .from("order_additional_pet_requests")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: false })
          .limit(1);
        const r = (rows?.[0] ?? null) as PetRequestRow | null;
        if (!alive) return;
        setReq(r);

        if (r) {
          const { data: o } = await supabase
            .from("orders").select("doctor_user_id, doctor_name").eq("id", orderId).maybeSingle();
          if (!alive) return;
          setOrderHasProvider(!!(o as { doctor_user_id?: string } | null)?.doctor_user_id);
          setProviderName((o as { doctor_name?: string } | null)?.doctor_name ?? null);

          if (variant === "documents") {
            const { data: v } = await supabase
              .from("order_document_versions")
              .select("id, version, letter_id, is_active, approval_status, revision_reason, activated_at")
              .eq("order_id", orderId)
              .order("version", { ascending: true });
            if (alive) setVersions((v ?? []) as VersionRow[]);
          }
        }
      } catch { /* read-only panel — never block the modal */ }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [orderId, variant]);

  if (!loaded || !req) return null;

  const pet = req.new_pet ?? {};
  const petLine = [pet.name, pet.type, pet.breed].filter(Boolean).join(" · ") || "—";

  // ── PAYMENTS: a SEPARATE transaction, never merged with the order price ────
  if (variant === "payments") {
    const refunded = !!req.refunded_at;
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Additional Pet</span>
          <Chip status={req.status} />
        </div>
        <div className="px-4 py-3 text-xs text-slate-700 space-y-1.5">
          <div className="flex justify-between gap-3 flex-wrap">
            <span className="text-slate-500">Amount</span>
            <span className="font-semibold text-slate-900">{priceLabel(req)}</span>
          </div>
          <div className="flex justify-between gap-3 flex-wrap">
            <span className="text-slate-500">Payment</span>
            <span className="font-medium">
              {req.pricing_outcome !== "paid_upgrade"
                ? "No charge"
                : req.paid_at ? `Paid ${fmt(req.paid_at)}` : "Awaiting payment"}
            </span>
          </div>
          {refunded && (
            <div className="flex justify-between gap-3 flex-wrap">
              <span className="text-slate-500">Refund</span>
              <span className="font-medium text-slate-900">
                ${(((req.refund_amount_cents ?? req.amount_cents)) / 100).toFixed(2)} refunded {fmt(req.refunded_at)}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-3 flex-wrap">
            <span className="text-slate-500">Created</span>
            <span>{fmt(req.created_at)}</span>
          </div>
          {/* Admin-only Stripe reference. Never shown to a provider or customer. */}
          {(req.stripe_payment_intent_id || req.stripe_refund_id) && (
            <div className="pt-1.5 mt-1.5 border-t border-slate-100 space-y-1">
              {req.stripe_payment_intent_id && (
                <div className="flex justify-between gap-3 flex-wrap">
                  <span className="text-slate-400">Stripe payment</span>
                  <span className="font-mono text-[10px] text-slate-500 break-all">{req.stripe_payment_intent_id}</span>
                </div>
              )}
              {req.stripe_refund_id && (
                <div className="flex justify-between gap-3 flex-wrap">
                  <span className="text-slate-400">Stripe refund</span>
                  <span className="font-mono text-[10px] text-slate-500 break-all">{req.stripe_refund_id}</span>
                </div>
              )}
            </div>
          )}
          <p className="pt-1.5 mt-1.5 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
            Separate add-on transaction. Not part of the original order price.
          </p>
        </div>
      </div>
    );
  }

  // ── DOCUMENTS: the revision beside the original, with DISTINCT IDs ────────
  if (variant === "documents") {
    if (versions.length === 0) return null;
    return (
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            Additional Pet — document revisions
          </span>
        </div>
        <ul className="divide-y divide-slate-100">
          {versions.map((v) => (
            <li key={v.id} className="px-4 py-2.5 text-xs text-slate-700">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">
                    Version {v.version}
                    {v.is_active
                      ? <span className="ml-2 font-normal text-emerald-700">Current</span>
                      : <span className="ml-2 font-normal text-slate-400">Superseded</span>}
                  </p>
                  <p className="text-slate-500 break-words">
                    {v.revision_reason ?? "—"}
                  </p>
                </div>
                <span className="font-mono text-[10px] text-slate-500 break-all">
                  {v.letter_id ?? "no verification ID"}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100 leading-relaxed">
          Each version keeps its own verification ID. The original ID is never
          repointed and continues to resolve to the original document.
        </p>
      </div>
    );
  }

  // ── OVERVIEW: concise read-only summary + workflow state ──────────────────
  const unavailableProvider = !orderHasProvider
    && ["pending_provider_review", "clarification_requested", "resubmitted", "approved_pending_document"].includes(req.status);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden mb-3">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">Additional Pet</span>
        <Chip status={req.status} />
      </div>

      <div className="px-4 py-3 text-xs text-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
        <div className="flex justify-between gap-3 sm:block">
          <span className="text-slate-500 sm:block">New pet</span>
          <span className="font-medium text-slate-900 break-words">{petLine}</span>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <span className="text-slate-500 sm:block">Pets after approval</span>
          <span className="font-medium text-slate-900">{req.target_pet_count} of 3</span>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <span className="text-slate-500 sm:block">Price</span>
          <span className="font-medium text-slate-900">{priceLabel(req)}</span>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <span className="text-slate-500 sm:block">Assigned provider</span>
          <span className="font-medium text-slate-900 break-words">
            {providerName ?? (orderHasProvider ? "Assigned" : "Not assigned")}
          </span>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <span className="text-slate-500 sm:block">Requested</span>
          <span className="font-medium">{fmt(req.created_at)}</span>
        </div>
        <div className="flex justify-between gap-3 sm:block">
          <span className="text-slate-500 sm:block">Provider decision</span>
          <span className="font-medium">
            {req.provider_decision ? `${req.provider_decision} · ${fmt(req.provider_decision_at)}` : "Pending"}
          </span>
        </div>
      </div>

      {req.provider_decision_reason && (
        <div className="px-4 pb-3">
          <p className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-[11px] text-slate-600 leading-relaxed break-words">
            <span className="font-semibold text-slate-700">
              {req.status === "clarification_requested" ? "Clarification requested: " : "Provider note: "}
            </span>
            {req.provider_decision_reason}
          </p>
        </div>
      )}

      {req.manual_review_reason && (
        <div className="px-4 pb-3">
          <p className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 leading-relaxed break-words">
            <span className="font-semibold">Manual review: </span>{req.manual_review_reason}
          </p>
        </div>
      )}

      {req.status === "approved_pending_document" && (
        <div className="px-4 pb-3">
          <p className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-[11px] text-blue-800 leading-relaxed">
            Approved. The revised document has not been generated yet — the
            customer's existing letter and verification ID remain active until it is.
          </p>
        </div>
      )}

      {unavailableProvider && (
        <div className="px-4 pb-3">
          <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-800 leading-relaxed">
            <span className="font-semibold">Exception: </span>
            this request is awaiting provider review but the order has no assigned
            provider. Assign a provider so the review can proceed.
            {onOpenProviderTab && (
              <button type="button" onClick={onOpenProviderTab}
                className="ml-2 underline font-semibold hover:text-red-900">
                Open Provider tab
              </button>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** Workflow state → compact list-chip suffix + tone.
 *  Deliberately carries NO financial detail: no amount, no paid/unpaid money
 *  wording, no refund value. "Unpaid" describes the WORKFLOW step (the customer
 *  has not completed checkout), which admins need in order to triage. */
const LIST_CHIP: Record<string, { suffix: string; cls: string }> = {
  payment_required:        { suffix: "Unpaid",   cls: "border-amber-200 bg-amber-50 text-amber-700" },
  checkout_created:        { suffix: "Unpaid",   cls: "border-amber-200 bg-amber-50 text-amber-700" },
  paid_pending_details:    { suffix: "Details",  cls: "border-amber-200 bg-amber-50 text-amber-700" },
  pending_provider_review: { suffix: "Review",   cls: "border-blue-200 bg-blue-50 text-blue-700" },
  resubmitted:             { suffix: "Review",   cls: "border-blue-200 bg-blue-50 text-blue-700" },
  clarification_requested: { suffix: "Clarify",  cls: "border-amber-200 bg-amber-50 text-amber-700" },
  approved_pending_document: { suffix: "Approved", cls: "border-blue-200 bg-blue-50 text-blue-700" },
  completed:               { suffix: "Added",    cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  rejected:                { suffix: "Declined", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  refund_pending:          { suffix: "Declined", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  refunded:                { suffix: "Declined", cls: "border-slate-200 bg-slate-50 text-slate-600" },
  manual_review_required:  { suffix: "Manual",   cls: "border-slate-200 bg-slate-50 text-slate-600" },
};

/**
 * Compact Orders-list chip. Rendered only when the order actually has an
 * Additional Pet request. `cancelled` requests are intentionally NOT shown —
 * a withdrawn request is not an operational signal and would only add noise.
 */
export function AdditionalPetListChip({
  status, size = "sm",
}: { status?: string | null; size?: "sm" | "xs" }) {
  if (!status || status === "cancelled") return null;
  const ui = LIST_CHIP[status];
  const text = ui ? `Additional Pet · ${ui.suffix}` : "Additional Pet";
  const tone = ui?.cls ?? "border-violet-200 bg-violet-50 text-violet-700";
  const dims = size === "xs" ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]";
  return (
    <span
      title={text}
      className={`inline-flex items-center rounded-full border font-semibold whitespace-nowrap ${dims} ${tone}`}
    >
      {text}
    </span>
  );
}
