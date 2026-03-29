// SystemHealthTab — Automated health monitoring + Auth Cleanup tool
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

interface OrphanedUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  confirmed_at: string | null;
}

interface CheckResult {
  name: string;
  category: string;
  status: "pass" | "fail" | "warn";
  message: string;
  detail?: string;
  latencyMs?: number;
}

interface OrderHealth {
  totalOrders: number;
  totalPaid: number;
  totalCompleted: number;
  paidUnassignedOver3h: number;
  paidUnassignedOver24h: number;
}

interface HealthLog {
  id: string;
  checked_at: string;
  triggered_by: string;
  overall_status: "pass" | "warn" | "fail" | "unknown";
  checks: CheckResult[];
  order_health: OrderHealth;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  infrastructure: { label: "Infrastructure",    icon: "ri-server-line",          color: "text-[#1a5c4f]"  },
  payments:       { label: "Payments",          icon: "ri-bank-card-line",       color: "text-violet-600" },
  communications: { label: "Communications",   icon: "ri-message-3-line",       color: "text-sky-600"    },
  crm:            { label: "CRM",              icon: "ri-contacts-line",        color: "text-amber-600"  },
  functions:      { label: "Edge Functions",   icon: "ri-code-s-slash-line",    color: "text-gray-600"   },
  orders:         { label: "Order Health",     icon: "ri-file-list-3-line",     color: "text-orange-600" },
};

const STATUS_CONFIG = {
  pass:    { icon: "ri-checkbox-circle-fill",  color: "text-[#1a5c4f]",   bg: "bg-[#f0faf7]",  border: "border-[#b8ddd5]",  label: "Pass"    },
  warn:    { icon: "ri-error-warning-fill",    color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200",  label: "Warning" },
  fail:    { icon: "ri-close-circle-fill",     color: "text-red-500",     bg: "bg-red-50",     border: "border-red-200",    label: "Fail"    },
  unknown: { icon: "ri-question-line",         color: "text-gray-400",    bg: "bg-gray-50",    border: "border-gray-200",   label: "Unknown" },
};

function fmtRelative(ts: string): string {
  const diffMs   = Date.now() - new Date(ts).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1)  return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24)  return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

