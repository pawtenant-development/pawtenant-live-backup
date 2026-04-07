// ProviderLicensePanel — Provider's own license management view
// Allows viewing NPI + state licenses, adding/removing states, updating license numbers
// Fires admin notification email on any change
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";

interface StateLicense {
  state: string;
  license_number: string;
}

interface ProfileData {
  npi_number: string | null;
  state_license_numbers: Record<string, string> | null;
  licensed_states: string[] | null;
  full_name: string;
  email: string | null;
}

interface ProviderLicensePanelProps {
  userId: string;
  providerName: string;
}

const US_STATES: { name: string; abbr: string }[] = [
  { name: "Alabama", abbr: "AL" }, { name: "Alaska", abbr: "AK" }, { name: "Arizona", abbr: "AZ" },
  { name: "Arkansas", abbr: "AR" }, { name: "California", abbr: "CA" }, { name: "Colorado", abbr: "CO" },
  { name: "Connecticut", abbr: "CT" }, { name: "Delaware", abbr: "DE" }, { name: "Florida", abbr: "FL" },
  { name: "Georgia", abbr: "GA" }, { name: "Hawaii", abbr: "HI" }, { name: "Idaho", abbr: "ID" },
  { name: "Illinois", abbr: "IL" }, { name: "Indiana", abbr: "IN" }, { name: "Iowa", abbr: "IA" },
  { name: "Kansas", abbr: "KS" }, { name: "Kentucky", abbr: "KY" }, { name: "Louisiana", abbr: "LA" },
  { name: "Maine", abbr: "ME" }, { name: "Maryland", abbr: "MD" }, { name: "Massachusetts", abbr: "MA" },
  { name: "Michigan", abbr: "MI" }, { name: "Minnesota", abbr: "MN" }, { name: "Mississippi", abbr: "MS" },
  { name: "Missouri", abbr: "MO" }, { name: "Montana", abbr: "MT" }, { name: "Nebraska", abbr: "NE" },
  { name: "Nevada", abbr: "NV" }, { name: "New Hampshire", abbr: "NH" }, { name: "New Jersey", abbr: "NJ" },
  { name: "New Mexico", abbr: "NM" }, { name: "New York", abbr: "NY" }, { name: "North Carolina", abbr: "NC" },
  { name: "North Dakota", abbr: "ND" }, { name: "Ohio", abbr: "OH" }, { name: "Oklahoma", abbr: "OK" },
  { name: "Oregon", abbr: "OR" }, { name: "Pennsylvania", abbr: "PA" }, { name: "Rhode Island", abbr: "RI" },
  { name: "South Carolina", abbr: "SC" }, { name: "South Dakota", abbr: "SD" }, { name: "Tennessee", abbr: "TN" },
  { name: "Texas", abbr: "TX" }, { name: "Utah", abbr: "UT" }, { name: "Vermont", abbr: "VT" },
  { name: "Virginia", abbr: "VA" }, { name: "Washington", abbr: "WA" }, { name: "West Virginia", abbr: "WV" },
  { name: "Wisconsin", abbr: "WI" }, { name: "Wyoming", abbr: "WY" }, { name: "Washington DC", abbr: "DC" },
];

const STATE_ABBR_MAP = Object.fromEntries(US_STATES.map((s) => [s.abbr, s.name]));

