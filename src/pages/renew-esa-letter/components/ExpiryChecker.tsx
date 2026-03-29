import { useState } from "react";
import { Link } from "react-router-dom";

type CheckResult = {
  status: "expired" | "critical" | "warning" | "safe";
  daysLeft: number;
  daysAgo: number;
  issueDate: string;
  expiryDate: string;
};

export default function ExpiryChecker() {
  const [issueDate, setIssueDate] = useState("");
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checked, setChecked] = useState(false);

  const handleCheck = () => {
    if (!issueDate) return;
    const issued = new Date(issueDate);
    const expiry = new Date(issued);
    expiry.setFullYear(expiry.getFullYear() + 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffMs = expiry.getTime() - today.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const daysAgo = daysLeft < 0 ? Math.abs(daysLeft) : 0;

    let status: CheckResult["status"] = "safe";
    if (daysLeft < 0) status = "expired";
    else if (daysLeft <= 14) status = "critical";
    else if (daysLeft <= 45) status = "warning";
    else status = "safe";

    setResult({
      status,
      daysLeft: Math.max(daysLeft, 0),
      daysAgo,
      issueDate: issued.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      expiryDate: expiry.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    setChecked(true);
  };

  const statusConfig = {
    expired: {
      bg: "bg-red-50 border-red-200",
      icon: "ri-error-warning-fill",
      iconColor: "text-red-500",
      headerBg: "bg-red-500",
      label: "EXPIRED",
      headline: "Your ESA letter has expired",
      sub: `Your letter expired ${result?.daysAgo} days ago. You currently have NO housing protection under the Fair Housing Act.`,
      urgency: "Renew Immediately — Your Rights Are at Risk",
      urgencyBg: "bg-red-500 hover:bg-red-600",
      badge: "bg-red-100 text-red-700",
    },
    critical: {
      bg: "bg-orange-50 border-orange-200",
      icon: "ri-alarm-warning-fill",
      iconColor: "text-orange-500",
      headerBg: "bg-orange-500",
      label: "EXPIRING VERY SOON",
      headline: `Only ${result?.daysLeft} days left`,
      sub: "Your letter is about to expire. Renew now to avoid any gap in your housing protections.",
      urgency: "Renew Now — Don't Risk a Gap",
      urgencyBg: "bg-orange-500 hover:bg-orange-600",
      badge: "bg-orange-100 text-orange-700",
    },
    warning: {
      bg: "bg-amber-50 border-amber-200",
      icon: "ri-time-fill",
      iconColor: "text-amber-500",
      headerBg: "bg-amber-500",
      label: "RENEWAL RECOMMENDED",
      headline: `${result?.daysLeft} days remaining`,
      sub: "Good time to schedule your renewal. Most landlords require a letter dated within the last 12 months.",
      urgency: "Schedule My Renewal Now",
      urgencyBg: "bg-amber-500 hover:bg-amber-600",
      badge: "bg-amber-100 text-amber-700",
    },
    safe: {
      bg: "bg-green-50 border-green-200",
      icon: "ri-checkbox-circle-fill",
      iconColor: "text-green-500",
      headerBg: "bg-green-500",
      label: "CURRENTLY VALID",
      headline: `${result?.daysLeft} days remaining`,
      sub: "Your letter is valid. We recommend scheduling your renewal 30 days before it expires so there's zero gap.",
      urgency: "Set a Renewal Reminder",
      urgencyBg: "bg-green-600 hover:bg-green-700",
      badge: "bg-green-100 text-green-700",
    },
  };

  const cfg = result ? statusConfig[result.status] : null;

  // Progress bar width
  const progressWidth = result
    ? result.status === "expired"
      ? 0
      : Math.min(100, Math.round((result.daysLeft / 365) * 100))
    : 0;

  const progressColor =
    result?.status === "expired"
      ? "bg-red-400"
      : result?.status === "critical"
      ? "bg-orange-400"
      : result?.status === "warning"
      ? "bg-amber-400"
      : "bg-green-400";

  return (
    <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5 md:p-6 w-full max-w-md">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 flex items-center justify-center bg-orange-500/20 rounded-lg">
          <i className="ri-calendar-check-line text-orange-300 text-sm"></i>
        </div>
        <p className="text-white font-bold text-sm">Check Your ESA Letter Status</p>
      </div>

      {!checked ? (
        <>
          <p className="text-white/60 text-xs mb-4 leading-relaxed">
            Enter your letter&apos;s issue date to instantly see if it&apos;s expired, about to expire, or still valid.
          </p>
          <label className="block text-white/70 text-xs font-semibold mb-1.5 uppercase tracking-wide">
            Letter Issue Date
          </label>
          <input
            type="date"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            max={new Date().toISOString().split("T")[0]}
            className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/20 text-white text-sm focus:outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 transition-all [color-scheme:dark] cursor-pointer"
          />
          <button
            onClick={handleCheck}
            disabled={!issueDate}
            className="whitespace-nowrap mt-3 w-full py-3 rounded-lg bg-orange-500 text-white text-sm font-bold hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Check My Letter Status
          </button>
          <p className="text-white/40 text-xs text-center mt-2.5">No account required — instant results</p>
        </>
      ) : result && cfg ? (
        <div>
          {/* Status badge */}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-3 ${cfg.badge}`}>
            <div className="w-3 h-3 flex items-center justify-center">
              <i className={`${cfg.icon} text-xs`}></i>
            </div>
            {cfg.label}
          </div>

          {/* Headline */}
          <p className="text-white font-bold text-base mb-1">{cfg.headline}</p>
          <p className="text-white/60 text-xs leading-relaxed mb-4">{cfg.sub}</p>

          {/* Timeline bar */}
          <div className="mb-4">
            <div className="flex items-start justify-between flex-wrap gap-x-3 gap-y-0.5 text-xs text-white/40 mb-1">
              <span className="whitespace-nowrap">Issued {result.issueDate}</span>
              <span className="whitespace-nowrap">Exp {result.expiryDate}</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${progressColor}`}
                style={{ width: `${progressWidth}%` }}
              ></div>
            </div>
            <div className="grid grid-cols-3 text-xs mt-1">
              <span className="text-white/40">0 days</span>
              <span className={`font-bold text-center ${result.status === "expired" ? "text-red-400" : result.status === "critical" ? "text-orange-400" : "text-white/60"}`}>
                {result.status === "expired" ? `${result.daysAgo}d past` : `${result.daysLeft}d left`}
              </span>
              <span className="text-white/40 text-right">365 days</span>
            </div>
          </div>

          {/* CTA */}
          {result.status === "safe" ? (
            <div className="space-y-2">
              <Link
                to="/assessment"
                className={`whitespace-nowrap w-full py-3 rounded-lg text-white text-sm font-bold transition-colors cursor-pointer text-center block ${cfg.urgencyBg}`}
              >
                <i className="ri-refresh-line mr-1.5"></i>
                {cfg.urgency}
              </Link>
              <button
                onClick={() => { setChecked(false); setIssueDate(""); setResult(null); }}
                className="whitespace-nowrap w-full py-2 text-white/50 text-xs hover:text-white/70 transition-colors cursor-pointer"
              >
                Check a different date
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <Link
                to="/assessment"
                className={`whitespace-nowrap w-full py-3 rounded-lg text-white text-sm font-bold transition-colors cursor-pointer text-center block ${cfg.urgencyBg}`}
              >
                <i className="ri-refresh-line mr-1.5"></i>
                {cfg.urgency}
              </Link>
              <button
                onClick={() => { setChecked(false); setIssueDate(""); setResult(null); }}
                className="whitespace-nowrap w-full py-2 text-white/50 text-xs hover:text-white/70 transition-colors cursor-pointer"
              >
                Check a different date
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
