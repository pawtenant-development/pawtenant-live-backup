// AdSpendPanel — Ad platform spend tracking + ROI calculator
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Campaign {
  id: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  status: string;
}

interface AdSpendData {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  campaigns: Campaign[];
  currency: string;
  dateRange: { from: string; to: string };
  error?: string;
}

interface PlatformSettings {
  platform: string;
  access_token: string | null;
  account_id: string | null;
  last_fetched_at: string | null;
  last_spend_data: AdSpendData | null;
}

interface AdSpendPanelProps {
  // Revenue from orders for the same period (passed from AnalyticsTab)
  revenueByChannel: Record<string, number>;
  // Paid order counts per channel (for CPA calculation)
  paidOrdersByChannel: Record<string, number>;
  dateFrom: string;
  dateTo: string;
  datePreset: string;
}

// ── Platform config ───────────────────────────────────────────────────────────
const PLATFORMS = [
  {
    key: "facebook",
    label: "Facebook / Instagram",
    icon: "ri-facebook-circle-fill",
    color: "text-[#1877F2]",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    chartColor: "#1877F2",
    revenueKey: "Facebook / Instagram Ads",
    fields: [
      { key: "access_token", label: "Access Token", placeholder: "EAAxxxxxxxxxxxxxxx...", type: "password", hint: "From Meta Business Suite → Settings → System Users → Generate Token (with ads_read permission)" },
      { key: "account_id", label: "Ad Account ID", placeholder: "123456789 or act_123456789", type: "text", hint: "Found in Meta Ads Manager URL: business.facebook.com/adsmanager/manage/campaigns?act=XXXXXXX" },
    ],
  },
  {
    key: "google",
    label: "Google Ads",
    icon: "ri-google-fill",
    color: "text-orange-500",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    chartColor: "#f97316",
    revenueKey: "Google Ads",
    fields: [
      // Google Ads uses shared OAuth secrets (GOOGLE_ADS_OAUTH_CLIENT_ID, GOOGLE_ADS_OAUTH_CLIENT_SECRET,
      // GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_DEVELOPER_TOKEN) — no separate access token needed here.
      // Only the Customer ID is stored in the DB for the UI.
      { key: "account_id", label: "Customer ID", placeholder: "123-456-7890", type: "text", hint: "Found in Google Ads top-right corner. Format: XXX-XXX-XXXX. OAuth credentials are shared with the conversion sync setup." },
    ],
  },
  {
    key: "tiktok",
    label: "TikTok Ads",
    icon: "ri-tiktok-fill",
    color: "text-gray-900",
    bgColor: "bg-gray-100",
    borderColor: "border-gray-300",
    chartColor: "#111827",
    revenueKey: "TikTok Ads",
    fields: [
      { key: "access_token", label: "Access Token", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", type: "password", hint: "From TikTok for Business → My Apps → App Details → Access Token" },
      { key: "account_id", label: "Advertiser ID", placeholder: "7123456789012345678", type: "text", hint: "Found in TikTok Ads Manager URL or Account Settings" },
    ],
  },
];

function fmtCurrency(n: number, currency = "USD") {
  // For PKR and other non-USD currencies, show the currency code explicitly
  if (currency === "USD") {
    return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  }
  // Format with the actual currency symbol/code
  try {
    return n.toLocaleString("en-US", { style: "currency", currency, maximumFractionDigits: 0 });
  } catch {
    // Fallback if currency code is unrecognized
    return `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtDate(ts: string) {
  return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// ── ROI Metric Card ───────────────────────────────────────────────────────────
function RoiMetric({ label, value, sub, color = "text-gray-900", icon }: {
  label: string; value: string; sub?: string; color?: string; icon: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-7 h-7 flex items-center justify-center bg-gray-50 rounded-lg flex-shrink-0">
          <i className={`${icon} text-gray-500 text-sm`}></i>
        </div>
        <span className="text-xs text-gray-500 font-medium leading-tight">{label}</span>
      </div>
      <p className={`text-xl font-extrabold ${color}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Campaign Row ──────────────────────────────────────────────────────────────
function CampaignRow({ campaign, totalSpend, currency = "USD" }: { campaign: Campaign; totalSpend: number; currency?: string }) {
  const pct = totalSpend > 0 ? Math.round((campaign.spend / totalSpend) * 100) : 0;
  const cpc = campaign.clicks > 0 ? campaign.spend / campaign.clicks : 0;
  const ctr = campaign.impressions > 0 ? (campaign.clicks / campaign.impressions) * 100 : 0;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-gray-900 truncate">{campaign.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden max-w-[80px]">
            <div className="h-full bg-[#1a5c4f] rounded-full" style={{ width: `${pct}%` }}></div>
          </div>
          <span className="text-[10px] text-gray-400">{pct}% of spend</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0 space-y-0.5">
        <p className="text-xs font-bold text-gray-900">{fmtCurrency(campaign.spend, currency)}</p>
        <p className="text-[10px] text-gray-400">
          {fmtNum(campaign.impressions)} imp · {fmtNum(campaign.clicks)} clicks
        </p>
        <p className="text-[10px] text-gray-400">
          CPC: {fmtCurrency(cpc, currency)} · CTR: {ctr.toFixed(2)}%
        </p>
      </div>
    </div>
  );
}

// ── Platform Card ─────────────────────────────────────────────────────────────
function PlatformCard({
  platform,
  settings,
  spendData,
  revenue,
  paidOrders,
  loading,
  onSaveSettings,
  onFetchSpend,
  saving,
}: {
  platform: typeof PLATFORMS[0];
  settings: PlatformSettings | null;
  spendData: AdSpendData | null;
  revenue: number;
  paidOrders: number;
  loading: boolean;
  onSaveSettings: (platform: string, token: string, accountId: string) => Promise<void>;
  onFetchSpend: (platform: string) => Promise<void>;
  saving: boolean;
}) {
  const [showSettings, setShowSettings] = useState(!settings?.access_token);
  const [tokenInput, setTokenInput] = useState(settings?.access_token ? "••••••••••••••••" : "");
  const [accountIdInput, setAccountIdInput] = useState(settings?.account_id ?? "");
  const [showToken, setShowToken] = useState(false);
  const [editingToken, setEditingToken] = useState(!settings?.access_token);

  // Google Ads uses shared OAuth secrets — only needs account_id in DB
  const isGooglePlatform = platform.key === "google";
  const isConfigured = isGooglePlatform
    ? !!settings?.account_id
    : !!(settings?.access_token && settings?.account_id);
  const currency = spendData?.currency ?? "USD";
  const spend = spendData?.spend ?? 0;
  const profit = revenue - spend;
  const roas = spend > 0 ? revenue / spend : 0;
  const roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
  const cpc = (spendData?.clicks ?? 0) > 0 ? spend / (spendData?.clicks ?? 1) : 0;
  const ctr = (spendData?.impressions ?? 0) > 0 ? ((spendData?.clicks ?? 0) / (spendData?.impressions ?? 1)) * 100 : 0;
  const cpa = paidOrders > 0 && spend > 0 ? spend / paidOrders : 0;

  const handleSave = async () => {
    // Google Ads: no access_token stored in DB (uses shared OAuth secrets)
    const token = isGooglePlatform ? "" : (editingToken ? tokenInput : (settings?.access_token ?? ""));
    await onSaveSettings(platform.key, token, accountIdInput);
    setEditingToken(false);
    setShowSettings(false);
  };

  return (
    <div className={`bg-white rounded-2xl border overflow-hidden ${platform.borderColor}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 ${platform.bgColor} border-b ${platform.borderColor}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 flex items-center justify-center bg-white rounded-xl border ${platform.borderColor} flex-shrink-0`}>
            <i className={`${platform.icon} ${platform.color} text-xl`}></i>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-gray-900">{platform.label}</h3>
            <p className={`text-xs font-semibold ${isConfigured ? "text-emerald-600" : "text-gray-400"}`}>
              {isConfigured ? (
                <span className="flex items-center gap-1">
                  <i className="ri-checkbox-circle-fill"></i>Connected
                  {settings?.last_fetched_at && ` · Last synced ${fmtDate(settings.last_fetched_at)}`}
                </span>
              ) : "Not configured"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured && (
            <button
              type="button"
              onClick={() => onFetchSpend(platform.key)}
              disabled={loading}
              className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${platform.bgColor} ${platform.borderColor} ${platform.color} hover:opacity-80`}
            >
              {loading
                ? <><i className="ri-loader-4-line animate-spin"></i>Fetching...</>
                : <><i className="ri-refresh-line"></i>Sync Now</>
              }
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <i className={showSettings ? "ri-close-line" : "ri-settings-3-line"}></i>
            {showSettings ? "Close" : "Settings"}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 space-y-4">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-widest flex items-center gap-1.5">
            <i className="ri-key-2-line"></i>API Credentials
          </p>
          {/* Google Ads: show OAuth info banner instead of token field */}
          {isGooglePlatform && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5 mb-2">
              <p className="text-[10px] text-orange-700 flex items-start gap-1 leading-relaxed">
                <i className="ri-information-line flex-shrink-0 mt-0.5"></i>
                Google Ads uses the same OAuth credentials configured in <strong>Settings → Google Ads → OAuth Setup</strong>.
                No separate access token is needed here — just enter your Customer ID below.
              </p>
            </div>
          )}
          {platform.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">{field.label}</label>
              {field.key === "access_token" ? (
                <div className="relative">
                  {editingToken ? (
                    <input
                      type={showToken ? "text" : "password"}
                      value={tokenInput}
                      onChange={(e) => setTokenInput(e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2.5 pr-20 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#1a5c4f] bg-white"
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2.5 border border-gray-200 rounded-lg text-xs font-mono bg-white text-gray-400">
                        ••••••••••••••••••••••••
                      </div>
                      <button
                        type="button"
                        onClick={() => { setEditingToken(true); setTokenInput(""); }}
                        className="whitespace-nowrap flex items-center gap-1 px-3 py-2 text-xs font-bold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 cursor-pointer"
                      >
                        <i className="ri-edit-line"></i>Change
                      </button>
                    </div>
                  )}
                  {editingToken && (
                    <button
                      type="button"
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                    >
                      <i className={showToken ? "ri-eye-off-line" : "ri-eye-line"}></i>
                    </button>
                  )}
                </div>
              ) : (
                <input
                  type={field.type}
                  value={accountIdInput}
                  onChange={(e) => setAccountIdInput(e.target.value)}
                  placeholder={field.placeholder}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#1a5c4f] bg-white"
                />
              )}
              <p className="text-[10px] text-gray-400 mt-1 flex items-start gap-1">
                <i className="ri-information-line flex-shrink-0 mt-0.5"></i>
                {field.hint}
              </p>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !accountIdInput.trim() || (!isGooglePlatform && !editingToken && !settings?.access_token)}
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</> : <><i className="ri-save-line"></i>Save & Connect</>}
            </button>
            {isConfigured && (
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-amber-700 flex items-start gap-1 leading-relaxed">
              <i className="ri-shield-keyhole-line flex-shrink-0 mt-0.5"></i>
              Your credentials are stored securely in your Supabase database and never exposed to the browser. They are only used server-side to fetch your ad spend data.
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {spendData?.error && (
        <div className="px-5 py-4 bg-red-50 border-b border-red-100">
          <div className="flex items-start gap-2">
            <i className="ri-error-warning-fill text-red-500 flex-shrink-0 mt-0.5"></i>
            <div>
              <p className="text-xs font-bold text-red-700">API Error</p>
              <p className="text-xs text-red-600 mt-0.5">{spendData.error}</p>
              <p className="text-[10px] text-red-500 mt-1">Check your credentials in Settings and try again.</p>
            </div>
          </div>
        </div>
      )}

      {/* ROI metrics */}
      {isConfigured && !showSettings && (
        <div className="p-5 space-y-5">
          {/* Loading skeleton */}
          {loading && !spendData && (
            <div className="flex items-center justify-center py-8">
              <div className="flex items-center gap-3 text-gray-400">
                <i className="ri-loader-4-line animate-spin text-xl"></i>
                <span className="text-sm">Fetching ad spend data...</span>
              </div>
            </div>
          )}

          {/* No data yet */}
          {!loading && !spendData && !spendData?.error && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mb-3">
                <i className={`${platform.icon} text-gray-300 text-xl`}></i>
              </div>
              <p className="text-sm font-bold text-gray-600 mb-1">No data yet</p>
              <p className="text-xs text-gray-400 mb-3">Click "Sync Now" to fetch your ad spend data</p>
              <button
                type="button"
                onClick={() => onFetchSpend(platform.key)}
                disabled={loading}
                className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${platform.bgColor} ${platform.borderColor} ${platform.color}`}
              >
                <i className="ri-refresh-line"></i>Fetch Spend Data
              </button>
            </div>
          )}

          {/* Data available */}
          {spendData && !spendData.error && (
            <>
              {/* Date range badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">
                  <i className="ri-calendar-line"></i>
                  {spendData.dateRange.from} → {spendData.dateRange.to}
                </span>
                {spendData.campaigns.length > 0 && (
                  <span className="text-xs text-gray-400">{spendData.campaigns.length} campaigns</span>
                )}
                {currency !== "USD" && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold rounded-lg">
                    <i className="ri-information-line"></i>
                    Amounts in {currency} — not USD
                  </span>
                )}
              </div>

              {/* KPI grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <RoiMetric
                  label={`Ad Spend${currency !== "USD" ? ` (${currency})` : ""}`}
                  value={fmtCurrency(spend, currency)}
                  icon="ri-money-dollar-circle-line"
                  color="text-red-600"
                  sub={`Total spent on ads${currency !== "USD" ? ` · ${currency}` : ""}`}
                />
                <RoiMetric
                  label="Revenue (from orders)"
                  value={fmtCurrency(revenue)}
                  icon="ri-line-chart-line"
                  color="text-emerald-600"
                  sub={`From ${platform.revenueKey} channel`}
                />
                <RoiMetric
                  label={`Gross Profit${currency !== "USD" ? " *" : ""}`}
                  value={currency !== "USD" ? "N/A" : fmtCurrency(profit)}
                  icon="ri-funds-line"
                  color={currency !== "USD" ? "text-gray-400" : profit >= 0 ? "text-emerald-700" : "text-red-600"}
                  sub={currency !== "USD" ? `Can't compare ${currency} spend vs USD revenue` : profit >= 0 ? "Revenue minus ad spend" : "Currently at a loss"}
                />
                <RoiMetric
                  label="ROAS"
                  value={currency !== "USD" ? "N/A" : spend > 0 ? `${roas.toFixed(2)}x` : "—"}
                  icon="ri-percent-line"
                  color={currency !== "USD" ? "text-gray-400" : roas >= 3 ? "text-emerald-600" : roas >= 1 ? "text-amber-600" : "text-red-600"}
                  sub={currency !== "USD" ? `Requires same currency` : roas >= 3 ? "Excellent" : roas >= 2 ? "Good" : roas >= 1 ? "Break-even zone" : "Below break-even"}
                />
                <RoiMetric
                  label="ROI"
                  value={currency !== "USD" ? "N/A" : spend > 0 ? `${roi.toFixed(0)}%` : "—"}
                  icon="ri-arrow-up-circle-line"
                  color={currency !== "USD" ? "text-gray-400" : roi >= 100 ? "text-emerald-600" : roi >= 0 ? "text-amber-600" : "text-red-600"}
                  sub={currency !== "USD" ? "Requires same currency" : "Return on ad investment"}
                />
                <RoiMetric
                  label={`Cost Per Acquisition${currency !== "USD" ? ` (${currency})` : ""}`}
                  value={cpa > 0 ? fmtCurrency(cpa, currency) : "—"}
                  icon="ri-user-received-line"
                  color={cpa > 0 && currency === "USD" && revenue > 0 && cpa < (revenue / Math.max(paidOrders, 1)) ? "text-emerald-600" : cpa > 0 ? "text-amber-600" : "text-gray-400"}
                  sub={paidOrders > 0 ? `${paidOrders} paid order${paidOrders !== 1 ? "s" : ""} · spend ÷ conversions` : "No paid orders yet"}
                />
                <RoiMetric
                  label={`Cost Per Click${currency !== "USD" ? ` (${currency})` : ""}`}
                  value={cpc > 0 ? fmtCurrency(cpc, currency) : "—"}
                  icon="ri-cursor-line"
                  color="text-gray-700"
                  sub={`CTR: ${ctr.toFixed(2)}%`}
                />
                <RoiMetric
                  label="Paid Orders"
                  value={paidOrders > 0 ? String(paidOrders) : "—"}
                  icon="ri-shopping-bag-line"
                  color="text-[#1a5c4f]"
                  sub={`Avg. order: ${paidOrders > 0 && revenue > 0 ? fmtCurrency(revenue / paidOrders) : "—"}`}
                />
              </div>

              {/* Impressions + Clicks summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg flex-shrink-0">
                    <i className="ri-eye-line text-gray-500 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Impressions</p>
                    <p className="text-sm font-extrabold text-gray-900">{fmtNum(spendData.impressions)}</p>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 flex items-center justify-center bg-white rounded-lg flex-shrink-0">
                    <i className="ri-cursor-line text-gray-500 text-sm"></i>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Clicks</p>
                    <p className="text-sm font-extrabold text-gray-900">{fmtNum(spendData.clicks)}</p>
                  </div>
                </div>
              </div>

              {/* ROAS visual indicator — only show for same-currency */}
              {currency === "USD" && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-gray-600">ROAS Performance</span>
                  <span className={`text-xs font-extrabold ${roas >= 3 ? "text-emerald-600" : roas >= 1 ? "text-amber-600" : "text-red-600"}`}>
                    {spend > 0 ? `${roas.toFixed(2)}x` : "No spend data"}
                  </span>
                </div>
                <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
                  {/* Zones */}
                  <div className="absolute inset-0 flex">
                    <div className="w-1/4 bg-red-200 rounded-l-full"></div>
                    <div className="w-1/4 bg-amber-200"></div>
                    <div className="w-1/2 bg-emerald-200 rounded-r-full"></div>
                  </div>
                  {/* Indicator */}
                  {spend > 0 && (
                    <div
                      className="absolute top-0 h-full w-1 bg-gray-900 rounded-full transition-all duration-500"
                      style={{ left: `${Math.min(Math.max((roas / 6) * 100, 2), 98)}%` }}
                    ></div>
                  )}
                </div>
                <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                  <span>0x (Loss)</span>
                  <span>1x (Break-even)</span>
                  <span>3x+ (Profitable)</span>
                </div>
              </div>
              )}

              {/* Currency mismatch notice for non-USD */}
              {currency !== "USD" && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <i className="ri-exchange-dollar-line text-amber-600 flex-shrink-0 mt-0.5"></i>
                    <div>
                      <p className="text-xs font-bold text-amber-800">Currency Mismatch — {currency} vs USD</p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        Your Google Ads account reports spend in <strong>{currency}</strong>, but your order revenue is tracked in USD.
                        ROAS, ROI, and Profit calculations are disabled to avoid misleading comparisons.
                        To enable them, change your Google Ads account currency to USD in Google Ads settings, or convert the spend manually.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Campaign breakdown */}
              {spendData.campaigns.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <p className="text-xs font-bold text-gray-700">Campaign Breakdown</p>
                    <span className="text-[10px] text-gray-400">{spendData.campaigns.length} campaigns{currency !== "USD" ? ` · ${currency}` : ""}</span>
                  </div>
                  <div className="divide-y divide-gray-50">
                    {spendData.campaigns
                      .sort((a, b) => b.spend - a.spend)
                      .slice(0, 8)
                      .map((campaign) => (
                        <CampaignRow key={campaign.id} campaign={campaign} totalSpend={spend} currency={currency} />
                      ))}
                    {spendData.campaigns.length > 8 && (
                      <div className="px-4 py-2.5 text-center">
                        <span className="text-xs text-gray-400">+{spendData.campaigns.length - 8} more campaigns</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Not configured placeholder */}
      {!isConfigured && !showSettings && (
        <div className="flex flex-col items-center justify-center py-10 text-center px-6">
          <div className={`w-14 h-14 flex items-center justify-center ${platform.bgColor} rounded-2xl mb-3`}>
            <i className={`${platform.icon} ${platform.color} text-2xl`}></i>
          </div>
          <p className="text-sm font-bold text-gray-700 mb-1">Connect {platform.label}</p>
          <p className="text-xs text-gray-400 mb-4 max-w-xs">
            Enter your API credentials to start tracking ad spend, ROAS, and ROI alongside your order revenue.
          </p>
          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${platform.bgColor} ${platform.borderColor} ${platform.color}`}
          >
            <i className="ri-settings-3-line"></i>Configure API
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdSpendPanel({ revenueByChannel, paidOrdersByChannel, dateFrom, dateTo, datePreset }: AdSpendPanelProps) {
  const [platformSettings, setPlatformSettings] = useState<Record<string, PlatformSettings>>({});
  const [spendData, setSpendData] = useState<Record<string, AdSpendData>>({});
  const [loadingPlatform, setLoadingPlatform] = useState<Record<string, boolean>>({});
  const [savingPlatform, setSavingPlatform] = useState<Record<string, boolean>>({});
  const [saveMsg, setSaveMsg] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("facebook");

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  // Load settings from DB on mount
  useEffect(() => {
    async function loadSettings() {
      const { data } = await supabase
        .from("ad_platform_settings")
        .select("platform, access_token, account_id, last_fetched_at, last_spend_data");
      if (data) {
        const map: Record<string, PlatformSettings> = {};
        for (const row of data) {
          map[row.platform] = row as PlatformSettings;
          // Restore cached spend data
          if (row.last_spend_data) {
            setSpendData((prev) => ({ ...prev, [row.platform]: row.last_spend_data as AdSpendData }));
          }
        }
        setPlatformSettings(map);
      }
    }
    loadSettings();
  }, []);

  const handleSaveSettings = useCallback(async (platform: string, token: string, accountId: string) => {
    setSavingPlatform((prev) => ({ ...prev, [platform]: true }));
    try {
      const { error } = await supabase
        .from("ad_platform_settings")
        .upsert({
          platform,
          access_token: token,
          account_id: accountId,
          updated_at: new Date().toISOString(),
        }, { onConflict: "platform" });

      if (!error) {
        setPlatformSettings((prev) => ({
          ...prev,
          [platform]: { ...prev[platform], platform, access_token: token, account_id: accountId, last_fetched_at: prev[platform]?.last_fetched_at ?? null, last_spend_data: prev[platform]?.last_spend_data ?? null },
        }));
        setSaveMsg((prev) => ({ ...prev, [platform]: "Saved!" }));
        setTimeout(() => setSaveMsg((prev) => ({ ...prev, [platform]: "" })), 3000);
      } else {
        setSaveMsg((prev) => ({ ...prev, [platform]: `Save failed: ${error.message}` }));
      }
    } catch {
      setSaveMsg((prev) => ({ ...prev, [platform]: "Network error" }));
    }
    setSavingPlatform((prev) => ({ ...prev, [platform]: false }));
  }, []);

  const handleFetchSpend = useCallback(async (platform: string) => {
    setLoadingPlatform((prev) => ({ ...prev, [platform]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-ad-spend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ platform, dateFrom, dateTo }),
      });
      const result = await res.json() as { ok: boolean; data?: AdSpendData; error?: string };
      if (result.ok && result.data) {
        setSpendData((prev) => ({ ...prev, [platform]: result.data! }));
        setPlatformSettings((prev) => ({
          ...prev,
          [platform]: { ...prev[platform], last_fetched_at: new Date().toISOString() },
        }));
      } else {
        setSpendData((prev) => ({
          ...prev,
          [platform]: {
            platform,
            spend: 0, impressions: 0, clicks: 0,
            campaigns: [],
            currency: "USD",
            dateRange: { from: dateFrom, to: dateTo },
            error: result.error ?? "Failed to fetch data",
          },
        }));
      }
    } catch (err) {
      setSpendData((prev) => ({
        ...prev,
        [platform]: {
          platform,
          spend: 0, impressions: 0, clicks: 0,
          campaigns: [],
          currency: "USD",
          dateRange: { from: dateFrom, to: dateTo },
          error: `Network error: ${String(err)}`,
        },
      }));
    }
    setLoadingPlatform((prev) => ({ ...prev, [platform]: false }));
  }, [supabaseUrl, dateFrom, dateTo]);

  // Total spend across all platforms — only include USD platforms in combined totals
  const hasMixedCurrencies = PLATFORMS.some(
    (p) => spendData[p.key] && !spendData[p.key].error && spendData[p.key].currency !== "USD"
  );
  // USD-only spend for accurate combined metrics
  const totalSpendUSD = PLATFORMS.reduce((s, p) => {
    const d = spendData[p.key];
    if (!d || d.error || d.currency !== "USD") return s;
    return s + d.spend;
  }, 0);
  // Raw total spend (all currencies, for display only when mixed)
  const totalSpendRaw = PLATFORMS.reduce((s, p) => s + (spendData[p.key]?.spend ?? 0), 0);
  const totalSpend = hasMixedCurrencies ? totalSpendUSD : totalSpendRaw;
  const totalRevenue = PLATFORMS.reduce((s, p) => s + (revenueByChannel[p.revenueKey] ?? 0), 0);
  const totalProfit = totalRevenue - totalSpend;
  const overallRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const totalPaidOrders = PLATFORMS.reduce((s, p) => s + (paidOrdersByChannel[p.revenueKey] ?? 0), 0);
  const overallCpa = totalPaidOrders > 0 && totalSpend > 0 ? totalSpend / totalPaidOrders : 0;

  const activePlatform = PLATFORMS.find((p) => p.key === activeTab)!;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-extrabold text-gray-900 flex items-center gap-2">
            <i className="ri-advertisement-line text-[#1a5c4f]"></i>
            Ad Spend & ROI Tracker
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">
            Connect your ad platforms to see spend, ROAS, and profit alongside your order revenue
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-lg">
          <i className="ri-calendar-line"></i>
          {datePreset === "7d" ? "Last 7 days" : datePreset === "30d" ? "Last 30 days" : datePreset === "90d" ? "Last 90 days" : datePreset === "ytd" ? "Year to date" : "Custom range"}
        </span>
      </div>

      {/* Overall summary strip — only if any platform has data */}
      {totalSpendRaw > 0 && (
        <>
        {hasMixedCurrencies && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <i className="ri-information-line text-amber-600 flex-shrink-0"></i>
            <p className="text-[10px] text-amber-700 font-semibold">
              Mixed currencies detected — Google Ads spend is in PKR and excluded from combined USD totals below.
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: hasMixedCurrencies ? "Total Ad Spend (USD only)" : "Total Ad Spend", value: fmtCurrency(totalSpend), icon: "ri-money-dollar-circle-line", color: "text-red-600", bg: "bg-red-50 border-red-100" },
            { label: "Total Revenue", value: fmtCurrency(totalRevenue), icon: "ri-line-chart-line", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
            { label: "Total Profit", value: fmtCurrency(totalProfit), icon: "ri-funds-line", color: totalProfit >= 0 ? "text-emerald-700" : "text-red-600", bg: totalProfit >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100" },
            { label: "Overall ROAS", value: `${overallRoas.toFixed(2)}x`, icon: "ri-percent-line", color: overallRoas >= 3 ? "text-emerald-600" : overallRoas >= 1 ? "text-amber-600" : "text-red-600", bg: "bg-gray-50 border-gray-100" },
            { label: "Avg. CPA", value: overallCpa > 0 ? fmtCurrency(overallCpa) : "—", icon: "ri-user-received-line", color: overallCpa > 0 ? "text-amber-600" : "text-gray-400", bg: "bg-amber-50 border-amber-100" },
          ].map((stat) => (
            <div key={stat.label} className={`rounded-xl border p-4 ${stat.bg}`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 flex items-center justify-center bg-white/70 rounded-lg flex-shrink-0">
                  <i className={`${stat.icon} ${stat.color} text-xs`}></i>
                </div>
                <span className="text-[10px] text-gray-500 font-medium">{stat.label}</span>
              </div>
              <p className={`text-xl font-extrabold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
        </>
      )}

      {/* Platform tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        {PLATFORMS.map((p) => {
          const isConnected = !!(platformSettings[p.key]?.access_token);
          const hasData = !!(spendData[p.key] && !spendData[p.key].error);
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setActiveTab(p.key)}
              className={`whitespace-nowrap flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeTab === p.key ? "bg-white text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              <i className={`${p.icon} ${activeTab === p.key ? p.color : ""} text-sm`}></i>
              <span className="hidden sm:inline">{p.label}</span>
              {isConnected && (
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${hasData ? "bg-emerald-500" : "bg-amber-400"}`}></span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active platform card */}
      <PlatformCard
        key={activeTab}
        platform={activePlatform}
        settings={platformSettings[activeTab] ?? null}
        spendData={spendData[activeTab] ?? null}
        revenue={revenueByChannel[activePlatform.revenueKey] ?? 0}
        paidOrders={paidOrdersByChannel[activePlatform.revenueKey] ?? 0}
        loading={loadingPlatform[activeTab] ?? false}
        onSaveSettings={handleSaveSettings}
        onFetchSpend={handleFetchSpend}
        saving={savingPlatform[activeTab] ?? false}
      />

      {saveMsg[activeTab] && (
        <p className={`text-xs flex items-center gap-1 font-semibold ${saveMsg[activeTab].includes("Saved") ? "text-emerald-600" : "text-red-600"}`}>
          <i className={saveMsg[activeTab].includes("Saved") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
          {saveMsg[activeTab]}
        </p>
      )}
    </div>
  );
}
