// ChatsTab — session-based support inbox rendered inside the Admin Orders portal.
// Reads PawTenant-native chat_sessions (left panel) and chats (right panel thread).
//
// Phase 6:
//   - Global alert logic (poll, sounds, toasts, desktop notifs, title badge)
//     lives in AdminChatProvider + useAdminChatNotifier. ChatsTab consumes
//     sessions + flash + notif state from context instead of polling itself.
//   - While ChatsTab is mounted, suppressToast=true so the floating global
//     toast stack doesn't duplicate in-tab row flashing. Sounds + desktop
//     notifs still fire since those are not visually redundant.
//   - Two-tone sounds (doorbell first time, soft click after) are in the
//     provider hook via src/lib/chatSounds.ts.
//
// Preserved from earlier phases:
//   - Segments: Open / Missed / Closed (mutually exclusive).
//   - Admin reply via post_agent_chat_message RPC with optimistic temp row.
//   - Reply box focus contract (never disabled during send).
//   - Visitor location (geo) pill + meta card from chat_sessions.external_metadata.
//
// Attribution UI (display + client-side filter only — no backend changes):
//   - Inline "Channel • campaign" line under each session row.
//   - Channel-count summary chips above the filter card.
//   - Channel / Device / Location dropdown filters that narrow the list.
//   All sourced from chat_sessions.external_metadata (attribution, geo,
//   user_agent). Safe optional chaining everywhere — metadata may be null.
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import {
  useAdminChat,
  type ChatSession,
} from "../../../context/AdminChatContext";

const POLL_INTERVAL_MS     = 5000;
const MISSED_THRESHOLD_MS  = 5 * 60 * 1000;
const MISSED_TICK_MS       = 30 * 1000;
const MAX_REPLY_LENGTH     = 4000;
const CHAT_FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

// Display labels for known channel keys. Unknown channel values fall through
// to their raw string in the inline row label (per spec).
const CHANNEL_LABELS: Record<string, string> = {
  google_ads:     "Google Ads",
  facebook_ads:   "Facebook Ads",
  organic_search: "Organic",
  social_organic: "Social",
  direct:         "Direct",
};

// Filter chip ordering. "All" is implicit and rendered as the first chip.
// "other" is a synthetic bucket — any channelKey not in this list gets
// folded into it so admins can still surface the long tail.
const CHANNEL_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "google_ads",     label: "Google Ads" },
  { value: "facebook_ads",   label: "Facebook Ads" },
  { value: "organic_search", label: "Organic" },
  { value: "social_organic", label: "Social" },
  { value: "direct",         label: "Direct" },
  { value: "other",          label: "Other" },
];

// Channel visual identity. Tuned for the chip row + per-row badges so the
// admin can scan the list by color/icon alone. Unknown keys fall through
// to the Other style.
//
// Tailwind classes are constant strings so the compiler keeps them in the
// build — dynamic template concatenation (e.g. `bg-${color}-50`) would be
// purged and is intentionally avoided.
interface ChannelVisual {
  label: string;
  icon: string;
  chipClass: string;       // rendered chip — inactive state
  chipActiveClass: string; // rendered chip — active state
  badgeClass: string;      // per-row badge
}

const CHANNEL_VISUALS: Record<string, ChannelVisual> = {
  google_ads: {
    label: "Google Ads",
    icon: "ri-google-fill",
    // Orange-red Google mark — differentiates from Facebook blue at a glance.
    chipClass:       "bg-white border-gray-200 text-gray-700 hover:border-[#EA4335] hover:text-[#EA4335]",
    chipActiveClass: "bg-[#EA4335] border-[#EA4335] text-white",
    badgeClass:      "bg-[#fdecea] text-[#b3261e] border border-[#f5c2bc]",
  },
  facebook_ads: {
    label: "Facebook Ads",
    icon: "ri-facebook-circle-fill",
    chipClass:       "bg-white border-gray-200 text-gray-700 hover:border-[#1877F2] hover:text-[#1877F2]",
    chipActiveClass: "bg-[#1877F2] border-[#1877F2] text-white",
    badgeClass:      "bg-[#e7f0fe] text-[#1553b5] border border-[#bfd4fb]",
  },
  organic_search: {
    label: "Organic",
    icon: "ri-search-line",
    chipClass:       "bg-white border-gray-200 text-gray-700 hover:border-emerald-500 hover:text-emerald-600",
    chipActiveClass: "bg-emerald-500 border-emerald-500 text-white",
    badgeClass:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
  },
  social_organic: {
    label: "Social",
    icon: "ri-share-forward-fill",
    chipClass:       "bg-white border-gray-200 text-gray-700 hover:border-purple-500 hover:text-purple-600",
    chipActiveClass: "bg-purple-500 border-purple-500 text-white",
    badgeClass:      "bg-purple-50 text-purple-700 border border-purple-200",
  },
  direct: {
    label: "Direct",
    icon: "ri-cursor-fill",
    chipClass:       "bg-white border-gray-200 text-gray-700 hover:border-gray-500 hover:text-gray-800",
    chipActiveClass: "bg-gray-800 border-gray-800 text-white",
    badgeClass:      "bg-gray-100 text-gray-700 border border-gray-200",
  },
  other: {
    label: "Other",
    icon: "ri-question-line",
    chipClass:       "bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-700",
    chipActiveClass: "bg-gray-500 border-gray-500 text-white",
    badgeClass:      "bg-gray-50 text-gray-600 border border-gray-200",
  },
};

