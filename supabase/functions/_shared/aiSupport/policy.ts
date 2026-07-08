// policy.ts — PawTenant AI Support Automation policy engine (TEST-first).
//
// PURE logic. No Deno APIs, no network, no imports — runs identically in the
// Deno edge functions AND in the Node test harness (npx tsx). This is the
// single source of truth for:
//   * hard-block guardrails (legal/eviction, self-harm crisis, fraud, medical,
//     chargeback, opt-out, aggressive complaint)
//   * intent/category classification for safe topics
//   * the action decision (auto_send / draft / escalate / block) given the
//     DB-driven settings + per-conversation state
//   * escalation-safe reply templates for blocked categories
//
// It intentionally does NOT import ai-suggest-sms-reply/guardrails.ts — that
// module stays untouched so the existing draft-only assistant keeps working
// exactly as deployed. Rules here are a superset (adds medical_crisis, fraud,
// medical_clinical, sensitive_provider detection).

// ── Categories ────────────────────────────────────────────────────────────────
export type SupportCategory =
  | "order_status"
  | "letter_timing"
  | "landlord_verification"
  | "pricing"
  | "refund"
  | "provider_review"
  | "upload_documents"
  | "technical_issue"
  | "eligibility_general"
  | "psd_general"
  | "complaint"
  | "legal_eviction"
  | "medical_crisis"
  | "fraud"
  | "chargeback_dispute"
  | "opt_out"
  | "unknown";

export type RiskLevel = "low" | "medium" | "high" | "blocked";
export type AiAction = "auto_send" | "draft" | "escalate" | "block";
export type CategoryMode = "auto_send_safe" | "draft_only" | "escalate" | "block";

export interface Classification {
  category: SupportCategory;
  risk_level: RiskLevel;
  /** True → never send to OpenAI for a customer-facing reply. */
  hard_blocked: boolean;
  guardrail_code: string | null;
  matched: string | null;
}

// ── SMS opt-out (whole-message match only, mirrors existing behavior) ────────
const OPT_OUT_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);

export function isSmsOptOut(text: string | null | undefined): boolean {
  const raw = (text || "").trim().toLowerCase();
  if (!raw) return false;
  return OPT_OUT_WORDS.has(raw.replace(/[^a-z]/g, ""));
}

