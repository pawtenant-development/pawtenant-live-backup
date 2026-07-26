import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";

// ── Marketing ROI & Sync Health (consolidated) ──────────────────────────────
// THE one marketing section in Accounts (correction addendum §6) — the former
// separate "Marketing Spend & ROI" cards were a near-duplicate of this panel
// and were merged here. Reads get_marketing_roi_health(p_from, p_to) ONCE per
// range (no second spend RPC for presentation), which aggregates synced ad
// spend (USD) and PawTenant order attribution per platform (Google / Meta /
// Microsoft). It NEVER writes and never changes Operating Net — spend is
// deducted exactly once, in the Company Expenses ledger.
//
// Honest states:
//   • Google — connected once spend syncs land.
//   • Meta   — "Permission error" until a Meta ads_read token is configured.
//   • Microsoft — "Pending OAuth" (spend sync not implemented yet); attributed
//     orders/revenue from msclkid still display, spend stays $0 — never estimated.
//
// The "Sync now" button calls the SAME shared manual sync flow as the header's
// Sync Ads quick action (one implementation lifted to PaymentsTab — no
// duplicate sync path, no cron, no campaign or budget mutation).

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

/** Sync facts lifted to the Accounts shell (header quick action + status). */
export interface MarketingHealthResult {
  loading: boolean;
  error: string;
  /** Most recent successful platform sync across Google + Meta. */
  lastSyncedAt: string | null;
  /** True when any spend platform reports an error state. */
  anySyncError: boolean;
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

export default function MarketingROIHealthPanel({
  from, to, rangeLabel,
  canSync = false, syncing = false, syncMsg = "", syncMsgTone = "ok", onSyncNow,
  reloadSignal = 0, onHealth,
}: {
  from: string;
  to: string;
  rangeLabel: string;
  canSync?: boolean;
  /** Shared sync state (owned by PaymentsTab — same flow as the header action). */
  syncing?: boolean;
  syncMsg?: string;
  syncMsgTone?: "ok" | "err";
  onSyncNow?: () => void;
  /** Bumped after a successful sync so this panel re-reads fresh spend. */
  reloadSignal?: number;
  onHealth?: (r: MarketingHealthResult) => void;
}) {
  const [data, setData] = useState<RoiHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // §7: blended summary always visible; per-platform cards are the detail layer.
  const [showPlatforms, setShowPlatforms] = useState(false);

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

  // Refresh after a successful shared sync (skip the initial 0).
  useEffect(() => {
    if (reloadSignal > 0) void load();
  }, [reloadSignal, load]);

  const platforms = useMemo(() => data?.platforms ?? [], [data]);

  // Spend-truth platforms (Google + Meta); Microsoft has no spend sync yet.
  const spendPlatforms = useMemo(() => platforms.filter((p) => p.platform !== "microsoft_ads"), [platforms]);

  // Blended totals — spend / Operating-Net impact exclude Microsoft (no spend
  // sync). Revenue + paid orders include every attributed platform.
  const totals = useMemo(() => {
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
  }, [platforms, spendPlatforms]);

  // Sync health rollup for the header chip + lifted result.
  const lastSyncedAt = useMemo(() => {
    const times = spendPlatforms.map((p) => p.last_synced_at).filter((t): t is string => !!t).sort();
    return times.length > 0 ? times[times.length - 1] : null;
  }, [spendPlatforms]);
  const anySyncError = useMemo(
    () => spendPlatforms.some((p) => p.connection === "permission_error" || p.connection === "last_sync_failed"),
    [spendPlatforms],
  );

  useEffect(() => {
    if (!onHealth) return;
    onHealth({ loading, error, lastSyncedAt, anySyncError });
  }, [onHealth, loading, error, lastSyncedAt, anySyncError]);

  const healthChip = anySyncError
    ? { label: "Sync error", cls: "bg-rose-50 text-rose-700 border-rose-200", icon: "ri-error-warning-line" }
    : lastSyncedAt
      ? { label: "Healthy", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "ri-checkbox-circle-line" }
      : { label: "No sync yet", cls: "bg-gray-50 text-gray-600 border-gray-200", icon: "ri-time-line" };

  return (
    <div className="mt-4 bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <i className="ri-radar-line text-[#3b6ea5]"></i>Marketing ROI &amp; Sync Health
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Ad platforms are the spend truth; PawTenant paid orders are the revenue truth — for{" "}
            <span className="font-semibold text-[#3b6ea5]">{rangeLabel}</span>. Spend converted at a fixed{" "}
            {data?.fx_pkr_per_usd ?? 280} PKR/USD. Spend is deducted from Operating Net once, in Company Expenses — never twice.
          </p>
        </div>
        {/* No `shrink-0`: it pinned this group to its 353px intrinsic width
            inside a ~286px column at 360px, so flex-wrap could never engage and
            the "Sync now" button was cut off past the viewport edge (an
            ancestor clips overflow, so it was unreachable, not just off-screen).
            Letting the group shrink lets its own flex-wrap do the work. */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Sync Health + Last Sync — §6 summary requirements */}
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${healthChip.cls}`}>
            <i className={healthChip.icon}></i>{healthChip.label}
          </span>
          <span className="text-[11px] text-gray-400 tabular-nums">Last sync: {fmtTime(lastSyncedAt)}</span>
          {canSync && onSyncNow && (
            <button type="button" onClick={onSyncNow} disabled={syncing || !from || !to}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors">
              <i className={`ri-refresh-line ${syncing ? "animate-spin" : ""}`}></i>{syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      </div>

      {syncMsg && (
        <div className={`mb-3 px-3 py-2 rounded-lg text-xs break-words border ${
          syncMsgTone === "err" ? "bg-rose-50 border-rose-200 text-rose-700" : "bg-blue-50 border-blue-200 text-blue-800"
        }`}>{syncMsg}</div>
      )}

      {loading ? (
        <div className="py-8 text-center text-xs text-gray-500"><i className="ri-loader-4-line animate-spin text-xl block mb-2 text-[#3b6ea5]"></i>Loading marketing ROI…</div>
      ) : error ? (
        <div className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
          <i className="ri-error-warning-line"></i> {error}
        </div>
      ) : (
        <>
          {/* Blended summary — always visible */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {[
              { label: "Total Ad Spend", value: fmtUsd(totals.spend), color: "text-rose-500", icon: "ri-megaphone-line", sub: "Google + Meta (USD)" },
              { label: "Attributed Paid Orders", value: fmtNum(totals.paid), color: "text-gray-800", icon: "ri-shopping-bag-3-line", sub: "all platforms" },
              { label: "Attributed Revenue", value: fmtUsd(totals.revenue), color: "text-emerald-600", icon: "ri-money-dollar-circle-line", sub: "PawTenant paid orders" },
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

          {/* Per-platform detail — collapsible (§7) */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowPlatforms((s) => !s)}
              aria-expanded={showPlatforms}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
            >
              <i className={showPlatforms ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}></i>
              {showPlatforms ? "Hide platform detail" : "Show platform detail (Google · Meta · Microsoft)"}
            </button>
          </div>

          {showPlatforms && (
          <div className="space-y-3 mt-3">
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
          )}

          {totals.spend === 0 && (
            <p className="text-[11px] text-gray-400 mt-2">
              No spend stored for this range yet. Spend appears after a successful sync. Cost-per-order uses PawTenant paid orders (not platform-reported conversions).
            </p>
          )}

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
