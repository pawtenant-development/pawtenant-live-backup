import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type SenderType = "visitor" | "agent" | "system";

interface ChatPayload {
  email?: string | null;
  name?: string | null;
  message?: string;
  provider?: string | null;
  provider_session_id?: string | null;
  provider_message_id?: string | null;
  external_metadata?: Record<string, unknown> | null;
  sender?: SenderType;
}

const MAX_MESSAGE_LENGTH  = 2000;
const MAX_NAME_LENGTH     = 200;
const MAX_EMAIL_LENGTH    = 320;
const MAX_PROVIDER_LENGTH = 64;
const MAX_EXT_ID_LENGTH   = 256;
const MAX_META_BYTES      = 8 * 1024;
// Caps for context strings merged into the session row — tight enough to
// protect the DB from pathological payloads, loose enough to keep useful
// UA / URL content for filter + analytics.
const MAX_UA_LENGTH       = 512;
const MAX_URL_LENGTH      = 2048;
const ALLOWED_SENDERS: SenderType[] = ["visitor", "agent", "system"];

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function trimOrNull(v: unknown, max: number): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Extract a safe geo blob from a metadata payload. Whitelist-only so no
 * stray large fields leak into the session row.
 */
function extractGeo(
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;
  const g = (meta as Record<string, unknown>).geo;
  if (!g || typeof g !== "object" || Array.isArray(g)) return null;
  const src = g as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const strFields = [
    "country",
    "country_code",
    "region",
    "region_code",
    "city",
    "timezone",
    "ip",
    "source",
    "fetched_at",
  ];
  for (const k of strFields) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) {
      out[k] = v.length > 128 ? v.slice(0, 128) : v;
    }
  }
  if (typeof src.latitude === "number" && isFinite(src.latitude)) {
    out.latitude = src.latitude;
  }
  if (typeof src.longitude === "number" && isFinite(src.longitude)) {
    out.longitude = src.longitude;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Extract a safe attribution blob from a metadata payload. Whitelist-only.
 * Mirrors the client-side getAttribution() shape so chat_sessions can be
 * joined to leads/orders on channel/gclid/fbclid/utm_*.
 */
function extractAttribution(
  meta: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!meta || typeof meta !== "object") return null;
  const a = (meta as Record<string, unknown>).attribution;
  if (!a || typeof a !== "object" || Array.isArray(a)) return null;
  const src = a as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const strFields = [
    "channel",
    "gclid",
    "fbclid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "landing_url",
    "referrer",
    "session_id",
    "first_seen_at",
  ];
  for (const k of strFields) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) {
      out[k] = v.length > 2048 ? v.slice(0, 2048) : v;
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Extract the visitor's device/context strings (user_agent, page_url,
 * referrer). These are top-level primitives on external_metadata so the
 * admin UI can filter by device (UA-based) and show the first page the
 * visitor was on without unpacking a nested blob.
 */
