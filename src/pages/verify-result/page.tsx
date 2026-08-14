import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

interface VerifyResult {
  found: boolean;
  status?: "valid" | "revoked" | "expired" | "superseded" | "demo" | "not_found" | "rate_limited" | "service_error";
  is_demo?: boolean;
  /** "J••• S••••" — derived server-side. The stored name is never sent. */
  patient_name_masked?: string | null;
  patient_name_checkable?: boolean;
  letter_id?: string;
  issued_at?: string;
  expires_at?: string | null;
  state?: string;
  letter_type?: string;
  provider_name?: string | null;
  provider_title?: string | null;
  // Consent-gated professional contact. Present ONLY when the issuing provider
  // approved that value for publication; absent (not null) otherwise, so the
  // page renders no row. Never the login address or the legacy unlabelled phone.
  provider_phone?: string;
  provider_email?: string;
  provider_npi?: string | null;
  provider_license?: string | null;
  provider_state_licenses?: Record<string, string> | null;
  // ORDER-ENTITLEMENT-DOCUMENT-FOUNDATION-CLOSURE-001 §12: additive version
  // fields. The newer verification ID is deliberately NOT returned by the RPC,
  // so a superseded letter can never be used to discover the newer one.
  document_version?: number;
  has_newer_version?: boolean;
  superseded_at?: string | null;
  message?: string;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "Washington DC",
};

function fmtDate(ts: string): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