// "Known" keys — anything outside this set rolls up into the synthetic
// "other" bucket for filters and summary counts.
const KNOWN_CHANNEL_KEYS = new Set(
  CHANNEL_FILTER_OPTIONS.filter((o) => o.value !== "other").map((o) => o.value),
);

function channelFilterKey(rawKey: string | null | undefined): string | null {
  if (!rawKey) return null;
  const k = rawKey.toLowerCase();
  return KNOWN_CHANNEL_KEYS.has(k) ? k : "other";
}

function channelVisualFor(rawKey: string | null | undefined): ChannelVisual {
  const k = channelFilterKey(rawKey) ?? "other";
  return CHANNEL_VISUALS[k] ?? CHANNEL_VISUALS.other;
}

interface ChatGeo {
  country?: string | null;
  region?: string | null;
  city?: string | null;
}

interface SessionAttribution {
  channelKey: string | null;
  channelLabel: string | null;
  campaign: string | null;
}

interface ChatMessage {
  id: string;
  session_id: string | null;
  sender: string | null;
  email: string | null;
  name: string | null;
  message: string;
  created_at: string;
  provider: string | null;
  source: string | null;
}

type FilterKey = "open" | "missed" | "closed";
type DeviceFilter = "all" | "desktop" | "mobile";

// TODO(bulk-actions): multi-select sessions → bulk close/assign + CSV export.
// Deferred out of the live-deploy scope. When picked up, add a selection
// checkbox column on the session row and an action toolbar above the list.

