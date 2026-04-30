// ProviderLicensePanel — Provider's own license management view
// Allows viewing NPI + state licenses, adding/removing states, updating license numbers
// Fires admin notification email on any change
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { normalizeStateToCode, normalizeLicenseMapForDisplay, normalizeStateListForDisplay } from "../../../lib/usStates";

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
  application_id: string | null;
}

// OPS-PROVIDER-PORTAL-PROFILE-LICENSE-REVIEW-PHASE1: structured license rows
// captured by the Join Our Network application (V2). Provider portal can read
// these to display the credential per state alongside the license number that
// already lives in doctor_profiles.state_license_numbers.
interface ApplicationLicenseRow {
  state_code: string;
  credential: string;
  license_number: string;
}

// Map of canonical 2-letter state code → list of {credential, license_number}
// rows captured on the original application. Used purely for display in this
// phase — no edits flow back into provider_applications.
type ApplicationLicenseMap = Record<string, { credential: string; license_number: string }[]>;

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
  // OPS-PROVIDER-PORTAL-PROFILE-LICENSE-REVIEW-PHASE1: structured license rows
  // sourced from provider_applications.licenses (display only).
  const [appLicenseMap, setAppLicenseMap] = useState<ApplicationLicenseMap>({});
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

  // OPS-PROVIDER-PORTAL-PROFILE-LICENSE-REVIEW-PHASE1: collapse the
  // "missing license numbers" list when the provider is licensed in many
  // states so the page does not flood. Defaults to collapsed; provider can
  // expand to see all.
  const [showAllMissing, setShowAllMissing] = useState(false);
  const MISSING_PREVIEW_COUNT = 5;

  const showToast = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 5000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("doctor_profiles")
      .select("npi_number, state_license_numbers, licensed_states, full_name, email, application_id")
      .eq("user_id", userId)
      .maybeSingle();
    const typed = data as ProfileData | null;
    setProfile(typed);

    // OPS-PROVIDER-PORTAL-PROFILE-LICENSE-REVIEW-PHASE1: pull structured
    // license rows from the linked application (display-safe fields only).
    if (typed?.application_id) {
      const { data: appRow } = await supabase
        .from("provider_applications")
        .select("licenses")
        .eq("id", typed.application_id)
        .maybeSingle();
      const rawLicenses = (appRow as { licenses?: unknown } | null)?.licenses;
      if (Array.isArray(rawLicenses)) {
        const map: ApplicationLicenseMap = {};
        (rawLicenses as Array<Record<string, unknown>>).forEach((l) => {
          const code = String(l.state_code ?? "").trim().toUpperCase();
          const credential = String(l.credential ?? "").trim();
          const licenseNumber = String(l.license_number ?? "").trim();
          if (!code || !licenseNumber) return;
          if (!map[code]) map[code] = [];
          map[code].push({ credential, license_number: licenseNumber });
        });
        setAppLicenseMap(map);
      } else {
        setAppLicenseMap({});
      }
    } else {
      setAppLicenseMap({});
    }
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
  // OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-B: writes are keyed by
  // canonical code. If a legacy full-name key exists for the same state, drop
  // it so we don't end up with both "VA" and "Virginia" in the JSON.
  const handleSaveLicense = async (stateAbbr: string) => {
    if (!profile) return;
    setSavingLicense(true);
    const targetCode = normalizeStateToCode(stateAbbr) ?? stateAbbr.toUpperCase();
    const current = profile.state_license_numbers ?? {};
    const cleaned: Record<string, string> = {};
    Object.entries(current).forEach(([k, v]) => {
      if (normalizeStateToCode(k) !== targetCode) cleaned[k] = v;
    });
    const updated = { ...cleaned, [targetCode]: licenseInput.trim() };
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ state_license_numbers: updated })
      .eq("user_id", userId);
    setSavingLicense(false);
    if (error) { showToast("Failed to save license number.", false); return; }
    setProfile((p) => p ? { ...p, state_license_numbers: updated } : p);
    setEditingLicenseState(null);
    showToast(`License number for ${targetCode} updated.`, true);
    await fireAdminNotification("License Number Updated", `State ${targetCode} license number updated to: ${licenseInput.trim()}`);
  };

  // ── Add new state ──
  // OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-B: write canonical 2-letter
  // state CODES into both state_license_numbers (key) and licensed_states
  // (array). Dedupe the array against any legacy full-name entry for the
  // same state (e.g. existing ["Virginia"] + adding "VA" → ["VA"]).
  const handleAddState = async () => {
    if (!profile || !addStateAbbr || !addLicenseNum.trim()) return;
    setAddingState(true);
    // addStateAbbr might come from a code dropdown but we normalize defensively.
    const abbr = (normalizeStateToCode(addStateAbbr) ?? addStateAbbr.toUpperCase());

    // Update state_license_numbers (keyed by code)
    const currentLicenses = profile.state_license_numbers ?? {};
    const updatedLicenses = { ...currentLicenses, [abbr]: addLicenseNum.trim() };

    // Update licensed_states (array of codes). Collapse any legacy full-name
    // or duplicate-code entries through normalizeStateToCode + Set.
    const currentStates = profile.licensed_states ?? [];
    const existingCodes = new Set(
      currentStates
        .map((s) => normalizeStateToCode(s))
        .filter((c): c is string => !!c)
    );
    existingCodes.add(abbr);
    const updatedStates = Array.from(existingCodes);

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
    const stateName = STATE_ABBR_MAP[abbr] ?? abbr;
    showToast(`${abbr} added to your licensed states.`, true);
    await fireAdminNotification("State Added", `Provider added new licensed state: ${abbr} (${stateName}) with license #${addLicenseNum.trim()}`);
  };

  // ── Remove state ──
  // OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-B: drop both code keys and
  // any legacy full-name entries for the target state from licensed_states.
  // The remaining array is re-canonicalized to codes so the persisted shape
  // is consistent regardless of what was there before.
  const handleRemoveState = async (stateAbbr: string) => {
    if (!profile) return;
    setRemovingState(true);
    const targetCode = normalizeStateToCode(stateAbbr) ?? stateAbbr.toUpperCase();
    const stateName = STATE_ABBR_MAP[targetCode] ?? targetCode;

    // Remove from state_license_numbers — handle legacy duplicate keys (both
    // "VA" and "Virginia" pointing to the same state).
    const currentLicenses = { ...(profile.state_license_numbers ?? {}) };
    Object.keys(currentLicenses).forEach((k) => {
      if (normalizeStateToCode(k) === targetCode) delete currentLicenses[k];
    });

    // Remove from licensed_states — by code OR legacy name OR raw match — and
    // re-canonicalize the remaining entries to codes.
    const updatedStates = Array.from(new Set(
      (profile.licensed_states ?? [])
        .filter((s) => s !== stateName && s !== stateAbbr && normalizeStateToCode(s) !== targetCode)
        .map((s) => normalizeStateToCode(s))
        .filter((c): c is string => !!c)
    ));

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
        <i className="ri-loader-4-line animate-spin text-3xl text-[#2c5282]"></i>
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

  // OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-A: dedupe legacy mixed data
  // for display. licenseRows[]: one row per canonical state code, with the
  // license number consolidated (and `conflict` flagged when historical keys
  // disagree). licensedStateCodes: deduped Set of canonical codes from the
  // licensed_states array, used to figure out which states still need a
  // license number entered and which are already taken.
  const licenseRows = normalizeLicenseMapForDisplay(stateLicenses);

  // OPS-PROVIDER-PORTAL-PROFILE-LICENSE-REVIEW-PHASE1 fix:
  // Restrict the licensed-states set to canonical US state codes ONLY.
  // normalizeStateListForDisplay surfaces unmappable raw values back as
  // fallback "codes" (e.g. "ALL", ""), which would have rendered as bogus
  // "missing license number" cards. STATE_ABBR_MAP is the canonical 50-state
  // + DC list; any value outside it is treated as garbage and dropped from
  // the missing-license computation here. The provider can still add real
  // states via the Add State control, and the All Licensed States summary
  // below continues to render whatever raw values are stored, so no data is
  // hidden — just cleaned up for *this* derived missing list.
  const VALID_CODES = new Set(Object.keys(STATE_ABBR_MAP));
  const licensedStateCodes = new Set(
    normalizeStateListForDisplay(licensedStates)
      .map((s) => s.code)
      .filter((code) => VALID_CODES.has(code)),
  );
  const codesWithLicense = new Set(licenseRows.map((r) => r.code));

  // Only states that are ACTUALLY in licensed_states AND don't already have a
  // license number show up here. Sorted by state name for stable display.
  const statesWithoutLicense = Array.from(licensedStateCodes)
    .filter((code) => !codesWithLicense.has(code))
    .sort((a, b) => (STATE_ABBR_MAP[a] ?? a).localeCompare(STATE_ABBR_MAP[b] ?? b));

  // True empty state: no license rows, no licensed states on file at all.
  const isEmpty = licenseRows.length === 0 && licensedStateCodes.size === 0;

  // States available to add (not already licensed)
  const alreadyLicensedAbbrs = new Set<string>([...licensedStateCodes, ...codesWithLicense]);
  const availableToAdd = US_STATES.filter((s) => !alreadyLicensedAbbrs.has(s.abbr));

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold ${toast.ok ? "bg-[#e8f0f9] border-[#b8cce4] text-[#2c5282]" : "bg-red-50 border-red-200 text-red-700"}`}>
          <i className={`flex-shrink-0 ${toast.ok ? "ri-checkbox-circle-fill" : "ri-error-warning-line"}`}></i>
          {toast.text}
        </div>
      )}

      {/* Info banner */}
      <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-start gap-3">
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <i className="ri-shield-check-line text-[#2c5282] text-sm"></i>
        </div>
        <p className="text-xs text-[#2c5282]/80 leading-relaxed">
          Your license information is used for customer verification and case assignment. Credentials shown next to each state were copied from your original application. Any changes you make here will be reviewed by the admin team. You can only add a state if you have a valid license number for it.
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
              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border border-[#b8cce4] text-[#2c5282] bg-[#e8f0f9] text-xs font-bold rounded-lg hover:bg-[#dce8f5] cursor-pointer transition-colors">
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
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:border-[#2c5282]"
            />
            <button type="button" onClick={handleSaveNpi} disabled={savingNpi}
              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#2c5282] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer hover:bg-[#1e3a5f]">
              {savingNpi ? <i className="ri-loader-4-line animate-spin"></i> : "Save"}
            </button>
            <button type="button" onClick={() => setEditingNpi(false)}
              className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border flex-1 ${profile.npi_number ? "bg-[#f8fdfc] border-[#b8cce4]" : "bg-gray-50 border-gray-200 border-dashed"}`}>
              <div className="w-8 h-8 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                <i className="ri-id-card-line text-[#2c5282] text-sm"></i>
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
            <p className="text-xs text-gray-400 mt-0.5">{licenseRows.length} state{licenseRows.length !== 1 ? "s" : ""} with license numbers on file</p>
          </div>
          <button
            type="button"
            onClick={() => { setShowAddState(true); setAddStateAbbr(""); setAddLicenseNum(""); }}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#2c5282] text-white text-xs font-bold rounded-lg hover:bg-[#1e3a5f] cursor-pointer transition-colors"
          >
            <i className="ri-add-line"></i>Add State
          </button>
        </div>

        {/* Add State Form */}
        {showAddState && (
          <div className="mb-4 p-4 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl">
            <p className="text-xs font-bold text-[#2c5282] mb-3">Add New Licensed State</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={addStateAbbr}
                onChange={(e) => setAddStateAbbr(e.target.value)}
                className="flex-1 px-3 py-2 border border-[#b8cce4] rounded-lg text-sm bg-white focus:outline-none focus:border-[#2c5282] cursor-pointer"
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
                className="flex-1 px-3 py-2 border border-[#b8cce4] rounded-lg text-sm focus:outline-none focus:border-[#2c5282]"
              />
            </div>
            <p className="text-[10px] text-[#2c5282]/70 mt-1.5">A valid license number is required to add a new state.</p>
            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleAddState}
                disabled={addingState || !addStateAbbr || !addLicenseNum.trim()}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#2c5282] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer hover:bg-[#1e3a5f]"
              >
                {addingState ? <><i className="ri-loader-4-line animate-spin"></i>Adding...</> : <><i className="ri-add-circle-line"></i>Add State</>}
              </button>
              <button type="button" onClick={() => setShowAddState(false)}
                className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 hover:text-gray-700 cursor-pointer">Cancel</button>
            </div>
          </div>
        )}

        {isEmpty ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-xl">
            <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-3">
              <i className="ri-map-pin-line text-gray-400 text-xl"></i>
            </div>
            <p className="text-sm font-semibold text-gray-500">No license states on file yet</p>
            <p className="text-xs text-gray-400 mt-1">Add a state and license number to help PawTenant verify your coverage.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* States WITH license numbers */}
            {/* OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-A: iterate the
                deduped licenseRows (one per canonical state code). When two
                legacy keys held the same number, only one row appears. When
                they conflicted, the row shows both values + a conflict tag. */}
            {licenseRows.map((row) => {
              const abbr = row.code;
              const licenseNum = row.licenseNumber;
              const isEditing = editingLicenseState === abbr;
              const stateName = STATE_ABBR_MAP[abbr] ?? row.label ?? abbr;

              // OPS-PROVIDER-PORTAL-PROFILE-LICENSE-REVIEW-PHASE1: surface
              // credential(s) captured for this state on the original
              // application. Pure display — provider portal does not yet edit
              // credentials.
              const appRowsForState = appLicenseMap[abbr] ?? [];
              const credentialLabel = (() => {
                if (appRowsForState.length === 0) return null;
                const seen = new Set<string>();
                const credentials = appRowsForState
                  .map((r) => r.credential)
                  .filter((c) => c && !seen.has(c) && (seen.add(c), true));
                if (credentials.length === 0) return null;
                return credentials.join(", ");
              })();
              const fromApplication = appRowsForState.some(
                (r) => r.license_number === licenseNum,
              );

              return (
                <div key={abbr} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-[#e8f5f1] rounded-lg flex-shrink-0">
                      <span className="text-xs font-extrabold text-[#2c5282]">{abbr}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">
                        {stateName}
                        {credentialLabel && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#e8f0f9] text-[#2c5282] border border-[#b8cce4] text-[10px] font-bold align-middle">
                            {credentialLabel}
                          </span>
                        )}
                        {fromApplication && (
                          <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200 text-[10px] font-bold align-middle" title="Copied from your provider application">
                            <i className="ri-file-copy-line"></i>from application
                          </span>
                        )}
                        {row.conflict && (
                          <span className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold align-middle">
                            <i className="ri-error-warning-line"></i>conflict
                          </span>
                        )}
                      </p>
                      {row.conflict && (
                        <p className="text-[10px] text-amber-700 mt-0.5">Stored as: {row.licenseNumbers.join(" / ")} — please review with admin.</p>
                      )}
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="text"
                            value={licenseInput}
                            onChange={(e) => setLicenseInput(e.target.value)}
                            placeholder="License number"
                            autoFocus
                            className="flex-1 px-2 py-1 border border-gray-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#2c5282]"
                          />
                          <button type="button" onClick={() => handleSaveLicense(abbr)} disabled={savingLicense}
                            className="whitespace-nowrap flex items-center gap-1 px-3 py-1 bg-[#2c5282] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer">
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
                          className="whitespace-nowrap w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#2c5282] hover:bg-[#e8f0f9] rounded-lg cursor-pointer transition-colors"
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

            {/* States WITHOUT license numbers (licensed but no license # on file).
                OPS-PROVIDER-PORTAL-PROFILE-LICENSE-REVIEW-PHASE1: collapse to a
                short preview when the provider is licensed in many states, and
                add a Remove action so providers/admins can drop coverage they
                no longer want (matches the same handleRemoveState used by rows
                with license numbers — keyed by canonical 2-letter code, safely
                handles cases with no state_license_numbers entry). */}
            {statesWithoutLicense.length > 0 && (() => {
              const overflow = statesWithoutLicense.length > MISSING_PREVIEW_COUNT;
              const visible = overflow && !showAllMissing
                ? statesWithoutLicense.slice(0, MISSING_PREVIEW_COUNT)
                : statesWithoutLicense;
              const hiddenCount = statesWithoutLicense.length - visible.length;
              return (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
                      <i className="ri-alert-line"></i>
                      Licensed states missing license numbers ({statesWithoutLicense.length})
                    </p>
                    {overflow && (
                      <button
                        type="button"
                        onClick={() => setShowAllMissing((v) => !v)}
                        className="whitespace-nowrap text-xs font-bold text-[#2c5282] hover:text-[#1e3a5f] cursor-pointer flex items-center gap-1"
                      >
                        {showAllMissing ? (
                          <><i className="ri-arrow-up-s-line"></i>Show less</>
                        ) : (
                          <><i className="ri-arrow-down-s-line"></i>Show all {statesWithoutLicense.length}</>
                        )}
                      </button>
                    )}
                  </div>
                  {visible.map((abbr) => {
                    const isEditing = editingLicenseState === abbr;
                    const stateName = STATE_ABBR_MAP[abbr] ?? abbr;
                    const isConfirmingRemove = confirmRemoveState === abbr;
                    return (
                      <div key={abbr} className="border border-amber-200 bg-amber-50/50 rounded-xl mb-2 overflow-hidden">
                        <div className="px-4 py-3 flex items-center gap-3">
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
                                  className="flex-1 px-2 py-1 border border-amber-200 rounded-lg text-xs font-mono focus:outline-none focus:border-[#2c5282]"
                                />
                                <button type="button" onClick={() => handleSaveLicense(abbr)} disabled={savingLicense}
                                  className="whitespace-nowrap flex items-center gap-1 px-3 py-1 bg-[#2c5282] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer">
                                  {savingLicense ? <i className="ri-loader-4-line animate-spin"></i> : "Save"}
                                </button>
                                <button type="button" onClick={() => setEditingLicenseState(null)}
                                  className="whitespace-nowrap text-xs text-gray-400 hover:text-gray-600 cursor-pointer px-1">✕</button>
                              </div>
                            ) : (
                              <p className="text-xs text-amber-600 mt-0.5">No license number on file</p>
                            )}
                          </div>
                          {!isEditing && !isConfirmingRemove && (
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => { setEditingLicenseState(abbr); setLicenseInput(""); }}
                                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-amber-600"
                                title="Add a license number for this state"
                              >
                                <i className="ri-add-line"></i>Add #
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmRemoveState(abbr)}
                                className="whitespace-nowrap w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                                title="Remove this state from your coverage"
                              >
                                <i className="ri-delete-bin-6-line text-sm"></i>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Remove confirm inline — reuses the same handleRemoveState
                            used by rows with license numbers. handleRemoveState
                            normalizes the target code, drops any state_license_numbers
                            entries (a no-op when none exist for missing states),
                            and rewrites licensed_states to canonical codes. */}
                        {isConfirmingRemove && (
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
                  {overflow && !showAllMissing && hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllMissing(true)}
                      className="whitespace-nowrap w-full text-center text-xs font-bold text-[#2c5282] hover:text-[#1e3a5f] cursor-pointer py-2 border border-dashed border-amber-200 rounded-xl bg-amber-50/30"
                    >
                      <i className="ri-arrow-down-s-line mr-1"></i>Show {hiddenCount} more missing state{hiddenCount !== 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              );
            })()}
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
                <span key={s} className={`px-2.5 py-1 rounded-full text-xs font-bold border flex items-center gap-1 ${hasLicense ? "bg-[#e8f0f9] text-[#2c5282] border-[#b8cce4]" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                  {abbr}
                  {hasLicense ? <i className="ri-checkbox-circle-fill text-[10px]"></i> : <i className="ri-alert-line text-[10px]"></i>}
                </span>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            <i className="ri-checkbox-circle-fill text-[#2c5282]"></i> = license number on file &nbsp;·&nbsp;
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
