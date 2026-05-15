/**
 * VisitorContextPanel — Phase 2D
 *
 * Compact, read-only visitor context surfaced inside the existing ChatsTab
 * detail panel. Calls the admin-only RPCs added in Phase 2A:
 *   - get_chat_pre_chat_context(chat_session_id)
 *   - get_visitor_journey(visitor_session_id, limit)
 *
 * Behavior contract:
 *   - Loads on mount and on chatSessionId change. No polling, no realtime.
 *   - If the chat has no linked visitor_session_id (legacy or pruned),
 *     renders a graceful "Visitor journey unavailable for this chat."
 *     line. Never throws, never blocks the conversation panel.
 *   - On error, renders a compact error line and lets the rest of the
 *     chat detail panel keep working.
 *
 * Out of scope for Phase 2D (deliberately not implemented here):
 *   - sounds / notifications
 *   - realtime subscriptions
 *   - in-place navigation to the Live Visitors page
 *   - visitor action buttons
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface PreChatContext {
  chat_session_id: string;
  chat_status: string | null;
  chat_created_at: string;
  chat_visitor_name: string | null;
  chat_visitor_email: string | null;
  chat_matched_order_id: string | null;

  visitor_session_id: string | null;
  visitor_channel: string | null;
  visitor_utm_source: string | null;
  visitor_utm_medium: string | null;
  visitor_utm_campaign: string | null;
  visitor_gclid: string | null;
  visitor_fbclid: string | null;
  visitor_ref: string | null;
  visitor_landing_url: string | null;
  visitor_referrer: string | null;
  visitor_device: string | null;
  visitor_geo: { country?: string } | null;
  visitor_current_page: string | null;
  visitor_page_count: number;
  visitor_first_seen_at: string | null;
  visitor_last_seen_at: string | null;
  assessment_started_at: string | null;
  paid_at: string | null;

  pre_chat_event_count: number;
}

interface JourneyEvent {
  event_id: string;
  session_id: string | null;
  event_name: string;
  page_url: string | null;
  props: Record<string, unknown> | null;
  created_at: string;
}

const RECENT_EVENT_LIMIT = 6;

// ── Display helpers ─────────────────────────────────────────────────────

function channelLabel(ctx: PreChatContext): string {
  if (ctx.visitor_gclid)  return "Google Ads";
  if (ctx.visitor_fbclid) return "Facebook / Meta";
  switch (ctx.visitor_channel) {
    case "google_ads":     return "Google Ads";
    case "facebook_ads":   return "Facebook / Meta";
    case "organic_search": return "Organic Search";
    case "social_organic": return "Social Organic";
    case "direct":         return "Direct";
  }
  if (ctx.visitor_utm_source) return ctx.visitor_utm_source;
  return "Direct / Unknown";
}

function pathOnly(url: string | null): string {
  if (!url) return "—";
  if (url.startsWith("/")) return url.length > 80 ? url.slice(0, 80) + "…" : url;
  try {
    const u = new URL(url);
    const out = u.pathname + (u.search ? u.search : "");
    return out.length > 80 ? out.slice(0, 80) + "…" : out;
  } catch {
    return url.length > 80 ? url.slice(0, 80) + "…" : url;
  }
}

function durationLabel(firstIso: string | null, lastIso: string | null): string {
  if (!firstIso || !lastIso) return "—";
  const a = new Date(firstIso).getTime();
  const b = new Date(lastIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  const secs = Math.max(0, Math.floor((b - a) / 1000));
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60)    return `${secs}s ago`;
  if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

function eventIcon(name: string): string {
  switch (name) {
    case "page_view":            return "ri-file-list-3-line";
    case "cta_click":            return "ri-cursor-line";
    case "assessment_started":
    case "assessment_step_view": return "ri-edit-line";
    case "assessment_completed": return "ri-checkbox-circle-line";
    case "payment_attempted":    return "ri-bank-card-line";
    case "payment_success":      return "ri-checkbox-circle-line";
    default:                     return "ri-pulse-line";
  }
}

// ── Sub-components ──────────────────────────────────────────────────────

function ShellHeader({ rightSlot }: { rightSlot?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
        Visitor Context
      </p>
      {rightSlot}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <dt className="text-gray-500 shrink-0">{label}</dt>
      <dd className="text-gray-800 font-medium truncate" title={value}>
        {value}
      </dd>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────

export default function VisitorContextPanel({
  chatSessionId,
}: { chatSessionId: string }) {
  const [ctx, setCtx]                   = useState<PreChatContext | null>(null);
  const [events, setEvents]             = useState<JourneyEvent[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [eventsLoaded, setEventsLoaded] = useState(false);

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCtx(null);
    setEvents([]);
    setEventsLoaded(false);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "get_chat_pre_chat_context",
        { p_chat_session_id: chatSessionId },
      );
      if (rpcErr) {
        setError(rpcErr.message);
        return;
      }
      const row = (Array.isArray(data) ? data[0] : data) as PreChatContext | undefined;
      setCtx(row ?? null);
    } catch (e) {
      setError((e as Error)?.message ?? "Failed to load context");
    } finally {
      setLoading(false);
    }
  }, [chatSessionId]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  // Lazy-load the journey only when we have a linked visitor_session_id.
  const visitorSessionId = ctx?.visitor_session_id ?? null;
  useEffect(() => {
    if (!visitorSessionId || eventsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: rpcErr } = await supabase.rpc(
          "get_visitor_journey",
          { p_session_id: visitorSessionId, p_limit: 50 },
        );
        if (cancelled) return;
        if (rpcErr) {
          // Soft-fail: context already rendered. Don't surface a second error.
          setEventsLoaded(true);
          return;
        }
        const rows = (data ?? []) as JourneyEvent[];
        setEvents(rows.slice(-RECENT_EVENT_LIMIT));
        setEventsLoaded(true);
      } catch {
        if (!cancelled) setEventsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [visitorSessionId, eventsLoaded]);

  // ── States ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mb-5 pb-5 border-b border-gray-100">
        <ShellHeader />
        <div className="bg-[#f8f7f4] rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-gray-500">
          <i className="ri-loader-4-line animate-spin text-[#3b6ea5]"></i>
          Loading visitor context…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-5 pb-5 border-b border-gray-100">
        <ShellHeader />
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          Couldn't load visitor context: {error}
        </div>
      </div>
    );
  }

  if (!ctx || !ctx.visitor_session_id) {
    return (
      <div className="mb-5 pb-5 border-b border-gray-100">
        <ShellHeader />
        <div className="bg-[#f8f7f4] rounded-xl px-4 py-3 text-sm text-gray-500">
          Visitor journey unavailable for this chat.
        </div>
      </div>
    );
  }

  // ── Loaded ────────────────────────────────────────────────────────────

  const channelDisplay = channelLabel(ctx);

  const milestones: { label: string; tone: string }[] = [];
  if (ctx.assessment_started_at) milestones.push({ label: "Assessment", tone: "bg-amber-50 text-amber-700" });
  if (ctx.paid_at)               milestones.push({ label: "Paid",       tone: "bg-emerald-50 text-emerald-700" });
  if (ctx.chat_matched_order_id) milestones.push({ label: "Matched Order", tone: "bg-blue-50 text-blue-700" });

  const preChatCount = Number(ctx.pre_chat_event_count ?? 0);

  return (
    <div className="mb-5 pb-5 border-b border-gray-100">
      <ShellHeader
        rightSlot={
          <span className="text-[10px] text-gray-400">
            {preChatCount} {preChatCount === 1 ? "event" : "events"} before chat
          </span>
        }
      />

      <div className="bg-[#f8f7f4] rounded-xl px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white text-gray-700 border border-gray-200 font-semibold">
            {channelDisplay}
          </span>
          {ctx.visitor_device && (
            <span className="inline-flex items-center gap-1 text-gray-500">
              <i className={ctx.visitor_device === "mobile" ? "ri-smartphone-line" : "ri-computer-line"} />
              {ctx.visitor_device}
            </span>
          )}
          {ctx.visitor_geo?.country && (
            <span className="text-gray-500">· {ctx.visitor_geo.country}</span>
          )}
          {milestones.map((m) => (
            <span key={m.label} className={`inline-flex items-center px-2 py-0.5 rounded-md ${m.tone}`}>
              {m.label}
            </span>
          ))}
        </div>

        <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
          <Row label="Current / last page" value={pathOnly(ctx.visitor_current_page)} />
          <Row label="Landing page"        value={pathOnly(ctx.visitor_landing_url)} />
          <Row label="Pages viewed"        value={String(Number(ctx.visitor_page_count ?? 0))} />
          <Row label="Time on site"        value={durationLabel(ctx.visitor_first_seen_at, ctx.visitor_last_seen_at)} />
          <Row label="Last seen"           value={timeAgo(ctx.visitor_last_seen_at)} />
          {ctx.visitor_utm_campaign && (
            <Row label="Campaign" value={ctx.visitor_utm_campaign} />
          )}
        </dl>
      </div>

      {events.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1.5">
            Recent journey
          </p>
          <ul className="space-y-1">
            {events.map((e) => (
              <li key={e.event_id} className="flex items-center gap-2 text-xs text-gray-600 min-w-0">
                <i className={`${eventIcon(e.event_name)} text-gray-400 shrink-0`} />
                <span className="font-medium text-gray-700 shrink-0">{e.event_name}</span>
                <span className="text-gray-400 truncate">{pathOnly(e.page_url)}</span>
                <span className="text-gray-300 shrink-0 ml-auto">{timeAgo(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