export default function ChatsTab() {
  const ctx = useAdminChat();
  const sessions = ctx.sessions;
  const sessionsError = ctx.error;
  const sessionsRefreshing = ctx.refreshing;
  const flashIds = ctx.flashIds;
  const notifPermission = ctx.notifPermission;

  const [selectedId, setSelectedId] = useState<string | null>(
    ctx.selectedSessionId,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [orderEmails, setOrderEmails] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("open");
  const [channelFilter, setChannelFilter]   = useState<string>("all");
  const [deviceFilter, setDeviceFilter]     = useState<DeviceFilter>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [threadError, setThreadError] = useState<string | null>(null);
  const [, setNowTick] = useState(0);

  // Admin reply state.
  const [replyInput, setReplyInput]       = useState("");
  const [replySending, setReplySending]   = useState(false);
  const [replyError, setReplyError]       = useState<string | null>(null);
  const [pendingReplies, setPendingReplies] = useState<ChatMessage[]>([]);

  const messagesReqRef = useRef(0);
  const mountedRef     = useRef(true);
  const selectedIdRef  = useRef<string | null>(null);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Tell the global notifier to suppress floating toasts while this tab
  // is visible — the inline row flash is the better UX here.
  // On unmount we ALSO clear the context's selectedSessionId, otherwise
  // the notifier hook keeps treating the last-viewed session as "actively
  // viewed" and silently suppresses its toasts on Orders/Dashboard/etc.
  useEffect(() => {
    ctx.setSuppressToast(true);
    return () => {
      ctx.setSuppressToast(false);
      ctx.setSelectedSessionId(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Two-way sync between local selectedId and context.selectedSessionId.
  // Context can be driven externally (e.g. desktop notif click or toast).
  useEffect(() => {
    if (
      ctx.selectedSessionId &&
      ctx.selectedSessionId !== selectedId
    ) {
      setSelectedId(ctx.selectedSessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.selectedSessionId]);

  useEffect(() => {
    ctx.setSelectedSessionId(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Initial selection: if nothing selected yet, pick the first session.
  useEffect(() => {
    if (selectedId && sessions.some((s) => s.id === selectedId)) return;
    if (sessions.length > 0) {
      setSelectedId(sessions[0].id);
    } else if (selectedId !== null) {
      setSelectedId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions]);

  // Fetch orders matching visitor emails — reactive to session set changes.
  // Key by a stable signature so background polls with no email changes
  // don't retrigger this fetch.
  const emailSig = useMemo(() => {
    return Array.from(
      new Set(
        sessions
          .map((r) => (r.email ?? "").trim().toLowerCase())
          .filter((e) => e.length > 0),
      ),
    )
      .sort()
      .join("|");
  }, [sessions]);

  useEffect(() => {
    if (!emailSig) {
      setOrderEmails(new Set());
      return;
    }
    const emails = emailSig.split("|");
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from("orders")
          .select("email")
          .in("email", emails);
        if (cancelled) return;
        const matched = new Set(
          ((data ?? []) as { email: string | null }[])
            .map((r) => (r.email ?? "").trim().toLowerCase())
            .filter((e) => e.length > 0),
        );
        setOrderEmails(matched);
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [emailSig]);

  async function loadMessages(sessionId: string, background = false) {
    const myId = ++messagesReqRef.current;
    const isLatest = () =>
      myId === messagesReqRef.current && mountedRef.current;

    if (!background) {
      setMessagesLoading(true);
      setThreadError(null);
      setMessages([]);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const { data, error: qErr } = await supabase
        .from("chats")
        .select(
          "id, session_id, sender, email, name, message, created_at, provider, source",
        )
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true })
        .limit(500)
        .abortSignal(controller.signal);

      if (!isLatest()) return;
      if (qErr) {
        if (!background) setThreadError(qErr.message);
        return;
      }
      const nextMessages = (data ?? []) as ChatMessage[];
      setMessages((prev) => {
        const prevJson = JSON.stringify(prev);
        const nextJson = JSON.stringify(nextMessages);
        return prevJson === nextJson ? prev : nextMessages;
      });
      if (background) setThreadError(null);
    } catch (e) {
      if (isLatest() && !background) {
        const aborted = controller.signal.aborted;
        setThreadError(
          aborted
            ? "Thread request timed out — please try again."
            : (e as Error)?.message ?? "Failed to load thread",
        );
      }
    } finally {
      clearTimeout(timeoutId);
      if (isLatest() && !background) setMessagesLoading(false);
    }
  }

  async function markRead(session: ChatSession) {
    const needsUpdate =
      session.unread_count > 0 ||
      session.last_viewed_at == null ||
      (session.last_message_at != null &&
        new Date(session.last_viewed_at).getTime() <
          new Date(session.last_message_at).getTime());
    if (!needsUpdate) return;

    const nowIso = new Date().toISOString();
    ctx.mutateSession(session.id, {
      unread_count: 0,
      last_viewed_at: nowIso,
    });
    ctx.markSeen(session.id);

    try {
      await supabase.rpc("mark_chat_session_read", {
        p_session_id: session.id,
      });
    } catch {
      // silent
    }
  }

  // Post an agent reply through the RPC with optimistic append. Textarea
  // stays enabled during the RPC so focus never gets stripped.
  async function sendReply() {
    if (!selectedId) return;
    const snapshot = replyInput;
    const text = snapshot.trim();
    if (!text || replySending) return;
    if (text.length > MAX_REPLY_LENGTH) {
      setReplyError(`Message too long (max ${MAX_REPLY_LENGTH} characters)`);
      return;
    }

    const tempId = genTempId();
    const sid = selectedId;
    const nowIso = new Date().toISOString();
    const tempMsg: ChatMessage = {
      id: tempId,
      session_id: sid,
      sender: "agent",
      email: null,
      name: null,
      message: text,
      created_at: nowIso,
      provider: null,
      source: "admin_reply",
    };

    setPendingReplies((p) => [...p, tempMsg]);
    setReplySending(true);
    setReplyError(null);

    try {
      const { error: rpcErr } = await supabase.rpc("post_agent_chat_message", {
        p_session_id: sid,
        p_message: text,
      });
      if (rpcErr) throw rpcErr;

      if (!mountedRef.current) return;
      setReplyInput((current) => (current === snapshot ? "" : current));
      await loadMessages(sid, true);
      if (!mountedRef.current) return;
      setPendingReplies((p) => p.filter((m) => m.id !== tempId));
    } catch (e) {
      if (!mountedRef.current) return;
      setPendingReplies((p) => p.filter((m) => m.id !== tempId));
      setReplyError((e as Error)?.message ?? "Failed to send message");
    } finally {
      if (mountedRef.current) setReplySending(false);
    }
  }

  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
    const session = sessions.find((s) => s.id === selectedId);
    if (session) void markRead(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Reset reply box when switching sessions.
  useEffect(() => {
    setReplyInput("");
    setReplySending(false);
    setReplyError(null);
    setPendingReplies([]);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const sid = selectedId;
    const id = setInterval(() => {
      if (!mountedRef.current) return;
      void loadMessages(sid, true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!mountedRef.current) return;
      setNowTick((n) => n + 1);
    }, MISSED_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Channel summary counts — derived from the FULL session list (before
  // attribute filters) so the chips don't shift while you narrow the view.
  // Unknown channel keys roll up into the synthetic "other" bucket so the
  // long tail is still reachable via a single chip.
  const channelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of sessions) {
      const { channelKey } = getSessionAttribution(s);
      const bucket = channelFilterKey(channelKey);
      if (!bucket) continue;
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
    return counts;
  }, [sessions]);

  // Build location dropdown from whatever values are actually present.
  const locationOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sessions) {
      const loc = getSessionLocation(s);
      if (loc) set.add(loc);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessions]);

  // Hide the device select if no session has a user_agent recorded.
  const hasUserAgentData = useMemo(
    () => sessions.some((s) => getSessionDevice(s) !== null),
    [sessions],
  );

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter === "open" && !(s.status === "open" && !isMissed(s)))
        return false;
      if (filter === "missed" && !isMissed(s)) return false;
      if (filter === "closed" && s.status !== "closed") return false;

      if (channelFilter !== "all") {
        const { channelKey } = getSessionAttribution(s);
        if (channelFilterKey(channelKey) !== channelFilter) return false;
      }
      if (deviceFilter !== "all") {
        const dev = getSessionDevice(s);
        if (dev !== deviceFilter) return false;
      }
      if (locationFilter !== "all") {
        const loc = getSessionLocation(s);
        if (loc !== locationFilter) return false;
      }

      if (!q) return true;
      const hay = `${s.name ?? ""} ${s.email ?? ""} ${s.last_message_preview ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, search, filter, channelFilter, deviceFilter, locationFilter]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedId) ?? null,
    [sessions, selectedId],
  );

  const totals = useMemo(
    () => ({
      open: sessions.filter((s) => s.status === "open" && !isMissed(s)).length,
      missed: sessions.filter((s) => isMissed(s)).length,
      closed: sessions.filter((s) => s.status === "closed").length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions],
  );

  const showLocationFilter = locationOptions.length > 0;
  const attrFiltersActive =
    channelFilter !== "all" ||
    deviceFilter !== "all" ||
    locationFilter !== "all";

  // Merge real messages with pending (optimistic) agent replies for display.
  const displayedMessages = useMemo(() => {
    if (pendingReplies.length === 0) return messages;
    const relevantPending = pendingReplies.filter(
      (m) => m.session_id === selectedId,
    );
    if (relevantPending.length === 0) return messages;
    const all = [...messages, ...relevantPending];
    all.sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    return all;
  }, [messages, pendingReplies, selectedId]);

  function hasMatchedOrder(s: ChatSession | null): boolean {
    if (!s) return false;
    if (s.email && orderEmails.has(s.email.trim().toLowerCase())) return true;
    return false;
  }

  const initialLoading =
    sessions.length === 0 && sessionsRefreshing && !sessionsError;

  if (initialLoading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 py-20 flex items-center justify-center">
        <i className="ri-loader-4-line animate-spin text-2xl text-[#3b6ea5]"></i>
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        Live support inbox. Messages are grouped into sessions per visitor.
      </p>

      {sessionsError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <i className="ri-error-warning-line text-red-600 text-base mt-0.5"></i>
          <p className="text-sm text-red-700 font-semibold">{sessionsError}</p>
        </div>
      )}

      {/* Channel summary moved into the filter row below — each channel
          chip carries its own count, so a separate summary is redundant. */}

      <div className="bg-white rounded-2xl border border-gray-100 px-4 py-3 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: "open"   as FilterKey, label: "Open",   count: totals.open },
              { key: "missed" as FilterKey, label: "Missed", count: totals.missed },
              { key: "closed" as FilterKey, label: "Closed", count: totals.closed },
            ]).map((p) => {
              const active = filter === p.key;
              const isMissedTab = p.key === "missed";
              const alertTint = isMissedTab && p.count > 0 && !active;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setFilter(p.key)}
                  className={`whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                    active
                      ? isMissedTab
                        ? "bg-amber-500 border-amber-500 text-white"
                        : "bg-[#3b6ea5] border-[#3b6ea5] text-white"
                      : alertTint
                        ? "bg-amber-50 border-amber-200 text-amber-800 hover:border-amber-400"
                        : "bg-white border-gray-200 text-gray-600 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"
                  }`}
                >
                  {p.label}
                  <span
                    className={`ml-2 inline-flex items-center justify-center min-w-[20px] h-4 px-1.5 rounded-full text-[10px] ${
                      active
                        ? "bg-white/20"
                        : alertTint
                          ? "bg-amber-100 text-amber-800"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {p.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 sm:w-72">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, or preview…"
                className="w-full pl-9 pr-3 py-2 bg-[#f8f7f4] border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:border-[#3b6ea5]"
              />
            </div>
            {notifPermission === "default" && (
              <button
                type="button"
                onClick={() => { void ctx.requestDesktopAlerts(); }}
                title="Enable desktop alerts for new visitor messages"
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:text-[#3b6ea5] hover:border-[#3b6ea5] transition-colors cursor-pointer font-semibold"
              >
                <i className="ri-notification-3-line text-xs"></i>
                <span className="hidden sm:inline">Enable alerts</span>
              </button>
            )}
            {notifPermission === "denied" && (
              <span
                title="Desktop alerts are blocked in your browser settings. Re-allow notifications for this site to turn them on."
                className="whitespace-nowrap hidden sm:inline-flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-[11px] text-gray-400 font-semibold"
              >
                <i className="ri-notification-off-line text-xs"></i>
                Alerts blocked
              </span>
            )}
            <button
              type="button"
              onClick={() => ctx.refreshSessions()}
              disabled={sessionsRefreshing}
              title="Refresh"
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:text-[#3b6ea5] hover:border-[#3b6ea5] transition-colors cursor-pointer font-semibold disabled:opacity-50"
            >
              <i className={`ri-refresh-line text-xs ${sessionsRefreshing ? "animate-spin" : ""}`}></i>
              <span className="hidden sm:inline">{sessionsRefreshing ? "Loading…" : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Attribution filters — channel chips + device / location dropdowns.
            Client-side only; they narrow the visible session list without
            changing the poll query or any backend behavior.
            Chips: clicking a channel chip activates that filter; "All"
            resets it. The chip row is always visible so the interaction
            pattern is discoverable; each channel chip only renders when at
            least one session in the current poll has that channel. */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1">
              Channel
            </span>
            <button
              type="button"
              onClick={() => setChannelFilter("all")}
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                channelFilter === "all"
                  ? "bg-[#3b6ea5] border-[#3b6ea5] text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"
              }`}
              aria-pressed={channelFilter === "all"}
            >
              All
            </button>
            {CHANNEL_FILTER_OPTIONS.map((opt) => {
              const count = channelCounts[opt.value] ?? 0;
              if (count === 0) return null;
              const v = CHANNEL_VISUALS[opt.value] ?? CHANNEL_VISUALS.other;
              const active = channelFilter === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setChannelFilter(active ? "all" : opt.value)
                  }
                  className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                    active ? v.chipActiveClass : v.chipClass
                  }`}
                  aria-pressed={active}
                  title={`${v.label} — ${count} session${count === 1 ? "" : "s"}`}
                >
                  <i className={`${v.icon} text-[13px] leading-none`}></i>
                  <span>{v.label}</span>
                  <span
                    className={`ml-0.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full text-[9px] ${
                      active ? "bg-white/25 text-white" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {(hasUserAgentData || showLocationFilter || attrFiltersActive) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-1">
                Refine
              </span>
              {hasUserAgentData && (
                <FilterSelect
                  value={deviceFilter}
                  onChange={(v) => setDeviceFilter(v as DeviceFilter)}
                  options={[
                    { value: "all", label: "All devices" },
                    { value: "desktop", label: "Desktop" },
                    { value: "mobile", label: "Mobile" },
                  ]}
                  icon="ri-device-line"
                  ariaLabel="Filter by device"
                />
              )}
              {showLocationFilter && (
                <FilterSelect
                  value={locationFilter}
                  onChange={setLocationFilter}
                  options={[
                    { value: "all", label: "All locations" },
                    ...locationOptions.map((l) => ({ value: l, label: l })),
                  ]}
                  icon="ri-map-pin-line"
                  ariaLabel="Filter by location"
                />
              )}
              {attrFiltersActive && (
                <button
                  type="button"
                  onClick={() => {
                    setChannelFilter("all");
                    setDeviceFilter("all");
                    setLocationFilter("all");
                  }}
                  className="text-[11px] font-semibold text-gray-500 hover:text-[#3b6ea5] underline underline-offset-2 cursor-pointer ml-1"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100vh-280px)]">
          <div className="px-4 py-2.5 bg-[#f8f7f4] border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">
              {filteredSessions.length} {filteredSessions.length === 1 ? "Session" : "Sessions"}
            </span>
            <span className="text-[11px] text-gray-400 font-medium">Newest first</span>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            {filteredSessions.length === 0 ? (
              <div className="p-10 text-center text-sm text-gray-400 font-medium">
                {filter === "missed"
                  ? "No missed sessions."
                  : filter === "closed"
                    ? "No closed sessions."
                    : attrFiltersActive
                      ? "No sessions match the selected filters."
                      : "No open sessions."}
              </div>
            ) : (
              filteredSessions.map((s) => {
                const active = s.id === selectedId;
                const identified = !!s.email;
                const matched = hasMatchedOrder(s);
                const hasUnread = s.unread_count > 0;
                const flashed = flashIds.has(s.id);
                const missed = isMissed(s);
                const attr = getSessionAttribution(s);
                const channelVisual = attr.channelKey
                  ? channelVisualFor(attr.channelKey)
                  : null;
                const device = getSessionDevice(s);
                const locationLabel = getSessionLocation(s);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedId(s.id)}
                    className={`w-full text-left px-4 py-3 cursor-pointer transition-colors ${
                      active
                        ? "bg-[#e8f0f9]"
                        : flashed
                          ? "bg-amber-50 ring-2 ring-amber-300 ring-inset animate-pulse"
                          : missed
                            ? "bg-amber-50/40 hover:bg-amber-50"
                            : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p
                        className={`text-sm truncate ${
                          hasUnread ? "font-extrabold text-gray-900" : "font-bold text-gray-900"
                        }`}
                        style={{ fontFamily: CHAT_FONT }}
                      >
                        {displayNameForSession(s)}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {hasUnread && (
                          <span
                            title={`${s.unread_count} unread`}
                            className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-white text-[10px] font-bold ${
                              missed ? "bg-amber-500" : "bg-[#3b6ea5]"
                            }`}
                          >
                            {s.unread_count > 99 ? "99+" : s.unread_count}
                          </span>
                        )}
                        <span className="text-[10px] text-gray-400 font-medium whitespace-nowrap">
                          {fmtRelative(s.last_message_at ?? s.created_at)}
                        </span>
                      </div>
                    </div>
                    {s.email && (
                      <p
                        className="text-xs text-gray-500 truncate mb-1"
                        style={{ fontFamily: CHAT_FONT }}
                      >
                        {s.email}
                      </p>
                    )}
                    {(channelVisual || device || locationLabel) && (
                      <div className="flex items-center flex-wrap gap-1 mb-1.5">
                        {channelVisual && (
                          <span
                            className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${channelVisual.badgeClass}`}
                            title={
                              attr.campaign
                                ? `${channelVisual.label} · ${attr.campaign}`
                                : channelVisual.label
                            }
                          >
                            <i className={`${channelVisual.icon} text-[11px] leading-none`}></i>
                            <span>{channelVisual.label}</span>
                            {attr.campaign && (
                              <span className="font-semibold opacity-80 truncate max-w-[100px]">
                                · {attr.campaign}
                              </span>
                            )}
                          </span>
                        )}
                        {device && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
                            title={`Device: ${device === "mobile" ? "Mobile" : "Desktop"}`}
                          >
                            <i
                              className={`${device === "mobile" ? "ri-smartphone-line" : "ri-computer-line"} text-[11px] leading-none`}
                            ></i>
                            {device === "mobile" ? "Mobile" : "Desktop"}
                          </span>
                        )}
                        {locationLabel && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200"
                            title={`Location: ${locationLabel}`}
                          >
                            <i className="ri-map-pin-line text-[11px] leading-none"></i>
                            {locationLabel}
                          </span>
                        )}
                      </div>
                    )}
                    <p
                      className={`text-xs line-clamp-2 mb-2 break-words ${
                        hasUnread ? "text-gray-800" : "text-gray-600"
                      }`}
                      style={{
                        fontFamily: CHAT_FONT,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {safeSlice(s.last_message_preview ?? "", 180) || (
                        <span className="italic text-gray-400">No preview</span>
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {missed && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          <i className="ri-alarm-warning-line"></i>
                          Missed
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          identified
                            ? "bg-[#e8f0f9] text-[#3b6ea5]"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        <i className={identified ? "ri-user-check-line" : "ri-user-unfollow-line"}></i>
                        {identified ? "Identified" : "Anonymous"}
                      </span>
                      {identified && (
                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            matched ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-gray-50 text-gray-400"
                          }`}
                        >
                          <i className={matched ? "ri-shopping-bag-3-line" : "ri-close-line"}></i>
                          {matched ? "Matched Order" : "No Order Match"}
                        </span>
                      )}
                      {s.status === "closed" && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                          <i className="ri-check-line"></i>
                          Closed
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6 min-h-[420px]">
          {!selectedSession ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-center">
              <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                <i className="ri-chat-3-line text-gray-300 text-xl"></i>
              </div>
              <p className="text-sm font-semibold text-gray-500">Select a session</p>
              <p className="text-xs text-gray-400 mt-1">
                Pick a session from the list on the left to view the full conversation.
              </p>
            </div>
          ) : (
            <ThreadView
              session={selectedSession}
              messages={displayedMessages}
              loading={messagesLoading}
              error={threadError}
              matchedOrder={hasMatchedOrder(selectedSession)}
              replyInput={replyInput}
              onReplyChange={setReplyInput}
              onSend={sendReply}
              sending={replySending}
              replyError={replyError}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  icon,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon: string;
  ariaLabel: string;
}) {
  return (
    <div className="relative">
      <i
        className={`${icon} absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none`}
      ></i>
      <select
        aria-label={ariaLabel}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-7 pr-7 py-1.5 bg-[#f8f7f4] border border-gray-200 rounded-lg text-xs text-gray-700 font-semibold cursor-pointer focus:outline-none focus:border-[#3b6ea5] hover:border-gray-300 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <i className="ri-arrow-down-s-line absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none"></i>
    </div>
  );
}

function ThreadView({
  session,
  messages,
  loading,
  error,
  matchedOrder,
  replyInput,
  onReplyChange,
  onSend,
  sending,
  replyError,
}: {
  session: ChatSession;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  matchedOrder: boolean;
  replyInput: string;
  onReplyChange: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  replyError: string | null;
}) {
  const identified = !!session.email;
  const canSend = replyInput.trim().length > 0 && !sending;
  const geo = geoFromSession(session);
  const hasGeo = !!geo && (!!geo.city || !!geo.region || !!geo.country);
  const locationLabel = formatGeoLabel(geo);

  // Focus contract (unchanged from Phase 5D):
  //   - Textarea is NEVER disabled during send (disabling strips focus).
  //   - On session change, focus is restored via rAF so the row click doesn't win.
  //   - After send completes, focus is restored if not typing elsewhere.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevSendingRef = useRef(sending);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    let rafId = 0;
    const focusIfSafe = () => {
      const active = document.activeElement as HTMLElement | null;
      const typingElsewhere =
        !!active &&
        active !== el &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA") &&
        !(active as HTMLInputElement | HTMLTextAreaElement).readOnly;
      if (typingElsewhere) return;
      try {
        el.focus();
        const len = el.value.length;
        if (typeof el.setSelectionRange === "function") {
          el.setSelectionRange(len, len);
        }
      } catch {
        // ignore
      }
    };
    rafId = window.requestAnimationFrame(focusIfSafe);
    return () => window.cancelAnimationFrame(rafId);
  }, [session.id]);

  useEffect(() => {
    const wasSending = prevSendingRef.current;
    prevSendingRef.current = sending;
    if (!(wasSending && !sending)) return;
    const el = textareaRef.current;
    if (!el) return;
    const active = document.activeElement as HTMLElement | null;
    const typingElsewhere =
      !!active &&
      active !== el &&
      (active.tagName === "INPUT" || active.tagName === "TEXTAREA") &&
      !(active as HTMLInputElement | HTMLTextAreaElement).readOnly;
    if (typingElsewhere) return;
    const rafId = window.requestAnimationFrame(() => {
      try {
        el.focus();
      } catch {
        // ignore
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [sending]);

  return (
    <div className="flex flex-col">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div>
          <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest mb-1">
            Conversation
          </p>
          <h2
            className="text-lg font-extrabold text-gray-900"
            style={{ fontFamily: CHAT_FONT }}
          >
            {displayNameForSession(session)}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Started {fmtAbsolute(session.created_at)}
            {session.last_message_at
              ? ` · last message ${fmtRelative(session.last_message_at)}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
              identified ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-gray-100 text-gray-500"
            }`}
          >
            <i className={identified ? "ri-user-check-line" : "ri-user-unfollow-line"}></i>
            {identified ? "Identified" : "Anonymous"}
          </span>
          {identified && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${
                matchedOrder ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-gray-50 text-gray-400"
              }`}
            >
              <i className={matchedOrder ? "ri-shopping-bag-3-line" : "ri-close-line"}></i>
              {matchedOrder ? "Matched Order" : "No Order Match"}
            </span>
          )}
          {hasGeo && (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#f5f1ea] text-[#6b4d2b]"
              title="Approximate visitor location based on IP"
            >
              <i className="ri-map-pin-line"></i>
              {locationLabel}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 pb-5 border-b border-gray-100">
        <Meta label="Name" value={session.name || "—"} icon="ri-user-3-line" />
        <Meta
          label="Email"
          value={session.email || "—"}
          icon="ri-mail-line"
          copy={!!session.email}
        />
        <Meta label="Provider" value={session.provider || "—"} icon="ri-global-line" />
        <Meta
          label="Location"
          value={hasGeo ? locationLabel : "—"}
          icon="ri-map-pin-line"
        />
      </div>

      <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-3">
        {messages.length} {messages.length === 1 ? "Message" : "Messages"}
      </p>

      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3">
          <i className="ri-error-warning-line text-red-600 text-base mt-0.5"></i>
          <p className="text-sm text-red-700 font-semibold">{error}</p>
        </div>
      ) : loading ? (
        <div className="py-16 flex items-center justify-center">
          <i className="ri-loader-4-line animate-spin text-xl text-[#3b6ea5]"></i>
        </div>
      ) : messages.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400 font-medium">
          No messages in this session.
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) onSend();
        }}
        className={`mt-5 border border-gray-200 rounded-xl bg-white overflow-hidden ${
          sending ? "opacity-95" : ""
        }`}
      >
        <textarea
          ref={textareaRef}
          value={replyInput}
          onChange={(e) => onReplyChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder="Reply as admin…"
          rows={3}
          maxLength={MAX_REPLY_LENGTH}
          autoFocus
          className="w-full px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none resize-none bg-white"
          style={{ fontFamily: CHAT_FONT }}
        />
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 bg-[#f8f7f4]">
          <span className="text-[10px] text-gray-400 font-medium">
            Enter to send · Shift+Enter for new line
          </span>
          <button
            type="submit"
            disabled={!canSend}
            className="inline-flex items-center gap-1.5 bg-[#3b6ea5] text-white text-xs font-bold px-3.5 py-1.5 rounded-lg hover:bg-[#2e5a87] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <i
              className={`${sending ? "ri-loader-4-line animate-spin" : "ri-send-plane-2-line"} text-xs`}
            ></i>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
      {replyError && (
        <div className="mt-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <i className="ri-error-warning-line text-red-600 text-sm mt-0.5"></i>
          <p className="text-xs text-red-700 font-semibold">{replyError}</p>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const sender = (message.sender ?? "visitor").toLowerCase();
  const isPending = typeof message.id === "string" && message.id.startsWith("temp-");
  const isSystem = sender === "system";
  if (isSystem) {
    return (
      <div className="flex justify-center">
        <span
          className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-full px-3 py-1 font-medium"
          style={{ fontFamily: CHAT_FONT }}
        >
          {message.message}
        </span>
      </div>
    );
  }
  const isVisitor = sender === "visitor";
  return (
    <div className={`flex ${isVisitor ? "justify-start" : "justify-end"}`}>
      <div className={`max-w-[78%] ${isVisitor ? "" : "items-end"}`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
            isVisitor
              ? "bg-[#f0f4f9] text-gray-800 border border-gray-100"
              : "bg-[#3b6ea5] text-white"
          } ${isPending ? "opacity-60" : ""}`}
          style={{
            fontFamily: CHAT_FONT,
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          {message.message}
        </div>
        <p
          className={`mt-1 text-[10px] text-gray-400 font-medium ${
            isVisitor ? "text-left" : "text-right"
          }`}
        >
          {isPending
            ? "Sending…"
            : `${labelForSender(sender)} · ${fmtRelative(message.created_at)}`}
        </p>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
  icon,
  copy,
}: {
  label: string;
  value: string;
  icon: string;
  copy?: boolean;
}) {
  return (
    <div className="bg-[#f8f7f4] rounded-xl px-3 py-2.5 border border-gray-100">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">
        <i className={icon}></i>
        {label}
      </div>
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-sm text-gray-800 font-semibold truncate"
          style={{ fontFamily: CHAT_FONT }}
        >
          {value}
        </p>
        {copy && value !== "—" && (
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(value).catch(() => {});
            }}
            title="Copy"
            className="text-gray-400 hover:text-[#3b6ea5] text-sm cursor-pointer flex-shrink-0"
          >
            <i className="ri-file-copy-line"></i>
          </button>
        )}
      </div>
    </div>
  );
}

function isMissed(s: ChatSession): boolean {
  if (s.status !== "open") return false;
  if (s.unread_count <= 0) return false;
  if (!s.last_message_at) return false;
  const lastMsg = new Date(s.last_message_at).getTime();
  if (Number.isNaN(lastMsg)) return false;
  if (Date.now() - lastMsg < MISSED_THRESHOLD_MS) return false;
  if (s.last_viewed_at == null) return true;
  const lastView = new Date(s.last_viewed_at).getTime();
  if (Number.isNaN(lastView)) return true;
  return lastView < lastMsg;
}

function labelForSender(sender: string): string {
  if (sender === "agent") return "Agent";
  if (sender === "system") return "System";
  return "Visitor";
}

function displayNameForSession(s: ChatSession): string {
  if (s.name && s.name.trim()) return s.name.trim();
  if (s.email && s.email.trim()) return s.email.trim();
  return "Anonymous visitor";
}

function safeSlice(s: string, n: number): string {
  if (!s) return "";
  const arr = [...s];
  if (arr.length <= n) return s;
  return arr.slice(0, n - 1).join("") + "…";
}

function genTempId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `temp-${crypto.randomUUID()}`;
    }
  } catch {
    // fall through
  }
  return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function geoFromSession(s: ChatSession | null | undefined): ChatGeo | null {
  if (!s || !s.external_metadata || typeof s.external_metadata !== "object") {
    return null;
  }
  const raw = (s.external_metadata as Record<string, unknown>).geo;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const g = raw as Record<string, unknown>;
  const country = typeof g.country === "string" ? g.country.trim() : "";
  const region = typeof g.region === "string" ? g.region.trim() : "";
  const city = typeof g.city === "string" ? g.city.trim() : "";
  if (!country && !region && !city) return null;
  return {
    country: country || null,
    region: region || null,
    city: city || null,
  };
}

function formatGeoLabel(g: ChatGeo | null): string {
  if (!g) return "—";
  const parts: string[] = [];
  if (g.city) parts.push(g.city);
  if (g.region && g.region !== g.city) parts.push(g.region);
  const head = parts.join(", ");
  if (g.country) return head ? `${head} · ${g.country}` : g.country;
  return head || "—";
}

// Pull attribution.channel + attribution.utm_campaign safely from metadata.
// Returns null fields when the blob is missing or malformed so the UI can
// quietly omit the line.
function getSessionAttribution(
  s: ChatSession | null | undefined,
): SessionAttribution {
  const empty: SessionAttribution = {
    channelKey: null,
    channelLabel: null,
    campaign: null,
  };
  if (!s || !s.external_metadata || typeof s.external_metadata !== "object") {
    return empty;
  }
  const raw = (s.external_metadata as Record<string, unknown>).attribution;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;
  const attr = raw as Record<string, unknown>;
  const channelRaw =
    typeof attr.channel === "string" ? attr.channel.trim() : "";
  const campaignRaw =
    typeof attr.utm_campaign === "string" ? attr.utm_campaign.trim() : "";
  const channelKey = channelRaw ? channelRaw.toLowerCase() : null;
  const channelLabel = channelKey
    ? (CHANNEL_LABELS[channelKey] ?? channelRaw)
    : null;
  return {
    channelKey,
    channelLabel,
    campaign: campaignRaw || null,
  };
}

// Coarse desktop / mobile classification from the captured user_agent.
// Returns null when no user_agent is recorded — the device filter ignores
// such sessions only when "Desktop" or "Mobile" is selected.
function getSessionDevice(
  s: ChatSession | null | undefined,
): "desktop" | "mobile" | null {
  if (!s || !s.external_metadata || typeof s.external_metadata !== "object") {
    return null;
  }
  const ua = (s.external_metadata as Record<string, unknown>).user_agent;
  if (typeof ua !== "string" || !ua.trim()) return null;
  return /Mobile/i.test(ua) ? "mobile" : "desktop";
}

// Country wins, region falls back. Used by the Location filter dropdown
// so admins can slice by whichever level is actually populated.
function getSessionLocation(
  s: ChatSession | null | undefined,
): string | null {
  const g = geoFromSession(s);
  if (!g) return null;
  return (g.country && g.country.trim()) || (g.region && g.region.trim()) || null;
}

function fmtRelative(ts: string | null): string {
  if (!ts) return "—";
  const diffMs = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtAbsolute(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
