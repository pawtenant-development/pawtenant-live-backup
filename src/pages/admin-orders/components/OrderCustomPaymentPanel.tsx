// OrderCustomPaymentPanel — ORDER-LINKED-CUSTOM-STRIPE-INVOICE-001
//
// The ONE renderer for an order's custom payment requests, mounted twice:
//   * variant="payments"  — the Payments tab card (frozen OrderDetailModal gets
//                           a single mount line, matching OrderAdditionalPetPanel).
//   * variant="embedded"  — inside the create dialog, so an operator sees what
//                           already exists before adding another.
//
// One component rather than two lists on purpose. These surfaces must offer the
// same actions on the same states; two copies would drift, and the state that
// drifts here is money — a Void that exists on one surface and not the other
// reads as "already voided" to whoever is looking at the wrong one.
//
// A custom payment is deliberately NOT the order's own payment. It never touches
// orders.price, paid_at or the order's PaymentIntent, so this panel never claims
// anything about whether the ORDER is paid — only about the request.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export type CustomPaymentPurpose = "supplemental_charge" | "outstanding_order_balance";

export interface CustomPaymentRequest {
  id: string;
  purpose: CustomPaymentPurpose;
  amount_cents: number;
  customer_description: string;
  status: string;
  hosted_url: string | null;
  stripe_invoice_id: string | null;
  created_at: string;
  paid_at: string | null;
  sent_at: string | null;
  created_by_name: string | null;
  refunded_amount_cents: number;
}

const STATUS_CHIP: Record<string, string> = {
  open: "bg-amber-50 text-[#B45309] border-amber-200",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  void: "bg-gray-100 text-gray-500 border-gray-200",
  expired: "bg-gray-100 text-gray-500 border-gray-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  draft: "bg-gray-100 text-gray-500 border-gray-200",
  creating: "bg-gray-100 text-gray-500 border-gray-200",
  refunded: "bg-orange-50 text-orange-700 border-orange-200",
  partially_refunded: "bg-orange-50 text-orange-700 border-orange-200",
};

const PURPOSE_LABEL: Record<string, string> = {
  supplemental_charge: "Supplemental charge",
  outstanding_order_balance: "Outstanding balance",
};

export function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d)
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const CUSTOM_PAYMENT_COLUMNS =
  "id, purpose, amount_cents, customer_description, status, hosted_url, stripe_invoice_id, created_at, paid_at, sent_at, created_by_name, refunded_amount_cents";

