// ProviderProfilePanel — Provider can update their bio from their portal profile tab
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  userId: string;
  providerName: string;
}

interface ProfileData {
  full_name: string;
  title: string | null;
  bio: string | null;
  email: string | null;
  photo_url: string | null;
}

export default function ProviderProfilePanel({ userId, providerName }: Props) {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: prof } = await supabase
        .from("doctor_profiles")
        .select("full_name, title, bio, email, photo_url")
        .eq("user_id", userId)
        .maybeSingle();
      if (prof) {
        setData(prof as ProfileData);
        setBio((prof as ProfileData).bio ?? "");
      }
      setLoading(false);
    };
    load();
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
        <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
      </div>
    );
  }

  const initials = providerName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const charCount = bio.length;
  const isOver = charCount > 1000;

  return (
    <div className="max-w-2xl space-y-5">
      {/* Profile card */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center gap-4 mb-5">
          <div className="w-16 h-16 rounded-full overflow-hidden flex-shrink-0 bg-[#f0faf7] border-2 border-[#b8ddd5] flex items-center justify-center">
            {data?.photo_url ? (
              <img src={data.photo_url} alt={providerName} className="w-full h-full object-cover object-top" />
            ) : (
              <span className="text-xl font-extrabold text-[#1a5c4f]">{initials}</span>
            )}
          </div>
          <div>
            <p className="text-lg font-extrabold text-gray-900">{data?.full_name ?? providerName}</p>
            {data?.title && <p className="text-sm text-[#1a5c4f] font-semibold">{data.title}</p>}
            {data?.email && <p className="text-xs text-gray-400 mt-0.5">{data.email}</p>}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-extrabold text-gray-800">
              Professional Bio
            </label>
            <span className={`text-xs font-semibold ${isOver ? "text-red-500" : "text-gray-400"}`}>
              {charCount}/1000
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            This bio appears on your public profile page visible to customers. Write a brief professional summary (e.g. credentials, specialties, approach).
          </p>
          <textarea
            value={bio}
            onChange={(e) => { setBio(e.target.value); setError(""); setSaved(false); }}
            rows={7}
            placeholder="e.g. I am a Licensed Clinical Social Worker with over 10 years of experience specializing in anxiety, depression, and ESA evaluations..."
            className={`w-full px-4 py-3 border rounded-xl text-sm text-gray-800 focus:outline-none resize-none leading-relaxed ${isOver ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#1a5c4f]"}`}
          />

          {error && (
            <div className="flex items-center gap-2 mt-2 text-red-600 text-xs">
              <i className="ri-error-warning-line"></i>{error}
            </div>
          )}

          <div className="flex items-center justify-between mt-4">
            <div>
              {saved && (
                <div className="flex items-center gap-1.5 text-[#1a5c4f] text-sm font-semibold">
                  <i className="ri-checkbox-circle-fill"></i>
                  Bio saved successfully
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || isOver}
              className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
            >
              {saving ? (
                <><i className="ri-loader-4-line animate-spin"></i>Saving...</>
              ) : (
                <><i className="ri-save-line"></i>Save Bio</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Info note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <i className="ri-information-line text-amber-500 text-base flex-shrink-0 mt-0.5"></i>
        <div>
          <p className="text-xs font-bold text-amber-800">Public Profile</p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            Your bio and credentials are displayed on the public provider directory and your individual profile page. Keep it professional and accurate. If you need to update your name, title, or photo, please contact your administrator.
          </p>
        </div>
      </div>
    </div>
  );
}