function fmtTime(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function OverallBadge({ status }: { status: HealthLog["overall_status"] }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.unknown;
  const extra: Record<string, string> = {
    pass: "bg-[#1a5c4f] text-white",
    warn: "bg-amber-500 text-white",
    fail: "bg-red-500 text-white",
    unknown: "bg-gray-200 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-extrabold ${extra[status] ?? extra.unknown}`}>
      <i className={cfg.icon}></i>
      {status === "pass" ? "All Systems Operational" : status === "warn" ? "Warnings Detected" : status === "fail" ? "Failures Detected" : "Unknown"}
    </span>
  );
}

export default function SystemHealthTab() {
  const [latestLog,  setLatestLog]  = useState<HealthLog | null>(null);
  const [history,    setHistory]    = useState<HealthLog[]>([]);
  const [running,    setRunning]    = useState(false);
  const [loadingLog, setLoadingLog] = useState(true);
  const [runMsg,     setRunMsg]     = useState("");
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({});

  // ── Auth Cleanup ────────────────────────────────────────────────────────
  const [authScanLoading, setAuthScanLoading] = useState(false);
  const [authScanResult, setAuthScanResult] = useState<{
    total_auth_users: number;
    total_profiles: number;
    orphans: OrphanedUser[];
    scannedAt: Date;
  } | null>(null);
  const [authScanError, setAuthScanError] = useState("");
  const [deletingAuthId, setDeletingAuthId] = useState<string | null>(null);
  const [deletingAllOrphans, setDeletingAllOrphans] = useState(false);
  const [authDeleteResults, setAuthDeleteResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("system_health_logs")
      .select("*")
      .order("checked_at", { ascending: false })
      .limit(20);
    const logs = (data as HealthLog[]) ?? [];
    setHistory(logs);
    if (logs.length > 0) setLatestLog(logs[0]);
    setLoadingLog(false);
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const runCheck = async () => {
    setRunning(true);
    setRunMsg("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/health-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ triggeredBy: "manual" }),
      });
      const result = await res.json() as { ok: boolean; overallStatus?: string };
      if (result.ok) {
        setRunMsg("Check complete!");
        await loadHistory();
      } else {
        setRunMsg("Check failed — see console");
      }
    } catch { setRunMsg("Network error"); }
    setRunning(false);
    setTimeout(() => setRunMsg(""), 4000);
  };

  const toggleCategory = (cat: string) => {
    setExpanded(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  // ── Auth cleanup handlers ───────────────────────────────────────────────
  const runAuthScan = async () => {
    setAuthScanLoading(true);
    setAuthScanError("");
    setAuthDeleteResults({});
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/list-auth-users`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as {
        ok: boolean;
        error?: string;
        total_auth_users?: number;
        total_profiles?: number;
        orphans?: OrphanedUser[];
      };
      if (!data.ok) throw new Error(data.error ?? "Scan failed");
      setAuthScanResult({
        total_auth_users: data.total_auth_users ?? 0,
        total_profiles: data.total_profiles ?? 0,
        orphans: data.orphans ?? [],
        scannedAt: new Date(),
      });
    } catch (e) {
      setAuthScanError(e instanceof Error ? e.message : "Scan failed — try again");
    }
    setAuthScanLoading(false);
  };

  const deleteOrphanedUser = async (user: OrphanedUser) => {
    setDeletingAuthId(user.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-auth-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          userId: user.id,
          entityType: "orphaned_auth_user",
          entityName: user.email,
          reason: "Orphaned auth user — no matching doctor_profiles record",
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string; message?: string };
      setAuthDeleteResults(prev => ({ ...prev, [user.id]: { ok: result.ok, msg: result.message ?? result.error ?? "Unknown" } }));
      if (result.ok) {
        setAuthScanResult(prev => prev ? { ...prev, orphans: prev.orphans.filter(u => u.id !== user.id) } : prev);
      }
    } catch {
      setAuthDeleteResults(prev => ({ ...prev, [user.id]: { ok: false, msg: "Network error" } }));
    }
    setDeletingAuthId(null);
  };

  const deleteAllOrphans = async () => {
    if (!authScanResult || authScanResult.orphans.length === 0) return;
    setDeletingAllOrphans(true);
    for (const user of authScanResult.orphans) {
      await deleteOrphanedUser(user);
    }
    setDeletingAllOrphans(false);
  };

  // Group checks by category
  const byCategory = (checks: CheckResult[]) => {
    const groups: Record<string, CheckResult[]> = {};
    for (const c of checks) {
      const cat = c.category ?? "other";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(c);
    }
    return groups;
  };

  const failCount = (checks: CheckResult[]) => checks.filter(c => c.status === "fail").length;
  const warnCount = (checks: CheckResult[]) => checks.filter(c => c.status === "warn").length;

  return (
    <div className="space-y-6">

      {/* ── AUTH CLEANUP TOOL ── */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center bg-red-50 rounded-xl flex-shrink-0">
              <i className="ri-user-unfollow-line text-red-500 text-base"></i>
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-gray-900">Auth User Cleanup</h3>
              <p className="text-xs text-gray-400 mt-0.5">Finds Supabase Auth accounts that have no matching profile — leftover logins from deleted users.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={runAuthScan}
            disabled={authScanLoading}
            className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] disabled:opacity-60 cursor-pointer transition-colors"
          >
            {authScanLoading
              ? <><i className="ri-loader-4-line animate-spin"></i>Scanning...</>
              : <><i className="ri-radar-line"></i>Scan Auth Users</>
            }
          </button>
        </div>

        {authScanError && (
          <div className="px-5 py-3 bg-red-50 border-b border-red-100 flex items-center gap-2 text-xs text-red-700 font-semibold">
            <i className="ri-error-warning-line"></i>{authScanError}
          </div>
        )}

        {authScanResult && (
          <div className="px-5 py-4">
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Total Auth Users", value: authScanResult.total_auth_users, color: "text-gray-700", bg: "bg-gray-50" },
                { label: "Matched to Profile", value: authScanResult.total_auth_users - authScanResult.orphans.length, color: "text-[#1a5c4f]", bg: "bg-[#f0faf7]" },
                { label: "Orphaned (No Profile)", value: authScanResult.orphans.length, color: authScanResult.orphans.length > 0 ? "text-red-600" : "text-gray-400", bg: authScanResult.orphans.length > 0 ? "bg-red-50" : "bg-gray-50" },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 px-4 py-3 text-center`}>
                  <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {authScanResult.orphans.length === 0 ? (
              <div className="flex items-center gap-3 px-4 py-3 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl">
                <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-lg flex-shrink-0"></i>
                <div>
                  <p className="text-sm font-bold text-[#1a5c4f]">All clean — no orphaned accounts found</p>
                  <p className="text-xs text-[#1a5c4f]/70 mt-0.5">Every auth user has a matching profile. Scanned {authScanResult.scannedAt.toLocaleTimeString()}</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <i className="ri-error-warning-fill text-red-500"></i>
                    <p className="text-sm font-bold text-red-700">
                      {authScanResult.orphans.length} orphaned auth account{authScanResult.orphans.length !== 1 ? "s" : ""} found
                    </p>
                    <span className="text-xs text-gray-400">These users can still log in even though their profile was deleted</span>
                  </div>
                  <button
                    type="button"
                    onClick={deleteAllOrphans}
                    disabled={deletingAllOrphans || authScanResult.orphans.length === 0}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-xs font-extrabold rounded-xl hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
                  >
                    {deletingAllOrphans
                      ? <><i className="ri-loader-4-line animate-spin"></i>Deleting all...</>
                      : <><i className="ri-delete-bin-line"></i>Delete All {authScanResult.orphans.length} Orphans</>
                    }
                  </button>
                </div>
                <div className="space-y-2">
                  {authScanResult.orphans.map(user => {
                    const result = authDeleteResults[user.id];
                    const isDeleting = deletingAuthId === user.id;
                    return (
                      <div key={user.id} className={`flex items-center gap-4 px-4 py-3 rounded-xl border ${result?.ok ? "bg-gray-50 border-gray-200 opacity-60" : "bg-red-50/50 border-red-200"}`}>
                        <div className="w-8 h-8 flex items-center justify-center bg-red-100 rounded-full flex-shrink-0">
                          <i className="ri-user-line text-red-500 text-sm"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate">{user.email}</p>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-xs text-gray-400 font-mono truncate">{user.id.slice(0, 16)}…</span>
                            <span className="text-xs text-gray-400">Created {new Date(user.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                            {user.last_sign_in_at && (
                              <span className="text-xs text-amber-600 font-semibold">Last login: {new Date(user.last_sign_in_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                            )}
                            {!user.confirmed_at && (
                              <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Unconfirmed</span>
                            )}
                          </div>
                        </div>
                        {result ? (
                          <span className={`text-xs font-bold flex items-center gap-1 ${result.ok ? "text-[#1a5c4f]" : "text-red-600"}`}>
                            <i className={result.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
                            {result.ok ? "Deleted" : result.msg}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => deleteOrphanedUser(user)}
                            disabled={isDeleting || deletingAllOrphans}
                            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
                          >
                            {isDeleting
                              ? <><i className="ri-loader-4-line animate-spin"></i>Deleting...</>
                              : <><i className="ri-delete-bin-line"></i>Delete</>
                            }
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {!authScanResult && !authScanLoading && !authScanError && (
          <div className="px-5 py-8 text-center">
            <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
              <i className="ri-radar-line text-gray-400 text-xl"></i>
            </div>
            <p className="text-sm font-bold text-gray-600">Click &quot;Scan Auth Users&quot; to audit</p>
            <p className="text-xs text-gray-400 mt-1">Checks all Supabase Auth accounts against your provider and team profiles. Finds anyone who can still log in but shouldn&apos;t be able to.</p>
          </div>
        )}
      </div>

      {/* ── HEALTH CHECKS ── */}
      {/* Header + run button */}

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-1">Auto-monitoring</p>
          <h2 className="text-xl font-extrabold text-gray-900">System Health</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Checks run automatically every 3 hours · All portals, automations &amp; integrations
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {runMsg && (
            <span className={`text-sm font-semibold flex items-center gap-1.5 ${runMsg.includes("complete") ? "text-[#1a5c4f]" : "text-red-500"}`}>
              <i className={runMsg.includes("complete") ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}></i>
              {runMsg}
            </span>
          )}
          <button
            type="button"
            onClick={runCheck}
            disabled={running}
            className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-xl hover:bg-[#17504a] disabled:opacity-60 cursor-pointer transition-colors"
          >
            {running
              ? <><i className="ri-loader-4-line animate-spin"></i>Running checks...</>
              : <><i className="ri-play-circle-line"></i>Run Check Now</>
            }
          </button>
        </div>
      </div>

      {loadingLog ? (
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f] block mb-3"></i>
            <p className="text-sm text-gray-500">Loading health data...</p>
          </div>
        </div>
      ) : latestLog === null ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center">
          <div className="w-14 h-14 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-4">
            <i className="ri-pulse-line text-gray-400 text-2xl"></i>
          </div>
          <p className="text-sm font-bold text-gray-700 mb-1">No health checks have run yet</p>
          <p className="text-xs text-gray-400 mb-5">Run your first check manually or wait for the scheduled check at the top of the next 3-hour mark.</p>
          <button
            type="button"
            onClick={runCheck}
            disabled={running}
            className="whitespace-nowrap inline-flex items-center gap-2 px-6 py-2.5 bg-[#1a5c4f] text-white text-sm font-extrabold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors"
          >
            <i className="ri-play-circle-line"></i>Run First Check
          </button>
        </div>
      ) : (
        <>
          {/* Overall status banner */}
          <div className={`rounded-2xl border-2 p-5 flex items-center justify-between gap-4 flex-wrap ${
            latestLog.overall_status === "pass" ? "bg-[#f0faf7] border-[#b8ddd5]" :
            latestLog.overall_status === "warn" ? "bg-amber-50 border-amber-300" :
            latestLog.overall_status === "fail" ? "bg-red-50 border-red-300" :
            "bg-gray-50 border-gray-200"
          }`}>
            <div className="flex items-center gap-4">
              {latestLog.overall_status !== "pass" && (
                <div className="relative flex-shrink-0">
                  <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping ${latestLog.overall_status === "fail" ? "bg-red-400" : "bg-amber-400"}`}></span>
                  <span className={`relative flex w-3 h-3 rounded-full ${latestLog.overall_status === "fail" ? "bg-red-500" : "bg-amber-500"}`}></span>
                </div>
              )}
              <div>
                <OverallBadge status={latestLog.overall_status} />
                <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-2">
                  <i className="ri-time-line"></i>
                  Last checked {fmtRelative(latestLog.checked_at)} · {fmtTime(latestLog.checked_at)}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${latestLog.triggered_by === "cron" ? "bg-gray-100 text-gray-500" : "bg-[#e8f5f1] text-[#1a5c4f]"}`}>
                    {latestLog.triggered_by === "cron" ? "Auto" : "Manual"}
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-sm">
              {failCount(latestLog.checks) > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 text-red-700 rounded-lg font-bold">
                  <i className="ri-close-circle-fill"></i>{failCount(latestLog.checks)} Failing
                </span>
              )}
              {warnCount(latestLog.checks) > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg font-bold">
                  <i className="ri-error-warning-fill"></i>{warnCount(latestLog.checks)} Warnings
                </span>
              )}
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-[#e8f5f1] text-[#1a5c4f] rounded-lg font-bold">
                <i className="ri-checkbox-circle-fill"></i>{latestLog.checks.filter(c => c.status === "pass").length} Passing
              </span>
            </div>
          </div>

          {/* Order health stats */}
          {latestLog.order_health && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: "Total Orders",     value: latestLog.order_health.totalOrders,           icon: "ri-file-list-3-line",   color: "text-gray-700",   bg: "bg-white"         },
                { label: "Paid Orders",       value: latestLog.order_health.totalPaid,             icon: "ri-bank-card-line",    color: "text-[#1a5c4f]",  bg: "bg-[#f0faf7]"    },
                { label: "Completed",         value: latestLog.order_health.totalCompleted,        icon: "ri-checkbox-circle-line", color: "text-emerald-600", bg: "bg-emerald-50"  },
                { label: "Unassigned 3h+",   value: latestLog.order_health.paidUnassignedOver3h,  icon: "ri-alarm-warning-line", color: "text-amber-600",  bg: "bg-amber-50"     },
                { label: "Unassigned 24h+",  value: latestLog.order_health.paidUnassignedOver24h, icon: "ri-error-warning-line", color: "text-red-500",    bg: "bg-red-50"       },
              ].map(s => (
                <div key={s.label} className={`${s.bg} rounded-xl border border-gray-200 p-4`}>
                  <div className="w-7 h-7 flex items-center justify-center bg-white rounded-lg mb-2 flex-shrink-0">
                    <i className={`${s.icon} ${s.color} text-sm`}></i>
                  </div>
                  <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 font-semibold mt-0.5 leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Checks by category */}
          <div className="space-y-3">
            {Object.entries(byCategory(latestLog.checks)).map(([cat, catChecks]) => {
              const catCfg    = CATEGORY_CONFIG[cat] ?? { label: cat, icon: "ri-settings-3-line", color: "text-gray-500" };
              const catFails  = catChecks.filter(c => c.status === "fail").length;
              const catWarns  = catChecks.filter(c => c.status === "warn").length;
              const catStatus = catFails > 0 ? "fail" : catWarns > 0 ? "warn" : "pass";
              const isOpen    = expanded[cat] !== false; // default open

              return (
                <div key={cat} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Category header */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    className="whitespace-nowrap w-full flex items-center justify-between px-5 py-3.5 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 flex items-center justify-center rounded-lg ${STATUS_CONFIG[catStatus].bg} border ${STATUS_CONFIG[catStatus].border}`}>
                        <i className={`${catCfg.icon} ${catCfg.color} text-sm`}></i>
                      </div>
                      <span className="text-sm font-extrabold text-gray-800">{catCfg.label}</span>
                      <span className="text-xs text-gray-400 font-semibold">{catChecks.length} check{catChecks.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {catFails > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs font-bold">
                          <i className="ri-close-circle-fill" style={{ fontSize: "9px" }}></i>{catFails} fail
                        </span>
                      )}
                      {catWarns > 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-600 rounded-full text-xs font-bold">
                          <i className="ri-error-warning-fill" style={{ fontSize: "9px" }}></i>{catWarns} warn
                        </span>
                      )}
                      {catFails === 0 && catWarns === 0 && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#e8f5f1] text-[#1a5c4f] rounded-full text-xs font-bold">
                          <i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i>All good
                        </span>
                      )}
                      <i className={`ri-arrow-${isOpen ? "up" : "down"}-s-line text-gray-400 text-sm ml-1`}></i>
                    </div>
                  </button>

                  {/* Check rows */}
                  {isOpen && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {catChecks.map((check, idx) => {
                        const cfg = STATUS_CONFIG[check.status];
                        return (
                          <div key={idx} className={`flex items-start gap-4 px-5 py-3.5 ${check.status !== "pass" ? `${cfg.bg}` : ""}`}>
                            <div className={`w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0 mt-0.5 ${cfg.bg} border ${cfg.border}`}>
                              <i className={`${cfg.icon} ${cfg.color}`} style={{ fontSize: "11px" }}></i>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-sm font-bold text-gray-800">{check.name}</p>
                                {check.latencyMs !== undefined && (
                                  <span className="text-xs text-gray-400 font-mono">{check.latencyMs}ms</span>
                                )}
                              </div>
                              <p className={`text-xs mt-0.5 ${check.status === "fail" ? "text-red-600 font-semibold" : check.status === "warn" ? "text-amber-700 font-semibold" : "text-gray-500"}`}>
                                {check.message}
                              </p>
                              {check.detail && (
                                <p className="text-xs text-gray-400 mt-0.5 italic">{check.detail}</p>
                              )}
                            </div>
                            <span className={`flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-extrabold ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                              {cfg.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Check History */}
      {history.length > 1 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-extrabold text-gray-900">Check History</p>
            <p className="text-xs text-gray-400 mt-0.5">Last {history.length} runs</p>
          </div>
          <div className="divide-y divide-gray-50">
            {history.map((log, idx) => {
              const cfg     = STATUS_CONFIG[log.overall_status] ?? STATUS_CONFIG.unknown;
              const fails   = log.checks.filter(c => c.status === "fail").length;
              const warns   = log.checks.filter(c => c.status === "warn").length;
              const isLatest = idx === 0;
              return (
                <div key={log.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-gray-50/50 transition-colors flex-wrap">
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${log.overall_status === "pass" ? "bg-[#1a5c4f]" : log.overall_status === "warn" ? "bg-amber-400" : "bg-red-500"}`}></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-extrabold ${cfg.color}`}>
                          {log.overall_status === "pass" ? "All systems OK" : log.overall_status === "warn" ? "Warnings" : "Failures"}
                        </span>
                        {isLatest && (
                          <span className="text-xs px-1.5 py-0.5 bg-[#e8f5f1] text-[#1a5c4f] rounded-full font-bold">Latest</span>
                        )}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${log.triggered_by === "cron" ? "bg-gray-100 text-gray-500" : "bg-sky-50 text-sky-600"}`}>
                          {log.triggered_by === "cron" ? "Auto" : "Manual"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtTime(log.checked_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    {fails > 0 && <span className="flex items-center gap-1 px-2 py-1 bg-red-50 text-red-600 rounded-lg font-bold"><i className="ri-close-circle-fill" style={{ fontSize: "9px" }}></i>{fails} fail{fails !== 1 ? "s" : ""}</span>}
                    {warns > 0 && <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 rounded-lg font-bold"><i className="ri-error-warning-fill" style={{ fontSize: "9px" }}></i>{warns} warn{warns !== 1 ? "s" : ""}</span>}
                    {fails === 0 && warns === 0 && <span className="flex items-center gap-1 px-2 py-1 bg-[#f0faf7] text-[#1a5c4f] rounded-lg font-bold"><i className="ri-checkbox-circle-fill" style={{ fontSize: "9px" }}></i>Clean</span>}
                    <span className="text-gray-300">{log.checks.length} checks</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Info footer */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 flex items-start gap-3">
        <div className="w-7 h-7 flex items-center justify-center bg-white rounded-lg border border-gray-200 flex-shrink-0 mt-0.5">
          <i className="ri-information-line text-gray-400 text-sm"></i>
        </div>
        <div>
          <p className="text-xs font-bold text-gray-700 mb-1">How auto-monitoring works</p>
          <p className="text-xs text-gray-500 leading-relaxed">
            A Supabase pg_cron job fires every 3 hours (midnight, 3am, 6am, 9am, 12pm, 3pm, 6pm, 9pm UTC) and runs the full health check in the background — no one needs to be logged in.
            Each run logs to this table. You can also trigger a manual check any time with the button above.
            To receive alerts when something fails, set up a free webhook in <strong>UptimeRobot.com</strong> pointing to this function URL.
          </p>
          <p className="text-xs text-gray-400 mt-2 font-mono break-all">
            {SUPABASE_URL}/functions/v1/health-check
          </p>
        </div>
      </div>

    </div>
  );
}