// ProviderProfilePanel — Phase 1 Provider Portal Profile + License Review
// (OPS-PROVIDER-PORTAL-PROFILE-LICENSE-REVIEW-PHASE1).
//
// What changed:
//   • Loads additional existing doctor_profiles columns (phone, npi_number,
//     bio, licensed_states, state_license_numbers, lifecycle_status,
//     is_published, is_active, onboarded_at, application_id, created_at).
//   • If application_id is present, loads display-safe provider_applications
//     fields (id, created_at, status) — no attribution fields are read.
//   • Renders ProviderProfileChecklist (read-only completion banner).
//   • Renders ProviderApplicationSnapshotCard (read-only "copied from your
//     application" snapshot).
//   • Renders a read-only public profile preview.
//   • Preserves the existing bio edit (the only edit allowed in this phase).
//
// No DB writes other than the existing bio edit. No headshot upload, no
// admin-review queue, no public-profile consent toggle, no schema changes.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { normalizeStateListForDisplay } from "../../../lib/usStates";
import ProviderProfileChecklist from "./ProviderProfileChecklist";
import ProviderApplicationSnapshotCard from "./ProviderApplicationSnapshotCard";

interface Props {
  userId: string;
  providerName: string;
}

interface ProfileData {
  user_id: string;
  full_name: string;
  title: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  npi_number: string | null;
  licensed_states: string[] | null;
  state_license_numbers: Record<string, string> | null;
  lifecycle_status: string | null;
  is_published: boolean | null;
  is_active: boolean;
  onboarded_at: string | null;
  application_id: string | null;
  created_at: string | null;
}

interface ApplicationData {
  id: string;
  created_at: string | null;
  status: string | null;
}

