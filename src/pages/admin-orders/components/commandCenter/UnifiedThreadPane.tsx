/**
 * UnifiedThreadPane — the Command Center's middle column.
 *
 * UNIFIED-ADMIN-COMMAND-CENTER-UNKNOWN-SMS-CALLS-SEARCH-INLINE-SMS-GHL-SYNC-001
 *
 * REPLACES the "Call / Open SMS / Calls" stub that rendered a single sentence
 * and a button that navigated the admin away from the workspace they had just
 * selected a conversation in.
 *
 * WHAT IT SHOWS
 *   One chronological thread for a person: inbound + outbound SMS as bubbles,
 *   calls as timeline cards (direction, status, duration, recording when the
 *   provider legitimately supplied one), emails as collapsible cards.
 *
 * WHAT IT DOES NOT DO
 *   No email composer. Email sending stays in the Emails tab, per §3 — this
 *   pane displays email HISTORY only.
 *
 * FULL BODIES
 *   SMS bubbles render the COMPLETE stored body. The 176-character message from
 *   +16202539921 was never truncated in the database; it was unreadable because
 *   the SMS/Calls table clips it with a CSS `truncate` class and the queue never
 *   surfaced it at all. This is the surface that makes it readable.
 *
 * SANITISATION
 *   Bodies are rendered as TEXT NODES. React escapes text children, so a body
 *   containing `<script>` is displayed as those literal characters. Invisible
 *   control and bidi-override characters are stripped by `sanitizeMessageText`
 *   because those are not visible content — a right-to-left override can make a
 *   rendered URL read as a different domain than it points at.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAdminUserToken } from "../../../../lib/supabaseClient";
import {
  analyzeSms,
  channelOf,
  formatPhoneDisplay,
  ghlSyncLabel,
  isInbound,
  maskPhone,
  normalizeE164,
  sanitizeMessageText,
  SMS_SOFT_LIMIT,
  type IdentityState,
} from "../../../../lib/conversationIdentity";
import { useConversationThread, type ThreadEvent } from "./useConversation";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface ThreadTarget {
  contactE164: string | null;
  orderId: string | null;
  confirmationId: string | null;
  displayName: string | null;
  identityState: IdentityState;
  candidateCount: number;
}

function fmtStamp(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}
function fmtDateLabel(ts: string): string {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}
function fmtDuration(secs: number | null): string | null {
  if (secs == null || secs <= 0) return null;
  const m = Math.floor(secs / 60), s = secs % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── SMS / chat bubble ────────────────────────────────────────────────────────
function MessageBubble({ ev }: { ev: ThreadEvent }) {
  const inbound = isInbound(ev.type, ev.direction);
  // COMPLETE body. No slice, no truncate class, no line-clamp: this component
  // exists precisely because those were the defect.
  const text = sanitizeMessageText(ev.body);
  const failed = ev.status === "failed" || ev.status === "terminal_failed" || !!ev.failureCode;
  const sync = ghlSyncLabel(ev.ghlSyncState);

  // COMMAND-CENTER-MESSAGE-LEGIBILITY-001 — bubbles were near-black (#1E293B)
  // with white text, which read as heavy and hostile across a long thread.
  // Direction now carries a LIGHT tint with dark text: customer = blue,
  // PawTenant = green, email = amber, call = violet. Direction is still
  // reinforced by side (left/right), corner notch and the labels below, so the
  // colour is not the only cue. All AA-contrast dark-on-light pairings.
  const channel = channelOf(ev.type);
  const isEmail = channel === "email";
  const isCall = channel === "call";
  const tone = failed
    ? { box: "bg-orange-50 border-orange-200", body: "text-orange-900", meta: "text-orange-700" }
    : isCall
    ? { box: "bg-violet-50 border-violet-200", body: "text-violet-950", meta: "text-violet-700" }
    : isEmail
    ? { box: "bg-amber-50 border-amber-200", body: "text-amber-950", meta: "text-amber-700" }
    : inbound
    ? { box: "bg-sky-50 border-sky-200", body: "text-slate-900", meta: "text-sky-800" }
    : { box: "bg-emerald-50 border-emerald-200", body: "text-slate-900", meta: "text-emerald-800" };

  return (
    <div className={`flex ${inbound ? "justify-start" : "justify-end"} w-full`}>
      <div className={`max-w-[85%] sm:max-w-[75%] min-w-0 rounded-2xl border px-3.5 py-2.5 ${tone.box} ${
        inbound ? "rounded-tl-sm" : "rounded-tr-sm"
      }`}>
        {/* whitespace-pre-wrap preserves the customer's line breaks; break-words
            stops a 400-character URL from forcing the pane to scroll sideways. */}
        <p
          className={`text-[13.5px] leading-relaxed whitespace-pre-wrap break-words ${tone.body}`}
          style={{ overflowWrap: "anywhere" }}
        >
          {text || <span className="italic opacity-60">(no message body)</span>}
        </p>
        <div className={`flex items-center gap-1.5 flex-wrap mt-1.5 text-[10px] ${tone.meta}`}>
          <span>{fmtStamp(ev.createdAt)}</span>
          {!inbound && ev.sentBy && <span>· {ev.sentBy}</span>}
          {ev.status && <span>· {ev.status}</span>}
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-bold ${sync.cls}`}
            title={sync.title}
          >
            <i className={sync.icon} />{sync.label}
          </span>
        </div>
        {failed && ev.failureReason && (
          <p className="text-[11px] text-orange-800 mt-1 border-t border-orange-200 pt-1">
            <i className="ri-error-warning-line mr-1" />{ev.failureReason}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Call event card ──────────────────────────────────────────────────────────
function CallCard({ ev }: { ev: ThreadEvent }) {
  const inbound = isInbound(ev.type, ev.direction);
  const dur = fmtDuration(ev.durationSeconds);
  const missed = ["missed", "no_answer", "no-answer", "busy", "no answer"]
    .includes((ev.status ?? "").toLowerCase());
  return (
    <div className="self-center w-full max-w-[85%]">
      <div className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
        missed ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200"
      }`}>
        <i className={`${
          missed ? "ri-phone-missed-line text-orange-600"
                 : inbound ? "ri-phone-line text-violet-600" : "ri-phone-line text-sky-600"
        } text-base`} />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-bold text-slate-700">
            {inbound ? "Inbound call" : "Outbound call"}
            {ev.status && <span className="font-semibold text-slate-500"> · {ev.status}</span>}
            {dur && <span className="font-semibold text-slate-500"> · {dur}</span>}
          </p>
          <p className="text-[10.5px] text-slate-400">{fmtStamp(ev.createdAt)}</p>
        </div>
        {/* Recording is offered as an explicit control, never inlined as text.
            §10 forbids recording URLs in logs and audit metadata; surfacing one
            behind a deliberate click keeps it out of previews and copy-paste. */}
        {ev.recordingUrl && (
          <a
            href={ev.recordingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[11px] font-bold text-sky-700 hover:underline inline-flex items-center gap-1"
          >
            <i className="ri-play-circle-line" />Recording
          </a>
        )}
      </div>
    </div>
  );
}

