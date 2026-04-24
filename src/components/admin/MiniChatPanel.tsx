/**
 * MiniChatPanel — compact fixed-corner chat panel used by MiniChatDock.
 *
 * Thin presentation layer over useAdminChatThread. Shows live thread,
 * reply box, close, expand-to-chats-tab. No polling / no RPC code lives
 * here — all of that is in the hook.
 *
 * UX rules:
 *   - Stick-to-bottom: auto-scroll only if admin is already near the
 *     bottom. If they scrolled up to read history, new visitor messages
 *     do not yank them back down. Admin's own sends always snap to bottom.
 *   - Flash: a freshly arrived visitor message briefly highlights with
 *     a ring pulse so it is visually obvious.
 *   - Jump-to-latest pill: if new visitor messages arrive while the
 *     admin is scrolled up, a small "↓ N new" button appears; clicking
 *     it snaps to bottom and clears the counter.
 *   - Reply focus: pressing Enter already keeps focus on the textarea.
 *     Clicking the Send button moves focus onto the button, so we
 *     explicitly refocus the textarea after submit — admin can keep
 *     typing without re-clicking.
 *   - Header: shows visitor label + a small "+N" chip when OTHER
 *     sessions have unread messages, so the single-slot dock does not
 *     hide broader activity. No clutter.
 *   - Order summary: when chat_sessions.matched_order_id is present,
 *     fetches a minimal summary (status/state/letter_type/created_at)
 *     and renders it under the attribution line. Lets the admin see
 *     "who this is" at a glance without leaving the dock.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabaseClient";
import { getAdminIdentity } from "../../lib/adminIdentity";
import { useAdminChat, type ChatSession } from "../../context/AdminChatContext";
import {
  useAdminChatThread,
  type ChatMessage,
  type ChatAttachmentRow,
} from "../../hooks/useAdminChatThread";
import ChatAttachmentView from "../feature/ChatAttachmentView";
import EditChatIdentityModal from "./EditChatIdentityModal";
import {
  CHAT_ATTACHMENT_ACCEPT,
  CHAT_ATTACHMENT_MAX_BYTES,
  isValidChatAttachment,
} from "../../lib/chatAttachments";

const CHAT_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

const STICK_THRESHOLD_PX = 80;
const FLASH_DURATION_MS = 1800;

interface Props {
  sessionId: string;
  onClose: () => void;
}

interface MatchedOrderSummary {
  id: string;
  status: string | null;
  state: string | null;
  letter_type: string | null;
  created_at: string | null;
}

function formatOrderStatus(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  // Display-friendly capitalization for the common statuses.
  const lower = s.toLowerCase();
  if (lower === "paid") return "Paid";
  if (lower === "pending") return "Pending";
  if (lower === "refunded") return "Refunded";
  if (lower === "failed") return "Failed";
  if (lower === "cancelled" || lower === "canceled") return "Cancelled";
  if (lower === "disputed") return "Disputed";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function MiniChatPanel({ sessionId, onClose }: Props) {
  const navigate = useNavigate();
  const { setSelectedSessionId, sessions, mutateSession, refreshSessions } =
    useAdminChat();
  const {
    session,
    displayedMessages,
    attachmentsByMessage,
    loading,
    error,
    replyInput,
    setReplyInput,
    sendReply,
    sendAttachment,
    sending,
    uploading,
    replyError,
    maxReplyLength,
  } = useAdminChatThread(sessionId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const prevLenRef = useRef<number>(0);
  const prevSessionIdRef = useRef<string | null>(null);
  const prevLastIdRef = useRef<string | null>(null);

  const [flashId, setFlashId] = useState<string | null>(null);
  const [newBelowCount, setNewBelowCount] = useState(0);
  const [matchedOrder, setMatchedOrder] =
    useState<MatchedOrderSummary | null>(null);
  const [identityOpen, setIdentityOpen] = useState(false);

  // Unified effect: stick-to-bottom, flash new visitor msg, new-below pill.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const len = displayedMessages.length;
    const last = displayedMessages[len - 1] ?? null;
    const lastId = last?.id ?? null;
    const sessionChanged = prevSessionIdRef.current !== sessionId;

    if (sessionChanged) {
      el.scrollTop = el.scrollHeight;
      prevSessionIdRef.current = sessionId;
      prevLenRef.current = len;
      prevLastIdRef.current = lastId;
      setFlashId(null);
      setNewBelowCount(0);
      return;
    }

    const lenGrew = len > prevLenRef.current;
    if (!lenGrew) {
      prevLenRef.current = len;
      prevLastIdRef.current = lastId;
      return;
    }

    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < STICK_THRESHOLD_PX;
    const lastSender = (last?.sender ?? "visitor").toLowerCase();
    const isAgent = lastSender === "agent" || lastSender === "admin";
    const isVisitor = lastSender === "visitor";

    if (nearBottom || isAgent) {
      el.scrollTop = el.scrollHeight;
      setNewBelowCount(0);
    }

    if (
      isVisitor &&
      prevLenRef.current > 0 &&
      lastId &&
      lastId !== prevLastIdRef.current
    ) {
      setFlashId(lastId);
      if (!nearBottom) {
        const added = len - prevLenRef.current;
        setNewBelowCount((c) => c + added);
      }
    }

    prevLenRef.current = len;
    prevLastIdRef.current = lastId;
  }, [displayedMessages, sessionId]);

  // Clear the flash after the animation finishes.
  useEffect(() => {
    if (!flashId) return;
    const t = window.setTimeout(() => setFlashId(null), FLASH_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [flashId]);

  // Focus reply box on open / session switch.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const rafId = window.requestAnimationFrame(() => {
      try {
        el.focus();
      } catch {
        // ignore
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [sessionId]);

  // Load a minimal summary of the linked order when matched_order_id appears.
  // Cancels cleanly if the session switches or the id changes mid-fetch.
  const matchedOrderId = session?.matched_order_id ?? null;
  useEffect(() => {
    if (!matchedOrderId) {
      setMatchedOrder(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error: qErr } = await supabase
          .from("orders")
          .select("id, status, state, letter_type, created_at")
          .eq("id", matchedOrderId)
          .maybeSingle();
        if (cancelled) return;
        if (qErr || !data) {
          setMatchedOrder(null);
          return;
        }
        setMatchedOrder(data as MatchedOrderSummary);
      } catch {
        if (!cancelled) setMatchedOrder(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [matchedOrderId]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < STICK_THRESHOLD_PX && newBelowCount > 0) {
      setNewBelowCount(0);
    }
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setNewBelowCount(0);
  }

  function expandToChatsTab() {
    setSelectedSessionId(sessionId);
    try {
      navigate("/admin-orders?tab=chats");
    } catch {
      // ignore
    }
    onClose();
  }

  const canSend = replyInput.trim().length > 0 && !sending && !uploading;

  function triggerFilePicker() {
    if (uploading || sending) return;
    setAttachmentError(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const err = isValidChatAttachment(file);
    if (err) {
      setAttachmentError(err);
      return;
    }
    setAttachmentError(null);
    await sendAttachment(file);
    textareaRef.current?.focus();
  }

  // Visitor-provided identity wins over legacy/auto-captured fields.
  const vName  = session?.visitor_name?.trim()  || session?.name?.trim()  || "";
  const vEmail = session?.visitor_email?.trim() || session?.email?.trim() || "";
  const headerLabel = !session
    ? "Loading…"
    : vName && vEmail
      ? `${vName} (${vEmail})`
      : vName || vEmail || "Anonymous visitor";

  // Display-only attribution line. Reads from chat_sessions.external_metadata.attribution.
  // Fails gracefully if the blob is missing or malformed.
  const attrLine = useMemo(() => {
    const meta = session?.external_metadata;
    if (!meta || typeof meta !== "object") return null;
    const a = (meta as Record<string, unknown>).attribution;
    if (!a || typeof a !== "object" || Array.isArray(a)) return null;
    const attr = a as Record<string, unknown>;
    const channelRaw = typeof attr.channel === "string" ? attr.channel.trim() : "";
    const campaignRaw = typeof attr.utm_campaign === "string" ? attr.utm_campaign.trim() : "";
    if (!channelRaw && !campaignRaw) return null;
    const CHANNEL_LABELS: Record<string, string> = {
      google_ads:     "Google Ads",
      facebook_ads:   "Facebook Ads",
      organic_search: "Organic Search",
      social_organic: "Social Organic",
      direct:         "Direct",
      facebook:       "Facebook",
      instagram:      "Instagram",
      tiktok:         "TikTok",
      google:         "Google",
    };
    const channelLabel = channelRaw
      ? (CHANNEL_LABELS[channelRaw.toLowerCase()] ?? channelRaw)
      : "";
    return { channelLabel, campaign: campaignRaw };
  }, [session?.external_metadata]);

  // Order summary chips — rendered under the attribution line when a linked
  // order exists. Each chip is only shown when its underlying value is set.
  const orderChips = useMemo(() => {
    if (!matchedOrder) return null;
    const status = formatOrderStatus(matchedOrder.status);
    const state  = matchedOrder.state?.trim() || "";
    const type   = matchedOrder.letter_type?.trim() || "";
    return { status, state, type };
  }, [matchedOrder]);

  const otherUnreadCount = useMemo(() => {
    if (!sessions || sessions.length === 0) return 0;
    let n = 0;
    for (const s of sessions) {
      if (s.id === sessionId) continue;
      if ((s.unread_count ?? 0) > 0) n += 1;
    }
    return n;
  }, [sessions, sessionId]);

  return (
    <>
      <style>{`
        @keyframes pt-admin-mini-flash {
          0%   { box-shadow: 0 0 0 3px rgba(59, 110, 165, 0.55); }
          60%  { box-shadow: 0 0 0 3px rgba(59, 110, 165, 0.25); }
          100% { box-shadow: 0 0 0 3px rgba(59, 110, 165, 0); }
        }
        .pt-admin-mini-flash { animation: pt-admin-mini-flash 1.8s ease-out; }
      `}</style>
      <div
        className="fixed z-50 bg-white rounded-2xl shadow-2xl flex flex-col"
        style={{
          right: 16,
          bottom: 16,
          width: "min(360px, calc(100vw - 32px))",
          height: "min(520px, calc(100vh - 32px))",
          border: "1px solid #e5e7eb",
          overflow: "hidden",
          fontFamily: CHAT_FONT,
        }}
        role="dialog"
        aria-label="Mini chat"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[#3b6ea5]">
          <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
            <i className="ri-chat-3-line text-white text-sm"></i>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/80 leading-none">
                Live chat
              </p>
              {otherUnreadCount > 0 && (
                <span
                  title={`${otherUnreadCount} other session${otherUnreadCount === 1 ? "" : "s"} with new messages`}
                  className="inline-flex items-center bg-white/25 text-white text-[9px] font-bold leading-none rounded-full px-1.5 py-0.5"
                >
                  +{otherUnreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p
                className="text-sm font-bold text-white truncate leading-tight"
                title={headerLabel}
              >
                {headerLabel}
              </p>
              <button
                type="button"
                onClick={() => setIdentityOpen(true)}
                title="Edit visitor name / email"
                aria-label="Edit visitor identity"
                className="text-white/70 hover:text-white text-xs leading-none cursor-pointer p-0.5 flex-shrink-0"
              >
                <i className="ri-pencil-line"></i>
              </button>
            </div>
            {attrLine && (attrLine.channelLabel || attrLine.campaign) && (
              <p
                className="text-[10px] text-white/70 truncate leading-tight mt-0.5"
                title={[attrLine.channelLabel, attrLine.campaign].filter(Boolean).join(" • ")}
              >
                {attrLine.channelLabel}
                {attrLine.channelLabel && attrLine.campaign ? " • " : ""}
                {attrLine.campaign}
              </p>
            )}
            {orderChips && (
              <div
                className="flex flex-wrap items-center gap-1 mt-1"
                title="Linked order"
              >
                <span className="inline-flex items-center bg-white/20 text-white text-[9px] font-bold leading-none rounded px-1.5 py-0.5 uppercase tracking-wide">
                  Order: {orderChips.status}
                </span>
                {orderChips.state && (
                  <span className="inline-flex items-center bg-white/15 text-white/90 text-[9px] font-semibold leading-none rounded px-1.5 py-0.5 uppercase tracking-wide">
                    {orderChips.state}
                  </span>
                )}
                {orderChips.type && (
                  <span className="inline-flex items-center bg-white/15 text-white/90 text-[9px] font-semibold leading-none rounded px-1.5 py-0.5 uppercase tracking-wide">
                    {orderChips.type}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={expandToChatsTab}
            title="Open full Chats tab"
            className="text-white/80 hover:text-white text-base leading-none cursor-pointer px-1"
          >
            <i className="ri-external-link-line"></i>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="text-white/80 hover:text-white text-lg leading-none cursor-pointer px-1"
          >
            <i className="ri-close-line"></i>
          </button>
        </div>

        {session && <MiniAssignmentBar session={session} />}

        {/* Messages */}
        <div className="relative flex-1 overflow-hidden">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="absolute inset-0 overflow-y-auto px-3 py-3 bg-[#f8f7f4]"
          >
            {error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-start gap-2">
                <i className="ri-error-warning-line text-red-600 text-sm mt-0.5"></i>
                <p className="text-xs text-red-700 font-semibold">{error}</p>
              </div>
            ) : loading && displayedMessages.length === 0 ? (
              <div className="py-10 flex items-center justify-center">
                <i className="ri-loader-4-line animate-spin text-lg text-[#3b6ea5]"></i>
              </div>
            ) : displayedMessages.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-400 font-medium">
                No messages in this session.
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {displayedMessages.map((m) => (
                  <MiniBubble
                    key={m.id}
                    message={m}
                    flash={m.id === flashId}
                    attachments={attachmentsByMessage[m.id] ?? []}
                  />
                ))}
              </div>
            )}
          </div>
          {newBelowCount > 0 && (
            <button
              type="button"
              onClick={jumpToLatest}
              title="Jump to latest"
              className="absolute left-1/2 -translate-x-1/2 bottom-2 inline-flex items-center gap-1 bg-[#3b6ea5] text-white text-[11px] font-bold px-3 py-1.5 rounded-full shadow-lg hover:bg-[#2e5a87] cursor-pointer transition-colors"
            >
              <i className="ri-arrow-down-line text-[11px]"></i>
              {newBelowCount} new message{newBelowCount === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {/* Reply */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSend) {
              void sendReply();
              // Click-Send would leave focus on the button — put it back.
              textareaRef.current?.focus();
            }
          }}
          className="border-t border-gray-100 bg-white"
        >
          {uploading && (
            <div className="px-3 py-2 flex items-center gap-2 text-[11px] font-semibold bg-[#eef3f9] text-[#3b6ea5] border-b border-[#d9e4f0]">
              <i className="ri-loader-4-line animate-spin" />
              Uploading attachment…
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={replyInput}
            onChange={(e) => setReplyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) void sendReply();
              }
            }}
            placeholder="Reply as admin…"
            rows={2}
            maxLength={maxReplyLength}
            className="w-full px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none resize-none bg-white"
          />
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 bg-[#f8f7f4]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={triggerFilePicker}
                disabled={uploading || sending}
                title={`Attach file (max ${Math.floor(CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB)`}
                aria-label="Attach file"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-gray-200 text-gray-700 hover:text-[#3b6ea5] hover:border-[#3b6ea5] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <i className="ri-attachment-2 text-sm" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={CHAT_ATTACHMENT_ACCEPT}
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
              <span className="text-[10px] text-gray-400 font-medium">
                Enter to send · Shift+Enter for new line
              </span>
            </div>
            <button
              type="submit"
              disabled={!canSend}
              className="inline-flex items-center gap-1 bg-[#3b6ea5] text-white text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-[#2e5a87] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <i
                className={`${sending ? "ri-loader-4-line animate-spin" : "ri-send-plane-2-line"} text-xs`}
              ></i>
              {sending ? "Sending" : "Send"}
            </button>
          </div>
        </form>
        {attachmentError && (
          <div className="px-3 py-2 bg-red-50 border-t border-red-100 flex items-start gap-2">
            <i className="ri-error-warning-line text-red-600 text-xs mt-0.5"></i>
            <p className="text-[11px] text-red-700 font-semibold">
              {attachmentError}
            </p>
          </div>
        )}
        {replyError && (
          <div className="px-3 py-2 bg-red-50 border-t border-red-100 flex items-start gap-2">
            <i className="ri-error-warning-line text-red-600 text-xs mt-0.5"></i>
            <p className="text-[11px] text-red-700 font-semibold">
              {replyError}
            </p>
          </div>
        )}
      </div>
      <EditChatIdentityModal
        open={identityOpen}
        sessionId={sessionId}
        initialName={session?.visitor_name ?? session?.name ?? null}
        initialEmail={session?.visitor_email ?? session?.email ?? null}
        onClose={() => setIdentityOpen(false)}
        onSaved={(next) => {
          mutateSession(sessionId, {
            visitor_name: next.name,
            visitor_email: next.email,
            name: next.name,
            email: next.email,
          });
          refreshSessions();
        }}
      />
    </>
  );
}

