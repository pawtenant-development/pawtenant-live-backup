// DoctorsTab — Compact provider roster. All detail/edit actions live in ProviderDrawer.
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../lib/supabaseClient";
import CreateDoctorModal from "./CreateDoctorModal";
import EditStatesModal from "./EditStatesModal";
import DeleteProviderModal from "./DeleteProviderModal";
import ProviderApplicationModal from "./ProviderApplicationModal";
import ProviderDrawer from "./ProviderDrawer";
import { canDelete, ADMIN_REQUIRED_LABEL } from "../../../lib/adminPermissions";
import { US_STATES, normalizeStateToCode } from "../../../lib/usStates";

type AvailabilityStatus = "active" | "at_capacity" | "inactive";

interface DoctorProfile {
  id: string; user_id: string; full_name: string; title: string | null;
  email: string | null; phone: string | null; license_number: string | null;
  bio: string | null; is_admin: boolean; is_active: boolean;
  availability_status: AvailabilityStatus | null;
  licensed_states: string[] | null; per_order_rate: number | null;
  role: string | null; created_at: string; photo_url?: string;
  lifecycle_status?: string | null;
  is_published?: boolean | null;
}
interface DoctorContact {
  id: string; full_name: string; email: string; phone: string | null;
  notes: string | null; licensed_states: string[] | null; is_active: boolean;
  availability_status: AvailabilityStatus | null;
  per_order_rate: number | null; photo_url?: string;
}
interface WorkloadStats { active: number; completed: number; }
interface DoctorRow {
  profile: DoctorProfile | null; contact: DoctorContact | null;
  email: string; name: string; workload: WorkloadStats;
}
interface PendingApplication {
  id: string; first_name: string; last_name: string; email: string;
  phone: string | null; license_types: string | null; license_number: string | null;
  license_state: string | null; additional_states: string | null;
  years_experience: string | null; practice_name: string | null;
  practice_type: string | null; specializations: string | null;
  monthly_capacity: string | null; esa_experience: string | null;
  telehealth_ready: string | null; profile_url: string | null; bio: string | null;
  headshot_url: string | null; documents_urls: string[] | null;
  status: string; created_at: string;
}

const NON_PROVIDER_ROLES = new Set(["owner", "admin_manager", "support", "finance", "read_only"]);

