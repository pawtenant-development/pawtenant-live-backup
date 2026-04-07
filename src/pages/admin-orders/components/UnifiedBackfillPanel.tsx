import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

type SourceSystem = "all" | "new_site" | "wordpress_legacy";
type Platform = "meta" | "google";

interface PreviewReport {
  totalPaidOrdersEligible: number;
  alreadySentCount: number;
  pendingBackfillCount: number;
  missingDataIssues: {
    noFbclid: number;
    noPhone: number;
    noEmail: number;
    invalidPaidAt: number;
    futurePaidAt: number;
  };
}

interface DryRunItem {
  confirmationId: string;
  sourceSystem: string;
  isHistorical: boolean;
  value?: number;
  paidAt?: string;
  hasFbclid?: boolean;
  hasEmail?: boolean;
  wouldSend: boolean;
  alreadySent: boolean;
  method?: string;
  quality?: string;
}

interface BackfillResult {
  confirmationId: string;
  sourceSystem?: string;
  status?: "sent" | "skipped" | "failed";
  success?: boolean;
  skipped?: boolean;
  value?: number;
  error?: string;
  isBackfillReplay?: boolean;
}

interface BackfillSummary {
  sent?: number;
  skipped?: number;
  failed?: number;
  total?: number;
  uploaded?: number;
  processed?: number;
}

