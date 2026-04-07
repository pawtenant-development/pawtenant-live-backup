/**
 * MetaEventsBackfillPanel — Admin panel for Meta CAPI event backfill and preview.
 *
 * Features:
 *   - Preview report showing eligible orders, sent count, pending count
 *   - Missing data issues (no fbclid, no phone, no email, invalid paid_at)
 *   - Dry-run mode showing exactly which orders would be sent
 *   - Backfill mode to actually send events to Meta CAPI
 *   - Idempotency safeguards prevent double-sending
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

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
  orderId: string;
  confirmationId: string;
  eventId?: string;
  eventName?: string;
  value?: number;
  currency?: string;
  paidAt?: string;
  hasEmail: boolean;
  hasPhone: boolean;
  hasFbclid: boolean;
  wouldSend: boolean;
  alreadySent: boolean;
  requiredFieldsPresent: boolean;
}

interface BackfillResult {
  orderId: string;
  confirmationId: string;
  eventId?: string;
  status: "sent" | "skipped" | "failed";
  value?: number;
  error?: string;
}

interface ApiResponse {
  ok: boolean;
  mode: string;
  report?: PreviewReport;
  preview?: DryRunItem[];
  wouldSendCount?: number;
  alreadySentCount?: number;
  skippedCount?: number;
  summary?: { sent: number; skipped: number; failed: number; total: number };
  results?: BackfillResult[];
  config?: { hasMetaPixelId: boolean; hasMetaCapiAccessToken: boolean; note?: string };
  error?: string;
  hint?: string;
}

export default function MetaEventsBackfillPanel() {
  const [loading, setLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewReport | null>(null);
  const [dryRunData, setDryRunData] = useState<DryRunItem[] | null>(null);
  const [backfillResults, setBackfillResults] = useState<BackfillResult[] | null>(null);
  const [backfillSummary, setBackfillSummary] = useState<{ sent: number; skipped: number; failed: number; total: number } | null>(null);
  const [config, setConfig] = useState<{ hasMetaPixelId: boolean; hasMetaCapiAccessToken: boolean; note?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"preview" | "dry-run" | "backfill">("preview");
  const [limit, setLimit] = useState(50);
  const [testEventCode, setTestEventCode] = useState("");

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Not authenticated");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/send-meta-events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ mode: "preview" }),
        }
      );

      const data = await res.json() as ApiResponse;
      if (data.ok && data.report) {
        setPreviewData(data.report);
        setConfig(data.config || null);
      } else {
        setError(data.error || "Failed to fetch preview");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const runDryRun = useCallback(async () => {
    setLoading(true);
    setError(null);
    setDryRunData(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Not authenticated");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/send-meta-events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ mode: "dry-run", limit }),
        }
      );

      const data = await res.json() as ApiResponse;
      if (data.ok && data.preview) {
        setDryRunData(data.preview);
        setConfig(data.config || null);
      } else {
        setError(data.error || "Failed to run dry-run");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [limit]);

  const runBackfill = useCallback(async () => {
    if (!confirm(`Are you sure you want to send ${limit} orders to Meta CAPI? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    setBackfillResults(null);
    setBackfillSummary(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Not authenticated");
        return;
      }

      const body: { mode: string; limit: number; testEventCode?: string } = {
        mode: "backfill",
        limit,
      };
      if (testEventCode.trim()) {
        body.testEventCode = testEventCode.trim();
      }

      const res = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/send-meta-events`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json() as ApiResponse;
      if (data.ok && data.results) {
        setBackfillResults(data.results);
        setBackfillSummary(data.summary || null);
      } else {
        setError(data.error || data.hint || "Failed to run backfill");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [limit, testEventCode]);

  useEffect(() => {
    if (activeTab === "preview") {
      fetchPreview();
    }
  }, [activeTab, fetchPreview]);

  const renderConfigBanner = () => {
    if (!config) return null;
    const allConfigured = config.hasMetaPixelId && config.hasMetaCapiAccessToken;
    
    return (
      <div className={`rounded-lg px-4 py-3 mb-6 ${allConfigured ? "bg-green-50 border border-green-200" : "bg-amber-50 border border-amber-200"}`}>
        <div className="flex items-start gap-3">
          <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 ${allConfigured ? "text-green-600" : "text-amber-600"}`}>
            <i className={allConfigured ? "ri-checkbox-circle-fill" : "ri-alert-fill"}></i>
          </div>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${allConfigured ? "text-green-800" : "text-amber-800"}`}>
              {allConfigured ? "Meta CAPI Configuration OK" : "Meta CAPI Configuration Incomplete"}
            </p>
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <i className={`${config.hasMetaPixelId ? "ri-checkbox-circle-line text-green-600" : "ri-close-circle-line text-red-500"}`}></i>
                <span className={config.hasMetaPixelId ? "text-green-700" : "text-red-600"}>
                  META_PIXEL_ID: {config.hasMetaPixelId ? "Configured" : "Missing"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <i className={`${config.hasMetaCapiAccessToken ? "ri-checkbox-circle-line text-green-600" : "ri-close-circle-line text-red-500"}`}></i>
                <span className={config.hasMetaCapiAccessToken ? "text-green-700" : "text-red-600"}>
                  META_CAPI_ACCESS_TOKEN: {config.hasMetaCapiAccessToken ? "Configured" : "Missing"}
                </span>
              </div>
            </div>
            {config.note && (
              <p className="text-xs text-amber-700 mt-2">{config.note}</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Meta CAPI Event Backfill</h3>
          <p className="text-sm text-gray-500 mt-1">
            Preview and backfill Purchase events to Meta Conversions API with idempotency safeguards.
          </p>
        </div>
        <div className="w-10 h-10 flex items-center justify-center bg-blue-100 rounded-lg">
          <i className="ri-messenger-line text-blue-600 text-xl"></i>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {(["preview", "dry-run", "backfill"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors cursor-pointer ${
              activeTab === tab
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {tab === "preview" && (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-bar-chart-line"></i> Preview Report
              </span>
            )}
            {tab === "dry-run" && (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-eye-line"></i> Dry Run
              </span>
            )}
            {tab === "backfill" && (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-send-plane-line"></i> Backfill
              </span>
            )}
          </button>
        ))}
      </div>

      {renderConfigBanner()}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
          <div className="flex items-start gap-3">
            <i className="ri-error-warning-line text-red-500 mt-0.5"></i>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Preview Tab */}
      {activeTab === "preview" && (
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <i className="ri-loader-4-line animate-spin text-2xl text-gray-400"></i>
            </div>
          ) : previewData ? (
            <div className="space-y-6">
              {/* Stats Grid */}
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
                  <p className="text-xs text-amber-600 font-medium">Pending</p>
                </div>
              </div>

              {/* Missing Data Issues */}
              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Missing Data Issues</h4>
                <div className="space-y-2">
                  {Object.entries(previewData.missingDataIssues).map(([key, count]) => {
                    const labels: Record<string, string> = {
                      noFbclid: "No FBCLID (attribution)",
                      noPhone: "No Phone Number",
                      noEmail: "No Email Address",
                      invalidPaidAt: "Invalid Paid At",
                      futurePaidAt: "Future Paid At Date",
                    };
                    return (
                      <div key={key} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                        <span className="text-sm text-gray-600">{labels[key]}</span>
                        <span className={`text-sm font-semibold ${count > 0 ? "text-amber-600" : "text-green-600"}`}>
                          {count} orders
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-600 leading-relaxed">
                  <strong>Idempotency:</strong> Each order can only be sent once. The system uses a unique constraint 
                  on <code className="bg-gray-200 px-1 rounded">order_id + event_name</code> in the meta_events table 
                  and checks the <code className="bg-gray-200 px-1 rounded">sent_to_meta</code> flag before sending.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <p>Click refresh to load preview data</p>
              <button
                onClick={fetchPreview}
                className="mt-4 px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 cursor-pointer"
              >
                Refresh Preview
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dry Run Tab */}
      {activeTab === "dry-run" && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Limit</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value={10}>10 orders</option>
                <option value={25}>25 orders</option>
                <option value={50}>50 orders</option>
                <option value={100}>100 orders</option>
              </select>
            </div>
            <div className="pt-5">
              <button
                onClick={runDryRun}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {loading ? <i className="ri-loader-4-line animate-spin"></i> : "Run Dry Run"}
              </button>
            </div>
          </div>

          {dryRunData && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span className="text-green-600 font-medium">
                  {dryRunData.filter(i => i.wouldSend).length} would send
                </span>
                <span className="text-gray-500">
                  {dryRunData.filter(i => i.alreadySent).length} already sent
                </span>
                <span className="text-amber-600">
                  {dryRunData.filter(i => !i.wouldSend && !i.alreadySent).length} skipped
                </span>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Order ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Event ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Value</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dryRunData.map((item) => (
                      <tr key={item.orderId} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-600">{item.confirmationId}</td>
                        <td className="px-3 py-2 font-mono text-gray-500">{item.eventId || "—"}</td>
                        <td className="px-3 py-2">{item.value ? `$${item.value}` : "—"}</td>
                        <td className="px-3 py-2">
                          {item.alreadySent ? (
                            <span className="inline-flex items-center gap-1 text-gray-500">
                              <i className="ri-check-double-line"></i> Already sent
                            </span>
                          ) : item.wouldSend ? (
                            <span className="inline-flex items-center gap-1 text-green-600">
                              <i className="ri-check-line"></i> Would send
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <i className="ri-alert-line"></i> Missing data
                            </span>
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

      {/* Backfill Tab */}
      {activeTab === "backfill" && (
        <div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-start gap-3">
              <i className="ri-alert-line text-amber-600 mt-0.5"></i>
              <div>
                <p className="text-sm font-semibold text-amber-800">Warning: This will send real events to Meta</p>
                <p className="text-xs text-amber-700 mt-1">
                  Only orders that haven&apos;t been sent before will be processed. 
                  Use Test Event Code to verify in Meta Events Manager before sending live events.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Limit</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value={10}>10 orders</option>
                <option value={25}>25 orders</option>
                <option value={50}>50 orders</option>
                <option value={100}>100 orders</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Test Event Code (optional)
              </label>
              <input
                type="text"
                value={testEventCode}
                onChange={(e) => setTestEventCode(e.target.value)}
                placeholder="e.g., TEST12345"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <button
            onClick={runBackfill}
            disabled={loading}
            className="w-full px-4 py-3 bg-blue-500 text-white text-sm font-bold rounded-lg hover:bg-blue-600 disabled:opacity-50 cursor-pointer"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin"></i> Sending...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-send-plane-line"></i> Start Backfill
              </span>
            )}
          </button>

          {backfillSummary && (
            <div className="mt-6 grid grid-cols-3 gap-4">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{backfillSummary.sent}</p>
                <p className="text-xs text-green-600 font-medium">Sent</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-gray-700">{backfillSummary.skipped}</p>
                <p className="text-xs text-gray-600 font-medium">Skipped</p>
              </div>
              <div className="bg-red-50 rounded-lg p-4 text-center">
                <p className="text-2xl font-bold text-red-700">{backfillSummary.failed}</p>
                <p className="text-xs text-red-600 font-medium">Failed</p>
              </div>
            </div>
          )}

          {backfillResults && backfillResults.length > 0 && (
            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Order ID</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-700">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {backfillResults.map((result) => (
                    <tr key={result.orderId} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-mono text-gray-600">{result.confirmationId}</td>
                      <td className="px-3 py-2">
                        {result.status === "sent" && (
                          <span className="inline-flex items-center gap-1 text-green-600">
                            <i className="ri-check-line"></i> Sent
                          </span>
                        )}
                        {result.status === "skipped" && (
                          <span className="inline-flex items-center gap-1 text-gray-500">
                            <i className="ri-skip-forward-line"></i> Skipped
                          </span>
                        )}
                        {result.status === "failed" && (
                          <span className="inline-flex items-center gap-1 text-red-600">
                            <i className="ri-close-line"></i> Failed
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {result.value && <span className="text-gray-600">${result.value}</span>}
                        {result.error && (
                          <span className="text-red-600 truncate max-w-[200px] block" title={result.error}>
                            {result.error}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}