// Phase 3 Step 1 — read-only badge mapping for lifecycle_status. No behavior, display only.
const LIFECYCLE_BADGE: Record<string, { label: string; cls: string }> = {
  active:         { label: "Active",         cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  approved:       { label: "Approved",       cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending_setup:  { label: "Pending Setup",  cls: "bg-amber-50 text-amber-700 border-amber-200" },
  inactive:       { label: "Inactive",       cls: "bg-gray-100 text-gray-500 border-gray-200" },
  paused:         { label: "Paused",         cls: "bg-gray-100 text-gray-500 border-gray-200" },
};
const lifecycleBadge = (raw: string | null | undefined) => {
  if (!raw) return null;
  const key = raw.toLowerCase();
  return LIFECYCLE_BADGE[key] ?? { label: raw, cls: "bg-gray-100 text-gray-500 border-gray-200" };
};

export default function DoctorsTab({ onProviderAdded }: { onProviderAdded?: () => void }) {
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState("");
  const [createMsg, setCreateMsg] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [statesModalDoc, setStatesModalDoc] = useState<DoctorRow | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DoctorRow | null>(null);
  const [pendingApps, setPendingApps] = useState<PendingApplication[]>([]);
  const [reviewingApp, setReviewingApp] = useState<PendingApplication | null>(null);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [pendingSetupIds, setPendingSetupIds] = useState<Set<string>>(new Set());
  const [selectedDoc, setSelectedDoc] = useState<DoctorRow | null>(null);
  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  const [publishingEmail, setPublishingEmail] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState<string | null>(null);
  const canDeleteProviders = canDelete(currentRole);

  // ── Filter / search state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "at_capacity" | "inactive">("all");
  const [filterState, setFilterState] = useState<string>("all");

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const showToast = (msg: string) => { setSavedMsg(msg); setTimeout(() => setSavedMsg(""), 6000); };

  const loadPendingApps = async () => {
    const { data } = await supabase.from("provider_applications").select("*").eq("status", "pending").order("created_at", { ascending: false });
    setPendingApps((data as PendingApplication[]) ?? []);
  };

  const loadData = async () => {
    setLoading(true);
    const [profilesRes, contactsRes, ordersRes] = await Promise.all([
      supabase.from("doctor_profiles").select("*").order("full_name"),
      supabase.from("doctor_contacts").select("id, full_name, email, phone, notes, licensed_states, is_active, photo_url, per_order_rate").order("full_name"),
      supabase.from("orders").select("doctor_email, doctor_user_id, status").not("doctor_email", "is", null),
    ]);
    const allProfiles = (profilesRes.data as DoctorProfile[]) ?? [];
    const profiles = allProfiles.filter((p) => !NON_PROVIDER_ROLES.has(p.role ?? ""));
    const contacts = (contactsRes.data as DoctorContact[]) ?? [];
    const orders = (ordersRes.data as { doctor_email: string | null; doctor_user_id: string | null; status: string }[]) ?? [];

    const workloadMap = new Map<string, WorkloadStats>();
    orders.forEach((o) => {
      const key = (o.doctor_email ?? "").toLowerCase();
      if (!key) return;
      const existing = workloadMap.get(key) ?? { active: 0, completed: 0 };
      if (o.status === "completed" || o.status === "cancelled") { existing.completed += 1; } else { existing.active += 1; }
      workloadMap.set(key, existing);
    });

    const allEmails = new Set([...profiles.map((p) => (p.email ?? "").toLowerCase()), ...contacts.map((c) => c.email.toLowerCase())]);
    const merged: DoctorRow[] = [];
    allEmails.forEach((email) => {
      if (!email) return;
      const profile = profiles.find((p) => (p.email ?? "").toLowerCase() === email) ?? null;
      const contact = contacts.find((c) => c.email.toLowerCase() === email) ?? null;
      // Skip entries that have no profile AND contact is inactive — these are removed providers
      if (!profile && contact && contact.is_active === false) return;
      merged.push({ profile, contact, email, name: profile?.full_name ?? contact?.full_name ?? email, workload: workloadMap.get(email) ?? { active: 0, completed: 0 } });
    });
    merged.sort((a, b) => a.name.localeCompare(b.name));
    setDoctors(merged);
    setLoading(false);

    const profileUserIds = profiles.map((p) => p.user_id).filter(Boolean);
    if (profileUserIds.length > 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        const res = await fetch(`${supabaseUrl}/functions/v1/check-pending-setups`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ user_ids: profileUserIds }),
        });
        const result = await res.json() as { ok: boolean; pending_ids?: string[] };
        if (result.ok && result.pending_ids) setPendingSetupIds(new Set(result.pending_ids));
      } catch { /* silently fail */ }
    }
  };

  useEffect(() => {
    loadData();
    loadPendingApps();
    // Capture the current user's role so destructive actions can be gated.
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from("doctor_profiles").select("role").eq("user_id", user.id).maybeSingle()
        .then(({ data }) => {
          const r = (data as { role: string | null } | null)?.role ?? null;
          setCurrentRole(r);
        });
    });
  }, []);

  // Sync selectedDoc state after data refresh so drawer shows updated info
  const handleRefresh = async () => {
    setLoading(true);
    const [profilesRes, contactsRes, ordersRes] = await Promise.all([
      supabase.from("doctor_profiles").select("*").order("full_name"),
      supabase.from("doctor_contacts").select("id, full_name, email, phone, notes, licensed_states, is_active, photo_url, per_order_rate").order("full_name"),
      supabase.from("orders").select("doctor_email, doctor_user_id, status").not("doctor_email", "is", null),
    ]);
    const allProfiles = (profilesRes.data as DoctorProfile[]) ?? [];
    const profiles = allProfiles.filter((p) => !NON_PROVIDER_ROLES.has(p.role ?? ""));
    const contacts = (contactsRes.data as DoctorContact[]) ?? [];
    const orders = (ordersRes.data as { doctor_email: string | null; doctor_user_id: string | null; status: string }[]) ?? [];

    const workloadMap = new Map<string, WorkloadStats>();
    orders.forEach((o) => {
      const key = (o.doctor_email ?? "").toLowerCase();
      if (!key) return;
      const existing = workloadMap.get(key) ?? { active: 0, completed: 0 };
      if (o.status === "completed" || o.status === "cancelled") { existing.completed += 1; } else { existing.active += 1; }
      workloadMap.set(key, existing);
    });

    const allEmails = new Set([...profiles.map((p) => (p.email ?? "").toLowerCase()), ...contacts.map((c) => c.email.toLowerCase())]);
    const merged: DoctorRow[] = [];
    allEmails.forEach((email) => {
      if (!email) return;
      const profile = profiles.find((p) => (p.email ?? "").toLowerCase() === email) ?? null;
      const contact = contacts.find((c) => c.email.toLowerCase() === email) ?? null;
      if (!profile && contact && contact.is_active === false) return;
      merged.push({ profile, contact, email, name: profile?.full_name ?? contact?.full_name ?? email, workload: workloadMap.get(email) ?? { active: 0, completed: 0 } });
    });
    merged.sort((a, b) => a.name.localeCompare(b.name));
    setDoctors(merged);
    setLoading(false);

    // Re-sync the open drawer with fresh data
    if (selectedDoc) {
      const freshDoc = merged.find((d) => d.email === selectedDoc.email);
      if (freshDoc) setSelectedDoc(freshDoc);
    }
  };

  // Phase 4 — Availability toggle controls ASSIGNMENT ONLY.
  // Public website visibility lives on the publish toggle (handlePublishToggle).
  // Therefore this no longer writes to approved_providers.is_active.
  const handleQuickToggle = async (doc: DoctorRow) => {
    setTogglingEmail(doc.email);
    // Derive from the same visible state the UI renders (availability_status first, is_active fallback)
    // so the toggle always flips from what the admin actually sees.
    const currentAvail: AvailabilityStatus = (doc.profile?.availability_status ?? doc.contact?.availability_status ?? (doc.profile?.is_active !== false ? "active" : "inactive")) as AvailabilityStatus;
    const newActive = currentAvail === "inactive";
    const newAvailability: AvailabilityStatus = newActive ? "active" : "inactive";
    const updates: Promise<{ error: { message: string } | null }>[] = [];
    if (doc.profile) updates.push(supabase.from("doctor_profiles").update({ is_active: newActive, availability_status: newAvailability }).eq("id", doc.profile.id));
    if (doc.contact) updates.push(supabase.from("doctor_contacts").update({ is_active: newActive, availability_status: newAvailability }).eq("id", doc.contact.id));
    const results = await Promise.all(updates);
    setTogglingEmail(null);
    const anyErr = results.find((r) => r.error);
    if (anyErr?.error) { showToast(`Update failed: ${anyErr.error.message}`); return; }
    showToast(newActive ? `${doc.name} reactivated for assignment.` : `${doc.name} paused — no new cases will be assigned.`);
    loadData();
  };

  // Phase 4 Step 2 — Publish/Unpublish control. Writes doctor_profiles.is_published
  // and mirrors to approved_providers.is_active so the homepage stays in sync until
  // the homepage query is migrated to is_published (a later step).
  const handlePublishToggle = async (doc: DoctorRow) => {
    if (!doc.profile) return;
    setPublishingEmail(doc.email);
    const newPublished = !(doc.profile.is_published === true);
    const updates: Promise<{ error: { message: string } | null }>[] = [
      supabase.from("doctor_profiles").update({ is_published: newPublished }).eq("id", doc.profile.id),
      supabase.from("approved_providers").update({ is_active: newPublished }).eq("email", doc.email),
    ];
    const results = await Promise.all(updates);
    setPublishingEmail(null);
    const anyErr = results.find((r) => r.error);
    if (anyErr?.error) { showToast(`Publish update failed: ${anyErr.error.message}`); return; }
    showToast(newPublished ? `${doc.name} published — now visible on website.` : `${doc.name} unpublished — hidden from website.`);
    loadData();
  };

  const handleDeleteProvider = async (doc: DoctorRow) => {
    if (!canDelete(currentRole)) {
      showToast(ADMIN_REQUIRED_LABEL);
      setDeleteDoc(null);
      return;
    }
    const deletes: Promise<{ error: { message: string } | null }>[] = [];
    if (doc.profile) deletes.push(supabase.from("doctor_profiles").delete().eq("id", doc.profile.id));
    if (doc.contact) deletes.push(supabase.from("doctor_contacts").delete().eq("id", doc.contact.id));
    deletes.push(supabase.from("approved_providers").update({ is_active: false }).eq("email", doc.email));
    const results = await Promise.all(deletes);
    const anyErr = results.find((r) => r.error);
    setDeleteDoc(null);
    setSelectedDoc(null);
    if (anyErr?.error) { showToast(`Delete failed: ${anyErr.error.message}`); return; }
    if (doc.profile?.user_id) {
      try {
        const { data: { session } } = await supabase.auth.refreshSession();
        const token = session?.access_token ?? "";
        await fetch(`${supabaseUrl}/functions/v1/delete-auth-user`, {
          method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ userId: doc.profile.user_id, entityType: "provider", entityName: `${doc.name} (${doc.email})`, reason: "Provider permanently deleted by admin." }),
        });
      } catch { /* non-critical */ }
    }
    showToast(`${doc.name} permanently deleted. Past order records preserved.`);
    loadData();
  };

  const handleExportCSV = () => {
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const headers = [
      "Name","Email","Phone","Title","NPI Number","State License Numbers",
      "Rate ($/order)","Licensed States","State Count",
      "Active Cases","Completed Cases","Status","Portal","Member Since"
    ];
    const rows = doctors.map((doc) => {
      const states = doc.contact?.licensed_states ?? doc.profile?.licensed_states ?? [];
      const isActive = doc.profile ? doc.profile.is_active !== false : doc.contact?.is_active !== false;
      const rate = doc.profile?.per_order_rate ?? doc.contact?.per_order_rate ?? null;
      const npi = (doc.profile as unknown as { npi_number?: string | null })?.npi_number ?? "";
      const stateLicenses = (doc.profile as unknown as { state_license_numbers?: Record<string, string> | null })?.state_license_numbers ?? {};
      const stateLicensesStr = Object.entries(stateLicenses).map(([s, l]) => `${s}:${l}`).join(" | ");
      return [
        doc.name, doc.email,
        doc.contact?.phone ?? doc.profile?.phone ?? "",
        doc.profile?.title ?? "",
        npi,
        stateLicensesStr,
        rate != null ? String(rate) : "",
        states.join("; "),
        String(states.length),
        String(doc.workload.active),
        String(doc.workload.completed),
        isActive ? "Active" : "Inactive",
        doc.profile ? "Portal Account" : "No Portal",
        doc.profile?.created_at ? new Date(doc.profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
      ].map(esc).join(",");
    });
    const csv = [headers.map(esc).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `providers-npi-licenses-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Derived: available states for filter dropdown ──
  const allStatesInRoster = Array.from(
    new Set(doctors.flatMap((d) => d.contact?.licensed_states ?? d.profile?.licensed_states ?? []))
  ).sort();

  // ── Derived: missing-state coverage banner ──
  // A state counts as covered iff at least one provider:
  //   - has the state in its licensed_states (full name or 2-letter abbr)
  //   - is NOT inactive (availability_status !== "inactive"; "active" and
  //     "at_capacity" both count)
  //   - is NOT deactivated (profile.is_active and contact.is_active are not
  //     explicitly false on whichever rows exist)
  // Computed dynamically from the live roster against the canonical 51-state
  // list (50 states + DC) — never hardcoded.
  const missingStates = useMemo(() => {
    const covered = new Set<string>();
    for (const doc of doctors) {
      const profile = doc.profile;
      const contact = doc.contact;

      const profileActive = profile ? profile.is_active !== false : true;
      const contactActive = contact ? contact.is_active !== false : true;
      const availStatus: AvailabilityStatus = (
        profile?.availability_status
          ?? contact?.availability_status
          ?? (profile?.is_active !== false ? "active" : "inactive")
      ) as AvailabilityStatus;

      const isCovering = profileActive && contactActive && availStatus !== "inactive";
      if (!isCovering) continue;

      // Combine licensed states from both profile and contact rows so we never
      // miss a state that's only listed on one of the two records.
      const states = [
        ...(profile?.licensed_states ?? []),
        ...(contact?.licensed_states ?? []),
      ];
      for (const raw of states) {
        const code = normalizeStateToCode(raw);
        if (code) covered.add(code);
      }
    }
    return US_STATES.filter((s) => !covered.has(s.code));
  }, [doctors]);

  // ── Filtered list ──
  const filteredDoctors = doctors.filter((doc) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = !q || doc.name.toLowerCase().includes(q) || doc.email.toLowerCase().includes(q);
    const availStatus: AvailabilityStatus = (doc.profile?.availability_status ?? doc.contact?.availability_status ?? (doc.profile?.is_active !== false ? "active" : "inactive")) as AvailabilityStatus;
    const matchesStatus =
      filterStatus === "all" ||
      filterStatus === availStatus ||
      (filterStatus === "active" && availStatus === "active") ||
      (filterStatus === "at_capacity" && availStatus === "at_capacity") ||
      (filterStatus === "inactive" && availStatus === "inactive");
    const states = doc.contact?.licensed_states ?? doc.profile?.licensed_states ?? [];
    const matchesState = filterState === "all" || states.includes(filterState);
    return matchesSearch && matchesStatus && matchesState;
  });

  return (
    <div>
      {/* ── Pending Applications ── */}
      {pendingApps.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <button type="button" onClick={() => setPendingExpanded((v) => !v)}
            className="whitespace-nowrap w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-amber-100/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-amber-500 rounded-xl">
                <i className="ri-time-line text-white text-sm"></i>
              </div>
              <div className="text-left">
                <p className="text-sm font-extrabold text-amber-900">Pending Provider Applications</p>
                <p className="text-xs text-amber-700">Review and approve to add them to the network</p>
              </div>
              <span className="px-2.5 py-1 bg-amber-500 text-white text-xs font-extrabold rounded-full">{pendingApps.length}</span>
            </div>
            <div className="w-5 h-5 flex items-center justify-center text-amber-700 flex-shrink-0">
              {pendingExpanded ? <i className="ri-arrow-up-s-line text-lg"></i> : <i className="ri-arrow-down-s-line text-lg"></i>}
            </div>
          </button>
          {pendingExpanded && (
            <div className="border-t border-amber-200 divide-y divide-amber-100">
              {pendingApps.map((app) => (
                <div key={app.id} className="flex items-center gap-4 px-5 py-4 bg-white/60">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-200 flex-shrink-0 bg-amber-100 flex items-center justify-center">
                    {app.headshot_url ? <img src={app.headshot_url} alt={app.first_name} className="w-full h-full object-cover object-top" />
                      : <span className="text-xs font-extrabold text-amber-700">{app.first_name[0]}{app.last_name[0]}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{app.first_name} {app.last_name}</p>
                    <p className="text-xs text-gray-500 truncate">{app.email}</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {app.license_types && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{app.license_types.split(",")[0]?.trim()}</span>}
                      {app.license_state && <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{app.license_state}</span>}
                      <span className="text-xs text-gray-400">{new Date(app.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                    </div>
                  </div>
                  <button type="button" onClick={() => setReviewingApp(app)}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-xl hover:bg-[#2d5a8e] cursor-pointer transition-colors flex-shrink-0">
                    <i className="ri-search-eye-line"></i>Review
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Stats ── */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Providers", value: doctors.length, icon: "ri-stethoscope-line", color: "text-gray-700" },
            { label: "Active", value: doctors.filter((d) => d.profile ? d.profile.is_active !== false : d.contact?.is_active !== false).length, icon: "ri-checkbox-circle-line", color: "text-emerald-600" },
            { label: "Active Cases", value: doctors.reduce((s, d) => s + d.workload.active, 0), icon: "ri-folder-open-line", color: "text-sky-600" },
            { label: "Completed Cases", value: doctors.reduce((s, d) => s + d.workload.completed, 0), icon: "ri-award-line", color: "text-[#3b6ea5]" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 flex items-center justify-center"><i className={`${s.icon} ${s.color} text-base`}></i></div>
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {(savedMsg || createMsg) && (
        <div className="mb-4 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-center gap-3">
          <i className="ri-checkbox-circle-fill text-[#3b6ea5] text-base flex-shrink-0"></i>
          <p className="text-sm text-[#3b6ea5] font-semibold">{savedMsg || createMsg}</p>
        </div>
      )}

      {/* ── State Coverage Banner ── */}
      {!loading && doctors.length > 0 && (
        missingStates.length === 0 ? (
          <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <i className="ri-shield-check-fill text-emerald-600 text-base mt-0.5 flex-shrink-0"></i>
            <div>
              <p className="text-sm font-extrabold text-emerald-900">
                Full coverage — all 50 states + DC have an active provider.
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Every U.S. state has at least one active (or at-capacity) licensed provider.
              </p>
            </div>
          </div>
        ) : (
          <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-start gap-3">
              <i className="ri-error-warning-fill text-amber-600 text-base mt-0.5 flex-shrink-0"></i>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold text-amber-900">
                  No active provider in {missingStates.length} {missingStates.length === 1 ? "state" : "states"}
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Deactivated providers and providers marked inactive are not counted. At-capacity providers DO count.
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {missingStates.map((s) => (
                    <span
                      key={s.code}
                      title={s.code}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-amber-300 text-amber-900 text-xs font-semibold rounded-full"
                    >
                      {s.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-extrabold text-gray-900">Provider Roster</h2>
          <p className="text-xs text-gray-500 mt-0.5">Providers are added via application approval. Click &quot;Manage&quot; to view details.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleExportCSV} disabled={doctors.length === 0}
            title="Export provider roster with NPI numbers and state license numbers"
            className="whitespace-nowrap flex items-center gap-2 px-3 py-2 border border-[#3b6ea5] text-[#3b6ea5] bg-[#e8f0f9] text-sm font-bold rounded-xl hover:bg-[#dbeafe] disabled:opacity-50 cursor-pointer transition-colors">
            <i className="ri-download-2-line"></i><span className="hidden sm:inline">Export NPI + Licenses</span>
          </button>
        </div>
      </div>

      {/* ── Filter Bar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-4">
        <div className="relative flex-1">
          <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#3b6ea5]"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery("")} className="whitespace-nowrap absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer text-gray-400 hover:text-gray-600">
              <i className="ri-close-line text-sm"></i>
            </button>
          )}
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as "all" | "active" | "at_capacity" | "inactive")}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#3b6ea5] cursor-pointer text-gray-700"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active only</option>
          <option value="at_capacity">At Capacity only</option>
          <option value="inactive">Inactive only</option>
        </select>
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:border-[#3b6ea5] cursor-pointer text-gray-700"
        >
          <option value="all">All States</option>
          {allStatesInRoster.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(searchQuery || filterStatus !== "all" || filterState !== "all") && (
          <button
            type="button"
            onClick={() => { setSearchQuery(""); setFilterStatus("all"); setFilterState("all"); }}
            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors"
          >
            <i className="ri-filter-off-line"></i>Clear filters
          </button>
        )}
      </div>

      {/* ── Provider List ── */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5]"></i>
        </div>
      ) : doctors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-bold text-gray-700">No providers found</p>
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <i className="ri-search-line text-2xl text-gray-300 mb-2 block"></i>
          <p className="text-sm font-bold text-gray-700">No providers match your filters</p>
          <button type="button" onClick={() => { setSearchQuery(""); setFilterStatus("all"); setFilterState("all"); }}
            className="whitespace-nowrap mt-3 text-xs font-bold text-[#3b6ea5] hover:underline cursor-pointer">Clear filters</button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredDoctors.map((doc) => {
            const states = doc.contact?.licensed_states ?? doc.profile?.licensed_states ?? [];
            const initials = doc.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
            const availStatus: AvailabilityStatus = (doc.profile?.availability_status ?? doc.contact?.availability_status ?? (doc.profile?.is_active !== false ? "active" : "inactive")) as AvailabilityStatus;
            const isActive = availStatus !== "inactive";
            const isContactOnly = !doc.profile && !!doc.contact;
            const isPendingSetup = !!doc.profile && pendingSetupIds.has(doc.profile.user_id);
            const isToggling = togglingEmail === doc.email;
            const isPublishing = publishingEmail === doc.email;
            const currentRate = doc.profile?.per_order_rate ?? doc.contact?.per_order_rate ?? null;
            const isSelected = selectedDoc?.email === doc.email;
            const photoUrl = doc.profile?.photo_url ?? doc.contact?.photo_url ?? "";
            // Phase 3 Step 1 — read-only Phase 2 column display
            const lifecycle = lifecycleBadge(doc.profile?.lifecycle_status);
            const showPublishBadge = !!doc.profile;
            const isPublished = doc.profile?.is_published === true;

            return (
              <div key={doc.email} className={`bg-white rounded-xl border transition-colors ${isSelected ? "border-[#3b6ea5] ring-1 ring-[#3b6ea5]/20" : "border-gray-200 hover:border-gray-300"}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Avatar */}
                  <div className={`w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 overflow-hidden ${isActive ? "bg-[#e8f0f9]" : "bg-gray-100"}`}>
                    {photoUrl ? (
                      <img src={photoUrl} alt={doc.name} className="w-full h-full object-cover object-top" />
                    ) : (
                      <span className={`text-xs font-extrabold ${isActive ? "text-[#3b6ea5]" : "text-gray-400"}`}>{initials}</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{doc.name}</p>
                      {doc.profile?.title && <span className="text-xs text-gray-400 hidden sm:inline">{doc.profile.title}</span>}
                      {availStatus === "inactive" && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded">Inactive</span>}
                      {availStatus === "at_capacity" && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded hidden sm:inline">At Capacity</span>}
                      {isPendingSetup && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded hidden sm:inline">Pending setup</span>}
                      {isContactOnly && <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded hidden sm:inline">No Portal</span>}
                      {lifecycle && (
                        <span
                          title={`lifecycle_status: ${doc.profile?.lifecycle_status ?? ""}`}
                          className={`px-1.5 py-0.5 text-xs font-bold rounded border hidden sm:inline ${lifecycle.cls}`}
                        >
                          {lifecycle.label}
                        </span>
                      )}
                      {showPublishBadge && (
                        <span
                          title={`is_published: ${isPublished ? "true" : "false"}`}
                          className={`px-1.5 py-0.5 text-xs font-bold rounded border hidden sm:inline ${isPublished ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}
                        >
                          {isPublished ? "Published" : "Unpublished"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{doc.email}</p>
                  </div>

                  {/* Compact stats */}
                  <div className="hidden md:flex items-center gap-4 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-sm font-extrabold text-sky-600">{doc.workload.active}</p>
                      <p className="text-xs text-gray-400 leading-none">Active</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-extrabold text-[#3b6ea5]">{doc.workload.completed}</p>
                      <p className="text-xs text-gray-400 leading-none">Done</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-500">{states.length}</p>
                      <p className="text-xs text-gray-400 leading-none">States</p>
                    </div>
                    {currentRate != null && (
                      <span className="px-2 py-1 bg-[#e8f0f9] border border-[#b8cce4] text-[#3b6ea5] text-xs font-bold rounded-lg">${currentRate}/order</span>
                    )}
                  </div>

                  {/* Availability toggle — controls assignment only */}
                  <button type="button" onClick={() => handleQuickToggle(doc)} disabled={isToggling}
                    title={isActive ? "Deactivate (pause assignments)" : "Activate (resume assignments)"}
                    className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ${isActive ? "bg-[#3b6ea5]" : "bg-gray-300"}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${isActive ? "translate-x-4" : "translate-x-0.5"}`}></div>
                  </button>

                  {/* Publish toggle — controls public website visibility (only for providers with a profile) */}
                  {doc.profile && (
                    <button type="button" onClick={() => handlePublishToggle(doc)} disabled={isPublishing}
                      title={isPublished ? "Unpublish (hide from website)" : "Publish (show on website)"}
                      className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ${isPublished ? "bg-emerald-500" : "bg-gray-300"}`}>
                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${isPublished ? "translate-x-4" : "translate-x-0.5"}`}></div>
                    </button>
                  )}

                  {/* Manage button */}
                  <button type="button" onClick={() => setSelectedDoc(isSelected ? null : doc)}
                    className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border cursor-pointer transition-colors flex-shrink-0 ${isSelected ? "bg-[#3b6ea5] border-[#3b6ea5] text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300"}`}>
                    <i className="ri-settings-3-line text-sm"></i>
                    <span className="hidden sm:inline">Manage</span>
                    <i className="ri-arrow-right-s-line text-xs"></i>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modals ── */}
      {showCreate && (
        <CreateDoctorModal onClose={() => setShowCreate(false)}
          onCreated={(result) => {
            setShowCreate(false);
            setCreateMsg(`${result.full_name} (${result.email}) — provider added successfully.`);
            setTimeout(() => setCreateMsg(""), 7000);
            loadData(); onProviderAdded?.();
          }} />
      )}
      {statesModalDoc && (
        <EditStatesModal
          doctor={{ profileId: statesModalDoc.profile?.id, contactId: statesModalDoc.contact?.id, name: statesModalDoc.name, email: statesModalDoc.email, currentStates: statesModalDoc.contact?.licensed_states ?? statesModalDoc.profile?.licensed_states ?? [] }}
          onClose={() => setStatesModalDoc(null)}
          onSaved={(name, count) => { setStatesModalDoc(null); showToast(`${name} — ${count} licensed states saved`); loadData(); }} />
      )}
      {deleteDoc && (
        <DeleteProviderModal providerName={deleteDoc.name} providerEmail={deleteDoc.email} activeCases={deleteDoc.workload.active}
          onConfirm={() => handleDeleteProvider(deleteDoc)} onClose={() => setDeleteDoc(null)} />
      )}
      {reviewingApp && (
        <ProviderApplicationModal application={reviewingApp} onClose={() => setReviewingApp(null)}
          onDone={(msg) => { setReviewingApp(null); showToast(msg); loadData(); loadPendingApps(); onProviderAdded?.(); }} />
      )}

      {/* ── Provider Drawer ── */}
      <ProviderDrawer
        doc={selectedDoc}
        pendingSetupIds={pendingSetupIds}
        onClose={() => setSelectedDoc(null)}
        onRefresh={handleRefresh}
        onOpenStates={(doc) => { setStatesModalDoc(doc); }}
        onDelete={(doc) => setDeleteDoc(doc)}
        canDeleteProviders={canDeleteProviders}
      />
    </div>
  );
}
