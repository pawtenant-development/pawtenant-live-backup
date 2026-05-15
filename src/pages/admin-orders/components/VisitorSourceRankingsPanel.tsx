// VisitorSourceRankingsPanel — Phase A
//
// Read-only analytics panel that ranks visitor sources by:
//   visitors · assessments started · paid · conversion %
//
// Uses the shared acquisitionClassifier so the labels + visual mapping
// agree with Orders pills, Live Visitors chips, and AdminDashboard
// aggregation. Visitor data comes from the admin-only RPC
// `get_visitor_source_data` (see migration 20260515140000).
//
// Defensive by design:
//   * RPC errors / missing table → friendly "Insufficient data" state.
//   * Empty result set            → friendly "No visitor data yet" state.
//   * Orders prop is optional     → revenue/order metrics gracefully hide
//                                   if the parent didn't pass them.
//
// No writes. No mutations. No new attribution system. No checkout / Stripe
// / provider / SEO / Communications Hub touch.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  classifyAcquisition,
  classifyOrder,
  ACQUISITION_VISUAL,
  ACQUISITION_LABELS,
  type AcquisitionLabel,
} from "@/lib/acquisitionClassifier";

// ── Types ─────────────────────────────────────────────────────────────────

interface VisitorSourceRow {
  session_id:            string;
  created_at:            string;
  last_seen_at:          string | null;
  channel:               string | null;
  utm_source:            string | null;
  utm_medium:            string | null;
  utm_campaign:          string | null;
  gclid:                 string | null;
  fbclid:                string | null;
  ref:                   string | null;
  landing_url:           string | null;
  referrer:              string | null;
  device:                string | null;
  assessment_started_at: string | null;
  paid_at:               string | null;
  chat_opened_at:        string | null;
}

interface OrderLite {
  id:                    string;
  payment_intent_id:     string | null;
  price:                 number | null;
  created_at:            string;
  utm_source?:           string | null;
  utm_medium?:           string | null;
  utm_campaign?:         string | null;
  gclid?:                string | null;
  fbclid?:               string | null;
  referred_by?:          string | null;
}

interface VisitorSourceRankingsPanelProps {
  /** Inclusive from-date for the visitor query. */
  rangeFrom: Date;
  /** Inclusive to-date for the visitor query. */
  rangeTo:   Date;
  /** Optional orders array — revenue/paid stats fold in if present. */
  orders?:   OrderLite[];
}

// ── Aggregator ────────────────────────────────────────────────────────────

interface SourceRow {
  label:               AcquisitionLabel;
  visitors:            number;
  assessmentsStarted:  number;
  visitorPaid:         number;          // paid_at on visitor_sessions
  orderPaid:           number;          // from orders prop
  orderRevenue:        number;          // from orders prop
  topLanding:          string | null;
  topLandingCount:     number;
}

function classifyVisitor(v: VisitorSourceRow): AcquisitionLabel {
  return classifyAcquisition({
    utm_source:   v.utm_source,
    utm_medium:   v.utm_medium,
    utm_campaign: v.utm_campaign,
    gclid:        v.gclid,
    fbclid:       v.fbclid,
    ref:          v.ref,
    referrer:     v.referrer,
    landing_url:  v.landing_url,
  }).label;
}

