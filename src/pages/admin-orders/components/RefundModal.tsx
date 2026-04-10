// RefundModal — Full or partial Stripe refund workflow
import { useState } from "react";
import { supabase as _supabase } from "../../../lib/supabaseClient";
import { getAdminToken } from "../../../lib/supabaseClient";

interface RefundCharge {
  id: string;
  amount: number;
  amount_refunded: number;
  customer_name: string | null;
  customer_email: string | null;
  description: string | null;
  created: number;
}

interface RefundModalProps {
  charge: RefundCharge;
  confirmationId?: string | null;
  onClose: () => void;
  onRefunded: (chargeId: string, newRefundedAmount: number) => void;
}

const REASONS = [
  { value: "requested_by_customer", label: "Customer Request" },
  { value: "duplicate", label: "Duplicate Charge" },
  { value: "fraudulent", label: "Fraudulent" },
];

export default function RefundModal({ charge, confirmationId, onClose, onRefunded }: RefundModalProps) {
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("requested_by_customer");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; customerNotified?: boolean } | null>(null);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const maxRefundable = charge.amount - charge.amount_refunded;
  const partialAmount = parseFloat(amount) || 0;
  const isPartialValid = refundType === "full" || (partialAmount > 0 && partialAmount <= maxRefundable);

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v);

  const handleSubmit = async () => {
    if (!isPartialValid) return;
    setSubmitting(true);
    setResult(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/create-refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          chargeId: charge.id,
          amount: refundType === "partial" ? partialAmount : undefined,
          reason,
          note: note.trim() || undefined,
          confirmationId: confirmationId || undefined,
        }),
      });
      const data = await res.json() as { ok: boolean; error?: string; refund?: { amount: number }; customerNotificationQueued?: boolean };
      if (data.ok) {
        const refundedAmount = data.refund ? data.refund.amount / 100 : (refundType === "full" ? maxRefundable : partialAmount);
        setResult({ ok: true, message: `Refund of ${formatCurrency(refundedAmount)} issued successfully.`, customerNotified: data.customerNotificationQueued ?? false });
        onRefunded(charge.id, charge.amount_refunded + refundedAmount);
      } else {
        setResult({ ok: false, message: data.error ?? "Refund failed — check Stripe dashboard." });
      }
    } catch {
      setResult({ ok: false, message: "Network error — could not reach refund service." });
    }
    setSubmitting(false);
  };

  const isSuccess = result?.ok === true;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={!submitting && !isSuccess ? onClose : undefined}></div>
      <div className="relative bg-white rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-orange-500 font-bold uppercase tracking-widest mb-0.5">Stripe Refund</p>
            <h2 className="text-base font-extrabold text-gray-900">Issue Refund</h2>
          </div>
          <button type="button" onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer transition-colors">
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Charge info */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-gray-900">{charge.customer_name ?? charge.customer_email ?? "Customer"}</p>
                {charge.customer_name && charge.customer_email && (
                  <p className="text-xs text-gray-400">{charge.customer_email}</p>
                )}
                {charge.description && <p className="text-xs text-gray-400 mt-0.5">{charge.description}</p>}
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(charge.created * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold text-gray-900">{formatCurrency(charge.amount)}</p>
                {charge.amount_refunded > 0 && (
                  <p className="text-xs text-orange-500">-{formatCurrency(charge.amount_refunded)} already refunded</p>
                )}
                <p className="text-xs font-bold text-emerald-600">Max refundable: {formatCurrency(maxRefundable)}</p>
              </div>
            </div>
          </div>

          {/* Success state */}
          {isSuccess ? (
            <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-4 text-center">
              <div className="w-12 h-12 flex items-center justify-center bg-[#e8f5f1] rounded-full mx-auto mb-3">
                <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-xl"></i>
              </div>
              <p className="text-sm font-bold text-[#1a5c4f] mb-1">Refund Issued!</p>
              <p className="text-xs text-[#1a5c4f]/70">{result?.message}</p>
              {result?.customerNotified && (
                <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-[#1a5c4f]/80 font-semibold">
                  <i className="ri-mail-send-line"></i> Customer notification sent to GHL
                </div>
              )}
              <button type="button" onClick={onClose}
                className="whitespace-nowrap mt-4 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg cursor-pointer hover:bg-[#17504a]">
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Refund type toggle */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Refund Type</label>
                <div className="flex items-center gap-1 bg-gray-50 rounded-xl p-1">
                  <button type="button" onClick={() => setRefundType("full")}
                    className={`whitespace-nowrap flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer ${refundType === "full" ? "bg-white border border-gray-200 text-gray-900" : "text-gray-500 hover:bg-white/60"}`}>
                    Full Refund ({formatCurrency(maxRefundable)})
                  </button>
                  <button type="button" onClick={() => setRefundType("partial")}
                    className={`whitespace-nowrap flex-1 py-2.5 rounded-lg text-sm font-bold transition-colors cursor-pointer ${refundType === "partial" ? "bg-white border border-gray-200 text-gray-900" : "text-gray-500 hover:bg-white/60"}`}>
                    Partial Refund
                  </button>
                </div>
              </div>

              {/* Partial amount */}
              {refundType === "partial" && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Refund Amount (USD)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">$</span>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
                      min="0.01" max={maxRefundable} step="0.01"
                      placeholder={`Max ${maxRefundable.toFixed(2)}`}
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400" />
                  </div>
                  {partialAmount > maxRefundable && (
                    <p className="text-xs text-red-500 mt-1">Cannot exceed {formatCurrency(maxRefundable)}</p>
                  )}
                </div>
              )}

              {/* Reason */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Reason</label>
                <div className="relative">
                  <select value={reason} onChange={(e) => setReason(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 bg-white cursor-pointer">
                    {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <i className="ri-arrow-down-s-line absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-sm"></i>
                </div>
              </div>

              {/* Internal note */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Internal Note (optional)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 300))} rows={2}
                  placeholder="Reason for refund, customer context, etc."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-orange-400 resize-none" />
                <p className="text-xs text-gray-400 mt-0.5 text-right">{note.length}/300</p>
              </div>

              {/* Error */}
              {result?.ok === false && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <i className="ri-error-warning-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-red-700">{result.message}</p>
                </div>
              )}

              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <i className="ri-alert-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
                <p className="text-xs text-amber-800">Refunds are <strong>irreversible</strong>. Stripe may take 5-10 business days to process. This action will be logged.</p>
              </div>
            </>
          )}
        </div>

        {!isSuccess && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
            <button type="button" onClick={onClose} disabled={submitting}
              className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={submitting || !isPartialValid}
              className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-lg hover:bg-orange-600 disabled:opacity-50 cursor-pointer transition-colors">
              {submitting
                ? <><i className="ri-loader-4-line animate-spin"></i>Processing...</>
                : <><i className="ri-refund-2-line"></i>Issue Refund</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
