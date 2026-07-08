/**
 * aiSupportPresentation — shared display helpers for AI Support decisions.
 *
 * Used by:
 *   - ChatsTab (admin-only per-message AI markers)
 *   - AiSupportCenterPanel (conversation list chips + drawer audit)
 *   - useChatAiDecisions (decision shape)
 *
 * Pure module: no fetches, no side effects. Everything here renders ADMIN
 * copy only — none of these strings ever reach the visitor-facing widget
 * (the widget reads the public `chats` thread via get_visitor_chat_thread
 * and never touches ai_support_* tables).
 */

/** One AI decision tied to a single inbound visitor chat message. */
export interface AiChatDecision {
  eventId: string;
  /** auto_sent | drafted | escalated | blocked | error */
  action: string;
  /** Support category (landlord_verification, pricing, fraud, …). */
  intent: string | null;
  confidence: number | null;
  guardrailCode: string | null;
  /** Raw chat auto-reply gate code (metadata.chat_auto_gate). */
  gateReason: string | null;
  gatePass: boolean;
  /** Human sentence from the decision engine (metadata.decision_reason). */
  decisionReason: string | null;
  replyBody: string | null;
  /** chats.id of the auto-sent agent message, when the AI actually replied. */
  autoSentChatMessageId: string | null;
  createdAt: string;
  // ── Always-Answer mode (2026-07-07) ──
  /** normal | clarifying | escalation_holding | crisis | fraud_refusal | refund_review */
  responseMode: string | null;
  /** True when a customer-visible reply was actually posted to the chat. */
  replySent: boolean;
  /** blacklisted | global_disabled | kill_switch_on | conversation_ai_off (null when a reply was sent). */
  noReplyReason: string | null;
}

/** Tag for an agent-side chat bubble that the AI (not a human typing) produced. */
export interface AiAgentMessageTag {
  kind: "auto" | "approved";
  intent: string | null;
  confidence: number | null;
}

export function categoryLabel(c: string | null | undefined): string {
  if (!c) return "";
  return c.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

/**
 * Translate a chat auto-reply gate code into plain admin English.
 * Codes come from ai-handle-inbound-chat's gate ladder; unknown codes fall
 * back to a de-underscored version so new codes never render as blanks.
 */
export function humanizeGateReason(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const r = raw.trim();
  if (!r) return null;

  // cooldown_37s_lt_120s → "Cooldown — last AI reply 37s ago (needs 120s)"
  const cooldown = r.match(/^cooldown_(\d+)s_lt_(\d+)s$/);
  if (cooldown) return `Cooldown — last AI reply ${cooldown[1]}s ago (needs ${cooldown[2]}s)`;

  // category_psd_general_is_draft_only → "Psd General is draft-only"
  const draftOnly = r.match(/^category_(.+)_is_draft_only$/);
  if (draftOnly) return `${categoryLabel(draftOnly[1])} is draft-only`;

  // no_model_draft_openai_http_429 etc.
  if (r.startsWith("no_model_draft")) {
    const err = r.replace(/^no_model_draft_?/, "");
    return err ? `No AI draft available (${err.replace(/_/g, " ")})` : "No AI draft available";
  }

  const FIXED: Record<string, string> = {
    chat_auto_reply_disabled: "Chat auto-reply is globally OFF",
    session_not_whitelisted: "Session not on the TEST auto-reply list",
    kill_switch_on: "Global kill switch is ON",
    category_never_auto_sends: "This category never auto-sends",
    conversation_ai_off: "A human owns this conversation — AI stayed silent",
    confidence_below_threshold: "Confidence below threshold",
    daily_cap_reached: "Daily auto-reply cap reached",
    test_session_auto_reply: "Auto-reply gate passed (TEST session)",
    discount_existing_order_review: "Discount withheld — existing order, billing needs a human",
    discount_already_offered: "PAW20 already offered — repeat needs human review",
    // Always-Answer model
    blacklisted: "Session is blacklisted — no AI reply",
    global_disabled: "Chat AI is globally off — no AI reply",
    always_answer_sent: "AI answered the visitor",
    not_sent: "No reply sent",
  };
  return FIXED[r] ?? r.replace(/_/g, " ");
}

/** Guardrail codes (policy.ts) → short admin labels. */
export function humanizeGuardrailCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const FIXED: Record<string, string> = {
    eviction_legal: "Eviction / legal urgency",
    self_harm_crisis: "Medical crisis",
    fraud_misrepresentation: "Fraud / misrepresentation",
    medical_emergency: "Medical emergency",
    chargeback_threat: "Chargeback threat",
    opt_out: "Opt-out request",
  };
  return FIXED[raw] ?? raw.replace(/_/g, " ");
}

export interface AiStatusChip {
  label: string;
  cls: string;
  icon: string;
}

/**
 * Per-conversation AI status chip (task vocabulary: Auto Sent / Draft
 * Pending / Cooldown Held / Escalated / Blocked / Human Replied), derived
 * from the conversation status + its latest AI event.
 */
