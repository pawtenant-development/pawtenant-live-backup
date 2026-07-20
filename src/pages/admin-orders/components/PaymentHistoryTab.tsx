import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

interface PaymentAttempt {
  id: string;
  confirmation_id: string;
  event_type: string;
  status: "succeeded" | "failed" | "pending" | "cancelled" | "async_failed" | "async_succeeded";
  amount: number | null;
  currency: string;
  payment_method: string | null;
  payment_intent_id: string | null;
  checkout_session_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  decline_code: string | null;
  stripe_event_id: string | null;
  raw_error: Record<string, unknown> | null;
  created_at: string;
}

// Additional Documentation ($50 add-on) payment — lives in its own table
// (order_additional_documentation_requests), NOT in payment_attempts, so it
// is fetched separately via the create-additional-doc-invoice edge function.
interface AddonRequest {
  id: string;
  status: string; // pending | paid | refunded | cancelled
  amount_cents: number;
  created_at: string;
  paid_at: string | null;
  refunded_at: string | null;
  stripe_payment_intent_id: string | null;
  requested_by: string | null;
}

// Provider payout rows (doctor_earnings) for this order — base order payout plus
// any Additional Documentation add-on payout. Read directly (admin RLS allows).
interface ProviderEarningRow {
  id: string;
  earning_type: string | null;
  doctor_amount: number | null;
  status: string;
  additional_documentation_request_id: string | null;
}

// Canonical Order — see ../types.ts
import type { Order } from "../types";
import OrderDiscountBreakdown from "./OrderDiscountBreakdown";

interface PaymentHistoryTabProps {
  order: Order;
  supabaseUrl: string;
  anonKey: string;
  onOrderUpdated: (fields: Partial<Order> & { id: string }) => void;
}

const STATUS_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  succeeded: { label: "Succeeded", icon: "ri-checkbox-circle-fill", color: "text-emerald-700", bg: "bg-emerald-100" },
  async_succeeded: { label: "Async Succeeded", icon: "ri-checkbox-circle-fill", color: "text-emerald-700", bg: "bg-emerald-100" },
  failed: { label: "Failed", icon: "ri-close-circle-fill", color: "text-red-600", bg: "bg-red-100" },
  async_failed: { label: "Async Failed", icon: "ri-close-circle-fill", color: "text-red-600", bg: "bg-red-100" },
  cancelled: { label: "Cancelled / Expired", icon: "ri-time-line", color: "text-gray-500", bg: "bg-gray-100" },
  pending: { label: "Pending", icon: "ri-loader-4-line", color: "text-amber-600", bg: "bg-amber-100" },
};

const EVENT_LABELS: Record<string, string> = {
  "payment_intent.succeeded": "Card Payment",
  "payment_intent.payment_failed": "Card Payment Failed",
  "payment_intent.canceled": "Payment Cancelled",
  "checkout.session.completed": "Checkout Completed",
  "checkout.session.async_payment_succeeded": "Klarna / QR Succeeded",
  "checkout.session.async_payment_failed": "Klarna / QR Failed",
  "checkout.session.expired": "Session Expired",
  "invoice.payment_failed": "Subscription Invoice Failed",
};

const METHOD_LABELS: Record<string, string> = {
  card: "Credit / Debit Card",
  klarna: "Klarna",
  qr: "QR Code / Mobile Pay",
  subscription: "Subscription (Annual)",
};

