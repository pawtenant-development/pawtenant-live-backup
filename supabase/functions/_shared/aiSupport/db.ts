// db.ts — shared Deno-side helpers for the AI Support Automation edge functions.
//
// All writes go through the service-role client (RLS admin-only on these
// tables). Callers must authorize FIRST via authorizeRequest().

import { DEFAULT_SETTINGS, type AiSupportSettings } from "./policy.ts";

// Loose client type — avoids coupling to a specific supabase-js version.
// deno-lint-ignore no-explicit-any
export type SbClient = any;

export interface AuthResult {
  kind: "admin" | "internal";
  userId: string | null;
}

/**
 * Authorize a request into the AI support pipeline.
 *   1. Bearer <service-role-key>            → internal (function-to-function)
 *   2. Bearer <admin user JWT>              → admin (doctor_profiles is_admin+is_active)
 *   3. x-ai-support-secret matching env     → internal (future provider webhook
 *      forwarding; disabled unless AI_SUPPORT_WEBHOOK_SECRET is set)
 * Returns null when none match.
 */
export async function authorizeRequest(
  req: Request,
  admin: SbClient,
  serviceRoleKey: string,
): Promise<AuthResult | null> {
  const webhookSecret = Deno.env.get("AI_SUPPORT_WEBHOOK_SECRET") ?? "";
  const headerSecret = req.headers.get("x-ai-support-secret") ?? "";
  if (webhookSecret && headerSecret && headerSecret === webhookSecret) {
    return { kind: "internal", userId: null };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  if (token === serviceRoleKey) return { kind: "internal", userId: null };

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return null;
  const { data: profile } = await admin
    .from("doctor_profiles")
    .select("is_admin, is_active")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!(profile?.is_admin && profile?.is_active)) return null;
  return { kind: "admin", userId: userData.user.id };
}

/** Load ai_support_settings rows merged over safe defaults. */
export async function loadSettings(admin: SbClient): Promise<AiSupportSettings> {
  const merged: AiSupportSettings = {
    ...DEFAULT_SETTINGS,
    ai_category_modes: { ...DEFAULT_SETTINGS.ai_category_modes },
  };
  try {
    const { data: rows } = await admin.from("ai_support_settings").select("key, value");
    for (const row of rows ?? []) {
      const k = row.key as keyof AiSupportSettings;
      if (k === "ai_category_modes" && row.value && typeof row.value === "object") {
        merged.ai_category_modes = { ...merged.ai_category_modes, ...row.value };
      } else if (k in merged) {
        // deno-lint-ignore no-explicit-any
        (merged as any)[k] = row.value;
      }
    }
  } catch (_e) {
    // Fail safe: defaults keep auto-send OFF.
    console.error("[aiSupport] settings load failed — using safe defaults");
  }
  return merged;
}

export function normalizePhone(raw: string): string {
  let phone = (raw || "").replace(/\D/g, "");
  if (phone.length === 10) phone = "1" + phone;
  return phone ? "+" + phone : "";
}

export interface ConversationRow {
  id: string;
  ai_enabled: boolean;
  ai_mode: string;
  status: string;
  order_id: string | null;
  last_ai_reply_at: string | null;
  human_owner_id: string | null;
}

/** Find the open conversation for a phone, or create one (default mode from settings). */
export async function getOrCreateSmsConversation(
  admin: SbClient,
  phone: string,
  settings: AiSupportSettings,
): Promise<ConversationRow> {
  const { data: existing } = await admin
    .from("ai_support_conversations")
    .select("id, ai_enabled, ai_mode, status, order_id, last_ai_reply_at, human_owner_id")
    .eq("customer_phone", phone)
    .eq("channel", "sms")
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as ConversationRow;

  const defaultMode =
    settings.ai_sms_default_mode === "auto_send_safe" ? "auto_send_safe" : "draft_only";
  const { data: created, error } = await admin
    .from("ai_support_conversations")
    .insert({ channel: "sms", customer_phone: phone, ai_mode: defaultMode })
    .select("id, ai_enabled, ai_mode, status, order_id, last_ai_reply_at, human_owner_id")
    .single();
  if (error) throw new Error(`conversation insert failed: ${error.message}`);
  return created as ConversationRow;
}

/**
 * Find the open live-chat conversation for a website chat session, or create
 * one. Chat visitors have no phone number, so conversations are keyed by
 * external_session_id (= chat_sessions.id). Phase 1 chat is SHADOW-ONLY:
 * every chat conversation starts (and stays) draft_only regardless of the
 * SMS default-mode setting.
 */
