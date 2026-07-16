// ai-handle-inbound-chat — PawTenant AI Support live-chat pipeline (TEST).
//
// "ALWAYS ANSWER" contract (blacklist-first, 2026-07-07): chat sends a
// customer-visible reply for EVERY inbound message so a visitor is never left
// hanging — UNLESS the session is blacklisted, chat AI is globally off, the
// kill switch is on, or a human owns the conversation. Confidence, cooldown,
// daily cap, and safe-category allow-lists are NO LONGER blockers.
//   * capture-chat forwards each visitor message here (fire-and-forget) AFTER
//     it has been stored in the public chat tables.
//   * Local guardrails classify FIRST (legal/eviction, self-harm crisis,
//     fraud, medical, chargeback, opt-out); then an OpenAI draft for safe
//     topics (shared $50/month pool). planChatResponse (policy.ts) picks the
//     RESPONSE MODE:
//       normal            → the model's answer (safe/support questions)
//       clarifying        → low-confidence/unknown → ask what they need
//       escalation_holding→ legal/complaint/medical → SAFE fixed hold + escalate
//       crisis            → self-harm → 988/911 guidance + escalate
//       fraud_refusal     → fake/backdate → safe refusal + legit path
//       refund_review     → refund/payment → no promise, team reviews
//     Risky modes use FIXED compliance-reviewed templates (never AI advice)
//     and still escalate/block internally. Every mode posts one reply through
//     the same post_agent_chat_message RPC humans use (service-role call).
//   * PAW20 stays gated: one code, price objection only, no existing order, not
//     already offered — else the code is stripped and the visitor is routed to
//     a human (still answered). Idempotency dedup guarantees one reply per
//     distinct inbound message.
//   * Output: ai_support conversation (channel=chat, keyed by
//     external_session_id = chat_sessions.id), inbound message, AI event,
//     admin notification (drives the Communications → AI Support badge), and
//     best-effort GHL contact sync when the visitor shared an email/phone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  classifyMessage,
  estimateCostUsd,
  planChatResponse,
  resolveChatReplyMode,
  CHAT_TEMPLATES,
  type Classification,
  type SupportCategory,
} from "../_shared/aiSupport/policy.ts";
import { AI_SUPPORT_SYSTEM_PROMPT } from "../_shared/aiSupport/prompt.ts";
import { isRefundTerminal, type ClassifiableOrder } from "../_shared/orderClassification.ts";
import {
  authorizeRequest,
  countAutoRepliesToday,
  getOrCreateChatConversation,
  insertEvent,
  insertMessage,
  insertNotification,
  loadSettings,
  paw20AlreadyOffered,
} from "../_shared/aiSupport/db.ts";
import { detectPriceObjection, mentionsDiscountCode } from "../_shared/aiSupport/knowledgeBase.ts";
import { syncAiSupportStateToGhl, type GhlSyncResult } from "../_shared/aiSupport/ghl.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-support-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

const MODEL = "gpt-4o-mini";
const MAX_OUTPUT_TOKENS = 260;
const TEMPERATURE = 0.3;
const MONTHLY_BUDGET_USD = 50; // shared pool with the SMS pipelines via ai_usage_log

const VALID_CATEGORIES: SupportCategory[] = [
  "order_status", "letter_timing", "landlord_verification", "pricing", "refund",
  "provider_review", "upload_documents", "technical_issue", "eligibility_general",
  "psd_general", "complaint", "legal_eviction", "medical_crisis", "fraud", "unknown",
];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface ModelDraft {
  reply: string;
  category: SupportCategory;
  confidence: number | null;
  safe_to_send: boolean;
  needs_admin_review: boolean;
  reason: string;
  model: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  error: string | null;
}

// Mirrors the SMS pipeline's drafting call (kept local so the working SMS
// function stays untouched in this phase; unify into _shared when chat
// leaves shadow mode). Differences: feature/channel metering tags only.
type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Recent conversation turns for THIS chat conversation (oldest→newest, at most
 * 6), so the model can see what it already said and answer a follow-up
 * directly instead of repeating itself. Excludes the just-stored inbound
 * message (it is passed separately as the final user turn). Fails soft to [].
 */
