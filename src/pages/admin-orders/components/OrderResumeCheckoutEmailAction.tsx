/**
 * LEAD-FOLLOWUP-GHL-DELIVERY-AND-ADMIN-RESUME-CHECKOUT-EMAIL-002 — Phase B.
 *
 * The Admin "Send Resume Checkout Email" More-menu action.
 *
 * WHY THIS IS A SEPARATE COMPONENT: OrderDetailModal.tsx is MERGE-FROZEN. It
 * receives a one-line mount; every behaviour lives here.
 *
 * CONTRACT:
 *   • Eligibility is ruled by the SERVER (send-resume-checkout-email
 *     `action: "preview"`). The browser renders a verdict, it never derives
 *     one — so the menu and the sender can never disagree about whether a
 *     customer may be contacted.
 *   • The item is NEVER enabled before the server has ruled, and an ineligible
 *     order renders a DISABLED item with the server's own reason text rather
 *     than an unexplained grey row.
 *   • Clicking mutates NOTHING. It opens a confirmation dialog.
 *   • AGE IS NOT A FACTOR. A July lead is as resumable as one from this
 *     morning; the only question is whether the order is still payable.
 *   • The stable checkout slug is NEVER fetched into this component. A link
 *     that reaches an admin browser can be pasted, screenshotted and
 *     forwarded; it belongs in the customer's inbox and nowhere else.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

/**
 * Tells CommunicationTab to reload the timeline. Same CustomEvent bridge
 * OrderRaOverviewStatus uses — it exists precisely so a component mounted
 * inside the frozen modal can reach the Comms panel without either file having
 * to know about the other.
 */
export const COMMS_REFRESH_EVENT = "pt:comms-refresh";

interface PreviewDisplay {
  customerName: string;
  maskedEmail: string;
  confirmationId: string;
  serviceType: string;
  packageName: string;
  amount: number | null;
}

interface PreviewResponse {
  ok: boolean;
  eligible: boolean;
  reason: string | null;
  reasonText: string | null;
  display?: PreviewDisplay;
  lastSentAt?: string | null;
  cooldownMinutes?: number;
}

function DialogHost({
  onRequestClose, labelledBy, children, blockClose,
}: {
  onRequestClose: () => void;
  labelledBy: string;
  children: React.ReactNode;
  blockClose?: boolean;
}) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      // z MUST exceed the OrderDetailModal root (`fixed inset-0 z-[100]`).
      // At an inherited lower z the dialog mounts, lays out and reports itself
      // visible while painting BEHIND the order modal — nothing on screen.
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-3 sm:p-4"
      onMouseDown={(e) => {
        // The dropdown closes on any document mousedown outside its ref, and a
        // portal to document.body is outside it — so without this the first
        // click inside the dialog tears down the dropdown and unmounts the
        // dialog mid-interaction.
        e.stopPropagation();
        if (e.target === e.currentTarget && !blockClose) onRequestClose();
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" && !blockClose) onRequestClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl border border-gray-200 bg-white shadow-xl"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 py-2 last:border-b-0">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <span className="min-w-0 break-words text-right text-xs font-semibold text-gray-800">{value ?? "—"}</span>
    </div>
  );
}

