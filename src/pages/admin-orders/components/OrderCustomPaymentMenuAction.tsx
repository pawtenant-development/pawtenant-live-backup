// OrderCustomPaymentMenuAction — ORDER-LINKED-CUSTOM-STRIPE-INVOICE-001
//
// Isolated component mount for the frozen OrderDetailModal header "More" menu.
// Eligibility, the dialog, validation, submission and idempotency live here. The
// frozen file gets one mount line.
//
// The LIST of existing requests is NOT rendered here — OrderCustomPaymentPanel
// owns it and is mounted below in "embedded" mode, the same component the
// Payments tab renders. Two copies of a money list drift, and a Void offered on
// one surface but not the other misreads as "already voided".
//
// The dropdown/dialog mechanics follow OrderAdditionalPetMenuAction exactly,
// for the reasons documented there: OrderDetailModal renders the dropdown as
// `{showHeaderMore && (…)}` and closes it on any outside mousedown, so
//   * calling onCloseMenu() to open a dialog would UNMOUNT this component and
//     the dialog with it, and
//   * a portaled dialog is outside headerMoreRef, so its first mousedown would
//     read as an outside click and tear the dropdown down mid-interaction.
// Hence: portal to document.body at a z-index above the order modal's z-[100],
// and stop mousedown/keydown from reaching the document listeners.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";
import OrderCustomPaymentPanel, { money } from "./OrderCustomPaymentPanel";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

// Mirrors the server bounds. The server is authoritative — this only spares the
// operator a round trip for an obviously wrong figure.
const MIN_CENTS = 100;
const MAX_CENTS = 200_000;

type Purpose = "supplemental_charge" | "outstanding_order_balance";

function DialogHost({ onRequestClose, children }: { onRequestClose: () => void; children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onRequestClose(); }}
      onKeyDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
    >
      {children}
    </div>,
    document.body,
  );
}