function fmt(ts: string | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function UnifiedBackfillPanel() {
  const [platform, setPlatform] = useState<Platform>("meta");
  const [sourceSystem, setSourceSystem] = useState<SourceSystem>("new_site");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const [limit, setLimit] = useState(50);
  const [testEventCode, setTestEventCode] = useState("");

  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewReport | null>(null);
  const [dryRunData, setDryRunData] = useState<DryRunItem[] | null>(null);
  const [backfillResults, setBackfillResults] = useState<BackfillResult[] | null>(null);
  const [backfillSummary, setBackfillSummary] = useState<BackfillSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "dry-run" | "backfill">("preview");

  const getFilters = () => ({
    sourceSystem,
    dateFrom: dateFrom || null,
    dateTo: dateTo || null,
    includeHistorical,
    limit,
  });

  // ── Meta API call ──────────────────────────────────────────────────────────
  const callMeta = useCallback(async (mode: string, extra: Record<string, unknown> = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
      body: JSON.stringify({ mode, ...getFilters(), ...extra }),
    });
    return res.json();
  }, [sourceSystem, dateFrom, dateTo, includeHistorical, limit]);

  // ── Google API call ────────────────────────────────────────────────────────
  const callGoogle = useCallback(async (mode: string, extra: Record<string, unknown> = {}) => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-ads-conversions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ mode, ...getFilters(), ...extra }),
    });
    return res.json();
  }, [sourceSystem, dateFrom, dateTo, includeHistorical, limit]);

  const runPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPreviewData(null);
    try {
      if (platform === "meta") {
        const data = await callMeta("preview");
        if (data.ok && data.report) setPreviewData(data.report);
        else setError(data.error || "Failed to fetch preview");
      } else {
        // For Google, build a count from the backfill dry-run
        const data = await callGoogle("backfill", { dryRun: true });
        if (data.ok) {
          const results: BackfillResult[] = data.results ?? [];
          setPreviewData({
            totalPaidOrdersEligible: results.length,
            alreadySentCount: 0,
            pendingBackfillCount: results.filter(r => !r.skipped).length,
            missingDataIssues: { noFbclid: 0, noPhone: 0, noEmail: 0, invalidPaidAt: 0, futurePaidAt: 0 },
          });
        } else {
          setError(data.error || "Failed to fetch preview");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [platform, callMeta, callGoogle]);

  const runDryRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDryRunData(null);
    try {
      if (platform === "meta") {
        const data = await callMeta("dry-run");
        if (data.ok && data.preview) setDryRunData(data.preview as DryRunItem[]);
        else setError(data.error || "Failed to run dry-run");
      } else {
        const data = await callGoogle("backfill", { dryRun: true });
        if (data.ok) {
          const items: DryRunItem[] = (data.results ?? []).map((r: BackfillResult) => ({
            confirmationId: r.confirmationId,
            sourceSystem: r.sourceSystem ?? "new_site",
            isHistorical: false,
            wouldSend: !r.skipped && r.success !== false,
            alreadySent: false,
            method: (r as { method?: string }).method,
            quality: (r as { quality?: string }).quality,
          }));
          setDryRunData(items);
        } else {
          setError(data.error || "Failed to run dry-run");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [platform, callMeta, callGoogle]);

  const runBackfill = useCallback(async () => {
    const pendingCount = previewData?.pendingBackfillCount ?? dryRunData?.filter(i => i.wouldSend).length ?? "?";
    if (!confirm(`Send ${pendingCount} orders to ${platform === "meta" ? "Meta CAPI" : "Google Ads"}? This cannot be undone.`)) return;
    setLoading(true);
    setError(null);
    setBackfillResults(null);
    setBackfillSummary(null);
    try {
      if (platform === "meta") {
        const extra: Record<string, unknown> = {};
        if (testEventCode.trim()) extra.testEventCode = testEventCode.trim();
        const data = await callMeta("backfill", extra);
        if (data.ok) {
          setBackfillResults(data.results ?? []);
          setBackfillSummary(data.summary ?? null);
        } else {
          setError(data.error || data.hint || "Backfill failed");
        }
      } else {
        const data = await callGoogle("backfill");
        if (data.ok) {
          setBackfillResults(data.results ?? []);
          setBackfillSummary({ sent: data.uploaded, skipped: data.skipped, failed: data.failed, total: data.processed });
        } else {
          setError(data.error || "Backfill failed");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [platform, callMeta, callGoogle, previewData, dryRunData, testEventCode]);

  const sourceBadge = (sys: string | undefined) => {
    if (sys === "wordpress_legacy") return <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">WP</span>;
    return <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] font-bold rounded">New</span>;
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Conversion Backfill</h3>
          <p className="text-sm text-gray-500 mt-1">
            Safely replay paid orders to Meta CAPI or Google Ads. Idempotent — already-sent orders are always skipped.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-lg">
            <i className="ri-refresh-line text-gray-600"></i>
          </div>
        </div>
      </div>

      {/* Platform switcher */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([
          { key: "meta", label: "Meta CAPI", icon: "ri-messenger-line" },
          { key: "google", label: "Google Ads", icon: "ri-google-fill" },
        ] as const).map(p => (
          <button
            key={p.key}
            onClick={() => { setPlatform(p.key); setPreviewData(null); setDryRunData(null); setBackfillResults(null); setError(null); }}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer ${platform === p.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            <i className={p.icon}></i>{p.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">Filters</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Source System</label>
            <select
              value={sourceSystem}
              onChange={e => setSourceSystem(e.target.value as SourceSystem)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="new_site">New Site Only</option>
              <option value="wordpress_legacy">WordPress Legacy Only</option>
              <option value="all">All Sources</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Paid From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Paid To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Batch Limit</label>
            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value={10}>10 orders</option>
              <option value={25}>25 orders</option>
              <option value={50}>50 orders</option>
              <option value={100}>100 orders</option>
              <option value={200}>200 orders</option>
            </select>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={includeHistorical} onChange={e => setIncludeHistorical(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-gray-800" />
            <span className="text-sm text-gray-700">Include historical imports (WordPress-era orders)</span>
          </label>
          {sourceSystem === "wordpress_legacy" && !includeHistorical && (
            <span className="text-xs text-amber-600 font-medium">
              <i className="ri-alert-line mr-1"></i>Enable &quot;Include historical imports&quot; to backfill WP orders
            </span>
          )}
        </div>
        {platform === "meta" && (
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-xs">
              <label className="block text-xs font-medium text-gray-600 mb-1">Test Event Code (optional)</label>
              <input type="text" value={testEventCode} onChange={e => setTestEventCode(e.target.value)}
                placeholder="e.g. TEST12345 — leave blank for live"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white" />
            </div>
          </div>
        )}
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {(["preview", "dry-run", "backfill"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {tab === "preview" && <><i className="ri-bar-chart-line"></i>Preview Report</>}
            {tab === "dry-run" && <><i className="ri-eye-line"></i>Dry Run</>}
            {tab === "backfill" && <><i className="ri-send-plane-line"></i>Backfill</>}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-3">
          <i className="ri-error-warning-line text-red-500 mt-0.5"></i>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Preview Tab ── */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          <button onClick={runPreview} disabled={loading}
            className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 cursor-pointer">
            {loading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-bar-chart-line"></i>}
            Load Preview
          </button>
          {previewData && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-700">{previewData.totalPaidOrdersEligible}</p>
                  <p className="text-xs text-blue-600 font-medium">Total Eligible</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{previewData.alreadySentCount}</p>
                  <p className="text-xs text-green-600 font-medium">Already Sent</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{previewData.pendingBackfillCount}</p>
                  <p className="text-xs text-amber-600 font-medium">Pending Backfill</p>
                </div>
              </div>
              {platform === "meta" && previewData.missingDataIssues && (
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
                  <p className="text-xs font-bold text-gray-700 mb-3">Missing Data Issues</p>
                  <div className="space-y-2">
                    {Object.entries(previewData.missingDataIssues).map(([key, count]) => {
                      const labels: Record<string, string> = { noFbclid: "No FBCLID", noPhone: "No Phone", noEmail: "No Email", invalidPaidAt: "Invalid Paid At", futurePaidAt: "Future Paid At" };
                      return (
                        <div key={key} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                          <span className="text-sm text-gray-600">{labels[key]}</span>
                          <span className={`text-sm font-semibold ${count > 0 ? "text-amber-600" : "text-green-600"}`}>{count} orders</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 leading-relaxed">
                  <strong>Idempotency:</strong> Already-sent orders are always skipped regardless of filters.
                  {platform === "meta" ? " Checks sent_to_meta flag AND meta_events table." : " Checks google_ads_uploaded_at column."}
                  {" "}Backfilled orders are tagged <code className="bg-gray-200 px-1 rounded">{platform === "meta" ? "meta_backfill_replayed" : "google_backfill_replayed"} = true</code> so they&apos;re distinguishable from live webhook sends.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Dry Run Tab ── */}
      {activeTab === "dry-run" && (
        <div className="space-y-4">
          <button onClick={runDryRun} disabled={loading}
            className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm font-semibold rounded-lg hover:bg-gray-900 disabled:opacity-50 cursor-pointer">
            {loading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-eye-line"></i>}
            Run Dry Run
          </button>
          {dryRunData && (
            <div className="space-y-3">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-semibold">{dryRunData.filter(i => i.wouldSend).length} would send</span>
                <span className="text-gray-400">{dryRunData.filter(i => i.alreadySent).length} already sent</span>
                <span className="text-amber-600">{dryRunData.filter(i => !i.wouldSend && !i.alreadySent).length} skipped</span>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Order</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Source</th>
                      {platform === "meta" && <th className="px-3 py-2 text-left font-medium text-gray-600">Paid At</th>}
                      {platform === "google" && <th className="px-3 py-2 text-left font-medium text-gray-600">Method</th>}
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dryRunData.map(item => (
                      <tr key={item.confirmationId} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-700">{item.confirmationId}</td>
                        <td className="px-3 py-2">{sourceBadge(item.sourceSystem)}</td>
                        {platform === "meta" && <td className="px-3 py-2 text-gray-500">{fmt(item.paidAt)}</td>}
                        {platform === "google" && <td className="px-3 py-2 text-gray-500">{item.method ?? "—"}</td>}
                        <td className="px-3 py-2">
                          {item.alreadySent ? (
                            <span className="text-gray-400 flex items-center gap-1"><i className="ri-check-double-line"></i>Already sent</span>
                          ) : item.wouldSend ? (
                            <span className="text-green-600 flex items-center gap-1"><i className="ri-check-line"></i>Would send</span>
                          ) : (
                            <span className="text-amber-600 flex items-center gap-1"><i className="ri-alert-line"></i>Skipped</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Backfill Tab ── */}
      {activeTab === "backfill" && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3">
            <i className="ri-alert-line text-amber-600 mt-0.5"></i>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                This sends real events to {platform === "meta" ? "Meta CAPI" : "Google Ads"}
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Run Dry Run first to confirm counts. Already-sent orders are always skipped (idempotent).
                Backfilled orders are tagged <strong>backfill_replayed = true</strong> — they will NOT affect live webhook behavior.
              </p>
            </div>
          </div>

          <button onClick={runBackfill} disabled={loading}
            className="whitespace-nowrap w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white text-sm font-bold rounded-lg hover:bg-black disabled:opacity-50 cursor-pointer">
            {loading
              ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
              : <><i className="ri-send-plane-line"></i>Start Backfill — {platform === "meta" ? "Meta CAPI" : "Google Ads"}</>
            }
          </button>

          {backfillSummary && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{backfillSummary.sent ?? backfillSummary.uploaded ?? 0}</p>
                <p className="text-xs text-green-600 font-medium">Sent</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-700">{backfillSummary.skipped ?? 0}</p>
                <p className="text-xs text-gray-500 font-medium">Skipped</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-700">{backfillSummary.failed ?? 0}</p>
                <p className="text-xs text-red-500 font-medium">Failed</p>
              </div>
            </div>
          )}

          {backfillResults && backfillResults.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Order</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Source</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {backfillResults.map(r => {
                    const isSent = r.status === "sent" || (r.success === true && !r.skipped);
                    const isFailed = r.status === "failed" || (r.success === false && !r.skipped);
                    const isSkipped = r.status === "skipped" || r.skipped;
                    return (
                      <tr key={r.confirmationId} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-700">{r.confirmationId}</td>
                        <td className="px-3 py-2">{sourceBadge(r.sourceSystem)}</td>
                        <td className="px-3 py-2">
                          {isSent && <span className="text-green-600 flex items-center gap-1"><i className="ri-check-line"></i>Sent{r.isBackfillReplay && <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 px-1 rounded">replay</span>}</span>}
                          {isSkipped && <span className="text-gray-400 flex items-center gap-1"><i className="ri-skip-forward-line"></i>Skipped</span>}
                          {isFailed && <span className="text-red-600 flex items-center gap-1"><i className="ri-close-line"></i>Failed</span>}
                        </td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[200px]">
                          {r.value ? `$${r.value}` : ""}
                          {r.error && <span className="text-red-500" title={r.error}>{r.error.slice(0, 60)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
