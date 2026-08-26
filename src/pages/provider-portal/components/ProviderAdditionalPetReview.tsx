// ProviderAdditionalPetReview — the provider's Additional Pet decision surface
// (ORDER-ADDITIONAL-PET-UI-STRIPE-QA-CLOSURE-001 §9), amended by
// ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001:
// "Decline" replaced "Reject" — a decline records THIS provider's decision and
// returns the request to PawTenant for reassignment to another provider. It is
// not a customer-facing rejection and it never refunds.
//
// A PROVIDER NEVER SEES MONEY. This component reads exclusively through the
// SECURITY DEFINER projection get_additional_pet_request_for_provider(), whose
// explicit safe field list contains no amount, pricing outcome, Stripe
// identifier, refund field, entitlement evidence or attribution. It never
// queries order_additional_pet_requests directly — that table has no provider
// RLS policy precisely because a row policy cannot hide a column.
//
// Decisions go to provider-additional-pet-decision, which is idempotent: a
// retried approve/decline returns the STANDING state rather than an error.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

interface Pet { name?: string; type?: string; breed?: string; age?: string; weight?: string; support_reason?: string }

interface ClinicalContext {
  customer_first_name?: string;
  state?: string;
  letter_type?: string;
  assessment_answers?: Record<string, unknown> | null;
}

interface ProviderView {
  found: boolean;
  request_id?: string;
  status?: string;
  service_type?: string;
  new_pet?: Pet;
  original_pets?: Pet[];
  approved_added_pets?: Pet[];
  target_pet_count?: number;
  provider_decision?: string | null;
  provider_decision_reason?: string | null;
  clarification_history?: Array<{ event_type: string; actor_role: string; created_at: string; detail?: Record<string, unknown> }>;
  created_at?: string;
  is_reviewer?: boolean;
  confirmation_id?: string;
  clinical_context?: ClinicalContext;
}

const DECIDABLE = new Set(["pending_provider_review", "clarification_requested", "resubmitted"]);

const STATUS_LABEL: Record<string, string> = {
  pending_provider_review: "Awaiting your review",
  clarification_requested: "Clarification requested — awaiting the customer",
  resubmitted: "Customer responded — awaiting your review",
  needs_reassignment: "Returned to PawTenant for reassignment",
  approved_pending_document: "Approved — awaiting the revised document",
  completed: "Approved — revised document issued",
  rejected: "Not approved",
  refund_pending: "Not approved",
  refunded: "Not approved",
};

function petLine(p: Pet | undefined): string {
  if (!p) return "—";
  return [p.name, p.type, p.breed, p.age ? `${p.age} yrs` : null, p.weight ? `${p.weight} lbs` : null]
    .filter(Boolean).join(" · ");
}

/** Assessment keys that are clinical context, rendered in a stable order.
 *  Everything else in assessment_answers (pets, letterType, acknowledgments)
 *  is either rendered elsewhere or non-clinical noise. */
const CLINICAL_KEYS: Array<[string, string]> = [
  ["conditions", "Conditions"],
  ["specificDiagnosis", "Specific diagnosis"],
  ["priorDiagnosis", "Prior diagnosis"],
  ["symptomDescription", "Symptoms"],
  ["dailyImpact", "Daily impact"],
  ["emotionalFrequency", "Emotional frequency"],
  ["challengeDuration", "Duration of challenges"],
  ["lifeChangeStress", "Life-change stress"],
  ["sleepQuality", "Sleep quality"],
  ["socialFunctioning", "Social functioning"],
  ["currentTreatment", "Current treatment"],
  ["treatmentDetails", "Treatment details"],
  ["medication", "Medication"],
  ["medicationDetails", "Medication details"],
  ["safetyCheck", "Safety check"],
  ["dogTasks", "Dog tasks"],
  ["taskDescription", "Task description"],
  ["dogHelpDescription", "How the dog helps"],
];

