// AttributionJourneyTab — Order Detail modal section
//
// Read-only attribution + journey panel for a single order. Shows:
//   1. Source Summary       — canonical classifyOrder() output + reasoning
//   2. Landing Page         — landing URL + referrer + UTMs + click IDs
//   3. Session Link         — orders.session_id ↔ visitor_sessions row
//   4. Funnel Timeline      — assessment / payment / completion milestones
//   5. Page Journey/Events  — events table rows for the linked session_id
//
// Self-fetches everything it needs by order.id — parent OrderDetailModal
// doesn't have to be modified to pass any extra fields beyond the
// existing order prop.
//
// Defensive design: every query has graceful empty/error states. If
// visitor_sessions row or events are missing for a historical order, the
// panel shows a banner explaining tracking wasn't enabled yet — never
// fakes data.

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
  // Anything else gets ignored at the type level but still present at runtime.
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
          // RPC returns table — take first row.
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

  const isHistorical = new Date(order.created_at) < new Date(TRACKING_ENABLED_AT);
  const hasAnyAttribution =
    !!(orderRow && (orderRow.utm_source || orderRow.gclid || orderRow.fbclid || orderRow.referred_by || orderRow.session_id ||
      (orderRow.attribution_json && Object.keys(orderRow.attribution_json).length > 0)));

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

      {/* ── 3. Session Link ──────────────────────────────────────────── */}
      <Section icon="ri-link" iconTint="sky" title="Session Link">
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
            <Field label="Visitor classifier channel">
              {visitorSession.channel ? <Pill value={visitorSession.channel} /> : <Dash />}
            </Field>
          </div>
        )}
      </Section>

      {/* ── 4. Funnel Timeline ──────────────────────────────────────── */}
      <Section icon="ri-flow-chart" iconTint="indigo" title="Funnel Timeline">
        <Timeline
          steps={[
            { label: "Assessment started",   at: visitorSession?.assessment_started_at ?? null },
            { label: "Chat opened",          at: visitorSession?.chat_opened_at ?? null },
            { label: "Order created",        at: orderRow.created_at },
            { label: "Payment success",      at: orderRow.paid_at ?? visitorSession?.paid_at ?? null },
            { label: "Provider notified",    at: orderRow.doctor_status === "patient_notified" ? "fired" : null },
          ]}
        />
      </Section>

      {/* ── 5. Page Journey / Events ────────────────────────────────── */}
      <Section icon="ri-route-line" iconTint="amber" title={`Page Journey · ${events.length} events`}>
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
            <ol className="space-y-1.5">
              {(showAllEvents ? events : events.slice(0, 20)).map((e) => (
                <li key={e.event_id} className="flex items-start gap-3 text-xs">
                  <span className="font-mono text-[10px] text-gray-400 flex-shrink-0 w-32 pt-0.5">{fmtDt(e.created_at)}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-gray-200 bg-white text-[10px] font-bold text-gray-700 flex-shrink-0">
                    {e.event_name}
                  </span>
                  {e.page_url && (
                    <span className="text-[10px] text-gray-500 font-mono truncate" title={e.page_url}>
                      {pathOnly(e.page_url)}
                    </span>
                  )}
                </li>
              ))}
            </ol>
            {events.length > 20 && (
              <button
                type="button"
                onClick={() => setShowAllEvents((v) => !v)}
                className="mt-3 text-xs font-bold text-[#3b6ea5] hover:underline cursor-pointer"
              >
                {showAllEvents ? "Show first 20" : `Show all ${events.length}`}
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
  icon, iconTint, title, children,
}: { icon: string; iconTint: "emerald" | "violet" | "sky" | "indigo" | "amber"; title: string; children: React.ReactNode }) {
  const tints: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600",
    violet:  "bg-violet-50  text-violet-600",
    sky:     "bg-sky-50     text-sky-600",
    indigo:  "bg-indigo-50  text-indigo-600",
    amber:   "bg-amber-50   text-amber-600",
  };
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${tints[iconTint]}`}>
          <i className={`${icon} text-sm`}></i>
        </span>
        <h3 className="text-sm font-extrabold text-gray-900">{title}</h3>
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

interface TimelineStep { label: string; at: string | null }
function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const fired = !!s.at;
        return (
          <li key={i} className="flex items-center gap-3 text-xs">
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${fired ? "bg-emerald-500" : "bg-gray-200"}`}></span>
            <span className={`flex-1 ${fired ? "text-gray-800 font-semibold" : "text-gray-400"}`}>{s.label}</span>
            <span className={`text-[10px] font-mono ${fired ? "text-gray-500" : "text-gray-300"}`}>
              {s.at === "fired" ? "yes" : s.at ? fmtDt(s.at) : "—"}
            </span>
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