function aggregate(
  visitors: VisitorSourceRow[],
  orders:   OrderLite[],
  rangeFrom: Date,
  rangeTo:   Date,
): SourceRow[] {
  const init = (): Omit<SourceRow, "label"> => ({
    visitors: 0,
    assessmentsStarted: 0,
    visitorPaid: 0,
    orderPaid: 0,
    orderRevenue: 0,
    topLanding: null,
    topLandingCount: 0,
  });

  const byLabel = new Map<AcquisitionLabel, Omit<SourceRow, "label">>();
  const landingByLabel = new Map<AcquisitionLabel, Map<string, number>>();

  for (const v of visitors) {
    const label = classifyVisitor(v);
    const bucket = byLabel.get(label) ?? init();
    bucket.visitors += 1;
    if (v.assessment_started_at) bucket.assessmentsStarted += 1;
    if (v.paid_at)               bucket.visitorPaid += 1;

    if (v.landing_url) {
      const path = pathOnly(v.landing_url);
      if (path) {
        const m = landingByLabel.get(label) ?? new Map<string, number>();
        m.set(path, (m.get(path) ?? 0) + 1);
        landingByLabel.set(label, m);
      }
    }

    byLabel.set(label, bucket);
  }

  // Fold orders in by classifying each order with the SAME classifier so
  // visitor-side and order-side numbers line up by label.
  for (const o of orders) {
    const created = new Date(o.created_at);
    if (created < rangeFrom || created > rangeTo) continue;
    if (!o.payment_intent_id) continue;
    const label = classifyOrder({
      utm_source:   o.utm_source ?? null,
      utm_medium:   o.utm_medium ?? null,
      utm_campaign: o.utm_campaign ?? null,
      gclid:        o.gclid       ?? null,
      fbclid:       o.fbclid      ?? null,
      referred_by:  o.referred_by ?? null,
    }).label;
    const bucket = byLabel.get(label) ?? init();
    bucket.orderPaid    += 1;
    bucket.orderRevenue += o.price ?? 0;
    byLabel.set(label, bucket);
  }

  // Pick top landing per label.
  for (const [label, m] of landingByLabel.entries()) {
    let topPath: string | null = null;
    let topCount = 0;
    for (const [path, count] of m.entries()) {
      if (count > topCount) {
        topPath = path;
        topCount = count;
      }
    }
    const bucket = byLabel.get(label);
    if (bucket && topPath) {
      bucket.topLanding      = topPath;
      bucket.topLandingCount = topCount;
    }
  }

  // Return in the canonical label order, dropping zero-row labels.
  const rows: SourceRow[] = [];
  for (const label of ACQUISITION_LABELS) {
    const bucket = byLabel.get(label);
    if (!bucket) continue;
    if (bucket.visitors === 0 && bucket.orderPaid === 0) continue;
    rows.push({ label, ...bucket });
  }
  // Sort by visitors desc, then orderPaid desc, then label.
  rows.sort((a, b) => b.visitors - a.visitors || b.orderPaid - a.orderPaid || a.label.localeCompare(b.label));
  return rows;
}

function pathOnly(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://example.com${url.startsWith("/") ? url : `/${url}`}`);
    const p = u.pathname || "/";
    return p === "" ? "/" : p;
  } catch {
    return url.split("?")[0] || null;
  }
}

/** Compact label for the active date range, e.g. "May 1 – May 15 · 15 days".
 *  Mirrors the helper already in DailyVisitorsByChannelPanel +
 *  LandingPagePerformancePanel so all three new visitor panels show the
 *  exact same range summary string. */
