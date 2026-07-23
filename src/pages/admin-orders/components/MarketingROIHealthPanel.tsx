import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";

// ── Marketing ROI / Attribution Audit + Sync Health ─────────────────────────
// Read-only, admin-gated. Reads get_marketing_roi_health(p_from, p_to) which
// aggregates synced ad spend (USD, FX 1 USD = 280 PKR) and PawTenant order
// attribution per platform (Google / Meta / Microsoft). It NEVER writes and is
// independent of the Accounts Books P&L — it only reports.
//
// Honest states:
//   • Google — connected once spend syncs land.
//   • Meta   — "Permission error" until a Meta ads_read token is configured.
//   • Microsoft — "Pending OAuth" (spend sync not implemented yet); attributed
//     orders/revenue from msclkid still display, spend stays $0.

type Connection = "connected" | "permission_error" | "pending_oauth" | "last_sync_failed" | "no_data";

interface PlatformRow {
  platform: string;
  display_name: string;
  spend_usd: number;
  spend_currency: string;
  spend_rows: number;
  orders_attributed: number;
  paid_orders_attributed: number;
  revenue_usd: number;
  cpa: number | null;
  roas: number | null;
  roi_pct: number | null;
  connection: Connection;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_rows: number | null;
  operating_net_impact: number;
}

interface RoiHealth {
  date_from: string;
  date_to: string;
  currency: string;
  fx_pkr_per_usd: number;
  platforms: PlatformRow[];
}

