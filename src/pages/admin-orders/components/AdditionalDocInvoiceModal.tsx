// AdditionalDocInvoiceModal — admin tool to send a tracked $50 "Additional
// Documentation" invoice tied to an existing order. Self-contained so the
// merge-frozen OrderDetailModal only needs a one-line mount + a menu item.
//
// Backend: create-additional-doc-invoice edge function (actions list/create/cancel).
// Payment completion is handled by stripe-webhook (marks paid + reopens order).
import { useState, useEffect, useCallback } from "react";
import { getAdminUserToken } from "../../../lib/supabaseClient";
import { ADDITIONAL_DOC_PRICING } from "../../../config/pricing";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

interface AddonRequest {
  id: string;
  status: string;
  amount_cents: number;
  customer_email: string;
  stripe_checkout_session_id: string | null;
  requested_by: string | null;
  requested_by_admin_name: string | null;
  paid_at: string | null;
  created_at: string;
}

interface Props {
  order: { id: string; confirmation_id: string; email: string; first_name: string | null };
  onClose: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  refunded: "bg-rose-50 text-rose-600 border-rose-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
};

export default function AdditionalDocInvoiceModal({ order, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<AddonRequest[]>([]);
  const [adminNote, setAdminNote] = useState("");
  const [customerMessage, setCustomerMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; emailSent: boolean; duplicate?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRefund, setConfirmingRefund] = useState<string | null>(null);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const callFn = useCallback(async (action: string, body: Record<string, unknown> = {}) => {
    const token = await getAdminUserToken();
    if (!token) throw new Error("Your admin session expired — please re-login and try again.");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/create-additional-doc-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, orderId: order.id, ...body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      throw new Error(data?.error ?? `Request failed (HTTP ${res.status})`);
    }
    return data;
  }, [order.id]);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callFn("list");
      setRequests((data.requests ?? []) as AddonRequest[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [callFn]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const hasPending = requests.some((r) => r.status === "pending");

  const handleSend = async () => {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const data = await callFn("create", {
        adminNote: adminNote.trim() || undefined,
        customerMessage: customerMessage.trim() || undefined,
        siteUrl: window.location.origin,
      });
      if (data.duplicate) {
        setResult({ url: "", emailSent: false, duplicate: true });
      } else {
        setResult({ url: data.checkoutUrl ?? "", emailSent: !!data.emailSent });
      }
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (requestId: string) => {
    setError("");
    setBusyRow(requestId);
    try {
      await callFn("cancel", { requestId });
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyRow(null);
    }
  };

  const handleRefund = async (requestId: string) => {
    setError("");
    setBusyRow(requestId);
    try {
      await callFn("refund", { requestId });
      setConfirmingRefund(null);
      await loadRequests();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyRow(null);
    }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <i className="ri-file-add-line text-emerald-600"></i>
              Send Additional Documentation Invoice
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">Order {order.confirmation_id}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Amount</p>
              <p className="text-2xl font-extrabold text-gray-900">${ADDITIONAL_DOC_PRICING.addon}.00</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Customer</p>
              <p className="text-sm font-semibold text-gray-800 truncate" title={order.email}>{order.email || "—"}</p>
            </div>
          </div>

          <p className="text-xs text-gray-500 leading-relaxed">
            Sends the customer a secure ${ADDITIONAL_DOC_PRICING.addon} payment link for provider completion of additional
            documentation/forms. After payment, the order is automatically placed back
            <span className="font-semibold"> under review</span> for provider review. No new ESA/PSD order is created.
          </p>

          {/* Existing requests */}
          {loading ? (
            <div className="text-xs text-gray-400 py-2">Loading existing requests…</div>
          ) : requests.length > 0 ? (
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100">
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Add-on payments</span>
                <button type="button" onClick={loadRequests} className="text-[11px] font-semibold text-gray-500 hover:text-gray-700" title="Re-check payment status with Stripe">
                  <i className="ri-refresh-line"></i> Refresh
                </button>
              </div>
              {requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <span className={`inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLES[r.status] ?? STATUS_STYLES.cancelled}`}>
                      {r.status}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">
                      ${(r.amount_cents / 100).toFixed(0)} · {new Date(r.created_at).toLocaleDateString()}
                      {r.requested_by === "customer" ? " · customer" : ""}
                    </span>
                  </div>
                  {r.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleCancel(r.id)}
                      disabled={busyRow === r.id}
                      className="text-[11px] font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
                    >
                      {busyRow === r.id ? "…" : "Cancel"}
                    </button>
                  )}
                  {r.status === "paid" && (
                    confirmingRefund === r.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-gray-500">Refund ${ADDITIONAL_DOC_PRICING.addon}?</span>
                        <button type="button" onClick={() => handleRefund(r.id)} disabled={busyRow === r.id} className="text-[11px] font-bold text-rose-600 hover:text-rose-700 disabled:opacity-50">
                          {busyRow === r.id ? "Refunding…" : "Confirm"}
                        </button>
                        <button type="button" onClick={() => setConfirmingRefund(null)} className="text-[11px] font-semibold text-gray-400 hover:text-gray-600">No</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmingRefund(r.id)} className="text-[11px] font-semibold text-rose-600 hover:text-rose-700" title={`Refunds only the $${ADDITIONAL_DOC_PRICING.addon} add-on; original order untouched`}>
                        Refund
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {/* Result banner */}
          {result?.duplicate && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
              A pending invoice already exists for this order. Cancel it above before sending a new one.
            </div>
          )}
          {result && !result.duplicate && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 space-y-2">
              <p className="font-semibold flex items-center gap-1.5">
                <i className="ri-checkbox-circle-fill"></i>
                Invoice created{result.emailSent ? " and emailed to the customer." : " (email not confirmed — share the link manually)."}
              </p>
              {result.url && (
                <div className="flex items-center gap-2">
                  <input readOnly value={result.url} className="flex-1 text-[11px] bg-white border border-emerald-200 rounded px-2 py-1 text-gray-600 truncate" />
                  <button type="button" onClick={() => copyUrl(result.url)} className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 whitespace-nowrap">
                    {copied ? "Copied!" : "Copy link"}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form (hidden once a non-duplicate result is shown) */}
          {!result || result.duplicate ? (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Optional message to customer</label>
                <textarea
                  value={customerMessage}
                  onChange={(e) => setCustomerMessage(e.target.value)}
                  rows={2}
                  placeholder="e.g. Please attach the housing verification form your landlord provided."
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Internal note (admin only)</label>
                <input
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  placeholder="Optional internal note"
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </>
          ) : null}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg">
            Close
          </button>
          {(!result || result.duplicate) && (
            <button
              type="button"
              onClick={handleSend}
              disabled={submitting || hasPending || !order.email}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              title={hasPending ? "A pending invoice already exists — cancel it first" : undefined}
            >
              {submitting ? <><i className="ri-loader-4-line animate-spin"></i> Sending…</> : <><i className="ri-mail-send-line"></i> Send ${ADDITIONAL_DOC_PRICING.addon} Invoice</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
