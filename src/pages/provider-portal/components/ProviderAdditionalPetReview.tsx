// ProviderAdditionalPetReview — the provider's Additional Pet decision surface
// (ORDER-ADDITIONAL-PET-UI-STRIPE-QA-CLOSURE-001 §9).
//
// A PROVIDER NEVER SEES MONEY. This component reads exclusively through the
// SECURITY DEFINER projection get_additional_pet_request_for_provider(), whose
// explicit safe field list contains no amount, pricing outcome, Stripe
// identifier, refund field, entitlement evidence or attribution. It never
// queries order_additional_pet_requests directly — that table has no provider
// RLS policy precisely because a row policy cannot hide a column.
//
// Decisions go to provider-additional-pet-decision, which is idempotent: a
// retried approve/reject returns the STANDING decision rather than an error.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

interface Pet { name?: string; type?: string; breed?: string; age?: string; weight?: string }

interface ProviderView {
  found: boolean;
  request_id?: string;
  status?: string;
  service_type?: string;
  new_pet?: Pet;
  original_pets?: Pet[];
  target_pet_count?: number;
  provider_decision?: string | null;
  provider_decision_reason?: string | null;
  clarification_history?: Array<{ event_type: string; actor_role: string; created_at: string; detail?: Record<string, unknown> }>;
  created_at?: string;
}

const DECIDABLE = new Set(["pending_provider_review", "clarification_requested", "resubmitted"]);

const STATUS_LABEL: Record<string, string> = {
  pending_provider_review: "Awaiting your review",
  clarification_requested: "Clarification requested — awaiting the customer",
  resubmitted: "Customer responded — awaiting your review",
  approved_pending_document: "Approved — document being prepared",
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

export default function ProviderAdditionalPetReview({ orderId }: { orderId: string }) {
  const [view, setView] = useState<ProviderView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<null | "clarify" | "reject">(null);
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
      setError("Please give a reason so the customer understands the outcome.");
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
      // Idempotent retry: the standing decision is a success, not an error.
      setNotice(d.alreadyDecided
        ? "This request has already been decided. Showing the current decision."
        : action === "approve"
          ? "Approved. A revised document will be prepared."
          : action === "reject"
            ? "Recorded. The customer has been notified."
            : "Sent to the customer.");
      setMode(null); setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally { setBusy(false); }
  }

  if (!view?.found) return null;

  const status = view.status ?? "";
  const canDecide = DECIDABLE.has(status) && status !== "clarification_requested";

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

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Pets already covered by this order
          </p>
          {view.original_pets && view.original_pets.length > 0 ? (
            <ul className="space-y-0.5">
              {view.original_pets.map((p, i) => (
                <li key={i} className="text-gray-700 text-[13px] break-words">{petLine(p)}</li>
              ))}
            </ul>
          ) : <p className="text-gray-500 text-[13px]">None recorded</p>}
          <p className="mt-1 text-[11px] text-gray-500">
            Total after approval: {view.target_pet_count ?? "—"} of 3
          </p>
        </div>

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
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.provider_decision_reason && (
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <p className="text-[12px] text-gray-700 leading-relaxed break-words">
              <span className="font-semibold">
                {status === "clarification_requested" ? "You asked: " : "Your note: "}
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
            <button type="button" disabled={busy} onClick={() => { setMode("reject"); setError(""); }}
              className="rounded-lg border border-gray-300 px-3.5 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-gray-400">
              Reject
            </button>
          </div>
        )}

        {mode !== null && (
          <div className="space-y-2 pt-1">
            <label htmlFor="addpet-reason" className="block text-[11px] font-semibold text-gray-700">
              {mode === "clarify"
                ? "What do you need from the customer?"
                : "Reason for not approving"}
            </label>
            <textarea
              id="addpet-reason" rows={3} value={reason} maxLength={600}
              onChange={(e) => setReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy}
                onClick={() => decide(mode === "clarify" ? "request_clarification" : "reject")}
                className="rounded-lg bg-[#1a5c4f] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#14483e] disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#1a5c4f]">
                {busy ? "Sending…" : mode === "clarify" ? "Send to customer" : "Confirm rejection"}
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
      </div>
    </div>
  );
}
