// AttributionJourneyTab — Order Detail modal section
//
// Visitor Journey Intelligence build:
//   1. Source Summary       — canonical classifyOrder() output + reasoning
//   2. Landing Page         — landing URL + referrer + UTMs + click IDs
//   3. Session Link         — visitor_sessions row + LIVE pulse + cross-links
//                             (open Live Visitors, copy session id, linked chat)
//   4. Journey Intelligence — entry / exit-before-payment / top page /
//                             time-to-convert / pages browsed
//   5. Funnel Timeline      — milestone dots with icons + colors
//   6. Page Journey         — grouped page-view runs + per-event icons
//
// Self-fetches everything by order.id — parent OrderDetailModal only
// needs to pass id+confirmation_id+created_at.
//
// Defensive design: every query has graceful empty/error states. If
// visitor_sessions row or events are missing for a historical order, the
// panel shows a banner explaining tracking wasn't enabled yet — never
// fakes data.
//
// Performance contract:
//   - 4 queries on mount (orders, visitor_session, journey events,
//     chat_sessions COUNT) — no polling.
//   - 1 lightweight tick every 10s ONLY to refresh the "LIVE" pulse pill
//     based on the snapshot last_seen_at value already in state. No new
//     network calls on tick.
//   - No N+1, no realtime, no extra fetches per render.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  classifyOrder,
  ACQUISITION_VISUAL,
  type AcquisitionLabel,
} from "@/lib/acquisitionClassifier";

// ── Types ─────────────────────────────────────────────────────────────────

interface AttributionSnapshot {
  channel?:      string | null;
  utm_source?:   string | null;
  utm_medium?:   string | null;
  utm_campaign?: string | null;
  utm_term?:     string | null;
  utm_content?:  string | null;
  gclid?:        string | null;
  fbclid?:       string | null;
  ref?:          string | null;
  referrer?:     string | null;
  landing_url?:  string | null;
  [key: string]: unknown;
}

interface OrderRow {
  id:                 string;
  confirmation_id:    string;
  created_at:         string;
  paid_at:            string | null;
  payment_intent_id:  string | null;
  doctor_status:      string | null;
  referred_by:        string | null;
  utm_source:         string | null;
  utm_medium:         string | null;
  utm_campaign:       string | null;
  utm_term:           string | null;
  utm_content:        string | null;
  gclid:              string | null;
  fbclid:             string | null;
  session_id:         string | null;
  landing_url:        string | null;
  attribution_json:   AttributionSnapshot | null;
  first_touch_json:   AttributionSnapshot | null;
  last_touch_json:    AttributionSnapshot | null;
}

interface VisitorSessionRow {
  session_id:            string;
  channel:               string | null;
  utm_source:            string | null;
  utm_medium:            string | null;
  utm_campaign:          string | null;
  utm_term:              string | null;
  utm_content:           string | null;
  gclid:                 string | null;
  fbclid:                string | null;
  ref:                   string | null;
  landing_url:           string | null;
  referrer:              string | null;
  device:                string | null;
  user_agent:            string | null;
  geo:                   Record<string, unknown> | null;
  chat_opened_at:        string | null;
  first_message_at:      string | null;
  assessment_started_at: string | null;
  paid_at:               string | null;
  created_at:            string;
  updated_at:            string;
  last_seen_at:          string | null;
  current_page:          string | null;
  page_count:            number | null;
  confirmation_id:       string | null;
}

interface EventRow {
  event_id:   string;
  session_id: string;
  event_name: string;
  page_url:   string | null;
  props:      Record<string, unknown> | null;
  created_at: string;
}

interface AttributionJourneyTabProps {
  order: { id: string; confirmation_id: string; created_at: string };
}

// Orders predating this date had no client-side tracking — banner shown.
const TRACKING_ENABLED_AT = "2026-04-21T00:00:00.000Z";

// Matches the get_live_visitors RPC's default window.
const LIVE_ACTIVE_WINDOW_MS = 90_000;

// ── Event visual taxonomy ─────────────────────────────────────────────────

type EventCategory = "page" | "cta" | "assessment" | "payment" | "recovery" | "order" | "provider" | "other";

interface EventVisual {
  category: EventCategory;
  label:    string;
  icon:     string;
  /** Pill color classes (chip background). */
  chip:     string;
  /** Tint for the timeline dot. */
  dot:      string;
}