// ── Email card (collapsible, display only) ───────────────────────────────────
function EmailCard({ ev }: { ev: ThreadEvent }) {
  const [open, setOpen] = useState(false);
  const body = sanitizeMessageText(ev.body);
  return (
    <div className="self-center w-full max-w-[85%]">
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full text-left px-3 py-2 flex items-start gap-2.5 hover:bg-slate-50"
        >
          <i className="ri-mail-line text-slate-400 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold text-slate-700 truncate">
              {ev.subject || "(no subject)"}
            </p>
            <p className="text-[10.5px] text-slate-400 truncate">
              {ev.emailFrom || ev.sentBy || "—"} → {ev.emailTo || "—"} · {fmtStamp(ev.createdAt)}
            </p>
          </div>
          <i className={`${open ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-slate-400 shrink-0`} />
        </button>
        {open && (
          <div className="px-3 pb-3 pt-1 border-t border-slate-100">
            <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap break-words">
              {body || <span className="italic text-slate-400">(no body stored)</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline SMS composer ──────────────────────────────────────────────────────
/**
 * Sends through `ghl-send-sms` — the EXACT function Order Details already uses.
 *
 * Nothing about the provider protocol is reimplemented here. That endpoint owns
 * the sending number, the actor resolution from the caller's JWT, the claim on
 * `communications.dedupe_key`, the audit row and the GHL contact handling. The
 * only thing this composer contributes is `operationToken` (one per operator
 * intent, so double-click/retry/refresh collapse to a single send) and
 * `checkDnd: true`.
 *
 * `checkDnd: true` matters because this composer can be aimed at an UNKNOWN
 * number that never went through checkout and therefore has no
 * `orders.sms_opted_out` row at all — a STOP sent to the GHL number is the only
 * opt-out signal that exists for that person. Under `true`, `sendGhlSms` fails
 * CLOSED: a confirmed DND is permanent, and an UNREADABLE DND refuses the send
 * rather than assuming consent.
 */
function InlineComposer({
  target,
  onSent,
}: {
  target: ThreadTarget;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const boxRef = useRef<HTMLTextAreaElement | null>(null);

  // Synchronous re-entry guard. `sending` is React state and does not update
  // until the next render, so two clicks inside one frame both pass a
  // state-based check. The ref closes that window; the server-side
  // operationToken claim closes the cross-request one.
  const inFlightRef = useRef(false);

  const phone = normalizeE164(target.contactE164);
  const info = useMemo(() => analyzeSms(text), [text]);

  // Auto-grow, and also SHRINK when the operator deletes lines.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [text]);

  const blockedReason = !phone
    ? "This conversation has no sendable phone number."
    : null;

  const send = useCallback(async () => {
    if (!phone || !text.trim() || inFlightRef.current) return;
    inFlightRef.current = true;
    setSending(true); setMsg(null);

    // One token per operator intent. Every retry of THIS send reuses it, so the
    // server collapses duplicates on the unique dedupe_key index. A deliberate
    // resend later mints a new token and goes through normally.
    const operationToken = crypto.randomUUID();
    try {
      const token = await getAdminUserToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ghl-send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          // Both may be null: replying to an unknown number is a first-class
          // case and must NOT invent a customer or an order to satisfy a shape.
          orderId: target.orderId,
          confirmationId: target.confirmationId,
          toPhone: phone,
          message: text.trim(),
          operationToken,
          checkDnd: true,
        }),
      });
      const result = await res.json() as {
        ok: boolean; error?: string; duplicate?: boolean; blocked_by?: string;
      };
      if (result.ok && result.duplicate) {
        setText("");
        setMsg({ kind: "ok", text: "Already sent — duplicate suppressed." });
      } else if (result.ok) {
        setText("");
        setMsg({ kind: "ok", text: `Sent to ${maskPhone(phone)}` });
        onSent();
      } else {
        setMsg({ kind: "err", text: result.error ?? "Failed to send." });
      }
    } catch {
      setMsg({ kind: "err", text: "Network error — the message was not sent." });
    } finally {
      inFlightRef.current = false;
      setSending(false);
      window.setTimeout(() => setMsg(null), 6000);
    }
  }, [phone, text, target.orderId, target.confirmationId, onSent]);

  if (blockedReason) {
    return (
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-[11.5px] text-slate-500 flex items-center gap-1.5">
          <i className="ri-information-line" />{blockedReason}
        </p>
      </div>
    );
  }

  const over = info.chars > SMS_SOFT_LIMIT;

  return (
    <div className="border-t border-slate-200 bg-white px-3 py-2.5 shrink-0">
      {target.identityState === "ambiguous" && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-2">
          <i className="ri-alert-line mr-1" />
          This number is on file for {target.candidateCount} different customers. The reply
          goes to the <strong>number</strong>; no customer is assumed.
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={boxRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void send(); }
          }}
          rows={1}
          placeholder={`Reply by SMS to ${formatPhoneDisplay(phone)}…`}
          aria-label="SMS reply"
          className="flex-1 min-w-0 resize-none text-[13px] px-3 py-2 rounded-lg border border-slate-200 focus:border-[#1E293B] focus:outline-none max-h-[140px]"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !text.trim() || over}
          title={over ? `Over ${SMS_SOFT_LIMIT} characters` : "Send SMS (Ctrl/Cmd + Enter)"}
          className="shrink-0 h-9 px-4 rounded-lg bg-[#1E293B] text-white text-xs font-bold hover:bg-[#0F172A] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
        >
          {sending ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-send-plane-fill" />}
          {sending ? "Sending" : "Send"}
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
        <p className={`text-[10.5px] tabular-nums ${over ? "text-orange-600 font-bold" : "text-slate-400"}`}>
          {info.chars} chars · {info.segments} segment{info.segments === 1 ? "" : "s"}
          {info.unicode && <span title="Non-GSM characters reduce a segment from 160 to 70 characters"> · Unicode</span>}
          {over && <span> · over {SMS_SOFT_LIMIT}</span>}
        </p>
        {msg && (
          <p className={`text-[11px] font-semibold ${msg.kind === "ok" ? "text-emerald-700" : "text-orange-700"}`}>
            {msg.text}
          </p>
        )}
      </div>
      <p className="text-[10px] text-slate-400 mt-1">
        <i className="ri-shield-check-line mr-1" />
        STOP / opt-out is verified with the provider before every send from here. An
        unreadable opt-out state blocks the send rather than assuming consent.
      </p>
    </div>
  );
}

// ── The pane ─────────────────────────────────────────────────────────────────
export default function UnifiedThreadPane({
  target,
  onBack,
}: {
  target: ThreadTarget;
  onBack?: () => void;
}) {
  const {
    events, loading, loadingMore, hasMore, error,
    loadOlder, refresh, newSinceSeen, markSeen,
  } = useConversationThread(target.contactE164, target.orderId);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const atBottomRef = useRef(true);

  // The RPC returns newest-first for keyset pagination; the thread reads
  // oldest-first.
  const ordered = useMemo(() => [...events].reverse(), [events]);

  const grouped = useMemo(() => {
    const out: { label: string; items: ThreadEvent[] }[] = [];
    for (const ev of ordered) {
      const label = fmtDateLabel(ev.createdAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(ev);
      else out.push({ label, items: [ev] });
    }
    return out;
  }, [ordered]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    atBottomRef.current = nearBottom;
    if (nearBottom && newSinceSeen > 0) markSeen();
    // Reaching the top pulls the previous page.
    if (el.scrollTop < 40 && hasMore && !loadingMore) {
      const prevH = el.scrollHeight;
      loadOlder();
      // Preserve the reading position: without this the browser keeps scrollTop
      // while content grows above it, which yanks the operator up the thread.
      window.setTimeout(() => {
        const e2 = scrollRef.current;
        if (e2) e2.scrollTop += e2.scrollHeight - prevH;
      }, 60);
    }
  }, [hasMore, loadingMore, loadOlder, newSinceSeen, markSeen]);

  // Autoscroll ONLY when the operator was already at the bottom. Scrolling a
  // reader away from the message they are part-way through is worse than making
  // them press the indicator.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (atBottomRef.current) {
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    }
  }, [ordered.length]);

  const jumpToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    markSeen();
  }, [markSeen]);

  const title = target.displayName
    || (target.contactE164 ? formatPhoneDisplay(target.contactE164) : "Conversation");

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 shrink-0">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to queue"
            className="lg:hidden text-slate-500 hover:text-slate-800 shrink-0">
            <i className="ri-arrow-left-line text-lg" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          {/* COMMAND-CENTER-THREAD-IDENTITY-001 — the single place the customer
              is named in this pane. Slightly larger + heavier than the metadata
              line beneath it, which keeps phone and order clearly secondary. */}
          <p className="text-[15px] font-extrabold text-[#0F172A] truncate leading-tight">{title}</p>
          <p className="text-[11px] text-slate-500 truncate">
            {target.contactE164 ? formatPhoneDisplay(target.contactE164) : "No phone on this thread"}
            {target.confirmationId && <span> · {target.confirmationId}</span>}
          </p>
        </div>
        {target.identityState === "unknown" && (
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"
            title="No customer or order matches this number. The thread is keyed by the number itself.">
            <i className="ri-user-unfollow-line mr-1" />Unknown
          </span>
        )}
        {target.identityState === "ambiguous" && (
          <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
            title={`${target.candidateCount} customers have this number on file. No customer is attached.`}>
            <i className="ri-question-line mr-1" />Ambiguous · {target.candidateCount}
          </span>
        )}
        <button type="button" onClick={refresh} aria-label="Refresh conversation"
          className="shrink-0 text-slate-400 hover:text-slate-700">
          <i className="ri-refresh-line" />
        </button>
      </div>

      {/* Thread */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto overflow-x-hidden bg-[#F8FAFC] px-3 py-3 flex flex-col gap-2.5 min-h-0"
      >
        {loading && ordered.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">Loading conversation…</p>
        ) : error ? (
          <div className="text-center py-10 px-4">
            <i className="ri-error-warning-line text-2xl text-orange-400" />
            <p className="text-sm font-bold text-orange-700 mt-2">{error}</p>
            <button type="button" onClick={refresh}
              className="mt-3 text-xs px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-slate-50">
              Retry
            </button>
          </div>
        ) : ordered.length === 0 ? (
          <div className="text-center py-12 px-4">
            <i className="ri-chat-3-line text-2xl text-slate-300" />
            <p className="text-sm font-bold text-slate-500 mt-2">No messages yet</p>
            <p className="text-xs text-slate-400 mt-1">
              SMS, calls and emails for this contact will appear here.
            </p>
          </div>
        ) : (
          <>
            {hasMore && (
              <button type="button" onClick={loadOlder} disabled={loadingMore}
                className="self-center text-[11px] font-bold px-3 py-1 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-600">
                {loadingMore ? "Loading…" : "Load older messages"}
              </button>
            )}
            {grouped.map((g) => (
              <div key={g.label} className="flex flex-col gap-2.5">
                <p className="self-center text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-white border border-slate-200 rounded-full px-2.5 py-0.5">
                  {g.label}
                </p>
                {g.items.map((ev) => {
                  const ch = channelOf(ev.type);
                  if (ch === "call") return <CallCard key={ev.id} ev={ev} />;
                  if (ch === "email") return <EmailCard key={ev.id} ev={ev} />;
                  return <MessageBubble key={ev.id} ev={ev} />;
                })}
              </div>
            ))}
          </>
        )}
      </div>

      {/* New-messages indicator */}
      {newSinceSeen > 0 && (
        <button type="button" onClick={jumpToLatest}
          className="self-center -mt-8 mb-1 z-10 text-[11px] font-bold px-3 py-1.5 rounded-full bg-[#1E293B] text-white shadow-lg hover:bg-[#0F172A]">
          <i className="ri-arrow-down-line mr-1" />
          {newSinceSeen} new message{newSinceSeen === 1 ? "" : "s"}
        </button>
      )}

      <InlineComposer target={target} onSent={refresh} />
    </div>
  );
}
