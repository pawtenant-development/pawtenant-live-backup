// MetaCAPIPanel — Meta Conversions API (CAPI) purchase event status, backfill, and retry
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

interface OrderRow {
  id: string;
  confirmation_id: string;
  email: string | null;
  phone: string | null;
  price: number | null;
  paid_at: string | null;
  fbclid: string | null;
  meta_capi_status: string | null;
  meta_capi_error: string | null;
  meta_capi_sent_at: string | null;
  meta_capi_event_id: string | null;
  status: string;
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

function fmtShort(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

const STATUS_STYLE: Record<string, { label: string; color: string; icon: string }> = {
  sent:                       { label: "Sent",         color: "bg-emerald-100 text-emerald-700", icon: "ri-checkbox-circle-fill" },
  failed:                     { label: "Failed",       color: "bg-red-100 text-red-600",         icon: "ri-error-warning-fill" },
  queued:                     { label: "Queued",       color: "bg-amber-100 text-amber-700",     icon: "ri-time-line" },
  pending:                    { label: "Pending",      color: "bg-sky-100 text-sky-600",         icon: "ri-time-line" },
  skipped_missing_user_data:  { label: "Skipped",      color: "bg-gray-100 text-gray-500",       icon: "ri-user-unfollow-line" },
};

export default function MetaCAPIPanel() {
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed" | "queued" | "pending" | "skipped">("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [globalActionLoading, setGlobalActionLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [testEventCode, setTestEventCode] = useState("TEST73774");
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string; raw?: unknown } | null>(null);
  const PAGE_SIZE = 30;

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("orders")
      .select("id, confirmation_id, email, phone, price, paid_at, fbclid, meta_capi_status, meta_capi_error, meta_capi_sent_at, meta_capi_event_id, status")
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
    sent: orders.filter((o) => o.meta_capi_status === "sent").length,
    failed: orders.filter((o) => o.meta_capi_status === "failed").length,
    queued: orders.filter((o) => o.meta_capi_status === "queued").length,
    pending: orders.filter((o) => !o.meta_capi_status).length,
    skipped: orders.filter((o) => o.meta_capi_status === "skipped_missing_user_data").length,
    withFbclid: orders.filter((o) => !!o.fbclid).length,
    withEmail: orders.filter((o) => !!o.email).length,
  };

  const sendRate = stats.total > 0
    ? Math.round((stats.sent / stats.total) * 100)
    : 0;

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = orders.filter((o) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "pending") return !o.meta_capi_status;
    if (statusFilter === "queued") return o.meta_capi_status === "queued";
    if (statusFilter === "skipped") return o.meta_capi_status === "skipped_missing_user_data";
    return o.meta_capi_status === statusFilter;
  });

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const hasMore = filtered.length > paged.length;

  // ── Single order send ─────────────────────────────────────────────────────
  const handleSend = async (confirmationId: string, useTestCode = false) => {
    setActionLoading(confirmationId);
    try {
      const body: Record<string, unknown> = { mode: "single", confirmationId };
      if (useTestCode && testEventCode.trim()) {
        body.testEventCode = testEventCode.trim();
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-capi-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; result?: { success: boolean; error?: string; eventId?: string }; error?: string };
      if (data.ok && data.result?.success) {
        showToast(`✓ ${confirmationId} sent to Meta CAPI (event_id: ${data.result.eventId ?? "—"})`, true);
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
      const body: Record<string, unknown> = { mode: "retry_failed" };
      if (testEventCode.trim()) {
        body.testEventCode = testEventCode.trim();
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-capi-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; succeeded?: number; failed?: number; skipped?: number; processed?: number; message?: string };
      if (data.ok) {
        const skippedNote = (data.skipped ?? 0) > 0 ? `, ${data.skipped} permanently skipped (no email/phone)` : "";
        showToast(`Retry: ${data.succeeded ?? 0} sent, ${data.failed ?? 0} still failing${skippedNote}`, (data.failed ?? 0) === 0);
      } else {
        showToast("Retry failed — check Supabase function logs", false);
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
      const body: Record<string, unknown> = { mode: "backfill" };
      if (testEventCode.trim()) {
        body.testEventCode = testEventCode.trim();
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-capi-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; sent?: number; queued?: number; failed?: number; skipped?: number; processed?: number; message?: string; firstError?: string; capiSendingDisabled?: boolean };
      if (data.ok) {
        if (data.processed === 0) {
          showToast(data.message ?? "All orders already processed", true);
        } else if (data.capiSendingDisabled) {
          showToast(`Queued ${data.queued ?? data.processed ?? 0} orders — CAPI sending is disabled, events stored for replay`, true);
        } else if ((data.failed ?? 0) > 0 && data.firstError) {
          const skippedNote = (data.skipped ?? 0) > 0 ? `, ${data.skipped} skipped (no PII)` : "";
          showToast(`Backfill: ${data.sent ?? 0} sent, ${data.failed} failed${skippedNote} — ${data.firstError.slice(0, 100)}`, false);
        } else {
          const skippedNote = (data.skipped ?? 0) > 0 ? `, ${data.skipped} skipped (no email/phone)` : "";
          showToast(`Backfill: ${data.sent ?? 0} sent, ${data.failed ?? 0} failed${skippedNote}`, (data.failed ?? 0) === 0);
        }
      } else {
        showToast("Backfill failed — check Supabase function logs", false);
      }
      await fetchOrders();
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setGlobalActionLoading(false);
    }
  };

  // ── Config test ───────────────────────────────────────────────────────────
  const handleTestConfig = async () => {
    setGlobalActionLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-capi-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "test" }),
      });
      const data = await res.json() as {
        ok: boolean; pixelId?: string; hasAccessToken?: boolean;
        testOrderId?: string; eventId?: string; eventTime?: number;
        hasEmail?: boolean; hasPhone?: boolean; hasFbclid?: boolean;
        error?: string;
      };
      if (data.ok) {
        showToast(
          `Config OK ✓ | Pixel: ${data.pixelId ?? "NOT SET"} | Token: ${data.hasAccessToken ? "✓" : "✗ MISSING"} | Test order: ${data.testOrderId ?? "none"} | event_id: ${data.eventId ?? "—"}`,
          !!data.hasAccessToken
        );
      } else {
        showToast(`Config check failed: ${data.error ?? "Unknown"}`, false);
      }
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    } finally {
      setGlobalActionLoading(false);
    }
  };

  // ── Send test event (uses most recent paid order + testEventCode) ─────────
  const handleSendTestEvent = async () => {
    if (!testEventCode.trim()) {
      showToast("Enter a test event code first (e.g. TEST73774)", false);
      return;
    }
    setGlobalActionLoading(true);
    setTestResult(null);
    try {
      // Use the most recent paid order
      const mostRecent = orders.find((o) => o.status !== "lead");
      if (!mostRecent) {
        showToast("No paid orders found to test with", false);
        setGlobalActionLoading(false);
        return;
      }
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-capi-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({
          mode: "single",
          confirmationId: mostRecent.confirmation_id,
          testEventCode: testEventCode.trim(),
        }),
      });
      const data = await res.json() as {
        ok: boolean;
        result?: { success: boolean; error?: string; eventId?: string; timestampSource?: string };
        error?: string;
      };
      if (data.ok && data.result?.success) {
        const msg = `Test event sent! event_id: purchase_${mostRecent.confirmation_id} | code: ${testEventCode.trim()} | order: ${mostRecent.confirmation_id}`;
        showToast(msg, true);
        setTestResult({ ok: true, msg, raw: data });
      } else {
        const errMsg = data.result?.error ?? data.error ?? "Unknown error";
        showToast(`Test event failed: ${errMsg}`, false);
        setTestResult({ ok: false, msg: errMsg, raw: data });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Network error: ${msg}`, false);
      setTestResult({ ok: false, msg });
    } finally {
      setGlobalActionLoading(false);
    }
  };

  // ── Dry run ───────────────────────────────────────────────────────────────
  const handleDryRun = async () => {
    setGlobalActionLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-meta-capi-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({ mode: "backfill", dryRun: true }),
      });
      const data = await res.json() as { ok: boolean; processed?: number };
      if (data.ok) {
        showToast(`Dry run: ${data.processed ?? 0} orders would be sent to Meta CAPI`, true);
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
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold transition-all max-w-lg ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          <i className={toast.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-fill"}></i>
          <span className="break-all">{toast.msg}</span>
        </div>
      )}

      {/* ── CAPI Live Banner ─────────────────────────────────────────── */}
      <div className="bg-emerald-50 border border-emerald-300 rounded-xl px-5 py-4 flex items-start gap-3">
        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5">
          <i className="ri-checkbox-circle-fill text-emerald-600 text-lg"></i>
        </div>
        <div className="flex-1">
          <p className="text-sm font-extrabold text-emerald-800 mb-1">Meta CAPI sending is LIVE</p>
          <p className="text-xs text-emerald-700 leading-relaxed">
            All new paid orders are automatically sent to Meta as server-side Purchase events.
            Email and phone are SHA-256 hashed before sending — no raw PII leaves the server.
            Use <strong>Retry Failed + Queued</strong> below to replay any orders that were held back while sending was disabled.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 flex items-center justify-center bg-blue-50 rounded-lg">
                <i className="ri-facebook-fill text-blue-600 text-base"></i>
              </div>
              <h2 className="text-base font-extrabold text-gray-900">Meta Conversions API (CAPI)</h2>
            </div>
            <p className="text-xs text-gray-500 max-w-xl">
              Server-side Purchase events sent to Meta after payment. Deduplicates with the browser pixel using a shared
              <code className="mx-1 font-mono bg-gray-100 px-1 rounded text-[10px]">event_id = purchase_&#123;confirmationId&#125;</code>.
              Email and phone are SHA-256 hashed before sending — no raw PII leaves the server.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleTestConfig}
              disabled={globalActionLoading}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
            >
              <i className="ri-shield-check-line"></i>Test Config
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
              disabled={globalActionLoading || (stats.failed === 0 && stats.queued === 0)}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-amber-200 text-amber-700 text-xs font-bold rounded-lg hover:bg-amber-50 cursor-pointer transition-colors disabled:opacity-50"
            >
              {globalActionLoading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-refresh-line"></i>}
              Retry Failed + Queued ({stats.failed + stats.queued})
            </button>
            <button
              type="button"
              onClick={handleBackfill}
              disabled={globalActionLoading || stats.pending === 0}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 cursor-pointer transition-colors disabled:opacity-50"
            >
              {globalActionLoading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-send-plane-fill"></i>}
              Backfill Pending ({stats.pending})
            </button>
          </div>
        </div>
      </div>

      {/* ── Test Event Panel ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-amber-200 p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
            <i className="ri-flask-line text-amber-600 text-base"></i>
          </div>
          <div>
            <p className="text-sm font-extrabold text-gray-900">Send Test Event to Meta</p>
            <p className="text-[10px] text-gray-500">Fires a real CAPI call with your test code — visible in Meta Events Manager → Test Events tab</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex-1 min-w-[180px] max-w-xs">
            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1.5">Test Event Code</label>
            <input
              type="text"
              value={testEventCode}
              onChange={(e) => setTestEventCode(e.target.value)}
              placeholder="e.g. TEST73774"
              className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 bg-amber-50/30"
            />
          </div>
          <div className="flex flex-col justify-end pt-5">
            <button
              type="button"
              onClick={handleSendTestEvent}
              disabled={globalActionLoading || !testEventCode.trim() || orders.length === 0}
              className="whitespace-nowrap flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-extrabold rounded-lg cursor-pointer transition-colors disabled:opacity-50"
            >
              {globalActionLoading
                ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</>
                : <><i className="ri-send-plane-fill"></i>Send Test Event</>
              }
            </button>
          </div>
          <div className="flex flex-col justify-end pt-5">
            <p className="text-[10px] text-gray-400 max-w-xs leading-relaxed">
              Uses most recent paid order. Check <strong>Meta Events Manager → Test Events</strong> to confirm receipt.
            </p>
          </div>
        </div>

        {/* Test result */}
        {testResult && (
          <div className={`rounded-lg px-4 py-3 flex items-start gap-3 ${testResult.ok ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
            <i className={`text-sm mt-0.5 flex-shrink-0 ${testResult.ok ? "ri-checkbox-circle-fill text-emerald-600" : "ri-error-warning-fill text-red-500"}`}></i>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold mb-1 ${testResult.ok ? "text-emerald-800" : "text-red-700"}`}>
                {testResult.ok ? "Test event sent successfully" : "Test event failed"}
              </p>
              <p className={`text-xs break-all ${testResult.ok ? "text-emerald-700" : "text-red-600"}`}>{testResult.msg}</p>
              {testResult.ok && (
                <p className="text-[10px] text-emerald-600 mt-1.5 font-semibold">
                  Now check Meta Events Manager → Test Events tab — you should see a Purchase event with code <code className="font-mono bg-emerald-100 px-1 rounded">{testEventCode}</code>
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {[
          { label: "Total Paid Orders", value: stats.total,       icon: "ri-file-list-3-line",    color: "text-gray-700",    bg: "bg-gray-50" },
          { label: "Sent to Meta",      value: stats.sent,        icon: "ri-checkbox-circle-fill", color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Failed",            value: stats.failed,      icon: "ri-error-warning-fill",   color: "text-red-600",     bg: "bg-red-50" },
          { label: "Queued",            value: stats.queued,      icon: "ri-time-line",            color: "text-amber-600",   bg: "bg-amber-50" },
          { label: "Skipped (no PII)",  value: stats.skipped,     icon: "ri-user-unfollow-line",   color: "text-gray-500",    bg: "bg-gray-50" },
          { label: "With fbclid",       value: stats.withFbclid,  icon: "ri-facebook-fill",        color: "text-[#1877f2]",   bg: "bg-blue-50" },
          { label: "Send Rate",         value: `${sendRate}%`,    icon: "ri-percent-line",         color: "text-[#1a5c4f]",   bg: "bg-[#f0faf7]" },
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

      {/* Credentials notice */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-4 flex items-start gap-3">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <i className="ri-key-2-line text-gray-500"></i>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-700 mb-1">Required secrets in Supabase Edge Functions → Secrets</p>
          <p className="text-xs text-gray-600 leading-relaxed">
            <code className="font-mono bg-gray-100 px-1 rounded">META_PIXEL_ID</code> — your Pixel ID (e.g. <code className="font-mono">2970753196590228</code>)
            <br />
            <code className="font-mono bg-gray-100 px-1 rounded">META_CAPI_ACCESS_TOKEN</code> — from Meta Events Manager → your Pixel → Settings → Conversions API → Generate Access Token
            <br />
            <span className="block mt-1 text-gray-500">If either is missing, sends will fail gracefully and be retryable from this panel.</span>
          </p>
        </div>
      </div>

      {/* Deduplication info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-start gap-3">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <i className="ri-information-line text-blue-600"></i>
        </div>
        <div>
          <p className="text-xs font-bold text-blue-800 mb-1">How deduplication works</p>
          <p className="text-xs text-blue-700 leading-relaxed">
            Both the browser pixel and this server-side CAPI event use the same
            <code className="mx-1 font-mono bg-blue-100 px-1 rounded">event_id = purchase_&#123;confirmationId&#125;</code>.
            Meta matches them and counts the conversion <strong>once</strong> — not twice.
            This means you get the reliability of server-side tracking (no ad blockers, no browser restrictions)
            while the browser pixel handles attribution signals like fbclid and fbp cookies.
          </p>
        </div>
      </div>

      {/* What gets sent */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <i className="ri-checkbox-circle-line"></i>What IS sent to Meta CAPI
          </p>
          <ul className="space-y-1.5">
            {[
              "event_name: Purchase",
              "event_id: purchase_{confirmationId} (dedup key)",
              "event_time: paid_at (Unix timestamp)",
              "action_source: website",
              "value + currency (USD)",
              "order_id: confirmationId",
              "em: SHA-256 hashed email",
              "ph: SHA-256 hashed phone (E.164 digits)",
              "fbc: derived from fbclid (if present)",
            ].map((item) => (
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
            {[
              "Raw (unhashed) email or phone",
              "Assessment answers or diagnosis",
              "Mental health conditions",
              "Provider / doctor details",
              "Pet data (name, breed, age)",
              "Date of birth",
              "Any sensitive health info",
              "Payment card details",
            ].map((item) => (
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
          { key: "all",     label: "All" },
          { key: "sent",    label: `Sent (${stats.sent})` },
          { key: "queued",  label: `Queued (${stats.queued})` },
          { key: "failed",  label: `Failed (${stats.failed})` },
          { key: "pending", label: `Pending (${stats.pending})` },
          { key: "skipped", label: `Skipped (${stats.skipped})` },
        ] as const).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => { setStatusFilter(f.key as typeof statusFilter); setPage(1); }}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
              statusFilter === f.key
                ? f.key === "skipped" ? "bg-gray-500 text-white" : "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
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
          <i className="ri-loader-4-line animate-spin text-3xl text-blue-600"></i>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <i className="ri-facebook-fill text-gray-200 text-4xl block mb-3"></i>
          <p className="text-sm font-bold text-gray-600">No orders match this filter</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1fr_110px_140px_120px_80px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
            <span>Order</span>
            <span>Status</span>
            <span>Event ID</span>
            <span>Sent At</span>
            <span className="text-right">Action</span>
          </div>

          <div className="divide-y divide-gray-50">
            {paged.map((order) => {
              const statusStyle = STATUS_STYLE[order.meta_capi_status ?? "pending"] ?? STATUS_STYLE.pending;
              const isExpanded = expandedId === order.id;
              const canSend = (order.meta_capi_status === "failed" || !order.meta_capi_status) && order.meta_capi_status !== "skipped_missing_user_data";
              const isLoading = actionLoading === order.confirmation_id;

              return (
                <div key={order.id}>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_110px_140px_120px_80px] gap-2 md:gap-3 px-5 py-3.5 items-center hover:bg-gray-50/50 transition-colors">
                    {/* Order info */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 flex items-center justify-center bg-blue-50 rounded-lg flex-shrink-0">
                        <i className="ri-facebook-fill text-blue-500 text-sm"></i>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 font-mono">{order.confirmation_id}</p>
                        <p className="text-[10px] text-gray-400 truncate">{order.email ?? "—"}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-gray-500 font-semibold">${order.price ?? "—"}</span>
                          <span className="text-[10px] text-gray-300">·</span>
                          <span className="text-[10px] text-gray-400">{fmtShort(order.paid_at)}</span>
                          {order.fbclid && (
                            <span className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.5 rounded">fbclid</span>
                          )}
                          {order.phone && (
                            <span className="text-[10px] bg-gray-50 text-gray-500 font-bold px-1.5 py-0.5 rounded">phone</span>
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

                    {/* Event ID */}
                    <div className="hidden md:block">
                      {order.meta_capi_event_id ? (
                        <span className="text-[10px] font-mono text-gray-500 truncate block">{order.meta_capi_event_id}</span>
                      ) : (
                        <span className="text-[10px] text-gray-300">—</span>
                      )}
                    </div>

                    {/* Sent at */}
                    <div className="hidden md:block text-[10px] text-gray-400">{fmtShort(order.meta_capi_sent_at)}</div>

                    {/* Action */}
                    <div className="flex items-center justify-end gap-1">
                      {order.meta_capi_error && (
                        <button
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                          className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer text-gray-400 transition-colors"
                          title={order.meta_capi_status === "skipped_missing_user_data" ? "View skip reason" : "View error"}
                        >
                          {isExpanded ? <i className="ri-arrow-up-s-line text-sm"></i> : <i className="ri-arrow-down-s-line text-sm"></i>}
                        </button>
                      )}
                      {canSend && order.meta_capi_status !== "skipped_missing_user_data" && (
                        <button
                          type="button"
                          onClick={() => handleSend(order.confirmation_id, !!testEventCode.trim())}
                          disabled={isLoading}
                          className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg bg-blue-50 hover:bg-blue-100 cursor-pointer text-blue-500 transition-colors disabled:opacity-50"
                          title={testEventCode.trim() ? `Send test event with code ${testEventCode}` : "Send to Meta CAPI"}
                        >
                          {isLoading
                            ? <i className="ri-loader-4-line animate-spin text-sm"></i>
                            : <i className="ri-send-plane-fill text-sm"></i>
                          }
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Error / skip detail */}
                  {isExpanded && order.meta_capi_error && (
                    order.meta_capi_status === "skipped_missing_user_data" ? (
                      <div className="border-t border-gray-50 bg-gray-50 px-5 py-3">
                        <div className="flex items-start gap-2">
                          <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <i className="ri-user-unfollow-line text-gray-400 text-sm"></i>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Permanently Skipped — No User Data</p>
                            <p className="text-xs text-gray-600">{order.meta_capi_error}</p>
                            <p className="text-[10px] text-gray-400 mt-1.5 leading-relaxed">
                              Meta requires at least one hashed identifier (email or phone) to accept a CAPI event.
                              This order has neither — it was likely imported from a legacy system without contact data.
                              It will not be retried automatically.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="border-t border-gray-50 bg-red-50/40 px-5 py-3">
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">CAPI Error</p>
                        <p className="text-xs text-red-700 font-mono break-all">{order.meta_capi_error}</p>
                        {order.meta_capi_sent_at && (
                          <p className="text-[10px] text-gray-400 mt-1">Last attempt: {fmt(order.meta_capi_sent_at)}</p>
                        )}
                      </div>
                    )
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

      {/* Example payload */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <i className="ri-code-s-slash-line text-gray-400"></i>Example Payload Sent to Meta CAPI (redacted)
        </p>
        <pre className="text-[11px] text-gray-600 bg-gray-50 rounded-lg p-4 overflow-x-auto leading-relaxed font-mono">
{`POST https://graph.facebook.com/v19.0/{pixel_id}/events

{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1718459520,
    "event_id": "purchase_PT-ABC123XYZ",   // matches browser pixel eventID
    "action_source": "website",
    "user_data": {
      "em": ["a665a45920422f9d417e4867efdc4fb8..."],  // SHA-256 email
      "ph": ["b14a7b8059d9c055954c92674ce60032..."],  // SHA-256 phone
      "fbc": "fb.1.1718459520000.AbCdEfGhIjKl..."    // from fbclid
    },
    "custom_data": {
      "value": 100,
      "currency": "USD",
      "content_name": "ESA Letter",
      "content_type": "product",
      "order_id": "PT-ABC123XYZ"
    }
  }],
  "access_token": "[REDACTED]",
  "test_event_code": "TEST18051"  // only included when testing
}`}
        </pre>
      </div>
    </div>
  );
}