const EVENT_VISUALS: Record<string, EventVisual> = {
  page_view: {
    category: "page",
    label:    "Page view",
    icon:     "ri-file-list-3-line",
    chip:     "bg-gray-50 text-gray-700 border-gray-200",
    dot:      "bg-gray-400",
  },
  cta_click: {
    category: "cta",
    label:    "CTA click",
    icon:     "ri-cursor-line",
    chip:     "bg-sky-50 text-sky-700 border-sky-200",
    dot:      "bg-sky-500",
  },
  assessment_started: {
    category: "assessment",
    label:    "Assessment started",
    icon:     "ri-edit-line",
    chip:     "bg-amber-50 text-amber-700 border-amber-200",
    dot:      "bg-amber-500",
  },
  assessment_step_view: {
    category: "assessment",
    label:    "Assessment step",
    icon:     "ri-edit-line",
    chip:     "bg-amber-50 text-amber-700 border-amber-200",
    dot:      "bg-amber-500",
  },
  assessment_completed: {
    category: "assessment",
    label:    "Assessment completed",
    icon:     "ri-checkbox-circle-line",
    chip:     "bg-amber-50 text-amber-800 border-amber-300",
    dot:      "bg-amber-600",
  },
  payment_attempted: {
    category: "payment",
    label:    "Payment attempted",
    icon:     "ri-bank-card-line",
    chip:     "bg-violet-50 text-violet-700 border-violet-200",
    dot:      "bg-violet-500",
  },
  payment_success: {
    category: "payment",
    label:    "Payment success",
    icon:     "ri-checkbox-circle-fill",
    chip:     "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot:      "bg-emerald-500",
  },
  recovery_email_sent: {
    category: "recovery",
    label:    "Recovery email",
    icon:     "ri-mail-send-line",
    chip:     "bg-rose-50 text-rose-700 border-rose-200",
    dot:      "bg-rose-500",
  },
  recovery_sms_sent: {
    category: "recovery",
    label:    "Recovery SMS",
    icon:     "ri-message-3-line",
    chip:     "bg-rose-50 text-rose-700 border-rose-200",
    dot:      "bg-rose-500",
  },
  recovery_click: {
    category: "recovery",
    label:    "Recovery click",
    icon:     "ri-cursor-line",
    chip:     "bg-rose-50 text-rose-700 border-rose-200",
    dot:      "bg-rose-500",
  },
  recovery_conversion: {
    category: "recovery",
    label:    "Recovery conversion",
    icon:     "ri-shield-check-line",
    chip:     "bg-emerald-50 text-emerald-800 border-emerald-300",
    dot:      "bg-emerald-600",
  },
};

function visualForEvent(name: string): EventVisual {
  return (
    EVENT_VISUALS[name] ?? {
      category: "other",
      label:    name,
      icon:     "ri-pulse-line",
      chip:     "bg-gray-50 text-gray-700 border-gray-200",
      dot:      "bg-gray-400",
    }
  );
}

// ── Component ─────────────────────────────────────────────────────────────