export default function OrderResumeCheckoutEmailAction({
  orderId,
  confirmationId,
  onCloseMenu,
}: {
  orderId: string;
  confirmationId?: string | null;
  onCloseMenu: () => void;
}) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Synchronous double-submit guard. A ref, not state: two clicks in the same
  // React batch would both read the same stale `sending === false`. The server
  // enforces this durably too — this only saves the round trip.
  const inFlight = useRef(false);

  const callFn = useCallback(async (action: "preview" | "send") => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("Your session has expired — please sign in again.");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-resume-checkout-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, orderId, confirmationId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      const err = new Error(data?.error ?? `Request failed (HTTP ${res.status})`);
      (err as Error & { reason?: string }).reason = data?.reason;
      throw err;
    }
    return data;
  }, [orderId, confirmationId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const d = await callFn("preview");
        if (alive) setPreview(d as PreviewResponse);
      } catch {
        if (alive) setPreview(null);   // fail closed — the item stays disabled
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [callFn]);

  const handleSend = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError("");
    try {
      const d = await callFn("send");
      setSuccess(`Resume checkout email sent to ${d.sentTo}.`);
      // Immediately, so the admin sees the row they just created rather than
      // wondering whether it worked.
      try { window.dispatchEvent(new CustomEvent(COMMS_REFRESH_EVENT)); } catch { /* no-op */ }
    } catch (e) {
      // A failed send is reported as failed. It is already recorded as failed
      // server-side; the UI must not soften that into a success.
      setError((e as Error).message || "The email could not be sent.");
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  }, [callFn]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    setError("");
    setSuccess("");
    onCloseMenu();
  }, [onCloseMenu]);

  const eligible = preview?.eligible === true;
  const display = preview?.display;
  const disabled = loading || !eligible;

  const title = loading
    ? "Checking eligibility…"
    : eligible
      ? "Email the customer their existing checkout link"
      : (preview?.reasonText ?? "This order cannot receive a resume checkout email.");

  const amountText = display?.amount != null ? `$${Number(display.amount).toFixed(2)}` : "—";

  return (
    <>
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        title={title}
        onClick={() => { if (!disabled) setOpen(true); }}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-b border-gray-100"
      >
        <i className={loading ? "ri-loader-4-line animate-spin" : "ri-mail-check-line"}></i>
        <span className="flex-1 text-left">Send Resume Checkout Email</span>
      </button>

      {open && (
        <DialogHost onRequestClose={closeDialog} labelledBy="resume-checkout-email-title" blockClose={sending}>
          <div className="border-b border-gray-100 px-5 py-4">
            <h2 id="resume-checkout-email-title" className="text-sm font-bold text-gray-900">
              Send Resume Checkout Email
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              Review the details below before emailing the customer.
            </p>
          </div>

          <div className="px-5 py-4">
            {success ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
                  <i className="ri-checkbox-circle-fill text-emerald-500"></i>{success}
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-gray-200 px-3 py-1">
                  <Row label="Customer" value={display?.customerName} />
                  <Row label="Email" value={display?.maskedEmail} />
                  <Row label="Confirmation" value={display?.confirmationId} />
                  <Row label="Service" value={display?.serviceType} />
                  <Row label="Package" value={display?.packageName} />
                  <Row label="Order amount" value={amountText} />
                </div>

                <ul className="mt-3 space-y-1.5">
                  <li className="flex items-start gap-2 text-[11px] font-semibold text-gray-700">
                    <i className="ri-price-tag-3-line mt-px text-gray-400"></i>
                    No discount will be applied.
                  </li>
                  <li className="flex items-start gap-2 text-[11px] font-semibold text-gray-700">
                    <i className="ri-links-line mt-px text-gray-400"></i>
                    The customer will continue the existing order.
                  </li>
                </ul>

                {preview?.lastSentAt && (
                  <p className="mt-3 flex items-start gap-1.5 text-[11px] text-gray-500">
                    <i className="ri-time-line mt-px"></i>
                    Last sent {new Date(preview.lastSentAt).toLocaleString()}.
                  </p>
                )}

                {error && (
                  <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
                    <i className="ri-error-warning-line mt-px"></i>{error}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
            <button
              type="button"
              onClick={closeDialog}
              disabled={sending}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {success ? "Close" : "Cancel"}
            </button>
            {!success && (
              <button
                type="button"
                onClick={handleSend}
                disabled={sending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <i className={sending ? "ri-loader-4-line animate-spin" : "ri-mail-send-line"}></i>
                {sending ? "Sending…" : "Send Resume Email"}
              </button>
            )}
          </div>
        </DialogHost>
      )}
    </>
  );
}