// Genuine outcomes only. `demo` is deliberately ABSENT: a sample never renders
// through the shared badge, because the shared badge lives inside the genuine
// result card. See the dedicated Sample Verification branch below.
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: string; cls: string }> = {
    valid:      { label: "Valid",      icon: "ri-shield-check-fill", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    revoked:    { label: "Revoked",    icon: "ri-shield-cross-fill", cls: "bg-red-100 text-red-600 border-red-200" },
    expired:    { label: "Expired",    icon: "ri-time-fill",         cls: "bg-gray-100 text-gray-500 border-gray-200" },
    superseded: { label: "Superseded", icon: "ri-file-history-fill", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  };
  const c = config[status] ?? config.expired;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border ${c.cls}`}>
      <i className={c.icon}></i>
      {c.label}
    </span>
  );
}

export default function VerifyResultPage() {
  // One page serves three routes: /verify/:letterId (manual), /verify/t/:token
  // and /v/t/:token (QR). Whichever param is present decides how we ask; the
  // ANSWER comes from the same authoritative service either way, so a scan and
  // a typed id cannot disagree.
  const { letterId, token } = useParams<{ letterId?: string; token?: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The pre-boot scrub in index.html lifts the token out of the URL before
    // analytics or GTM can observe it and leaves the placeholder
    // /verify/t/redacted behind, so the real value arrives here rather than
    // through useParams. The param is still honoured for dev/SSR paths where
    // the inline scrub did not run.
    const w = window as unknown as { __PT_VERIFY_TOKEN__?: string };
    const hoisted = w.__PT_VERIFY_TOKEN__;
    const fromParam = token ? decodeURIComponent(token).trim() : "";

    let rawToken = "";
    if (hoisted && hoisted.length >= 10) {
      rawToken = hoisted;
      // Single-use. Left in place it would make a later in-app navigation
      // re-resolve this token instead of the one actually requested.
      delete w.__PT_VERIFY_TOKEN__;
    } else if (fromParam && fromParam !== "redacted") {
      // Client-side navigation: the pre-boot scrub only runs on document load,
      // so a token reaching us through the URL is still live in the address bar
      // where GTM's history-change trigger can read it. Scrub it before the
      // lookup rather than after — the fetch below is an await boundary and
      // analytics does not wait for us.
      rawToken = fromParam;
      window.history.replaceState(null, "", "/verify/t/redacted");
    }
    const normalized = letterId ? decodeURIComponent(letterId).trim().toUpperCase() : "";

    if (!rawToken && !normalized) {
      setResult({ found: false, status: "not_found" });
      setLoading(false);
      return;
    }

    fetch(`${SUPABASE_URL}/functions/v1/verify-letter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify(rawToken ? { token: rawToken } : { letter_id: normalized }),
    })
      .then((r) => r.json())
      .then((data: VerifyResult) => {
        setResult(data);
        setLoading(false);
        // Once resolved, replace the QR token in the address bar with the
        // human Verification ID. The token is the scannable credential — it
        // should not survive in history, a shared screenshot, or a referrer.
        if (rawToken && data?.found && data.letter_id) {
          window.history.replaceState(null, "", `/verify/${encodeURIComponent(data.letter_id)}`);
        }
      })
      .catch(() => {
        // A network/service failure is NOT "this letter is invalid" — saying so
        // would tell a landlord a genuine letter failed verification.
        setResult({ found: false, status: "service_error" });
        setLoading(false);
      });
  }, [letterId, token]);

  // Never render the opaque token as page text.
  const displayId = result?.letter_id ?? (letterId ? decodeURIComponent(letterId).toUpperCase() : "");

  return (
    <>
      {/* noindex meta */}
      <meta name="robots" content="noindex, nofollow" />

      <div className="min-h-screen bg-[#FFF7ED] flex flex-col">
        {/* Minimal header — brand logo (same WebP variants as SharedNavbar)
            linked to the homepage so landlords can reach the main site. */}
        <header className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
            <Link to="/" aria-label="PawTenant homepage" className="flex items-center gap-3 cursor-pointer">
              <picture>
                <source
                  type="image/webp"
                  srcSet="/assets/brand/pawtenant-logo-black-320.webp 1x, /assets/brand/pawtenant-logo-black-640.webp 2x"
                />
                <img
                  src="/assets/brand/pawtenant-logo-black-02.png"
                  alt="PawTenant"
                  width={400}
                  height={160}
                  decoding="async"
                  className="h-8 sm:h-9 w-auto object-contain"
                />
              </picture>
              <span className="inline-flex items-center gap-1.5 bg-orange-50 border border-orange-100 text-orange-600 text-[10px] sm:text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full">
                <i className="ri-shield-check-line"></i>
                Verification
              </span>
            </Link>
            <Link
              to="/"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-orange-600 transition-colors cursor-pointer"
            >
              <i className="ri-home-4-line"></i>
              Back to pawtenant.com
            </Link>
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 flex items-center justify-center px-4 py-16">
          <div className="w-full max-w-lg">

            {loading ? (
              /* Loading state */
              <div className="text-center">
                <div className="w-16 h-16 flex items-center justify-center bg-orange-100 rounded-2xl mx-auto mb-5">
                  <i className="ri-loader-4-line animate-spin text-orange-500 text-3xl"></i>
                </div>
                <p className="text-sm text-gray-500 font-medium">Verifying letter...</p>
                <p className="text-xs text-gray-400 mt-1 font-mono">{displayId}</p>
              </div>
            ) : result?.status === "rate_limited" ? (
              /* Rate limited */
              <div className="text-center">
                <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-2xl mx-auto mb-5">
                  <i className="ri-time-line text-amber-600 text-3xl"></i>
                </div>
                <h2 className="text-xl font-extrabold text-gray-900 mb-2">Too Many Requests</h2>
                <p className="text-sm text-gray-500 mb-6">Please wait a moment before trying again.</p>
                <button
                  type="button"
                  onClick={() => navigate("/verify")}
                  className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 cursor-pointer transition-colors"
                >
                  <i className="ri-arrow-left-line"></i>
                  Try Again
                </button>
              </div>
            ) : result?.status === "service_error" ? (
              /* Temporary failure — explicitly NOT "invalid". */
              <div className="text-center" role="status">
                <div className="w-16 h-16 flex items-center justify-center bg-amber-100 rounded-2xl mx-auto mb-5">
                  <i className="ri-wifi-off-line text-amber-600 text-3xl"></i>
                </div>
                <h1 className="text-xl font-extrabold text-gray-900 mb-2">Verification Temporarily Unavailable</h1>
                <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto leading-relaxed">
                  We couldn&apos;t reach the verification service. This does <span className="font-semibold">not</span> mean the
                  letter is invalid — please try again in a moment.
                </p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 cursor-pointer transition-colors"
                >
                  <i className="ri-refresh-line"></i>
                  Try Again
                </button>
              </div>
            ) : result?.found && result.status === "demo" ? (
              /* ── SAMPLE / DEMONSTRATION ──────────────────────────────────
                 QR-LETTER-VERIFICATION-AND-SAMPLE-PARITY-001 · F3.

                 A sample previously rendered INSIDE the genuine result card —
                 emerald shield, emerald border, "Verification Result" bar —
                 with only the heading and badge changed. A landlord scanning a
                 sample saw the same green chrome a real letter produces, which
                 is exactly the confusion the sample exists to avoid.

                 This branch is structurally separate. It shares no chrome with
                 the genuine card and renders NO genuine metadata rows, so a
                 missing field can never appear as "—" or "Not available" and be
                 misread as "this real letter has no provider".

                 Product comes only from `result.letter_type`, and the ID only
                 from `result.letter_id` — never from `displayId`, which falls
                 back to the URL. A query parameter therefore cannot relabel a
                 sample.                                                      */
              <div>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 flex items-center justify-center bg-slate-100 rounded-2xl mx-auto mb-5">
                    <i className="ri-information-fill text-slate-500 text-3xl"></i>
                  </div>
                  <h1 className="text-2xl font-extrabold text-gray-900 mb-3 tracking-tight">
                    Sample Verification
                  </h1>
                  <div className="mb-3">
                    <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-[11px] font-extrabold tracking-[0.14em] px-3 py-1.5 rounded-full">
                      <i className="ri-flask-line"></i>
                      DEMONSTRATION ONLY
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                    This is a PawTenant sample used to demonstrate the verification system. It is not a valid clinical letter.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-blue-200 overflow-hidden">
                  <div className="bg-blue-50 border-b border-blue-100 px-6 py-4 flex items-center gap-2">
                    <i className="ri-information-line text-blue-500 text-base"></i>
                    <span className="text-xs font-bold text-blue-700 uppercase tracking-widest">Sample Record</span>
                  </div>

                  <div className="px-6 py-5 space-y-4">
                    {/* Rendered only when the server supplied it. No placeholder
                        fallback: an empty-looking row on a sample would be the
                        same "missing metadata" ambiguity F3 exists to remove. */}
                    {result.letter_id && (
                      <VerifyField
                        label="Sample Verification ID"
                        value={result.letter_id}
                        mono
                      />
                    )}
                    <VerifyField
                      label="Letter Type"
                      value={result.letter_type?.toUpperCase() === "PSD"
                        ? "Psychiatric Service Dog (PSD)"
                        : "Emotional Support Animal (ESA)"}
                    />
                  </div>

                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <p className="text-xs text-gray-400 flex items-start gap-1.5 leading-relaxed">
                      <i className="ri-lock-line flex-shrink-0 mt-0.5"></i>
                      No person, provider, document or order is associated with a sample record. Nothing here certifies anyone.
                    </p>
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => navigate("/verify")}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 cursor-pointer transition-colors"
                  >
                    <i className="ri-search-line"></i>
                    Verify a real letter
                  </button>
                </div>
              </div>
            ) : result?.found && (result.status === "valid" || result.status === "superseded") ? (
              /* ── VALID ── */
              <div>
                {/* Success header */}
                <div className="text-center mb-8">
                  <div className="w-16 h-16 flex items-center justify-center bg-emerald-100 rounded-2xl mx-auto mb-5">
                    <i className="ri-shield-check-fill text-emerald-600 text-3xl"></i>
                  </div>
                  <h1 className="text-2xl font-extrabold text-gray-900 mb-2 tracking-tight">
                    Letter Verified
                  </h1>
                  <p className="text-sm text-gray-500">
                    {result.status === "superseded"
                      ? "This letter is authentic. A newer approved version of the document has since been issued."
                      : "This letter is authentic and currently valid."}
                  </p>
                  {/* States what verification does and does not assert. PawTenant
                      confirms the record, not the clinical judgement behind it. */}
                  <p className="text-xs text-gray-400 mt-3 max-w-sm mx-auto leading-relaxed">
                    Verification confirms this letter was issued through PawTenant by the licensed provider shown.
                    PawTenant does not diagnose or evaluate patients.
                  </p>
                </div>

                {/* ORDER-ENTITLEMENT-DOCUMENT-FOUNDATION-CLOSURE-001 §12:
                    a NEWER approved version of this document exists. This ID is
                    still authentic and still resolves to the document it was
                    issued for — it is never repointed. The newer verification ID
                    is deliberately not shown; the holder must supply it. */}
                {result.has_newer_version && (
                  <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                    <i className="ri-information-line text-amber-600 text-base flex-shrink-0 mt-0.5"></i>
                    <p className="text-xs text-amber-800 leading-relaxed">
                      <span className="font-bold">A newer approved version of this document exists.</span>{" "}
                      This verification ID remains authentic and refers to the version it was issued for
                      {result.superseded_at ? ` (replaced ${result.superseded_at})` : ""}. Ask the holder for
                      their current document if you need the latest version.
                    </p>
                  </div>
                )}

                {/* Result card */}
                <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
                  {/* Status bar */}
                  <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="ri-file-check-line text-emerald-600 text-base"></i>
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Verification Result</span>
                    </div>
                    <StatusBadge status={result.status ?? "valid"} />
                  </div>

                  {/* Fields */}
                  <div className="px-6 py-5 space-y-4">
                    <VerifyField
                      label="Verification ID"
                      value={result.letter_id ?? displayId}
                      mono
                      copyable
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <VerifyField
                        label="Letter Type"
                        value={result.letter_type?.toUpperCase() === "PSD" ? "Psychiatric Service Dog (PSD)" : "Emotional Support Animal (ESA)"}
                      />
                      <VerifyField
                        label="State"
                        value={result.state ? (STATE_NAMES[result.state] ?? result.state) : "—"}
                      />
                    </div>
                    <VerifyField
                      label="Issue Date"
                      value={result.issued_at ? fmtDate(result.issued_at) : "—"}
                    />
                    {/* Shown ALWAYS, and honestly. The RPC used to return
                        coalesce(expires_at, issued_at + 1 year), which invented
                        an expiry for every letter — none of them carry one. */}
                    <VerifyField
                      label="Expiration Date"
                      value={result.expires_at ? fmtDate(result.expires_at) : "Not provided"}
                    />
                    {result.patient_name_checkable && (
                      <PatientNameCheck
                        masked={result.patient_name_masked ?? ""}
                        letterId={result.letter_id ?? displayId}
                      />
                    )}
                    {result.provider_name && (
                      <VerifyField
                        label="Issuing Provider"
                        value={[result.provider_title, result.provider_name].filter(Boolean).join(" ")}
                      />
                    )}
                    <VerifyField
                      label="NPI Number"
                      value={result.provider_npi ?? "Not available"}
                      mono={!!result.provider_npi}
                    />
                    <VerifyField
                      label={result.state ? `State License (${result.state})` : "State License Number"}
                      value={
                        (result.state && result.provider_state_licenses?.[result.state])
                          ? result.provider_state_licenses[result.state]
                          : (result.provider_license ?? "Not available")
                      }
                      mono={!!(
                        (result.state && result.provider_state_licenses?.[result.state]) ||
                        result.provider_license
                      )}
                    />
                    {/* PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001.
                        Rendered ONLY when the server sent the key at all. The
                        RPC strips a null contact, so an unapproved provider
                        produces no row rather than a "Not provided" placeholder.
                        The values are the provider's approved professional
                        details — never a login address or the legacy unlabelled
                        phone. React escapes them; `href` is built from the same
                        string so a malformed value cannot become markup. */}
                    {result.provider_phone && (
                      <VerifyField
                        label="Provider Phone"
                        value={result.provider_phone}
                        href={`tel:${result.provider_phone.replace(/[^\d+]/g, "")}`}
                      />
                    )}
                    {result.provider_email && (
                      <VerifyField
                        label="Provider Email"
                        value={result.provider_email}
                        href={`mailto:${result.provider_email}`}
                      />
                    )}
                  </div>

                  {/* Privacy note */}
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <p className="text-xs text-gray-400 flex items-start gap-1.5 leading-relaxed">
                      <i className="ri-lock-line flex-shrink-0 mt-0.5"></i>
                      This verification confirms the authenticity of the letter only. No patient health information is displayed.
                    </p>
                  </div>
                </div>

                {/* How to verify — both methods, stated once, plainly. */}
                <div className="mt-6 bg-white border border-gray-200 rounded-xl px-4 py-3.5">
                  <p className="text-xs font-bold text-gray-600 mb-2">How to verify a PawTenant letter</p>
                  <ol className="text-xs text-gray-500 space-y-1.5 list-decimal list-inside leading-relaxed">
                    <li>Scan the discreet QR code on the letter with your phone camera.</li>
                    <li>If a Verification ID has been supplied to you separately, you can enter it at pawtenant.com/verify.</li>
                  </ol>
                  <p className="text-[11px] text-gray-400 mt-2.5 leading-relaxed">
                    Private medical information is never displayed.
                  </p>
                </div>

                {/* Verify another */}
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => navigate("/verify")}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 bg-white text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <i className="ri-search-line"></i>
                    Verify Another ID
                  </button>
                </div>
              </div>
            ) : result?.found && result.status === "revoked" ? (
              /* ── REVOKED ── */
              <div>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 flex items-center justify-center bg-red-100 rounded-2xl mx-auto mb-5">
                    <i className="ri-shield-cross-fill text-red-500 text-3xl"></i>
                  </div>
                  <h1 className="text-2xl font-extrabold text-gray-900 mb-2 tracking-tight">
                    Letter Revoked
                  </h1>
                  <p className="text-sm text-gray-500">
                    This letter has been revoked and is no longer valid.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-red-200 overflow-hidden">
                  <div className="bg-red-50 border-b border-red-100 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="ri-file-close-line text-red-500 text-base"></i>
                      <span className="text-xs font-bold text-red-600 uppercase tracking-widest">Verification Result</span>
                    </div>
                    <StatusBadge status="revoked" />
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <VerifyField label="Verification ID" value={result.letter_id ?? displayId} mono />
                    <div className="grid grid-cols-2 gap-4">
                      <VerifyField
                        label="Letter Type"
                        value={result.letter_type?.toUpperCase() === "PSD" ? "PSD" : "ESA"}
                      />
                      <VerifyField
                        label="State"
                        value={result.state ? (STATE_NAMES[result.state] ?? result.state) : "—"}
                      />
                    </div>
                    {result.issued_at && (
                      <VerifyField label="Originally Issued" value={fmtDate(result.issued_at)} />
                    )}
                  </div>
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <p className="text-xs text-gray-400 flex items-start gap-1.5 leading-relaxed">
                      <i className="ri-lock-line flex-shrink-0 mt-0.5"></i>
                      This verification confirms the authenticity of the letter only. No patient health information is displayed.
                    </p>
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => navigate("/verify")}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 bg-white text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <i className="ri-search-line"></i>
                    Verify Another ID
                  </button>
                </div>
              </div>
            ) : result?.found && result.status === "expired" ? (
              /* ── EXPIRED ── */
              <div>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-2xl mx-auto mb-5">
                    <i className="ri-time-fill text-gray-400 text-3xl"></i>
                  </div>
                  <h1 className="text-2xl font-extrabold text-gray-900 mb-2 tracking-tight">
                    Letter Expired
                  </h1>
                  <p className="text-sm text-gray-500">
                    This letter was valid but has since expired.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="ri-time-line text-gray-400 text-base"></i>
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Verification Result</span>
                    </div>
                    <StatusBadge status="expired" />
                  </div>
                  <div className="px-6 py-5 space-y-4">
                    <VerifyField label="Verification ID" value={result.letter_id ?? displayId} mono />
                    <div className="grid grid-cols-2 gap-4">
                      <VerifyField
                        label="Letter Type"
                        value={result.letter_type?.toUpperCase() === "PSD" ? "PSD" : "ESA"}
                      />
                      <VerifyField
                        label="State"
                        value={result.state ? (STATE_NAMES[result.state] ?? result.state) : "—"}
                      />
                    </div>
                    {result.issued_at && (
                      <VerifyField label="Originally Issued" value={fmtDate(result.issued_at)} />
                    )}
                    {result.expires_at && (
                      <VerifyField label="Expired On" value={fmtDate(result.expires_at)} />
                    )}
                  </div>
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <p className="text-xs text-gray-400 flex items-start gap-1.5 leading-relaxed">
                      <i className="ri-lock-line flex-shrink-0 mt-0.5"></i>
                      This verification confirms the authenticity of the letter only. No patient health information is displayed.
                    </p>
                  </div>
                </div>

                <div className="mt-6 text-center">
                  <button
                    type="button"
                    onClick={() => navigate("/verify")}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 bg-white text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <i className="ri-search-line"></i>
                    Verify Another ID
                  </button>
                </div>
              </div>
            ) : (
              /* ── NOT FOUND / INVALID ── */
              <div>
                <div className="text-center mb-8">
                  <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-2xl mx-auto mb-5">
                    <i className="ri-question-line text-gray-400 text-3xl"></i>
                  </div>
                  <h1 className="text-2xl font-extrabold text-gray-900 mb-2 tracking-tight">
                    Unable to Verify
                  </h1>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                    We could not verify this letter. If you scanned the QR code, try again; if you entered a Verification ID, check it was entered correctly.
                  </p>
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                      <i className="ri-file-unknow-line text-gray-400 text-base"></i>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">ID Searched</p>
                      <p className="text-sm font-mono font-bold text-gray-700">{displayId || "—"}</p>
                    </div>
                  </div>
                  <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 space-y-1.5">
                    <p className="text-xs font-bold text-gray-600">Common reasons this may occur:</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li className="flex items-start gap-1.5"><i className="ri-checkbox-blank-circle-line flex-shrink-0 mt-0.5 text-gray-300" style={{ fontSize: "8px" }}></i>The ID was entered incorrectly (check for typos)</li>
                      <li className="flex items-start gap-1.5"><i className="ri-checkbox-blank-circle-line flex-shrink-0 mt-0.5 text-gray-300" style={{ fontSize: "8px" }}></i>The letter was not issued through Pawtenant</li>
                      <li className="flex items-start gap-1.5"><i className="ri-checkbox-blank-circle-line flex-shrink-0 mt-0.5 text-gray-300" style={{ fontSize: "8px" }}></i>The ID format is incorrect (expected: ESA-XX-XXXXXXX)</li>
                    </ul>
                  </div>
                </div>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => navigate("/verify")}
                    className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-orange-500 text-white text-sm font-bold rounded-xl hover:bg-orange-600 cursor-pointer transition-colors"
                  >
                    <i className="ri-search-line"></i>
                    Try Again
                  </button>
                </div>
              </div>
            )}

          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-100 bg-white px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs text-gray-400">
              &copy; {new Date().getFullYear()} Pawtenant &bull; ESA &amp; PSD Letter Services
            </p>
            <a
              href="/"
              className="text-xs text-orange-500 font-semibold hover:underline cursor-pointer"
            >
              pawtenant.com
            </a>
          </div>
        </footer>
      </div>
    </>
  );
}