export default function ProviderProfilePanel({ userId, providerName }: Props) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("doctor_profiles")
        .select(
          "user_id, full_name, title, bio, email, phone, photo_url, npi_number, " +
          "licensed_states, state_license_numbers, lifecycle_status, is_published, " +
          "is_active, onboarded_at, application_id, created_at"
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;

      if (prof) {
        const typed = prof as ProfileData;
        setData(typed);
        setBio(typed.bio ?? "");

        // Load the linked provider_applications row if present. Display-safe
        // fields only — never select attribution columns.
        if (typed.application_id) {
          const { data: appRow } = await supabase
            .from("provider_applications")
            .select("id, created_at, status")
            .eq("id", typed.application_id)
            .maybeSingle();
          if (!cancelled && appRow) {
            setApplication(appRow as ApplicationData);
          }
        }
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [userId]);

  const handleSave = async () => {
    if (saving) return;
    const trimmed = bio.trim();
    if (trimmed.length > 1000) {
      setError("Bio must be 1000 characters or fewer.");
      return;
    }
    setSaving(true);
    setError("");
    const { error: err } = await supabase
      .from("doctor_profiles")
      .update({ bio: trimmed || null })
      .eq("user_id", userId);
    setSaving(false);
    if (err) {
      setError("Failed to save. Please try again.");
      return;
    }
    setData((prev) => prev ? { ...prev, bio: trimmed || null } : prev);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <i className="ri-loader-4-line animate-spin text-3xl text-[#2c5282]"></i>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
        <p className="text-sm text-gray-500">Could not load your profile.</p>
      </div>
    );
  }

  const initials = providerName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const charCount = bio.length;
  const isOver = charCount > 1000;
  const states = normalizeStateListForDisplay(data.licensed_states ?? []);

  // Pending-review style copy when not published yet.
  const publicStatusLabel = data.is_published === true
    ? "Live on PawTenant.com"
    : "Not published yet — pending admin review";

  const publicStatusBadge = data.is_published === true
    ? "bg-[#e8f0f9] text-[#2c5282] border-[#b8cce4]"
    : "bg-amber-50 text-amber-700 border-amber-200";

  return (
    <div className="max-w-3xl space-y-5">
      {/* Profile completion checklist (Phase 1) */}
      <ProviderProfileChecklist profile={data} />

      {/* Account/application snapshot (Phase 1) */}
      <ProviderApplicationSnapshotCard profile={data} application={application} />

      {/* Public profile preview (Phase 1, read-only) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-[#2c5282] font-bold uppercase tracking-widest">Public profile preview</p>
            <p className="text-sm text-gray-500 mt-0.5">How customers may see your profile on PawTenant.com.</p>
          </div>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${publicStatusBadge}`}>
            <i className={data.is_published === true ? "ri-global-line" : "ri-time-line"}></i>
            {publicStatusLabel}
          </span>
        </div>

        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-[#e8f0f9] border-2 border-[#b8cce4] flex items-center justify-center">
            {data.photo_url ? (
              <img src={data.photo_url} alt={data.full_name} className="w-full h-full object-cover object-top" />
            ) : (
              <span className="text-xl font-extrabold text-[#2c5282]">{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold text-gray-900">{data.full_name}</p>
            {data.title && <p className="text-sm text-[#2c5282] font-semibold">{data.title}</p>}
            {data.bio ? (
              <p className="text-xs text-gray-600 leading-relaxed mt-2 line-clamp-4">{data.bio}</p>
            ) : (
              <p className="text-xs text-gray-400 italic mt-2">No bio yet — add one below.</p>
            )}
            {states.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-3">
                {states.map((s) => (
                  <span
                    key={s.code}
                    className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-600 border border-gray-200 text-[11px] font-bold"
                  >
                    {s.code}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {data.is_published !== true && (
          <p className="text-[11px] text-gray-400 mt-3">
            Your profile becomes visible on PawTenant.com once an admin publishes it. Public-profile preference settings are coming in a later release.
          </p>
        )}
      </div>

      {/* Editable bio (existing Phase 1 edit) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-extrabold text-gray-800">
            Professional Bio
          </label>
          <span className={`text-xs font-semibold ${isOver ? "text-red-500" : "text-gray-400"}`}>
            {charCount}/1000
          </span>
        </div>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          This bio appears on your public profile page once it goes live. Write a brief professional summary (e.g. credentials, specialties, approach).
        </p>
        <textarea
          value={bio}
          onChange={(e) => { setBio(e.target.value); setError(""); setSaved(false); }}
          rows={7}
          placeholder="e.g. I am a Licensed Clinical Social Worker with over 10 years of experience specializing in anxiety, depression, and ESA evaluations..."
          className={`w-full px-4 py-3 border rounded-xl text-sm text-gray-800 focus:outline-none resize-none leading-relaxed ${isOver ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#2c5282]"}`}
        />

        {error && (
          <div className="flex items-center gap-2 mt-2 text-red-600 text-xs">
            <i className="ri-error-warning-line"></i>{error}
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <div>
            {saved && (
              <div className="flex items-center gap-1.5 text-[#2c5282] text-sm font-semibold">
                <i className="ri-checkbox-circle-fill"></i>
                Bio saved successfully
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || isOver}
            className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#2c5282] text-white text-sm font-bold rounded-xl hover:bg-[#1e3a5f] disabled:opacity-50 cursor-pointer transition-colors"
          >
            {saving ? (
              <><i className="ri-loader-4-line animate-spin"></i>Saving...</>
            ) : (
              <><i className="ri-save-line"></i>Save Bio</>
            )}
          </button>
        </div>
      </div>

      {/* Admin-edit note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <i className="ri-information-line text-amber-500 text-base flex-shrink-0 mt-0.5"></i>
        <div>
          <p className="text-xs font-bold text-amber-800">Need other changes?</p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            Headshot upload, public-profile preference, and license review workflow are coming soon. To update your name, title, photo, or NPI today, please contact your PawTenant admin.
          </p>
        </div>
      </div>
    </div>
  );
}