function rangeSummary(from: Date, to: Date): string {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 86400000));
  if (days === 1) return "Today";
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(from)} – ${fmt(to)} · ${days} days`;
}

// ── Component ─────────────────────────────────────────────────────────────

export default function VisitorSourceRankingsPanel({
  rangeFrom,
  rangeTo,
  orders,
}: VisitorSourceRankingsPanelProps) {
  const [visitors, setVisitors] = useState<VisitorSourceRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc("get_visitor_source_data", {
        p_from:  rangeFrom.toISOString(),
        p_to:    rangeTo.toISOString(),
        p_limit: 20000,
      })
      .then(
        ({ data, error: rpcErr }) => {
          if (cancelled) return;
          if (rpcErr) {
            // RPC missing on LIVE / RLS rejection / other backend issue:
            // surface a friendly message and render an empty state, not
            // a white screen.
            setError(rpcErr.message);
            setVisitors([]);
          } else {
            setVisitors((data as VisitorSourceRow[]) ?? []);
          }
          setLoading(false);
        },
        (err: unknown) => {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : String(err));
          setVisitors([]);
          setLoading(false);
        },
      );

    return () => {
      cancelled = true;
    };
  }, [rangeFrom, rangeTo]);

  const rows = useMemo(
    () => aggregate(visitors, orders ?? [], rangeFrom, rangeTo),
    [visitors, orders, rangeFrom, rangeTo],
  );

  const totalVisitors    = rows.reduce((s, r) => s + r.visitors, 0);
  const totalVisitorPaid = rows.reduce((s, r) => s + r.visitorPaid, 0);
  const totalOrders      = rows.reduce((s, r) => s + r.orderPaid, 0);
  const totalRevenue     = rows.reduce((s, r) => s + r.orderRevenue, 0);
  const topRow           = rows[0] ?? null;
  const aiRows           = rows.filter((r) => r.label === "ChatGPT" || r.label === "Claude" || r.label === "Gemini" || r.label === "Perplexity");
  const aiVisitors       = aiRows.reduce((s, r) => s + r.visitors, 0);
  // LIVE hotfix 2026-05-15: "Highest conv." now ranks by visitor-internal
  // conversion (visitor_sessions.paid_at flag / visitors) instead of the
  // previous broken `orderPaid / visitors` which mixed two unrelated
  // populations and routinely returned >100%.
  const highestConv      = [...rows]
    .filter((r) => r.visitors >= 5)
    .sort((a, b) => (b.visitorPaid / Math.max(b.visitors, 1)) - (a.visitorPaid / Math.max(a.visitors, 1)))[0]
    ?? null;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center bg-emerald-50 rounded-lg flex-shrink-0">
            <i className="ri-radar-line text-emerald-600 text-base"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Visitor Source Rankings</h3>
            <p className="text-[11px] text-gray-400">
              Classified via shared <span className="font-semibold">acquisitionClassifier</span> · {visitors.length.toLocaleString()} visitors · <span className="text-gray-500">{rangeSummary(rangeFrom, rangeTo)}</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-0.5 leading-snug max-w-2xl">
              Visitors and Orders are independent attribution lenses. Conversion is visitor-internal. Orders show classifier-attributed sales and may include returning customers.
            </p>
          </div>
        </div>
        {totalRevenue > 0 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Range revenue</p>
            <p className="text-base font-extrabold text-emerald-700">${totalRevenue.toLocaleString()}</p>
          </div>
        )}
      </div>

      {/* Summary chips */}
      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {topRow && (
            <SummaryChip
              icon="ri-trophy-line"
              tint="amber"
              label="Top source"
              valueIcon={ACQUISITION_VISUAL[topRow.label].icon}
              valueText={topRow.label}
              sub={`${topRow.visitors.toLocaleString()} visitors`}
            />
          )}
          {highestConv && (
            <SummaryChip
              icon="ri-flashlight-line"
              tint="sky"
              label="Highest conv."
              valueIcon={ACQUISITION_VISUAL[highestConv.label].icon}
              valueText={highestConv.label}
              sub={`${Math.round(Math.min(100, (highestConv.visitorPaid / Math.max(highestConv.visitors, 1)) * 100))}% visitor conv.`}
            />
          )}
          {aiVisitors > 0 && (
            <SummaryChip
              icon="ri-sparkling-2-line"
              tint="emerald"
              label="AI referrals"
              valueIcon="ri-openai-line"
              valueText={`${aiVisitors.toLocaleString()} visitors`}
              sub={aiRows.map((r) => r.label).join(" · ")}
            />
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <i className="ri-loader-4-line animate-spin text-2xl mr-2"></i>
          <span className="text-sm">Loading visitor data…</span>
        </div>
      )}

      {/* Error state — RPC missing / RLS reject / network */}
      {!loading && error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-700 mb-1 flex items-center gap-1.5">
            <i className="ri-error-warning-line"></i>Insufficient attribution data
          </p>
          <p className="text-xs text-amber-600">
            Visitor source data is unavailable right now. The dashboard continues to work — visitor analytics will appear once the source RPC is available.
          </p>
          <p className="text-[10px] text-amber-500 mt-1 font-mono">{error}</p>
        </div>
      )}

      {/* Empty state — RPC fine, just no data yet */}
      {!loading && !error && rows.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <i className="ri-line-chart-line text-gray-300 text-3xl block mb-2"></i>
          <p className="text-sm font-semibold text-gray-600">No visitor data yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Once visitors land in this date range, source rankings will appear here.
          </p>
        </div>
      )}

      {/* Rankings table */}
      {!loading && !error && rows.length > 0 && (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-gray-400 font-bold border-b border-gray-100">
                <th className="text-left  py-2 px-2">Source</th>
                <th className="text-right py-2 px-2">Visitors</th>
                <th className="text-right py-2 px-2 hidden sm:table-cell">Assess.</th>
                <th className="text-right py-2 px-2" title="Visitor sessions whose paid_at flag was set in this range">Vis. Paid</th>
                <th className="text-right py-2 px-2" title="Visitor-internal conversion: visitor paid sessions / visitors">Vis. Conv.</th>
                <th className="text-right py-2 px-2 hidden sm:table-cell" title="Classifier-attributed orders in this range — separate population from Visitors">Orders</th>
                <th className="text-right py-2 px-2 hidden md:table-cell">Revenue</th>
                <th className="text-left  py-2 px-2 hidden lg:table-cell">Top landing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const vis = ACQUISITION_VISUAL[r.label];
                // LIVE hotfix 2026-05-15: visitor-internal conversion only.
                // Capped at 100% even though visitor_sessions.paid_at is a
                // boolean flag (paid <= visitors by definition) — defensive.
                const visConv = r.visitors > 0 ? Math.min(100, (r.visitorPaid / r.visitors) * 100) : 0;
                const visitorShare = totalVisitors > 0 ? (r.visitors / totalVisitors) * 100 : 0;
                return (
                  <tr key={r.label} className="border-b border-gray-50 last:border-b-0">
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${vis.color}`}>
                          <i className={`${vis.icon} text-xs`}></i>{vis.shortLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden max-w-[100px]">
                          <div
                            className="h-full rounded-full bg-emerald-500"
                            style={{ width: `${Math.max(2, visitorShare)}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] text-gray-400">{visitorShare.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-gray-900 tabular-nums">{r.visitors.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right text-gray-600 tabular-nums hidden sm:table-cell">{r.assessmentsStarted.toLocaleString()}</td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      <span className={r.visitorPaid > 0 ? "font-bold text-emerald-700" : "text-gray-400"}>
                        {r.visitorPaid.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums">
                      <span className={visConv >= 5 ? "text-emerald-700 font-bold" : visConv > 0 ? "text-gray-700" : "text-gray-300"}>
                        {visConv.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums hidden sm:table-cell">
                      <span className={r.orderPaid > 0 ? "font-semibold text-gray-700" : "text-gray-300"}>
                        {r.orderPaid.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums hidden md:table-cell">
                      {r.orderRevenue > 0 ? (
                        <span className="font-bold text-emerald-700">${r.orderRevenue.toLocaleString()}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 hidden lg:table-cell">
                      {r.topLanding ? (
                        <span className="text-xs text-gray-500 font-mono" title={`${r.topLandingCount} visits`}>
                          {r.topLanding.length > 32 ? `${r.topLanding.slice(0, 32)}…` : r.topLanding}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-bold">
                <td className="py-2 px-2 text-[11px] uppercase tracking-widest text-gray-500">Total</td>
                <td className="py-2 px-2 text-right tabular-nums text-gray-900">{totalVisitors.toLocaleString()}</td>
                <td className="py-2 px-2 text-right tabular-nums text-gray-500 hidden sm:table-cell">
                  {rows.reduce((s, r) => s + r.assessmentsStarted, 0).toLocaleString()}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-emerald-700">{totalVisitorPaid.toLocaleString()}</td>
                <td className="py-2 px-2 text-right tabular-nums text-gray-700">
                  {totalVisitors > 0
                    ? `${Math.min(100, (totalVisitorPaid / totalVisitors) * 100).toFixed(1)}%`
                    : "—"}
                </td>
                <td className="py-2 px-2 text-right tabular-nums text-gray-700 hidden sm:table-cell">{totalOrders.toLocaleString()}</td>
                <td className="py-2 px-2 text-right tabular-nums text-emerald-700 hidden md:table-cell">
                  {totalRevenue > 0 ? `$${totalRevenue.toLocaleString()}` : "—"}
                </td>
                <td className="py-2 px-2 hidden lg:table-cell"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function SummaryChip({
  icon, tint, label, valueIcon, valueText, sub,
}: {
  icon: string;
  tint: "amber" | "sky" | "emerald";
  label: string;
  valueIcon: string;
  valueText: string;
  sub: string;
}) {
  const tintClasses = {
    amber:   { bg: "bg-amber-50",   border: "border-amber-200",   icon: "text-amber-600",   value: "text-amber-900" },
    sky:     { bg: "bg-sky-50",     border: "border-sky-200",     icon: "text-sky-600",     value: "text-sky-900" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-600", value: "text-emerald-900" },
  }[tint];
  return (
    <div className={`${tintClasses.bg} ${tintClasses.border} border rounded-xl p-3`}>
      <div className="flex items-center gap-1.5 mb-1">
        <i className={`${icon} ${tintClasses.icon} text-sm`}></i>
        <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <i className={`${valueIcon} ${tintClasses.icon}`}></i>
        <span className={`text-sm font-extrabold ${tintClasses.value}`}>{valueText}</span>
      </div>
      <p className="text-[10px] text-gray-500 mt-0.5 truncate">{sub}</p>
    </div>
  );
}