// ── Patient name: masked by default, confirmable, never disclosed ────────────
//
// A landlord holding the letter already knows the name printed on it, so they
// can CONFIRM it. Someone who merely scanned a photographed QR cannot learn it:
// the server answers only "matches" / "does not match" and never echoes the
// stored value, so repeated guessing yields nothing but booleans.
function PatientNameCheck({ masked, letterId }: { masked: string; letterId: string }) {
  const [value, setValue] = useState("");
  const [state, setState] = useState<"idle" | "checking" | "match" | "nomatch" | "error">("idle");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    setState("checking");
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/verify-letter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        // Sent by Verification ID, never by the QR token — the token stays out
        // of every subsequent request the page makes.
        body: JSON.stringify({ action: "name_match", letter_id: letterId, name: value }),
      });
      const d = await r.json() as { checked?: boolean; matches?: boolean };
      setState(d.checked ? (d.matches ? "match" : "nomatch") : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1 font-medium">Patient Name</p>
      <p className="text-sm font-bold text-gray-900 tracking-wider" aria-label="Patient name, partially hidden for privacy">
        {masked}
      </p>
      <form onSubmit={submit} className="mt-2">
        <label htmlFor="pname" className="block text-[11px] text-gray-500 mb-1.5">
          Confirm the name printed on the letter
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="pname"
            type="text"
            value={value}
            onChange={(e) => { setValue(e.target.value); setState("idle"); }}
            placeholder="Full name on the letter"
            autoComplete="off"
            className="flex-1 min-w-[10rem] px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300"
          />
          <button
            type="submit"
            disabled={state === "checking" || !value.trim()}
            className="whitespace-nowrap inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 text-xs font-bold rounded-lg hover:bg-gray-200 disabled:opacity-60 cursor-pointer transition-colors"
          >
            {state === "checking" ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-user-search-line"></i>}
            Check name
          </button>
        </div>
        <div aria-live="polite" className="mt-1.5 min-h-[1.1rem]">
          {state === "match" && (
            <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
              <i className="ri-checkbox-circle-fill"></i>Patient name matches this letter
            </p>
          )}
          {state === "nomatch" && (
            <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
              <i className="ri-close-circle-line"></i>Patient name does not match this letter
            </p>
          )}
          {state === "error" && (
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              <i className="ri-error-warning-line"></i>Couldn&apos;t check that right now. Please try again.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Reusable field component ──────────────────────────────────────────────────
function VerifyField({
  label,
  value,
  mono = false,
  copyable = false,
  href,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
  /** Renders the value as a tel:/mailto: link. The visible text stays the raw value. */
  href?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1 font-medium">{label}</p>
      <div className="flex items-center gap-2 min-w-0">
        {href ? (
          // `break-all` so a long practice address wraps inside the card instead
          // of widening it — the 390px column is the constraint that matters.
          <a
            href={href}
            className={`text-sm font-bold text-[#1a5c4f] hover:underline break-all min-w-0 ${mono ? "font-mono tracking-wider" : ""}`}
          >
            {value}
          </a>
        ) : (
          <p className={`text-sm font-bold text-gray-900 break-words min-w-0 ${mono ? "font-mono tracking-wider" : ""}`}>
            {value}
          </p>
        )}
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            className="whitespace-nowrap inline-flex items-center gap-1 text-xs text-gray-400 hover:text-[#1a5c4f] cursor-pointer transition-colors"
          >
            <i className={copied ? "ri-checkbox-circle-line" : "ri-file-copy-line"}></i>
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
    </div>
  );
}
