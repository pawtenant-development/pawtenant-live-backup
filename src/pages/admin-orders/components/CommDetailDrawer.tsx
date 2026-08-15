/**
 * CommDetailDrawer — full-message detail for one SMS/Calls table row.
 *
 * UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001 §6
 *
 * WHY THIS EXISTS
 * ---------------
 * The SMS/Calls table renders a body with `className="truncate"` and a `title`
 * tooltip. That is the entire reason the 176-character message from
 * +16202539921 "could not be viewed": the row clipped it to one line, and the
 * native tooltip is itself length-limited and unselectable. The database row was
 * complete the whole time. This drawer is the surface that shows it.
 *
 * ONE THREAD, NOT TWO
 * -------------------
 * The conversation below the metadata is the SAME `UnifiedThreadPane` the
 * Command Center renders, reading the SAME `admin_conversation_thread` RPC and
 * replying through the SAME `ghl-send-sms` endpoint. §6 requires that the two
 * screens not develop separate histories; mounting the identical component is
 * the only version of that guarantee which cannot drift.
 */
import { useEffect, useRef, useState } from "react";
import { getAdminUserToken } from "../../../lib/supabaseClient";
import UnifiedThreadPane, { type ThreadTarget } from "./commandCenter/UnifiedThreadPane";
import {
  formatPhoneDisplay,
  ghlSyncLabel,
  isInbound,
  normalizeE164,
  sanitizeMessageText,
} from "../../../lib/conversationIdentity";

