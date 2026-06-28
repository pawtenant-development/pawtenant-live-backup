/**
 * AIAssistantClicksPanel — Admin → Analytics view for AI Assistant Trust Card
 * button clicks.
 *
 * Read-only. UI-only. Never throws / never blocks the tab. Reads the shared
 * `events` table via fetchAiAssistantAnalytics (event_name =
 * 'ai_assistant_prompt_click'), scoped to the parent Analytics tab's date
 * window (dateFromIso / dateToIso — same props shape SmartInsightsPanel uses).
 *
 * Shows: total clicks, clicks by assistant (with share %), clicks by service
 * type, top pages, Gemini clipboard outcome, and the prompt-type split.
 */

import { useEffect, useState } from "react";
import {
  fetchAiAssistantAnalytics,
  AI_ASSISTANTS,
  AI_SERVICE_TYPES,
  type AiAssistantAnalytics,
} from "@/lib/analytics/aiAssistantAnalytics";

interface AIAssistantClicksPanelProps {
  dateFromIso: string;
  dateToIso: string;
}

// Brand-ish accents matched to the public card's buttons.
const ASSISTANT_META: Record<string, { label: string; color: string; bg: string }> = {
  chatgpt: { label: "ChatGPT", color: "#0D8F6F", bg: "bg-emerald-50" },
  claude: { label: "Claude", color: "#C8643F", bg: "bg-orange-50" },
  perplexity: { label: "Perplexity", color: "#1F7A86", bg: "bg-teal-50" },
  gemini: { label: "Gemini", color: "#3B6CF6", bg: "bg-blue-50" },
};

const SERVICE_META: Record<string, { label: string; chip: string }> = {
  general: { label: "General", chip: "bg-gray-100 text-gray-600" },
  esa: { label: "ESA", chip: "bg-emerald-50 text-emerald-700" },
  psd: { label: "PSD", chip: "bg-violet-50 text-violet-700" },
  comparison: { label: "Comparison", chip: "bg-amber-50 text-amber-700" },
};

