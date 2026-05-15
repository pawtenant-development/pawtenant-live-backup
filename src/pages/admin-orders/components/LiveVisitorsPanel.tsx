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
 * Phase A/B scope: read-only. No sounds, no notifications, no realtime,
 * no drawer, no visitor actions, no new RPCs.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../lib/supabaseClient";
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
}

const POLL_MS        = 5_000;
const WINDOW_SECONDS = 90;

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

  // ── Poll loop ───────────────────────────────────────────────────────────
  const load = useCallback(async (background: boolean) => {
    if (!background) setRefreshing(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc("get_live_visitors", {
        p_window_seconds: WINDOW_SECONDS,
        p_limit:          200,
      });
      if (rpcErr) {
        if (!background) setError(rpcErr.message);
        return;
      }
      setRows((data ?? []) as LiveVisitor[]);
      if (background) setError(null);
    } catch (e) {
      if (!background) setError((e as Error)?.message ?? "Failed to load");
    } finally {
      if (!background) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(false);
    const id = window.setInterval(() => void load(true), POLL_MS);
    return () => window.clearInterval(id);
  }, [load]);

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
              : `${activeCount} ${activeCount === 1 ? "visitor" : "visitors"} active in the last ${WINDOW_SECONDS}s.`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void load(false)}
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
            const chips = milestoneChips(v);
            return (
              <div
                key={v.session_id}
                className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span className="font-medium text-gray-900">{anonLabel(v.session_id)}</span>
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
        Read-only foundation panel. Polling every {POLL_MS / 1000}s. Visitors disappear after {WINDOW_SECONDS}s of inactivity. Sounds and notifications are not enabled yet.
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
