// AdditionalDocRequest — customer-facing "$40 Additional Documentation" flow
// inside /my-orders. Reuses the existing tracked add-on backend
// (create-additional-doc-invoice edge function) which already supports the
// owning-customer path (auth = customer access token; ownership = caller email
// must match the order email; admin-only actions stay admin-only).
//
//   • list   → load existing add-on requests for this order (auto-reconciles a
//              paid-but-unconfirmed Stripe session, so completion never depends
//              on the webhook being delivered).
//   • create → start a fresh $40 Checkout session and redirect to Stripe.
//   • resume → finish an abandoned pending payment without creating a duplicate.
//
// After payment the order reopens to "under-review" (doctor_status in_review)
// with the assigned provider preserved — all handled server-side and idempotent.

import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

interface AddonRequest {
  id: string;
  status: string; // pending | paid | refunded | cancelled
  amount_cents: number;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
}

export interface AddonEligibleOrder {
  id: string;
  confirmation_id: string;
  status: string;
  payment_intent_id?: string | null;
  refunded_at?: string | null;
}

/** Show the flow only on a paid order that is not a lead / refunded / cancelled. */
export function canRequestAdditionalDoc(order: AddonEligibleOrder): boolean {
  const isPaid = !!order.payment_intent_id;
  const refunded = order.status === "refunded" || !!order.refunded_at;
  const cancelled = order.status === "cancelled";
  const lead = order.status === "lead";
  return isPaid && !refunded && !cancelled && !lead;
}

interface Props {
  order: AddonEligibleOrder;
  /** True when the page returned from a successful add-on checkout for THIS order. */
  highlightSuccess?: boolean;
}