function pct(part: number, total: number): string {
  if (!total) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function serviceLabel(key: string): string {
  return SERVICE_META[key]?.label ?? (key === "—" ? "—" : key);
}

export default function AIAssistantClicksPanel({
  dateFromIso,
  dateToIso,
}: AIAssistantClicksPanelProps) {
  const [data, setData] = useState<AiAssistantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAiAssistantAnalytics(dateFromIso, dateToIso)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || "Could not load AI assistant clicks.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateFromIso, dateToIso]);

  const total = data?.totalClicks ?? 0;
  const gem = data?.geminiClipboard ?? { copied: 0, fallback: 0, failed: 0 };
  const gemTotal = gem.copied + gem.fallback + gem.failed;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-teal-50 to-blue-50 text-teal-600">
          <i className="ri-robot-line text-base"></i>
        </span>
        <div>
          <h3 className="text-sm font-extrabold text-gray-900">AI Assistant Clicks</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Clicks on ChatGPT, Claude, Perplexity, and Gemini prompt buttons across PawTenant pages.
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="py-10 text-center text-xs text-gray-400">
          <i className="ri-loader-4-line animate-spin text-base mr-1.5 align-middle"></i>
          Loading AI assistant clicks…
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <i className="ri-error-warning-line mr-1.5"></i>
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && total === 0 && (
        <div className="py-10 text-center">
          <i className="ri-cursor-line text-2xl text-gray-300"></i>
          <p className="mt-2 text-xs text-gray-400">
            No AI assistant clicks recorded for this date range yet.
          </p>
        </div>
      )}

      {/* Data */}
      {!loading && !error && data && total > 0 && (
        <div className="p-4 sm:p-5 space-y-5">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Total clicks</p>
              <p className="mt-1 text-2xl font-extrabold text-gray-900 leading-none">{total}</p>
            </div>
            {AI_ASSISTANTS.map((a) => {
              const m = ASSISTANT_META[a];
              const n = data.byAssistant[a] ?? 0;
              return (
                <div key={a} className={`rounded-xl border border-gray-100 ${m.bg} px-3.5 py-3`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: m.color }}>
                    {m.label}
                  </p>
                  <p className="mt-1 text-2xl font-extrabold text-gray-900 leading-none">{n}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">{pct(n, total)} of clicks</p>
                </div>
              );
            })}
          </div>

          {/* Two-column: assistant breakdown + service-type / prompt-type */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Assistant breakdown table */}
            <div className="rounded-xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <h4 className="text-xs font-extrabold text-gray-700">Clicks by assistant</h4>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="text-left font-semibold px-4 py-2">Assistant</th>
                    <th className="text-right font-semibold px-4 py-2">Clicks</th>
                    <th className="text-right font-semibold px-4 py-2">Share %</th>
                  </tr>
                </thead>
                <tbody>
                  {AI_ASSISTANTS.map((a) => {
                    const m = ASSISTANT_META[a];
                    const n = data.byAssistant[a] ?? 0;
                    return (
                      <tr key={a} className="border-t border-gray-50">
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: m.color }} />
                            <span className="font-semibold text-gray-800">{m.label}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">{n}</td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{pct(n, total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Service type + prompt type + gemini clipboard */}
            <div className="space-y-5">
              {/* Service type */}
              <div className="rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                  <h4 className="text-xs font-extrabold text-gray-700">Clicks by service type</h4>
                </div>
                <div className="grid grid-cols-2 gap-px bg-gray-50">
                  {AI_SERVICE_TYPES.map((s) => (
                    <div key={s} className="bg-white px-4 py-2.5 flex items-center justify-between">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${SERVICE_META[s].chip}`}>
                        {SERVICE_META[s].label}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{data.byServiceType[s] ?? 0}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prompt type + Gemini clipboard */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-gray-100 px-4 py-3">
                  <h4 className="text-xs font-extrabold text-gray-700 mb-2">Prompt type</h4>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Prefilled link</span>
                    <span className="font-bold text-gray-900">{data.byPromptType.prefilled_link}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-500">Copy prompt</span>
                    <span className="font-bold text-gray-900">{data.byPromptType.copy_prompt}</span>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-100 px-4 py-3">
                  <h4 className="text-xs font-extrabold text-gray-700 mb-2">Gemini copy result</h4>
                  {gemTotal === 0 ? (
                    <p className="text-xs text-gray-400">No Gemini clicks yet.</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-emerald-600">Copied</span>
                        <span className="font-bold text-gray-900">{gem.copied}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-amber-600">Fallback</span>
                        <span className="font-bold text-gray-900">{gem.fallback}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm mt-1">
                        <span className="text-rose-600">Failed</span>
                        <span className="font-bold text-gray-900">{gem.failed}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Top pages */}
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
              <h4 className="text-xs font-extrabold text-gray-700">Top pages by clicks</h4>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                    <th className="text-left font-semibold px-4 py-2">Page path</th>
                    <th className="text-left font-semibold px-4 py-2">Top assistant</th>
                    <th className="text-left font-semibold px-4 py-2">Service type</th>
                    <th className="text-right font-semibold px-4 py-2">Clicks</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topPages.map((p) => {
                    const m = ASSISTANT_META[p.topAssistant];
                    return (
                      <tr key={p.page_path} className="border-t border-gray-50">
                        <td className="px-4 py-2.5 font-mono text-[12px] text-gray-700 max-w-[260px] truncate" title={p.page_path}>
                          {p.page_path}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            {m && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />}
                            <span className="text-gray-700">{m?.label ?? p.topAssistant}</span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${SERVICE_META[p.serviceType]?.chip ?? "bg-gray-100 text-gray-500"}`}>
                            {serviceLabel(p.serviceType)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-gray-900">{p.clicks}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