function MiniAssignmentBar({ session }: { session: ChatSession }) {
  const [busy, setBusy] = useState<null | "claim" | "resolve" | "reopen">(null);
  const assignedLabel =
    session.assigned_admin_name?.trim() ||
    session.assigned_admin_email?.trim() ||
    null;
  const isResolved = session.status === "resolved";

  async function claim() {
    if (busy) return;
    setBusy("claim");
    try {
      const admin = await getAdminIdentity();
      if (!admin.id) return;
      await supabase.rpc("assign_chat_session", {
        p_session_id:  session.id,
        p_admin_id:    admin.id,
        p_admin_email: admin.email ?? "",
        p_admin_name:  admin.name  ?? "",
        p_force:       true,
      });
    } catch {
      // silent
    } finally {
      setBusy(null);
    }
  }

  async function resolve() {
    if (busy) return;
    setBusy("resolve");
    try {
      const admin = await getAdminIdentity();
      await supabase.rpc("resolve_chat_session", {
        p_session_id: session.id,
        p_admin_id:   admin.id,
      });
    } catch {
      // silent
    } finally {
      setBusy(null);
    }
  }

  async function reopen() {
    if (busy) return;
    setBusy("reopen");
    try {
      await supabase.rpc("reopen_chat_session", {
        p_session_id: session.id,
      });
    } catch {
      // silent
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="px-3 py-1.5 bg-white border-b border-gray-100 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
            isResolved
              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
              : "bg-[#e8f0f9] text-[#3b6ea5]"
          }`}
          title={`Status: ${isResolved ? "Resolved" : "Open"}`}
        >
          <i
            className={
              isResolved ? "ri-check-double-line" : "ri-radio-button-line"
            }
          ></i>
          {isResolved ? "Resolved" : "Open"}
        </span>
        <span
          className="text-[10px] text-gray-500 truncate font-semibold"
          title={
            assignedLabel
              ? `Assigned to ${assignedLabel}`
              : "No admin assigned"
          }
        >
          {assignedLabel ? `→ ${assignedLabel}` : "Unassigned"}
        </span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          type="button"
          onClick={claim}
          disabled={!!busy}
          title="Assign to me"
          className="text-[9px] font-bold px-1.5 py-1 rounded border border-gray-200 text-gray-700 hover:text-[#3b6ea5] hover:border-[#3b6ea5] disabled:opacity-50 cursor-pointer"
        >
          <i
            className={`${busy === "claim" ? "ri-loader-4-line animate-spin" : "ri-user-add-line"} text-[10px]`}
          ></i>
        </button>
        {!isResolved ? (
          <button
            type="button"
            onClick={resolve}
            disabled={!!busy}
            title="Mark resolved"
            className="text-[9px] font-bold px-1.5 py-1 rounded border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 cursor-pointer"
          >
            <i
              className={`${busy === "resolve" ? "ri-loader-4-line animate-spin" : "ri-check-double-line"} text-[10px]`}
            ></i>
          </button>
        ) : (
          <button
            type="button"
            onClick={reopen}
            disabled={!!busy}
            title="Reopen"
            className="text-[9px] font-bold px-1.5 py-1 rounded border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-50 cursor-pointer"
          >
            <i
              className={`${busy === "reopen" ? "ri-loader-4-line animate-spin" : "ri-refresh-line"} text-[10px]`}
            ></i>
          </button>
        )}
      </div>
    </div>
  );
}

function MiniBubble({
  message,
  flash,
  attachments,
}: {
  message: ChatMessage;
  flash: boolean;
  attachments: ChatAttachmentRow[];
}) {
  const sender = (message.sender ?? "visitor").toLowerCase();
  const isPending =
    typeof message.id === "string" && message.id.startsWith("temp-");
  const isSystem = sender === "system";
  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span className="text-[10px] text-gray-400 bg-white border border-gray-100 rounded-full px-2.5 py-1 font-medium">
          {message.message}
        </span>
      </div>
    );
  }
  const isVisitor = sender === "visitor";
  return (
    <div
      className={`flex flex-col ${isVisitor ? "items-start" : "items-end"} gap-1`}
    >
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
          isVisitor
            ? "bg-white text-gray-800 border border-gray-100"
            : "bg-[#3b6ea5] text-white"
        } ${isPending ? "opacity-60" : ""} ${flash ? "pt-admin-mini-flash" : ""}`}
        style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
      >
        {message.message}
      </div>
      {attachments.length > 0 && (
        <ChatAttachmentView
          attachments={attachments}
          align={isVisitor ? "left" : "right"}
          variant={isVisitor ? "light" : "dark"}
        />
      )}
    </div>
  );
}
