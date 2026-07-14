/**
 * useAiSupportEventNotifier — foreground browser notifications for AI
 * Support events (TEST admin notification foundation, Phase 1).
 *
 * Mounted once inside AdminChatProvider (App.tsx level) so it runs on every
 * admin page. Listens for new ai_support_notifications rows via Supabase
 * realtime (publication added 2026-07-07) with a slow poll fallback, and:
 *   1. refreshes the Communications → AI Support badge immediately
 *      (notifyAiSupportNotificationsChanged), and
 *   2. fires an OS-level browser notification for ACTIONABLE types only.
 *
 * Consent contract (matches desktopNotify):
 *   - Fires ONLY when the admin enabled "Desktop notifications" in the
 *     sound controls (soundPrefs.desktopNotificationsEnabled) AND browser
 *     permission is granted. Denied/default permission → hard no-op.
 *   - auto_sent / informational rows never produce a browser notification
 *     (they are visible as markers + feed entries instead).
 *
 * Foreground-only by design: no service worker, no push server — when the
 * admin tab is closed nothing fires (documented limitation, see report).
 */

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { notify } from "../lib/desktopNotify";
import { getSoundPrefs } from "../lib/soundPrefs";
import { notifyAiSupportNotificationsChanged } from "./useAiSupportPendingCount";

interface AiNotificationRow {
  id: string;
  conversation_id: string | null;
  type: string;
  status: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

/** type → browser notification title. Absent types never notify. */
const NOTIFY_TITLES: Record<string, string> = {
  draft_pending: "AI drafted a reply — review needed",
  low_confidence: "AI low-confidence draft — review needed",
  escalated: "AI escalated a conversation",
  human_takeover_needed: "Urgent: human takeover needed",
  blocked: "AI blocked a risky message",
  send_error: "AI reply failed to send",
  dnd_blocked: "Reply held — DND / opt-out",
};

const POLL_FALLBACK_MS = 45_000;
const MAX_SEEN_IDS = 500;

function payloadLine(row: AiNotificationRow): string {
  const p = row.payload ?? {};
  // Chat rows carry payload.channel; the SMS pipeline omits it but always
  // includes the sender phone — infer the label so SMS toasts read "SMS · …".
  const channel =
    typeof p.channel === "string" && p.channel
      ? p.channel
      : typeof p.phone === "string" && p.phone
        ? "sms"
        : "";
  const category = typeof p.category === "string" ? p.category.replace(/_/g, " ") : "";
  const preview = typeof p.preview === "string" ? p.preview : "";
  const parts = [channel && channel.toUpperCase(), category, preview].filter(Boolean);
  return parts.join(" · ").slice(0, 180) || "Open Communications → AI Support";
}

export function useAiSupportEventNotifier(enabled: boolean): void {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string>(new Date().toISOString());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleRow = (row: AiNotificationRow) => {
      if (!row?.id || seenIdsRef.current.has(row.id)) return;
      seenIdsRef.current.add(row.id);
      if (seenIdsRef.current.size > MAX_SEEN_IDS) {
        // Drop the oldest half — exact ordering doesn't matter, only dedupe.
        seenIdsRef.current = new Set([...seenIdsRef.current].slice(-Math.floor(MAX_SEEN_IDS / 2)));
      }
      if (row.created_at > sinceRef.current) sinceRef.current = row.created_at;

      // Badge refresh is unconditional — the in-app count must stay honest
      // even when browser notifications are off.
      notifyAiSupportNotificationsChanged();

      const title = NOTIFY_TITLES[row.type];
      if (!title) return; // informational (auto_sent etc.) — no OS toast
      if (!getSoundPrefs().desktopNotificationsEnabled) return; // admin opt-in
      // notify() no-ops unless browser permission is granted.
      notify(title, {
        body: payloadLine(row),
        tag: `pt-ai-${row.conversation_id ?? row.id}`,
      });
    };

    // Subscribe only after the auth session is ready — a channel joined
    // before session restore is authorized as anon and never receives rows
    // from this admin-gated table (the 45s poll below was masking that).
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.access_token) {
          supabase.realtime.setAuth(data.session.access_token);
        }
      } catch {
        /* poll fallback still covers us */
      }
      if (cancelled) return;
      channel = supabase
        .channel("pt-ai-support-notifications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "ai_support_notifications" },
          (payload) => {
            handleRow(payload.new as AiNotificationRow);
          },
        )
        .subscribe();
    })();

    // Poll fallback — catches rows missed while realtime reconnects. Only
    // rows created after mount (sinceRef) so historical backlog never spams.
    const timer = window.setInterval(() => {
      if (!mountedRef.current) return;
      void (async () => {
        try {
          const { data } = await supabase
            .from("ai_support_notifications")
            .select("id, conversation_id, type, status, payload, created_at")
            .gt("created_at", sinceRef.current)
            .order("created_at", { ascending: true })
            .limit(50);
          for (const row of (data ?? []) as AiNotificationRow[]) handleRow(row);
        } catch {
          /* silent — next poll self-corrects */
        }
      })();
    }, POLL_FALLBACK_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