export default function OrderCustomPaymentMenuAction({
  orderId, confirmationId, onCloseMenu,
}: {
  orderId: string;
  confirmationId: string | null;
  onCloseMenu: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<Record<string, unknown> | null>(null);

  const [purpose, setPurpose] = useState<Purpose>("supplemental_charge");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bumped after a successful create so the embedded panel reloads.
  const [refreshKey, setRefreshKey] = useState(0);
  // Synchronous guard: `busy` state updates async, so five fast clicks can all
  // observe busy === false. The server is durably idempotent regardless.
  const busyRef = useRef(false);

  const loadOrder = useCallback(async () => {
    try {
      const { data } = await supabase.from("orders")
        .select("confirmation_id, first_name, last_name, email, status, price, paid_at, package_display_name, letter_type")
        .eq("id", orderId).maybeSingle();
      setOrder((data as Record<string, unknown>) ?? null);
    } catch { /* fail soft — the dialog still renders its form */ }
  }, [orderId]);

  useEffect(() => { if (open) void loadOrder(); }, [open, loadOrder]);

  async function submit() {
    if (busyRef.current) return;
    setMsg(null);

    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) { setMsg("Enter an amount greater than zero."); return; }
    // Dollars → integer cents once, here, with an explicit round. Passing a
    // float to Stripe is how 42.5 becomes 4249.999999.
    const cents = Math.round(dollars * 100);
    if (cents < MIN_CENTS) { setMsg(`Minimum charge is ${money(MIN_CENTS)}.`); return; }
    if (cents > MAX_CENTS) { setMsg(`Maximum charge is ${money(MAX_CENTS)}.`); return; }
    if (!description.trim()) { setMsg("A customer-facing description is required."); return; }

    busyRef.current = true;
    setBusy(true);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-custom-payment-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          confirmationId,
          purpose,
          amountCents: cents,
          customerDescription: description.trim(),
          internalNote: note.trim() || undefined,
          // One token per create the operator initiated.
          operationToken: crypto.randomUUID(),
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; duplicate?: boolean };
      if (data.ok && data.duplicate) setMsg("A request for this operation already exists.");
      else if (data.ok) { setMsg("Payment request created."); setAmount(""); setDescription(""); setNote(""); }
      else setMsg(data.error ?? "Could not create the payment request.");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Network error");
    }
    busyRef.current = false;
    setBusy(false);
  }

  const customerName = [order?.first_name, order?.last_name].filter(Boolean).join(" ") || "—";

  return (
    <>
      <button
        type="button"
        role="menuitem"
        onClick={() => setOpen(true)}
        className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2 cursor-pointer"
      >
        <i className="ri-bill-line text-[#3b6ea5]"></i>Create Custom Payment Request
      </button>

      {open && (
        <DialogHost onRequestClose={() => { setOpen(false); onCloseMenu(); }}>
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[88vh] overflow-y-auto shadow-2xl">
            <div className="px-5 py-3.5 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white z-10">
              <p className="text-sm font-extrabold text-[#1e3a5f] flex items-center gap-2">
                <i className="ri-bill-line text-[#3b6ea5]"></i>Custom Payment Request
              </p>
              <button type="button" onClick={() => { setOpen(false); onCloseMenu(); }}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"><i className="ri-close-line text-lg"></i></button>
            </div>

            <div className="p-4 sm:p-5 space-y-4">
              {/* Context — so the operator can see exactly which order they are charging */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 border border-gray-200 rounded-xl p-3">
                {[
                  ["Order", confirmationId ?? "—"],
                  ["Customer", customerName],
                  ["Email", (order?.email as string) ?? "—"],
                  ["Order status", (order?.status as string) ?? "—"],
                  ["Payment", order?.paid_at ? "Paid" : "Unpaid"],
                  ["Package", (order?.package_display_name as string) ?? (order?.letter_type as string) ?? "—"],
                ].map(([k, v]) => (
                  <div key={k as string} className="min-w-0">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{k}</p>
                    <p className="text-xs font-semibold text-gray-800 break-words">{v as string}</p>
                  </div>
                ))}
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Purpose</label>
                <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {([
                    ["supplemental_charge", "Supplemental charge", "Extra work alongside this order. Does not mark the order paid."],
                    ["outstanding_order_balance", "Outstanding balance", "Settles an order that is genuinely unpaid."],
                  ] as const).map(([val, label, hint]) => (
                    <button key={val} type="button" onClick={() => setPurpose(val)}
                      className={`text-left px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${purpose === val ? "border-[#3b6ea5] bg-[#e8f0f9]" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                      <span className="block font-bold text-gray-800">{label}</span>
                      <span className="block text-[10px] text-gray-500 mt-0.5 leading-snug">{hint}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Amount (USD)</label>
                  <input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="mt-1.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-[#3b6ea5] focus:bg-white" />
                  <p className="text-[10px] text-gray-400 mt-1">{money(MIN_CENTS)}–{money(MAX_CENTS)}. No discount codes apply.</p>
                </div>
                <div className="flex items-end">
                  <p className="text-[10px] text-gray-500 leading-snug">
                    This amount is an explicit admin authorisation. It does not change the order&apos;s package price.
                  </p>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Customer-facing description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 300))} rows={2}
                  placeholder="What the customer is paying for — this appears on the Stripe page and the email."
                  className="mt-1.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-[#3b6ea5] focus:bg-white resize-none" />
                <p className="text-[10px] text-gray-400 mt-1 text-right">{description.length}/300</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Internal note (never shown to the customer)</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 1000))} rows={2}
                  placeholder="Why this charge was agreed. Admin only."
                  className="mt-1.5 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-[#3b6ea5] focus:bg-white resize-none" />
              </div>

              {msg && <p className="text-xs font-semibold text-[#1e3a5f] bg-[#e8f0f9] border border-[#dbe4f0] rounded-lg px-3 py-2">{msg}</p>}

              <button type="button" onClick={submit} disabled={busy}
                className="w-full whitespace-nowrap flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-40 cursor-pointer transition-colors">
                {busy ? <><i className="ri-loader-4-line animate-spin"></i>Working…</> : <><i className="ri-bill-line"></i>Create Payment Request</>}
              </button>

              {/* Existing requests — same renderer the Payments tab uses. */}
              <div className="border-t border-gray-200 pt-3">
                <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">Requests on this order</p>
                <OrderCustomPaymentPanel
                  orderId={orderId}
                  variant="embedded"
                  refreshKey={refreshKey}
                  onMessage={setMsg}
                />
              </div>
            </div>
          </div>
        </DialogHost>
      )}
    </>
  );
}
