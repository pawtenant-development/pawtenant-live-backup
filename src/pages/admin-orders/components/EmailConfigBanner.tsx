// EmailConfigBanner — shows a persistent warning at the top of the admin portal
// when the Resend email service is misconfigured or unreachable.
// Reads from the latest system_health_log so no extra network calls needed.
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface CheckResult {
  name: string;
  category: string;
  status: "pass" | "fail" | "warn";
  message: string;
  detail?: string;
}

interface HealthLog {
  id: string;
  checked_at: string;
  overall_status: string;
  checks: CheckResult[];
}

type BannerStatus = "fail" | "warn" | "unchecked";

interface BannerState {
  status: BannerStatus;
  message: string;
  detail?: string;
  checkedAt?: string;
}

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

export default function EmailConfigBanner() {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    loadLatestEmailStatus();
  }, []);

  async function loadLatestEmailStatus() {
    try {
      const { data } = await supabase
        .from("system_health_logs")
        .select("id, checked_at, overall_status, checks")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!data) {
        // No health check has ever run — prompt to run one
        setBanner({
          status: "unchecked",
          message: "Email delivery status unknown — no health check has run yet.",
          detail: "Run a health check in System Health to verify your Resend configuration is working.",
        });
        return;
      }

      const log = data as HealthLog;
      const emailChecks = log.checks.filter(
        (c) => c.category === "communications" && (c.name.toLowerCase().includes("email") || c.name.toLowerCase().includes("resend") || c.name.toLowerCase().includes("smtp")),
      );

      const failCheck = emailChecks.find((c) => c.status === "fail");
      const warnCheck = emailChecks.find((c) => c.status === "warn");

      if (failCheck) {
        setBanner({
          status: "fail",
          message: failCheck.message,
          detail: failCheck.detail,
          checkedAt: log.checked_at,
        });
      } else if (warnCheck) {
        setBanner({
          status: "warn",
          message: warnCheck.message,
          detail: warnCheck.detail,
          checkedAt: log.checked_at,
        });
      } else {
        // All email checks passing — no banner needed
        setBanner(null);
      }
    } catch {
      // Silently fail — don't break the admin portal if this check errors
    }
  }

  async function runQuickCheck() {
    setChecking(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      await fetch(`${SUPABASE_URL}/functions/v1/health-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ triggeredBy: "email_banner_check" }),
      });
      // Reload status after check
      await loadLatestEmailStatus();
    } catch {
      // ignore
    }
    setChecking(false);
  }

  if (!banner || dismissed) return null;

  const isFail = banner.status === "fail";
  const isWarn = banner.status === "warn";
  const isUnchecked = banner.status === "unchecked";

  const bgColor = isFail ? "bg-red-50 border-red-200" : isWarn ? "bg-amber-50 border-amber-200" : "bg-sky-50 border-sky-200";
  const iconColor = isFail ? "text-red-500" : isWarn ? "text-amber-500" : "text-sky-500";
  const textColor = isFail ? "text-red-700" : isWarn ? "text-amber-700" : "text-sky-700";
  const detailColor = isFail ? "text-red-600" : isWarn ? "text-amber-600" : "text-sky-600";
  const icon = isFail ? "ri-error-warning-fill" : isWarn ? "ri-error-warning-line" : "ri-information-line";
  const badgeText = isFail ? "Email Delivery Broken" : isWarn ? "Email Warning" : "Health Check Needed";

  return (
    <div className={`border rounded-xl px-4 py-3 flex items-start gap-3 ${bgColor}`}>
      {/* Pulse indicator for failures */}
      {isFail && (
        <div className="relative flex-shrink-0 mt-0.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60 animate-ping"></span>
          <span className="relative flex w-3 h-3 rounded-full bg-red-500"></span>
        </div>
      )}

      <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 ${!isFail ? "block" : "hidden"}`}>
        <i className={`${icon} ${iconColor} text-base`}></i>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-extrabold uppercase tracking-wide ${iconColor}`}>{badgeText}</span>
          {banner.checkedAt && (
            <span className={`text-xs ${detailColor} opacity-70`}>
              · Last checked {new Date(banner.checkedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        <p className={`text-sm font-semibold mt-0.5 ${textColor}`}>{banner.message}</p>
        {banner.detail && (
          <p className={`text-xs mt-0.5 ${detailColor}`}>{banner.detail}</p>
        )}
        {(isFail || isWarn) && (
          <p className={`text-xs mt-1 ${detailColor}`}>
            Fix: Go to <strong>Supabase → Edge Functions → Secrets</strong> and verify <code className="font-mono bg-white/60 px-1 rounded">RESEND_API_KEY</code> is set and valid.
            Also ensure <strong>pawtenant.com</strong> is a verified sending domain in your Resend dashboard.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {isUnchecked && (
          <button
            type="button"
            onClick={runQuickCheck}
            disabled={checking}
            className={`whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${isUnchecked ? "border-sky-300 text-sky-700 hover:bg-sky-100" : "border-amber-300 text-amber-700 hover:bg-amber-100"} disabled:opacity-60`}
          >
            {checking ? <><i className="ri-loader-4-line animate-spin mr-1"></i>Checking...</> : "Run Check"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className={`w-6 h-6 flex items-center justify-center rounded-lg cursor-pointer transition-colors ${isFail ? "hover:bg-red-100 text-red-400" : isWarn ? "hover:bg-amber-100 text-amber-400" : "hover:bg-sky-100 text-sky-400"}`}
          title="Dismiss"
        >
          <i className="ri-close-line text-sm"></i>
        </button>
      </div>
    </div>
  );
}