export default function ProviderLicensePanel({ userId, providerName }: ProviderLicensePanelProps) {
  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  // Edit mode
  const [editingNpi, setEditingNpi] = useState(false);
  const [npiInput, setNpiInput] = useState("");
  const [savingNpi, setSavingNpi] = useState(false);

  // State license editing
  const [editingLicenseState, setEditingLicenseState] = useState<string | null>(null);
  const [licenseInput, setLicenseInput] = useState("");
  const [savingLicense, setSavingLicense] = useState(false);

  // Add state modal
  const [showAddState, setShowAddState] = useState(false);
  const [addStateAbbr, setAddStateAbbr] = useState("");
  const [addLicenseNum, setAddLicenseNum] = useState("");
  const [addingState, setAddingState] = useState(false);

  // Remove state confirm
  const [confirmRemoveState, setConfirmRemoveState] = useState<string | null>(null);
  const [removingState, setRemovingState] = useState(false);

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("doctor_profiles")
      .select("npi_number, state_license_numbers, licensed_states, full_name, email")
      .eq("user_id", userId)
      .maybeSingle();
    setProfile(data as ProfileData | null);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const fireAdminNotification = async (changeType: string, details: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      await fetch(`${supabaseUrl}/functions/v1/notify-license-change`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          providerName,
          providerEmail: profile?.email ?? "",
          changeType,
          details,
        }),
      });
    } catch {
      // Non-critical — don't block the UI
    }
  };

  // ── Save NPI ──
  const handleSaveNpi = async () => {
    if (!profile) return;
    setSavingNpi(true);
    const newNpi = npiInput.trim() || null;
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ npi_number: newNpi })
      .eq("user_id", userId);
    setSavingNpi(false);
    if (error) { showToast("Failed to save NPI number.", false); return; }
    setProfile((p) => p ? { ...p, npi_number: newNpi } : p);
    setEditingNpi(false);
    showToast("NPI number updated.", true);
    await fireAdminNotification("NPI Updated", `NPI number changed to: ${newNpi ?? "(cleared)"}`);
  };

  // ── Save license number for a state ──
  const handleSaveLicense = async (stateAbbr: string) => {
    if (!profile) return;
    setSavingLicense(true);
    const current = profile.state_license_numbers ?? {};
    const updated = { ...current, [stateAbbr]: licenseInput.trim() };
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ state_license_numbers: updated })
      .eq("user_id", userId);
    setSavingLicense(false);
    if (error) { showToast("Failed to save license number.", false); return; }
    setProfile((p) => p ? { ...p, state_license_numbers: updated } : p);
    setEditingLicenseState(null);
    showToast(`License number for ${stateAbbr} updated.`, true);
    await fireAdminNotification("License Number Updated", `State ${stateAbbr} license number updated to: ${licenseInput.trim()}`);
  };

  // ── Add new state ──
  const handleAddState = async () => {
    if (!profile || !addStateAbbr || !addLicenseNum.trim()) return;
    setAddingState(true);
    const abbr = addStateAbbr.toUpperCase();

    // Update state_license_numbers
    const currentLicenses = profile.state_license_numbers ?? {};
    const updatedLicenses = { ...currentLicenses, [abbr]: addLicenseNum.trim() };

    // Update licensed_states
    const currentStates = profile.licensed_states ?? [];
    const stateName = STATE_ABBR_MAP[abbr] ?? abbr;
    const updatedStates = currentStates.includes(stateName)
      ? currentStates
      : [...currentStates, stateName];

    const results = await Promise.all([
      supabase.from("doctor_profiles").update({
        state_license_numbers: updatedLicenses,
        licensed_states: updatedStates,
      }).eq("user_id", userId),
      supabase.from("doctor_contacts").update({
        licensed_states: updatedStates,
      }).eq("email", (profile.email ?? "").toLowerCase()),
    ]);

    setAddingState(false);
    if (results[0].error) { showToast("Failed to add state.", false); return; }
    setProfile((p) => p ? { ...p, state_license_numbers: updatedLicenses, licensed_states: updatedStates } : p);
    setShowAddState(false);
    setAddStateAbbr("");
    setAddLicenseNum("");
    showToast(`${abbr} added to your licensed states.`, true);
    await fireAdminNotification("State Added", `Provider added new licensed state: ${abbr} (${stateName}) with license #${addLicenseNum.trim()}`);
  };

  // ── Remove state ──
  const handleRemoveState = async (stateAbbr: string) => {
    if (!profile) return;
    setRemovingState(true);
    const stateName = STATE_ABBR_MAP[stateAbbr] ?? stateAbbr;

    // Remove from state_license_numbers
    const currentLicenses = { ...(profile.state_license_numbers ?? {}) };
    delete currentLicenses[stateAbbr];

    // Remove from licensed_states
    const updatedStates = (profile.licensed_states ?? []).filter((s) => s !== stateName && s !== stateAbbr);

    const removeResults = await Promise.all([
      supabase.from("doctor_profiles").update({
        state_license_numbers: Object.keys(currentLicenses).length > 0 ? currentLicenses : null,
        licensed_states: updatedStates,
      }).eq("user_id", userId),
      supabase.from("doctor_contacts").update({
        licensed_states: updatedStates,
      }).eq("email", (profile.email ?? "").toLowerCase()),
    ]);

    setRemovingState(false);
    if (removeResults[0].error) { showToast("Failed to remove state.", false); return; }
    setProfile((p) => p ? {
      ...p,
      state_license_numbers: Object.keys(currentLicenses).length > 0 ? currentLicenses : null,
      licensed_states: updatedStates,
    } : p);
    setConfirmRemoveState(null);
    showToast(`${stateAbbr} removed from your licensed states.`, true);
    await fireAdminNotification("State Removed", `Provider removed licensed state: ${stateAbbr} (${stateName})`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <p className="text-sm text-gray-500">Could not load license information.</p>
      </div>
    );
  }

  const stateLicenses = profile.state_license_numbers ?? {};
  const licensedStates = profile.licensed_states ?? [];

  // States that have a license number on file
  const statesWithLicense = Object.keys(stateLicenses);

  // States that are licensed but don't have a license number yet
  const statesWithoutLicense = licensedStates
    .map((s) => {
      const abbr = Object.entries(STATE_ABBR_MAP).find(([, name]) => name === s)?.[0] ?? s;
      return abbr;
    })
    .filter((abbr) => !statesWithLicense.includes(abbr));

  // States available to add (not already licensed)
  const alreadyLicensedAbbrs = new Set([
    ...statesWithLicense,
    ...licensedStates.map((s) => Object.entries(STATE_ABBR_MAP).find(([, name]) => name === s)?.[0] ?? s),
  ]);
  const availableToAdd = US_STATES.filter((s) => !alreadyLicensedAbbrs.has(s.abbr));

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold ${toast.ok ? "bg-[#f0faf7] border-[#b8ddd5] text-[#1a5c4f]" : "bg-red-50 border-red-200 text-red-700"}`}>
          <i className={`flex-shrink-0 ${toast.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}`}></i>
          {toast.text}
        </div>
      )}

      {/* Info banner */}
      <div className="bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-start gap-3">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <i className="ri-shield-check-line text-[#1a5c4f] text-sm"></i>
        </div>
        <p className="text-xs text-[#1a5c4f]/80 leading-relaxed">
          Your license information is used for customer verification and case assignment. Any changes you make here will be reviewed by the admin team. You can only add a state if you have a valid license number for it.
        </p>
      </div>

      {/* NPI Number */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-extrabold text-gray-900">NPI Number</p>
            <p className="text-xs text-gray-400 mt-0.5">National Provider Identifier — 10-digit unique ID</p>
          </div>
          {!editingNpi && (
            <button type="button" onClick={() => { setEditingNpi(true); setNpiInput(profile.npi_number ?? ""); }}
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border border-[#b8ddd5] text-[#1a5c4f] bg-[#f0faf7] text-xs font-bold rounded-lg hover:bg-[#e0f2ec] cursor-pointer transition-colors">
              <i className="ri-pencil-line"></i>Edit
            </button>
          )}
        </div>

        {editingNpi ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={npiInput}
              onChange={(e) => setNpiInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit NPI number"
              maxLength={10}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#1a5c4f]"
            />
            <button type="button" onClick={handleSaveNpi} disabled={savingNpi}
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer hover:bg-[#17504a]">
              {savingNpi ? <i className="ri-loader-4-line animate-spin"></i> : "Save"}
            </button>
            <button type="button" onClick={() => setEditingNpi(false)}
              className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border flex-1 ${profile.npi_number ? "bg-[#f8fdfc] border-[#b8ddd5]" : "bg-gray-50 border-gray-200 border-dashed"}`}>
              <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                <i className="ri-id-card-line text-[#1a5c4f] text-sm"></i>
              </div>
              {profile.npi_number ? (
                <div>
                  <p className="text-xs text-gray-400 font-medium">NPI #</p>
                  <p className="text-base font-extrabold text-gray-900 font-mono tracking-wider">{profile.npi_number}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-gray-400">No NPI number on file</p>
                  <p className="text-xs text-gray-400">Click Edit to add your NPI number</p>
                </div>
              )}
            </div>
            {profile.npi_number && (
              <a
                href={`https://npiregistry.cms.hhs.gov/search?number=${profile.npi_number}`}
                target="_blank"
                rel="nofollow noreferrer"
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-600 text-xs font-bold rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
              >
                <i className="ri-external-link-line"></i>Verify
              </a>
            )}
          </div>
        )}
      </div>

      {/* State License Numbers */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-extrabold text-gray-900">State License Numbers</p>
            <p className="text-xs text-gray-400 mt-0.5">{statesWithLicense.length} state{statesWithLicense.length !== 1 ? "s" : ""} with license numbers on file</p>
          </div>
          <button
            type="button"
            onClick={() => { setShowAddState(true); setAddStateAbbr(""); setAddLicenseNum(""); }}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer transition-colors"
          >
            <i className="ri-add-line"></i>Add State
          </button>
        </div>

        {/* Add State Form */}
        {showAddState && (
          <div className="mb-4 p-4 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl">
            <p className="text-xs font-bold text-[#1a5c4f] mb-3">Add New Licensed State</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={addStateAbbr}
                onChange={(e) => setAddStateAbbr(e.target.value)}
                className="flex-1 px-3 py-2 border border-[#b8ddd5] rounded-lg text-sm bg-white focus:outline-none focus:border-[#1a5c4f] cursor-pointer"
              >
                <option value="">Select state...</option>
                {availableToAdd.map((s) => (
                  <option key={s.abbr} value={s.abbr}>{s.name} ({s.abbr})</option>
                ))}
              </select>
              <input
                type="text"
                value={addLicenseNum}
                onChange={(e) => setAddLicenseNum(e.target.value)}
                placeholder="License number (required)"
                className="flex-1 px-3 py-2 border border-[#b8ddd5] rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]"
              />
            </div>
            <p className="text-[10px] text-[#1a5c4f]/70 mt-1.5">A valid license number is required to add a new state.</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleAddState}
                disabled={addingState || !addStateAbbr || !addLicenseNum.trim()}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer hover:bg-[#17504a]"
              >
                {addingState ? <><i className="ri-loader-4-line animate-spin"></i>Adding...</> : <><i className="ri-add-circle-line"></i>Add State</>}
              </button>
              <button type="button" onClick={() => setShowAddState(false)}
                className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
            </div>
          </div>
        )}

        {statesWithLicense.length === 0 && statesWithoutLicense.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
            <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
              <i className="ri-map-pin-line text-gray-400 text-xl"></i>
            </div>
            <p className="text-sm font-semibold text-gray-500">No licensed states on file</p>
            <p className="text-xs text-gray-400 mt-1">Click &quot;Add State&quot; to add your first licensed state with a license number.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* States WITH license numbers */}
            {statesWithLicense.map((abbr) => {
              const licenseNum = stateLicenses[abbr];
              const isEditing = editingLicenseState === abbr;
              const stateName = STATE_ABBR_MAP[abbr] ?? abbr;

              return (
                <div key={abbr} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                      <span className="text-xs font-extrabold text-[#1a5c4f]">{abbr}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{stateName}</p>
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            value={licenseInput}
                            onChange={(e) => setLicenseInput(e.target.value)}
                            placeholder="License number"
                            autoFocus
                            className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#1a5c4f]"
                          />
                          <button type="button" onClick={() => handleSaveLicense(abbr)} disabled={savingLicense}
                            className="whitespace-nowrap flex items-center gap-1 px-3 py-1 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer">
                            {savingLicense ? <i className="ri-loader-4-line animate-spin"></i> : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditingLicenseState(null)}
                            className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600 cursor-pointer px-1">✕</button>
                        </div>
                      ) : (
                        <p className="text-xs font-mono text-gray-500 mt-0.5">{licenseNum}</p>
                      )}
                    </div>
                    {!isEditing && (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => { setEditingLicenseState(abbr); setLicenseInput(licenseNum); }}
                          className="whitespace-nowrap w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#1a5c4f] hover:bg-[#f0faf7] rounded-lg cursor-pointer transition-colors"
                          title="Edit license number"
                        >
                          <i className="ri-pencil-line text-sm"></i>
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveState(abbr)}
                          className="whitespace-nowrap w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                          title="Remove this state"
                        >
                          <i className="ri-delete-bin-6-line text-sm"></i>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Remove confirm inline */}
                  {confirmRemoveState === abbr && (
                    <div className="px-4 py-3 bg-red-50 border-t border-red-100 flex items-center justify-between gap-3">
                      <p className="text-xs text-red-700 font-semibold">Remove {abbr} from your licensed states? This will notify the admin team.</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button type="button" onClick={() => handleRemoveState(abbr)} disabled={removingState}
                          className="whitespace-nowrap flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer hover:bg-red-700">
                          {removingState ? <i className="ri-loader-4-line animate-spin"></i> : "Remove"}
                        </button>
                        <button type="button" onClick={() => setConfirmRemoveState(null)}
                          className="whitespace-nowrap px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* States WITHOUT license numbers (licensed but no license # on file) */}
            {statesWithoutLicense.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-bold text-amber-600 mb-2 flex items-center gap-1.5">
                  <i className="ri-alert-line"></i>
                  Licensed states missing license numbers ({statesWithoutLicense.length})
                </p>
                {statesWithoutLicense.map((abbr) => {
                  const isEditing = editingLicenseState === abbr;
                  const stateName = STATE_ABBR_MAP[abbr] ?? abbr;
                  return (
                    <div key={abbr} className="border border-amber-200 bg-amber-50/50 rounded-xl px-4 py-3 flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 flex items-center justify-center bg-amber-100 rounded-lg flex-shrink-0">
                        <span className="text-xs font-extrabold text-amber-700">{abbr}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900">{stateName}</p>
                        {isEditing ? (
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="text"
                              value={licenseInput}
                              onChange={(e) => setLicenseInput(e.target.value)}
                              placeholder="Enter license number"
                              autoFocus
                              className="flex-1 px-2 py-1 border border-amber-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#1a5c4f]"
                            />
                            <button type="button" onClick={() => handleSaveLicense(abbr)} disabled={savingLicense}
                              className="whitespace-nowrap flex items-center gap-1 px-3 py-1 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer">
                              {savingLicense ? <i className="ri-loader-4-line animate-spin"></i> : "Save"}
                            </button>
                            <button type="button" onClick={() => setEditingLicenseState(null)}
                              className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600 cursor-pointer px-1">✕</button>
                          </div>
                        ) : (
                          <p className="text-xs text-amber-600 mt-0.5">No license number on file</p>
                        )}
                      </div>
                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => { setEditingLicenseState(abbr); setLicenseInput(""); }}
                          className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-amber-600 flex-shrink-0"
                        >
                          <i className="ri-add-line"></i>Add #
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      {licensedStates.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">All Licensed States ({licensedStates.length})</p>
          <div className="flex flex-wrap gap-1.5">
            {licensedStates.map((s) => {
              const abbr = Object.entries(STATE_ABBR_MAP).find(([, name]) => name === s)?.[0] ?? s;
              const hasLicense = !!stateLicenses[abbr];
              return (
                <span key={s} className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${hasLicense ? "bg-[#f0faf7] text-[#1a5c4f] border-[#b8ddd5]" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {abbr}
                  {hasLicense ? <i className="ri-checkbox-circle-fill text-[10px]"></i> : <i className="ri-alert-line text-[10px]"></i>}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            <i className="ri-checkbox-circle-fill text-[#1a5c4f]"></i> = license number on file &nbsp;·&nbsp;
            <i className="ri-alert-line text-amber-500"></i> = missing license number
          </p>
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <i className="ri-information-line text-gray-400 text-sm"></i>
        </div>
        <p className="text-xs text-gray-500 leading-relaxed">
          All license changes are logged and reviewed by the admin team. Removing a state will affect your case assignment eligibility for that state. If you believe there&apos;s an error, contact your account manager.
        </p>
      </div>
    </div>
  );
}
