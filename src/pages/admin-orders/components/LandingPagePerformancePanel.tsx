// LandingPagePerformancePanel — Analytics Traffic Intelligence (Phase 2)
//
// Two-mode panel:
//   1) "Rankings" — top landing pages ranked by visitors with: top source,
//      assessment starts, paid visitors, visitor conversion rate.
//   2) "Source × Page" — matrix view of which channels drive which pages
//      (top N rows × top M source columns).
//
// Both modes share the same fetch via get_visitor_source_data (admin-only
// RPC defined in 20260515140000_visitor_source_rankings.sql). All
// classification routes through the shared acquisitionClassifier so the
// labels match Orders pills + Live Visitors chips + AdminDashboard.
//
// Visitor-level metrics only (visitor_sessions.paid_at is the visitor's
// own "did they end up paying" flag). Revenue and order linkage live in
// the Visitor Source Rankings panel where orders.* attribution is folded
// in by source. We deliberately do NOT join visitor_session_id ↔ orders
// here — that's a future enhancement and would require a new column.

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
  assessment_started_at: string | null;
  paid_at:               string | null;
}

type Preset = "today" | "7d" | "30d" | "all";
type Mode = "rankings" | "matrix";

function presetRange(preset: Preset): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  switch (preset) {
    case "today": {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case "7d":  return { from: new Date(now.getTime() - 7 * 86400000),  to };
    case "30d": return { from: new Date(now.getTime() - 30 * 86400000), to };
    case "all":
    default:    return { from: new Date(now.getTime() - 90 * 86400000), to };
  }
}

function pathOnly(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://example.com${url.startsWith("/") ? url : `/${url}`}`);
    const p = u.pathname || "/";
    return p === "" ? "/" : p;
  } catch {
    return url.split("?")[0] || null;
  }
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

interface PageRow {
  path: string;
  visitors: number;
  assessments: number;
  paid: number;
  sourceMix: Map<AcquisitionLabel, number>;
  topSource: AcquisitionLabel | null;
  topSourceCount: number;
}