export default function OrderCustomPaymentPanel({
  orderId,
  variant,
  refreshKey = 0,
  onMessage,
}: {
  orderId: string;
  variant: "payments" | "embedded";
  /** Bump to force a reload — the create dialog does this after a successful create. */
  refreshKey?: number;
  onMessage?: (message: string) => void;
}) {
  const [requests, setRequests] = useState<CustomPaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [localMsg, setLocalMsg] = useState<string | null>(null);
  // `busyId` state settles asynchronously, so rapid clicks can all observe null.
  // The endpoints are durably idempotent regardless; this stops the UI firing
  // five voids and reporting the last one.
  const busyRef = useRef(false);

  const say = useCallback((m: string) => {
    if (onMessage) onMessage(m);
    else setLocalMsg(m);
  }, [onMessage]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("order_custom_payment_requests")
        .select(CUSTOM_PAYMENT_COLUMNS)
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      setRequests((data as CustomPaymentRequest[]) ?? []);
    } catch {
      // Fail soft: an empty list is honest here, and the panel must never take
      // the Payments tab down with it.
    }
    setLoading(false);
  }, [orderId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function manage(requestId: string, action: "void" | "send" | "sync") {
    if (busyRef.current) return;
    if (action === "void" && !window.confirm(
      "Void this payment request? The customer's link will stop accepting payment.",
    )) return;

    busyRef.current = true;
    setBusyId(requestId);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/manage-custom-payment-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, action, operationToken: crypto.randomUUID() }),
      });
      const data = await res.json() as {
        ok?: boolean; error?: string; duplicate?: boolean; suppressed?: boolean; reason?: string;
      };
      if (data.ok && data.duplicate) say("Already emailed to the customer.");
      else if (data.ok && data.suppressed) say(`Not sent: ${data.reason}`);
      else if (data.ok) {
        say(action === "void" ? "Request voided."
          : action === "send" ? "Payment request emailed."
          : "Synced with Stripe.");
      } else say(data.error ?? "Action failed.");
      await load();
    } catch (e) {
      say(e instanceof Error ? e.message : "Network error");
    }
    busyRef.current = false;
    setBusyId(null);
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      say("Payment link copied.");
    } catch {
      say("Could not copy — open the invoice and copy from the address bar.");
    }
  }

  const rows = (
    <ul className="space-y-2">
      {requests.map((r) => {
        const busy = busyId === r.id;
        const refunded = r.refunded_amount_cents > 0;
        return (
          <li key={r.id} className="border border-gray-200 rounded-lg px-3 py-2.5 bg-white">
            {/* Amount and status lead. `flex-wrap` + `min-w-0` keep the chip on
                its own line at 390px instead of pushing the row wider. */}
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <span className="text-sm font-extrabold text-gray-900 tabular-nums">
                  {money(r.amount_cents)}
                </span>
                <span className="ml-2 text-[11px] font-semibold text-gray-500">
                  {PURPOSE_LABEL[r.purpose] ?? r.purpose.replace(/_/g, " ")}
                </span>
              </div>
              <span className={`inline-flex items-center shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_CHIP[r.status] ?? "bg-gray-100 text-gray-500 border-gray-200"}`}>
                {r.status.replace(/_/g, " ")}
              </span>
            </div>

            <p className="text-[11px] text-gray-600 mt-1 break-words">{r.customer_description}</p>

            <p className="text-[10px] text-gray-400 mt-1">
              Created {fmtDate(r.created_at)}
              {r.paid_at ? ` · Paid ${fmtDate(r.paid_at)}` : ""}
              {r.sent_at ? ` · Emailed ${fmtDate(r.sent_at)}` : ""}
              {r.created_by_name ? ` · by ${r.created_by_name}` : ""}
            </p>

            {refunded && (
              <p className="text-[10px] text-orange-600 font-semibold mt-1">
                Refunded {money(r.refunded_amount_cents)}
                {r.refunded_amount_cents < r.amount_cents
                  ? ` of ${money(r.amount_cents)}`
                  : " (full)"}
              </p>
            )}

            <div className="flex items-center gap-x-3 gap-y-1.5 mt-2 flex-wrap">
              {r.hosted_url && (
                <>
                  <a
                    href={r.hosted_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-semibold text-[#3b6ea5] hover:text-[#1e3a5f] cursor-pointer flex items-center gap-1"
                  >
                    <i className="ri-external-link-line"></i>Open invoice
                  </a>
                  <button
                    type="button"
                    onClick={() => void copyLink(r.hosted_url as string)}
                    className="text-[11px] font-semibold text-[#3b6ea5] hover:text-[#1e3a5f] cursor-pointer flex items-center gap-1"
                  >
                    <i className="ri-file-copy-line"></i>Copy link
                  </button>
                </>
              )}
              {/* Send and Void are offered only while the request can still be
                  paid. A paid or voided request must not present either. */}
              {r.status === "open" && (
                <>
                  <button
                    type="button" disabled={busy}
                    onClick={() => void manage(r.id, "send")}
                    className="text-[11px] font-semibold text-[#3b6ea5] hover:text-[#1e3a5f] cursor-pointer flex items-center gap-1 disabled:opacity-40"
                  >
                    <i className="ri-mail-send-line"></i>{r.sent_at ? "Resend email" : "Send email"}
                  </button>
                  <button
                    type="button" disabled={busy}
                    onClick={() => void manage(r.id, "void")}
                    className="text-[11px] font-semibold text-red-600 hover:text-red-700 cursor-pointer flex items-center gap-1 disabled:opacity-40"
                  >
                    <i className="ri-close-circle-line"></i>Void
                  </button>
                </>
              )}
              <button
                type="button" disabled={busy}
                onClick={() => void manage(r.id, "sync")}
                className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 cursor-pointer flex items-center gap-1 disabled:opacity-40"
              >
                <i className={`ri-refresh-line ${busy ? "animate-spin" : ""}`}></i>Sync
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const body = loading ? (
    <p className="text-xs text-gray-400">Loading…</p>
  ) : requests.length === 0 ? (
    <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
      No custom payment requests on this order.
    </p>
  ) : rows;

  if (variant === "embedded") {
    return (
      <div>
        {localMsg && (
          <p className="text-xs font-semibold text-[#1e3a5f] bg-[#e8f0f9] border border-[#dbe4f0] rounded-lg px-3 py-2 mb-2">
            {localMsg}
          </p>
        )}
        {body}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <p className="text-xs font-extrabold text-[#1e3a5f] uppercase tracking-wider flex items-center gap-2">
          <i className="ri-bill-line text-[#3b6ea5]"></i>Custom Payment Requests
        </p>
        {requests.length > 0 && (
          <span className="text-[10px] font-bold text-gray-400">
            {requests.length} total
          </span>
        )}
      </div>
      <p className="text-[10px] text-gray-400 mb-3 leading-snug">
        Separate Stripe invoices raised against this order. They never change the
        order&apos;s package price and never mark the order itself paid.
      </p>
      {localMsg && (
        <p className="text-xs font-semibold text-[#1e3a5f] bg-[#e8f0f9] border border-[#dbe4f0] rounded-lg px-3 py-2 mb-2">
          {localMsg}
        </p>
      )}
      {body}
    </div>
  );
}
