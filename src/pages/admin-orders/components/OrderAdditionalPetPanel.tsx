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
// Historically reads-only. ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-
// REVISION-001 adds the EXPLICIT admin actions the owner mandated when the
// auto-refund-on-decline policy was retired: reassign a declined review to
// another eligible provider, refund by explicit admin decision only, finally
// reject a request that holds no unreturned money, and waive/honor a request
// whose refund already happened (system-error remediation). Every action calls
// a server-authorised RPC or the decision edge function — the panel still
// never writes a table directly.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { isProviderEligibleForState } from "./providerEligibility";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

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
  waived_at: string | null;
  waived_note: string | null;
  created_at: string;
}

interface ProviderOption {
  user_id: string;
  full_name: string | null;
  is_active: boolean | null;
  availability_status: string | null;
  licensed_states: string[] | null;
  state_license_numbers: Record<string, string> | null;
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
  needs_reassignment: { label: "Needs reassignment", tone: "red" },
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
  const [orderState, setOrderState] = useState<string>("");
  const [assignedReviewerName, setAssignedReviewerName] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

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
            .from("orders").select("doctor_user_id, doctor_name, state").eq("id", orderId).maybeSingle();
          if (!alive) return;
          setOrderHasProvider(!!(o as { doctor_user_id?: string } | null)?.doctor_user_id);
          setProviderName((o as { doctor_name?: string } | null)?.doctor_name ?? null);
          setOrderState(((o as { state?: string } | null)?.state ?? "").trim());

          // The REQUEST-level reviewer can differ from the order's provider
          // after a reassignment — show who actually holds the review.
          if (r.assigned_provider_user_id) {
            const { data: rev } = await supabase
              .from("doctor_profiles").select("full_name")
              .eq("user_id", r.assigned_provider_user_id).maybeSingle();
            if (alive) setAssignedReviewerName((rev as { full_name?: string } | null)?.full_name ?? null);
          } else {
            setAssignedReviewerName(null);
          }

          if (variant === "documents") {
            const { data: v } = await supabase
              .from("order_document_versions")
              .select("id, version, letter_id, is_active, approval_status, revision_reason, activated_at")
              .eq("order_id", orderId)
              .order("version", { ascending: true });
            if (alive) setVersions((v ?? []) as VersionRow[]);
          }
        }
      } catch { /* display panel — never block the modal */ }
      finally { if (alive) setLoaded(true); }
    })();
    return () => { alive = false; };
  }, [orderId, variant, reloadKey]);

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
          <span className="text-slate-500 sm:block">Reviewing provider</span>
          <span className="font-medium text-slate-900 break-words">
            {req.status === "needs_reassignment"
              ? "None — needs reassignment"
              : assignedReviewerName ?? providerName ?? (orderHasProvider ? "Assigned" : "Not assigned")}
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

      {req.waived_at && (
        <div className="px-4 pb-3">
          <p className="rounded-lg bg-violet-50 border border-violet-200 px-3 py-2 text-[11px] text-violet-800 leading-relaxed break-words">
            <span className="font-semibold">Honored by admin waiver: </span>
            the add-on payment was refunded ({fmt(req.refunded_at)}) and PawTenant
            is honoring this request anyway. The refund record is preserved and no
            new payment will be requested.
            {req.waived_note ? <> Note: {req.waived_note}</> : null}
          </p>
        </div>
      )}

      <AdminAddPetActions req={req} orderState={orderState} onChanged={refresh} />
    </div>
  );
}

/**
 * ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001 — the
 * EXPLICIT admin actions on an Additional Pet request:
 *
 *   • Reassign (status needs_reassignment): choose another eligible provider —
 *     filtered by the order state via the same isProviderEligibleForState rule
 *     the order-assignment dropdowns use — and put the review back in front of
 *     them. The completed base order, its provider and its payout are untouched.
 *   • Refund & close (needs_reassignment, paid, unrefunded): the ONLY control
 *     that can return the add-on payment. Requires a reason; the server
 *     re-verifies the settled amount against the request's immutable quote.
 *   • Final rejection (needs_reassignment, no unreturned money): closes a $0
 *     request, or a paid one whose refund already happened.
 *   • Honor & waive (refunded, not yet waived): system-error remediation —
 *     preserves the refund record untouched and returns the review to the
 *     reassignment queue. Requires an auditable note.
 */