export default function AttributionJourneyTab({ order }: AttributionJourneyTabProps) {
  const [loading,        setLoading]        = useState(true);
  const [orderRow,       setOrderRow]       = useState<OrderRow | null>(null);
  const [orderErr,       setOrderErr]       = useState<string | null>(null);
  const [visitorSession, setVisitorSession] = useState<VisitorSessionRow | null>(null);
  const [visitorErr,     setVisitorErr]     = useState<string | null>(null);
  const [events,         setEvents]         = useState<EventRow[]>([]);
  const [eventsErr,      setEventsErr]      = useState<string | null>(null);
  const [showAllEvents,  setShowAllEvents]  = useState(false);
  const [reverseOrder,   setReverseOrder]   = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [linkedChats,    setLinkedChats]    = useState<number | null>(null);
  const [copiedSession,  setCopiedSession]  = useState(false);
  const [nowTick,        setNowTick]        = useState(Date.now());

  // Fetch order row's full attribution shape (parent only passed id+conf+created_at).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    supabase
      .from("orders")
      .select("id, confirmation_id, created_at, paid_at, payment_intent_id, doctor_status, referred_by, utm_source, utm_medium, utm_campaign, utm_term, utm_content, gclid, fbclid, session_id, landing_url, attribution_json, first_touch_json, last_touch_json")
      .eq("id", order.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setOrderErr(error.message);
          setOrderRow(null);
          setLoading(false);
          return;
        }
        setOrderRow((data as OrderRow | null) ?? null);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [order.id]);

  // Fetch visitor_sessions row + events for the order's session_id.
  useEffect(() => {
    if (!orderRow?.session_id) {
      setVisitorSession(null);
      setEvents([]);
      return;
    }

    const sessionId = orderRow.session_id;
    let cancelled = false;
    setVisitorErr(null);
    setEventsErr(null);

    supabase
      .rpc("get_admin_visitor_session_by_id", { p_session_id: sessionId })
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setVisitorErr(error.message);
            setVisitorSession(null);
            return;
          }
          const rows = (data as VisitorSessionRow[] | null) ?? [];
          setVisitorSession(rows[0] ?? null);
        },
        (err: unknown) => {
          if (cancelled) return;
          setVisitorErr(err instanceof Error ? err.message : String(err));
          setVisitorSession(null);
        },
      );

    supabase
      .rpc("get_visitor_journey", { p_session_id: sessionId, p_limit: 200 })
      .then(
        ({ data, error }) => {
          if (cancelled) return;
          if (error) {
            setEventsErr(error.message);
            setEvents([]);
            return;
          }
          setEvents(((data as EventRow[] | null) ?? []));
        },
        (err: unknown) => {
          if (cancelled) return;
          setEventsErr(err instanceof Error ? err.message : String(err));
          setEvents([]);
        },
      );

    return () => { cancelled = true; };
  }, [orderRow?.session_id]);

  // Lightweight cross-link: how many chat_sessions are wired to this
  // visitor_session_id? COUNT-only query — admin scope already enforced
  // by the existing chat_sessions admin reads elsewhere in the panel.
  useEffect(() => {
    if (!orderRow?.session_id) { setLinkedChats(null); return; }
    let cancelled = false;
    supabase
      .from("chat_sessions")
      .select("id", { count: "exact", head: true })
      .eq("visitor_session_id", orderRow.session_id)
      .then(({ count, error }) => {
        if (cancelled) return;
        if (error) { setLinkedChats(null); return; }
        setLinkedChats(count ?? 0);
      });
    return () => { cancelled = true; };
  }, [orderRow?.session_id]);

  // Tick once every 10s to keep the LIVE pulse fresh — no network calls
  // are issued by this tick.
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 10_000);
    return () => window.clearInterval(id);
  }, []);

  // ── Derived: classifier output ──────────────────────────────────────────
  const classification = useMemo(() => {
    if (!orderRow) return null;
    return classifyOrder({
      utm_source:        orderRow.utm_source,
      utm_medium:        orderRow.utm_medium,
      utm_campaign:      orderRow.utm_campaign,
      gclid:             orderRow.gclid,
      fbclid:            orderRow.fbclid,
      referred_by:       orderRow.referred_by,
      first_touch_json:  orderRow.first_touch_json,
      last_touch_json:   orderRow.last_touch_json,
    });
  }, [orderRow]);

  // ── Source detail — where did the signal come from? ────────────────────
  const signalSource = useMemo(() => {
    if (!orderRow) return null;
    if (orderRow.gclid || orderRow.fbclid) return "Order click ID (gclid/fbclid)";
    if (orderRow.utm_source || orderRow.utm_medium || orderRow.utm_campaign)
      return "Order UTM parameters";
    if (orderRow.attribution_json && Object.keys(orderRow.attribution_json).length > 0)
      return "Order attribution_json snapshot";
    if (orderRow.last_touch_json && Object.keys(orderRow.last_touch_json).length > 0)
      return "Order last_touch_json snapshot";
    if (orderRow.first_touch_json && Object.keys(orderRow.first_touch_json).length > 0)
      return "Order first_touch_json snapshot";
    if (orderRow.referred_by) return "Order referred_by (legacy)";
    if (visitorSession) return "Visitor session linked by session_id";
    return "No attribution signal captured";
  }, [orderRow, visitorSession]);

  // ── Landing fields — coalesce best available ────────────────────────────
  const landing = useMemo(() => {
    if (!orderRow) return null;
    const pickFirst = (s: AttributionSnapshot | null | undefined, k: keyof AttributionSnapshot) => {
      const v = s?.[k];
      return typeof v === "string" && v.trim() ? v : null;
    };
    return {
      landing_url:   orderRow.landing_url ?? pickFirst(orderRow.last_touch_json, "landing_url")  ?? pickFirst(orderRow.first_touch_json, "landing_url")  ?? visitorSession?.landing_url   ?? null,
      referrer:                              pickFirst(orderRow.last_touch_json, "referrer")     ?? pickFirst(orderRow.first_touch_json, "referrer")     ?? visitorSession?.referrer      ?? null,
      utm_source:    orderRow.utm_source   ?? pickFirst(orderRow.last_touch_json, "utm_source")  ?? pickFirst(orderRow.first_touch_json, "utm_source")  ?? visitorSession?.utm_source    ?? null,
      utm_medium:    orderRow.utm_medium   ?? pickFirst(orderRow.last_touch_json, "utm_medium")  ?? pickFirst(orderRow.first_touch_json, "utm_medium")  ?? visitorSession?.utm_medium    ?? null,
      utm_campaign:  orderRow.utm_campaign ?? pickFirst(orderRow.last_touch_json, "utm_campaign")?? pickFirst(orderRow.first_touch_json, "utm_campaign")?? visitorSession?.utm_campaign  ?? null,
      utm_term:      orderRow.utm_term     ?? pickFirst(orderRow.last_touch_json, "utm_term")    ?? pickFirst(orderRow.first_touch_json, "utm_term")    ?? visitorSession?.utm_term      ?? null,
      utm_content:   orderRow.utm_content  ?? pickFirst(orderRow.last_touch_json, "utm_content") ?? pickFirst(orderRow.first_touch_json, "utm_content") ?? visitorSession?.utm_content   ?? null,
      gclid:         orderRow.gclid        ?? pickFirst(orderRow.last_touch_json, "gclid")       ?? pickFirst(orderRow.first_touch_json, "gclid")       ?? visitorSession?.gclid         ?? null,
      fbclid:        orderRow.fbclid       ?? pickFirst(orderRow.last_touch_json, "fbclid")      ?? pickFirst(orderRow.first_touch_json, "fbclid")      ?? visitorSession?.fbclid        ?? null,
    };
  }, [orderRow, visitorSession]);

  // ── LIVE pulse: is the visitor still active right now? ─────────────────
  const isLive = useMemo(() => {
    if (!visitorSession?.last_seen_at) return false;
    const ageMs = nowTick - new Date(visitorSession.last_seen_at).getTime();
    return ageMs >= 0 && ageMs < LIVE_ACTIVE_WINDOW_MS;
  }, [visitorSession?.last_seen_at, nowTick]);

  // ── Page Journey Intelligence metrics ──────────────────────────────────
  const journeyMetrics = useMemo(() => {
    if (!orderRow) return null;
    if (events.length === 0 && !visitorSession) return null;

    const pageViews = events.filter((e) => e.event_name === "page_view" && e.page_url);
    const entryPage = pageViews[0]?.page_url ?? visitorSession?.landing_url ?? null;

    // Most-engaged page = sum of dwell deltas between consecutive events on
    // the same page_url. Clamp delta to <30min so a single tab-left-open
    // session doesn't dominate the chart.
    const pageDwell = new Map<string, number>();
    for (let i = 0; i < events.length - 1; i++) {
      const e = events[i];
      const next = events[i + 1];
      if (!e.page_url) continue;
      const delta = new Date(next.created_at).getTime() - new Date(e.created_at).getTime();
      if (delta > 0 && delta < 30 * 60 * 1000) {
        const k = pathOnly(e.page_url);
        pageDwell.set(k, (pageDwell.get(k) ?? 0) + delta);
      }
    }
    let topPage:   string | null = null;
    let topMs:     number        = 0;
    for (const [p, ms] of pageDwell) {
      if (ms > topMs) { topMs = ms; topPage = p; }
    }

    // Last page before payment success / order created (whichever earliest).
    const paidAt = orderRow.paid_at ?? visitorSession?.paid_at ?? null;
    const conversionTs = paidAt ? new Date(paidAt).getTime() : new Date(orderRow.created_at).getTime();
    let lastPageBefore: string | null = null;
    if (conversionTs) {
      for (const e of pageViews) {
        if (new Date(e.created_at).getTime() < conversionTs) {
          lastPageBefore = e.page_url ?? lastPageBefore;
        }
      }
    }

    // Time to convert = conversion - first session activity.
    const firstSeenIso = visitorSession?.created_at ?? events[0]?.created_at ?? null;
    let timeToConvertMin: number | null = null;
    if (firstSeenIso) {
      const delta = conversionTs - new Date(firstSeenIso).getTime();
      if (Number.isFinite(delta) && delta >= 0) {
        timeToConvertMin = Math.round(delta / 60_000);
      }
    }

    const pageCount = visitorSession?.page_count ?? pageViews.length;

    return {
      entryPage,
      lastPageBefore,
      topPage,
      topDwellMs: topMs,
      timeToConvertMin,
      pageCount,
      eventCount: events.length,
    };
  }, [events, visitorSession, orderRow]);

  // ── Grouped events for the journey list ────────────────────────────────
  // Consecutive page_view events collapse into one row labelled
  // "Browsed N pages" with an expand toggle. Anything non-page_view stays
  // as its own row so admins can scan the meaningful milestones at a glance.
  type DisplayItem =
    | { kind: "event"; id: string; event: EventRow }
    | { kind: "group"; id: string; events: EventRow[] };

  const groupedEvents = useMemo<DisplayItem[]>(() => {
    const out: DisplayItem[] = [];
    let buffer: EventRow[] = [];
    const flushBuffer = () => {
      if (buffer.length === 0) return;
      if (buffer.length === 1) {
        const e = buffer[0];
        out.push({ kind: "event", id: e.event_id, event: e });
      } else {
        out.push({ kind: "group", id: `grp_${buffer[0].event_id}`, events: buffer });
      }
      buffer = [];
    };
    for (const e of events) {
      if (e.event_name === "page_view") {
        buffer.push(e);
      } else {
        flushBuffer();
        out.push({ kind: "event", id: e.event_id, event: e });
      }
    }
    flushBuffer();
    return reverseOrder ? [...out].reverse() : out;
  }, [events, reverseOrder]);

  const isHistorical = new Date(order.created_at) < new Date(TRACKING_ENABLED_AT);
  const hasAnyAttribution =
    !!(orderRow && (orderRow.utm_source || orderRow.gclid || orderRow.fbclid || orderRow.referred_by || orderRow.session_id ||
      (orderRow.attribution_json && Object.keys(orderRow.attribution_json).length > 0)));

  // ── Render guards ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 text-gray-400">
          <i className="ri-loader-4-line animate-spin text-2xl"></i>
          <span className="text-sm">Loading attribution + journey…</span>
        </div>
      </div>
    );
  }

  if (orderErr) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-bold text-red-700 mb-1">Could not load order attribution</p>
          <p className="text-[10px] text-red-500 font-mono break-all">{orderErr}</p>
        </div>
      </div>
    );
  }

  if (!orderRow) {
    return <div className="p-6 text-sm text-gray-500">Order not found.</div>;
  }

  const visClass = classification && ACQUISITION_VISUAL[classification.label as AcquisitionLabel];

  const visibleItems = showAllEvents ? groupedEvents : groupedEvents.slice(0, 20);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Historical banner */}
      {isHistorical && !hasAnyAttribution && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-xs text-amber-700">
            <i className="ri-information-line mr-1"></i>
            Journey data may be limited for orders created before tracking was enabled.
          </p>
        </div>
      )}

      {/* ── 1. Source Summary ─────────────────────────────────────────── */}
      <Section icon="ri-compass-3-line" iconTint="emerald" title="Source Summary">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Canonical source">
            {classification && visClass ? (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${visClass.color}`}>
                <i className={`${visClass.icon} text-xs`}></i>
                {visClass.label}
              </span>
            ) : (
              <span className="text-xs text-gray-400">—</span>
            )}
          </Field>
          <Field label="Confidence">
            <span className={`text-xs font-bold ${classification?.confidence === "high" ? "text-emerald-700" : classification?.confidence === "medium" ? "text-amber-700" : "text-gray-500"}`}>
              {classification?.confidence ?? "—"}
            </span>
          </Field>
          <Field label="Signal source">
            <span className="text-xs text-gray-700">{signalSource ?? "—"}</span>
          </Field>
        </div>
        {classification?.reasoning && (
          <p className="text-[11px] text-gray-500 leading-snug mt-3 italic">
            {classification.reasoning}
          </p>
        )}
      </Section>

      {/* ── 2. Landing Page ──────────────────────────────────────────── */}
      <Section icon="ri-window-line" iconTint="violet" title="Landing Page">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Landing URL">
            {landing?.landing_url ? (
              <span className="text-xs font-mono text-gray-700 break-all">{landing.landing_url}</span>
            ) : <Dash />}
          </Field>
          <Field label="Referrer">
            {landing?.referrer ? (
              <span className="text-xs font-mono text-gray-700 break-all">{landing.referrer}</span>
            ) : <Dash />}
          </Field>
          <Field label="UTM source">{landing?.utm_source ? <Pill value={landing.utm_source} /> : <Dash />}</Field>
          <Field label="UTM medium">{landing?.utm_medium ? <Pill value={landing.utm_medium} /> : <Dash />}</Field>
          <Field label="UTM campaign">{landing?.utm_campaign ? <Pill value={landing.utm_campaign} /> : <Dash />}</Field>
          <Field label="UTM content">{landing?.utm_content ? <Pill value={landing.utm_content} /> : <Dash />}</Field>
          <Field label="UTM term">{landing?.utm_term ? <Pill value={landing.utm_term} /> : <Dash />}</Field>
          <Field label="gclid / fbclid">
            <div className="flex flex-wrap gap-1">
              {landing?.gclid  && <Pill value={`gclid: ${shortId(landing.gclid)}`}  />}
              {landing?.fbclid && <Pill value={`fbclid: ${shortId(landing.fbclid)}`} />}
              {!landing?.gclid && !landing?.fbclid && <Dash />}
            </div>
          </Field>
        </div>
      </Section>

      {/* ── 3. Session Link + Cross-links ────────────────────────────── */}
      <Section
        icon="ri-link"
        iconTint="sky"
        title="Session Link"
        headerRight={
          orderRow.session_id ? (
            <div className="flex items-center gap-2">
              {isLive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  LIVE now
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  if (!orderRow.session_id) return;
                  try {
                    void navigator.clipboard.writeText(orderRow.session_id);
                    setCopiedSession(true);
                    window.setTimeout(() => setCopiedSession(false), 1500);
                  } catch { /* ignore */ }
                }}
                className="text-[10px] px-2 py-0.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer inline-flex items-center gap-1"
                title="Copy session_id"
              >
                <i className={copiedSession ? "ri-check-line text-emerald-600" : "ri-file-copy-line"} />
                {copiedSession ? "Copied" : "Copy ID"}
              </button>
            </div>
          ) : null
        }
      >
        {!orderRow.session_id ? (
          <p className="text-xs text-gray-500">
            <i className="ri-information-line mr-1"></i>
            No session_id linked on this order. {isHistorical
              ? "Order predates session tracking."
              : "Session may not have been captured at checkout."}
          </p>
        ) : visitorErr ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700">Visitor session details unavailable.</p>
            <p className="text-[10px] text-amber-500 font-mono mt-1 break-all">{visitorErr}</p>
          </div>
        ) : !visitorSession ? (
          <p className="text-xs text-gray-500">
            <i className="ri-information-line mr-1"></i>
            Session {orderRow.session_id.slice(0, 8)}… is linked but no matching visitor_sessions row exists. Heartbeat may not have fired.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Session ID">
                <span className="text-xs font-mono text-gray-700">{visitorSession.session_id.slice(0, 8)}…</span>
              </Field>
              <Field label="First seen">{fmtDt(visitorSession.created_at)}</Field>
              <Field label="Last seen">{fmtDt(visitorSession.last_seen_at)}</Field>
              <Field label="Pages viewed"><span className="text-xs font-bold">{visitorSession.page_count ?? 0}</span></Field>
              <Field label="Current / last page">
                {visitorSession.current_page ? <span className="text-xs font-mono text-gray-700 break-all">{visitorSession.current_page}</span> : <Dash />}
              </Field>
              <Field label="Device">
                {visitorSession.device ? <Pill value={visitorSession.device} /> : <Dash />}
              </Field>
              <Field label="Geo">
                {visitorSession.geo
                  ? <span className="text-xs text-gray-700">{formatGeo(visitorSession.geo)}</span>
                  : <Dash />}
              </Field>
              <Field label="Channel">
                {visitorSession.channel ? <Pill value={visitorSession.channel} /> : <Dash />}
              </Field>
              <Field label="Linked chats">
                {linkedChats === null
                  ? <Dash />
                  : linkedChats === 0
                    ? <span className="text-xs text-gray-400">none</span>
                    : <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                        <i className="ri-chat-3-line" />
                        {linkedChats} {linkedChats === 1 ? "session" : "sessions"}
                      </span>}
              </Field>
            </div>

            {/* Cross-links toolbar */}
            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest font-bold text-gray-400 mr-1">
                Cross-links
              </span>
              <button
                type="button"
                onClick={() => window.open("/admin-orders?tab=communications&sub=live", "_blank", "noopener")}
                disabled={!isLive}
                className={`text-[11px] px-2.5 py-1 rounded-md border inline-flex items-center gap-1.5 ${
                  isLive
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                    : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                }`}
                title={isLive ? "Open Live Visitors in a new tab" : "Visitor not currently active"}
              >
                <i className="ri-pulse-line" />
                {isLive ? "Open Live Visitors" : "Visitor offline"}
              </button>
              {linkedChats !== null && linkedChats > 0 && (
                <button
                  type="button"
                  onClick={() => window.open("/admin-orders?tab=communications&sub=chats", "_blank", "noopener")}
                  className="text-[11px] px-2.5 py-1 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 cursor-pointer inline-flex items-center gap-1.5"
                  title="Open Chats in a new tab"
                >
                  <i className="ri-chat-3-line" />
                  Open chats
                </button>
              )}
            </div>
          </>
        )}
      </Section>

      {/* ── 4. Journey Intelligence ───────────────────────────────────── */}
      {journeyMetrics && (
        <Section icon="ri-bar-chart-2-line" iconTint="indigo" title="Journey Intelligence">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard
              icon="ri-login-box-line"
              label="Entry page"
              value={journeyMetrics.entryPage ? pathOnly(journeyMetrics.entryPage) : "—"}
              tint="violet"
            />
            <MetricCard
              icon="ri-pages-line"
              label="Pages visited"
              value={`${journeyMetrics.pageCount} ${journeyMetrics.pageCount === 1 ? "page" : "pages"}`}
              sub={`${journeyMetrics.eventCount} events total`}
              tint="sky"
            />
            <MetricCard
              icon="ri-time-line"
              label="Time to convert"
              value={journeyMetrics.timeToConvertMin === null
                ? "—"
                : journeyMetrics.timeToConvertMin < 1
                  ? "under 1 min"
                  : journeyMetrics.timeToConvertMin < 60
                    ? `${journeyMetrics.timeToConvertMin} min`
                    : `${Math.floor(journeyMetrics.timeToConvertMin / 60)}h ${journeyMetrics.timeToConvertMin % 60}m`}
              sub={journeyMetrics.timeToConvertMin !== null ? "from first visit" : undefined}
              tint="emerald"
            />
            <MetricCard
              icon="ri-fire-line"
              label="Most engaged page"
              value={journeyMetrics.topPage ?? "—"}
              sub={journeyMetrics.topDwellMs > 0 ? `${Math.round(journeyMetrics.topDwellMs / 1000)}s` : undefined}
              tint="amber"
            />
            <MetricCard
              icon="ri-logout-box-r-line"
              label="Last page before payment"
              value={journeyMetrics.lastPageBefore ? pathOnly(journeyMetrics.lastPageBefore) : "—"}
              tint="rose"
            />
            <MetricCard
              icon="ri-shield-check-line"
              label="Conversion"
              value={orderRow.paid_at ? "Paid" : orderRow.payment_intent_id ? "Attempted" : "Created"}
              sub={fmtDt(orderRow.paid_at ?? orderRow.created_at)}
              tint={orderRow.paid_at ? "emerald" : "gray"}
            />
          </div>
        </Section>
      )}

      {/* ── 5. Funnel Timeline ────────────────────────────────────────── */}
      <Section icon="ri-flow-chart" iconTint="indigo" title="Funnel Timeline">
        <FunnelTimeline
          steps={[
            { label: "Assessment started",   at: visitorSession?.assessment_started_at ?? null, icon: "ri-edit-line",            tint: "amber"   },
            { label: "Chat opened",          at: visitorSession?.chat_opened_at ?? null,        icon: "ri-chat-3-line",          tint: "sky"     },
            { label: "Order created",        at: orderRow.created_at,                           icon: "ri-shopping-cart-line",   tint: "indigo"  },
            { label: "Payment success",      at: orderRow.paid_at ?? visitorSession?.paid_at ?? null, icon: "ri-bank-card-fill", tint: "emerald" },
            { label: "Provider notified",    at: orderRow.doctor_status === "patient_notified" ? "fired" : null, icon: "ri-user-heart-line", tint: "violet" },
          ]}
        />
      </Section>

      {/* ── 6. Page Journey / Events ──────────────────────────────────── */}
      <Section
        icon="ri-route-line"
        iconTint="amber"
        title={`Page Journey · ${events.length} events`}
        headerRight={
          events.length > 0 ? (
            <button
              type="button"
              onClick={() => setReverseOrder((v) => !v)}
              className="text-[10px] px-2 py-0.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 cursor-pointer inline-flex items-center gap-1"
              title="Toggle event order"
            >
              <i className={reverseOrder ? "ri-sort-desc" : "ri-sort-asc"} />
              {reverseOrder ? "Newest first" : "Oldest first"}
            </button>
          ) : null
        }
      >
        {!orderRow.session_id ? (
          <p className="text-xs text-gray-500">No session_id — no journey to display.</p>
        ) : eventsErr ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-700">Journey events unavailable.</p>
            <p className="text-[10px] text-amber-500 font-mono mt-1 break-all">{eventsErr}</p>
          </div>
        ) : events.length === 0 ? (
          <p className="text-xs text-gray-500">
            <i className="ri-information-line mr-1"></i>
            No events captured for this session. {isHistorical
              ? "Order predates event tracking."
              : "Event capture may not have fired during this visit."}
          </p>
        ) : (
          <>
            <ol className="relative pl-1">
              {visibleItems.map((item) => {
                if (item.kind === "group") {
                  const expanded = expandedGroups.has(item.id);
                  return (
                    <li key={item.id} className="relative flex items-start gap-3 py-1.5">
                      <span className="mt-1 w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() => setExpandedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.id)) next.delete(item.id); else next.add(item.id);
                            return next;
                          })}
                          className="inline-flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-900 cursor-pointer"
                        >
                          <i className={expanded ? "ri-arrow-down-s-line" : "ri-arrow-right-s-line"} />
                          <i className="ri-file-list-3-line text-gray-400" />
                          <span className="font-semibold">Browsed {item.events.length} pages</span>
                          <span className="text-gray-400 font-mono ml-1">
                            {fmtDt(item.events[0].created_at)}
                          </span>
                        </button>
                        {expanded && (
                          <ul className="mt-1.5 ml-5 space-y-1">
                            {item.events.map((e) => (
                              <li key={e.event_id} className="flex items-start gap-2 text-[11px] text-gray-600">
                                <span className="font-mono text-[10px] text-gray-400 w-24 flex-shrink-0 pt-0.5">{fmtDt(e.created_at)}</span>
                                <span className="font-mono truncate" title={e.page_url ?? ""}>
                                  {e.page_url ? pathOnly(e.page_url) : "—"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  );
                }
                const e   = item.event;
                const vis = visualForEvent(e.event_name);
                return (
                  <li key={item.id} className="relative flex items-start gap-3 py-1.5">
                    <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${vis.dot}`} />
                    <span className="font-mono text-[10px] text-gray-400 flex-shrink-0 w-24 pt-0.5">
                      {fmtDt(e.created_at)}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold flex-shrink-0 ${vis.chip}`}>
                      <i className={vis.icon} />
                      {vis.label}
                    </span>
                    {e.page_url && (
                      <span className="text-[10px] text-gray-500 font-mono truncate" title={e.page_url}>
                        {pathOnly(e.page_url)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
            {groupedEvents.length > 20 && (
              <button
                type="button"
                onClick={() => setShowAllEvents((v) => !v)}
                className="mt-3 text-xs font-bold text-[#3b6ea5] hover:underline cursor-pointer"
              >
                {showAllEvents ? "Show first 20" : `Show all ${groupedEvents.length}`}
              </button>
            )}
          </>
        )}
      </Section>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function Section({
  icon, iconTint, title, headerRight, children,
}: {
  icon: string;
  iconTint: "emerald" | "violet" | "sky" | "indigo" | "amber";
  title: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const tints: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    violet:  "bg-violet-50  text-violet-600",
    sky:     "bg-sky-50     text-sky-600",
    indigo:  "bg-indigo-50  text-indigo-600",
    amber:   "bg-amber-50   text-amber-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${tints[iconTint]}`}>
            <i className={`${icon} text-sm`}></i>
          </span>
          <h3 className="text-sm font-extrabold text-gray-900">{title}</h3>
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <div className="min-h-[20px]">{children}</div>
    </div>
  );
}