/**
 * True when the event was held by the anti-spam cooldown. Chat events carry
 * a `chat_auto_gate` code (cooldown_37s_lt_120s); SMS events record it only
 * in the decision engine's sentence ("Cooldown: last AI reply 29s ago …").
 */
function isCooldownHeld(lastEvent: { metadata: Record<string, unknown> | null } | null): boolean {
  const gate = String(lastEvent?.metadata?.chat_auto_gate ?? "");
  if (gate.startsWith("cooldown_")) return true;
  const reason = String(lastEvent?.metadata?.decision_reason ?? "");
  return reason.startsWith("Cooldown:");
}

export function deriveConversationAiStatus(
  convoStatus: string,
  lastEvent: { action: string; metadata: Record<string, unknown> | null } | null,
): AiStatusChip | null {
  const md = lastEvent?.metadata ?? {};
  const mode = String(md.chat_response_mode ?? "");
  const noReply = String(md.no_reply_reason ?? "");
  const replySent = md.reply_sent_to_chat === true;

  // ── Always-Answer no-reply states (chat) ──
  if (noReply === "blacklisted") {
    return { label: "Blacklisted — no AI reply", cls: "bg-gray-800 text-white", icon: "ri-forbid-line" };
  }
  if (noReply === "global_disabled") {
    return { label: "Global AI disabled", cls: "bg-gray-100 text-gray-500", icon: "ri-robot-2-line" };
  }
  // ── Risky-but-answered chat states (a safe template WAS sent) ──
  if (mode === "crisis" && replySent) {
    return { label: "Crisis Reply Sent", cls: "bg-red-600 text-white", icon: "ri-alarm-warning-line" };
  }
  if (lastEvent?.action === "blocked" && replySent) {
    return { label: "Blocked / Refused Safely", cls: "bg-gray-800 text-white", icon: "ri-shield-cross-line" };
  }
  if (convoStatus === "escalated" && replySent) {
    return { label: "Escalation Reply Sent", cls: "bg-orange-600 text-white", icon: "ri-alarm-warning-line" };
  }
  // ── Standard states (SMS, or chat with no reply sent) ──
  if (convoStatus === "escalated") {
    return { label: "Escalated", cls: "bg-red-100 text-red-700", icon: "ri-alarm-warning-line" };
  }
  if (lastEvent?.action === "blocked") {
    return { label: "Blocked", cls: "bg-gray-800 text-white", icon: "ri-shield-cross-line" };
  }
  if (convoStatus === "human_replied") {
    return { label: "Human Replied", cls: "bg-blue-100 text-blue-700", icon: "ri-user-voice-line" };
  }
  if (lastEvent?.action === "auto_sent") {
    if (mode === "clarifying") {
      return { label: "Clarifying Reply Sent", cls: "bg-sky-100 text-sky-700", icon: "ri-question-answer-line" };
    }
    return { label: "Auto Answered", cls: "bg-emerald-100 text-emerald-700", icon: "ri-robot-2-line" };
  }
  if (lastEvent?.action === "drafted" && isCooldownHeld(lastEvent)) {
    return { label: "Cooldown Held", cls: "bg-amber-100 text-amber-700", icon: "ri-time-line" };
  }
  if (lastEvent?.action === "drafted") {
    return { label: "Draft Pending", cls: "bg-cyan-100 text-cyan-700", icon: "ri-draft-line" };
  }
  if (lastEvent?.action === "error") {
    return { label: "Send Error", cls: "bg-red-100 text-red-700", icon: "ri-error-warning-line" };
  }
  return null;
}

/**
 * "Next required action" line for a conversation — what a human should do
 * now, derived from status + latest AI event.
 */
export function nextActionForConversation(
  convoStatus: string,
  lastEvent: { action: string; metadata: Record<string, unknown> | null } | null,
): string {
  if (convoStatus === "closed") return "None — conversation closed";
  const md = lastEvent?.metadata ?? {};
  const mode = String(md.chat_response_mode ?? "");
  const noReply = String(md.no_reply_reason ?? "");
  const replySent = md.reply_sent_to_chat === true;

  if (noReply === "blacklisted") return "Reply personally — session blacklisted (AI silenced)";
  if (noReply === "global_disabled") return "Reply personally — chat AI is globally off";
  if (mode === "crisis") return "Crisis flagged — a human must follow up now";
  if (convoStatus === "escalated") {
    return replySent
      ? "Safe reply sent — a human should still follow up"
      : "Reply personally — escalated to a human";
  }
  if (lastEvent?.action === "blocked") {
    return replySent
      ? "AI safely refused — monitor / follow up if needed"
      : "Review blocked message — reply personally if needed";
  }
  if (lastEvent?.action === "error") return "AI send failed — send the reply manually";
  if (lastEvent?.action === "drafted") {
    if (isCooldownHeld(lastEvent)) return "Review draft — held by cooldown, approve or reply";
    return "Review AI draft — approve, edit, or reply personally";
  }
  if (convoStatus === "human_replied") return "None — a human already replied";
  if (lastEvent?.action === "auto_sent") {
    return mode === "clarifying"
      ? "None — AI asked a clarifying question (monitor)"
      : "None — AI answered (monitor)";
  }
  return "—";
}