const DECLINE_EXPLANATIONS: Record<string, string> = {
  insufficient_funds: "Customer's card has insufficient funds.",
  card_declined: "Card was declined by the issuing bank.",
  expired_card: "Card is expired.",
  incorrect_cvc: "Incorrect CVC / security code entered.",
  incorrect_number: "Incorrect card number entered.",
  do_not_honor: "Bank declined — customer should contact their bank.",
  lost_card: "Card reported as lost.",
  stolen_card: "Card reported as stolen.",
  fraudulent: "Stripe flagged this as potentially fraudulent.",
  generic_decline: "Generic decline — no specific reason provided by bank.",
  authentication_required: "3D Secure / authentication required but not completed.",
  try_again_later: "Temporary issue — customer can try again.",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function RetryPaymentButton({ order, supabaseUrl, anonKey }: { order: Order; supabaseUrl: string; anonKey: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");

  const handleSend = async () => {
    if (!order.email) return;
    setSending(true);
    setErr("");
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          email: order.email,
          letterType: order.letter_type ?? "esa",
          confirmationId: order.confirmation_id,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        setSent(true);
      } else {
        setErr(data.error ?? "Failed to send retry link.");
      }
    } catch {
      setErr("Network error — please try again.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-center gap-1.5 text-emerald-700 text-xs font-semibold">
        <i className="ri-checkbox-circle-fill text-emerald-500"></i>
        Retry payment link sent to {order.email}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-60"
      >
        {sending
          ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
          : <><i className="ri-send-plane-line"></i>Send Retry Payment Link</>}
      </button>
      {err && <p className="text-[10px] text-red-500 mt-1 flex items-center gap-1"><i className="ri-error-warning-line"></i>{err}</p>}
    </div>
  );
}

function DiscountEmailButton({ order, supabaseUrl, anonKey }: { order: Order; supabaseUrl: string; anonKey: string }) {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);

  const handleSend = async () => {
    setSending(true);
    setMsg("");
    setOk(null);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/send-checkout-recovery`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          confirmationId: order.confirmation_id,
          email: order.email,
          firstName: order.first_name ?? "",
          price: order.price,
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (result.ok) {
        setMsg(`Discount/recovery email sent to ${order.email}`);
        setOk(true);
      } else {
        setMsg(result.error ?? "Send failed — check edge function logs");
        setOk(false);
      }
    } catch {
      setMsg("Network error — please try again");
      setOk(false);
    }
    setSending(false);
    setTimeout(() => { setMsg(""); setOk(null); }, 8000);
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleSend}
        disabled={sending}
        className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-2 border border-[#b8cce4] text-[#3b6ea5] bg-[#e8f0f9] hover:bg-[#dce8f5] text-xs font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-60"
      >
        {sending
          ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
          : <><i className="ri-coupon-3-line"></i>Send Discount Email</>}
      </button>
      {msg && (
        <p className={`text-xs mt-1 flex items-center gap-1 font-semibold ${ok ? "text-emerald-700" : "text-red-600"}`}>
          <i className={ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
          {msg}
        </p>
      )}
    </div>
  );
}

export default function PaymentHistoryTab({ order, supabaseUrl, anonKey, onOrderUpdated }: PaymentHistoryTabProps) {
  const [attempts, setAttempts] = useState<PaymentAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addonRequests, setAddonRequests] = useState<AddonRequest[]>([]);
  const [providerEarnings, setProviderEarnings] = useState<ProviderEarningRow[]>([]);

  const loadAttempts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("payment_attempts")
      .select("*")
      .eq("confirmation_id", order.confirmation_id)
      .order("created_at", { ascending: false })
      .limit(50);
    setAttempts((data as PaymentAttempt[]) ?? []);
    setLoading(false);
  }, [order.confirmation_id]);

  // 2026-05-22 REFUND-CANCEL-FOLLOWUP: also reload payment_attempts when the
  // parent updates `order.refund_amount` (which happens immediately after a
  // successful Refund + Cancel). Without this, the Payments tab kept showing
  // the pre-refund attempt list until the user clicked Refresh. We do NOT
  // change `loadAttempts`'s own dependency array, because the query only
  // needs `confirmation_id`; we just retrigger the existing function.
  useEffect(() => {
    loadAttempts();
  }, [loadAttempts, order.refund_amount, order.refunded_at]);

  // Additional Documentation ($50) payments live in a separate table; pull them
  // via the edge function (admin session token) so the Payments tab shows the
  // full financial picture, not just the base order payment. Fails soft.
  const loadAddons = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${supabaseUrl}/functions/v1/create-additional-doc-invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "list", orderId: order.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data?.requests)) {
        setAddonRequests(data.requests as AddonRequest[]);
      }
    } catch { /* fail soft — base payments still render */ }
  }, [supabaseUrl, anonKey, order.id]);

  useEffect(() => { loadAddons(); }, [loadAddons, order.refund_amount, order.refunded_at]);

  // Provider payout ledger for this order (base + add-on). Admin RLS permits read.
  const loadProviderEarnings = useCallback(async () => {
    const { data } = await supabase
      .from("doctor_earnings")
      .select("id, earning_type, doctor_amount, status, additional_documentation_request_id")
      .eq("order_id", order.id)
      .order("created_at", { ascending: true });
    setProviderEarnings((data as ProviderEarningRow[]) ?? []);
  }, [order.id]);

  useEffect(() => { loadProviderEarnings(); }, [loadProviderEarnings, order.refund_amount, order.refunded_at]);

  const successCount = attempts.filter((a) => a.status === "succeeded" || a.status === "async_succeeded").length;
  const failedCount = attempts.filter((a) => a.status === "failed" || a.status === "async_failed").length;
  const cancelledCount = attempts.filter((a) => a.status === "cancelled").length;

  const isPaid = !!order.payment_intent_id;

  return (
    <div className="p-4 sm:p-6 space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Payment History</p>
          <p className="text-xs text-gray-400 mt-0.5">Every payment attempt logged from Stripe webhooks</p>
        </div>
        <button
          type="button"
          onClick={loadAttempts}
          disabled={loading}
          className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-500 text-xs font-semibold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
        >
          <i className={loading ? "ri-loader-4-line animate-spin" : "ri-refresh-line"}></i>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {/* Stats strip */}
      {attempts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Successful", value: successCount, icon: "ri-checkbox-circle-fill", color: "text-emerald-700", bg: "bg-emerald-50 border-emerald-200" },
            { label: "Failed", value: failedCount, icon: "ri-close-circle-fill", color: "text-red-600", bg: "bg-red-50 border-red-200" },
            { label: "Expired / Cancelled", value: cancelledCount, icon: "ri-time-line", color: "text-gray-500", bg: "bg-gray-50 border-gray-200" },
          ].map((s) => (
            <div key={s.label} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${s.bg}`}>
              <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                <i className={`${s.icon} ${s.color} text-lg`}></i>
              </div>
              <div>
                <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Current payment status */}
      <div className={`rounded-xl border p-4 ${isPaid ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 flex items-center justify-center rounded-lg flex-shrink-0 ${isPaid ? "bg-emerald-100" : "bg-amber-100"}`}>
            <i className={`${isPaid ? "ri-bank-card-fill text-emerald-600" : "ri-bank-card-line text-amber-600"} text-base`}></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-extrabold ${isPaid ? "text-emerald-800" : "text-amber-800"}`}>
              {isPaid ? "Payment Confirmed" : "No Payment Received Yet"}
            </p>
            <p className={`text-xs mt-0.5 ${isPaid ? "text-emerald-700" : "text-amber-700"}`}>
              {isPaid
                ? `$${order.price ?? "—"} collected via ${METHOD_LABELS[order.payment_method ?? ""] ?? order.payment_method ?? "card"}`
                : order.payment_failure_reason
                  ? `Last failure: ${order.payment_failure_reason}`
                  : "Customer has not completed payment"
              }
            </p>
          </div>
          {isPaid && order.payment_intent_id && (
            <a
              href={`https://dashboard.stripe.com/payments/${order.payment_intent_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 cursor-pointer transition-colors flex-shrink-0"
            >
              <i className="ri-external-link-line"></i>View in Stripe
            </a>
          )}
        </div>
      </div>

      {/* Legacy-resume pricing note — only when this order kept its ORIGINAL
          quoted price instead of current pricing (set by create-payment-intent
          / create-checkout-session at checkout). Keeps admins from thinking the
          amount is a bug. */}
      {order.pricing_source === "legacy_saved_quote" && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center bg-indigo-100 rounded-lg flex-shrink-0">
            <i className="ri-price-tag-2-line text-indigo-600 text-sm"></i>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-indigo-800">Legacy quoted price</p>
            <p className="text-xs text-indigo-700 mt-0.5 leading-relaxed">
              This is a returning/resumed order. Checkout used the original quoted amount
              {order.price != null ? <> (<strong>${order.price}</strong>)</> : null}
              {order.quote_locked_at ? <> · locked {fmt(order.quote_locked_at)}</> : null}
              , not current public pricing.
            </p>
          </div>
        </div>
      )}

      {/* Discount / promo breakdown — only renders when this order used a
          coupon (coupon_code / coupon_discount on the order row). */}
      <OrderDiscountBreakdown
        price={order.price}
        couponCode={order.coupon_code}
        couponDiscount={order.coupon_discount}
        variant="full"
      />

      {/* Additional Documentation ($50 add-on) payments */}
      {addonRequests.length > 0 && (
        <div className="bg-white rounded-xl border border-sky-200 overflow-hidden">
          <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center bg-sky-100 rounded-lg">
              <i className="ri-file-add-line text-sky-600 text-sm"></i>
            </div>
            <div>
              <p className="text-xs font-bold text-sky-800">Additional Documentation</p>
              <p className="text-xs text-sky-500">Add-on payments billed separately from the base order</p>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {addonRequests.map((r) => {
              const amount = (r.amount_cents ?? 0) / 100;
              const badge =
                r.status === "paid" ? { label: "Paid", color: "text-emerald-700", bg: "bg-emerald-100", icon: "ri-checkbox-circle-fill" }
                : r.status === "refunded" ? { label: "Refunded", color: "text-gray-600", bg: "bg-gray-100", icon: "ri-refund-2-line" }
                : r.status === "cancelled" ? { label: "Cancelled", color: "text-gray-500", bg: "bg-gray-100", icon: "ri-close-circle-line" }
                : { label: "Pending", color: "text-amber-600", bg: "bg-amber-100", icon: "ri-time-line" };
              return (
                <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                  <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5 ${badge.bg}`}>
                    <i className={`${badge.icon} ${badge.color} text-sm`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-sm font-bold text-gray-900">Additional Documentation</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${badge.bg} ${badge.color}`}>
                        <i className={badge.icon} style={{ fontSize: "9px" }}></i>{badge.label}
                      </span>
                      <span className="text-xs font-bold text-emerald-600">${amount.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs text-gray-400">{fmt(r.paid_at ?? r.created_at)}</p>
                      {r.requested_by && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span className="text-xs text-gray-500 font-medium">Requested by {r.requested_by}</span>
                        </>
                      )}
                    </div>
                  </div>
                  {r.stripe_payment_intent_id && (
                    <a
                      href={`https://dashboard.stripe.com/payments/${r.stripe_payment_intent_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="whitespace-nowrap flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors flex-shrink-0"
                    >
                      <i className="ri-external-link-line"></i>Stripe
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Provider earnings for this order (base + add-on payout) */}
      {providerEarnings.length > 0 && (() => {
        const num = (v: number | null) => (typeof v === "number" ? v : 0);
        const addonRows = providerEarnings.filter((e) => e.earning_type === "additional_documentation");
        const baseRows = providerEarnings.filter((e) => e.earning_type !== "additional_documentation");
        const baseTotal = baseRows.reduce((s, e) => s + num(e.doctor_amount), 0);
        const addonTotal = addonRows.reduce((s, e) => s + num(e.doctor_amount), 0);
        const anyUnsetBase = baseRows.some((e) => e.doctor_amount == null);
        const anyUnsetAddon = addonRows.some((e) => e.doctor_amount == null);
        return (
          <div className="bg-white rounded-xl border border-violet-200 overflow-hidden">
            <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center gap-2">
              <div className="w-7 h-7 flex items-center justify-center bg-violet-100 rounded-lg">
                <i className="ri-user-star-line text-violet-600 text-sm"></i>
              </div>
              <div>
                <p className="text-xs font-bold text-violet-800">Provider Earnings (this order)</p>
                <p className="text-xs text-violet-500">What the assigned provider is paid for this case</p>
              </div>
            </div>
            <div className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 flex items-center gap-1.5"><i className="ri-briefcase-line text-gray-400"></i>Base order payout</span>
                <span className="text-sm font-bold text-gray-900">{baseRows.length === 0 ? "—" : anyUnsetBase && baseTotal === 0 ? "Rate not set" : `$${baseTotal}`}</span>
              </div>
              {addonRows.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600 flex items-center gap-1.5"><i className="ri-file-add-line text-sky-500"></i>Additional Documentation payout{addonRows.length > 1 ? ` ×${addonRows.length}` : ""}</span>
                  <span className="text-sm font-bold text-sky-700">{anyUnsetAddon && addonTotal === 0 ? "Rate not set" : `+$${addonTotal}`}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-xs font-bold text-gray-700">Total provider earning</span>
                <span className="text-base font-extrabold text-violet-700">${baseTotal + addonTotal}</span>
              </div>
              <p className="text-[10px] text-gray-400 leading-relaxed pt-1">
                Recorded in the provider earnings ledger (doctor_earnings). Manage / mark paid in the Providers earnings panel.
              </p>
            </div>
          </div>
        );
      })()}

      {/* Actions for unpaid orders */}
      {!isPaid && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
            <i className="ri-mail-send-line text-orange-500"></i>
            Recovery Actions
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
              <p className="text-xs font-bold text-orange-800 mb-1 flex items-center gap-1">
                <i className="ri-send-plane-line"></i>Retry Payment Link
              </p>
              <p className="text-xs text-orange-700 mb-2 leading-relaxed">
                Sends a direct link to resume checkout with their saved assessment pre-filled.
              </p>
              <RetryPaymentButton order={order} supabaseUrl={supabaseUrl} anonKey={anonKey} />
            </div>
            <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-3">
              <p className="text-xs font-bold text-[#3b6ea5] mb-1 flex items-center gap-1">
                <i className="ri-coupon-3-line"></i>Discount Recovery Email
              </p>
              <p className="text-xs text-[#3b6ea5]/70 mb-2 leading-relaxed">
                Sends a recovery email with a discount offer to nudge the customer to complete checkout.
              </p>
              <DiscountEmailButton order={order} supabaseUrl={supabaseUrl} anonKey={anonKey} />
            </div>
          </div>
        </div>
      )}

      {/* Payment attempts log */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
          <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg">
            <i className="ri-history-line text-gray-500 text-sm"></i>
          </div>
          <div>
            <p className="text-xs font-bold text-gray-800">Attempt Log</p>
            <p className="text-xs text-gray-400">
              {attempts.length === 0 ? "No attempts recorded yet" : `${attempts.length} event${attempts.length !== 1 ? "s" : ""} recorded`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <i className="ri-loader-4-line animate-spin text-2xl text-gray-300"></i>
          </div>
        ) : attempts.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
              <i className="ri-bank-card-line text-gray-300 text-xl"></i>
            </div>
            <p className="text-sm font-bold text-gray-600 mb-1">No payment attempts recorded</p>
            <p className="text-xs text-gray-400 max-w-xs mx-auto leading-relaxed">
              Payment attempts will appear here once the customer interacts with the checkout. Only events received after this feature was deployed will be logged.
            </p>
            {order.payment_failure_reason && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-left max-w-sm mx-auto">
                <p className="text-xs font-bold text-red-700 mb-1 flex items-center gap-1">
                  <i className="ri-error-warning-fill"></i>Last Known Failure (from order record)
                </p>
                <p className="text-xs text-red-600">{order.payment_failure_reason}</p>
                {order.payment_failed_at && (
                  <p className="text-[10px] text-red-400 mt-1">{fmt(order.payment_failed_at)}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {attempts.map((attempt) => {
              const cfg = STATUS_CONFIG[attempt.status] ?? STATUS_CONFIG.pending;
              const eventLabel = EVENT_LABELS[attempt.event_type] ?? attempt.event_type.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
              const isExpanded = expandedId === attempt.id;
              const isFailed = attempt.status === "failed" || attempt.status === "async_failed";
              const declineExplanation = attempt.decline_code ? DECLINE_EXPLANATIONS[attempt.decline_code] : null;
              const methodLabel = attempt.payment_method ? (METHOD_LABELS[attempt.payment_method] ?? attempt.payment_method) : null;

              return (
                <div key={attempt.id} className={`${isFailed ? "bg-red-50/30" : ""}`}>
                  <div
                    className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : attempt.id)}
                  >
                    {/* Status icon */}
                    <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5 ${cfg.bg}`}>
                      <i className={`${cfg.icon} ${cfg.color} text-sm`}></i>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-bold text-gray-900">{eventLabel}</span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>
                          <i className={cfg.icon} style={{ fontSize: "9px" }}></i>
                          {cfg.label}
                        </span>
                        {attempt.amount != null && (
                          <span className={`text-xs font-bold ${isFailed ? "text-red-500" : "text-emerald-600"}`}>
                            ${attempt.amount.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs text-gray-400">{fmt(attempt.created_at)}</p>
                        {methodLabel && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs text-gray-500 font-medium">{methodLabel}</span>
                          </>
                        )}
                        {isFailed && attempt.failure_message && (
                          <>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs text-red-500 font-semibold truncate max-w-[200px]" title={attempt.failure_message}>
                              {attempt.failure_message.slice(0, 60)}{attempt.failure_message.length > 60 ? "..." : ""}
                            </span>
                          </>
                        )}
                      </div>
                      {/* Decline code badge */}
                      {attempt.decline_code && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-[10px] font-bold">
                            <i className="ri-error-warning-line" style={{ fontSize: "9px" }}></i>
                            {attempt.decline_code.replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Expand toggle */}
                    <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <i className={`${isExpanded ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-gray-400 text-sm`}></i>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 ml-11">
                      <div className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">

                        {/* Failure explanation */}
                        {isFailed && (
                          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5">
                            <p className="text-xs font-bold text-red-800 mb-1 flex items-center gap-1">
                              <i className="ri-error-warning-fill"></i>
                              Why did this fail?
                            </p>
                            {declineExplanation ? (
                              <p className="text-xs text-red-700 leading-relaxed">{declineExplanation}</p>
                            ) : attempt.failure_message ? (
                              <p className="text-xs text-red-700 leading-relaxed">{attempt.failure_message}</p>
                            ) : (
                              <p className="text-xs text-red-600">No specific reason provided by Stripe.</p>
                            )}
                          </div>
                        )}

                        {/* Detail grid */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                          {[
                            { label: "Event Type", value: attempt.event_type },
                            { label: "Status", value: cfg.label },
                            ...(attempt.amount != null ? [{ label: "Amount", value: `$${attempt.amount.toFixed(2)} ${attempt.currency?.toUpperCase() ?? "USD"}` }] : []),
                            ...(methodLabel ? [{ label: "Payment Method", value: methodLabel }] : []),
                            ...(attempt.failure_code ? [{ label: "Failure Code", value: attempt.failure_code }] : []),
                            ...(attempt.decline_code ? [{ label: "Decline Code", value: attempt.decline_code }] : []),
                            ...(attempt.payment_intent_id ? [{ label: "Payment Intent", value: attempt.payment_intent_id }] : []),
                            ...(attempt.checkout_session_id ? [{ label: "Checkout Session", value: attempt.checkout_session_id }] : []),
                            ...(attempt.stripe_event_id ? [{ label: "Stripe Event ID", value: attempt.stripe_event_id }] : []),
                          ].map(({ label, value }) => (
                            <div key={label}>
                              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">{label}</p>
                              <p className="text-xs font-mono text-gray-700 break-all">{value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Stripe links */}
                        <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-gray-100">
                          {attempt.payment_intent_id && (
                            <a
                              href={`https://dashboard.stripe.com/payments/${attempt.payment_intent_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
                            >
                              <i className="ri-external-link-line"></i>View Payment in Stripe
                            </a>
                          )}
                          {attempt.checkout_session_id && (
                            <a
                              href={`https://dashboard.stripe.com/payments/${attempt.checkout_session_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="whitespace-nowrap inline-flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
                            >
                              <i className="ri-external-link-line"></i>View Session in Stripe
                            </a>
                          )}
                        </div>

                        {/* Raw error (collapsed) */}
                        {attempt.raw_error && Object.keys(attempt.raw_error).length > 0 && (
                          <details className="mt-1">
                            <summary className="text-[10px] text-gray-400 font-semibold cursor-pointer hover:text-gray-600 select-none">
                              Raw Stripe Error Data
                            </summary>
                            <pre className="mt-2 text-[10px] text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3 overflow-x-auto leading-relaxed">
                              {JSON.stringify(attempt.raw_error, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="flex items-start gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
        <i className="ri-information-line text-gray-400 flex-shrink-0 mt-0.5 text-sm"></i>
        <p className="text-xs text-gray-500 leading-relaxed">
          Payment attempts are logged from Stripe webhooks in real-time. Historical attempts before this feature was deployed won&apos;t appear here, but the last known failure reason is shown in the Overview tab.
        </p>
      </div>
    </div>
  );
}