function Pill({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-gray-200 bg-gray-50 text-[11px] font-semibold text-gray-700">
      {value}
    </span>
  );
}

function Dash() {
  return <span className="text-xs text-gray-300">—</span>;
}

function MetricCard({
  icon, label, value, sub, tint,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  tint: "emerald" | "violet" | "sky" | "indigo" | "amber" | "rose" | "gray";
}) {
  const tints: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    violet:  "bg-violet-50  text-violet-600  border-violet-100",
    sky:     "bg-sky-50     text-sky-600     border-sky-100",
    indigo:  "bg-indigo-50  text-indigo-600  border-indigo-100",
    amber:   "bg-amber-50   text-amber-600   border-amber-100",
    rose:    "bg-rose-50    text-rose-600    border-rose-100",
    gray:    "bg-gray-50    text-gray-600    border-gray-100",
  };
  return (
    <div className={`rounded-lg border p-3 ${tints[tint]}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest opacity-80">
        <i className={icon} />
        {label}
      </div>
      <p className="mt-1 text-xs font-bold text-gray-900 break-words" title={value}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[10px] text-gray-500">{sub}</p>}
    </div>
  );
}

interface TimelineStep {
  label: string;
  at: string | null;
  icon: string;
  tint: "emerald" | "violet" | "sky" | "indigo" | "amber";
}

function FunnelTimeline({ steps }: { steps: TimelineStep[] }) {
  const tints: Record<string, { bg: string; text: string; ring: string }> = {
    emerald: { bg: "bg-emerald-500", text: "text-emerald-700", ring: "ring-emerald-100" },
    violet:  { bg: "bg-violet-500",  text: "text-violet-700",  ring: "ring-violet-100"  },
    sky:     { bg: "bg-sky-500",     text: "text-sky-700",     ring: "ring-sky-100"     },
    indigo:  { bg: "bg-indigo-500",  text: "text-indigo-700",  ring: "ring-indigo-100"  },
    amber:   { bg: "bg-amber-500",   text: "text-amber-700",   ring: "ring-amber-100"   },
  };
  return (
    <ol className="relative">
      {steps.map((s, i) => {
        const fired = !!s.at;
        const t = tints[s.tint];
        const isLast = i === steps.length - 1;
        return (
          <li key={i} className="relative flex items-start gap-3 pb-3 last:pb-0">
            {/* Connector line */}
            {!isLast && (
              <span className={`absolute left-[11px] top-6 w-px h-[calc(100%-12px)] ${fired ? "bg-gray-200" : "bg-gray-100"}`} />
            )}
            {/* Dot with icon */}
            <span
              className={`relative z-10 inline-flex items-center justify-center w-6 h-6 rounded-full ring-4 flex-shrink-0 ${
                fired ? `${t.bg} ${t.ring} text-white` : "bg-gray-200 ring-gray-50 text-gray-400"
              }`}
            >
              <i className={`${s.icon} text-[11px]`} />
            </span>
            <div className="flex-1 flex items-center justify-between min-h-[24px]">
              <span className={`text-xs ${fired ? `font-semibold ${t.text}` : "text-gray-400"}`}>{s.label}</span>
              <span className={`text-[10px] font-mono ${fired ? "text-gray-500" : "text-gray-300"}`}>
                {s.at === "fired" ? "yes" : s.at ? fmtDt(s.at) : "—"}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtDt(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

function pathOnly(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://example.com${url.startsWith("/") ? url : `/${url}`}`);
    return u.pathname || "/";
  } catch {
    return url.split("?")[0] || url;
  }
}

function shortId(v: string): string {
  return v.length > 18 ? `${v.slice(0, 14)}…${v.slice(-4)}` : v;
}

function formatGeo(geo: Record<string, unknown>): string {
  const country = typeof geo.country === "string" ? geo.country : null;
  const region  = typeof geo.region  === "string" ? geo.region  : null;
  const city    = typeof geo.city    === "string" ? geo.city    : null;
  const parts = [city, region, country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}
