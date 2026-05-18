/**
 * LiveVisitorsPanel — Phase B
 *
 * Reusable visitor-feed body extracted from the original admin-live page
 * so the same view can mount in two places:
 *
 *   1. /admin-orders/live (standalone page, with its own admin auth gate)
 *   2. /admin-orders?tab=communications&sub=live (Communications Hub —
 *      admin auth already enforced by the parent admin-orders shell)
 *
 * The component owns its own polling + render. It does NOT enforce admin
 * auth — callers are responsible for that. Polls the get_live_visitors
 * RPC every 5 seconds. Auto-disappears any session whose last_seen_at
 * falls outside the 90s window.
 *
 * Phase A/B scope: read-only foundation, no realtime, no drawer, no
 * visitor actions, no new RPCs.
 *
 * Phase 1+ (sounds): operational sound notifications are now wired
 * through src/lib/notificationSounds.ts and gated by the
 * AdminSoundControls UI (top-right of every admin page).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
// Phase 1D (2026-05-18): polling consolidated. This panel now reads
// from the shared liveVisitorsPoll engine so the new-visitor chime can
// fire from a single admin-wide monitor (VisitorSoundMonitor) regardless
// of which admin tab is open. The sound wiring previously inlined here
// has been moved into VisitorSoundMonitor — single source of truth.
import {
  subscribeLiveVisitors,
  refreshNow as refreshLiveVisitors,
  LIVE_VISITORS_POLL_MS,
  LIVE_VISITORS_WINDOW_SECONDS,
} from "../../../lib/liveVisitorsPoll";
// Phase K4 — reuse the normalized acquisition classifier so the Live
// Visitors channel chip detects AI referrals, organic search, dark
// social, and the rest, instead of the primitive Direct / Referral /
// raw-utm-source labels the panel shipped with in Phase 1. The classifier
// is a pure function; no realtime / polling / heartbeat changes.
import {
  classifyAcquisition,
  visualFor as visualForAcquisition,
  explain as explainAcquisition,
  type AcquisitionInputs,
} from "../../../lib/acquisitionClassifier";
// Phase K4.5 — click-to-open attribution detail popover, shared with
// OrderCard. Uses the already-loaded LiveVisitor row data — no extra
// fetches, no extra polling, no realtime.
import AttributionDetailsPopover from "../../../components/attribution/AttributionDetailsPopover";

interface LiveVisitor {
  session_id: string;
  current_page: string | null;
  last_seen_at: string;
  first_seen_at: string;
  page_count: number;
  channel: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  gclid: string | null;
  fbclid: string | null;
  ref: string | null;
  landing_url: string | null;
  referrer: string | null;
  device: string | null;
  geo: { country?: string } | null;
  chat_opened_at: string | null;
  first_message_at: string | null;
  assessment_started_at: string | null;
  paid_at: string | null;
  // ── 2026-05-19 identity join (LEFT JOIN orders.session_id) ───────────
  // ATTR-RESUME-SESSION-IDENTITY-SYNC (2026-05-19): RPC matches orders
  // by session_id OR confirmation_id. order_id + order_payment_intent_id
  // let the panel render the order chip without a second fetch, so
  // resume / recovery visitors (Session 2) also surface as the real
  // customer with their PT-XXXX chip.
  order_id: string | null;
  order_confirmation_id: string | null;
  order_first_name: string | null;
  order_last_name: string | null;
  order_email: string | null;
  order_status: string | null;
  order_paid_at: string | null;
  order_doctor_status: string | null;
  order_payment_intent_id: string | null;
  // CHAT-IDENTITY-NO-DOWNGRADE (2026-05-19): chat-side fallback so a
  // visitor who opens chat without a linked order still surfaces by
  // their chat-provided name/email rather than collapsing back to the
  // anonymous short-id.
  chat_visitor_name: string | null;
  chat_visitor_email: string | null;
}

/**
 * Resolve the best-available display identity for a Live Visitor row.
 *
 * Priority (per CHAT-IDENTITY-NO-DOWNGRADE):
 *   1. Customer first+last name from the linked order (after Step 2).
 *   2. Linked order email.
 *   3. Chat-provided visitor name (from chat_sessions.visitor_name).
 *   4. Chat-provided visitor email (from chat_sessions.visitor_email).
 *   5. Anonymous short id fallback (Visitor · #XXXXX).
 *
 * Merge-only semantics: a known order identity ALWAYS wins over any
 * chat-side identity, so opening chat can never downgrade a row that
 * had already resolved to a real name/email.
 */