const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtNum = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("en-US"));
const fmtRoas = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toFixed(2)}×`);
const fmtRoi = (n: number | null | undefined) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);
const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "never";
  try { return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }); }
  catch { return iso; }
};

const PLATFORM_VISUAL: Record<string, { icon: string; color: string }> = {
  google_ads:    { icon: "ri-google-fill", color: "text-[#4285F4]" },
  meta_ads:      { icon: "ri-meta-fill",   color: "text-[#0866FF]" },
  microsoft_ads: { icon: "ri-microsoft-line", color: "text-[#00A4EF]" },
};

const CONNECTION_VISUAL: Record<Connection, { label: string; cls: string; icon: string }> = {
  connected:       { label: "Connected",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "ri-checkbox-circle-line" },
  permission_error:{ label: "Permission error", cls: "bg-rose-50 text-rose-700 border-rose-200",          icon: "ri-error-warning-line" },
  pending_oauth:   { label: "Pending OAuth",    cls: "bg-amber-50 text-amber-700 border-amber-200",       icon: "ri-time-line" },
  last_sync_failed:{ label: "Last sync failed", cls: "bg-rose-50 text-rose-700 border-rose-200",          icon: "ri-close-circle-line" },
  no_data:         { label: "No data yet",      cls: "bg-gray-50 text-gray-600 border-gray-200",          icon: "ri-time-line" },
};

function CONNECTION_NOTE(p: PlatformRow): string {
  switch (p.connection) {
    case "connected":        return "Spend auto-synced for the selected range and included in Operating Net.";
    case "permission_error": return "Sync failed with a permission/token error. Add or refresh the ad_read token to enable spend sync.";
    case "pending_oauth":    return p.platform === "microsoft_ads"
      ? "Microsoft Ads spend sync not implemented yet (OAuth pending). Attributed orders shown from msclkid; spend stays $0."
      : "Connection pending — complete OAuth to enable spend sync.";
    case "last_sync_failed": return "The latest sync run failed. See the error below; spend may be stale or missing.";
    case "no_data":          return "No spend synced for this range yet. Spend appears after a successful sync.";
  }
}

export default function MarketingROIHealthPanel({ from, to, rangeLabel }: {
  from: string;
  to: string;
  rangeLabel: string;
}) {
  const [data, setData] = useState<RoiHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    const { data: res, error: err } = await supabase.rpc("get_marketing_roi_health", { p_from: from, p_to: to });
    if (err) setError(err.message || "Failed to load marketing ROI health");
    else setData(res as unknown as RoiHealth);
    setLoading(false);
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const platforms = data?.platforms ?? [];

  // Blended totals — spend / Operating-Net impact exclude Microsoft (no spend
  // sync). Revenue + paid orders include every attributed platform.
  const totals = useMemo(() => {
    const spendPlatforms = platforms.filter((p) => p.platform !== "microsoft_ads");
    const spend = spendPlatforms.reduce((s, p) => s + (p.spend_usd || 0), 0);
    const revenue = platforms.reduce((s, p) => s + (p.revenue_usd || 0), 0);
    const spendRevenue = spendPlatforms.reduce((s, p) => s + (p.revenue_usd || 0), 0);
    const paid = platforms.reduce((s, p) => s + (p.paid_orders_attributed || 0), 0);
    const spendPaid = spendPlatforms.reduce((s, p) => s + (p.paid_orders_attributed || 0), 0);
    const netImpact = platforms.reduce((s, p) => s + (p.operating_net_impact || 0), 0);
    return {
      spend,
      revenue,
      paid,
      cpa: spend > 0 && spendPaid > 0 ? spend / spendPaid : null,
      roas: spend > 0 ? spendRevenue / spend : null,
      roi: spend > 0 ? ((spendRevenue - spend) / spend) * 100 : null,
      netImpact,
    };
  }, [platforms]);

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <i className="ri-radar-line text-[#3b6ea5]"></i>Marketing ROI &amp; Sync Health
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Spend, attribution &amp; ROI per ad platform for <span className="font-semibold text-[#3b6ea5]">{rangeLabel}</span>.
            Spend converted at a fixed {data?.fx_pkr_per_usd ?? 280} PKR/USD. Audit-only — never changes Accounts Books.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-gray-500"><i className="ri-loader-4-line animate-spin text-xl block mb-2 text-[#3b6ea5]"></i>Loading marketing ROI…</div>
      ) : error ? (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
          <i className="ri-error-warning-line"></i> {error}
        </div>
      ) : (
        <>
          {/* Blended summary */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {[
              { label: "Total Ad Spend", value: fmtUsd(totals.spend), color: "text-rose-500", icon: "ri-megaphone-line", sub: "Google + Meta (USD)" },
              { label: "Attributed Revenue", value: fmtUsd(totals.revenue), color: "text-emerald-600", icon: "ri-money-dollar-circle-line", sub: `${fmtNum(totals.paid)} paid orders` },
              { label: "Blended CPA", value: fmtUsd(totals.cpa), color: "text-gray-800", icon: "ri-price-tag-3-line", sub: "Spend ÷ paid orders" },
              { label: "Blended ROAS", value: fmtRoas(totals.roas), color: "text-[#3b6ea5]", icon: "ri-line-chart-line", sub: "Revenue ÷ spend" },
              { label: "ROI", value: fmtRoi(totals.roi), color: (totals.roi ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600", icon: "ri-funds-line", sub: "(Rev − spend) ÷ spend" },
              { label: "Operating Net Impact", value: fmtUsd(totals.netImpact), color: "text-rose-500", icon: "ri-scales-3-line", sub: "Spend deducted in Accounts" },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded-xl border border-gray-200 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <i className={`${s.icon} ${s.color} text-sm`}></i>
                  <span className="text-[11px] text-gray-500 font-medium leading-tight">{s.label}</span>
                </div>
                <p className={`text-lg font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {/* Per-platform cards */}
          <div className="space-y-3">
            {platforms.map((p) => {
              const pv = PLATFORM_VISUAL[p.platform] ?? { icon: "ri-global-line", color: "text-gray-500" };
              const cv = CONNECTION_VISUAL[p.connection] ?? CONNECTION_VISUAL.no_data;
              return (
                <div key={p.platform} className="rounded-xl border border-gray-200 overflow-hidden">
                  {/* Card header: platform + connection status + last sync */}
                  <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <i className={`${pv.icon} ${pv.color} text-lg`}></i>
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-gray-900">{p.display_name}</p>
                        <p className="text-[11px] text-gray-500">{CONNECTION_NOTE(p)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${cv.cls}`}>
                        <i className={cv.icon}></i>{cv.label}
                      </span>
                      <span className="text-[11px] text-gray-400 tabular-nums">
                        Last sync: {fmtTime(p.last_synced_at)}{p.last_rows != null ? ` · ${fmtNum(p.last_rows)} rows` : ""}
                      </span>
                    </div>
                  </div>

                  {/* Metrics grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 divide-x divide-y sm:divide-y-0 divide-gray-100">
                    <Metric label="Spend" value={fmtUsd(p.spend_usd)} sub={p.spend_currency} tone="rose" />
                    <Metric label="Orders" value={fmtNum(p.orders_attributed)} sub="attributed" />
                    <Metric label="Paid Orders" value={fmtNum(p.paid_orders_attributed)} sub="attributed" />
                    <Metric label="Revenue" value={fmtUsd(p.revenue_usd)} sub="paid orders" tone="emerald" />
                    <Metric label="CPA" value={fmtUsd(p.cpa)} sub="spend ÷ paid" />
                    <Metric label="ROAS" value={fmtRoas(p.roas)} sub="rev ÷ spend" tone="blue" />
                    <Metric label="ROI" value={fmtRoi(p.roi_pct)} sub="net ÷ spend" tone={(p.roi_pct ?? 0) >= 0 ? "emerald" : "rose"} />
                    <Metric label="Net Impact" value={fmtUsd(p.operating_net_impact)} sub="on Operating Net" tone="rose" />
                  </div>

                  {/* Error detail */}
                  {p.last_error && (p.connection === "permission_error" || p.connection === "last_sync_failed") && (
                    <div className="px-4 py-2 bg-rose-50/60 border-t border-rose-100">
                      <p className="text-[10px] text-rose-600 font-mono break-all line-clamp-3"><i className="ri-bug-line not-italic mr-1"></i>{p.last_error}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
            Attribution uses canonical order signals (attribution channel, UTM source, gclid / fbclid / msclkid). “Orders” counts leads created in range;
            “Paid Orders” and “Revenue” count orders paid in range. ROAS / ROI use PawTenant revenue (not platform-reported conversions).
            Only Google &amp; Meta synced spend feeds Operating Net; Microsoft stays $0 until its OAuth/spend sync ships.
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "rose" | "emerald" | "blue" }) {
  const valCls = tone === "rose" ? "text-rose-500" : tone === "emerald" ? "text-emerald-600" : tone === "blue" ? "text-[#3b6ea5]" : "text-gray-800";
  return (
    <div className="px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">{label}</p>
      <p className={`text-sm font-extrabold ${valCls}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
    </div>
  );
}
