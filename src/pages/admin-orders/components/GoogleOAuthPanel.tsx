// GoogleOAuthPanel — Google Ads OAuth 2.0 connection flow for admin
// Handles: generating consent URL, showing token status, testing auth, revoking
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

interface OAuthStatus {
  hasRefreshToken: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasDevToken: boolean;
  hasCustomerId: boolean;
  hasConversionActionId: boolean;
  hasLoginCustomerId: boolean;
  tokenWorks: boolean | null; // null = not tested yet
  lastTestedAt: string | null;
  lastOAuthAt: string | null;
}

interface GoogleOAuthPanelProps {
  onAuthSuccess?: () => void;
}

export default function GoogleOAuthPanel({ onAuthSuccess }: GoogleOAuthPanelProps) {
  const [status, setStatus] = useState<OAuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [showManualSteps, setShowManualSteps] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState<string>("");

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 6000);
  };

  // ── Check current auth status ─────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    setLoading(true);
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
        ok: boolean;
        hasToken: boolean;
        hasDevToken: boolean;
        hasConversionActionId: boolean;
        hasLoginCustomerId: boolean;
        customerId?: string;
        loginCustomerId?: string;
        tokenError?: string;
      };

      // Also check audit logs for last OAuth event
      const { data: logs } = await supabase
        .from("audit_logs")
        .select("created_at, details")
        .eq("action", "google_oauth_token_obtained")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setStatus({
        hasRefreshToken: data.hasToken,
        hasClientId: true, // If test_auth ran, client ID is set (or we'd get a different error)
        hasClientSecret: true,
        hasDevToken: data.hasDevToken,
        hasCustomerId: !!data.customerId,
        hasConversionActionId: data.hasConversionActionId,
        hasLoginCustomerId: data.hasLoginCustomerId,
        tokenWorks: data.ok,
        lastTestedAt: new Date().toISOString(),
        lastOAuthAt: logs?.created_at ?? null,
      });
    } catch {
      setStatus({
        hasRefreshToken: false,
        hasClientId: false,
        hasClientSecret: false,
        hasDevToken: false,
        hasCustomerId: false,
        hasConversionActionId: false,
        hasLoginCustomerId: false,
        tokenWorks: false,
        lastTestedAt: null,
        lastOAuthAt: null,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  // ── Start OAuth flow ──────────────────────────────────────────────────────
  const handleStartOAuth = async () => {
    setAuthLoading(true);
    setAuthUrl(null);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/google-oauth-start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json() as {
        ok: boolean;
        authUrl?: string;
        callbackUrl?: string;
        error?: string;
        setup?: string[];
      };

      if (data.ok && data.authUrl) {
        setAuthUrl(data.authUrl);
        setCallbackUrl(data.callbackUrl ?? "");
        // Open in a new window
        const popup = window.open(data.authUrl, "google_oauth", "width=600,height=700,scrollbars=yes");
        if (!popup) {
          showToast("Popup blocked — copy the URL below and open it manually", false);
        } else {
          showToast("Google consent window opened — grant access and come back here", true);
          // Poll for completion
          const pollInterval = setInterval(async () => {
            if (popup.closed) {
              clearInterval(pollInterval);
              await checkStatus();
              onAuthSuccess?.();
            }
          }, 1000);
        }
      } else {
        showToast(data.error ?? "Failed to generate OAuth URL", false);
        if (data.setup) {
          setShowManualSteps(true);
        }
      }
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    }
    setAuthLoading(false);
  };

  // ── Test auth ─────────────────────────────────────────────────────────────
  const handleTestAuth = async () => {
    setTestLoading(true);
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
        ok: boolean;
        hasToken: boolean;
        tokenError?: string;
        customerId?: string;
        loginCustomerId?: string;
        hasDevToken: boolean;
        hasConversionActionId: boolean;
        hasLoginCustomerId: boolean;
        diagnosis?: string[];
        apiVersion?: string;
      };

      if (data.ok) {
        showToast(`Auth OK ✓ | Customer: ${data.customerId ?? "—"} | API: ${data.apiVersion ?? "—"} | MCC: ${data.loginCustomerId ?? "not set"}`, true);
        setStatus((prev) => prev ? { ...prev, tokenWorks: true, lastTestedAt: new Date().toISOString() } : prev);
      } else {
        const diag = data.diagnosis?.join(" | ") ?? data.tokenError ?? "Unknown error";
        showToast(`Auth FAILED: ${diag}`, false);
        setStatus((prev) => prev ? { ...prev, tokenWorks: false, lastTestedAt: new Date().toISOString() } : prev);
      }
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    }
    setTestLoading(false);
  };

  // ── Test upload (validateOnly) ────────────────────────────────────────────
  const handleTestUpload = async () => {
    setTestLoading(true);
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
        ok: boolean;
        success?: boolean;
        error?: string;
        testOrderId?: string;
        uploadMethod?: string;
        note?: string;
      };
      if (data.ok && data.success) {
        showToast(`Test Upload PASSED ✓ | Order: ${data.testOrderId} | Method: ${data.uploadMethod}`, true);
      } else {
        showToast(`Test Upload FAILED: ${data.error ?? "Unknown"} | Order: ${data.testOrderId ?? "none"}`, false);
      }
    } catch (err) {
      showToast(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
    }
    setTestLoading(false);
  };

  const isFullyConnected = status?.tokenWorks === true
    && status.hasDevToken
    && status.hasCustomerId
    && status.hasConversionActionId;

  const fmt = (ts: string | null) => {
    if (!ts) return "Never";
    return new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  return (
    <div className="space-y-4">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl text-sm font-bold max-w-lg ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>
          <i className={toast.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-fill"}></i>
          <span className="break-all">{toast.msg}</span>
        </div>
      )}

      {/* Status card */}
      <div className={`rounded-xl border p-5 ${isFullyConnected ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${isFullyConnected ? "bg-emerald-100" : "bg-amber-100"}`}>
              <i className={`text-xl ${isFullyConnected ? "ri-google-fill text-emerald-600" : "ri-google-fill text-amber-600"}`}></i>
            </div>
            <div>
              <p className={`text-sm font-extrabold ${isFullyConnected ? "text-emerald-800" : "text-amber-800"}`}>
                {loading ? "Checking connection..." : isFullyConnected ? "Google Ads Connected" : "Google Ads Not Connected"}
              </p>
              <p className={`text-xs mt-0.5 ${isFullyConnected ? "text-emerald-600" : "text-amber-600"}`}>
                {loading ? "Verifying OAuth tokens..." :
                  isFullyConnected
                    ? `OAuth token active · Last tested ${fmt(status?.lastTestedAt ?? null)}`
                    : "OAuth refresh token required to upload conversions and fetch reporting data"
                }
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleTestAuth}
              disabled={testLoading || loading}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
            >
              {testLoading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-shield-check-line"></i>}
              Test Auth
            </button>
            {isFullyConnected && (
              <button
                type="button"
                onClick={handleTestUpload}
                disabled={testLoading || loading}
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 bg-white text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50"
              >
                {testLoading ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-test-tube-line"></i>}
                Test Upload
              </button>
            )}
            <button
              type="button"
              onClick={handleStartOAuth}
              disabled={authLoading || loading}
              className={`whitespace-nowrap flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-50 ${
                isFullyConnected
                  ? "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  : "bg-orange-500 text-white hover:bg-orange-600"
              }`}
            >
              {authLoading
                ? <><i className="ri-loader-4-line animate-spin"></i>Opening...</>
                : isFullyConnected
                  ? <><i className="ri-refresh-line"></i>Re-authorize</>
                  : <><i className="ri-google-fill"></i>Connect Google Account</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* Checklist */}
      {!loading && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <i className="ri-list-check-2 text-gray-400"></i>Configuration Checklist
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: "OAuth Client ID", ok: status?.hasClientId, secret: "GOOGLE_ADS_OAUTH_CLIENT_ID", required: true },
              { label: "OAuth Client Secret", ok: status?.hasClientSecret, secret: "GOOGLE_ADS_OAUTH_CLIENT_SECRET", required: true },
              { label: "Refresh Token", ok: status?.hasRefreshToken, secret: "GOOGLE_ADS_REFRESH_TOKEN", required: true, note: "Generated via OAuth flow below" },
              { label: "Developer Token", ok: status?.hasDevToken, secret: "GOOGLE_ADS_DEVELOPER_TOKEN", required: true },
              { label: "Customer ID (Advertiser)", ok: status?.hasCustomerId, secret: "GOOGLE_ADS_CUSTOMER_ID", required: true },
              { label: "Conversion Action ID", ok: status?.hasConversionActionId, secret: "GOOGLE_ADS_CONVERSION_ACTION_ID", required: true },
              { label: "Login Customer ID (MCC)", ok: status?.hasLoginCustomerId, secret: "GOOGLE_ADS_LOGIN_CUSTOMER_ID", required: false, note: "Required if account is under a Manager/MCC account" },
              { label: "Token Works (live test)", ok: status?.tokenWorks ?? false, secret: null, required: true, note: status?.tokenWorks === null ? "Not tested yet" : undefined },
            ].map((item) => (
              <div key={item.label} className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border ${item.ok ? "bg-emerald-50 border-emerald-100" : item.required ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"}`}>
                <div className={`w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5 ${item.ok ? "text-emerald-500" : item.required ? "text-red-400" : "text-amber-500"}`}>
                  <i className={item.ok ? "ri-checkbox-circle-fill" : item.required ? "ri-close-circle-fill" : "ri-alert-line"}></i>
                </div>
                <div className="min-w-0">
                  <p className={`text-xs font-bold ${item.ok ? "text-emerald-700" : item.required ? "text-red-700" : "text-amber-700"}`}>{item.label}</p>
                  {item.secret && (
                    <p className="text-[10px] font-mono text-gray-400 mt-0.5">{item.secret}</p>
                  )}
                  {item.note && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OAuth flow instructions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
          <i className="ri-route-line text-gray-400"></i>How the OAuth Flow Works
        </p>
        <div className="space-y-3">
          {[
            {
              step: "1",
              title: "Prerequisites — set these secrets first",
              desc: "In Supabase → Edge Functions → Secrets, add: GOOGLE_ADS_OAUTH_CLIENT_ID and GOOGLE_ADS_OAUTH_CLIENT_SECRET (from Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs).",
              icon: "ri-key-2-line",
              color: "bg-orange-100 text-orange-600",
            },
            {
              step: "2",
              title: "Register the callback URL in Google Cloud Console",
              desc: `Add this exact URL as an authorized redirect URI in your OAuth 2.0 client: ${SUPABASE_URL}/functions/v1/google-oauth-callback`,
              icon: "ri-link-m",
              color: "bg-sky-100 text-sky-600",
              code: `${SUPABASE_URL}/functions/v1/google-oauth-callback`,
            },
            {
              step: "3",
              title: "Click \"Connect Google Account\"",
              desc: "A Google consent window will open. Sign in with the Google account that has access to your Google Ads account and grant the requested permissions.",
              icon: "ri-google-fill",
              color: "bg-emerald-100 text-emerald-600",
            },
            {
              step: "4",
              title: "Copy the refresh token to Supabase secrets",
              desc: "After granting consent, the callback page will show your refresh token. Copy it and add it as GOOGLE_ADS_REFRESH_TOKEN in Supabase secrets. If SUPABASE_ACCESS_TOKEN is set, this happens automatically.",
              icon: "ri-clipboard-line",
              color: "bg-violet-100 text-violet-600",
            },
            {
              step: "5",
              title: "Test Auth → Test Upload → Backfill",
              desc: "Click Test Auth to verify the token works. Then Test Upload to validate the full conversion upload flow (validateOnly=true, no real data sent). Finally, Backfill Pending to upload all historical conversions.",
              icon: "ri-checkbox-circle-line",
              color: "bg-[#f0faf7] text-[#1a5c4f]",
            },
          ].map((item) => (
            <div key={item.step} className="flex gap-3">
              <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 ${item.color}`}>
                <i className={`${item.icon} text-sm`}></i>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900">{item.step}. {item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.desc}</p>
                {item.code && (
                  <div
                    className="mt-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-[11px] text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors break-all"
                    onClick={() => { navigator.clipboard.writeText(item.code!); showToast("Callback URL copied!", true); }}
                    title="Click to copy"
                  >
                    {item.code}
                    <span className="ml-2 text-gray-400 text-[10px]">(click to copy)</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Auth URL display (after clicking connect) */}
      {authUrl && (
        <div className="bg-white rounded-xl border border-orange-200 p-5">
          <p className="text-xs font-bold text-orange-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <i className="ri-external-link-line"></i>OAuth Consent URL (open in browser)
          </p>
          <p className="text-xs text-gray-500 mb-3">
            If the popup was blocked, copy this URL and open it manually in your browser:
          </p>
          <div
            className="px-3 py-3 bg-gray-50 border border-gray-200 rounded-lg font-mono text-[10px] text-gray-600 cursor-pointer hover:bg-gray-100 transition-colors break-all"
            onClick={() => { navigator.clipboard.writeText(authUrl); showToast("Auth URL copied!", true); }}
            title="Click to copy"
          >
            {authUrl.slice(0, 120)}...
            <span className="ml-2 text-gray-400">(click to copy full URL)</span>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white text-xs font-bold rounded-lg hover:bg-orange-600 cursor-pointer transition-colors"
            >
              <i className="ri-external-link-line"></i>Open in New Tab
            </a>
            <button
              type="button"
              onClick={() => { navigator.clipboard.writeText(authUrl); showToast("Copied!", true); }}
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <i className="ri-clipboard-line"></i>Copy URL
            </button>
            <button
              type="button"
              onClick={() => { setAuthUrl(null); checkStatus(); }}
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 border border-emerald-200 text-emerald-700 text-xs font-bold rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors"
            >
              <i className="ri-refresh-line"></i>I&apos;ve completed the flow — refresh status
            </button>
          </div>
          {callbackUrl && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-[10px] text-gray-400 mb-1 font-bold uppercase tracking-wider">Callback URL (must be registered in Google Cloud Console)</p>
              <div
                className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg font-mono text-[10px] text-gray-600 cursor-pointer hover:bg-gray-100 break-all"
                onClick={() => { navigator.clipboard.writeText(callbackUrl); showToast("Callback URL copied!", true); }}
              >
                {callbackUrl}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual setup steps toggle */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowManualSteps((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <i className="ri-settings-3-line text-gray-400"></i>
            <span className="text-xs font-bold text-gray-700">Manual Setup — Google Cloud Console Steps</span>
          </div>
          <i className={`text-gray-400 transition-transform ${showManualSteps ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"}`}></i>
        </button>
        {showManualSteps && (
          <div className="px-5 pb-5 border-t border-gray-100 space-y-4">
            <div className="pt-4 space-y-3">
              {[
                {
                  title: "Create OAuth 2.0 Credentials in Google Cloud Console",
                  steps: [
                    "Go to console.cloud.google.com → Select your project (or create one)",
                    "APIs & Services → Library → Search \"Google Ads API\" → Enable it",
                    "APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID",
                    "Application type: Web application",
                    `Add Authorized redirect URI: ${SUPABASE_URL}/functions/v1/google-oauth-callback`,
                    "Download the JSON or copy Client ID and Client Secret",
                  ],
                },
                {
                  title: "Add Secrets to Supabase",
                  steps: [
                    "Supabase Dashboard → Edge Functions → Secrets",
                    "Add: GOOGLE_ADS_OAUTH_CLIENT_ID = your Client ID",
                    "Add: GOOGLE_ADS_OAUTH_CLIENT_SECRET = your Client Secret",
                    "Add: GOOGLE_ADS_DEVELOPER_TOKEN = from Google Ads → Tools → API Center",
                    "Add: GOOGLE_ADS_CUSTOMER_ID = your advertiser account ID (digits only)",
                    "Add: GOOGLE_ADS_CONVERSION_ACTION_ID = from Google Ads → Goals → Conversions",
                    "Add: GOOGLE_ADS_LOGIN_CUSTOMER_ID = your MCC manager account ID (if applicable)",
                  ],
                },
                {
                  title: "Get Developer Token",
                  steps: [
                    "Sign in to Google Ads → Tools & Settings → API Center",
                    "Apply for API access if not already approved",
                    "Copy the Developer Token",
                    "Add to Supabase secrets as GOOGLE_ADS_DEVELOPER_TOKEN",
                  ],
                },
              ].map((section) => (
                <div key={section.title}>
                  <p className="text-xs font-bold text-gray-800 mb-2">{section.title}</p>
                  <ol className="space-y-1.5">
                    {section.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                        <span className="w-4 h-4 flex items-center justify-center bg-gray-100 rounded-full text-[10px] font-bold text-gray-500 flex-shrink-0 mt-0.5">{i + 1}</span>
                        <span className="leading-relaxed break-all">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
