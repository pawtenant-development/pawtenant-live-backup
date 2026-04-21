import { useParams, Link } from "react-router-dom";
import { useState, useEffect } from "react";
import SharedNavbar from "../../components/feature/SharedNavbar";
import SharedFooter from "../../components/feature/SharedFooter";
import { DOCTORS, ALL_STATES } from "../../mocks/doctors";
import type { Doctor } from "../../mocks/doctors";
import { supabase } from "../../lib/supabaseClient";
import { mapApprovedToDoctor } from "../../hooks/useDynamicDoctors";

const stateMap = Object.fromEntries(ALL_STATES.map((s) => [s.code, s.name]));

interface NpiVerifyResult {
  status: "idle" | "loading" | "verified" | "not_found" | "error";
  name?: string;
  credential?: string;
  states?: string[];
  npiNumber?: string;
}

export default function DoctorProfilePage() {
  const { id } = useParams<{ id: string }>();
  const staticDoctor = DOCTORS.find((d) => d.id === id) ?? null;
  const [doctor, setDoctor] = useState<Doctor | null>(staticDoctor);
  const [loading, setLoading] = useState(!staticDoctor);
  const [notFound, setNotFound] = useState(false);
  const [npiNumber, setNpiNumber] = useState<string | null>(null);
  const [npiVerify, setNpiVerify] = useState<NpiVerifyResult>({ status: "idle" });
  const [showVerifyPanel, setShowVerifyPanel] = useState(false);
  const [stateLicenseNumbers, setStateLicenseNumbers] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    if (staticDoctor) {
      setDoctor(staticDoctor);
      if (staticDoctor.npi_number) setNpiNumber(staticDoctor.npi_number);
      // Use stateLicenses from mock data if available
      if (staticDoctor.stateLicenses && Object.keys(staticDoctor.stateLicenses).length > 0) {
        setStateLicenseNumbers(staticDoctor.stateLicenses);
      }
      setLoading(false);
      // Also try to fetch from DB to get latest license numbers
      const fetchDbLicenses = async () => {
        const { data: profileData } = await supabase
          .from("doctor_profiles")
          .select("npi_number, state_license_numbers")
          .ilike("email", staticDoctor.email)
          .maybeSingle();
        if (profileData?.npi_number) setNpiNumber(profileData.npi_number as string);
        if (profileData?.state_license_numbers && Object.keys(profileData.state_license_numbers as Record<string, string>).length > 0) {
          setStateLicenseNumbers(profileData.state_license_numbers as Record<string, string>);
        }
      };
      fetchDbLicenses();
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("approved_providers")
        .select("*")
        .eq("slug", id ?? "")
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        const mapped = mapApprovedToDoctor(data);
        setDoctor(mapped);
        // Fetch NPI and state licenses from doctor_profiles using email
        if (data.email) {
          const { data: profileData } = await supabase
            .from("doctor_profiles")
            .select("npi_number, state_license_numbers")
            .ilike("email", data.email)
            .maybeSingle();
          if (profileData?.npi_number) setNpiNumber(profileData.npi_number as string);
          if (profileData?.state_license_numbers) {
            setStateLicenseNumbers(profileData.state_license_numbers as Record<string, string>);
          }
        }
      } else {
        setNotFound(true);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  const handleVerifyLicense = async () => {
    if (!npiNumber) return;
    setShowVerifyPanel(true);
    setNpiVerify({ status: "loading", npiNumber });
    try {
      const res = await fetch(
        `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(npiNumber)}&version=2.1`,
        { headers: { Accept: "application/json" } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as {
        result_count: number;
        results?: Array<{
          basic?: { first_name?: string; last_name?: string; name?: string; credential?: string; status?: string };
          taxonomies?: Array<{ state?: string; license?: string; primary?: boolean }>;
        }>;
      };
      if (!data.result_count || !data.results?.length) {
        setNpiVerify({ status: "not_found", npiNumber });
        return;
      }
      const result = data.results[0];
      const basic = result.basic ?? {};
      const fullName = basic.name ?? [basic.first_name, basic.last_name].filter(Boolean).join(" ");
      const states = (result.taxonomies ?? [])
        .filter((t) => t.state)
        .map((t) => t.state as string)
        .filter((v, i, a) => a.indexOf(v) === i);
      setNpiVerify({
        status: "verified",
        name: fullName,
        credential: basic.credential ?? "",
        states,
        npiNumber,
      });
    } catch {
      setNpiVerify({ status: "error", npiNumber });
    }
  };

  if (loading) {
    return (
      <>
        <SharedNavbar />
        <div className="min-h-screen flex items-center justify-center bg-[#f8f7f4]">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#2c5282]"></i>
        </div>
        <SharedFooter />
      </>
    );
  }

  if (notFound || !doctor) {
    return (
      <>
        <SharedNavbar />
        <div className="min-h-screen flex items-center justify-center bg-[#f8f7f4]">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-800 mb-3">Provider not found</p>
            <Link to="/" className="text-orange-500 hover:underline text-sm">Back to Home</Link>
          </div>
        </div>
        <SharedFooter />
      </>
    );
  }

  const stateNames = doctor.states.map((code) => stateMap[code] || code);

  // Build license entries: only states that have a license number
  const licenseEntries = stateLicenseNumbers
    ? Object.entries(stateLicenseNumbers).filter(([, v]) => v && v.trim() !== "")
    : [];

  return (
    <>
      <SharedNavbar />

      <div className="bg-[#f8f7f4] pt-32 pb-10 px-6">
        <div className="max-w-4xl mx-auto">
          <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
            <Link to="/" className="hover:text-orange-500 transition-colors cursor-pointer">Home</Link>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
            <span className="text-gray-400">Our Providers</span>
            <i className="ri-arrow-right-s-line text-gray-400"></i>
            <span className="text-gray-800 font-medium">{doctor.name}</span>
          </nav>
        </div>
      </div>

      <div className="bg-[#f8f7f4] pb-24 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-8 md:p-10 pb-6 border-b border-gray-100">
              <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-orange-100 flex-shrink-0 bg-orange-50 flex items-center justify-center">
                {doctor.image ? (
                  <img src={doctor.image} alt={doctor.name} className="w-full h-full object-cover object-top"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <span className="text-2xl font-extrabold text-orange-400 select-none">
                    {doctor.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <a href={doctor.verificationUrl} target="_blank" rel="nofollow noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors cursor-pointer">
                    <i className="ri-shield-check-line text-green-500"></i>
                    Verified Medical Professional
                    <i className="ri-external-link-line text-green-400 text-xs ml-0.5"></i>
                  </a>
                  {(npiNumber || doctor.npi_number) && (
                    <>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e8f0f9] border border-[#b8cce4] text-[#2c5282] text-xs font-semibold">
                        <i className="ri-medal-line text-[#2c5282]"></i>
                        NPI Verified{(npiNumber || doctor.npi_number) ? ` · #${npiNumber || doctor.npi_number}` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={handleVerifyLicense}
                        disabled={npiVerify.status === "loading"}
                        className="whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-60"
                      >
                        {npiVerify.status === "loading" ? (
                          <><i className="ri-loader-4-line animate-spin"></i>Verifying...</>
                        ) : npiVerify.status === "verified" ? (
                          <><i className="ri-checkbox-circle-fill text-[#2c5282]"></i>NPI Confirmed</>
                        ) : (
                          <><i className="ri-search-eye-line"></i>Verify NPI</>
                        )}
                      </button>
                    </>
                  )}
                  {licenseEntries.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold">
                      <i className="ri-file-list-3-line text-orange-500"></i>
                      {licenseEntries.length} State License{licenseEntries.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-extrabold text-gray-900 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {doctor.name}, {doctor.title}
                </h1>
                <p className="text-orange-500 font-semibold text-sm mt-0.5">{doctor.role}</p>
              </div>
            </div>

            {/* NPI Verification Result Panel */}
            {showVerifyPanel && npiVerify.status !== "idle" && (
              <div className="mx-8 md:mx-10 mt-5">
                {npiVerify.status === "loading" && (
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl">
                    <i className="ri-loader-4-line animate-spin text-[#2c5282]"></i>
                    <p className="text-sm text-gray-600">Checking NPI Registry (CMS)...</p>
                  </div>
                )}
                {npiVerify.status === "verified" && (
                  <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 flex items-center justify-center bg-[#2c5282] rounded-xl flex-shrink-0">
                        <i className="ri-shield-check-fill text-white text-base"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-[#2c5282]">NPI License Verified</p>
                        <p className="text-xs text-[#2c5282]/70 mt-0.5">Source: CMS National Plan &amp; Provider Enumeration System (NPPES)</p>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 w-20 flex-shrink-0">NPI #</span>
                            <span className="text-xs font-mono font-bold text-gray-800">{npiVerify.npiNumber}</span>
                          </div>
                          {npiVerify.name && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-20 flex-shrink-0">Name</span>
                              <span className="text-xs font-semibold text-gray-800">{npiVerify.name}{npiVerify.credential ? `, ${npiVerify.credential}` : ""}</span>
                            </div>
                          )}
                          {npiVerify.states && npiVerify.states.length > 0 && (
                            <div className="flex items-start gap-2">
                              <span className="text-xs text-gray-500 w-20 flex-shrink-0 mt-0.5">States</span>
                              <div className="flex flex-wrap gap-1">
                                {npiVerify.states.map((s) => (
                                  <span key={s} className="px-2 py-0.5 bg-[#e8f0f9] text-[#2c5282] text-xs font-bold rounded-full border border-[#b8cce4]">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <button type="button" onClick={() => setShowVerifyPanel(false)}
                        className="whitespace-nowrap w-7 h-7 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer flex-shrink-0">
                        <i className="ri-close-line text-sm"></i>
                      </button>
                    </div>
                  </div>
                )}
                {npiVerify.status === "not_found" && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <i className="ri-alert-line text-amber-500 text-base flex-shrink-0 mt-0.5"></i>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-amber-800">NPI Not Found in Registry</p>
                      <p className="text-xs text-amber-700 mt-0.5">NPI #{npiVerify.npiNumber} was not found in the CMS NPPES database. This may be a data entry issue.</p>
                    </div>
                    <button type="button" onClick={() => setShowVerifyPanel(false)}
                      className="whitespace-nowrap w-7 h-7 flex items-center justify-center text-amber-400 hover:text-amber-600 cursor-pointer flex-shrink-0">
                      <i className="ri-close-line text-sm"></i>
                    </button>
                  </div>
                )}
                {npiVerify.status === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <i className="ri-error-warning-line text-red-500 text-base flex-shrink-0 mt-0.5"></i>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-red-700">Verification Unavailable</p>
                      <p className="text-xs text-red-600 mt-0.5">Could not reach the NPI registry. Please try again later.</p>
                    </div>
                    <button type="button" onClick={() => setShowVerifyPanel(false)}
                      className="whitespace-nowrap w-7 h-7 flex items-center justify-center text-red-400 hover:text-red-600 cursor-pointer flex-shrink-0">
                      <i className="ri-close-line text-sm"></i>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="p-8 md:p-10 pt-7">
              <p className="text-gray-600 text-sm leading-relaxed mb-7">{doctor.bio}</p>

              <div className="mb-6">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2.5">Licensed In</p>
                <div className="flex flex-wrap gap-2">
                  {stateNames.map((name) => (
                    <span key={name} className="px-3 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-600 text-xs font-medium">{name}</span>
                  ))}
                </div>
              </div>

              <div className="mb-7">
                <p className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-2.5">Highlights</p>
                <div className="flex flex-wrap gap-2">
                  {doctor.highlights.map((h) => (
                    <span key={h} className="px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold">{h}</span>
                  ))}
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-7">
                <p className="text-amber-800 text-xs leading-relaxed">
                  <strong>Please note:</strong> ESA letters are issued only when clinically appropriate after an individual evaluation. State availability depends on active licensure and telehealth rules.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Link to={`/assessment?doctor=${doctor.id}`}
                  className="whitespace-nowrap px-7 py-3 bg-gray-900 text-white text-sm font-bold rounded-xl hover:bg-gray-700 transition-colors cursor-pointer">
                  Book Consultation
                </Link>
                <button type="button" onClick={() => { document.getElementById("state-availability")?.scrollIntoView({ behavior: "smooth" }); }}
                  className="whitespace-nowrap px-7 py-3 bg-white border border-gray-300 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                  View State Availability
                </button>
              </div>
            </div>
          </div>

          <div id="state-availability" className="mt-10 bg-white rounded-2xl p-8">
            <h2 className="text-xl font-bold text-gray-900 mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>State Availability</h2>
            <p className="text-gray-500 text-sm mb-6">
              {doctor.name} is currently licensed and available to conduct ESA evaluations in the following states.
            </p>
            {stateNames.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {stateNames.map((name) => {
                  const code = doctor.states[stateNames.indexOf(name)];
                  const licenseNum = stateLicenseNumbers?.[code] ?? null;
                  return (
                    <div key={name} className={`flex flex-col gap-1 px-4 py-3 rounded-xl border ${licenseNum ? "bg-[#f8fffe] border-[#d0ede7]" : "bg-[#f8f7f4] border-gray-100"}`}>
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                          <i className="ri-map-pin-2-line text-orange-400 text-sm"></i>
                        </div>
                        <span className="text-gray-700 text-sm font-medium">{name}</span>
                      </div>
                      {licenseNum && (
                        <div className="flex items-center gap-1.5 pl-6">
                          <i className="ri-file-list-3-line text-[#2c5282] text-xs flex-shrink-0"></i>
                          <span className="text-xs font-mono text-[#2c5282] font-semibold">{licenseNum}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-gray-400 text-sm">State availability will be updated shortly.</p>
            )}

            {/* License verification note */}
            {licenseEntries.length > 0 && (
              <div className="mt-6 flex items-start gap-3 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3">
                <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <i className="ri-shield-check-line text-[#2c5282] text-sm"></i>
                </div>
                <p className="text-xs text-[#2c5282]/80 leading-relaxed">
                  License numbers are provided for verification purposes. Landlords and housing providers can use these numbers to independently verify licensure through each state&apos;s licensing board.
                </p>
              </div>
            )}
          </div>

          <div className="mt-8 text-center">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-orange-500 transition-colors cursor-pointer">
              <i className="ri-arrow-left-line"></i>Back to all providers
            </Link>
          </div>
        </div>
      </div>

      <SharedFooter />
    </>
  );
}
