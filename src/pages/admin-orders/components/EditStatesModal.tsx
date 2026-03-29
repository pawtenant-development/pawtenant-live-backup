import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";

const US_STATES: { name: string; abbr: string; region: string }[] = [
  { name: "Alabama", abbr: "AL", region: "Southeast" },
  { name: "Alaska", abbr: "AK", region: "West" },
  { name: "Arizona", abbr: "AZ", region: "Southwest" },
  { name: "Arkansas", abbr: "AR", region: "Southeast" },
  { name: "California", abbr: "CA", region: "West" },
  { name: "Colorado", abbr: "CO", region: "West" },
  { name: "Connecticut", abbr: "CT", region: "Northeast" },
  { name: "Delaware", abbr: "DE", region: "Northeast" },
  { name: "Florida", abbr: "FL", region: "Southeast" },
  { name: "Georgia", abbr: "GA", region: "Southeast" },
  { name: "Hawaii", abbr: "HI", region: "West" },
  { name: "Idaho", abbr: "ID", region: "West" },
  { name: "Illinois", abbr: "IL", region: "Midwest" },
  { name: "Indiana", abbr: "IN", region: "Midwest" },
  { name: "Iowa", abbr: "IA", region: "Midwest" },
  { name: "Kansas", abbr: "KS", region: "Midwest" },
  { name: "Kentucky", abbr: "KY", region: "Southeast" },
  { name: "Louisiana", abbr: "LA", region: "Southeast" },
  { name: "Maine", abbr: "ME", region: "Northeast" },
  { name: "Maryland", abbr: "MD", region: "Northeast" },
  { name: "Massachusetts", abbr: "MA", region: "Northeast" },
  { name: "Michigan", abbr: "MI", region: "Midwest" },
  { name: "Minnesota", abbr: "MN", region: "Midwest" },
  { name: "Mississippi", abbr: "MS", region: "Southeast" },
  { name: "Missouri", abbr: "MO", region: "Midwest" },
  { name: "Montana", abbr: "MT", region: "West" },
  { name: "Nebraska", abbr: "NE", region: "Midwest" },
  { name: "Nevada", abbr: "NV", region: "West" },
  { name: "New Hampshire", abbr: "NH", region: "Northeast" },
  { name: "New Jersey", abbr: "NJ", region: "Northeast" },
  { name: "New Mexico", abbr: "NM", region: "Southwest" },
  { name: "New York", abbr: "NY", region: "Northeast" },
  { name: "North Carolina", abbr: "NC", region: "Southeast" },
  { name: "North Dakota", abbr: "ND", region: "Midwest" },
  { name: "Ohio", abbr: "OH", region: "Midwest" },
  { name: "Oklahoma", abbr: "OK", region: "Southwest" },
  { name: "Oregon", abbr: "OR", region: "West" },
  { name: "Pennsylvania", abbr: "PA", region: "Northeast" },
  { name: "Rhode Island", abbr: "RI", region: "Northeast" },
  { name: "South Carolina", abbr: "SC", region: "Southeast" },
  { name: "South Dakota", abbr: "SD", region: "Midwest" },
  { name: "Tennessee", abbr: "TN", region: "Southeast" },
  { name: "Texas", abbr: "TX", region: "Southwest" },
  { name: "Utah", abbr: "UT", region: "West" },
  { name: "Vermont", abbr: "VT", region: "Northeast" },
  { name: "Virginia", abbr: "VA", region: "Southeast" },
  { name: "Washington", abbr: "WA", region: "West" },
  { name: "West Virginia", abbr: "WV", region: "Southeast" },
  { name: "Wisconsin", abbr: "WI", region: "Midwest" },
  { name: "Wyoming", abbr: "WY", region: "West" },
  { name: "Washington DC", abbr: "DC", region: "Northeast" },
];

const REGIONS = ["Northeast", "Southeast", "Midwest", "Southwest", "West"];

interface DoctorInfo {
  profileId?: string;
  contactId?: string;
  name: string;
  email: string;
  currentStates: string[];
}

interface EditStatesModalProps {
  doctor: DoctorInfo;
  onClose: () => void;
  onSaved: (name: string, count: number) => void;
}

