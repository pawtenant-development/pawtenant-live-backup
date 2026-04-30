import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

// OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: structured license row shape.
interface ApplicationLicenseRow {
  state_code: string;
  credential: string;
  license_number: string;
}

interface ProviderApplication {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  npi: string | null;
  license_types: string | null;
  license_number: string | null;
  license_state: string | null;
  additional_states: string | null;
  // OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: optional jsonb. New applications
  // populate it; legacy applications leave it null and fall back to the older
  // license_state / license_number / license_types fields below.
  licenses: ApplicationLicenseRow[] | null;
  years_experience: string | null;
  practice_name: string | null;
  practice_type: string | null;
  specializations: string | null;
  monthly_capacity: string | null;
  esa_experience: string | null;
  telehealth_ready: string | null;
  profile_url: string | null;
  bio: string | null;
  headshot_url: string | null;
  documents_urls: string[] | null;
  status: string;
  created_at: string;
}

const STATE_NAME_TO_CODE: Record<string, string> = {
  "Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA",
  "Colorado":"CO","Connecticut":"CT","Delaware":"DE","Florida":"FL","Georgia":"GA",
  "Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS",
  "Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA",
  "Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT",
  "Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM",
  "New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK",
  "Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC",
  "South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT",
  "Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY",
  "Washington DC":"DC","District of Columbia":"DC",
};

const ALL_STATE_CODES = [
  "AL","AK","AZ","AR","CA","CO","CT","DC","DE","FL","GA","HI","IA","ID","IL","IN",
  "KS","KY","LA","MA","MD","ME","MI","MN","MS","MO","MT","NC","ND","NE","NH","NJ",
  "NM","NV","NY","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VA","VT","WA",
  "WI","WV","WY",
];

function parseStatesToCodes(licenseState: string | null, additionalStates: string | null): string[] {
  const codes = new Set<string>();
  const addName = (name: string) => {
    const trimmed = name.trim();
    const code = STATE_NAME_TO_CODE[trimmed] ?? (trimmed.length === 2 ? trimmed.toUpperCase() : null);
    if (code) codes.add(code);
  };
  if (licenseState) addName(licenseState);
  if (additionalStates) additionalStates.split(",").forEach(addName);
  return Array.from(codes);
}