function AdminAddPetActions({
  req, orderState, onChanged,
}: { req: PetRequestRow; orderState: string; onChanged: () => void }) {
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<null | "reassign" | "refund" | "final_reject" | "waive">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const paidUnrefunded = req.pricing_outcome === "paid_upgrade" && !!req.paid_at && !req.refunded_at;
  const canReassign = req.status === "needs_reassignment";
  const canRefund = req.status === "needs_reassignment" && paidUnrefunded;
  const canFinalReject = req.status === "needs_reassignment" && !paidUnrefunded;
  const canWaive = req.status === "refunded" && !req.waived_at;

  useEffect(() => {
    if (mode !== "reassign" || providersLoaded) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("doctor_profiles")
        .select("user_id, full_name, is_active, availability_status, licensed_states, state_license_numbers")
        .eq("is_active", true)
        .order("full_name");
      if (!alive) return;
      const rows = ((data ?? []) as ProviderOption[])
        .filter((p) => p.availability_status !== "at_capacity")
        .filter((p) => isProviderEligibleForState(p, orderState));
      setProviders(rows);
      setProvidersLoaded(true);
    })();
    return () => { alive = false; };
  }, [mode, providersLoaded, orderState]);

  if (!canReassign && !canWaive) return null;

  async function callDecisionFn(action: "refund" | "final_reject", reason: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Your session has expired — please sign in again.");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-additional-pet-decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, requestId: req.id, reason }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d?.ok === false) throw new Error(d?.error ?? `Request failed (HTTP ${res.status})`);
    return d as { status?: string };
  }

  async function run() {
    setBusy(true); setError("");
    try {
      if (mode === "reassign") {
        if (!selectedProvider) throw new Error("Choose a provider first.");
        const { data, error: e } = await supabase.rpc("admin_reassign_additional_pet_request", {
          p_request_id: req.id, p_provider_user_id: selectedProvider,
          p_note: note.trim() || null,
        });
        if (e) throw new Error(e.message);
        const d = data as { ok?: boolean; error?: string } | null;
        if (!d?.ok) throw new Error(d?.error ?? "Reassignment failed.");
        setNotice("Reassigned. The review is back in front of the chosen provider.");
      } else if (mode === "refund") {
        if (!note.trim()) throw new Error("A refund reason is required.");
        const d = await callDecisionFn("refund", note.trim());
        setNotice(d.status === "refunded"
          ? "Refunded in full. The request is closed."
          : "Refund held for review — the settled amount needs manual verification.");
      } else if (mode === "final_reject") {
        if (!note.trim()) throw new Error("A rejection reason is required.");
        await callDecisionFn("final_reject", note.trim());
        setNotice("Finally rejected. The customer has been notified.");
      } else if (mode === "waive") {
        if (!note.trim()) throw new Error("An auditable note is required.");
        const { data, error: e } = await supabase.rpc("admin_waive_additional_pet_refund", {
          p_request_id: req.id, p_note: note.trim(),
        });
        if (e) throw new Error(e.message);
        const d = data as { ok?: boolean; error?: string } | null;
        if (!d?.ok) throw new Error(d?.error ?? "Waiver failed.");
        setNotice("Honored. The refund record is preserved and the review returned to the reassignment queue.");
      }
      setMode(null); setNote(""); setSelectedProvider("");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="px-4 pb-3 space-y-2">
      {canReassign && (
        <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-800 leading-relaxed">
          <span className="font-semibold">Needs reassignment: </span>
          the reviewing provider declined this add-on. The customer&apos;s
          {req.pricing_outcome === "paid_upgrade" ? " payment stays applied" : " request stays open"} —
          assign another eligible provider, or close it with an explicit decision below.
        </p>
      )}

      {notice && (
        <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800 leading-relaxed">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 leading-relaxed break-words">
          {error}
        </p>
      )}

      {mode === null && (
        <div className="flex flex-wrap gap-2">
          {canReassign && (
            <button type="button" disabled={busy} onClick={() => { setMode("reassign"); setError(""); }}
              className="rounded-lg bg-[#1a5c4f] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#14483e] disabled:opacity-60">
              Reassign to a provider
            </button>
          )}
          {canRefund && (
            <button type="button" disabled={busy} onClick={() => { setMode("refund"); setError(""); }}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60">
              Refund &amp; close
            </button>
          )}
          {canFinalReject && (
            <button type="button" disabled={busy} onClick={() => { setMode("final_reject"); setError(""); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              Final rejection
            </button>
          )}
          {canWaive && (
            <button type="button" disabled={busy} onClick={() => { setMode("waive"); setError(""); }}
              className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60">
              Honor request &amp; return to review
            </button>
          )}
        </div>
      )}

      {mode !== null && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
          {mode === "reassign" && (
            <div>
              <label htmlFor="addpet-reassign-provider" className="block text-[11px] font-semibold text-slate-700 mb-1">
                Eligible providers{orderState ? ` for ${orderState}` : ""}
              </label>
              <select
                id="addpet-reassign-provider" value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]">
                <option value="">{providersLoaded ? "Choose a provider…" : "Loading providers…"}</option>
                {providers.map((p) => (
                  <option key={p.user_id} value={p.user_id}>{p.full_name ?? p.user_id}</option>
                ))}
              </select>
              {providersLoaded && providers.length === 0 && (
                <p className="mt-1 text-[11px] text-red-700">
                  No eligible active provider found{orderState ? ` for ${orderState}` : ""}.
                </p>
              )}
            </div>
          )}
          <div>
            <label htmlFor="addpet-admin-note" className="block text-[11px] font-semibold text-slate-700 mb-1">
              {mode === "reassign" ? "Note (optional)"
                : mode === "refund" ? "Refund reason (required)"
                : mode === "final_reject" ? "Rejection reason (required — shown to the customer)"
                : "Waiver note (required — auditable)"}
            </label>
            <textarea
              id="addpet-admin-note" rows={2} value={note} maxLength={600}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12px] bg-white focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={run}
              className="rounded-lg bg-[#1a5c4f] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#14483e] disabled:opacity-60">
              {busy ? "Working…"
                : mode === "reassign" ? "Assign provider"
                : mode === "refund" ? "Confirm refund"
                : mode === "final_reject" ? "Confirm final rejection"
                : "Confirm waiver"}
            </button>
            <button type="button" disabled={busy}
              onClick={() => { setMode(null); setNote(""); setSelectedProvider(""); setError(""); }}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-60">
              Cancel
            </button>
          </div>
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
  needs_reassignment:      { suffix: "Reassign", cls: "border-red-200 bg-red-50 text-red-700" },
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
