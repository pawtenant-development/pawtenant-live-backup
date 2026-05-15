// DailyVisitorsByChannelPanel — Analytics Traffic Intelligence (Phase 2)
//
// Stacked daily-bar chart of visitor counts grouped by the shared normalized
// acquisitionClassifier label. Date preset selector (Today / 7d / 30d / All).
//
// Data source: get_visitor_source_data RPC (admin-only, defined in
// 20260515140000_visitor_source_rankings.sql). Same RPC used by the
// Visitor Source Rankings panel — no second attribution system created.
//
// Defensive by design: graceful loading / error / empty states. If the
// RPC is missing on LIVE, the panel renders an amber "Insufficient
// attribution data" notice and never crashes the tab.

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  classifyAcquisition,
  ACQUISITION_VISUAL,
  type AcquisitionLabel,
} from "@/lib/acquisitionClassifier";

interface VisitorRow {
  session_id:            string;
  created_at:            string;
  utm_source:            string | null;
  utm_medium:            string | null;
  utm_campaign:          string | null;
  gclid:                 string | null;
  fbclid:                string | null;
  ref:                   string | null;
  landing_url:           string | null;
  referrer:              string | null;
}

interface DailyVisitorsByChannelPanelProps {
  /** Inclusive from-date — usually the parent Analytics tab's `rangeFrom`. */
  rangeFrom: Date;
  /** Inclusive to-date — usually the parent Analytics tab's `rangeTo`. */
  rangeTo:   Date;
}

/** Clamped day count between rangeFrom and rangeTo, floored to 1, capped at 366. */
function daysBetween(from: Date, to: Date): number {
  const diff = Math.ceil((to.getTime() - from.getTime()) / 86400000);
  return Math.min(Math.max(diff, 1), 366);
}