function resolveVisitorIdentity(v: LiveVisitor): {
  name: string;
  email: string | null;
  anonymous: boolean;
} {
  const first = (v.order_first_name ?? "").trim();
  const last = (v.order_last_name ?? "").trim();
  const orderEmail = (v.order_email ?? "").trim() || null;
  if (first || last) {
    return { name: [first, last].filter(Boolean).join(" "), email: orderEmail, anonymous: false };
  }
  if (orderEmail) return { name: orderEmail, email: orderEmail, anonymous: false };
  const chatName = (v.chat_visitor_name ?? "").trim();
  const chatEmail = (v.chat_visitor_email ?? "").trim() || null;
  if (chatName) return { name: chatName, email: chatEmail, anonymous: false };
  if (chatEmail) return { name: chatEmail, email: chatEmail, anonymous: false };
  const tail = v.session_id.replace(/-/g, "").slice(-5).toLowerCase();
  return { name: `Visitor · #${tail}`, email: null, anonymous: true };
}

/**
 * Compact status pill for the linked order: Lead / Paid / Unassigned /
 * Completed / etc. Returns null when no order is linked.
 */
function orderStatusPill(v: LiveVisitor): { label: string; tone: string } | null {
  if (!v.order_confirmation_id) return null;
  // Doctor states win when paid + assigned.
  if (v.order_doctor_status === "patient_notified") {
    return { label: "Completed", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (v.order_status === "refunded" || v.order_status === "cancelled") {
    return { label: v.order_status === "refunded" ? "Refunded" : "Cancelled", tone: "bg-red-50 text-red-600 border-red-200" };
  }
  // Paid but no provider yet.
  if ((v.order_paid_at || v.order_status === "paid") && !v.order_doctor_status) {
    return { label: "Paid · Unassigned", tone: "bg-sky-50 text-sky-700 border-sky-200" };
  }
  if (v.order_paid_at || v.order_status === "paid") {
    return { label: "Paid", tone: "bg-sky-50 text-sky-700 border-sky-200" };
  }
  return { label: "Lead", tone: "bg-amber-50 text-amber-700 border-amber-200" };
}

// Visitor Journey Intelligence — per-session order summary returned by the
// lightweight batched orders lookup below. Lets us render an "Order #PT-…"
// chip on Live Visitors rows where an order has already been placed.
interface SessionOrderRef {
  id:               string;
  confirmation_id:  string;
  paid_at:          string | null;
  payment_intent_id: string | null;
  doctor_status:    string | null;
}

// Polling cadence and visitor activity window now live in
// src/lib/liveVisitorsPoll.ts. Re-export the constants under the panel's
// original names so the existing JSX (header copy, empty state) reads
// the canonical values without any text drift.
const POLL_MS        = LIVE_VISITORS_POLL_MS;
const WINDOW_SECONDS = LIVE_VISITORS_WINDOW_SECONDS;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

function durationLabel(firstIso: string, lastIso: string): string {
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

/**
 * Phase K4 — classify a Live Visitor row using every attribution signal
 * the get_live_visitors RPC already returns (referrer + landing_url +
 * utm_* + click IDs + ref). Mirrors the Orders / OrderCard wiring so
 * a single classifier owns the channel taxonomy across the admin app.
 *
 * The classifier is a pure function — no network, no React state, no
 * realtime — so calling it inside the live polling render is cheap.
 * The legacy channelLabel() heuristics are subsumed by the classifier
 * (utm_source / channel keys / click IDs all covered).
 */
function classifyLiveVisitor(v: LiveVisitor) {
  const inputs: AcquisitionInputs = {
    utm_source:   v.utm_source,
    utm_medium:   v.utm_medium,
    utm_campaign: v.utm_campaign,
    gclid:        v.gclid,
    fbclid:       v.fbclid,
    ref:          v.ref,
    referrer:     v.referrer,
    landing_url:  v.landing_url,
  };
  return classifyAcquisition(inputs);
}

function anonLabel(sessionId: string): string {
  const tail = sessionId.replace(/-/g, "").slice(-5).toLowerCase();
  return `Visitor · #${tail}`;
}

function milestoneChips(v: LiveVisitor): { label: string; tone: string }[] {
  const out: { label: string; tone: string }[] = [];
  if (v.chat_opened_at)        out.push({ label: "Chat",       tone: "bg-blue-50 text-blue-700"       });
  if (v.assessment_started_at) out.push({ label: "Assessment", tone: "bg-amber-50 text-amber-700"     });
  if (v.paid_at)               out.push({ label: "Paid",       tone: "bg-emerald-50 text-emerald-700" });
  return out;
}

interface Props {
  /**
   * Render a "← Back to Orders" link in the header. The standalone
   * /admin-orders/live page sets this to true; the Communications Hub
   * sets it to false because the hub's own sub-tab strip provides
   * navigation back into the admin shell.
   */
  showBackToOrders?: boolean;
}

export default function LiveVisitorsPanel({ showBackToOrders = false }: Props) {
  const navigate = useNavigate();
  const [rows, setRows]             = useState<LiveVisitor[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // ── Subscribe to the shared live-visitors poll engine ──────────────────
  // ATTR-RESUME-SESSION-IDENTITY-SYNC (2026-05-19): the per-row linked-
  // order chip was previously hydrated by a batched
  // `.in("session_id", [...])` lookup. That worked for Session 1
  // visitors but missed Session 2 (resume) — their session_id is not on
  // any orders row (sticky orders.session_id stays at Session 1's id).
  // get_live_visitors now matches orders by session_id OR
  // confirmation_id and returns order_id + order_payment_intent_id
  // directly, so the chip is derived inline per row — no second fetch.
  // Polling is owned by src/lib/liveVisitorsPoll.ts.
  useEffect(() => {
    const unsubscribe = subscribeLiveVisitors((snap) => {
      setRows(snap.visitors);
      setError(snap.error);
    });
    return unsubscribe;
  }, []);

  // Manual Refresh button — forces an out-of-band fetch on the shared
  // engine. Local refreshing flag is held only for the duration of the
  // promise so the button shows "Refreshing…".
  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refreshLiveVisitors();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing]);

  // Phase K4.5 — only one attribution popover can be open at a time.
  // Keyed by session_id so closing/opening is a clean state flip.
  const [attrOpenId, setAttrOpenId] = useState<string | null>(null);

  // Tick every second so "last seen Xs ago" stays accurate between polls.
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((n) => (n + 1) % 1_000_000), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const activeCount = rows.length;

  // Visitor Journey Intelligence — header summary: how many of the live
  // visitors already have an order in flight? Derived from the RPC's
  // order_confirmation_id column so resume / recovery visitors who
  // matched via confirmation_id (not session_id) also count.
  const convertingCount = useMemo(() => {
    let n = 0;
    for (const v of rows) {
      if (v.order_confirmation_id) n++;
    }
    return n;
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-gray-900">Live Visitors</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              {activeCount}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount === 0
              ? "No visitors active right now."
              : `${activeCount} ${activeCount === 1 ? "visitor" : "visitors"} active in the last ${WINDOW_SECONDS}s${convertingCount > 0 ? ` · ${convertingCount} linked to an order` : ""}.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="text-sm px-3 py-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 disabled:opacity-50"
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          {showBackToOrders && (
            <button
              type="button"
              onClick={() => navigate("/admin-orders")}
              className="text-sm px-3 py-1.5 rounded-md text-gray-500 hover:text-gray-700"
            >
              ← Back to Orders
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-md bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {activeCount === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 px-6 py-16 text-center">
          <i className="ri-pulse-line text-4xl text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            Polling every {POLL_MS / 1000}s. New visitors will appear here as they arrive.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {rows.map((v) => {
            const chips      = milestoneChips(v);
            // ATTR-RESUME-SESSION-IDENTITY-SYNC (2026-05-19): chip is
            // derived inline from the RPC's order_* columns so both
            // session_id-matched (Session 1) AND confirmation_id-matched
            // (Session 2 resume) visitors render the order pill.
            const linkedOrder: SessionOrderRef | null = v.order_confirmation_id
              ? {
                  id:                v.order_id ?? "",
                  confirmation_id:   v.order_confirmation_id,
                  paid_at:           v.order_paid_at,
                  payment_intent_id: v.order_payment_intent_id,
                  doctor_status:     v.order_doctor_status,
                }
              : null;
            // Identity comes from the get_live_visitors LEFT JOIN orders
            // (session_id OR confirmation_id). Once Step 2 of the
            // assessment saves with a session_id linkage OR a resume
            // session stamps visitor_sessions.confirmation_id, the next
            // 5s poll surfaces the customer's real name + email here.
            const identity   = resolveVisitorIdentity(v);
            const orderPill  = orderStatusPill(v);
            return (
              <div
                key={v.session_id}
                className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span
                      className={`font-medium truncate ${identity.anonymous ? "text-gray-900" : "text-gray-900"}`}
                      title={identity.anonymous ? v.session_id : `${identity.name}${identity.email ? ` <${identity.email}>` : ""}`}
                    >
                      {identity.name}
                    </span>
                    {orderPill && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${orderPill.tone}`}
                      >
                        {orderPill.label}
                      </span>
                    )}
                    {v.device && (
                      <span className="text-xs text-gray-400 inline-flex items-center gap-1">
                        ·
                        <i className={v.device === "mobile" ? "ri-smartphone-line" : "ri-computer-line"} />
                        {v.device}
                      </span>
                    )}
                    {v.geo?.country && (
                      <span className="text-xs text-gray-400">· {v.geo.country}</span>
                    )}
                  </div>
                  {!identity.anonymous && identity.email && (
                    <div className="mt-0.5 text-xs text-gray-500 truncate" title={identity.email}>
                      {identity.email}
                    </div>
                  )}
                  <div className="mt-1 text-sm text-gray-700 truncate">
                    {v.current_page ?? v.landing_url ?? "—"}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {(() => {
                      const cls = classifyLiveVisitor(v);
                      const vis = visualForAcquisition(cls.label);
                      return (
                        <button
                          type="button"
                          onClick={() => setAttrOpenId(v.session_id)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border cursor-pointer hover:opacity-80 ${vis.color}`}
                          title={explainAcquisition(cls)}
                        >
                          <i className={vis.icon} style={{ fontSize: "10px" }} />
                          {vis.shortLabel}
                        </button>
                      );
                    })()}
                    <span>· {v.page_count} {v.page_count === 1 ? "page" : "pages"}</span>
                    <span>· active {durationLabel(v.first_seen_at, v.last_seen_at)}</span>
                    {chips.map((c) => (
                      <span
                        key={c.label}
                        className={`inline-flex items-center px-2 py-0.5 rounded-md ${c.tone}`}
                      >
                        {c.label}
                      </span>
                    ))}
                    {linkedOrder && (() => {
                      const paid   = !!linkedOrder.paid_at;
                      const tried  = !!linkedOrder.payment_intent_id && !paid;
                      const tone   = paid
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : tried
                          ? "bg-amber-50 text-amber-700 border border-amber-200"
                          : "bg-gray-50 text-gray-700 border border-gray-200";
                      const label  = paid ? "Paid" : tried ? "Attempted" : "Lead";
                      const icon   = paid ? "ri-checkbox-circle-fill" : tried ? "ri-bank-card-line" : "ri-shopping-cart-line";
                      return (
                        <button
                          type="button"
                          onClick={() => {
                            try { void navigator.clipboard.writeText(linkedOrder.confirmation_id); } catch { /* ignore */ }
                            window.open("/admin-orders?tab=orders", "_blank", "noopener");
                          }}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md cursor-pointer hover:opacity-80 ${tone}`}
                          title={`Copy ${linkedOrder.confirmation_id} and open Orders in a new tab`}
                        >
                          <i className={icon} style={{ fontSize: "10px" }} />
                          {linkedOrder.confirmation_id}
                          <span className="opacity-70">· {label}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
                <div className="text-xs text-gray-400 shrink-0">
                  last seen {timeAgo(v.last_seen_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        Polling every {POLL_MS / 1000}s. Visitors disappear after {WINDOW_SECONDS}s of inactivity. Visitor landing alerts fire admin-wide — use Admin Sound Controls (top-right) to mute or tune them.
      </p>

      {/* Phase K4.5 — single popover for whichever visitor's chip is
          currently clicked. Looks up the row inline (already-loaded
          state) so the popover content is always in sync with the latest
          poll snapshot. */}
      {(() => {
        if (!attrOpenId) return null;
        const row = rows.find((r) => r.session_id === attrOpenId);
        if (!row) return null;
        const cls = classifyLiveVisitor(row);
        const tail = row.session_id.replace(/-/g, "").slice(-5).toLowerCase();
        return (
          <AttributionDetailsPopover
            open={true}
            classification={cls}
            onClose={() => setAttrOpenId(null)}
            contextLabel={`Visitor · #${tail}`}
          />
        );
      })()}
    </div>
  );
}