async function loadRecentChatTurns(
  admin: ReturnType<typeof createClient>,
  conversationId: string,
  excludeMessageId: string | null,
): Promise<ChatTurn[]> {
  try {
    const { data } = await admin
      .from("ai_support_messages")
      .select("id, direction, body, created_at")
      .eq("conversation_id", conversationId)
      .in("direction", ["inbound", "outbound"])
      .order("created_at", { ascending: false })
      .limit(9);
    const rows = ((data ?? []) as Array<{ id: string; direction: string; body: string | null }>)
      .filter((r) => r.id !== excludeMessageId)
      .reverse();
    return rows
      .map((r): ChatTurn => ({
        role: r.direction === "inbound" ? "user" : "assistant",
        content: String(r.body ?? "").slice(0, 500),
      }))
      .filter((t) => t.content.trim().length > 0)
      .slice(-6);
  } catch (_e) {
    return [];
  }
}

async function draftWithOpenAi(
  admin: ReturnType<typeof createClient>,
  inboundText: string,
  inboundHash: string,
  history: ChatTurn[] = [],
): Promise<ModelDraft> {
  const empty: ModelDraft = {
    reply: "", category: "unknown", confidence: null, safe_to_send: false,
    needs_admin_review: true, reason: "", model: null,
    prompt_tokens: 0, completion_tokens: 0, cost_usd: 0, error: null,
  };
  if (!OPENAI_API_KEY) return { ...empty, error: "openai_unconfigured" };

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  try {
    const { data: rows } = await admin
      .from("ai_usage_log")
      .select("est_cost_usd")
      .gte("created_at", monthStart);
    const spent = (rows ?? []).reduce((a: number, r: { est_cost_usd: number | string }) => a + Number(r.est_cost_usd || 0), 0);
    if (spent >= MONTHLY_BUDGET_USD) return { ...empty, error: "budget_exceeded" };
  } catch (_e) { /* fail open on the read; per-request cap still applies */ }

  const schema = {
    name: "pawtenant_ai_support_reply",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        reply: { type: "string" },
        category: { type: "string" },
        confidence: { type: "number" },
        safe_to_send: { type: "boolean" },
        needs_admin_review: { type: "boolean" },
        reason: { type: "string" },
      },
      required: ["reply", "category", "confidence", "safe_to_send", "needs_admin_review", "reason"],
    },
  };

  let oa: Response;
  try {
    oa = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: TEMPERATURE,
        max_tokens: MAX_OUTPUT_TOKENS,
        response_format: { type: "json_schema", json_schema: schema },
        messages: [
          { role: "system", content: AI_SUPPORT_SYSTEM_PROMPT },
          ...history,
          { role: "user", content: `Latest live-chat message from a website visitor:\n"""${inboundText}"""` },
        ],
      }),
    });
  } catch (_e) {
    return { ...empty, error: "openai_unreachable" };
  }
  if (!oa.ok) {
    console.error(`[ai-handle-inbound-chat] OpenAI HTTP ${oa.status}`);
    return { ...empty, error: `openai_http_${oa.status}` };
  }
  const data = await oa.json();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content ?? "{}");
  } catch (_e) {
    return { ...empty, error: "openai_malformed" };
  }
  const usage = data?.usage ?? {};
  const inTok = Number(usage?.prompt_tokens ?? 0);
  const outTok = Number(usage?.completion_tokens ?? 0);
  const cost = estimateCostUsd(MODEL, inTok, outTok);

  try {
    await admin.from("ai_usage_log").insert({
      feature: "chat_shadow",
      channel: "chat",
      model: MODEL,
      source: "openai",
      status: "allowed",
      intent: String(parsed.category ?? "unknown").slice(0, 60),
      inbound_len: inboundText.length,
      inbound_sha256: inboundHash,
      input_tokens: inTok,
      output_tokens: outTok,
      est_cost_usd: cost,
    });
  } catch (_e) { /* non-fatal */ }

  let confidence = typeof parsed.confidence === "number" ? parsed.confidence : null;
  if (confidence !== null) confidence = Math.min(1, Math.max(0, confidence));
  const category = VALID_CATEGORIES.includes(parsed.category as SupportCategory)
    ? (parsed.category as SupportCategory)
    : "unknown";

  return {
    reply: String(parsed.reply ?? "").slice(0, 900),
    category,
    confidence,
    safe_to_send: parsed.safe_to_send === true,
    needs_admin_review: parsed.needs_admin_review !== false,
    reason: String(parsed.reason ?? "").slice(0, 400),
    model: MODEL,
    prompt_tokens: inTok,
    completion_tokens: outTok,
    cost_usd: cost,
    error: null,
  };
}