export default function LandingPagePerformancePanel() {
  const [preset, setPreset] = useState<Preset>("30d");
  const [mode, setMode] = useState<Mode>("rankings");
  const [visitors, setVisitors] = useState<VisitorRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);

  const { from, to } = useMemo(() => presetRange(preset), [preset]);

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

  // Aggregate by path
  const pageRows = useMemo<PageRow[]>(() => {
    const byPath = new Map<string, PageRow>();
    for (const v of visitors) {
      const path = pathOnly(v.landing_url);
      if (!path) continue;
      const row = byPath.get(path) ?? {
        path,
        visitors: 0,
        assessments: 0,
        paid: 0,
        sourceMix: new Map<AcquisitionLabel, number>(),
        topSource: null,
        topSourceCount: 0,
      };
      row.visitors += 1;
      if (v.assessment_started_at) row.assessments += 1;
      if (v.paid_at) row.paid += 1;
      const label = classifyVisitor(v);
      row.sourceMix.set(label, (row.sourceMix.get(label) ?? 0) + 1);
      byPath.set(path, row);
    }
    // Pick top source per page.
    for (const row of byPath.values()) {
      let topLabel: AcquisitionLabel | null = null;
      let topCount = 0;
      for (const [label, count] of row.sourceMix.entries()) {
        if (count > topCount) {
          topCount = count;
          topLabel = label;
        }
      }
      row.topSource = topLabel;
      row.topSourceCount = topCount;
    }
    return [...byPath.values()].sort((a, b) => b.visitors - a.visitors);
  }, [visitors]);

  // For the matrix view: top 10 pages × top 6 channels.
  const matrixPages = useMemo(() => pageRows.slice(0, 10), [pageRows]);
  const matrixSources = useMemo(() => {
    const totals = new Map<AcquisitionLabel, number>();
    for (const row of matrixPages) {
      for (const [label, count] of row.sourceMix.entries()) {
        totals.set(label, (totals.get(label) ?? 0) + count);
      }
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l]) => l);
  }, [matrixPages]);

  const totalVisitors = pageRows.reduce((s, r) => s + r.visitors, 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center bg-violet-50 rounded-lg flex-shrink-0">
            <i className="ri-pages-line text-violet-600 text-base"></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">Landing Page Performance</h3>
            <p className="text-[11px] text-gray-400">
              {mode === "rankings"
                ? `Top pages · ${totalVisitors.toLocaleString()} visitors in range`
                : `Top 10 pages × top ${matrixSources.length} sources`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["rankings", "matrix"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  mode === m ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {m === "rankings" ? "Rankings" : "Source × Page"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
            {(["today", "7d", "30d", "all"] as Preset[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPreset(p)}
                className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  preset === p ? "bg-white text-[#3b6ea5] shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {p === "today" ? "Today" : p === "7d" ? "7d" : p === "30d" ? "30d" : "All"}
              </button>
            ))}
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

      {/* Error */}
      {!loading && error && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-700 mb-1 flex items-center gap-1.5">
            <i className="ri-error-warning-line"></i>Insufficient attribution data
          </p>
          <p className="text-xs text-amber-600">
            Landing-page data is unavailable right now. The rest of Analytics continues to work.
          </p>
          <p className="text-[10px] text-amber-500 mt-1 font-mono">{error}</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && pageRows.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center">
          <i className="ri-file-search-line text-gray-300 text-3xl block mb-2"></i>
          <p className="text-sm font-semibold text-gray-600">No landing-page data yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Once visitors with a landing URL land in this range, page rankings will appear here.
          </p>
        </div>
      )}

      {/* Rankings table */}
      {!loading && !error && mode === "rankings" && pageRows.length > 0 && (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-gray-400 font-bold border-b border-gray-100">
                <th className="text-left  py-2 px-2">Landing page</th>
                <th className="text-left  py-2 px-2 hidden md:table-cell">Top source</th>
                <th className="text-right py-2 px-2">Visitors</th>
                <th className="text-right py-2 px-2 hidden sm:table-cell">Assess.</th>
                <th className="text-right py-2 px-2">Paid</th>
                <th className="text-right py-2 px-2">Conv.</th>
                <th className="text-center py-2 px-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.slice(0, 30).map((r) => {
                const conv = r.visitors > 0 ? (r.paid / r.visitors) * 100 : 0;
                const visitorShare = totalVisitors > 0 ? (r.visitors / totalVisitors) * 100 : 0;
                const topVis = r.topSource ? ACQUISITION_VISUAL[r.topSource] : null;
                const isOpen = expandedPath === r.path;
                return (
                  <>
                    <tr key={r.path} className="border-b border-gray-50 last:border-b-0">
                      <td className="py-2.5 px-2 max-w-[280px]">
                        <p className="text-xs text-gray-800 font-mono truncate" title={r.path}>
                          {r.path}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden max-w-[100px]">
                            <div
                              className="h-full rounded-full bg-violet-500"
                              style={{ width: `${Math.max(2, visitorShare)}%` }}
                            ></div>
                          </div>
                          <span className="text-[10px] text-gray-400">{visitorShare.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 hidden md:table-cell">
                        {topVis ? (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${topVis.color}`}>
                            <i className={`${topVis.icon} text-xs`}></i>{topVis.shortLabel}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-right font-bold text-gray-900 tabular-nums">{r.visitors.toLocaleString()}</td>
                      <td className="py-2.5 px-2 text-right text-gray-600 tabular-nums hidden sm:table-cell">{r.assessments.toLocaleString()}</td>
                      <td className="py-2.5 px-2 text-right tabular-nums">
                        <span className={r.paid > 0 ? "font-bold text-emerald-700" : "text-gray-400"}>
                          {r.paid.toLocaleString()}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right tabular-nums">
                        <span className={conv >= 5 ? "text-emerald-700 font-bold" : conv > 0 ? "text-gray-700" : "text-gray-300"}>
                          {conv.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => setExpandedPath(isOpen ? null : r.path)}
                          className="text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
                          title={isOpen ? "Collapse source mix" : "Expand source mix"}
                        >
                          <i className={`ri-arrow-${isOpen ? "up" : "down"}-s-line text-base`}></i>
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-gray-50 border-b border-gray-50 last:border-b-0">
                        <td colSpan={7} className="px-2 py-3">
                          <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">Source mix for this page</p>
                          <div className="flex flex-wrap gap-2">
                            {[...r.sourceMix.entries()]
                              .sort((a, b) => b[1] - a[1])
                              .map(([label, count]) => {
                                const vis = ACQUISITION_VISUAL[label];
                                const pct = r.visitors > 0 ? (count / r.visitors) * 100 : 0;
                                return (
                                  <span
                                    key={label}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${vis.color}`}
                                    title={`${count} visitors (${pct.toFixed(1)}%)`}
                                  >
                                    <i className={`${vis.icon} text-xs`}></i>{vis.shortLabel}
                                    <span className="text-gray-500 font-normal ml-0.5">· {count}</span>
                                  </span>
                                );
                              })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
          {pageRows.length > 30 && (
            <p className="text-[10px] text-gray-400 text-right mt-2 pr-2">
              Showing top 30 of {pageRows.length.toLocaleString()} pages
            </p>
          )}
        </div>
      )}

      {/* Source × Page matrix */}
      {!loading && !error && mode === "matrix" && matrixPages.length > 0 && (
        <div className="overflow-x-auto -mx-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-gray-400 font-bold border-b border-gray-100">
                <th className="text-left py-2 px-2">Landing page</th>
                {matrixSources.map((label) => {
                  const vis = ACQUISITION_VISUAL[label];
                  return (
                    <th key={label} className="text-right py-2 px-2 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border ${vis.color}`}>
                        <i className={`${vis.icon} text-[10px]`}></i>{vis.shortLabel}
                      </span>
                    </th>
                  );
                })}
                <th className="text-right py-2 px-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {matrixPages.map((r) => (
                <tr key={r.path} className="border-b border-gray-50 last:border-b-0">
                  <td className="py-2 px-2 max-w-[260px]">
                    <p className="text-xs text-gray-800 font-mono truncate" title={r.path}>{r.path}</p>
                  </td>
                  {matrixSources.map((label) => {
                    const count = r.sourceMix.get(label) ?? 0;
                    const intensity = r.visitors > 0 ? count / r.visitors : 0;
                    return (
                      <td key={label} className="py-2 px-2 text-right tabular-nums">
                        {count > 0 ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded-md font-semibold"
                            style={{
                              backgroundColor: `rgba(59, 110, 165, ${0.05 + intensity * 0.45})`,
                              color: intensity > 0.5 ? "white" : "#1e3a8a",
                            }}
                          >
                            {count}
                          </span>
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-right font-bold text-gray-900 tabular-nums">{r.visitors.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
