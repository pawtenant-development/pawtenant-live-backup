// GoogleAdsSyncPanel — Google Ads conversion upload status, retry, and manual trigger
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";
import GoogleOAuthPanel from "./GoogleOAuthPanel";

interface OrderRow {
  id: string;
  confirmation_id: string;
  email: string | null;
  price: number | null;
  paid_at: string | null;
  gclid: string | null;
  google_ads_upload_status: string | null;
  google_ads_upload_method: string | null;
  google_ads_upload_error: string | null;
  google_ads_uploaded_at: string | null;
  google_ads_last_attempt_at: string | null;
  email_sha256: string | null;
  status: string;
  letter_type: string | null;
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function fmtShort(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const METHOD_LABELS: Record<string, { label: string; color: string; quality: string; qualityColor: string }> = {
  gclid_plus_hashed_email: { label: "gclid + email", color: "bg-emerald-100 text-emerald-700", quality: "Strong", qualityColor: "text-emerald-600" },
  gclid_only:              { label: "gclid only",    color: "bg-teal-100 text-teal-700",     quality: "Strong", qualityColor: "text-emerald-600" },
  hashed_email_only:       { label: "email hash",    color: "bg-amber-100 text-amber-700",   quality: "Medium", qualityColor: "text-amber-600" },
  unattributable:          { label: "none",           color: "bg-gray-100 text-gray-500",     quality: "Weak",   qualityColor: "text-gray-400" },
};

const STATUS_STYLE: Record<string, { label: string; color: string; icon: string }> = {
  uploaded:                    { label: "Uploaded",          color: "bg-emerald-100 text-emerald-700", icon: "ri-checkbox-circle-fill" },
  failed:                      { label: "Failed",            color: "bg-red-100 text-red-600",         icon: "ri-error-warning-fill" },
  unattributable:              { label: "Unattributable",    color: "bg-gray-100 text-gray-500",       icon: "ri-question-line" },
  refunded_pending_adjustment: { label: "Refunded",          color: "bg-orange-100 text-orange-600",   icon: "ri-refund-2-line" },
  pending:                     { label: "Pending",           color: "bg-sky-100 text-sky-600",         icon: "ri-time-line" },
};

export default function GoogleAdsSyncPanel() {
  const [activeTab, setActiveTab] = useState<"conversions" | "oauth">("conversions");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "uploaded" | "failed" | "unattributable" | "pending">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [globalActionLoading, setGlobalActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, price, paid_at, gclid, google_ads_upload_status, google_ads_upload_method, google_ads_upload_error, google_ads_uploaded_at, google_ads_last_attempt_at, email_sha256, status, letter_type")
      .not("payment_intent_id", "is", null)
      .neq("status", "lead")
      .order("paid_at", { ascending: false })
      .limit(500);
    setOrders((data as OrderRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = {
    total: orders.length,
    uploaded: orders.filter((o) => o.google_ads_upload_status === "uploaded").length,
    failed: orders.filter((o) => o.google_ads_upload_status === "failed").length,
    unattributable: orders.filter((o) => o.google_ads_upload_status === "unattributable").length,
    pending: orders.filter((o) => !o.google_ads_upload_status).length,
    refunded: orders.filter((o) => o.google_ads_upload_status === "refunded_pending_adjustment").length,
  };

  const uploadRate = stats.total > 0
    ? Math.round((stats.uploaded / (stats.total - stats.unattributable)) * 100)
    : 0;

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = orders.filter((o) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "pending") return !o.google_ads_upload_status;
    return o.google_ads_upload_status === statusFilter;
  });

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > paged.length;

  // ── Single order retry ────────────────────────────────────────────────────
  const handleRetry = async (confirmationId: string) => {
    setActionLoading(confirmationId);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-ads-conversions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "single", confirmationId }),
      });
      const data = await res.json() as { ok: boolean; result?: { success: boolean; error?: string; skipped?: boolean }; error?: string };
      if (data.ok && data.result?.success) {
        showToast(`✓ ${confirmationId} uploaded to Google Ads`, true);
      } else if (data.result?.skipped) {
        showToast(`${confirmationId} is unattributable — no gclid or email`, false);
      } else {
        showToast(`Failed: ${data.result?.error ?? data.error ?? "Unknown error"}`, false);
      }
      await fetchOrders();
    } catch (err) {
      showToast(`Network error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Retry all failed ──────────────────────────────────────────────────────
  const handleRetryAllFailed = async () => {
    setGlobalActionLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-ads-conversions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "retry_failed" }),
      });
      const data = await res.json() as { ok: boolean; succeeded?: number; failed?: number; processed?: number; message?: string; firstError?: string };
      if (data.ok) {
        if ((data.failed ?? 0) > 0 && data.firstError) {
          showToast(`Retry: ${data.succeeded ?? 0} uploaded, ${data.failed} still failing — ${data.firstError.slice(0, 120)}`, false);
        } else {
          showToast(`Retry complete: ${data.succeeded ?? 0} uploaded, ${data.failed ?? 0} still failing`, data.failed === 0);
        }
      } else {
        showToast("Retry failed — check console", false);
      }
      await fetchOrders();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setGlobalActionLoading(false);
    }
  };

  // ── Backfill all pending ──────────────────────────────────────────────────
  const handleBackfill = async () => {
    setGlobalActionLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-ads-conversions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "backfill" }),
      });
      const data = await res.json() as { ok: boolean; uploaded?: number; skipped?: number; failed?: number; processed?: number; message?: string; firstError?: string };
      if (data.ok) {
        if (data.processed === 0) {
          showToast(data.message ?? "All orders already processed", true);
        } else if ((data.failed ?? 0) > 0 && data.firstError) {
          showToast(`Backfill: ${data.uploaded ?? 0} uploaded, ${data.failed} failed — ${data.firstError.slice(0, 120)}`, false);
        } else {
          showToast(`Backfill: ${data.uploaded ?? 0} uploaded, ${data.skipped ?? 0} unattributable, ${data.failed ?? 0} failed`, (data.failed ?? 0) === 0);
        }
      } else {
        showToast("Backfill failed — check console", false);
      }
      await fetchOrders();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setGlobalActionLoading(false);
    }
  };

  // ── Test auth ─────────────────────────────────────────────────────────────
  const handleTestAuth = async () => {
    setGlobalActionLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-ads-conversions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "test_auth" }),
      });
      const data = await res.json() as {
        ok: boolean; hasToken: boolean; tokenError?: string;
        customerId?: string; loginCustomerId?: string; hasDevToken: boolean;
        hasConversionActionId: boolean; hasLoginCustomerId: boolean;
        apiVersion: string; endpointWouldBe: string;
        diagnosis?: string[]; mccRequired?: boolean; mccNote?: string | null;
      };
      if (data.ok) {
        const mccWarn = !data.hasLoginCustomerId ? " | ⚠ GOOGLE_ADS_LOGIN_CUSTOMER_ID not set (required for MCC accounts)" : ` | MCC: ${data.loginCustomerId}`;
        showToast(`Auth OK ✓ | Customer: ${data.customerId} | API: ${data.apiVersion}${mccWarn}`, !data.mccRequired);
      } else {
        const diag = data.diagnosis?.join(" | ") ?? data.tokenError ?? "Unknown";
        showToast(`Auth FAILED: ${diag}`, false);
      }
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setGlobalActionLoading(false);
    }
  };

  // ── Test upload (validateOnly) ────────────────────────────────────────────
  const handleTestUpload = async () => {
    setGlobalActionLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-ads-conversions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "test_upload" }),
      });
      const data = await res.json() as {
        ok: boolean; success?: boolean; error?: string; testOrderId?: string;
        uploadMethod?: string; note?: string; diagnostics?: Record<string, unknown>;
      };
      if (data.ok && data.success) {
        showToast(`Test Upload PASSED ✓ | Order: ${data.testOrderId} | Method: ${data.uploadMethod} | ${data.note ?? ""}`, true);
      } else {
        showToast(`Test Upload FAILED: ${data.error ?? "Unknown error"} | Order: ${data.testOrderId ?? "none"}`, false);
      }
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setGlobalActionLoading(false);
    }
  };

  // ── Upgrade gclid — re-upload hashed_email_only orders that now have gclid ─
  const handleUpgradeGclid = async () => {
    setGlobalActionLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-ads-conversions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "retry_gclid_upgraded" }),
      });
      const data = await res.json() as {
        ok: boolean;
        checked?: number;
        upgradeable?: number;
        upgraded?: number;
        failed?: number;
        message?: string;
      };
      if (data.ok) {
        if ((data.upgradeable ?? 0) === 0) {
          showToast(data.message ?? `Checked ${data.checked ?? 0} email-only orders — none have gclid available`, true);
        } else {
          showToast(
            `gclid upgrade: ${data.upgraded ?? 0} re-uploaded with gclid, ${data.failed ?? 0} failed (checked ${data.checked ?? 0})`,
            (data.failed ?? 0) === 0
          );
        }
      } else {
        showToast("gclid upgrade failed — check console", false);
      }
      await fetchOrders();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setGlobalActionLoading(false);
    }
  };

  // ── Dry run ───────────────────────────────────────────────────────────────
  const handleDryRun = async () => {
    setGlobalActionLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-google-ads-conversions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "backfill", dryRun: true }),
      });
      const data = await res.json() as { ok: boolean; processed?: number; results?: Array<{ confirmationId: string; method: string; quality: string }> };
      if (data.ok) {
        showToast(`Dry run: ${data.processed ?? 0} orders would be processed`, true);
      }
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setGlobalActionLoading(false);
    }
  };

  return (
    <div className="space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold transition-all ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          <i className={toast.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-fill"}></i>
          {toast.msg}
        </div>
      )}

      {/* Sub-tab switcher */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {([
          { key: "conversions", label: "Conversion Sync", icon: "ri-upload-cloud-2-line" },
          { key: "oauth",       label: "OAuth Setup",     icon: "ri-key-2-line" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            className={`whitespace-nowrap flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${activeTab === t.key ? "bg-white text-[#1a5c4f]" : "text-gray-500 hover:text-gray-700"}`}
          >
            <i className={t.icon}></i>{t.label}
          </button>
        ))}
      </div>

      {/* OAuth Setup tab */}
      {activeTab === "oauth" && (
        <GoogleOAuthPanel onAuthSuccess={() => setActiveTab("conversions")} />
      )}

      {/* Conversions tab */}
      {activeTab === "conversions" && <>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 flex items-center justify-center bg-orange-50 rounded-lg">
                <i className="ri-google-fill text-orange-500 text-base"></i>
              </div>
              <h2 className="text-base font-extrabold text-gray-900">Google Ads Conversion Sync</h2>
            </div>
            <p className="text-xs text-gray-500 max-w-xl">
              Paid orders are automatically uploaded to Google Ads after payment. Hashing is server-side only.
              No sensitive data (diagnosis, provider, pet info, DOB, phone) is ever sent.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleTestAuth}
              disabled={globalActionLoading}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
            >
              <i className="ri-shield-check-line"></i>Test Auth
            </button>
            <button
              type="button"
              onClick={handleTestUpload}
              disabled={globalActionLoading}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-violet-200 text-violet-600 text-xs font-bold rounded-lg hover:bg-violet-50 cursor-pointer transition-colors disabled:opacity-50"
            >
              <i className="ri-test-tube-line"></i>Test Upload
            </button>
            <button
              type="button"
              onClick={handleDryRun}
              disabled={globalActionLoading}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
            >
              <i className="ri-flask-line"></i>Dry Run
            </button>
            <button
              type="button"
              onClick={handleRetryAllFailed}
              disabled={globalActionLoading || stats.failed === 0}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 cursor-pointer transition-colors disabled:opacity-50"
            >
              {globalActionLoading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-refresh-line"></i>}
              Retry Failed ({stats.failed})
            </button>
            <button
              type="button"
              onClick={handleUpgradeGclid}
              disabled={globalActionLoading}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-orange-300 text-orange-600 text-xs font-bold rounded-lg hover:bg-orange-50 cursor-pointer transition-colors disabled:opacity-50"
              title="Re-upload email-only orders that now have a gclid — upgrades match quality from Medium to Strong"
            >
              {globalActionLoading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-arrow-up-circle-line"></i>}
              Upgrade gclid Match
            </button>
            <button
              type="button"
              onClick={handleBackfill}
              disabled={globalActionLoading || stats.pending === 0}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors disabled:opacity-50"
            >
              {globalActionLoading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-upload-cloud-2-line"></i>}
              Backfill Pending ({stats.pending})
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total Paid Orders", value: stats.total, icon: "ri-file-list-3-line", color: "text-gray-700", bg: "bg-gray-50" },
          { label: "Uploaded", value: stats.uploaded, icon: "ri-checkbox-circle-fill", color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Failed", value: stats.failed, icon: "ri-error-warning-fill", color: "text-red-600", bg: "bg-red-50" },
          { label: "Pending", value: stats.pending, icon: "ri-time-line", color: "text-sky-600", bg: "bg-sky-50" },
          { label: "Unattributable", value: stats.unattributable, icon: "ri-question-line", color: "text-gray-400", bg: "bg-gray-50" },
          { label: "Upload Rate", value: `${uploadRate}%`, icon: "ri-percent-line", color: "text-[#1a5c4f]", bg: "bg-[#f0faf7]" },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-xl border border-gray-100 p-4`}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 flex items-center justify-center">
                <i className={`${s.icon} ${s.color} text-sm`}></i>
              </div>
              <span className="text-xs text-gray-500 font-medium leading-tight">{s.label}</span>
            </div>
            <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Identifier priority contract */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <i className="ri-shield-star-line"></i>Identifier Priority Contract (gclid-first)
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          {[
            { rank: "1", method: "gclid + email hash", quality: "Strongest", color: "bg-emerald-100 text-emerald-700", note: "gclid is primary, email is supplementary" },
            { rank: "2", method: "gclid only", quality: "Strong", color: "bg-teal-100 text-teal-700", note: "gclid present, no email available" },
            { rank: "3", method: "email hash only", quality: "Medium — fallback", color: "bg-amber-100 text-amber-700", note: "Only used when gclid is absent" },
            { rank: "4", method: "none", quality: "Skipped", color: "bg-gray-100 text-gray-500", note: "No gclid or email — unattributable" },
          ].map((item) => (
            <div key={item.rank} className="bg-white rounded-lg border border-orange-100 p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-5 h-5 flex items-center justify-center bg-orange-100 text-orange-600 text-[10px] font-black rounded-full">{item.rank}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.color}`}>{item.method}</span>
              </div>
              <p className="text-[10px] font-bold text-gray-700">{item.quality}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{item.note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* What gets sent / what doesn't */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <i className="ri-checkbox-circle-line"></i>What IS sent to Google Ads
          </p>
          <ul className="space-y-1.5">
            {["Order ID (confirmation_id)", "Conversion action name", "Conversion time (paid_at)", "Conversion value (price in USD)", "gclid (if present)", "Hashed email SHA-256 (if present)"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-gray-700">
                <i className="ri-check-line text-emerald-500 flex-shrink-0"></i>{item}
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <i className="ri-close-circle-line"></i>What is NEVER sent
          </p>
          <ul className="space-y-1.5">
            {["Assessment answers or diagnosis", "Mental health conditions", "Provider / doctor details", "Pet data (name, breed, age)", "Date of birth", "Phone number", "Raw (unhashed) email", "Any sensitive health info"].map((item) => (
              <li key={item} className="flex items-center gap-2 text-xs text-gray-700">
                <i className="ri-close-line text-red-400 flex-shrink-0"></i>{item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center gap-2 flex-wrap">
        {([
          { key: "all", label: "All" },
          { key: "uploaded", label: `Uploaded (${stats.uploaded})` },
          { key: "failed", label: `Failed (${stats.failed})` },
          { key: "pending", label: `Pending (${stats.pending})` },
          { key: "unattributable", label: `Unattributable (${stats.unattributable})` },
        ] as const).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => { setStatusFilter(f.key); setPage(1); }}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${statusFilter === f.key ? "bg-[#1a5c4f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">{filtered.length} orders</span>
        <button
          type="button"
          onClick={fetchOrders}
          className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 border border-gray-200 text-gray-500 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
        >
          <i className="ri-refresh-line"></i>Refresh
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <i className="ri-google-fill text-gray-200 text-4xl block mb-3"></i>
          <p className="text-sm font-bold text-gray-600">No orders match this filter</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1fr_120px_130px_130px_120px_100px_80px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <span>Order</span>
            <span>Status</span>
            <span>Method</span>
            <span>Match Quality</span>
            <span>Uploaded At</span>
            <span>Last Attempt</span>
            <span className="text-right">Action</span>
          </div>

          <div className="divide-y divide-gray-50">
            {paged.map((order) => {
              const statusStyle = STATUS_STYLE[order.google_ads_upload_status ?? "pending"] ?? STATUS_STYLE.pending;
              const methodInfo = METHOD_LABELS[order.google_ads_upload_method ?? ""] ?? null;
              const isExpanded = expandedId === order.id;
              const canRetry = order.google_ads_upload_status === "failed" || !order.google_ads_upload_status;
              const isLoading = actionLoading === order.confirmation_id;

              return (
                <div key={order.id}>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_130px_130px_120px_100px_80px] gap-2 md:gap-3 px-5 py-3.5 items-center hover:bg-gray-50/50 transition-colors">
                    {/* Order info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 flex items-center justify-center bg-orange-50 rounded-lg flex-shrink-0">
                        <i className="ri-google-fill text-orange-400 text-sm"></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 font-mono">{order.confirmation_id}</p>
                        <p className="text-[10px] text-gray-400 truncate">{order.email ?? "—"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500 font-semibold">${order.price ?? "—"}</span>
                          <span className="text-[10px] text-gray-300">·</span>
                          <span className="text-[10px] text-gray-400">{fmtShort(order.paid_at)}</span>
                          {order.gclid && (
                            <span className="text-[10px] bg-orange-50 text-orange-600 font-bold px-1.5 py-0.5 rounded">gclid</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Status */}
                    <div>
                      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${statusStyle.color}`}>
                        <i className={`${statusStyle.icon} text-[10px]`}></i>
                        {statusStyle.label}
                      </span>
                    </div>

                    {/* Method */}
                    <div>
                      {methodInfo ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold ${methodInfo.color}`}>
                          {methodInfo.label}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </div>

                    {/* Match quality */}
                    <div>
                      {methodInfo ? (
                        <span className={`text-xs font-bold ${methodInfo.qualityColor}`}>{methodInfo.quality}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>

                    {/* Uploaded at */}
                    <div className="hidden md:block text-[10px] text-gray-400">{fmtShort(order.google_ads_uploaded_at)}</div>

                    {/* Last attempt */}
                    <div className="hidden md:block text-[10px] text-gray-400">{fmtShort(order.google_ads_last_attempt_at)}</div>

                    {/* Action */}
                    <div className="flex items-center justify-end gap-1">
                      {order.google_ads_upload_error && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                          className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer text-gray-400 transition-colors"
                          title="View error"
                        >
                          {isExpanded ? <i className="ri-arrow-up-s-line text-sm"></i> : <i className="ri-arrow-down-s-line text-sm"></i>}
                        </button>
                      )}
                      {canRetry && (
                        <button
                          type="button"
                          onClick={() => handleRetry(order.confirmation_id)}
                          disabled={isLoading}
                          className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg bg-orange-50 hover:bg-orange-100 cursor-pointer text-orange-500 transition-colors disabled:opacity-50"
                          title="Retry upload"
                        >
                          {isLoading
                            ? <i className="ri-loader-4-line animate-spin text-sm"></i>
                            : <i className="ri-upload-cloud-2-line text-sm"></i>
                          }
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Error detail */}
                  {isExpanded && order.google_ads_upload_error && (
                    <div className="border-t border-gray-50 bg-red-50/40 px-5 py-3">
                      <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Upload Error</p>
                      <p className="text-xs text-red-700 font-mono break-all">{order.google_ads_upload_error}</p>
                      {order.google_ads_last_attempt_at && (
                        <p className="text-[10px] text-gray-400 mt-1">Last attempt: {fmt(order.google_ads_last_attempt_at)}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {hasMore && (
            <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
              <span className="text-xs text-gray-400">Showing {paged.length} of {filtered.length}</span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 cursor-pointer transition-colors"
              >
                <i className="ri-arrow-down-line"></i>Load More
              </button>
            </div>
          )}
        </div>
      )}

      </>}
    </div>
  );
}
