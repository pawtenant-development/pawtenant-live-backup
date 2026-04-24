/**
 * Fire-and-forget helper that sends a chat message to the
 * `capture-chat` Supabase edge function.
 *
 * Provider-agnostic: PawTenant is the system of record. Tawk (and any future
 * provider) only contributes metadata via `provider` + `provider_session_id`
 * + `external_metadata`. Missing provider fields never block capture — the
 * edge function falls back to email/time-window session matching.
 *
 * Non-blocking: never throws, never rejects. Safe to call from any UI
 * event handler. If the network or function is down, the UI must continue
 * to work normally.
 */

import { getAttribution, buildChannel } from "./attributionStore";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as
  | string
  | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as
  | string
  | undefined;

export type ChatSender = "visitor" | "agent" | "system";

export interface ChatMessageInput {
  email?: string | null;
  name?: string | null;
  message: string;
  provider?: string | null;
  provider_session_id?: string | null;
  provider_message_id?: string | null;
  external_metadata?: Record<string, unknown> | null;
  sender?: ChatSender;
}

function readCachedGeo(): Record<string, unknown> | null {
  try {
    if (typeof sessionStorage === "undefined") return null;

    // Preferred: full geo blob populated by a richer lookup.
    const raw = sessionStorage.getItem("pt_geo");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    }

    // Fallback: useGeoBlock already caches a bare country code under
    // "geo_country". Promote it to a minimal geo blob so the admin Chats
    // tab's location filter has something to show when the richer lookup
    // is unavailable. Fails gracefully if the key is missing.
    const country = sessionStorage.getItem("geo_country");
    if (country && country.trim()) {
      return {
        country: country.trim(),
        country_code: country.trim(),
        source: "useGeoBlock",
      };
    }
    return null;
  } catch {
    return null;
  }
}

function buildDefaultMetadata(): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  try {
    if (typeof window !== "undefined") {
      meta.page_url = window.location.href;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof navigator !== "undefined" && navigator.userAgent) {
      meta.user_agent = navigator.userAgent;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof document !== "undefined" && document.referrer) {
      meta.referrer = document.referrer;
    }
  } catch {
    // ignore
  }
  try {
    const geo = readCachedGeo();
    if (geo) meta.geo = geo;
  } catch {
    // ignore
  }
  try {
    const a = getAttribution();
    meta.attribution = {
      channel:       buildChannel(),
      gclid:         a.gclid ?? null,
      fbclid:        a.fbclid ?? null,
      utm_source:    a.utm_source ?? null,
      utm_medium:    a.utm_medium ?? null,
      utm_campaign:  a.utm_campaign ?? null,
      utm_term:      a.utm_term ?? null,
      utm_content:   a.utm_content ?? null,
      ref:           a.ref ?? null,
      landing_url:   a.landing_url ?? null,
      referrer:      a.referrer ?? null,
      session_id:    a.session_id,
      first_seen_at: a.first_seen_at ?? null,
    };
  } catch {
    // ignore — never break chat send
  }
  return meta;
}

export function sendChatMessage(input: ChatMessageInput): void {
  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return;
    }

    const message = (input?.message ?? "").toString().trim();
    if (!message) {
      return;
    }

    const defaultMeta = buildDefaultMetadata();
    const merged = {
      ...defaultMeta,
      ...(input.external_metadata ?? {}),
    };

    const body = JSON.stringify({
      email: input.email ?? null,
      name: input.name ?? null,
      message,
      provider: input.provider ?? null,
      provider_session_id: input.provider_session_id ?? null,
      provider_message_id: input.provider_message_id ?? null,
      external_metadata: merged,
      sender: input.sender ?? "visitor",
    });

    // Fire-and-forget. Explicitly swallow all errors.
    void fetch(`${SUPABASE_URL}/functions/v1/capture-chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body,
      keepalive: true,
    }).catch(() => {
      // Intentionally ignored — must never break the UI.
    });
  } catch {
    // Intentionally ignored — must never break the UI.
  }
}