export default function AdditionalDocRequest({ order, highlightSuccess }: Props) {
  const [requests, setRequests] = useState<AddonRequest[] | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const callFn = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Your session has expired — please sign in again.");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-additional-doc-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, orderId: order.id, siteUrl: window.location.origin, ...extra }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error ?? `Request failed (HTTP ${res.status})`);
    }
    return data as { requests?: AddonRequest[]; checkoutUrl?: string; duplicate?: boolean; alreadyPaid?: boolean };
  }, [order.id]);

  // Load (and auto-reconcile) existing requests. Runs on mount, and again when
  // we just came back from a successful checkout so a delayed webhook is moot.
  const load = useCallback(async () => {
    try {
      const data = await callFn("list");
      setRequests((data.requests ?? []) as AddonRequest[]);
    } catch {
      setRequests([]); // fail soft — the card still renders without the add-on UI
    }
  }, [callFn]);

  useEffect(() => { load(); }, [load]);

  // Active = most recent non-cancelled request. (cancelled rows are ignored.)
  const active = (requests ?? [])
    .filter((r) => r.status !== "cancelled")
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))[0] ?? null;

  async function startNew() {
    setSubmitting(true);
    setError("");
    try {
      const data = await callFn("create");
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      // Duplicate pending (raced) → resume it instead of creating another.
      if (data.duplicate) {
        const r = await callFn("resume");
        if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
        if (r.alreadyPaid) { await load(); setModalOpen(false); return; }
      }
      setError("Could not start checkout. Please try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  async function continuePayment() {
    setSubmitting(true);
    setError("");
    try {
      const r = await callFn("resume");
      if (r.checkoutUrl) { window.location.href = r.checkoutUrl; return; }
      if (r.alreadyPaid) { await load(); return; }
      setError("Could not open your payment. Please try again.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Paid / in-progress → received confirmation.
  if (active?.status === "paid") {
    return (
      <div className="mt-4 bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
        <i className="ri-file-check-line text-sky-600 mt-0.5"></i>
        <div className="text-xs text-sky-800 leading-relaxed">
          <p className="font-bold mb-0.5">Additional documentation request received.</p>
          <p>
            Your $40 payment was received and your case has been reopened for provider review. Please reply to our
            confirmation email with the specific form you need completed. Provider review is based on a clinical
            assessment of your file.
          </p>
        </div>
      </div>
    );
  }

  // Pending (abandoned) → status + continue payment.
  if (active?.status === "pending") {
    return (
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <div className="flex items-start gap-2.5">
          <i className="ri-time-line text-amber-600 mt-0.5"></i>
          <div className="text-xs text-amber-800 leading-relaxed flex-1">
            <p className="font-bold mb-0.5">Additional documentation — payment pending.</p>
            <p>We also emailed you a secure payment link. You can finish your $40 payment below.</p>
          </div>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={continuePayment}
            disabled={submitting}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white text-xs font-bold rounded-lg hover:bg-amber-700 disabled:opacity-60 cursor-pointer transition-colors"
          >
            {submitting ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-bank-card-line"></i>}
            Continue payment
          </button>
        </div>
        {error && <p className="text-xs text-red-600 mt-2 flex items-center gap-1"><i className="ri-error-warning-line"></i>{error}</p>}
      </div>
    );
  }

  // No active request (or only a previously refunded/cancelled one) → request CTA.
  const wasRefunded = active?.status === "refunded";

  return (
    <>
      <div className="mt-4 bg-gradient-to-r from-sky-50 to-blue-50 border border-sky-100 rounded-xl px-4 py-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg border border-sky-100 flex-shrink-0">
              <i className="ri-file-add-line text-sky-600"></i>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-sky-800">Need additional documentation?</p>
              <p className="text-xs text-sky-700 leading-relaxed mt-0.5">
                Request provider review for extra housing/provider documentation or forms for this case.
                {wasRefunded && " A previous request was refunded — you can submit a new one."}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setError(""); setModalOpen(true); }}
            className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-sky-600 text-white text-xs font-bold rounded-lg hover:bg-sky-700 cursor-pointer transition-colors"
          >
            <i className="ri-file-add-line"></i>Request Additional Documentation
          </button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => !submitting && setModalOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <i className="ri-file-add-line text-sky-600"></i>Additional Documentation
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Order {order.confirmation_id}</p>
              </div>
              <button type="button" onClick={() => !submitting && setModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">One-time service</p>
                  <p className="text-xs text-gray-600 mt-0.5">Additional documentation / forms</p>
                </div>
                <p className="text-2xl font-extrabold text-gray-900">$40.00</p>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                Need extra housing or provider documentation completed after your original letter? This $40 service
                reopens your case for <span className="font-semibold">provider review</span>. After payment, please reply
                to our confirmation email with the specific form you need completed, or upload it in your portal.
              </p>
              <ul className="text-xs text-gray-600 space-y-1.5">
                <li className="flex items-start gap-2"><i className="ri-checkbox-circle-line text-sky-500 mt-0.5"></i>Your case is reopened for review by a licensed provider.</li>
                <li className="flex items-start gap-2"><i className="ri-checkbox-circle-line text-sky-500 mt-0.5"></i>Your original order, letter and payment are unchanged.</li>
                <li className="flex items-start gap-2"><i className="ri-information-line text-gray-400 mt-0.5"></i>Provider review is based on a clinical assessment of your file. We cannot guarantee third-party or landlord acceptance of any document.</li>
              </ul>

              {error && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{error}</div>}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
              <button type="button" onClick={() => !submitting && setModalOpen(false)} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                type="button"
                onClick={startNew}
                disabled={submitting}
                className="px-4 py-2 text-xs font-bold text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {submitting ? <><i className="ri-loader-4-line animate-spin"></i> Starting…</> : <><i className="ri-bank-card-line"></i> Pay $40 and reopen my case</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {highlightSuccess && active == null && (
        <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-xs text-emerald-800 flex items-center gap-2">
          <i className="ri-loader-4-line animate-spin"></i> Confirming your additional documentation payment…
        </div>
      )}
    </>
  );
}
