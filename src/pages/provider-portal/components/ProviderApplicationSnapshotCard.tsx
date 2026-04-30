// ProviderApplicationSnapshotCard — Phase 1 read-only snapshot of fields copied
// from the provider application + key account/lifecycle/public-profile state.
// Pulls data already loaded by ProviderProfilePanel and renders it; no DB writes.
import { normalizeStateListForDisplay } from "../../../lib/usStates";

interface SnapshotProfile {
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  npi_number: string | null;
  licensed_states: string[] | null;
  lifecycle_status: string | null;
  is_published: boolean | null;
  is_active: boolean;
  photo_url: string | null;
  bio: string | null;
  onboarded_at: string | null;
}

interface SnapshotApplication {
  id: string;
  created_at: string | null;
  status: string | null;
}

interface Props {
  profile: SnapshotProfile;
  application: SnapshotApplication | null;
}

const LIFECYCLE_LABEL: Record<string, string> = {
  approved: "Approved",
  pending_review: "Pending review",
  in_review: "In review",
  paused: "Paused",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function ProviderApplicationSnapshotCard({ profile, application }: Props) {
  const lifecycleLabel =
    profile.lifecycle_status && LIFECYCLE_LABEL[profile.lifecycle_status]
      ? LIFECYCLE_LABEL[profile.lifecycle_status]
      : profile.lifecycle_status ?? "—";

  const states = normalizeStateListForDisplay(profile.licensed_states ?? []);

  const publicLabel = profile.is_published === true
    ? "Live on PawTenant.com"
    : "Not published yet";

  const publicBadgeClass = profile.is_published === true
    ? "bg-[#e8f0f9] text-[#2c5282] border-[#b8cce4]"
    : "bg-amber-50 text-amber-700 border-amber-200";

  const accountBadgeClass = profile.is_active
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-gray-100 text-gray-500 border-gray-200";

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs text-[#2c5282] font-bold uppercase tracking-widest">Account snapshot</p>
          <p className="text-sm text-gray-500 mt-0.5">Copied from your provider application.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${accountBadgeClass}`}>
            <i className={profile.is_active ? "ri-checkbox-circle-fill" : "ri-pause-circle-line"}></i>
            {profile.is_active ? "Active" : "Inactive"}
          </span>
          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${publicBadgeClass}`}>
            <i className={profile.is_published ? "ri-global-line" : "ri-eye-off-line"}></i>
            {publicLabel}
          </span>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
        <Row label="Full name" value={profile.full_name || "—"} />
        <Row label="Email" value={profile.email ?? "—"} />
        <Row label="Phone" value={profile.phone ?? "—"} />
        <Row label="Title / credential" value={profile.title ?? "—"} />
        <Row label="NPI #" value={profile.npi_number ?? "—"} mono />
        <Row label="Lifecycle status" value={lifecycleLabel} />
        <Row label="Application submitted" value={fmtDate(application?.created_at ?? null)} />
        <Row label="Onboarded" value={fmtDate(profile.onboarded_at)} />
      </dl>

      {states.length > 0 && (
        <div className="border-t border-gray-100 pt-3 mb-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Licensed states</p>
          <div className="flex flex-wrap gap-1.5">
            {states.map((s) => (
              <span
                key={s.code}
                title={s.rawValues.length > 1 ? `Stored as: ${s.rawValues.join(", ")}` : s.label}
                className="px-2.5 py-1 rounded-full bg-[#e8f0f9] text-[#2c5282] border border-[#b8cce4] text-xs font-bold"
              >
                {s.code}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
        <i className="ri-information-line text-amber-500 text-base flex-shrink-0 mt-0.5"></i>
        <p className="text-xs text-amber-800 leading-relaxed">
          These details were copied from your provider application. Contact PawTenant support if something looks incorrect — name, title, NPI, and email changes are admin-only for now.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs text-gray-400 flex-shrink-0">{label}</dt>
      <dd className={`text-xs font-semibold text-gray-700 text-right break-all ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