function clinicalRows(answers: Record<string, unknown> | null | undefined): Array<[string, string]> {
  if (!answers) return [];
  const rows: Array<[string, string]> = [];
  for (const [key, label] of CLINICAL_KEYS) {
    const v = answers[key];
    if (v == null || v === "") continue;
    rows.push([label, Array.isArray(v) ? v.map(String).join(", ") : String(v)]);
  }
  return rows;
}

export default function ProviderAdditionalPetReview({
  orderId, showClinicalContext = false,
}: { orderId: string; showClinicalContext?: boolean }) {
  const [view, setView] = useState<ProviderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<null | "clarify" | "decline">(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    try {
      const { data, error: e } = await supabase
        .rpc("get_additional_pet_request_for_provider", { p_order_id: orderId });
      if (e) { setView(null); return; }
      setView((data ?? null) as ProviderView | null);
    } catch { setView(null); }
  }, [orderId]);

  useEffect(() => { load(); }, [load]);

  async function decide(action: "approve" | "request_clarification" | "reject") {
    if (!view?.request_id) return;
    if ((action !== "approve") && !reason.trim()) {
      setError(action === "reject"
        ? "Please give a reason for declining — it is recorded for the PawTenant team and the next reviewer."
        : "Please give a reason so the customer understands what is needed.");
      return;
    }
    setBusy(true); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Your session has expired — please sign in again.");
      const res = await fetch(`${SUPABASE_URL}/functions/v1/provider-additional-pet-decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, requestId: view.request_id, reason: reason.trim() || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d?.ok === false) throw new Error(d?.error ?? `Request failed (HTTP ${res.status})`);
      // Idempotent retry: the standing state is a success, not an error.
      setNotice(d.alreadyDecided || d.alreadyDeclined
        ? "This request has already been handled. Showing its current state."
        : action === "approve"
          ? "Approved. Please submit the revised letter covering every approved pet."
          : action === "reject"
            ? "Declined. PawTenant will arrange for another licensed provider to review this request — it is not a customer rejection and no refund is triggered."
            : "Sent to the customer.");
      setMode(null); setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  if (!view?.found) return null;

  const status = view.status ?? "";
  // `is_reviewer` gates the decision buttons: after reassignment the request
  // belongs to another provider, and this surface becomes read-only for
  // everyone else. Absent (older projection) → fall back to permissive and let
  // the server enforce.
  const mayDecide = view.is_reviewer !== false;
  const canDecide = DECIDABLE.has(status) && status !== "clarification_requested" && mayDecide;
  const ctx = view.clinical_context;
  const assessment = clinicalRows(ctx?.assessment_answers);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-extrabold text-orange-500">Additional Pet Requested</h3>
        <span className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">
          {STATUS_LABEL[status] ?? status}
        </span>
      </div>

      <div className="px-4 py-3 space-y-3 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            New pet for review
          </p>
          <p className="text-gray-900 font-medium break-words">{petLine(view.new_pet)}</p>
        </div>

        {view.new_pet?.support_reason && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              Customer&apos;s support explanation
            </p>
            <p className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-[13px] text-gray-800 leading-relaxed break-words">
              {view.new_pet.support_reason}
            </p>
          </div>
        )}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Pets already covered by this order
          </p>
          {(() => {
            const covered = [...(view.original_pets ?? []), ...(view.approved_added_pets ?? [])
              .filter((p) => p?.name !== view.new_pet?.name)];
            return covered.length > 0 ? (
              <ul className="space-y-0.5">
                {covered.map((p, i) => (
                  <li key={i} className="text-gray-700 text-[13px] break-words">{petLine(p)}</li>
                ))}
              </ul>
            ) : <p className="text-gray-500 text-[13px]">None recorded</p>;
          })()}
          <p className="mt-1 text-[11px] text-gray-500">
            Total after approval: {view.target_pet_count ?? "—"} of 3
          </p>
        </div>

        {showClinicalContext && (assessment.length > 0 || ctx?.customer_first_name) && (
          <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
            <summary className="cursor-pointer text-[12px] font-semibold text-gray-700">
              Original assessment{ctx?.customer_first_name ? ` — ${ctx.customer_first_name}` : ""}{ctx?.state ? ` (${ctx.state})` : ""}
            </summary>
            <dl className="mt-2 space-y-1.5">
              {assessment.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] font-semibold text-gray-500">{label}</dt>
                  <dd className="text-[12px] text-gray-800 break-words">{value}</dd>
                </div>
              ))}
              {assessment.length === 0 && (
                <p className="text-[12px] text-gray-500">No structured assessment answers on file.</p>
              )}
            </dl>
          </details>
        )}

        {view.created_at && (
          <p className="text-[11px] text-gray-500">
            Requested {new Date(view.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        )}

        {view.clarification_history && view.clarification_history.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
              History
            </p>
            <ul className="space-y-1">
              {view.clarification_history.map((h, i) => (
                <li key={i} className="text-[12px] text-gray-600 break-words">
                  <span className="font-medium text-gray-800">{h.event_type.replace(/_/g, " ")}</span>
                  {" · "}
                  {new Date(h.created_at).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
                  {/* A previous provider's decline reason is clinical context for
                      the next reviewer. Financial fields never reach this
                      payload — the projection strips them server-side. */}
                  {h.event_type === "provider_declined" && typeof h.detail?.reason === "string" && (
                    <span className="block pl-3 text-gray-500">“{h.detail.reason as string}”</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.provider_decision_reason && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <p className="text-[12px] text-gray-700 leading-relaxed break-words">
              <span className="font-semibold">
                {status === "clarification_requested" ? "You asked: " : "Note: "}
              </span>
              {view.provider_decision_reason}
            </p>
          </div>
        )}

        {notice && (
          <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800 leading-relaxed">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 leading-relaxed break-words">
            {error}
          </p>
        )}

        {canDecide && mode === null && (
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" disabled={busy} onClick={() => decide("approve")}
              className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-emerald-600">
              {busy ? "Working…" : "Approve"}
            </button>
            <button type="button" disabled={busy} onClick={() => { setMode("clarify"); setError(""); }}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-400">
              Request clarification
            </button>
            <button type="button" disabled={busy} onClick={() => { setMode("decline"); setError(""); }}
              className="rounded-lg border border-gray-300 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400">
              Decline
            </button>
          </div>
        )}

        {mode !== null && (
          <div className="space-y-2 pt-1">
            <label htmlFor="addpet-reason" className="block text-[11px] font-semibold text-gray-700">
              {mode === "clarify"
                ? "What do you need from the customer?"
                : "Reason for declining"}
            </label>
            {mode === "decline" && (
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Declining ends only your review of this request. It returns to
                PawTenant for reassignment to another licensed provider — the
                customer is not rejected and no refund is triggered.
              </p>
            )}
            <textarea
              id="addpet-reason" rows={3} value={reason} maxLength={600}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy}
                onClick={() => decide(mode === "clarify" ? "request_clarification" : "reject")}
                className="rounded-lg bg-[#1a5c4f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#14483e] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#1a5c4f]">
                {busy ? "Sending…" : mode === "clarify" ? "Send to customer" : "Confirm decline"}
              </button>
              <button type="button" disabled={busy} onClick={() => { setMode(null); setReason(""); setError(""); }}
                className="rounded-lg border border-gray-300 px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400">
                Cancel
              </button>
            </div>
          </div>
        )}

        {status === "clarification_requested" && (
          <p className="text-[12px] text-gray-600 leading-relaxed">
            Waiting for the customer to respond. The request will return here once
            they update the pet's details.
          </p>
        )}

        {DECIDABLE.has(status) && !mayDecide && (
          <p className="text-[12px] text-gray-600 leading-relaxed">
            This request is assigned to another reviewer.
          </p>
        )}
      </div>
    </div>
  );
}