/** Render a compact label for the active date range. */
function rangeSummary(from: Date, to: Date): string {
  const days = daysBetween(from, to);
  if (days === 1) return "Today";
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(from)} – ${fmt(to)} · ${days} days`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function dayLabel(key: string): string {
  const d = new Date(`${key}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function classifyVisitor(v: VisitorRow): AcquisitionLabel {
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

export default function DailyVisitorsByChannelPanel({
  rangeFrom,
  rangeTo,
}: DailyVisitorsByChannelPanelProps) {
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);

  // LIVE 2026-05-15: panel is now fully parent-driven via rangeFrom/rangeTo.
  // Internal Today/7d/30d/All toggle was removed so the chart always reflects
  // the same window as the rest of the Analytics tab — no competing filters.
  const from = rangeFrom;
  const to   = rangeTo;
  const days = useMemo(() => daysBetween(from, to), [from, to]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    supabase
      .rpc("get_visitor_source_data", {
        p_from:  from.toISOString(),
        p_to:    to.toISOString(),
        p_limit: 20000,
      })
      .then(
        ({ data, error: rpcErr }) => {
          if (cancelled) return;
          if (rpcErr) {
            setError(rpcErr.message);
            setVisitors([]);
          } else {
            setVisitors((data as VisitorRow[]) ?? []);
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

    return () => { cancelled = true; };
  }, [from, to]);

  // Build day-keyed buckets, channel sub-counts, totals.
  const { buckets, topChannels, total } = useMemo(() => {
    const dayMap = new Map<string, Map<AcquisitionLabel, number>>();
    const channelTotals = new Map<AcquisitionLabel, number>();

    // Pre-seed the date axis so the chart shows zero-days too.
    const start = new Date(from);
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 86400000);
      const k = dayKey(d.toISOString());
      if (!dayMap.has(k)) dayMap.set(k, new Map());
    }

    for (const v of visitors) {
      const k = dayKey(v.created_at);
      const m = dayMap.get(k) ?? new Map<AcquisitionLabel, number>();
      const label = classifyVisitor(v);
      m.set(label, (m.get(label) ?? 0) + 1);
      dayMap.set(k, m);
      channelTotals.set(label, (channelTotals.get(label) ?? 0) + 1);
    }

    const top = [...channelTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label]) => label);

    const sortedKeys = [...dayMap.keys()].sort();
    const buckets = sortedKeys.map((k) => {
      const m = dayMap.get(k) ?? new Map<AcquisitionLabel, number>();
      const byChannel: Record<string, number> = {};
      let dayTotal = 0;
      for (const [label, count] of m.entries()) {
        byChannel[label] = count;
        dayTotal += count;
      }
      return { key: k, label: dayLabel(k), total: dayTotal, byChannel };
    });

    return { buckets, topChannels: top, total: visitors.length };
  }, [visitors, from, days]);

  const maxDay = Math.max(...buckets.map((b) => b.total), 1);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center bg-sky-50 rounded-lg flex-shrink-0">
            <i className="ri-bar-chart-grouped-line text-sky-600 text-base"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Daily Visitors by Source</h3>
            <p className="text-[11px] text-gray-400">
              Classified daily visitor counts · {total.toLocaleString()} visitors · <span className="text-gray-500">{rangeSummary(from, to)}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10 text-gray-400">
          <i className="ri-loader-4-line animate-spin text-2xl mr-2"></i>
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {/* Error — RPC missing / RLS reject */}
      {!loading && error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-700 mb-1 flex items-center gap-1.5">
            <i className="ri-error-warning-line"></i>Insufficient attribution data
          </p>
          <p className="text-xs text-amber-600">
            Daily visitor data is unavailable right now. The dashboard continues to work — daily visitor breakdown will appear once the source RPC is available.
          </p>
          <p className="text-[10px] text-amber-500 mt-1 font-mono">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && total === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <i className="ri-calendar-event-line text-gray-300 text-3xl block mb-2"></i>
          <p className="text-sm font-semibold text-gray-600">No visitors in this range</p>
        </div>
      )}

      {/* Stacked bar chart */}
      {!loading && !error && total > 0 && (
        <>
          <div className="flex" style={{ height: "180px" }}>
            <div className="w-12 flex-shrink-0 flex flex-col justify-between text-right pr-2 pb-6">
              {[1, 0.75, 0.5, 0.25, 0].map((pct) => (
                <span key={pct} className="text-[9px] text-gray-300 leading-none">
                  {Math.round(maxDay * pct)}
                </span>
              ))}
            </div>
            <div className="flex-1 relative" style={{ height: "100%" }}>
              {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
                <div
                  key={pct}
                  className="absolute left-0 right-0 border-t border-gray-100"
                  style={{ bottom: `${pct * 100}%` }}
                />
              ))}
              <div className="absolute inset-0 flex items-end gap-px overflow-hidden">
                {buckets.map((b) => {
                  const heightPct = maxDay > 0 ? (b.total / maxDay) * 100 : 0;
                  const isHovered = hoveredDay === b.key;
                  return (
                    <div
                      key={b.key}
                      className="flex-1 flex flex-col justify-end relative group cursor-pointer"
                      onMouseEnter={() => setHoveredDay(b.key)}
                      onMouseLeave={() => setHoveredDay(null)}
                    >
                      {isHovered && b.total > 0 && (
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 bg-gray-900 text-white rounded-lg px-3 py-2 text-xs whitespace-nowrap pointer-events-none shadow-lg">
                          <p className="font-bold mb-1">{b.label} · {b.total} visitors</p>
                          {topChannels.map((label) => {
                            const c = b.byChannel[label] ?? 0;
                            if (!c) return null;
                            const vis = ACQUISITION_VISUAL[label];
                            return (
                              <p key={label} className="flex items-center gap-1.5">
                                <i className={`${vis.icon} text-[10px]`}></i>{vis.shortLabel}: {c}
                              </p>
                            );
                          })}
                          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                      )}
                      <div
                        className="w-full rounded-t-sm overflow-hidden"
                        style={{ height: `${heightPct}%`, minHeight: b.total > 0 ? "2px" : "0" }}
                      >
                        <div className="w-full h-full flex flex-col-reverse">
                          {topChannels.map((label) => {
                            const c = b.byChannel[label] ?? 0;
                            const pct = b.total > 0 ? (c / b.total) * 100 : 0;
                            const vis = ACQUISITION_VISUAL[label];
                            const color = visualToColor(vis.color);
                            return (
                              <div
                                key={label}
                                style={{ height: `${pct}%`, backgroundColor: color, opacity: isHovered ? 1 : 0.85 }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* X axis */}
          <div className="flex ml-12 mt-1">
            {buckets.map((b, i) => {
              const showEvery = buckets.length > 60 ? 14 : buckets.length > 30 ? 7 : buckets.length > 14 ? 3 : 1;
              const show = i % showEvery === 0 || i === buckets.length - 1;
              return (
                <div key={b.key} className="flex-1 text-center">
                  {show && (
                    <span className="text-[9px] text-gray-300 whitespace-nowrap">{b.label}</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-gray-100">
            {topChannels.map((label) => {
              const vis = ACQUISITION_VISUAL[label];
              const color = visualToColor(vis.color);
              return (
                <div key={label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }}></div>
                  <span className="text-xs text-gray-500">{vis.shortLabel}</span>
                </div>
              );
            })}
            {topChannels.length === 0 && (
              <span className="text-xs text-gray-400">No channels detected.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Pull a stable color value out of the classifier's Tailwind class string.
// Keeps the chart visually consistent with the pills + chips elsewhere.
function visualToColor(twClass: string): string {
  if (twClass.includes("orange-50") || twClass.includes("orange-600")) return "#f97316";
  if (twClass.includes("emerald")) return "#10b981";
  if (twClass.includes("[#1877F2]")) return "#1877F2";
  if (twClass.includes("blue-50")) return "#3b82f6";
  if (twClass.includes("pink")) return "#ec4899";
  if (twClass.includes("orange-700") || twClass.includes("orange-50 border-orange-200")) return "#ea580c";
  if (twClass.includes("gray-900") || twClass.includes("gray-100")) return "#111827";
  if (twClass.includes("sky")) return "#0ea5e9";
  if (twClass.includes("amber")) return "#f59e0b";
  if (twClass.includes("indigo")) return "#6366f1";
  if (twClass.includes("slate")) return "#475569";
  if (twClass.includes("violet")) return "#7c3aed";
  if (twClass.includes("teal")) return "#0d9488";
  return "#9ca3af";
}
