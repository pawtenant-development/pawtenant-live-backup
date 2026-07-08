// useAiSupportPendingCount — count of pending AI Support notifications that
// need a human (badge on Communications → AI Support sub-tab).
//
// "Actionable" = the AI produced something a person must look at. Rows of
// type auto_sent / blocked / missed_call also sit in ai_support_notifications
// (rows are never deleted) but are informational, so they are neither counted
// here nor auto-marked read by the panel.
//
// Cross-component refresh: AiSupportCenterPanel calls
// notifyAiSupportNotificationsChanged() after marking a conversation's rows
// read, so the hub badge updates immediately without prop drilling or a
// context provider. A slow poll keeps the badge honest while the tab is idle.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export const AI_ACTIONABLE_NOTIFICATION_TYPES = [
  "draft_pending",
  "escalated",
  "dnd_blocked",
  "human_takeover_needed",
  "send_error",
  "low_confidence",
] as const;

const CHANGE_EVENT = "pt-ai-support-notifications-changed";
const POLL_MS = 60_000;

export function notifyAiSupportNotificationsChanged(): void {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAiSupportPendingCount(): { count: number; refresh: () => void } {
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const { count: c, error } = await supabase
          .from("ai_support_notifications")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
          .in("type", [...AI_ACTIONABLE_NOTIFICATION_TYPES]);
        if (!error) setCount(c ?? 0);
      } catch {
        /* keep last known count — badge self-corrects on the next poll */
      }
    })();
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, POLL_MS);
    window.addEventListener(CHANGE_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(CHANGE_EVENT, refresh);
    };
  }, [refresh]);

  return { count, refresh };
}