// ── Hard-block rules (order matters — most safety-critical first) ────────────
// These NEVER go to OpenAI for a customer-facing reply and can NEVER auto-send.
const HARD_BLOCK_RULES: Array<{
  category: SupportCategory;
  risk: RiskLevel;
  code: string;
  re: RegExp;
}> = [
  {
    // Self-harm / crisis — highest priority. Never normal support copy.
    category: "medical_crisis",
    risk: "blocked",
    code: "self_harm_crisis",
    re: /\b(suicid\w*|kill (myself|me)|end (my|it all)|hurt (myself|me)|harm (myself|me)|self[- ]?harm|overdos\w*|don'?t want to (live|be here)|no reason to live|crisis line)\b/i,
  },
  {
    // Eviction / legal threats — no legal advice, human review.
    category: "legal_eviction",
    risk: "blocked",
    code: "eviction_legal",
    re: /\b(evict\w*|eviction notice|lawsuit|sue|suing|sued|attorney|lawyer|court|subpoena|legal (action|notice)|discrimination (claim|complaint)|hud complaint|homeless|kicked out|move out by|deadline to (leave|move))\b/i,
  },
  {
    // Fraud / misrepresentation — refuse + human review.
    category: "fraud",
    risk: "blocked",
    code: "fraud_misrepresentation",
    re: /\b(fake (letter|document|esa|psd)|backdat\w*|forg(e|ed|ery|ing)|falsif\w*|pretend (i|to)|make it look like|say the (doctor|provider) said|guarantee (my )?approval|lie (on|about)|make up (symptoms|a condition))\b/i,
  },
  {
    // Medical / clinical asks — no diagnosis, no coaching to qualify.
    category: "medical_crisis",
    risk: "blocked",
    code: "medical_clinical",
    re: /\b(diagnos\w*|prescri\w*|do i qualify medically|what (should|do) i say to (get|be) approved|what symptoms|which condition|am i (mentally ill|disabled enough)|medical advice)\b/i,
  },
  {
    // Chargebacks / bank disputes — human only.
    category: "chargeback_dispute",
    risk: "blocked",
    code: "chargeback_dispute",
    re: /\b(charge ?back|bank dispute|dispute (the|this) charge|disputing|filed a dispute|report (this|you) to my bank)\b/i,
  },
];

// ── Escalate-level rules (not hard-blocked from drafting, but never auto) ────
const ESCALATE_RULES: Array<{
  category: SupportCategory;
  risk: RiskLevel;
  code: string;
  re: RegExp;
}> = [
  {
    category: "complaint",
    risk: "high",
    code: "angry_escalated",
    re: /\b(scam|fraudulent|ripoff|rip off|furious|outrageous|disgrace|terrible|worst|ridiculous|bbb|attorney general|report you|expose you|never (again|use))\b|!!!/i,
  },
  {
    category: "refund",
    risk: "high",
    code: "refund_request",
    re: /\b(refund|money back|reimburs\w*|reverse the charge|want my money|cancel my (order|subscription|membership))\b/i,
  },
];

// ── Safe-topic classification (keyword heuristics; OpenAI may refine) ─────────
const SAFE_TOPIC_RULES: Array<{ category: SupportCategory; re: RegExp }> = [
  { category: "landlord_verification", re: /\b(landlord|property manager|apartment|leasing office|housing provider|complex)\b.*\b(verif\w*|accept\w*|check|confirm|validat\w*)\b|\bverif\w*\b.*\b(letter|document)\b/i },
  { category: "letter_timing",         re: /\b(when|how long|how soon|still waiting|eta|timeline|status of my letter|where('?s| is) my letter|receive[d]? my letter|same[- ]day)\b/i },
  { category: "order_status",          re: /\b(order|purchase|payment went through|confirmation|receipt|my account|track)\b.*\b(status|update|went through|received|confirm\w*)\b|\bstatus of my order\b/i },
  { category: "upload_documents",      re: /\b(upload\w*|attach\w*|document|photo|id|paperwork|form)\b.*\b(how|where|trouble|can'?t|help|submit)\b|\bhow (do|to) (i )?upload\b/i },
  { category: "pricing",               re: /\b(price|pricing|cost|how much|fee|charge for|discount|coupon|promo)\b/i },
  { category: "psd_general",           re: /\b(psd|psychiatric service dog|service dog|task[- ]train\w*)\b/i },
  { category: "eligibility_general",   re: /\b(eligib\w*|do i qualify|can i get|requirements?|who qualifies)\b/i },
  { category: "provider_review",       re: /\b(provider|doctor|therapist|clinician|licensed)\b.*\b(review\w*|assigned|call|contact|spoke|appointment)\b/i },
  { category: "technical_issue",       re: /\b(log ?in|password|website|link (not|doesn'?t) work\w*|error|can'?t access|page (won'?t|not) load|broken)\b/i },
];

export function classifyMessage(text: string | null | undefined): Classification {
  const t = (text || "").trim();
  if (!t) {
    return { category: "unknown", risk_level: "low", hard_blocked: false, guardrail_code: null, matched: null };
  }
  if (isSmsOptOut(t)) {
    return { category: "opt_out", risk_level: "blocked", hard_blocked: true, guardrail_code: "opt_out", matched: "opt_out" };
  }
  for (const r of HARD_BLOCK_RULES) {
    const m = t.match(r.re);
    if (m) {
      return { category: r.category, risk_level: r.risk, hard_blocked: true, guardrail_code: r.code, matched: m[0] };
    }
  }
  for (const r of ESCALATE_RULES) {
    const m = t.match(r.re);
    if (m) {
      return { category: r.category, risk_level: r.risk, hard_blocked: false, guardrail_code: r.code, matched: m[0] };
    }
  }
  for (const r of SAFE_TOPIC_RULES) {
    const m = t.match(r.re);
    if (m) {
      return { category: r.category, risk_level: "low", hard_blocked: false, guardrail_code: null, matched: m[0] };
    }
  }
  return { category: "unknown", risk_level: "medium", hard_blocked: false, guardrail_code: null, matched: null };
}

// ── Paid/existing-order context (SMS-LIVE-INCIDENT-001, 2026-07-07) ──────────
// A customer talking about an order they ALREADY submitted/paid for must get a
// human-reviewed reply for product-scope questions (psd_general /
// eligibility_general) — never an auto-sent sales-style answer. A wrong
// "what's included" reply to a paying customer is a trust-breaking failure
// (a paid PSD customer was told PSD doesn't cover housing). Detection is
// deliberately broad; the callers only ever use it to DOWNGRADE auto_send →
// draft, so a false positive costs a human review, never a wrong send.
const PAID_ORDER_CONTEXT_RE =
  /\b(already paid|just paid|paid for (it|the|my)|after (i|we) paid|payment went through|i\b[^.!?\n]{0,24}\b(paid|submitted|purchased|bought|ordered)|after i submitted|my (order|purchase|questionnaire)|the questionnaire|order (id|number|#)|PT-[A-Z0-9]{4,}|charged me|my receipt|my confirmation)\b/i;

export function detectPaidOrderContext(text: string | null | undefined): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return PAID_ORDER_CONTEXT_RE.test(t);
}

/** Product-scope categories where paid-order context forces human review. */
export const PAID_CONTEXT_HUMAN_REVIEW: ReadonlySet<SupportCategory> = new Set([
  "psd_general",
  "eligibility_general",
]);

// ── Delayed AI SMS reply + human-handled suppression ──────────────────────────
// (SMS-HUMAN-DELAY-GHL-CAPTURE-001, 2026-07-08.) The AI never sends an SMS
// inline anymore: an eligible reply is QUEUED and only sent by
// ai-process-pending-sms after the grace window, and only if a full re-check
// still passes. A human always gets first right of reply.

/** Grace period before a queued AI SMS may send — a human gets first right of reply. */
export const AI_SMS_REPLY_DELAY_SECONDS = 180;

/** Any call activity with the customer within this window suppresses the AI SMS.
 *  Conservative: ALL call rows count (completed, voicemail, missed, outbound) —
 *  active phone contact means a human owns the conversation right now. */
export const RECENT_CALL_SUPPRESSION_WINDOW_SECONDS = 1800;

/** Booleans the processor computes from DB state at SEND time (not enqueue time). */
export interface PendingSmsRecheck {
  /** STOP / opt-out state on the conversation. */
  optOut: boolean;
  blacklisted: boolean;
  /** TEST tester guard (testGuard.ts) blocks this recipient. */
  testGuardBlocked: boolean;
  /** Any AI outbound already exists after the inbound (duplicate protection). */
  aiAlreadyReplied: boolean;
  /** Human handled it: human/admin/GHL outbound SMS after the inbound, OR
   *  conversation human_replied with later human activity, OR mode
   *  human_only/paused, OR owner assigned with recent human activity. */
  humanHandled: boolean;
  /** Any call row for this customer within RECENT_CALL_SUPPRESSION_WINDOW_SECONDS
   *  before the inbound or any time after it. */
  recentCall: boolean;
  conversationAiEnabled: boolean;
  conversationMode: string;
  killSwitch: boolean;
  smsEnabled: boolean;
  autoSendEnabled: boolean;
  autoReplyEnabled: boolean;
  categoryMode: CategoryMode | undefined;
  category: SupportCategory;
  capReached: boolean;
}

export interface PendingSmsDecision {
  send: boolean;
  /** Machine-readable skip reason (null when send=true). */
  skipReason:
    | "opt_out"
    | "blacklisted"
    | "test_guard_non_tester"
    | "already_replied"
    | "human_handled_recently"
    | "recent_call_within_30m"
    | "conversation_not_ai_eligible"
    | "auto_send_disabled"
    | "category_not_safe"
    | "daily_cap_reached"
    | null;
}

/**
 * PURE send-time re-check for a queued AI SMS reply. Most-restrictive wins;
 * the reason order is deliberate: legal opt-out first, then containment,
 * then duplicate protection, then the human-first rules, then settings.
 * DND is intentionally NOT here — it is an async GHL lookup the processor
 * runs LAST, fail-closed, only when this function says send.
 */
export function decidePendingSmsSend(i: PendingSmsRecheck): PendingSmsDecision {
  const no = (skipReason: PendingSmsDecision["skipReason"]): PendingSmsDecision =>
    ({ send: false, skipReason });
  if (i.optOut) return no("opt_out");
  if (i.blacklisted) return no("blacklisted");
  if (i.testGuardBlocked) return no("test_guard_non_tester");
  if (i.aiAlreadyReplied) return no("already_replied");
  if (i.humanHandled) return no("human_handled_recently");
  if (i.recentCall) return no("recent_call_within_30m");
  if (
    !i.conversationAiEnabled ||
    ["paused", "human_only", "disabled"].includes(i.conversationMode)
  ) {
    // Belt-and-suspenders: the caller should already fold human_only/paused
    // into humanHandled; this catches disabled/ai-off states.
    return no("conversation_not_ai_eligible");
  }
  if (i.killSwitch || !i.smsEnabled || !i.autoSendEnabled || i.autoReplyEnabled === false) {
    return no("auto_send_disabled");
  }
  if (NEVER_AUTO_SEND.has(i.category) || i.categoryMode !== "auto_send_safe") {
    return no("category_not_safe");
  }
  if (i.capReached) return no("daily_cap_reached");
  return { send: true, skipReason: null };
}

// ── Settings shape (mirrors ai_support_settings seeds) ────────────────────────
export interface AiSupportSettings {
  ai_global_kill_switch: boolean;
  ai_sms_enabled: boolean;
  ai_sms_auto_send_enabled: boolean;
  ai_sms_default_mode: string;
  ai_call_enabled: boolean;
  ai_missed_call_sms_enabled: boolean;
  ai_max_auto_replies_per_conversation_per_day: number;
  ai_confidence_threshold: number;
  ai_category_modes: Partial<Record<SupportCategory, CategoryMode>>;
  /**
   * Live-chat auto-reply master toggle. BLACKLIST-FIRST (2026-07-07):
   * every chat session is eligible for an AI reply by default; the AI
   * "always answers" unless (a) this toggle is off, or (b) the session id
   * is in ai_chat_auto_reply_blacklisted_sessions. Risky topics get a SAFE
   * FIXED TEMPLATE + internal escalation, never AI-generated advice.
   */
  ai_chat_auto_reply_enabled: boolean;
  /**
   * Live-chat rollout mode (AI-SUPPORT-CHAT-SMS-ROLLOUT-001, 2026-07-08) — the
   * authoritative chat control. Supersedes the boolean above (kept in sync for
   * legacy readers):
   *   "off"   → AI does nothing customer-visible; no draft, no send.
   *   "draft" → AI generates a SUGGESTED reply logged for staff review, and
   *             NOTHING is sent to the visitor (LIVE-safe default).
   *   "auto"  → AI posts a customer-visible reply ("always answer").
   * When absent/invalid, resolveChatReplyMode() derives it from the legacy
   * boolean (enabled→auto, else off). Risky topics are still template-only and
   * escalate/block regardless of mode.
   */
  ai_chat_reply_mode: ChatReplyMode;
  /** Chat sessions that must NOT receive an AI reply (blacklist). */
  ai_chat_auto_reply_blacklisted_sessions: string[];
  /**
   * DEPRECATED whitelist — retained for backward-compatible reads only.
   * No longer gates chat replies under the blacklist-first model.
   */
  ai_chat_auto_reply_test_sessions: string[];
  ai_chat_auto_reply_cooldown_seconds: number;
  ai_chat_max_auto_replies_per_session_per_day: number;
  /**
   * SMS auto-reply master toggle (blacklist-first). Defaults true; SMS
   * auto-send additionally requires ai_sms_auto_send_enabled. A number is
   * eligible unless it is in ai_sms_auto_reply_blacklisted_numbers. SMS
   * keeps every stricter protection (DND/STOP fail-closed, human takeover,
   * dedupe, category modes — risky categories still never auto-send).
   */
  ai_sms_auto_reply_enabled: boolean;
  /** SMS numbers (E.164) that must NOT receive an AI reply (blacklist). */
  ai_sms_auto_reply_blacklisted_numbers: string[];
  /**
   * DEPRECATED whitelist — retained for backward-compatible reads only.
   * No longer gates SMS auto-send under the blacklist-first model.
   */
  ai_sms_auto_send_whitelist: string[];
}

export const DEFAULT_SETTINGS: AiSupportSettings = {
  ai_global_kill_switch: false,
  ai_sms_enabled: true,
  ai_sms_auto_send_enabled: false,
  ai_sms_default_mode: "draft_only",
  ai_call_enabled: false,
  ai_missed_call_sms_enabled: false,
  ai_max_auto_replies_per_conversation_per_day: 3,
  ai_confidence_threshold: 0.78,
  ai_sms_auto_send_whitelist: [],
  ai_sms_auto_reply_enabled: true,
  ai_sms_auto_reply_blacklisted_numbers: [],
  ai_chat_auto_reply_enabled: false,
  // LIVE-safe default: draft for staff review, never auto-post to a visitor.
  ai_chat_reply_mode: "draft",
  ai_chat_auto_reply_blacklisted_sessions: [],
  ai_chat_auto_reply_test_sessions: [],
  ai_chat_auto_reply_cooldown_seconds: 120,
  ai_chat_max_auto_replies_per_session_per_day: 3,
  ai_category_modes: {
    order_status: "auto_send_safe",
    letter_timing: "auto_send_safe",
    landlord_verification: "auto_send_safe",
    upload_documents: "auto_send_safe",
    pricing: "auto_send_safe",
    // ESA/PSD "how to apply" are safe link answers (concise KB snippet only).
    // They MAY auto-send when every gate passes (auto-send on, confidence,
    // DND clear, cooldown, cap). Medical/qualify/fraud phrasing is caught
    // FIRST by the hard-block rules (medical_clinical / fraud), so a genuine
    // "how do I get an ESA/PSD letter?" is all that reaches these categories.
    eligibility_general: "auto_send_safe",
    psd_general: "auto_send_safe",
    technical_issue: "draft_only",
    provider_review: "draft_only",
    refund: "draft_only",
    complaint: "escalate",
    legal_eviction: "escalate",
    medical_crisis: "block",
    fraud: "block",
    unknown: "draft_only",
  },
};

/** Categories that may NEVER auto-send regardless of settings. */
export const NEVER_AUTO_SEND: ReadonlySet<SupportCategory> = new Set([
  "refund", "complaint", "legal_eviction", "medical_crisis", "fraud",
  "chargeback_dispute", "opt_out",
]);

export interface ConversationState {
  ai_enabled: boolean;
  ai_mode: string; // draft_only | auto_send_safe | paused | human_only | disabled
  auto_replies_today: number;
  /** Seconds since the last AI auto-reply in this conversation (Infinity if none). */
  seconds_since_last_ai_reply: number;
}

/** Minimum seconds between AI auto-replies in one conversation (anti-spam). */
export const AUTO_REPLY_COOLDOWN_SECONDS = 120;

export interface Decision {
  action: AiAction;
  reason: string;
}

/**
 * The single decision function. Layered, most restrictive wins:
 *   1. Global kill switch / channel disabled → block (draft nothing sends).
 *   2. Hard-blocked classification → block or escalate per category mode.
 *   3. Conversation paused/human_only/disabled → draft at most, never send.
 *   4. Category mode (escalate / block / draft_only) caps the action.
 *   5. Global auto-send toggle, confidence threshold, daily cap, cooldown —
 *      all must pass for auto_send; otherwise degrade to draft.
 */
export function decideAction(
  cls: Classification,
  settings: AiSupportSettings,
  convo: ConversationState,
  confidence: number | null,
): Decision {
  const modes = { ...DEFAULT_SETTINGS.ai_category_modes, ...settings.ai_category_modes };
  const mode: CategoryMode = modes[cls.category] ?? "draft_only";

  if (settings.ai_global_kill_switch) {
    return { action: "block", reason: "Global kill switch is ON — AI is fully disabled." };
  }
  if (!settings.ai_sms_enabled) {
    return { action: "block", reason: "AI SMS is disabled in settings." };
  }

  // Hard guardrail blocks.
  if (cls.hard_blocked) {
    if (cls.category === "opt_out") {
      return { action: "block", reason: "SMS opt-out keyword — never reply by SMS." };
    }
    if (mode === "escalate") {
      return { action: "escalate", reason: `Guardrail ${cls.guardrail_code}: category ${cls.category} escalates to a human (draft prepared, nothing sent).` };
    }
    return { action: "block", reason: `Guardrail ${cls.guardrail_code}: category ${cls.category} is blocked from AI replies.` };
  }

  // Per-conversation state.
  if (!convo.ai_enabled || convo.ai_mode === "paused" || convo.ai_mode === "human_only" || convo.ai_mode === "disabled") {
    return { action: "draft", reason: `Conversation AI is ${convo.ai_mode} — internal draft only, never sent.` };
  }

  // Category-mode caps.
  if (mode === "block") {
    return { action: "block", reason: `Category ${cls.category} is set to Block.` };
  }
  if (mode === "escalate") {
    return { action: "escalate", reason: `Category ${cls.category} is set to Escalate-only.` };
  }
  if (NEVER_AUTO_SEND.has(cls.category)) {
    return { action: "escalate", reason: `Category ${cls.category} may never auto-send (hard policy).` };
  }
  if (mode === "draft_only") {
    return { action: "draft", reason: `Category ${cls.category} is set to Draft-only.` };
  }

  // mode === auto_send_safe — every remaining gate must pass.
  if (!settings.ai_sms_auto_send_enabled) {
    return { action: "draft", reason: "Global auto-send is OFF — draft created for admin review." };
  }
  if (convo.ai_mode !== "auto_send_safe") {
    return { action: "draft", reason: `Conversation mode is ${convo.ai_mode} — auto-send requires auto_send_safe.` };
  }
  if (confidence === null || confidence < settings.ai_confidence_threshold) {
    return { action: "draft", reason: `Confidence ${confidence ?? "n/a"} below threshold ${settings.ai_confidence_threshold} — draft only.` };
  }
  if (convo.auto_replies_today >= settings.ai_max_auto_replies_per_conversation_per_day) {
    return { action: "escalate", reason: `Daily auto-reply cap (${settings.ai_max_auto_replies_per_conversation_per_day}) reached for this conversation — human should take over.` };
  }
  if (convo.seconds_since_last_ai_reply < AUTO_REPLY_COOLDOWN_SECONDS) {
    return { action: "draft", reason: `Cooldown: last AI reply ${Math.round(convo.seconds_since_last_ai_reply)}s ago (< ${AUTO_REPLY_COOLDOWN_SECONDS}s) — draft only to avoid spamming.` };
  }
  return { action: "auto_send", reason: `Safe category ${cls.category}, confidence passed, caps ok, auto-send enabled.` };
}

// ── Escalation-safe canned replies (used as DRAFTS for blocked categories) ────
export const ESCALATION_TEMPLATES: Partial<Record<SupportCategory, string>> = {
  legal_eviction:
    "I'm sorry you're dealing with that. Because eviction and legal issues can be time-sensitive, I'm flagging this for our support team to review directly. PawTenant can help with letter verification and documentation support, but we can't provide legal advice.",
  medical_crisis:
    "I'm really sorry you're feeling this way. If you may harm yourself or are in immediate danger, please call 911 now. You can also call or text 988 (Suicide & Crisis Lifeline), or text HOME to 741741. I'm flagging this for our support team right away.",
  fraud:
    "We can't alter, backdate, or misrepresent any documentation — every letter reflects a licensed provider's genuine review. If you have questions about the legitimate process, our team is happy to help.",
  refund:
    "Thanks for reaching out. Refund requests are reviewed by our team against our refund policy — I've flagged your message so a team member can follow up with you directly.",
  complaint:
    "I'm sorry about your experience — that's not what we want. I've flagged this for our support team so a person can review your case and follow up with you directly.",
  chargeback_dispute:
    "Thanks for letting us know. Payment disputes are handled by our team directly — I've flagged your message so someone can review your case and follow up with you.",
};

/** Crisis category must never be answered with normal support copy. */
export function isCrisis(cls: Classification): boolean {
  return cls.guardrail_code === "self_harm_crisis";
}

// ── CHAT rollout mode (off / draft / auto) ────────────────────────────────────
// AI-SUPPORT-CHAT-SMS-ROLLOUT-001 (2026-07-08). "draft" is the LIVE-safe posture:
// the AI writes a SUGGESTED reply for staff review and NOTHING reaches the
// visitor automatically. Only "auto" posts a customer-visible reply.
export type ChatReplyMode = "off" | "draft" | "auto";

/** Resolve the effective chat reply mode. Prefers the explicit setting; falls
 *  back to the legacy boolean (enabled→auto, else off) when unset/invalid.
 *  PURE — safe in both the edge function and the Node harness. Does NOT fold in
 *  the kill switch / blacklist / conversation state — callers apply those as
 *  higher-priority silencers. */
export function resolveChatReplyMode(s: {
  ai_chat_reply_mode?: string | null;
  ai_chat_auto_reply_enabled?: boolean;
}): ChatReplyMode {
  const m = s.ai_chat_reply_mode;
  if (m === "off" || m === "draft" || m === "auto") return m;
  return s.ai_chat_auto_reply_enabled ? "auto" : "off";
}

// ── CHAT "Always Answer" mode (2026-07-07) ────────────────────────────────────
// Chat sends a customer-visible reply for EVERY eligible inbound message (not
// blacklisted, global chat AI on, kill switch off, conversation not human-
// owned). It never leaves a visitor hanging — but risky topics receive a SAFE
// FIXED TEMPLATE, never AI-generated legal/medical/fraud/refund advice, and are
// still escalated/blocked internally. SMS deliberately does NOT use this — SMS
// keeps risky categories in draft/escalate (higher-risk channel).

export type ChatResponseMode =
  | "normal"            // model's helpful answer for a safe/support question
  | "clarifying"        // low-confidence/unknown → ask what they need
  | "escalation_holding"// legal / complaint / medical-clinical / chargeback → safe hold + escalate
  | "crisis"            // self-harm → emergency-services guidance + escalate
  | "fraud_refusal"     // fake/backdate → safe refusal + legitimate path
  | "refund_review";    // refund/payment → no promise, team will review

/** Customer-visible chat templates for the non-"normal" modes. Fixed copy,
 *  compliance-reviewed — the model never writes these. */
export const CHAT_TEMPLATES: Record<Exclude<ChatResponseMode, "normal">, string> = {
  clarifying:
    "I want to make sure I point you in the right direction — are you asking about an ESA letter, a PSD letter, your order status, or landlord verification? Tell me a bit more and I'll help.",
  escalation_holding:
    "I'm going to flag this for our support team so a person can review it carefully and follow up with you. In the meantime, please don't share private legal, medical, or payment details here. PawTenant can help with letter verification and documentation, but we can't give legal or medical advice.",
  crisis:
    "If you might be in danger or thinking about harming yourself, please reach out for help right now — in the US you can call or text 988 (Suicide & Crisis Lifeline), or call 911 if it's an emergency. I've alerted our team as well. You matter, and you don't have to go through this alone.",
  fraud_refusal:
    "We can't help create fake or backdated documentation — every letter reflects a licensed provider's genuine review. If you'd like to start a legitimate provider-reviewed evaluation, you can begin here: https://pawtenant.com/assessment",
  refund_review:
    "Thanks for reaching out. I'm not able to approve refunds or billing changes myself, but I've flagged your message so our support team can review your order and follow up with you directly.",
};

export interface ChatResponsePlan {
  mode: ChatResponseMode;
  /** DB event action for audit/analytics parity. */
  action: "auto_sent" | "escalated" | "blocked";
  /** Whether to mark the conversation escalated internally. */
  escalateInternally: boolean;
  /** Whether the internal event should read as a hard block (fraud/crisis). */
  blockInternally: boolean;
  /** The customer-visible reply for template modes; null for "normal"
   *  (caller supplies the model draft). */
  templateReply: string | null;
}

/**
 * Decide the chat response mode + the customer-visible template for a message
 * that is eligible to be answered. PURE — the caller handles the model draft
 * for "normal", the PAW20 gate, sending, and audit rows.
 *
 * Only reached AFTER eligibility (not blacklisted / global on / not killed /
 * conversation AI on) has passed — this function always yields a reply.
 */
export function planChatResponse(
  cls: Classification,
  draft: { reply: string; safe_to_send: boolean; error: string | null } | null,
): ChatResponsePlan {
  // 1. Self-harm / medical crisis — emergency guidance, never counseling.
  if (isCrisis(cls)) {
    return { mode: "crisis", action: "blocked", escalateInternally: true, blockInternally: true, templateReply: CHAT_TEMPLATES.crisis };
  }
  // 2. Fraud / fake / backdate — safe refusal + legitimate path.
  if (cls.category === "fraud") {
    return { mode: "fraud_refusal", action: "blocked", escalateInternally: false, blockInternally: true, templateReply: CHAT_TEMPLATES.fraud_refusal };
  }
  // 3. Refund / payment — no promise, team reviews.
  if (cls.category === "refund" || cls.category === "chargeback_dispute") {
    return { mode: "refund_review", action: "escalated", escalateInternally: true, blockInternally: false, templateReply: CHAT_TEMPLATES.refund_review };
  }
  // 4. Legal / eviction / complaint / medical-clinical — safe holding + escalate.
  if (
    cls.category === "legal_eviction" ||
    cls.category === "complaint" ||
    cls.category === "medical_crisis" // non-self-harm medical/clinical asks
  ) {
    return { mode: "escalation_holding", action: "escalated", escalateInternally: true, blockInternally: false, templateReply: CHAT_TEMPLATES.escalation_holding };
  }
  // 5. Opt-out word in CHAT — no SMS to stop; just help, never disable chat AI.
  if (cls.category === "opt_out") {
    return { mode: "clarifying", action: "auto_sent", escalateInternally: false, blockInternally: false, templateReply: CHAT_TEMPLATES.clarifying };
  }
  // 6. Safe/support/eligibility/psd/unknown — send the model's answer if it is
  //    confident and self-cleared; otherwise ask a clarifying question rather
  //    than risk a wrong answer. Either way the visitor gets a reply.
  if (draft && draft.reply && draft.safe_to_send && !draft.error) {
    return { mode: "normal", action: "auto_sent", escalateInternally: false, blockInternally: false, templateReply: null };
  }
  return { mode: "clarifying", action: "auto_sent", escalateInternally: false, blockInternally: false, templateReply: CHAT_TEMPLATES.clarifying };
}

// ── Cost estimation (kept in sync with ai-suggest-sms-reply pricing) ─────────
export const PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICING_USD_PER_1M[model] ?? PRICING_USD_PER_1M["gpt-4o-mini"];
  const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