// ── Safe order-status lookup (CHAT-PREMSG-HERO-REVISION-001) ──────────────────
// A visitor may paste their PawTenant order id (PT-…). We look it up SERVER-SIDE
// with the service-role client and return ONLY a coarse status category — never
// any PII (no name/email/phone/address/provider/health/letter/payment/refund
// details, no timestamps, no internal notes). Fixed templates only; the model
// never sees order data.
const ORDER_ID_RE = /\bPT-[A-Z0-9]{5,}\b/i;

function extractOrderId(text: string): string | null {
  const m = (text || "").match(ORDER_ID_RE);
  return m ? m[0].toUpperCase() : null;
}

interface OrderStatusResult {
  reply: string;
  found: boolean;
  needsReview: boolean; // problem states → flag for the team
  category: string;     // coarse, for audit metadata only (no PII)
}

async function lookupOrderStatusSafe(
  admin: ReturnType<typeof createClient>,
  orderId: string,
): Promise<OrderStatusResult> {
  const notFound: OrderStatusResult = {
    reply: "I couldn't find that order ID. Please double-check the ID or check My Orders.",
    found: false, needsReview: false, category: "not_found",
  };
  try {
    const { data } = await admin
      .from("orders")
      // refund_status is REQUIRED — a partial refund must not read as a problem.
      .select("status, paid_at, payment_failed_at, refunded_at, refund_status, refund_amount, dispute_status")
      .ilike("confirmation_id", orderId) // exact (no wildcards in a PT- id) but case-insensitive
      .limit(1)
      .maybeSingle();
    if (!data) return notFound;

    const s = String(data.status ?? "").toLowerCase().trim();
    // PARTIAL-REFUND-TERMINAL-STATE-CONSUMER-FIX-001: a partial refund is a
    // normal billing adjustment on a live order — it must NOT flag the order as
    // a problem, which changed the reply and escalated an in-review order.
    const problem =
      isRefundTerminal(data as ClassifiableOrder) ||
      !!data.payment_failed_at || !!data.dispute_status ||
      ["cancelled", "canceled", "archived", "lead"].includes(s);

    if (s === "completed") {
      return {
        reply: "Your order is completed. You can check or download updates in My Orders.",
        found: true, needsReview: false, category: "completed",
      };
    }
    if (!problem && (["processing", "under-review", "under review", "paid · unassigned"].includes(s) || !!data.paid_at)) {
      return {
        reply: "Your order is currently in review. You can also check updates in My Orders.",
        found: true, needsReview: false, category: "in_review",
      };
    }
    // pending payment / unpaid / failed / refunded / cancelled / dispute / unknown
    return {
      reply: "I found the order, but this needs support-team review. I've flagged it so our team can follow up.",
      found: true, needsReview: true, category: "needs_review",
    };
  } catch (_e) {
    return notFound;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const auth = await authorizeRequest(req, admin, SUPABASE_SERVICE_ROLE_KEY);
    if (!auth) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const chatSessionId = String(body?.chatSessionId ?? "").slice(0, 64).trim();
    const chatMessageId = body?.chatMessageId ? String(body.chatMessageId).slice(0, 64) : null;
    const inboundText = String(body?.body ?? body?.message ?? "").slice(0, 2000).trim();
    const visitorEmail = body?.visitorEmail ? String(body.visitorEmail).slice(0, 320) : null;
    const visitorName = body?.visitorName ? String(body.visitorName).slice(0, 200) : null;
    const pageUrl = body?.pageUrl ? String(body.pageUrl).slice(0, 2048) : null;

    if (!chatSessionId || !inboundText) {
      return json({ ok: false, error: "chatSessionId and body are required" }, 400);
    }

    // Idempotency: chats.id is globally unique → dedup forever. Content-hash
    // fallback (same 20s recency rule the SMS pipeline uses) only applies if
    // a caller ever omits chatMessageId.
    const DERIVED_DEDUP_WINDOW_SECONDS = 20;
    let providerMessageId = chatMessageId ? `chat:${chatMessageId}` : null;
    if (!providerMessageId) {
      const normBody = inboundText.trim().toLowerCase().replace(/\s+/g, " ");
      providerMessageId = `chat-derived:${(await sha256Hex(`${chatSessionId}|${normBody}`)).slice(0, 40)}`;
    }
    {
      const { data: dup } = await admin
        .from("ai_support_messages")
        .select("id, created_at")
        .eq("provider_message_id", providerMessageId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dup) {
        const isDerived = providerMessageId.startsWith("chat-derived:");
        const ageSec = (Date.now() - new Date(dup.created_at).getTime()) / 1000;
        if (!isDerived || ageSec < DERIVED_DEDUP_WINDOW_SECONDS) {
          return json({ ok: true, already_processed: true, message_id: dup.id });
        }
      }
    }

    const settings = await loadSettings(admin);
    // Rollout mode: off | draft | auto. "draft" = suggest a reply for staff
    // review, never post to the visitor (LIVE-safe). Only "auto" sends.
    const chatMode = resolveChatReplyMode(settings);
    const convo = await getOrCreateChatConversation(admin, chatSessionId, visitorEmail, visitorName);

    // Backfill visitor identity (never overwrite existing values).
    if (visitorEmail || visitorName) {
      try {
        const patch: Record<string, string> = {};
        if (visitorName) patch.customer_name = visitorName;
        if (visitorEmail) patch.customer_email = visitorEmail;
        await admin
          .from("ai_support_conversations")
          .update(patch)
          .eq("id", convo.id)
          .is("customer_name", null);
      } catch (_e) { /* non-fatal */ }
    }

    const inboundMsgId = await insertMessage(admin, {
      conversation_id: convo.id,
      direction: "inbound",
      channel: "chat",
      body: inboundText,
      provider_message_id: providerMessageId,
      source: "customer",
      metadata: {
        source: "website_chat",
        chat_session_id: chatSessionId,
        page_url: pageUrl,
        received_via: auth.kind,
        shadow_mode: true,
      },
    });
    await admin
      .from("ai_support_conversations")
      .update({ last_inbound_at: new Date().toISOString() })
      .eq("id", convo.id);

    // ── 1. Local guardrails FIRST ─────────────────────────────────────────────
    const cls: Classification = classifyMessage(inboundText);

    // ── 1b. Safe order-status lookup (deterministic; PII-free) ───────────────
    // If the visitor pasted a PT- order id AND the message isn't a hard-blocked
    // risky topic, answer with a coarse status template and SKIP the model
    // entirely (no order data ever reaches OpenAI).
    const orderId = cls.hard_blocked ? null : extractOrderId(inboundText);
    const orderStatus = orderId ? await lookupOrderStatusSafe(admin, orderId) : null;

    // ── 2. Model draft for non-hard-blocked messages (skip when killed) ──────
    // Give the model the recent turns of THIS conversation so a follow-up gets
    // a direct answer, not a repeat of the previous reply. Skipped for order-id
    // lookups (handled deterministically above).
    // "off" mode drafts nothing (no OpenAI spend); "draft" still generates the
    // suggested reply for staff review; "auto" generates and sends.
    let draft: ModelDraft | null = null;
    if (!cls.hard_blocked && !settings.ai_global_kill_switch && chatMode !== "off" && !orderStatus) {
      const history = await loadRecentChatTurns(admin, convo.id, inboundMsgId);
      draft = await draftWithOpenAi(admin, inboundText, await sha256Hex(inboundText), history);
    }

    const category: SupportCategory =
      orderStatus ? "order_status"
      : cls.category !== "unknown" ? cls.category
      : (draft?.category ?? "unknown");
    const finalCls: Classification = { ...cls, category };

    let confidence = draft?.confidence ?? null;
    if (draft && (!draft.safe_to_send || draft.needs_admin_review)) confidence = 0;
    if (draft?.error) confidence = null;

    // Metadata only (no longer a gate) — audit trail keeps the counter.
    const autoRepliesToday = await countAutoRepliesToday(admin, convo.id);

    // ── Eligibility (BLACKLIST-FIRST "Always Answer") ────────────────────────
    // Chat answers EVERY inbound message unless one of these silences it.
    // Risky topics still get a SAFE FIXED TEMPLATE (never AI advice) and are
    // escalated/blocked internally — see planChatResponse.
    const chatBlacklist = (Array.isArray(settings.ai_chat_auto_reply_blacklisted_sessions)
      ? settings.ai_chat_auto_reply_blacklisted_sessions : []).map((s) => String(s));
    const isBlacklisted = chatBlacklist.includes(chatSessionId);
    const conversationOff = !convo.ai_enabled || ["paused", "human_only", "disabled"].includes(convo.ai_mode);

    // Silencers (highest priority first) then rollout mode. Only chatMode
    // "auto" leaves noReplyReason null → a customer-visible reply is posted.
    // "draft" and "off" keep the reply as an internal draft for staff review.
    let noReplyReason: string | null = null;
    if (isBlacklisted) noReplyReason = "blacklisted";
    else if (settings.ai_global_kill_switch) noReplyReason = "kill_switch_on";
    else if (conversationOff) noReplyReason = "conversation_ai_off";
    else if (chatMode === "off") noReplyReason = "chat_ai_off";
    else if (chatMode === "draft") noReplyReason = "draft_only_mode";

    // ── Plan the customer-visible response (risky → fixed template) ──────────
    const plan = planChatResponse(finalCls, draft ? { reply: draft.reply, safe_to_send: draft.safe_to_send, error: draft.error } : null);
    const priceObjection = detectPriceObjection(inboundText);

    let responseMode = plan.mode;
    let action = plan.action;               // auto_sent | escalated | blocked
    let escalateInternally = plan.escalateInternally;
    let blockInternally = plan.blockInternally;
    let replyBody = plan.templateReply ?? draft?.reply ?? CHAT_TEMPLATES.clarifying;
    let discountOffered = false;

    if (orderStatus) {
      // ── Deterministic order-status reply (PII-free) ───────────────────────
      responseMode = "normal";
      action = orderStatus.needsReview ? "escalated" : "auto_sent";
      escalateInternally = orderStatus.needsReview;
      blockInternally = false;
      replyBody = orderStatus.reply;
    } else if (priceObjection || mentionsDiscountCode(draft?.reply)) {
      // ── Discount / price-objection → PAW20 rule (CHAT-PREMSG-HERO-REVISION-001)
      // A discount ask is a PRICE OBJECTION, NOT a refund request — it must
      // never be routed to the refund/billing escalation. One code (PAW20),
      // $20 off, once per conversation, never on an existing order, never
      // stacked/invented.
      const alreadyOffered = await paw20AlreadyOffered(admin, convo.id);
      if (convo.order_id) {
        // Existing order → pricing/billing on a real order is a human's job.
        responseMode = "refund_review";
        action = "escalated";
        escalateInternally = true;
        blockInternally = false;
        replyBody = "Since you already have an order with us, I've flagged this for our team to review your order and any pricing options with you.";
      } else if (!alreadyOffered) {
        // Fresh price objection, no order → offer PAW20 once (deterministic).
        responseMode = "normal";
        action = "auto_sent";
        escalateInternally = false;
        blockInternally = false;
        discountOffered = true;
        replyBody = "You can use code PAW20 for $20 off your order — just apply it at checkout.";
      } else {
        // Already offered once → gentle reminder of the SAME code, no spam,
        // no new/stacked discount, and NOT a refund escalation.
        responseMode = "normal";
        action = "auto_sent";
        escalateInternally = false;
        blockInternally = false;
        replyBody = "You can still use code PAW20 for $20 off — just apply it at checkout.";
      }
    }

    const modeReason: Record<string, string> = {
      normal: "Auto-answered the visitor.",
      clarifying: "Asked a clarifying question so the visitor isn't left waiting.",
      escalation_holding: "Sent a safe holding reply and escalated to a human.",
      crisis: "Sent crisis-safe guidance (988/911) and escalated to a human.",
      fraud_refusal: "Safely refused and pointed to the legitimate assessment.",
      refund_review: "Told the visitor a human will review — no promise made.",
    };
    const noReplyText: Record<string, string> = {
      blacklisted: "Session is blacklisted — no AI reply; drafted for a human.",
      global_disabled: "Chat AI is globally off — no AI reply; drafted for a human.",
      chat_ai_off: "Chat AI mode is Off — no reply drafted or sent.",
      draft_only_mode: "Draft-only mode — AI drafted a suggested reply for staff review; nothing was sent to the visitor.",
      kill_switch_on: "Global kill switch is on — no AI reply.",
      conversation_ai_off: "A human owns this conversation — AI stayed silent.",
    };

    // ── 3. Execute ────────────────────────────────────────────────────────────
    // Internal escalation/block tracking runs even when no reply is sent, so a
    // risky message is never silently dropped from a human's queue.
    if (escalateInternally || blockInternally) {
      await admin
        .from("ai_support_conversations")
        .update({ status: "escalated" })
        .eq("id", convo.id)
        .neq("status", "closed");
    }

    let eventAction: string;
    let sent = false;
    let sendError: string | null = null;
    let chatMessageIdOut: string | null = null;

    if (noReplyReason) {
      // Eligible=false: keep a draft on the event for admin approval, don't send.
      eventAction = "drafted";
    } else {
      // Same safe path humans use: post_agent_chat_message (SECURITY DEFINER;
      // service-role caller bypasses the agent-assignment gate by design).
      const { data: chatId, error: rpcErr } = await admin.rpc("post_agent_chat_message", {
        p_session_id: chatSessionId,
        p_message: replyBody,
      });
      if (!rpcErr && chatId) {
        sent = true;
        chatMessageIdOut = String(chatId);
        eventAction = action;
        await insertMessage(admin, {
          conversation_id: convo.id,
          direction: "outbound",
          channel: "chat",
          body: replyBody,
          source: "ai",
          sent_at: new Date().toISOString(),
          provider_message_id: `chat:${chatMessageIdOut}`,
          metadata: {
            auto_sent: action === "auto_sent",
            sent_to_chat: true,
            response_mode: responseMode,
            source: "ai_support_chat_auto_reply",
          },
        });
        await admin
          .from("ai_support_conversations")
          .update({ last_ai_reply_at: new Date().toISOString() })
          .eq("id", convo.id);
      } else {
        // Send failed: preserve the draft, record the error, no blind retry.
        sendError = rpcErr?.message ?? "post_agent_chat_message returned no id";
        eventAction = "error";
      }
    }

    const decisionReason = noReplyReason ? noReplyText[noReplyReason] : modeReason[responseMode];

    await insertEvent(admin, {
      conversation_id: convo.id,
      message_id: inboundMsgId,
      intent: category,
      risk_level: finalCls.risk_level,
      action: eventAction,
      confidence: draft?.confidence ?? null,
      guardrail_code: finalCls.guardrail_code ?? draft?.error ?? null,
      model: draft?.model ?? null,
      prompt_tokens: draft?.prompt_tokens ?? null,
      completion_tokens: draft?.completion_tokens ?? null,
      cost_usd: draft?.cost_usd ?? null,
      reply_body: replyBody,
      error: sendError,
      metadata: {
        channel: "chat",
        chat_reply_mode: chatMode,
        chat_response_mode: responseMode,
        order_lookup: orderStatus ? { category: orderStatus.category, found: orderStatus.found } : null,
        reply_sent_to_chat: sent,
        no_reply_reason: noReplyReason,
        decided_action: eventAction,
        decision_reason: decisionReason,
        // Back-compat keys the Command Center / presentation already read.
        chat_auto_gate: noReplyReason ?? (sent ? "always_answer_sent" : "not_sent"),
        chat_auto_gate_pass: sent,
        sent_to_chat: sent,
        chat_message_id: chatMessageIdOut,
        source: sent ? "ai_support_chat_auto_reply" : null,
        auto_replies_today: autoRepliesToday,
        model_reason: draft?.reason ?? null,
        matched: finalCls.matched,
        page_url: pageUrl,
        price_objection: priceObjection,
        discount_offered: discountOffered,
        discount_code: discountOffered ? "PAW20" : null,
      },
    });

    // Actionable notifications = things a human must still handle. A normal or
    // clarifying answer the AI already sent is informational (not counted).
    const notifType =
      responseMode === "crisis" ? "human_takeover_needed"
      : eventAction === "error" ? "send_error"
      : blockInternally ? "blocked"
      : escalateInternally ? "escalated"
      : noReplyReason ? "draft_pending"
      : "auto_sent";
    await insertNotification(admin, {
      conversation_id: convo.id,
      type: notifType,
      channel: "dashboard",
      status: "pending",
      payload: {
        category,
        action: eventAction,
        response_mode: responseMode,
        channel: "chat",
        price_objection: priceObjection,
        discount_offered: discountOffered,
        preview: inboundText.slice(0, 160),
      },
    });

    // ── Runtime GHL sync (fail-soft; email-matched contacts only for chat) ───
    let ghlSync: GhlSyncResult | null = null;
    try {
      ghlSync = await syncAiSupportStateToGhl("", null, {
        status: notifType,
        channel: "chat",
        intent: category,
        riskLevel: finalCls.risk_level,
        action: eventAction,
        escalationReason:
          (escalateInternally || blockInternally) ? decisionReason : "",
        autoReplyEligible: noReplyReason ? "no" : "yes",
        reviewedAtIso: new Date().toISOString(),
        dndBlocked: false,
        isWhitelisted: false,
        category,
      }, visitorEmail);
      if (ghlSync.ok) {
        console.log(`[ghl-sync] chat ok contact=${ghlSync.contactId} fields=${ghlSync.fieldsUpdated} tags+${JSON.stringify(ghlSync.tagsAdded)} tags-${JSON.stringify(ghlSync.tagsRemoved)}`);
      } else {
        console.log(`[ghl-sync] chat not applied: ${ghlSync.skipped ?? ghlSync.error ?? "unknown"}`);
      }
    } catch (e) {
      console.error("[ghl-sync] chat unexpected:", e instanceof Error ? e.message : "unknown");
    }

    return json({
      ok: true,
      always_answer: true,
      response_mode: responseMode,
      no_reply_reason: noReplyReason,
      conversation_id: convo.id,
      message_id: inboundMsgId,
      classification: {
        category,
        risk_level: finalCls.risk_level,
        guardrail_code: finalCls.guardrail_code,
        hard_blocked: cls.hard_blocked,
      },
      decision: { action: eventAction, reason: decisionReason },
      reply_draft: replyBody,
      confidence: draft?.confidence ?? null,
      model: draft?.model ?? null,
      model_error: draft?.error ?? null,
      sent,
      send_error: sendError,
      chat_message_id: chatMessageIdOut,
      notification: notifType,
      ghl_sync: ghlSync
        ? { ok: ghlSync.ok, skipped: ghlSync.skipped, contact_id: ghlSync.contactId, fields_updated: ghlSync.fieldsUpdated }
        : null,
    });
  } catch (e) {
    console.error("[ai-handle-inbound-chat] unhandled error:", e instanceof Error ? e.message : "unknown");
    return json({ ok: false, error: "Internal error" }, 500);
  }
});
