import { useState, useEffect, useCallback } from "react";
import { supabase, getAdminUserToken } from "../../../lib/supabaseClient";

// Marketing Spend & ROI layer for Accounts/Payments.
// Reads spend (USD) + paid-order counts from get_marketing_spend_summary (admin-gated
// RPC). Business Net is passed in unchanged; Net After Marketing is a separate layer:
//   Net After Marketing = Business Net − Total Marketing Spend.
// Optional admin "Sync now" button triggers the protected sync-marketing-spend fn.

interface SyncInfo {
  last_synced_at: string | null;
  status: string | null;
  error: string | null;
  rows: number | null;
  date_from?: string;
  date_to?: string;
}

interface MarketingSummary {
  date_from: string;
  date_to: string;
  currency: string;
  google_spend_usd: number;
  meta_spend_usd: number;
  total_spend_usd: number;
  paid_orders_total: number;
  paid_orders_google: number;
  paid_orders_meta: number;
  cost_per_paid_order: number | null;
  google_cost_per_paid_order: number | null;
  meta_cost_per_paid_order: number | null;
  last_sync: Record<string, SyncInfo>;
}

const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "never";
  try { return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
};

export default function MarketingSpendPanel({ from, to, businessNet, rangeLabel, canSync }: {
  from: string;
  to: string;
  businessNet: number;
  rangeLabel: string;
  canSync: boolean;
}) {
  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
  const [data, setData] = useState<MarketingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    const { data: res, error: err } = await supabase.rpc("get_marketing_spend_summary", { p_from: from, p_to: to });
    if (err) setError(err.message || "Failed to load marketing spend");
    else setData(res as unknown as MarketingSummary);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const token = await getAdminUserToken();
      if (!token) { setSyncMsg("Session expired — please re-login to sync."); setSyncing(false); return; }
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-marketing-spend`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ platform: "all", dateFrom: from, dateTo: to }),
      });
      const j = await res.json() as { ok?: boolean; error?: string; results?: { platform: string; success: boolean; rowsUpserted: number; error?: string }[] };
      if (j.results && j.results.length) {
        const parts = j.results.map((r) =>
          `${r.platform === "google_ads" ? "Google" : "Meta"}: ${r.success ? `${r.rowsUpserted} rows` : `error — ${(r.error || "").slice(0, 80)}`}`);
        setSyncMsg(parts.join("  ·  "));
      } else {
        setSyncMsg(j.error || "Sync failed");
      }
      await load();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : "Sync failed");
    }
    setSyncing(false);
  };

  const totalSpend = data?.total_spend_usd ?? 0;
  const netAfter = businessNet - totalSpend;
  const gSync = data?.last_sync?.google_ads;
  const mSync = data?.last_sync?.meta_ads;

  const cards = [
    { label: "Google Ads Spend", value: fmtUsd(data?.google_spend_usd), icon: "ri-google-fill", color: "text-[#4285F4]", sub: `${data?.paid_orders_google ?? 0} paid orders (Google)` },
    { label: "Meta Ads Spend", value: fmtUsd(data?.meta_spend_usd), icon: "ri-meta-fill", color: "text-[#0866FF]", sub: `${data?.paid_orders_meta ?? 0} paid orders (Meta)` },
    { label: "Total Marketing Spend", value: fmtUsd(totalSpend), icon: "ri-megaphone-line", color: "text-rose-500", sub: "Google + Meta (USD)" },
    { label: "Business Net (before marketing)", value: fmtUsd(businessNet), icon: "ri-line-chart-line", color: "text-[#0f766e]", sub: "Stripe net − refunds − payouts" },
    { label: "Net After Marketing", value: fmtUsd(netAfter), icon: "ri-funds-box-line", color: netAfter >= 0 ? "text-[#0f766e]" : "text-rose-600", sub: "Business Net − marketing spend" },
    { label: "Cost / Paid Order", value: fmtUsd(data?.cost_per_paid_order), icon: "ri-price-tag-3-line", color: "text-gray-800", sub: `${data?.paid_orders_total ?? 0} paid orders total` },
    { label: "Google Cost / Order", value: fmtUsd(data?.google_cost_per_paid_order), icon: "ri-google-line", color: "text-[#4285F4]", sub: "Google spend ÷ Google orders" },
    { label: "Meta Cost / Order", value: fmtUsd(data?.meta_cost_per_paid_order), icon: "ri-facebook-circle-line", color: "text-[#0866FF]", sub: "Meta spend ÷ Meta orders" },
  ];

  const SyncStatus = ({ label, info }: { label: string; info?: SyncInfo }) => {
    const isErr = info?.status === "error";
    return (
      <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${isErr ? "bg-rose-50 border-rose-200 text-rose-700" : info?.status === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
        <i className={`${isErr ? "ri-error-warning-line" : info?.status === "success" ? "ri-checkbox-circle-line" : "ri-time-line"} mt-0.5`}></i>
        <div className="min-w-0">
          <span className="font-bold">{label}</span>{" "}
          <span>· last synced {fmtTime(info?.last_synced_at)}{info?.rows != null ? ` · ${info.rows} rows` : ""}</span>
          {isErr && info?.error && <div className="mt-0.5 break-words">{info.error}</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <i className="ri-megaphone-line text-rose-500"></i>Marketing Spend &amp; ROI
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Google Ads + Meta Ads spend (USD) for <span className="font-semibold text-[#3b6ea5]">{rangeLabel}</span>. Marketing is a separate layer below Business Net.
          </p>
        </div>
        {canSync && (
          <button type="button" onClick={handleSync} disabled={syncing || !from || !to}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
            <i className={`ri-refresh-line ${syncing ? "animate-spin" : ""}`}></i>{syncing ? "Syncing…" : "Sync now"}
          </button>
        )}
      </div>

      {syncMsg && (
        <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 break-words">{syncMsg}</div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs text-gray-500"><i className="ri-loader-4-line animate-spin text-xl block mb-2 text-[#3b6ea5]"></i>Loading marketing spend…</div>
      ) : error ? (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
          <i className="ri-error-warning-line"></i> {error}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {cards.map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-xl border border-gray-200 p-3.5">
                <div className="flex items-center gap-2 mb-1">
                  <i className={`${s.icon} ${s.color} text-base`}></i>
                  <span className="text-[11px] text-gray-500 font-medium leading-tight">{s.label}</span>
                </div>
                <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            <SyncStatus label="Google Ads" info={gSync} />
            <SyncStatus label="Meta Ads" info={mSync} />
          </div>

          {(totalSpend === 0) && (
            <p className="text-[11px] text-gray-400 mt-2">
              No spend stored for this range yet. Spend appears after a successful sync. Cost-per-order uses PawTenant paid orders (not platform-reported conversions).
            </p>
          )}
        </>
      )}
    </div>
  );
}