export default function EditStatesModal({ doctor, onClose, onSaved }: EditStatesModalProps) {
  const [selected, setSelected] = useState<string[]>([...doctor.currentStates]);
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const filtered = US_STATES.filter((s) => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.abbr.toLowerCase().includes(search.toLowerCase());
    const matchRegion = !regionFilter || s.region === regionFilter;
    return matchSearch && matchRegion;
  });

  const toggle = (name: string) => {
    setSelected((prev) => prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name]);
  };

  const toggleRegionAll = (region: string) => {
    const regionStates = US_STATES.filter((s) => s.region === region).map((s) => s.name);
    const allSelected = regionStates.every((s) => selected.includes(s));
    if (allSelected) {
      setSelected((prev) => prev.filter((s) => !regionStates.includes(s)));
    } else {
      setSelected((prev) => [...new Set([...prev, ...regionStates])]);
    }
  };

  const added = selected.filter((s) => !doctor.currentStates.includes(s));
  const removed = doctor.currentStates.filter((s) => !selected.includes(s));
  const hasChanges = added.length > 0 || removed.length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const updates: Promise<unknown>[] = [];
      if (doctor.contactId) {
        updates.push(supabase.from("doctor_contacts").update({ licensed_states: selected }).eq("id", doctor.contactId));
      }
      if (doctor.profileId) {
        updates.push(supabase.from("doctor_profiles").update({ licensed_states: selected }).eq("id", doctor.profileId));
      }
      const results = await Promise.all(updates);
      const anyError = results.find((r: unknown) => (r as { error?: { message: string } })?.error);
      if (anyError) throw new Error((anyError as { error: { message: string } }).error.message);
      onSaved(doctor.name, selected.length);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
          <div>
            <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-0.5">Licensed States</p>
            <h2 className="text-lg font-extrabold text-gray-900">{doctor.name}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{doctor.email}</p>
          </div>
          <button type="button" onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer transition-colors mt-1">
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        {/* Change summary bar */}
        {hasChanges && (
          <div className="px-6 py-2.5 bg-amber-50 border-b border-amber-200 flex items-center gap-4 flex-shrink-0">
            <i className="ri-information-line text-amber-600 flex-shrink-0"></i>
            <div className="flex items-center gap-4 text-xs flex-wrap">
              {added.length > 0 && (
                <span className="text-emerald-700 font-semibold">
                  <i className="ri-add-circle-line mr-1"></i>
                  {added.length} state{added.length !== 1 ? "s" : ""} added
                </span>
              )}
              {removed.length > 0 && (
                <span className="text-red-600 font-semibold">
                  <i className="ri-delete-bin-line mr-1"></i>
                  {removed.length} state{removed.length !== 1 ? "s" : ""} removed
                </span>
              )}
            </div>
            <span className="ml-auto text-xs text-amber-600 font-semibold">{selected.length} total</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-shrink-0 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-40">
            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search state..."
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]" />
          </div>
          {/* Region tabs */}
          <div className="flex items-center gap-1 flex-wrap">
            <button type="button" onClick={() => setRegionFilter(null)}
              className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${!regionFilter ? "bg-[#1a5c4f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              All
            </button>
            {REGIONS.map((r) => (
              <button key={r} type="button" onClick={() => setRegionFilter(regionFilter === r ? null : r)}
                className={`whitespace-nowrap px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${regionFilter === r ? "bg-[#1a5c4f] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {r}
              </button>
            ))}
          </div>
          {/* Quick actions */}
          <div className="flex items-center gap-2 ml-auto">
            <button type="button"
              onClick={() => regionFilter
                ? toggleRegionAll(regionFilter)
                : setSelected(US_STATES.filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase())).map((s) => s.name))
              }
              className="whitespace-nowrap px-2.5 py-1.5 text-xs font-semibold text-[#1a5c4f] border border-[#b8ddd5] rounded-lg hover:bg-[#f0faf7] cursor-pointer transition-colors">
              {regionFilter ? `All ${regionFilter}` : "Select All"}
            </button>
            <button type="button" onClick={() => setSelected([])}
              className="whitespace-nowrap px-2.5 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
              Clear All
            </button>
          </div>
        </div>

        {/* States grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No states match your search.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {filtered.map((s) => {
                const isChecked = selected.includes(s.name);
                const isNew = isChecked && !doctor.currentStates.includes(s.name);
                const isRemoved = !isChecked && doctor.currentStates.includes(s.name);
                return (
                  <label key={s.name}
                    className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl cursor-pointer select-none transition-all text-center border ${
                      isChecked
                        ? "bg-[#e8f5f1] border-[#b8ddd5] text-[#1a5c4f]"
                        : isRemoved
                          ? "bg-red-50 border-red-200 text-red-400"
                          : "bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100 hover:border-gray-200"
                    }`}>
                    <input type="checkbox" checked={isChecked} onChange={() => toggle(s.name)} className="sr-only" />
                    <div className={`w-4 h-4 flex items-center justify-center rounded flex-shrink-0 ${
                      isChecked ? "bg-[#1a5c4f]" : isRemoved ? "border-2 border-red-300" : "border border-gray-300"
                    }`}>
                      {isChecked && <i className="ri-check-line text-white" style={{ fontSize: "10px" }}></i>}
                      {isRemoved && <i className="ri-close-line text-red-400" style={{ fontSize: "10px" }}></i>}
                    </div>
                    <span className="text-xs font-extrabold leading-none">{s.abbr}</span>
                    {isNew && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border border-white"></span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected chips */}
        {selected.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 flex-shrink-0">
            <p className="text-xs font-bold text-gray-500 mb-2">{selected.length} Licensed States</p>
            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {selected.sort().map((name) => {
                const abbr = US_STATES.find((s) => s.name === name)?.abbr ?? name;
                return (
                  <span key={name}
                    onClick={() => toggle(name)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#1a5c4f] text-white rounded-full text-xs font-semibold cursor-pointer hover:bg-red-500 transition-colors"
                    title={`Remove ${name}`}>
                    {abbr}
                    <i className="ri-close-line" style={{ fontSize: "9px" }}></i>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 flex-shrink-0">
            <i className="ri-error-warning-line text-red-500 text-sm flex-shrink-0"></i>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-gray-400">
            Changes affect order routing immediately after saving.
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving || !hasChanges}
              className="whitespace-nowrap flex items-center gap-2 px-5 py-2 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-40 cursor-pointer transition-colors">
              {saving ? (
                <><i className="ri-loader-4-line animate-spin"></i>Saving...</>
              ) : (
                <><i className="ri-save-line"></i>Save {selected.length} States</>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