interface Props {
  application: ProviderApplication;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export default function ProviderApplicationModal({ application, onClose, onDone }: Props) {
  const initialStates = parseStatesToCodes(application.license_state, application.additional_states);

  const [approvalForm, setApprovalForm] = useState({
    full_name: `${application.first_name} ${application.last_name}`,
    title: (() => {
      const lt = application.license_types ?? "";
      const m = lt.match(/\(([^)]+)\)/);
      return m ? m[1] : lt.split(",")[0]?.trim() ?? "LCSW";
    })(),
    role: "Licensed Mental Health Professional",
    bio: application.bio ?? "",
    photo_url: application.headshot_url ?? "",
    verification_url: application.profile_url ?? "https://pawtenant.com/join-our-network",
  });
  const [selectedStates, setSelectedStates] = useState<Set<string>>(new Set(initialStates));
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  const toggleState = (code: string) => {
    setSelectedStates((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const handleApprove = async () => {
    if (!approvalForm.full_name || selectedStates.size === 0) {
      setError("Full name and at least one licensed state are required.");
      return;
    }
    setError("");
    setProcessing(true);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("approve-provider-application", {
        body: { applicationId: application.id },
      });

      setProcessing(false);

      if (fnErr) {
        setError(`Approval failed: ${fnErr.message}`);
        return;
      }

      const result = (data ?? null) as {
        ok?: boolean;
        error?: string;
        already_existed?: boolean;
        welcome_email_sent?: boolean;
      } | null;

      if (!result || result.ok === false) {
        setError(`Approval failed: ${result?.error ?? "Unknown error"}`);
        return;
      }

      const name = approvalForm.full_name;
      const msg = result.already_existed
        ? `${name} already had a provider account — invite email resent.`
        : `${name} approved. Provider account created${result.welcome_email_sent === false ? "" : " and invite email sent"}.`;
      onDone(msg);
    } catch (err) {
      setProcessing(false);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Approval failed: ${message}`);
    }
  };

  const handleReject = async () => {
    setProcessing(true);
    await supabase.from("provider_applications").update({
      status: "rejected",
      rejection_reason: rejectReason || null,
      reviewed_at: new Date().toISOString(),
    }).eq("id", application.id);
    setProcessing(false);
    onDone(`Application from ${application.first_name} ${application.last_name} has been rejected.`);
  };

  const field = (label: string, value: string | null | undefined) => value ? (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-50 last:border-b-0">
      <span className="text-xs text-gray-400 flex-shrink-0 w-36">{label}</span>
      <span className="text-xs text-gray-700 font-medium text-right flex-1">{value}</span>
    </div>
  ) : null;

  const fieldAlways = (label: string, value: string | null | undefined, fallback = "Not provided") => (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-50 last:border-b-0">
      <span className="text-xs text-gray-400 flex-shrink-0 w-36">{label}</span>
      <span className={`text-xs text-right flex-1 ${value ? "text-gray-700 font-medium" : "text-gray-400 italic"}`}>
        {value || fallback}
      </span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-7 py-5 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-base font-extrabold text-gray-900">Review Provider Application</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Submitted {new Date(application.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
            </p>
          </div>
          <button type="button" onClick={onClose} className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 cursor-pointer">
            <i className="ri-close-line text-sm"></i>
          </button>
        </div>

        <div className="p-7 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-start gap-2">
              <i className="ri-error-warning-line flex-shrink-0 mt-0.5"></i>{error}
            </div>
          )}

          {/* Two columns: submitted info + approval form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Submitted Application Data */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Submitted Information</p>

              {/* Headshot preview */}
              {application.headshot_url && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-2">Headshot</p>
                  <div className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                    <img src={application.headshot_url} alt="Headshot" className="w-full h-full object-cover object-top" />
                  </div>
                </div>
              )}

              <div className="bg-gray-50 rounded-xl px-4 py-3">
                {field("Name", `${application.first_name} ${application.last_name}`)}
                {field("Email", application.email)}
                {field("Phone", application.phone)}
                {/* OPS-PROVIDER-APPLICATION-LICENSE-ROWS-V2: structured rows
                    when present; legacy single fields otherwise. Falling back
                    keeps old applications readable in admin review. */}
                {Array.isArray(application.licenses) && application.licenses.length > 0 ? (
                  <div className="py-2 border-b border-gray-200/70 last:border-b-0">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Licenses</p>
                    <div className="space-y-1.5">
                      {application.licenses.map((lic, idx) => (
                        <div key={`${lic.state_code}-${lic.credential}-${idx}`} className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-[#e8f0f9] text-[#3b6ea5] border border-[#b8cce4] font-bold">
                            {lic.state_code}
                          </span>
                          <span className="font-semibold text-gray-700">{lic.credential}</span>
                          <span className="font-mono text-gray-700">{lic.license_number}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {field("License Type(s)", application.license_types)}
                    {field("License #", application.license_number)}
                  </>
                )}
                {fieldAlways("NPI #", application.npi)}
                {(!Array.isArray(application.licenses) || application.licenses.length === 0) && field("Primary State", application.license_state)}
                {(!Array.isArray(application.licenses) || application.licenses.length === 0) && field("Additional States", application.additional_states)}
                {field("Experience", application.years_experience)}
                {field("Practice", application.practice_name)}
                {field("Practice Type", application.practice_type)}
                {field("Specializations", application.specializations)}
                {field("Monthly Capacity", application.monthly_capacity)}
                {field("ESA Experience", application.esa_experience)}
                {field("Telehealth Ready", application.telehealth_ready)}
                {field("LinkedIn/Website", application.profile_url)}
              </div>

              {application.bio && (
                <div className="mt-3 bg-orange-50 border border-orange-100 rounded-xl px-4 py-3">
                  <p className="text-xs font-bold text-gray-500 mb-1.5">Bio / Statement</p>
                  <p className="text-xs text-gray-600 leading-relaxed">{application.bio}</p>
                </div>
              )}

              {(application.documents_urls ?? []).length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-bold text-gray-500 mb-2">Uploaded Documents</p>
                  <div className="space-y-1.5">
                    {(application.documents_urls ?? []).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-[#3b6ea5] hover:underline cursor-pointer bg-[#e8f0f9] px-3 py-2 rounded-lg border border-[#b8cce4]">
                        <i className="ri-file-line"></i>Document {i + 1}
                        <i className="ri-external-link-line text-[10px] ml-auto"></i>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Approval Edit Form */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Profile for Website (Edit Before Approving)</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" value={approvalForm.full_name} onChange={(e) => setApprovalForm((f)=>({...f,full_name:e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Title (credential)</label>
                  <input type="text" value={approvalForm.title} placeholder="e.g. LCSW" onChange={(e) => setApprovalForm((f)=>({...f,title:e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Role / Specialty</label>
                  <input type="text" value={approvalForm.role} placeholder="Licensed Mental Health Professional" onChange={(e) => setApprovalForm((f)=>({...f,role:e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Bio</label>
                  <textarea rows={4} value={approvalForm.bio} onChange={(e) => setApprovalForm((f)=>({...f,bio:e.target.value}))}
                    placeholder="Write a professional bio for the website..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] resize-none"></textarea>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1 flex items-center gap-2">
                    Photo URL
                    {approvalForm.photo_url && (
                      <span className="font-normal text-[#3b6ea5]">(preview below)</span>
                    )}
                  </label>
                  <input type="url" value={approvalForm.photo_url} onChange={(e) => setApprovalForm((f)=>({...f,photo_url:e.target.value}))}
                    placeholder="https://... or leave blank to use uploaded headshot"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                  {approvalForm.photo_url && (
                    <div className="mt-2 w-14 h-14 rounded-full overflow-hidden border-2 border-orange-100">
                      <img src={approvalForm.photo_url} alt="Preview" className="w-full h-full object-cover object-top" onError={(e)=>{(e.target as HTMLImageElement).style.display='none'}} />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Verification URL (optional)</label>
                  <input type="url" value={approvalForm.verification_url} onChange={(e) => setApprovalForm((f)=>({...f,verification_url:e.target.value}))}
                    placeholder="https://psychologytoday.com/..."
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                </div>
              </div>

              {/* State selection */}
              <div className="mt-4">
                <label className="block text-xs font-bold text-gray-500 mb-2">
                  Licensed States <span className="text-red-400">*</span>
                  <span className="font-normal text-[#3b6ea5] ml-1">({selectedStates.size} selected)</span>
                </label>
                <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_STATE_CODES.map((code) => {
                      const sel = selectedStates.has(code);
                      return (
                        <button key={code} type="button" onClick={() => toggleState(code)}
                          className={`whitespace-nowrap w-10 h-8 flex items-center justify-center rounded-lg text-xs font-bold border cursor-pointer transition-colors ${sel ? "bg-[#3b6ea5] text-white border-[#3b6ea5]" : "bg-white text-gray-600 border-gray-200 hover:border-[#3b6ea5] hover:text-[#3b6ea5]"}`}>
                          {code}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Reject reason panel */}
          {showReject && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5">
              <p className="text-sm font-bold text-red-800 mb-3">Reason for Rejection <span className="font-normal text-red-500">(optional)</span></p>
              <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g. License could not be verified, insufficient experience..."
                className="w-full px-3 py-2.5 border border-red-200 rounded-lg text-sm bg-white focus:outline-none focus:border-red-400 resize-none mb-3"></textarea>
              <div className="flex items-center gap-3">
                <button type="button" onClick={handleReject} disabled={processing}
                  className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white text-sm font-bold rounded-lg hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors">
                  {processing ? <><i className="ri-loader-4-line animate-spin"></i>Processing...</> : <><i className="ri-close-circle-line"></i>Confirm Rejection</>}
                </button>
                <button type="button" onClick={() => setShowReject(false)}
                  className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          {!showReject && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={handleApprove} disabled={processing}
                className="whitespace-nowrap flex items-center gap-2 px-7 py-3 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                {processing ? <><i className="ri-loader-4-line animate-spin"></i>Approving...</> : <><i className="ri-checkbox-circle-line"></i>Approve &amp; Add to Network</>}
              </button>
              <button type="button" onClick={() => setShowReject(true)}
                className="whitespace-nowrap flex items-center gap-2 px-5 py-3 border border-red-200 text-red-600 text-sm font-bold rounded-xl hover:bg-red-50 cursor-pointer transition-colors">
                <i className="ri-close-circle-line"></i>Reject
              </button>
              <button type="button" onClick={onClose}
                className="whitespace-nowrap ml-auto px-5 py-3 text-sm text-gray-400 hover:text-gray-600 cursor-pointer transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
