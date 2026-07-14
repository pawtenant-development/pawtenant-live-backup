/**
 * useAdminOpsNotifier — foreground browser notifications for the two
 * operational events the 2026-07-07 audit found fully dark at OS level:
 *
 *   1. MISSED CALLS — communications rows with type=call_inbound whose
 *      status is/becomes missed (missed / no_answer / busy…). The status
 *      usually arrives via UPDATE after the ring, so both INSERT and
 *      UPDATE are handled.
 *   2. NEW CONTACT-FORM EMAILS — contact_submissions INSERTs (previously
 *      poll-only with an in-tab sound; nothing OS-level).
 *
 * Same consent contract as useAiSupportEventNotifier: fires ONLY when the
 * admin enabled Browser Notifications (soundPrefs) AND permission is
 * granted — desktopNotify.notify() no-ops otherwise. Deduped by row id,
 * OS-coalesced by tag. Foreground-only (no service worker — Stage 4).
 *
 * In-app badges are untouched: the comms badge, bell RPC groups, and the
 * contact sidebar poll keep working exactly as before.
 */

import { useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { notify } from "../lib/desktopNotify";
import { getSoundPrefs } from "../lib/soundPrefs";

const MISSED_STATUSES = new Set(["missed", "no_answer", "no-answer", "busy", "no answer"]);
const MAX_SEEN = 300;

interface CommRow {
  id: string;
  type: string | null;
  status: string | null;
  phone_from: string | null;
}
interface ContactRow {
  id: string;
  name: string | null;
  email: string | null;
  message: string | null;
}

export function useAdminOpsNotifier(enabled: boolean): void {
  const seenMissedRef = useRef<Set<string>>(new Set());
  const seenEmailRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const remember = (set: Set<string>, id: string): boolean => {
      if (set.has(id)) return false;
      set.add(id);
      if (set.size > MAX_SEEN) {
        const keep = [...set].slice(-Math.floor(MAX_SEEN / 2));
        set.clear();
        for (const k of keep) set.add(k);
      }
      return true;
    };

    const onMissedCandidate = (row: CommRow) => {
      if (row?.type !== "call_inbound") return;
      if (!MISSED_STATUSES.has((row.status ?? "").toLowerCase())) return;
      if (!remember(seenMissedRef.current, row.id)) return;
      if (!getSoundPrefs().desktopNotificationsEnabled) return;
      notify("Missed call", {
        body: `${row.phone_from ?? "Unknown number"} — call back or text from SMS / Calls`,
        tag: `pt-missed-call-${row.id}`,
      });
    };

    const onNewEmail = (row: ContactRow) => {
      if (!row?.id || !remember(seenEmailRef.current, row.id)) return;
      if (!getSoundPrefs().desktopNotificationsEnabled) return;
      const who = row.name || row.email || "Unknown sender";
      notify("New email needs review", {
        body: `${who} · ${(row.message ?? "").slice(0, 120)}`,
        tag: `pt-email-${row.id}`,
      });
    };

    // RLS-through-realtime races the session restore at boot: a channel
    // joined before auth resolves is authorized as anon and silently never
    // receives rows from admin-gated tables (communications). Wait for the
    // session, pin it on the realtime connection, THEN subscribe.
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.access_token) {
          supabase.realtime.setAuth(data.session.access_token);
        }
      } catch {
        /* subscribe anyway — public tables still deliver */
      }
      if (cancelled) return;
      channel = supabase
        .channel("pt-admin-ops-notifications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "communications", filter: "type=eq.call_inbound" },
          (payload) => onMissedCandidate(payload.new as CommRow),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "communications", filter: "type=eq.call_inbound" },
          (payload) => onMissedCandidate(payload.new as CommRow),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "contact_submissions" },
          (payload) => onNewEmail(payload.new as ContactRow),
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
