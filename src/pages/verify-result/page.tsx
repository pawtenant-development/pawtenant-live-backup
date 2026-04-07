import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

const SUPABASE_URL = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY as string;

interface VerifyResult {
  found: boolean;
  status?: "valid" | "revoked" | "expired" | "not_found" | "rate_limited";
  letter_id?: string;
  issued_at?: string;
  expires_at?: string | null;
  state?: string;
  letter_type?: string;
  provider_name?: string | null;
  provider_title?: string | null;
  // provider_phone and provider_email intentionally omitted — not exposed publicly
  provider_npi?: string | null;
  provider_license?: string | null;
  provider_state_licenses?: Record<string, string> | null;
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

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; icon: string; cls: string }> = {
    valid:   { label: "Valid",   icon: "ri-shield-check-fill",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    revoked: { label: "Revoked", icon: "ri-shield-cross-fill",  cls: "bg-red-100 text-red-600 border-red-200" },
    expired: { label: "Expired", icon: "ri-time-fill",          cls: "bg-gray-100 text-gray-500 border-gray-200" },
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
  const { letterId } = useParams<{ letterId: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!letterId) {
      setResult({ found: false, status: "not_found" });
      setLoading(false);
      return;
    }

    const normalized = decodeURIComponent(letterId).trim().toUpperCase();

    fetch(`${SUPABASE_URL}/functions/v1/verify-letter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ letter_id: normalized }),
    })
      .then((r) => r.json())
      .then((data: VerifyResult) => {
        setResult(data);
        setLoading(false);
      })
      .catch(() => {
        setResult({ found: false, status: "not_found" });
        setLoading(false);
      });
  }, [letterId]);

  const displayId = letterId ? decodeURIComponent(letterId).toUpperCase() : "";

  return (
    <>
      {/* noindex meta */}
      <meta name="robots" content="noindex, nofollow" />

      <div className="min-h-screen bg-[#FFF7ED] flex flex-col">
        {/* Minimal header */}
        <header className="bg-white border-b border-gray-100 px-6 py-4">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-orange-500 rounded-lg">
              <i className="ri-shield-check-line text-white text-sm"></i>
            </div>
            <span className="text-sm font-extrabold text-gray-900 tracking-tight">Pawtenant Verification</span>
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
                <p className="text-sm text-gray-500 font-medium">Verifying letter ID...</p>
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
            ) : result?.found && result.status === "valid" ? (
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
                    This Pawtenant-issued letter ID is authentic and currently valid.
                  </p>
                </div>

                {/* Result card */}
                <div className="bg-white rounded-2xl border border-emerald-200 overflow-hidden">
                  {/* Status bar */}
                  <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <i className="ri-file-check-line text-emerald-600 text-base"></i>
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest">Verification Result</span>
                    </div>
                    <StatusBadge status="valid" />
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
                    {result.expires_at && (
                      <VerifyField
                        label="Expiration Date"
                        value={fmtDate(result.expires_at)}
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
                  </div>

                  {/* Privacy note */}
                  <div className="border-t border-gray-100 bg-gray-50 px-6 py-4">
                    <p className="text-xs text-gray-400 flex items-start gap-1.5 leading-relaxed">
                      <i className="ri-lock-line flex-shrink-0 mt-0.5"></i>
                      This verification confirms the authenticity of the letter ID only. No patient health information is displayed.
                    </p>
                  </div>
                </div>

                {/* Verify another */}
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
                    This letter ID has been revoked and is no longer valid.
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
                      This verification confirms the authenticity of the letter ID only. No patient health information is displayed.
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
                    This letter ID was valid but has since expired.
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
                      This verification confirms the authenticity of the letter ID only. No patient health information is displayed.
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
                    We could not verify this letter ID. Please check that the ID was entered correctly and try again.
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

// ── Reusable field component ──────────────────────────────────────────────────
function VerifyField({
  label,
  value,
  mono = false,
  copyable = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  copyable?: boolean;
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
      <div className="flex items-center gap-2">
        <p className={`text-sm font-bold text-gray-900 ${mono ? "font-mono tracking-wider" : ""}`}>
          {value}
        </p>
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
