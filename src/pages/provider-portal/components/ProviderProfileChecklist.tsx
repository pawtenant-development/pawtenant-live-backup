// ProviderProfileChecklist — Phase 1 read-only completion banner.
// Computes provider profile completion from existing doctor_profiles fields plus
// the linked provider_applications row (if any). No DB writes.
import { useMemo } from "react";
import { normalizeLicenseMapForDisplay, normalizeStateListForDisplay } from "../../../lib/usStates";

interface ChecklistProfile {
  user_id: string;
  bio: string | null;
  npi_number: string | null;
  photo_url: string | null;
  licensed_states: string[] | null;
  state_license_numbers: Record<string, string> | null;
  is_active: boolean;
  is_published: boolean | null;
  onboarded_at: string | null;
}

interface Props {
  profile: ChecklistProfile;
}

interface Item {
  key: string;
  label: string;
  done: boolean;
  hint: string;
}

export default function ProviderProfileChecklist({ profile }: Props) {
  const items: Item[] = useMemo(() => {
    const states = normalizeStateListForDisplay(profile.licensed_states ?? []);
    const licenseRows = normalizeLicenseMapForDisplay(profile.state_license_numbers ?? null);
    const stateCodes = new Set(states.map((s) => s.code));
    const licensedCodes = new Set(licenseRows.map((r) => r.code));
    const everyStateHasLicense =
      states.length > 0 && Array.from(stateCodes).every((c) => licensedCodes.has(c));

    return [
      {
        key: "activated",
        label: "Account activated",
        done: !!profile.user_id,
        hint: "Your provider login is set up.",
      },
      {
        key: "npi",
        label: "NPI on file",
        done: !!profile.npi_number && profile.npi_number.trim().length > 0,
        hint: "Add your 10-digit NPI on the My Licenses tab.",
      },
      {
        key: "license_coverage",
        label: "License coverage complete",
        done: everyStateHasLicense,
        hint:
          states.length === 0
            ? "Add at least one licensed state on the My Licenses tab."
            : "Every licensed state needs a license number.",
      },
      {
        key: "bio",
        label: "Bio added",
        done: !!profile.bio && profile.bio.trim().length > 0,
        hint: "Add a short professional bio on the Profile tab.",
      },
      {
        key: "headshot",
        label: "Headshot uploaded",
        done: !!profile.photo_url && profile.photo_url.trim().length > 0,
        hint: "Photo upload coming soon — contact support to update for now.",
      },
      {
        key: "public",
        label: "Public profile status known",
        done: profile.is_published === true || profile.is_published === false,
        hint:
          profile.is_published === true
            ? "Your public profile is live."
            : "Your profile is not published yet — admin will publish after review.",
      },
      {
        key: "active",
        label: "Account active",
        done: profile.is_active === true,
        hint: "Your account is accepting case assignments.",
      },
    ];
  }, [profile]);

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((doneCount / total) * 100);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs text-[#2c5282] font-bold uppercase tracking-widest">Profile completion</p>
          <p className="text-sm font-extrabold text-gray-900 mt-0.5">
            {doneCount} of {total} complete
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-[#2c5282]">{pct}%</p>
        </div>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-[#2c5282] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            <div
              className={`w-5 h-5 flex-shrink-0 flex items-center justify-center rounded-full ${
                item.done ? "bg-[#e8f0f9] text-[#2c5282]" : "bg-gray-100 text-gray-400"
              }`}
            >
              <i
                className={`${
                  item.done ? "ri-checkbox-circle-fill" : "ri-circle-line"
                } text-sm`}
              ></i>
            </div>
            <div className="flex-1 min-w-0">
              <p
                className={`text-xs font-bold ${
                  item.done ? "text-gray-700" : "text-gray-500"
                }`}
              >
                {item.label}
              </p>
              {!item.done && (
                <p className="text-[11px] text-gray-400 leading-relaxed mt-0.5">
                  {item.hint}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