export async function getOrCreateChatConversation(
  admin: SbClient,
  chatSessionId: string,
  visitorEmail?: string | null,
  visitorName?: string | null,
): Promise<ConversationRow> {
  const { data: existing } = await admin
    .from("ai_support_conversations")
    .select("id, ai_enabled, ai_mode, status, order_id, last_ai_reply_at, human_owner_id")
    .eq("external_session_id", chatSessionId)
    .eq("channel", "chat")
    .neq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) return existing as ConversationRow;

  const { data: created, error } = await admin
    .from("ai_support_conversations")
    .insert({
      channel: "chat",
      external_session_id: chatSessionId,
      customer_email: visitorEmail ?? null,
      customer_name: visitorName ?? null,
      ai_mode: "draft_only",
    })
    .select("id, ai_enabled, ai_mode, status, order_id, last_ai_reply_at, human_owner_id")
    .single();
  if (error) throw new Error(`chat conversation insert failed: ${error.message}`);
  return created as ConversationRow;
}

/** Best-effort order linking via the existing admin RPC — never fatal. */
export async function tryLinkOrder(
  admin: SbClient,
  conversationId: string,
  phone: string,
): Promise<void> {
  try {
    const { data } = await admin.rpc("admin_find_order_for_contact", {
      p_email: null,
      p_phone: phone,
      p_session_id: null,
      p_confirmation_id: null,
    });
    const row = Array.isArray(data) ? data[0] : data;
    const orderId = row?.order_id ?? row?.id ?? null;
    const confirmationId = row?.confirmation_id ?? null;
    if (orderId || confirmationId) {
      await admin
        .from("ai_support_conversations")
        .update({ order_id: String(confirmationId ?? orderId) })
        .eq("id", conversationId)
        .is("order_id", null);
    }
  } catch (_e) {
    /* non-fatal */
  }
}

/**
 * True if PAW20 was already offered (sent or human-approved) in this
 * conversation — the discount is offered at most once per conversation.
 * Fails CLOSED: a read error reports "already offered" so a repeat can
 * never auto-send.
 */
export async function paw20AlreadyOffered(
  admin: SbClient,
  conversationId: string,
): Promise<boolean> {
  try {
    const { data } = await admin
      .from("ai_support_messages")
      .select("id")
      .eq("conversation_id", conversationId)
      .eq("direction", "outbound")
      .ilike("body", "%PAW20%")
      .limit(1)
      .maybeSingle();
    return !!data;
  } catch (_e) {
    return true;
  }
}

export async function countAutoRepliesToday(
  admin: SbClient,
  conversationId: string,
): Promise<number> {
  try {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("ai_support_ai_events")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("action", "auto_sent")
      .gte("created_at", dayStart.toISOString());
    return count ?? 0;
  } catch (_e) {
    // Fail safe: pretend the cap is hit so we never over-send on a read error.
    return Number.MAX_SAFE_INTEGER;
  }
}

export async function insertMessage(
  admin: SbClient,
  row: Record<string, unknown>,
): Promise<string | null> {
  const { data, error } = await admin
    .from("ai_support_messages")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    console.error("[aiSupport] message insert failed:", error.message);
    return null;
  }
  return data?.id ?? null;
}

export async function insertEvent(
  admin: SbClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("ai_support_ai_events").insert(row);
  if (error) console.error("[aiSupport] event insert failed:", error.message);
}

export async function insertNotification(
  admin: SbClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin.from("ai_support_notifications").insert(row);
  if (error) console.error("[aiSupport] notification insert failed:", error.message);
}

/** Send a real SMS through the existing ghl-send-sms function (it logs to communications). */
export async function sendViaGhl(
  supabaseUrl: string,
  serviceRoleKey: string,
  toPhone: string,
  message: string,
  sentBy: string,
  orderId?: string | null,
): Promise<{ ok: boolean; error?: string; messageId?: string | null }> {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ghl-send-sms`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        toPhone,
        message,
        sentBy,
        confirmationId: orderId ?? undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok === false) {
      return { ok: false, error: String(data?.error ?? `ghl-send-sms HTTP ${res.status}`) };
    }
    return { ok: true, messageId: data?.messageId ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "ghl-send-sms unreachable" };
  }
}
