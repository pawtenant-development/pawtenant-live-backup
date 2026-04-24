/**
 * PawChatWidget — public visitor chat bubble + panel.
 *
 * Replaces Tawk. Sends via the existing capture-chat edge function, reads
 * agent replies via the get_visitor_chat_thread RPC. Fully two-way through
 * Supabase — no third-party service involved.
 *
 * Hidden on admin + portal routes (mirrors the old Tawk hide list so the
 * widget never shows up inside authenticated areas).
 *
 * Identity capture:
 *   - Inline prompt (name + email) appears once per session — never a modal.
 *   - Shown after the first visitor message OR when the chat is reopened
 *     with an existing thread and identity still missing.
 *   - Fully skippable. Chat flow, polling, and sendReply stay unchanged
 *     whether or not identity is captured.
 *   - Once submitted, identity is persisted via the update_chat_visitor_identity
 *     RPC (SECURITY DEFINER — scoped to the caller's provider_session_id).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { usePawChatThread } from "../../hooks/usePawChatThread";
import { supabase } from "../../lib/supabaseClient";
import { markChatOpened, markFirstMessage } from "../../lib/visitorSession";

const HIDDEN_ROUTE_PREFIXES = [
  "/admin",
  "/admin-login",
  "/admin-orders",
  "/admin-doctors",
  "/admin-guide",
  "/provider-portal",
  "/provider-login",
  "/my-orders",
  "/customer-login",
  "/reset-password",
  "/account/checkout",
];

const CHAT_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// PawTenant brand palette
const BRAND_PRIMARY     = "#FF6A2B";
const BRAND_PRIMARY_DK  = "#e85a1e";
const BRAND_SOFT        = "#FFE6DB";
const PANEL_BG          = "#F4F7FA";
const TEXT_DARK         = "#1F2937";
const BORDER_LIGHT      = "#E5E7EB";

const PROVIDER = "pawtenant";
const IDENTITY_STATUS_KEY = "__pt_chat_identity_status"; // 'saved' | 'skipped'
const IDENTITY_NAME_KEY   = "__pt_chat_identity_name";
const IDENTITY_EMAIL_KEY  = "__pt_chat_identity_email";

type IdentityStatus = "pending" | "saved" | "skipped";

function readIdentityStatus(): IdentityStatus {
  try {
    const v = sessionStorage.getItem(IDENTITY_STATUS_KEY);
    if (v === "saved" || v === "skipped") return v;
  } catch {
    // ignore
  }
  return "pending";
}

function writeIdentityStatus(v: IdentityStatus) {
  try {
    sessionStorage.setItem(IDENTITY_STATUS_KEY, v);
  } catch {
    // ignore
  }
}

function writeIdentityCache(name: string, email: string) {
  try {
    if (name) sessionStorage.setItem(IDENTITY_NAME_KEY, name);
    if (email) sessionStorage.setItem(IDENTITY_EMAIL_KEY, email);
  } catch {
    // ignore
  }
}

function isValidEmail(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  // minimal sanity check — server applies its own normalization
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default function PawChatWidget() {
  const { pathname } = useLocation();
  const isHidden = HIDDEN_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));

  const [open, setOpen] = useState(false);
  const { sessionId, messages, sending, error, hasUnread, sendReply, markSeen, maxLen } =
    usePawChatThread(open);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // Identity capture state
  const [identityStatus, setIdentityStatus] = useState<IdentityStatus>(() =>
    readIdentityStatus(),
  );
  const [nameInput, setNameInput]   = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [identityError, setIdentityError] = useState<string | null>(null);

  // Visitor has sent at least one message during this mount.
  const hasVisitorMessage = useMemo(
    () => messages.some((m) => (m.sender ?? "visitor").toLowerCase() === "visitor"),
    [messages],
  );

  const showIdentityPrompt =
    open && identityStatus === "pending" && hasVisitorMessage;

  // Auto-scroll to bottom on new messages / on open / when prompt appears.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, showIdentityPrompt]);

  // When opened: clear unread + focus input.
  useEffect(() => {
    if (!open) return;
    markSeen();
    const t = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(t);
  }, [open, markSeen]);

  if (isHidden) return null;

  const canSend = input.trim().length > 0 && !sending;

  async function handleSend() {
    if (!canSend) return;
    const text = input;
    setInput("");
    markFirstMessage();
    await sendReply(text);
    inputRef.current?.focus();
  }

  async function handleSubmitIdentity(e: React.FormEvent) {
    e.preventDefault();
    const name = nameInput.trim();
    const email = emailInput.trim();
    if (!name && !email) {
      setIdentityError("Enter a name or email, or press skip.");
      return;
    }
    if (email && !isValidEmail(email)) {
      setIdentityError("Please enter a valid email.");
      return;
    }
    setSavingIdentity(true);
    setIdentityError(null);
    try {
      const { error: rpcErr } = await supabase.rpc(
        "update_chat_visitor_identity",
        {
          p_provider: PROVIDER,
          p_provider_session_id: sessionId,
          p_visitor_name: name || null,
          p_visitor_email: email || null,
        },
      );
      if (rpcErr) throw rpcErr;
      writeIdentityCache(name, email);
      writeIdentityStatus("saved");
      setIdentityStatus("saved");
    } catch (err) {
      setIdentityError(
        (err as Error)?.message ?? "Could not save — please try again.",
      );
    } finally {
      setSavingIdentity(false);
    }
  }

  function handleSkipIdentity() {
    writeIdentityStatus("skipped");
    setIdentityStatus("skipped");
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          aria-label="Open live chat"
          onClick={() => { setOpen(true); markChatOpened(); }}
          className="fixed right-4 bottom-[90px] md:bottom-5 z-50 w-14 h-14 rounded-full text-white shadow-lg flex items-center justify-center cursor-pointer transition-colors"
          style={{ backgroundColor: BRAND_PRIMARY }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.backgroundColor = BRAND_PRIMARY_DK)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.backgroundColor = BRAND_PRIMARY)
          }
        >
          <i className="ri-chat-3-line text-2xl" />
          {hasUnread && (
            <span
              aria-hidden="true"
              className="absolute top-1 right-1 w-3 h-3 rounded-full bg-red-500 border-2 border-white"
            />
          )}
        </button>
      )}

      {open && (
        <div
          role="dialog"
          aria-label="Live chat"
          className="fixed right-4 bottom-[90px] md:bottom-5 z-50 rounded-2xl shadow-2xl flex flex-col"
          style={{
            width: "min(360px, calc(100vw - 32px))",
            height: "min(520px, calc(100vh - 120px))",
            border: `1px solid ${BORDER_LIGHT}`,
            overflow: "hidden",
            fontFamily: CHAT_FONT,
            backgroundColor: "#ffffff",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-2.5 px-4 py-3"
            style={{ backgroundColor: BRAND_PRIMARY }}
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <i className="ri-chat-3-line text-white text-base" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white leading-tight">
                PawTenant Support
              </p>
              <p className="text-[11px] text-white/85 leading-tight mt-0.5 font-medium">
                Licensed Support Team
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title="Close"
              aria-label="Close chat"
              className="text-white/85 hover:text-white text-lg leading-none cursor-pointer px-1"
            >
              <i className="ri-close-line" />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto px-3 py-3"
            style={{ backgroundColor: PANEL_BG }}
          >
            {messages.length === 0 ? (
              <div className="py-8 text-center text-xs">
                <div
                  className="inline-flex w-10 h-10 rounded-full items-center justify-center mb-2"
                  style={{ backgroundColor: BRAND_SOFT }}
                >
                  <i
                    className="ri-chat-smile-2-line text-lg"
                    style={{ color: BRAND_PRIMARY }}
                  />
                </div>
                <p className="font-semibold" style={{ color: TEXT_DARK }}>
                  Hi! How can we help?
                </p>
                <p className="mt-1 text-gray-500">
                  Send us a message — we usually reply within a few minutes.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {messages.map((m) => (
                  <Bubble
                    key={m.id}
                    sender={m.sender}
                    message={m.message}
                    pending={typeof m.id === "string" && m.id.startsWith("temp-")}
                  />
                ))}
              </div>
            )}

            {showIdentityPrompt && (
              <div
                className="mt-3 rounded-2xl bg-white shadow-sm"
                style={{ border: `1px solid ${BORDER_LIGHT}` }}
              >
                <form onSubmit={handleSubmitIdentity} className="px-3.5 py-3">
                  <div className="flex items-start gap-2 mb-2.5">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: BRAND_SOFT }}
                    >
                      <i
                        className="ri-user-heart-line text-sm"
                        style={{ color: BRAND_PRIMARY }}
                      />
                    </div>
                    <p
                      className="text-[12px] leading-relaxed font-medium"
                      style={{ color: TEXT_DARK }}
                    >
                      Can I get your name and email so a licensed provider can
                      follow up if needed?
                    </p>
                  </div>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="Name"
                    autoComplete="name"
                    maxLength={200}
                    className="w-full px-3 py-2 text-xs placeholder:text-gray-400 focus:outline-none rounded-lg mb-2 transition-colors"
                    style={{
                      color: TEXT_DARK,
                      backgroundColor: PANEL_BG,
                      border: `1px solid ${BORDER_LIGHT}`,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = BRAND_PRIMARY;
                      e.currentTarget.style.backgroundColor = "#ffffff";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = BORDER_LIGHT;
                      e.currentTarget.style.backgroundColor = PANEL_BG;
                    }}
                  />
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    maxLength={320}
                    className="w-full px-3 py-2 text-xs placeholder:text-gray-400 focus:outline-none rounded-lg mb-2.5 transition-colors"
                    style={{
                      color: TEXT_DARK,
                      backgroundColor: PANEL_BG,
                      border: `1px solid ${BORDER_LIGHT}`,
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = BRAND_PRIMARY;
                      e.currentTarget.style.backgroundColor = "#ffffff";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = BORDER_LIGHT;
                      e.currentTarget.style.backgroundColor = PANEL_BG;
                    }}
                  />
                  {identityError && (
                    <p className="text-[11px] text-red-600 font-semibold mb-2">
                      {identityError}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={handleSkipIdentity}
                      disabled={savingIdentity}
                      className="text-[11px] text-gray-500 hover:text-gray-700 font-medium cursor-pointer disabled:opacity-50"
                    >
                      Skip
                    </button>
                    <button
                      type="submit"
                      disabled={savingIdentity}
                      className="inline-flex items-center gap-1 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                      style={{ backgroundColor: BRAND_PRIMARY }}
                      onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled)
                          e.currentTarget.style.backgroundColor = BRAND_PRIMARY_DK;
                      }}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = BRAND_PRIMARY)
                      }
                    >
                      <i
                        className={`${savingIdentity ? "ri-loader-4-line animate-spin" : "ri-check-line"} text-xs`}
                      />
                      {savingIdentity ? "Saving" : "Continue"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Reply */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="bg-white"
            style={{ borderTop: `1px solid ${BORDER_LIGHT}` }}
          >
            <div className="px-3 pt-3 pb-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
                placeholder="Type your message…"
                rows={2}
                maxLength={maxLen}
                className="w-full px-3 py-2 text-sm placeholder:text-gray-400 focus:outline-none resize-none rounded-xl transition-colors"
                style={{
                  color: TEXT_DARK,
                  backgroundColor: PANEL_BG,
                  border: `1px solid ${BORDER_LIGHT}`,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = BRAND_PRIMARY;
                  e.currentTarget.style.backgroundColor = "#ffffff";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = BORDER_LIGHT;
                  e.currentTarget.style.backgroundColor = PANEL_BG;
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-2 px-3 pb-3">
              <span className="text-[10px] text-gray-400 font-medium">
                Enter to send · Shift+Enter for new line
              </span>
              <button
                type="submit"
                disabled={!canSend}
                className="inline-flex items-center gap-1 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                style={{ backgroundColor: BRAND_PRIMARY }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled)
                    e.currentTarget.style.backgroundColor = BRAND_PRIMARY_DK;
                }}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = BRAND_PRIMARY)
                }
              >
                <i
                  className={`${sending ? "ri-loader-4-line animate-spin" : "ri-send-plane-2-line"} text-xs`}
                />
                {sending ? "Sending" : "Send"}
              </button>
            </div>
          </form>
          {error && (
            <div className="px-3 py-2 bg-red-50 border-t border-red-100 flex items-start gap-2">
              <i className="ri-error-warning-line text-red-600 text-xs mt-0.5" />
              <p className="text-[11px] text-red-700 font-semibold">{error}</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Bubble({
  sender,
  message,
  pending,
}: {
  sender: string | null;
  message: string;
  pending: boolean;
}) {
  const role = (sender ?? "visitor").toLowerCase();
  if (role === "system") {
    return (
      <div className="flex justify-center">
        <span
          className="text-[10px] bg-white rounded-full px-2.5 py-1 font-medium"
          style={{ color: "#6B7280", border: `1px solid ${BORDER_LIGHT}` }}
        >
          {message}
        </span>
      </div>
    );
  }
  const isSelf = role === "visitor";
  const bubbleStyle: React.CSSProperties = isSelf
    ? { backgroundColor: BRAND_PRIMARY, color: "#ffffff" }
    : {
        backgroundColor: "#ffffff",
        color: TEXT_DARK,
        border: `1px solid ${BORDER_LIGHT}`,
      };
  return (
    <div className={`flex ${isSelf ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words shadow-sm ${
          pending ? "opacity-60" : ""
        }`}
        style={{
          ...bubbleStyle,
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        {message}
      </div>
    </div>
  );
}
