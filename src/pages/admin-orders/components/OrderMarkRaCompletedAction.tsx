// OrderMarkRaCompletedAction — RA-LIFECYCLE-001 step E (admin manual completion)
//
// The escape hatch for RA / Additional-Documentation work that really happened
// but never went through the dedicated workflow: historical orders, work agreed
// over email, a provider who sent the form the wrong way.
//
// This component owns eligibility, the confirmation dialog and submission, so
// the merge-frozen OrderDetailModal only gets a one-line mount.
//
// AUTHORIZATION IS NOT UI. Everything here is a convenience: the real checks —
// admin session, proven entitlement, current completion state, at-most-one
// earning — are re-run server-side in admin-mark-ra-completed, which also
// refuses a service-role bearer. Hiding the button stops an accident; it does
// not stop anyone, and it is not relied upon.
//
// FAILS CLOSED. If entitlement cannot be proven, the item renders DISABLED with
// the reason. Entitlement is never inferred from price, coupon, filename or how
// many documents happen to be attached.

import { useCallback, useEffect, useState } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";

interface Props {
  orderId: string;
  confirmationId: string;
  onCloseMenu: () => void;
}

interface EvidenceDoc {
  id: string;
  label: string | null;
  doc_type: string | null;
}

type Eligibility =
  | { state: "loading" }
  | { state: "eligible"; entitlement: "saved_ra_bundle" | "paid_request" }
  | { state: "blocked"; reason: string };

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export default function OrderMarkRaCompletedAction({ orderId, confirmationId, onCloseMenu }: Props) {
  const [elig, setElig] = useState<Eligibility>({ state: "loading" });
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("");
  const [evidenceId, setEvidenceId] = useState<string>("");
  const [candidates, setCandidates] = useState<EvidenceDoc[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string>("");
  const [failed, setFailed] = useState(false);

  const loadEligibility = useCallback(async () => {
    const { data: order } = await supabase
      .from("orders")
      .select("id, status, additional_documentation_status, includes_reasonable_accommodation_letter, package_key")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) { setElig({ state: "blocked", reason: "Order not found" }); return; }

    if ((order.additional_documentation_status ?? "") === "completed") {
      setElig({ state: "blocked", reason: "RA service is already completed" });
      return;
    }

    const isBundle = order.includes_reasonable_accommodation_letter === true ||
      ["esa_ra_bundle", "psd_ra_bundle"].includes(String(order.package_key ?? ""));

    const { data: reqs } = await supabase
      .from("order_additional_documentation_requests")
      .select("id, status, paid_at, cancelled_at, amount_cents, refund_amount_cents")
      .eq("order_id", orderId);
    // REFUND-CONSUMER rule: `refunded_at` is stamped for PARTIAL refunds too, so
    // a boolean read would revoke entitlement for work that was genuinely paid
    // for and only partly refunded. Entitlement ends only when the charge has
    // been returned IN FULL.
    const paid = (reqs ?? []).some((r) => {
      const amt = typeof r.amount_cents === "number" ? r.amount_cents : 0;
      const ref = typeof r.refund_amount_cents === "number" ? r.refund_amount_cents : 0;
      return r.status === "paid" && !!r.paid_at && !r.cancelled_at && amt - ref > 0;
    });

    if (!isBundle && !paid) {
      setElig({ state: "blocked", reason: "No RA entitlement on this order" });
      return;
    }
    setElig({ state: "eligible", entitlement: isBundle ? "saved_ra_bundle" : "paid_request" });
  }, [orderId]);

  useEffect(() => { loadEligibility(); }, [loadEligibility]);

  // Only a clinical-letter row can be MIScLASSIFIED legacy RA evidence — a doc
  // already typed housing_completed needs no reclassification.
  const loadCandidates = useCallback(async () => {
    const { data } = await supabase
      .from("order_documents")
      .select("id, label, doc_type")
      .eq("order_id", orderId)
      .in("doc_type", ["esa_letter", "psd_letter"])
      .order("uploaded_at", { ascending: true });
    setCandidates((data as EvidenceDoc[]) ?? []);
  }, [orderId]);

  const submit = async () => {
    setBusy(true);
    setResult("");
    setFailed(false);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-mark-ra-completed`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          orderId,
          reason: reason.trim(),
          confirmed: true,
          evidenceDocumentId: evidenceId || null,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.ok !== true) {
        setFailed(true);
        setResult(body?.error ?? `Failed (HTTP ${res.status})`);
      } else if (body.alreadyCompleted) {
        setResult("Already completed — nothing changed, and no second earning was created.");
        await loadEligibility();
      } else {
        setResult(
          `RA service marked complete.${body.created ? " Provider earning recorded." : " No new earning (one already existed)."}` +
          `${body.reclassifiedDocumentId ? " Legacy evidence reclassified and its verification pointers cleared." : ""}` +
          `${body.orderReturnedToCompleted ? " Order returned to Completed." : " Base letter not yet delivered — base workflow left as-is."}`,
        );
        await loadEligibility();
      }
    } catch (e) {
      setFailed(true);
      setResult(e instanceof Error ? e.message : "Request failed");
    }
    setBusy(false);
  };

  const disabled = elig.state !== "eligible";
  const disabledReason = elig.state === "blocked" ? elig.reason : elig.state === "loading" ? "Checking…" : "";

  return (
    <>
      <button
        role="menuitem"
        disabled={disabled}
        title={disabled ? disabledReason : "For RA work completed outside the normal workflow"}
        onClick={() => { if (disabled) return; setOpen(true); loadCandidates(); onCloseMenu(); }}
        className={`w-full text-left px-3.5 py-2.5 text-sm flex items-start gap-2.5 transition-colors ${
          disabled ? "text-gray-300 cursor-not-allowed" : "text-gray-700 hover:bg-gray-50"
        }`}
      >
        <i className={`ri-home-gear-line text-base mt-0.5 ${disabled ? "text-gray-300" : "text-violet-500"}`}></i>
        <span className="flex-1">
          <span className="block font-medium">Mark RA Service Completed</span>
          {disabled && <span className="block text-[11px] text-gray-400 mt-0.5">{disabledReason}</span>}
        </span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Mark RA Service Completed</h3>
              <p className="text-xs text-gray-500 mt-1">{confirmationId}</p>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-900 leading-relaxed">
                  This is for <strong>historical or manual RA work completed outside the dedicated
                  workflow</strong>. It marks the Additional Documentation service complete and records the
                  provider&rsquo;s RA payout once. Normal in-flow RA work should be approved from the document
                  review panel instead.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Internal reason (required)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. RA form completed by provider over email in June; evidence attached."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              {candidates.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Legacy RA evidence document (optional)
                  </label>
                  <select
                    value={evidenceId}
                    onChange={(e) => setEvidenceId(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white"
                  >
                    <option value="">None — do not reclassify any document</option>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>{c.label ?? c.id} ({c.doc_type})</option>
                    ))}
                  </select>
                  <p className="text-[11px] text-red-600 mt-1.5 leading-relaxed">
                    Only pick a document you have confirmed is an RA form. It will be reclassified to
                    housing_completed and its verification pointers cleared so the clean original is served.
                    <strong> ESA/PSD verification must never be attached to an RA form</strong>, and a genuine
                    clinical letter must never be selected here.
                  </p>
                </div>
              )}

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-xs text-gray-700 leading-relaxed">
                  I confirm the RA service was genuinely completed and that any document selected above is an
                  RA form, not a clinical ESA/PSD letter.
                </span>
              </label>

              {result && (
                <div className={`text-xs rounded-lg p-3 ${failed ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200"}`}>
                  {result}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => { setOpen(false); setResult(""); setConfirmed(false); }}
                className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                Close
              </button>
              <button
                onClick={submit}
                disabled={busy || !confirmed || reason.trim().length < 5 || elig.state !== "eligible"}
                className="px-3.5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:bg-gray-200 disabled:text-gray-400 rounded-lg"
              >
                {busy ? "Working…" : "Mark completed"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