export interface CommDetailRow {
  id: string;
  type: string;
  direction: string | null;
  body: string | null;
  phone_from: string | null;
  phone_to: string | null;
  contact_e164?: string | null;
  status: string | null;
  sent_by: string | null;
  twilio_sid: string | null;
  provider_event_id?: string | null;
  ghl_sync_state?: string | null;
  ghl_sync_error_code?: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  order_id: string | null;
  confirmation_id: string | null;
  created_at: string;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[11px] font-semibold text-gray-400 pt-0.5">{label}</dt>
      <dd className="text-[12.5px] text-gray-700 font-semibold break-words min-w-0">{children}</dd>
    </>
  );
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export default function CommDetailDrawer({
  row,
  customerName,
  onClose,
}: {
  row: CommDetailRow;
  customerName: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [retryMsg, setRetryMsg] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /**
   * Re-check this ONE event against GHL and refresh its sync verdict.
   *
   * "Retry sync" is a RECONCILIATION, not a resend. It issues GET requests to
   * GHL and updates only `ghl_sync_*` columns. §8 is explicit that
   * reconciliation must never resend an SMS or initiate a call, so the endpoint
   * it calls has no send path at all — clicking this can never text a customer.
   */
  const retrySync = async () => {
    if (retrying) return;
    setRetrying(true); setRetryMsg(null);
    try {
      const token = await getAdminUserToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ghl-reconcile-communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ commId: row.id, mode: "apply", sinceDays: 90 }),
      });
      const data = await res.json() as {
        ok: boolean; error?: string;
        report?: { matched: number; missingInGhl: number; noProviderId: number; providerUnreadable: number };
      };
      if (!data.ok) { setRetryMsg(data.error ?? "Sync check failed."); }
      else if (data.report?.matched) { setRetryMsg("Confirmed present in GHL."); }
      else if (data.report?.noProviderId) { setRetryMsg("No per-event provider id — cannot be matched to GHL."); }
      else if (data.report?.providerUnreadable) { setRetryMsg("GHL could not be read. Nothing changed; try again later."); }
      else if (data.report?.missingInGhl) { setRetryMsg("Absent from GHL. Recorded for backfill review."); }
      else { setRetryMsg("No verdict returned."); }
    } catch {
      setRetryMsg("Network error — nothing changed.");
    } finally {
      setRetrying(false);
    }
  };

  // The "other party" number — inbound is the sender, outbound the recipient.
  // Derived the same way `communications.contact_e164` is generated, so the
  // drawer and the thread agree on which conversation this row belongs to.
  const inbound = isInbound(row.type, row.direction);
  // `storedRaw` is the value AS STORED — the whole point of the explainer below
  // is to show an operator that a row reading "(832) 726-0357" is the same
  // conversation as "+18327260357".
  //
  // This previously read `row.contact_e164 ?? (inbound ? ...)`, which made the
  // explainer dead code the moment the generated column shipped: `contact_e164`
  // is ALREADY normalised, so `stored` and `normalised` were always equal and
  // the line never rendered. Caught in production QA on a real (832) call row.
  const storedRaw = inbound ? row.phone_from : row.phone_to;
  const contactE164 = normalizeE164(row.contact_e164 ?? storedRaw);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    // Lock background scroll while a modal surface is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const copyPhone = async () => {
    if (!contactE164) return;
    try {
      await navigator.clipboard.writeText(contactE164);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard denied — the number is visible and selectable anyway */ }
  };

  const sync = ghlSyncLabel(row.ghl_sync_state);
  // COMPLETE body. No truncate, no slice — this is the whole point of the drawer.
  const fullBody = sanitizeMessageText(row.body);
  const isCall = row.type === "call_inbound" || row.type === "call_outbound";

  const target: ThreadTarget | null = contactE164
    ? {
        contactE164,
        orderId: row.order_id,
        confirmationId: row.confirmation_id,
        displayName: customerName,
        identityState: row.order_id ? "linked" : "unknown",
        candidateCount: row.order_id ? 1 : 0,
      }
    : null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Communication detail"
        className="relative bg-white w-full max-w-[560px] h-full shadow-2xl flex flex-col animate-[slideIn_.15s_ease-out]"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-gray-200 flex items-start gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {isCall ? "Call detail" : "Message detail"}
            </p>
            <p className="text-sm font-bold text-gray-800 truncate">
              {customerName || formatPhoneDisplay(contactE164 || storedRaw)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close detail"
            className="shrink-0 text-gray-400 hover:text-gray-700">
            <i className="ri-close-line text-xl" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
          {/* ── Full message ──────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
              {isCall ? "Call summary" : "Full message"}
            </p>
            <div className="bg-[#f8fafc] border border-gray-200 rounded-lg px-3.5 py-3">
              {/* whitespace-pre-wrap keeps the customer's own line breaks;
                  break-words stops a long URL forcing horizontal scroll. */}
              <p className="text-[13.5px] leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
                {fullBody || <span className="italic text-gray-400">(no content stored)</span>}
              </p>
            </div>
            {!isCall && fullBody && (
              <p className="text-[10.5px] text-gray-400 mt-1.5">
                {fullBody.length} characters — complete stored message.
              </p>
            )}
          </div>

          {/* ── Metadata ──────────────────────────────────────────────────── */}
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Details</p>
            <dl className="grid grid-cols-[112px_1fr] gap-y-1.5 gap-x-3">
              <Row label="Number">
                <span className="tabular-nums">{formatPhoneDisplay(contactE164 || storedRaw)}</span>
                {contactE164 && (
                  <button type="button" onClick={copyPhone}
                    className="ml-2 text-[11px] font-bold text-[#3b6ea5] hover:underline">
                    <i className="ri-file-copy-line mr-0.5" />{copied ? "Copied" : "Copy"}
                  </button>
                )}
                {contactE164 && storedRaw && contactE164 !== storedRaw && (
                  // Surfaces the (832) 726-0357 → +18327260357 correction so an
                  // operator can see WHY an older row looked unmatched.
                  <span className="block text-[10.5px] text-gray-400 font-normal">
                    stored as “{storedRaw}” · normalised to {contactE164}
                  </span>
                )}
              </Row>
              <Row label="Direction">{inbound ? "Inbound" : "Outbound"}</Row>
              <Row label="Timestamp">
                {new Date(row.created_at).toLocaleString("en-US", {
                  weekday: "short", month: "short", day: "numeric", year: "numeric",
                  hour: "numeric", minute: "2-digit",
                })}
              </Row>
              <Row label="Status">{row.status ?? "—"}</Row>
              {row.duration_seconds != null && row.duration_seconds > 0 && (
                <Row label="Duration">
                  {Math.floor(row.duration_seconds / 60)}m {row.duration_seconds % 60}s
                </Row>
              )}
              <Row label="Source">{row.sent_by ?? "—"}</Row>
              <Row label="Provider ID">
                {row.provider_event_id ? (
                  <span className="font-mono text-[11px] break-all">{row.provider_event_id}</span>
                ) : (
                  // Being explicit here is deliberate: a missing per-event id is
                  // exactly why historical rows cannot be reconciled with GHL.
                  <span className="font-normal text-gray-400">
                    None — this event has no per-event provider id, so it cannot be
                    matched to GHL by id.
                  </span>
                )}
              </Row>
              <Row label="Customer">
                {customerName ?? <span className="font-normal text-gray-400">Not linked to a customer</span>}
              </Row>
              <Row label="Order">
                {row.confirmation_id ?? <span className="font-normal text-gray-400">No order linked</span>}
              </Row>
              <Row label="GHL sync">
                <span className={`inline-flex items-center gap-1 text-[10.5px] font-bold px-2 py-0.5 rounded-full ${sync.cls}`}
                  title={sync.title}>
                  <i className={sync.icon} />{sync.label}
                </span>
                {row.ghl_sync_error_code && (
                  <span className="block text-[10.5px] text-orange-700 font-normal mt-0.5">
                    {row.ghl_sync_error_code}
                  </span>
                )}
                <span className="block mt-1">
                  <button
                    type="button"
                    onClick={retrySync}
                    disabled={retrying}
                    title="Re-check this event against GHL. This is a read-only comparison — it never resends the message or places a call."
                    className="text-[11px] font-bold text-[#3b6ea5] hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <i className={retrying ? "ri-loader-4-line animate-spin mr-1" : "ri-refresh-line mr-1"} />
                    {retrying ? "Checking…" : "Retry GHL sync"}
                  </button>
                  {retryMsg && (
                    <span className="block text-[10.5px] text-gray-600 font-normal mt-0.5">{retryMsg}</span>
                  )}
                  <span className="block text-[10px] text-gray-400 font-normal mt-0.5">
                    Read-only comparison. Never resends a message or places a call.
                  </span>
                </span>
              </Row>
              {row.recording_url && (
                <Row label="Recording">
                  <a href={row.recording_url} target="_blank" rel="noopener noreferrer"
                    className="text-[#3b6ea5] hover:underline">
                    <i className="ri-play-circle-line mr-1" />Open recording
                  </a>
                </Row>
              )}
            </dl>
          </div>

          {/* ── The SHARED conversation ───────────────────────────────────── */}
          {target ? (
            <div className="flex flex-col" style={{ minHeight: 420 }}>
              <p className="px-5 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Conversation · same thread as Command Center
              </p>
              <div className="flex-1 min-h-0 border-t border-gray-100">
                <UnifiedThreadPane target={target} />
              </div>
            </div>
          ) : (
            <p className="px-5 py-6 text-[12px] text-gray-400">
              This row has no normalisable phone number, so it has no conversation thread.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
