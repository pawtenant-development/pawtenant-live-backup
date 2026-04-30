import { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { normalizeStateToCode } from "../../../lib/usStates";

const US_STATES: { name: string; abbr: string }[] = [
  { name: "Alabama", abbr: "AL" }, { name: "Alaska", abbr: "AK" },
  { name: "Arizona", abbr: "AZ" }, { name: "Arkansas", abbr: "AR" },
  { name: "California", abbr: "CA" }, { name: "Colorado", abbr: "CO" },
  { name: "Connecticut", abbr: "CT" }, { name: "Delaware", abbr: "DE" },
  { name: "Florida", abbr: "FL" }, { name: "Georgia", abbr: "GA" },
  { name: "Hawaii", abbr: "HI" }, { name: "Idaho", abbr: "ID" },
  { name: "Illinois", abbr: "IL" }, { name: "Indiana", abbr: "IN" },
  { name: "Iowa", abbr: "IA" }, { name: "Kansas", abbr: "KS" },
  { name: "Kentucky", abbr: "KY" }, { name: "Louisiana", abbr: "LA" },
  { name: "Maine", abbr: "ME" }, { name: "Maryland", abbr: "MD" },
  { name: "Massachusetts", abbr: "MA" }, { name: "Michigan", abbr: "MI" },
  { name: "Minnesota", abbr: "MN" }, { name: "Mississippi", abbr: "MS" },
  { name: "Missouri", abbr: "MO" }, { name: "Montana", abbr: "MT" },
  { name: "Nebraska", abbr: "NE" }, { name: "Nevada", abbr: "NV" },
  { name: "New Hampshire", abbr: "NH" }, { name: "New Jersey", abbr: "NJ" },
  { name: "New Mexico", abbr: "NM" }, { name: "New York", abbr: "NY" },
  { name: "North Carolina", abbr: "NC" }, { name: "North Dakota", abbr: "ND" },
  { name: "Ohio", abbr: "OH" }, { name: "Oklahoma", abbr: "OK" },
  { name: "Oregon", abbr: "OR" }, { name: "Pennsylvania", abbr: "PA" },
  { name: "Rhode Island", abbr: "RI" }, { name: "South Carolina", abbr: "SC" },
  { name: "South Dakota", abbr: "SD" }, { name: "Tennessee", abbr: "TN" },
  { name: "Texas", abbr: "TX" }, { name: "Utah", abbr: "UT" },
  { name: "Vermont", abbr: "VT" }, { name: "Virginia", abbr: "VA" },
  { name: "Washington", abbr: "WA" }, { name: "West Virginia", abbr: "WV" },
  { name: "Wisconsin", abbr: "WI" }, { name: "Wyoming", abbr: "WY" },
  { name: "Washington DC", abbr: "DC" },
];

interface CreateDoctorModalProps {
  onClose: () => void;
  onCreated: (result: { full_name: string; email: string }) => void;
}

export default function CreateDoctorModal({ onClose, onCreated }: CreateDoctorModalProps) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    title: "",
    phone: "",
    bio: "",
    license_number: "",
    per_order_rate: "",
  });
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<1 | 2>(1);

  const filteredStates = US_STATES.filter(
    (s) =>
      s.name.toLowerCase().includes(stateFilter.toLowerCase()) ||
      s.abbr.toLowerCase().includes(stateFilter.toLowerCase()),
  );

  const toggleState = (name: string) => {
    setSelectedStates((prev) =>
      prev.includes(name) ? prev.filter((s) => s !== name) : [...prev, name],
    );
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      setError("Full name and email are required.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const rateValue = form.per_order_rate.trim() !== "" ? parseInt(form.per_order_rate, 10) : null;

      // Get the current admin session token to authenticate the edge function call
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Not authenticated. Please refresh and try again.");

      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
      // OPS-PROVIDER-LICENSE-STATE-NORMALIZATION-PHASE-B: convert the modal's
      // full-state-name selection to canonical 2-letter codes before sending
      // to create-provider, so doctor_profiles.licensed_states and
      // doctor_contacts.licensed_states are stored as codes only.
      const licensedStateCodes = Array.from(new Set(
        selectedStates
          .map((n) => normalizeStateToCode(n))
          .filter((c): c is string => !!c)
      ));
      // Uses create-provider — the provider-specific endpoint.
      // This endpoint NEVER touches team-member creation logic.
      const res = await fetch(`${supabaseUrl}/functions/v1/create-provider`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          title: form.title.trim() || null,
          phone: form.phone.trim() || null,
          licensed_states: licensedStateCodes,
          bio: form.bio.trim() || null,
          per_order_rate: (rateValue != null && !isNaN(rateValue) && rateValue >= 0) ? rateValue : null,
          license_number: form.license_number.trim() || null,
        }),
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "Failed to add provider. Please try again.");

      onCreated({ full_name: form.full_name, email: form.email });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to add provider. Please try again.");
    }
    setSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest mb-0.5">Admin Action</p>
            <h2 className="text-lg font-extrabold text-gray-900">Add Provider to Panel</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer transition-colors"
          >
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        {/* Step indicator */}
        <div className="px-6 pt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${step === 1 ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-500"}`}
          >
            <i className="ri-user-line"></i> Provider Info
          </button>
          <i className="ri-arrow-right-s-line text-gray-300"></i>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${step === 2 ? "bg-[#3b6ea5] text-white" : "bg-gray-100 text-gray-500"}`}
          >
            <i className="ri-map-pin-line"></i> Licensed States
            {selectedStates.length > 0 && (
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-extrabold ${step === 2 ? "bg-white/20 text-white" : "bg-[#3b6ea5] text-white"}`}
              >
                {selectedStates.length}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 max-h-[440px] overflow-y-auto">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                Add this provider to the panel and create their Supabase account in one step. They&apos;ll receive a branded welcome email with a link to confirm their account and set a password.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="Dr. Jane Smith"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Title / Credentials</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="PhD, LCSW, MD..."
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">License Number</label>
                  <input
                    type="text"
                    value={form.license_number}
                    onChange={(e) => setForm((f) => ({ ...f, license_number: e.target.value }))}
                    placeholder="LIC-000000"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Email Address *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="provider@example.com"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Phone</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="+1 (555) 000-0000"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">
                    Rate Per Completed Case
                    <span className="text-gray-400 font-normal ml-1">(optional)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      value={form.per_order_rate}
                      onChange={(e) => setForm((f) => ({ ...f, per_order_rate: e.target.value }))}
                      placeholder="e.g. 30"
                      className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Payout amount per completed ESA case</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Short Bio</label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    placeholder="Brief professional summary shown to customers..."
                    rows={3}
                    maxLength={500}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                Select the states this provider is licensed to practice in. The auto-assignment engine uses this to route orders from GHL.
              </p>
              <div className="relative mb-3">
                <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                <input
                  type="text"
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value)}
                  placeholder="Filter states..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                />
              </div>
              <div className="grid grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
                {filteredStates.map((s) => {
                  const checked = selectedStates.includes(s.name);
                  return (
                    <label
                      key={s.name}
                      onClick={() => toggleState(s.name)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs font-medium select-none ${
                        checked
                          ? "bg-[#e8f5f1] text-[#3b6ea5] border border-[#b8cce4]"
                          : "bg-gray-50 text-gray-500 border border-gray-100 hover:bg-gray-100"
                      }`}
                    >
                      <div
                        className={`w-3.5 h-3.5 flex items-center justify-center rounded flex-shrink-0 ${checked ? "bg-[#3b6ea5]" : "border border-gray-300"}`}
                      >
                        {checked && <i className="ri-check-line text-white" style={{ fontSize: "9px" }}></i>}
                      </div>
                      <span className="font-bold">{s.abbr}</span>
                      <span className="text-gray-400 truncate">{s.name.split(" ")[0]}</span>
                    </label>
                  );
                })}
              </div>
              {selectedStates.length > 0 && (
                <div className="mt-3 p-2 bg-[#e8f0f9] rounded-lg">
                  <p className="text-xs font-bold text-[#3b6ea5] mb-1">
                    {selectedStates.length} state{selectedStates.length !== 1 ? "s" : ""} selected
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {selectedStates.map((name) => (
                      <span
                        key={name}
                        onClick={() => toggleState(name)}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-[#3b6ea5] text-white rounded text-xs cursor-pointer hover:bg-[#2d5a8e]"
                      >
                        {US_STATES.find((s) => s.name === name)?.abbr}
                        <i className="ri-close-line" style={{ fontSize: "9px" }}></i>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mb-3 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
            <i className="ri-error-warning-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                <i className="ri-arrow-left-s-line"></i> Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer"
              >
                Next: Licensed States <i className="ri-arrow-right-s-line"></i>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer"
              >
                {submitting ? (
                  <><i className="ri-loader-4-line animate-spin"></i> Saving...</>
                ) : (
                  <><i className="ri-user-add-line"></i> Add to Panel</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