function extractContext(
  meta: Record<string, unknown> | null | undefined,
): { user_agent: string | null; page_url: string | null; referrer: string | null } {
  const empty = { user_agent: null, page_url: null, referrer: null };
  if (!meta || typeof meta !== "object") return empty;
  const src = meta as Record<string, unknown>;
  const ua = trimOrNull(src.user_agent, MAX_UA_LENGTH);
  const pageUrl = trimOrNull(src.page_url, MAX_URL_LENGTH);
  const referrer = trimOrNull(src.referrer, MAX_URL_LENGTH);
  return { user_agent: ua, page_url: pageUrl, referrer };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }

  let payload: ChatPayload;
  try {
    payload = (await req.json()) as ChatPayload;
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body" });
  }

  const message = (payload.message ?? "").toString().trim();
  if (!message) {
    return json(400, { ok: false, error: "Message is required" });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return json(413, {
      ok: false,
      error: `Message exceeds ${MAX_MESSAGE_LENGTH} characters`,
    });
  }

  const email               = trimOrNull(payload.email, MAX_EMAIL_LENGTH);
  const name                = trimOrNull(payload.name, MAX_NAME_LENGTH);
  const provider            = trimOrNull(payload.provider, MAX_PROVIDER_LENGTH);
  const provider_session_id = trimOrNull(payload.provider_session_id, MAX_EXT_ID_LENGTH);
  const provider_message_id = trimOrNull(payload.provider_message_id, MAX_EXT_ID_LENGTH);

  let sender: SenderType = "visitor";
  if (payload.sender && ALLOWED_SENDERS.includes(payload.sender)) {
    sender = payload.sender;
  }

  // Provider-agnostic metadata. Capped to protect the DB from huge payloads.
  let metadata: Record<string, unknown> = {};
  if (
    payload.external_metadata &&
    typeof payload.external_metadata === "object" &&
    !Array.isArray(payload.external_metadata)
  ) {
    try {
      const asJson = JSON.stringify(payload.external_metadata);
      if (asJson.length <= MAX_META_BYTES) {
        metadata = JSON.parse(asJson) as Record<string, unknown>;
      }
    } catch {
      metadata = {};
    }
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return json(500, { ok: false, error: "Server not configured" });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // 1. Match or create a provider-agnostic session.
  const { data: sessionId, error: matchErr } = await supabase.rpc(
    "match_or_create_chat_session",
    {
      p_provider: provider,
      p_provider_session_id: provider_session_id,
      p_email: email,
      p_name: name,
      p_window_minutes: 30,
    },
  );
  if (matchErr || !sessionId) {
    return json(500, {
      ok: false,
      error: matchErr?.message ?? "Session match failed",
    });
  }

  // 2. Atomically insert the message and update session counters.
  const { data: chatId, error: recordErr } = await supabase.rpc(
    "record_chat_message",
    {
      p_session_id: sessionId,
      p_message: message,
      p_sender: sender,
      p_provider: provider,
      p_provider_message_id: provider_message_id,
      p_metadata: metadata,
      p_email: email,
      p_name: name,
    },
  );
  if (recordErr || !chatId) {
    return json(500, {
      ok: false,
      error: recordErr?.message ?? "Message record failed",
    });
  }

  // 3. Best-effort: merge visitor geo + attribution + context into
  //    session.external_metadata. Non-blocking — if this fails the message is
  //    already saved. Only runs for visitor messages (agent/system replies
  //    don't have visitor context).
  if (sender === "visitor") {
    const geo = extractGeo(metadata);
    const attribution = extractAttribution(metadata);
    const context = extractContext(metadata);
    const hasCtx = !!(context.user_agent || context.page_url || context.referrer);

    if (geo || attribution || hasCtx) {
      try {
        const { data: existing } = await supabase
          .from("chat_sessions")
          .select("external_metadata")
          .eq("id", sessionId)
          .maybeSingle();
        const prev =
          existing && typeof existing.external_metadata === "object" && existing.external_metadata
            ? (existing.external_metadata as Record<string, unknown>)
            : {};
        const merged: Record<string, unknown> = { ...prev };

        if (geo) {
          const prevGeo =
            prev.geo && typeof prev.geo === "object" && !Array.isArray(prev.geo)
              ? (prev.geo as Record<string, unknown>)
              : {};
          // Earliest-wins: keep original geo fields, fill gaps from newer payload.
          merged.geo = { ...geo, ...prevGeo };
        }

        if (attribution) {
          const prevAttr =
            prev.attribution && typeof prev.attribution === "object" && !Array.isArray(prev.attribution)
              ? (prev.attribution as Record<string, unknown>)
              : {};
          // Earliest-wins: keep original attribution fields, fill gaps from newer payload.
          merged.attribution = { ...attribution, ...prevAttr };
        }

        // Earliest-wins for context strings too — the FIRST message's UA /
        // referrer / page_url is the most faithful attribution signal. Later
        // messages may come from a different page in the same session.
        if (context.user_agent && typeof prev.user_agent !== "string") {
          merged.user_agent = context.user_agent;
        }
        if (context.page_url && typeof prev.page_url !== "string") {
          merged.page_url = context.page_url;
        }
        if (context.referrer && typeof prev.referrer !== "string") {
          merged.referrer = context.referrer;
        }

        await supabase
          .from("chat_sessions")
          .update({ external_metadata: merged })
          .eq("id", sessionId);
      } catch {
        // Intentionally ignored — best-effort, must never fail capture.
      }
    }
  }

  return json(200, {
    ok: true,
    id: chatId,
    session_id: sessionId,
  });
});
