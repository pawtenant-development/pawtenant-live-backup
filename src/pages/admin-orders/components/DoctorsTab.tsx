// DoctorsTab — Full doctor management with workload visibility
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import CreateDoctorModal from "./CreateDoctorModal";
import EditStatesModal from "./EditStatesModal";
import DeleteProviderModal from "./DeleteProviderModal";
import ProviderApplicationModal from "./ProviderApplicationModal";

interface DoctorProfile {
  id: string;
  user_id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  license_number: string | null;
  bio: string | null;
  is_admin: boolean;
  is_active: boolean;
  licensed_states: string[] | null;
  per_order_rate: number | null;
  role: string | null;
  created_at: string;
}

interface DoctorContact {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  licensed_states: string[] | null;
  is_active: boolean;
  per_order_rate: number | null;
}

interface WorkloadStats {
  active: number;
  completed: number;
}

interface DoctorRow {
  profile: DoctorProfile | null;
  contact: DoctorContact | null;
  email: string;
  name: string;
  workload: WorkloadStats;
}

interface EditForm {
  full_name: string;
  email: string;
  phone: string;
  title: string;
  notes: string;
  photo_url?: string;
  per_order_rate: string;
}

interface PendingApplication {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  license_types: string | null;
  license_number: string | null;
  license_state: string | null;
  additional_states: string | null;
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

const US_STATES_ABBR: { name: string; abbr: string }[] = [
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

export default function DoctorsTab({ onProviderAdded }: { onProviderAdded?: () => void }) {
  const [doctors, setDoctors] = useState<DoctorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedEmail, setExpandedEmail] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ full_name: "", email: "", phone: "", title: "", notes: "", photo_url: "", per_order_rate: "" });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [togglingEmail, setTogglingEmail] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createMsg, setCreateMsg] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [statesModalDoc, setStatesModalDoc] = useState<DoctorRow | null>(null);
  const [deleteDoc, setDeleteDoc] = useState<DoctorRow | null>(null);
  const [pendingApps, setPendingApps] = useState<PendingApplication[]>([]);
  const [reviewingApp, setReviewingApp] = useState<PendingApplication | null>(null);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [pendingSetupIds, setPendingSetupIds] = useState<Set<string>>(new Set());
  const [resendingEmail, setResendingEmail] = useState<string | null>(null);
  const [resetSendingEmail, setResetSendingEmail] = useState<string | null>(null);
  const [resetMsgMap, setResetMsgMap] = useState<Record<string, { text: string; link?: string; success?: boolean }>>({});

  // ── Update Auth Email state ───────────────────────────────────────────────
  const [authEmailEditFor, setAuthEmailEditFor] = useState<string | null>(null);
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authEmailSaving, setAuthEmailSaving] = useState(false);
  const [authEmailMsgMap, setAuthEmailMsgMap] = useState<Record<string, { ok: boolean; text: string }>>({});

  // ── Inline Rate Editor state ──────────────────────────────────────────────
  const [setRateFor, setSetRateFor] = useState<string | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const loadPendingApps = async () => {
    const { data } = await supabase
      .from("provider_applications")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setPendingApps((data as PendingApplication[]) ?? []);
  };

  const NON_PROVIDER_ROLES = new Set(["owner", "admin_manager", "support", "finance", "read_only"]);

  const loadData = async () => {
    setLoading(true);
    const [profilesRes, contactsRes, ordersRes] = await Promise.all([
      supabase.from("doctor_profiles").select("*").order("full_name"),
      supabase.from("doctor_contacts").select("id, full_name, email, phone, notes, licensed_states, is_active, photo_url, per_order_rate").order("full_name"),
      supabase.from("orders").select("doctor_email, doctor_user_id, status").not("doctor_email", "is", null),
    ]);

    const allProfiles = (profilesRes.data as DoctorProfile[]) ?? [];
    // Filter out admin/support/team roles — only actual providers
    const profiles = allProfiles.filter(p => !NON_PROVIDER_ROLES.has(p.role ?? ""));
    const contacts = (contactsRes.data as DoctorContact[]) ?? [];
    const orders = (ordersRes.data as { doctor_email: string | null; doctor_user_id: string | null; status: string }[]) ?? [];

    // Build workload map keyed by email
    const workloadMap = new Map<string, WorkloadStats>();
    orders.forEach((o) => {
      const key = (o.doctor_email ?? "").toLowerCase();
      if (!key) return;
      const existing = workloadMap.get(key) ?? { active: 0, completed: 0 };
      if (o.status === "completed" || o.status === "cancelled") {
        existing.completed += 1;
      } else {
        existing.active += 1;
      }
      workloadMap.set(key, existing);
    });

    // Merge profiles + contacts by email
    const allEmails = new Set([
      ...profiles.map((p) => (p.email ?? "").toLowerCase()),
      ...contacts.map((c) => c.email.toLowerCase()),
    ]);

    const merged: DoctorRow[] = [];
    allEmails.forEach((email) => {
      if (!email) return;
      const profile = profiles.find((p) => (p.email ?? "").toLowerCase() === email) ?? null;
      const contact = contacts.find((c) => c.email.toLowerCase() === email) ?? null;
      const name = profile?.full_name ?? contact?.full_name ?? email;
      merged.push({
        profile,
        contact,
        email,
        name,
        workload: workloadMap.get(email) ?? { active: 0, completed: 0 },
      });
    });

    merged.sort((a, b) => a.name.localeCompare(b.name));
    setDoctors(merged);
    setLoading(false);

    // Check which profiles have unconfirmed auth accounts (pending setup)
    const profileUserIds = profiles.map((p) => p.user_id).filter(Boolean);
    if (profileUserIds.length > 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? "";
        const res = await fetch(`${supabaseUrl}/functions/v1/check-pending-setups`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ user_ids: profileUserIds }),
        });
        const result = await res.json() as { ok: boolean; pending_ids?: string[] };
        if (result.ok && result.pending_ids) {
          setPendingSetupIds(new Set(result.pending_ids));
        }
      } catch {
        // silently fail — badges just won't show
      }
    }
  };

  useEffect(() => { loadData(); loadPendingApps(); }, []);

  const startEdit = (doc: DoctorRow) => {
    setEditingEmail(doc.email);
    setEditForm({
      full_name: doc.name,
      email: doc.email,
      phone: doc.contact?.phone ?? doc.profile?.phone ?? "",
      title: doc.profile?.title ?? "",
      notes: doc.contact?.notes ?? "",
      photo_url: (doc.profile as DoctorProfile & { photo_url?: string })?.photo_url ?? (doc.contact as DoctorContact & { photo_url?: string })?.photo_url ?? "",
      per_order_rate: doc.profile?.per_order_rate != null ? String(doc.profile.per_order_rate) : "",
    });
  };

  const handleSaveEdit = async (doc: DoctorRow) => {
    setSaving(true);
    const updates: Promise<unknown>[] = [];
    if (doc.profile) {
      updates.push(supabase.from("doctor_profiles").update({
        full_name: editForm.full_name,
        email: editForm.email || null,
        phone: editForm.phone || null,
        title: editForm.title || null,
        photo_url: editForm.photo_url || null,
        per_order_rate: editForm.per_order_rate !== "" ? parseInt(editForm.per_order_rate, 10) : null,
      }).eq("id", doc.profile.id));
    }
    if (doc.contact) {
      updates.push(supabase.from("doctor_contacts").update({
        full_name: editForm.full_name,
        email: editForm.email || doc.contact.email,
        phone: editForm.phone || null,
        notes: editForm.notes || null,
        photo_url: editForm.photo_url || null,
      }).eq("id", doc.contact.id));
    } else if (doc.profile) {
      // Profile-only provider — create a doctor_contacts entry so the assignment dropdown works reliably
      updates.push(supabase.from("doctor_contacts").upsert({
        full_name: editForm.full_name,
        email: (editForm.email || doc.email).toLowerCase(),
        phone: editForm.phone || null,
        licensed_states: doc.profile.licensed_states ?? [],
        is_active: doc.profile.is_active,
        notes: editForm.notes || null,
      }, { onConflict: "email" }));
    }
    await Promise.all(updates);
    setSaving(false);
    setEditingEmail(null);
    setSavedMsg(`${editForm.full_name} updated`);
    setTimeout(() => setSavedMsg(""), 3000);
    loadData();
  };

  const handleToggleActive = async (doc: DoctorRow) => {
    if (!doc.profile) return;
    setTogglingEmail(doc.email);
    const newActive = !doc.profile.is_active;
    await Promise.all([
      supabase.from("doctor_profiles").update({ is_active: newActive }).eq("id", doc.profile.id),
      // Mirror to public website listing — deactivated providers hide from homepage + checkout
      supabase.from("approved_providers").update({ is_active: newActive }).eq("email", doc.email),
    ]);
    setTogglingEmail(null);
    setSavedMsg(newActive
      ? `${doc.name} reactivated — they will appear on the website again.`
      : `${doc.name} deactivated — hidden from website and assignment list. Past orders preserved.`
    );
    setTimeout(() => setSavedMsg(""), 5000);
    loadData();
  };

  const handleToggleContactActive = async (doc: DoctorRow) => {
    if (!doc.contact || doc.profile) return; // only for contact-only providers
    setTogglingEmail(doc.email);
    const newValue = !(doc.contact.is_active !== false);
    await Promise.all([
      supabase.from("doctor_contacts").update({ is_active: newValue }).eq("id", doc.contact.id),
      // Mirror to public website listing
      supabase.from("approved_providers").update({ is_active: newValue }).eq("email", doc.email),
    ]);
    setTogglingEmail(null);
    setSavedMsg(`${doc.name} ${newValue ? "reactivated — will appear on website again" : "deactivated — hidden from website. Past orders preserved."}`);
    setTimeout(() => setSavedMsg(""), 5000);
    loadData();
  };

  const handleDeleteProvider = async (doc: DoctorRow) => {
    const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;
    const deletes: { table: string; promise: Promise<{ error: { message: string } | null }> }[] = [];
    if (doc.profile) {
      deletes.push({
        table: "doctor_profiles",
        promise: supabase.from("doctor_profiles").delete().eq("id", doc.profile.id),
      });
    }
    if (doc.contact) {
      deletes.push({
        table: "doctor_contacts",
        promise: supabase.from("doctor_contacts").delete().eq("id", doc.contact.id),
      });
    }

    // Always deactivate their public website listing — keeps historical order data intact
    // but removes them from the homepage, checkout, and doctor profile page immediately.
    deletes.push({
      table: "approved_providers",
      promise: supabase.from("approved_providers").update({ is_active: false }).eq("email", doc.email),
    });

    const results = await Promise.all(deletes.map((d) => d.promise));
    const profileOrContactError = results
      .filter((_, i) => deletes[i].table !== "approved_providers")
      .find((r) => r.error);
    setDeleteDoc(null);
    if (profileOrContactError?.error) {
      setSavedMsg(`Delete failed: ${profileOrContactError.error.message}. Check permissions and try again.`);
    } else {
      // Delete Supabase auth user + write HIPAA audit log via edge function
      const userIdToDelete = doc.profile?.user_id;
      if (userIdToDelete) {
        try {
          const { data: { session: freshSession } } = await supabase.auth.refreshSession();
          const token = freshSession?.access_token ?? "";
          const delRes = await fetch(`${supabaseUrl}/functions/v1/delete-auth-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              userId: userIdToDelete,
              entityType: "provider",
              entityName: `${doc.name} (${doc.email})`,
              reason: `Provider permanently deleted by admin.`,
            }),
          });
          if (!delRes.ok) {
            const errBody = await delRes.json().catch(() => ({})) as { error?: string };
            console.error("[DoctorsTab] delete-auth-user failed:", delRes.status, errBody?.error);
          }
        } catch (e) {
          console.error("[DoctorsTab] delete-auth-user network error:", e);
        }
      }
      setSavedMsg(`${doc.name} has been permanently deleted. They no longer appear on the website or assignment list. Past order records and earnings history are preserved.`);
    }
    setTimeout(() => setSavedMsg(""), 8000);
    loadData();
  };

  const handleSaveRate = async (doc: DoctorRow) => {
    // Supports both portal-account providers (doctor_profiles) and contact-only providers (doctor_contacts)
    if (!doc.profile && !doc.contact) return;
    setSavingRate(true);
    const parsed = rateInput.trim() !== "" ? parseInt(rateInput, 10) : null;
    const rate = (parsed != null && !isNaN(parsed) && parsed >= 0) ? parsed : null;

    if (doc.profile) {
      await supabase.from("doctor_profiles").update({ per_order_rate: rate }).eq("id", doc.profile.id);
    } else if (doc.contact) {
      await supabase.from("doctor_contacts").update({ per_order_rate: rate }).eq("id", doc.contact.id);
    }

    setSavingRate(false);
    setSetRateFor(null);
    setSavedMsg(
      rate != null
        ? `Payout rate set to $${rate}/order for ${doc.name}. Applies to future completed cases.`
        : `Payout rate cleared for ${doc.name}.`
    );
    setTimeout(() => setSavedMsg(""), 5000);
    loadData();
  };

  const handleSendPasswordReset = async (doc: DoctorRow) => {
    if (!doc.email) return;
    setResetSendingEmail(doc.email);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-send-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        // Pass user_id so the edge function can look up the REAL Supabase Auth email
        // (handles cases where admin portal email was updated but Supabase Auth wasn't synced yet)
        body: JSON.stringify({
          email: doc.email,
          user_id: doc.profile?.user_id ?? undefined,
        }),
      });
      const result = await res.json() as { ok?: boolean; error?: string; message?: string; action_link?: string; used_email?: string; email_sent?: boolean };
      const displayEmail = result.used_email ?? doc.email;
      const msgEntry = result.ok
        ? {
            text: result.email_sent
              ? `Reset email sent to ${displayEmail} via Resend — should arrive within a minute.`
              : `Reset link generated for ${displayEmail}. Email delivery unavailable — copy the fallback link below.`,
            link: result.action_link ?? undefined,
            success: true,
          }
        : { text: result.error ?? "Failed to send reset link", success: false };
      setResetMsgMap((prev) => ({ ...prev, [doc.email]: msgEntry }));
      setTimeout(() => setResetMsgMap((prev) => { const next = { ...prev }; delete next[doc.email]; return next; }), 10000);
    } catch {
      setResetMsgMap((prev) => ({ ...prev, [doc.email]: { text: "Network error — could not reach server" } }));
      setTimeout(() => setResetMsgMap((prev) => { const next = { ...prev }; delete next[doc.email]; return next; }), 5000);
    } finally {
      setResetSendingEmail(null);
    }
  };

  const handleUpdateAuthEmail = async (doc: DoctorRow) => {
    const newEmail = authEmailInput.trim().toLowerCase();
    if (!newEmail || !newEmail.includes("@")) return;
    setAuthEmailSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-auth-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          current_email: doc.email,
          new_email: newEmail,
          user_id: doc.profile?.user_id ?? undefined,
          provider_name: doc.name ?? "",
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string; message?: string };
      const msgEntry = { ok: result.ok, text: result.ok ? (result.message ?? "Email updated!") : (result.error ?? "Failed to update email") };
      setAuthEmailMsgMap((prev) => ({ ...prev, [doc.email]: msgEntry }));
      if (result.ok) {
        setAuthEmailEditFor(null);
        setTimeout(() => setAuthEmailMsgMap((prev) => { const next = { ...prev }; delete next[doc.email]; return next; }), 8000);
        loadData();
      }
    } catch {
      setAuthEmailMsgMap((prev) => ({ ...prev, [doc.email]: { ok: false, text: "Network error — could not reach server." } }));
    } finally {
      setAuthEmailSaving(false);
    }
  };

  const handleResendInvite = async (doc: DoctorRow) => {
    setResendingEmail(doc.email);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      // Use profile info if available, fall back to contact info
      const email = doc.profile?.email ?? doc.contact?.email ?? doc.email;
      const fullName = doc.profile?.full_name ?? doc.contact?.full_name ?? doc.name;
      const phone = doc.profile?.phone ?? doc.contact?.phone ?? null;
      const licensedStates = doc.profile?.licensed_states ?? doc.contact?.licensed_states ?? [];
      const perOrderRate = doc.profile?.per_order_rate ?? doc.contact?.per_order_rate ?? null;

      const res = await fetch(`${supabaseUrl}/functions/v1/create-team-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email,
          full_name: fullName,
          phone,
          licensed_states: licensedStates,
          per_order_rate: perOrderRate,
          is_admin: false,
          role: "provider",
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string; note?: string };
      if (!result.ok) throw new Error(result.error || `Server returned error (HTTP ${res.status})`);
      console.log("[resend-invite] success:", result.note);
      setSavedMsg(`Invite resent to ${email} — they will receive a setup email from PawTenant shortly.`);
      setTimeout(() => setSavedMsg(""), 7000);
      loadData();
      onProviderAdded?.();
    } catch (err) {
      setSavedMsg(`Could not send invite: ${err instanceof Error ? err.message : "Unknown error"}`);
      setTimeout(() => setSavedMsg(""), 6000);
    }
    setResendingEmail(null);
  };

  const handleExportProvidersCSV = () => {
    const escapeCell = (val: string) => `"${String(val ?? "").replace(/"/g, '""')}"`;

    const headers = [
      "Name", "Email", "Phone", "Title", "Rate ($/order)",
      "Licensed States", "State Count", "Active Cases", "Completed Cases",
      "Status", "Portal Account", "Member Since"
    ];

    const rows = doctors.map((doc) => {
      const states = doc.contact?.licensed_states ?? doc.profile?.licensed_states ?? [];
      const isActive = doc.profile ? doc.profile.is_active !== false : (doc.contact?.is_active !== false);
      const rate = doc.profile?.per_order_rate ?? doc.contact?.per_order_rate ?? null;

      return [
        doc.name,
        doc.email,
        doc.contact?.phone ?? doc.profile?.phone ?? "",
        doc.profile?.title ?? "",
        rate != null ? String(rate) : "",
        states.join("; "),
        String(states.length),
        String(doc.workload.active),
        String(doc.workload.completed),
        isActive ? "Active" : "Inactive",
        doc.profile ? "Portal Account" : "No Portal",
        doc.profile?.created_at
          ? new Date(doc.profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "",
      ].map(escapeCell).join(",");
    });

    const csvContent = [headers.map(escapeCell).join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const date = new Date().toISOString().slice(0, 10);
    link.setAttribute("download", `pawtenant-providers-${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalActive = doctors.reduce((s, d) => s + d.workload.active, 0);
  const totalCompleted = doctors.reduce((s, d) => s + d.workload.completed, 0);

  return (
    <div>
      {/* ===== PENDING APPLICATIONS SECTION ===== */}
      {pendingApps.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <button
            type="button"
            onClick={() => setPendingExpanded((v) => !v)}
            className="whitespace-nowrap w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-amber-100/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 flex items-center justify-center bg-amber-500 rounded-xl">
                <i className="ri-time-line text-white text-sm"></i>
              </div>
              <div className="text-left">
                <p className="text-sm font-extrabold text-amber-900">Pending Provider Applications</p>
                <p className="text-xs text-amber-700">Review and approve new providers to add them to the network</p>
              </div>
              <span className="px-2.5 py-1 bg-amber-500 text-white text-xs font-extrabold rounded-full">{pendingApps.length}</span>
            </div>
            <div className="w-5 h-5 flex items-center justify-center text-amber-700 flex-shrink-0">
              <i className={`ri-arrow-${pendingExpanded ? "up" : "down"}-s-line text-lg`}></i>
            </div>
          </button>

          {pendingExpanded && (
            <div className="border-t border-amber-200 divide-y divide-amber-100">
              {pendingApps.map((app) => (
                <div key={app.id} className="flex items-center gap-4 px-5 py-4 bg-white/60">
                  {/* Headshot or initials */}
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-amber-200 flex-shrink-0 bg-amber-100 flex items-center justify-center">
                    {app.headshot_url ? (
                      <img src={app.headshot_url} alt={app.first_name} className="w-full h-full object-cover object-top" />
                    ) : (
                      <span className="text-xs font-extrabold text-amber-700">
                        {app.first_name[0]}{app.last_name[0]}
                      </span>
                    )}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{app.first_name} {app.last_name}</p>
                    <p className="text-xs text-gray-500 truncate">{app.email}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      {app.license_types && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {app.license_types.split(",")[0]?.trim()}
                        </span>
                      )}
                      {app.license_state && (
                        <span className="text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          {app.license_state}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        {new Date(app.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}
                      </span>
                    </div>
                  </div>
                  {/* Documents badge */}
                  {(app.documents_urls ?? []).length > 0 && (
                    <div className="hidden sm:flex items-center gap-1 text-xs text-[#1a5c4f] bg-[#f0faf7] px-2 py-1 rounded-lg border border-[#b8ddd5] flex-shrink-0">
                      <i className="ri-file-line text-xs"></i>
                      {(app.documents_urls ?? []).length} doc{(app.documents_urls ?? []).length > 1 ? "s" : ""}
                    </div>
                  )}
                  {/* Review button */}
                  <button
                    type="button"
                    onClick={() => setReviewingApp(app)}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-xs font-bold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors flex-shrink-0"
                  >
                    <i className="ri-search-eye-line"></i>Review
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Providers", value: doctors.length, icon: "ri-stethoscope-line", color: "text-gray-700" },
            { label: "Active Accounts", value: doctors.filter((d) => d.profile ? d.profile.is_active : (d.contact?.is_active !== false)).length, icon: "ri-checkbox-circle-line", color: "text-emerald-600" },
            { label: "Active Cases", value: doctors.reduce((s, d) => s + d.workload.active, 0), icon: "ri-folder-open-line", color: "text-sky-600" },
            { label: "Completed Cases", value: doctors.reduce((s, d) => s + d.workload.completed, 0), icon: "ri-award-line", color: "text-[#1a5c4f]" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-7 h-7 flex items-center justify-center">
                  <i className={`${s.icon} ${s.color} text-base`}></i>
                </div>
                <span className="text-xs text-gray-500 font-medium">{s.label}</span>
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {(savedMsg || createMsg) && (
        <div className="mb-4 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-center gap-3">
          <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-base flex-shrink-0"></i>
          <p className="text-sm text-[#1a5c4f] font-semibold">{savedMsg || createMsg}</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-extrabold text-gray-900">Provider Roster</h2>
          <p className="text-xs text-gray-500 mt-0.5">Manage accounts, states, workload, and case assignments.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportProvidersCSV}
            disabled={doctors.length === 0}
            title="Export all providers to CSV"
            className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 border border-[#1a5c4f] text-[#1a5c4f] bg-[#f0faf7] text-sm font-bold rounded-xl hover:bg-[#e0f2ec] disabled:opacity-50 cursor-pointer transition-colors"
          >
            <i className="ri-download-2-line"></i>Export CSV
          </button>
          <button type="button" onClick={() => setShowCreate(true)}
            className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors">
            <i className="ri-user-add-line"></i>Add Provider
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
        </div>
      ) : doctors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-bold text-gray-700">No providers found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {doctors.map((doc) => {
            const isExpanded = expandedEmail === doc.email;
            const isEditing = editingEmail === doc.email;
            const isRateOpen = setRateFor === doc.email;
            const isToggling = togglingEmail === doc.email;
            const states = doc.contact?.licensed_states ?? doc.profile?.licensed_states ?? [];
            const initials = doc.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
            const isActive = doc.profile ? doc.profile.is_active !== false : (doc.contact?.is_active !== false);
            const isContactOnly = !doc.profile && !!doc.contact;
            const isPendingSetup = !!doc.profile && pendingSetupIds.has(doc.profile.user_id);
            const isResending = resendingEmail === doc.email;
            const photoUrl = (doc.profile as DoctorProfile & { photo_url?: string })?.photo_url
              ?? (doc.contact as DoctorContact & { photo_url?: string })?.photo_url
              ?? null;
            const currentRate = doc.profile?.per_order_rate ?? doc.contact?.per_order_rate ?? null;
            // Estimated total earnings = rate × completed (for admin visibility)
            const estimatedEarnings = currentRate != null ? currentRate * doc.workload.completed : null;

            return (
              <div key={doc.email} className={`bg-white rounded-xl border overflow-hidden transition-colors ${isRateOpen ? "border-[#1a5c4f]" : "border-gray-200"}`}>
                {/* Row */}
                <div className="flex items-center gap-4 px-5 py-4">
                  {/* Avatar */}
                  <div className={`w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 text-sm font-extrabold ${isActive ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-gray-100 text-gray-400"}`}>
                    {initials}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{doc.name}</p>
                      {doc.profile?.title && <span className="text-xs text-gray-400">{doc.profile.title}</span>}
                      {doc.profile?.is_admin && (
                        <span className="px-1.5 py-0.5 bg-[#e8f5f1] text-[#1a5c4f] text-xs font-bold rounded">Admin</span>
                      )}
                      {isContactOnly && (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs font-bold rounded">No Portal</span>
                      )}
                      {isPendingSetup && (
                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded flex items-center gap-1">
                          <i className="ri-time-line text-xs"></i>Pending setup
                        </span>
                      )}
                      {!isActive && (
                        <span className="px-1.5 py-0.5 bg-red-100 text-red-600 text-xs font-bold rounded">Inactive</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 truncate">{doc.email}</p>
                    {(doc.contact?.phone ?? doc.profile?.phone) && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                        <i className="ri-phone-line text-gray-400 text-xs"></i>
                        {doc.contact?.phone ?? doc.profile?.phone}
                      </p>
                    )}
                  </div>

                  {/* Workload + Rate */}
                  <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
                    <div className="text-center px-2">
                      <p className="text-lg font-extrabold text-sky-600">{doc.workload.active}</p>
                      <p className="text-xs text-gray-400">Active</p>
                    </div>
                    <div className="text-center px-2">
                      <p className="text-lg font-extrabold text-[#1a5c4f]">{doc.workload.completed}</p>
                      <p className="text-xs text-gray-400">Done</p>
                    </div>
                    <div className="text-center px-2">
                      <p className="text-sm font-bold text-gray-600">{states.length}</p>
                      <p className="text-xs text-gray-400">States</p>
                    </div>
                    {/* ── Per-Order Rate Badge — shown for ALL providers ── */}
                    <button
                      type="button"
                      title={currentRate != null ? `Default payout: $${currentRate}/order — locks in when assigned. Click to change.` : "No default payout rate — click to set. Applies to next assignment."}
                      onClick={() => {
                        if (isRateOpen) {
                          setSetRateFor(null);
                        } else {
                          setSetRateFor(doc.email);
                          setRateInput(currentRate != null ? String(currentRate) : "");
                          setExpandedEmail(null);
                          setEditingEmail(null);
                        }
                      }}
                      className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                        isRateOpen
                          ? "bg-[#1a5c4f] border-[#1a5c4f] text-white"
                          : currentRate != null
                            ? "bg-[#f0faf7] border-[#b8ddd5] text-[#1a5c4f] hover:bg-[#e0f2ec]"
                            : "bg-orange-50 border-orange-200 text-orange-600 hover:bg-orange-100"
                      }`}
                    >
                      <i className="ri-money-dollar-circle-line"></i>
                      {currentRate != null ? `$${currentRate}/order` : "Set rate"}
                      {isRateOpen
                        ? <i className="ri-arrow-up-s-line text-xs"></i>
                        : <i className="ri-pencil-line text-xs opacity-60"></i>
                      }
                    </button>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button type="button" onClick={() => { startEdit(doc); setSetRateFor(null); }}
                      title="Edit profile details"
                      className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                      <i className="ri-pencil-line text-sm"></i>
                    </button>
                    <button type="button" onClick={() => setStatesModalDoc(doc)} title="Manage licensed states"
                      className="whitespace-nowrap flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-[#f0faf7] hover:border-[#b8ddd5] hover:text-[#1a5c4f] cursor-pointer transition-colors text-xs font-bold">
                      <i className="ri-map-pin-line text-sm"></i>
                      <span className="hidden md:inline">{states.length} States</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResendInvite(doc)}
                      disabled={isResending}
                      title="Resend account setup / welcome invite email"
                      className="whitespace-nowrap flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-[#1a5c4f] text-[#1a5c4f] bg-[#f0faf7] hover:bg-[#e0f2ec] cursor-pointer transition-colors text-xs font-bold disabled:opacity-50"
                    >
                      {isResending
                        ? <><i className="ri-loader-4-line animate-spin text-sm"></i><span className="hidden md:inline">Sending...</span></>
                        : <><i className="ri-mail-send-line text-sm"></i><span className="hidden md:inline">Resend invite</span></>
                      }
                    </button>
                    {doc.profile && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleSendPasswordReset(doc)}
                          disabled={resetSendingEmail === doc.email}
                          title={`Send password reset email to ${doc.email}`}
                          className="whitespace-nowrap flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-amber-200 text-amber-700 bg-amber-50 hover:bg-amber-100 cursor-pointer transition-colors text-xs font-bold disabled:opacity-50"
                        >
                          {resetSendingEmail === doc.email
                            ? <><i className="ri-loader-4-line animate-spin text-sm"></i><span className="hidden md:inline">Sending...</span></>
                            : <><i className="ri-key-2-line text-sm"></i><span className="hidden md:inline">Reset PW</span></>
                          }
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (authEmailEditFor === doc.email) {
                              setAuthEmailEditFor(null);
                            } else {
                              setAuthEmailEditFor(doc.email);
                              setAuthEmailInput("");
                              setExpandedEmail(null);
                              setEditingEmail(null);
                              setSetRateFor(null);
                            }
                          }}
                          title={`Change Supabase login email for ${doc.name}`}
                          className={`whitespace-nowrap flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${
                            authEmailEditFor === doc.email
                              ? "bg-violet-600 border-violet-600 text-white"
                              : "border-violet-200 text-violet-700 bg-violet-50 hover:bg-violet-100"
                          }`}
                        >
                          <i className="ri-mail-settings-line text-sm"></i>
                          <span className="hidden lg:inline">Auth Email</span>
                        </button>
                        <button type="button" onClick={() => handleToggleActive(doc)} disabled={isToggling}
                          className={`whitespace-nowrap w-9 h-5 rounded-full relative transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ${doc.profile.is_active !== false ? "bg-[#1a5c4f]" : "bg-gray-300"}`}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${doc.profile.is_active !== false ? "translate-x-4" : "translate-x-0.5"}`}></div>
                        </button>
                      </>
                    )}
                    {isContactOnly && (
                      <button type="button" onClick={() => handleToggleContactActive(doc)} disabled={isToggling}
                        className={`whitespace-nowrap w-9 h-5 rounded-full relative transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ${isActive ? "bg-[#1a5c4f]" : "bg-gray-300"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isActive ? "translate-x-4" : "translate-x-0.5"}`}></div>
                      </button>
                    )}
                    <button type="button" onClick={() => setDeleteDoc(doc)} title="Delete provider"
                      className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-lg border border-red-200 text-red-400 hover:bg-red-50 hover:text-red-600 cursor-pointer transition-colors">
                      <i className="ri-delete-bin-6-line text-sm"></i>
                    </button>
                    <button type="button" onClick={() => { setExpandedEmail(isExpanded ? null : doc.email); setSetRateFor(null); }}
                      className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                      <i className={`ri-arrow-${isExpanded ? "up" : "down"}-s-line text-sm`}></i>
                    </button>
                  </div>
                </div>

                {/* ── Inline Rate Editor Panel — works for all providers ── */}
                {isRateOpen && !isEditing && (
                  <div className="border-t border-[#b8ddd5] bg-[#f0faf7] px-5 py-4">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div>
                        <p className="text-xs font-extrabold text-[#1a5c4f] mb-0.5">Default Payout Rate</p>
                        <p className="text-xs text-[#1a5c4f]/70">
                          Amount auto-applied to new earnings records when {doc.name.split(" ")[0]} is assigned to an order.
                          {estimatedEarnings != null && doc.workload.completed > 0 && (
                            <> Currently: <strong className="text-[#1a5c4f]">{doc.workload.completed} orders × ${currentRate} = ${estimatedEarnings} estimated total</strong></>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#1a5c4f] font-extrabold text-sm">$</span>
                          <input
                            type="number"
                            min="0"
                            value={rateInput}
                            onChange={(e) => setRateInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveRate(doc);
                              if (e.key === "Escape") setSetRateFor(null);
                            }}
                            placeholder="e.g. 30"
                            autoFocus
                            className="w-32 pl-7 pr-3 py-2 border border-[#b8ddd5] rounded-xl text-sm font-bold focus:outline-none focus:border-[#1a5c4f] bg-white text-[#1a5c4f] placeholder-gray-300"
                          />
                        </div>
                        <span className="text-xs text-[#1a5c4f]/70 font-semibold whitespace-nowrap">per assigned case</span>
                        <button
                          type="button"
                          onClick={() => handleSaveRate(doc)}
                          disabled={savingRate}
                          className="whitespace-nowrap flex items-center gap-1.5 px-5 py-2 bg-[#1a5c4f] text-white text-xs font-extrabold rounded-xl hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          {savingRate ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</> : <><i className="ri-save-line"></i>Save Rate</>}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSetRateFor(null)}
                          className="whitespace-nowrap px-3 py-2 text-xs text-[#1a5c4f]/70 hover:text-[#1a5c4f] cursor-pointer font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-[#b8ddd5] flex items-start gap-2">
                      <i className="ri-information-line text-[#1a5c4f] text-sm flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-[#1a5c4f]/70 leading-relaxed">
                        <strong>Rate locks in at assignment.</strong> When you assign this provider to an order, the earnings record is automatically created with this amount. If you change the rate later, only future assignments use the new rate — existing earnings records are not affected.
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Auth Email Editor Panel ── */}
                {authEmailEditFor === doc.email && !isEditing && (
                  <div className="border-t border-violet-200 bg-violet-50 px-5 py-4">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-8 h-8 flex items-center justify-center bg-violet-600 rounded-lg flex-shrink-0">
                        <i className="ri-mail-settings-line text-white text-sm"></i>
                      </div>
                      <div>
                        <p className="text-xs font-extrabold text-violet-900 mb-0.5">Update Supabase Login Email</p>
                        <p className="text-xs text-violet-700 leading-relaxed">
                          This changes the email used to <strong>log into the provider portal</strong>. The change takes effect immediately — no confirmation email is sent. Current: <strong>{doc.email}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-[220px]">
                        <label className="block text-xs font-bold text-violet-800 mb-1">New Login Email</label>
                        <input
                          type="email"
                          value={authEmailInput}
                          onChange={(e) => setAuthEmailInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleUpdateAuthEmail(doc);
                            if (e.key === "Escape") setAuthEmailEditFor(null);
                          }}
                          placeholder="e.g. info@pawtenant.com"
                          autoFocus
                          className="w-full px-3 py-2 border border-violet-300 rounded-xl text-sm focus:outline-none focus:border-violet-600 bg-white font-medium"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <button
                          type="button"
                          onClick={() => handleUpdateAuthEmail(doc)}
                          disabled={authEmailSaving || !authEmailInput.trim() || !authEmailInput.includes("@")}
                          className="whitespace-nowrap flex items-center gap-2 px-5 py-2 bg-violet-600 text-white text-xs font-extrabold rounded-xl hover:bg-violet-700 disabled:opacity-50 cursor-pointer transition-colors"
                        >
                          {authEmailSaving
                            ? <><i className="ri-loader-4-line animate-spin"></i>Updating...</>
                            : <><i className="ri-save-line"></i>Save Email</>
                          }
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAuthEmailEditFor(null); setAuthEmailMsgMap((prev) => { const next = { ...prev }; delete next[doc.email]; return next; }); }}
                          className="whitespace-nowrap px-3 py-2 text-xs text-violet-700 hover:text-violet-900 cursor-pointer font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                    {authEmailMsgMap[doc.email] && (
                      <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border ${authEmailMsgMap[doc.email].ok ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                        <i className={`flex-shrink-0 mt-0.5 ${authEmailMsgMap[doc.email].ok ? "ri-checkbox-circle-line" : "ri-error-warning-line"}`}></i>
                        <p>{authEmailMsgMap[doc.email].text}</p>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-violet-200 flex items-start gap-2">
                      <i className="ri-shield-check-line text-violet-600 text-sm flex-shrink-0 mt-0.5"></i>
                      <p className="text-xs text-violet-700 leading-relaxed">
                        <strong>Immediate effect.</strong> The provider&apos;s old email stops working right away. Make sure to inform them of the new login email. If they&apos;re currently logged in, they may need to sign in again.
                      </p>
                    </div>
                  </div>
                )}

                {/* Edit form */}
                {isEditing && (
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-4">
                    <p className="text-xs font-bold text-gray-600 uppercase tracking-widest mb-3">Edit Provider</p>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Full Name</label>
                        <input type="text" value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Email Address</label>
                        <input type="email" value={editForm.email} onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                          placeholder="provider@example.com"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white" />
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><i className="ri-information-line"></i>Used for case assignments &amp; notifications</p>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Phone</label>
                        <input type="text" value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                          placeholder="+1 (555) 000-0000"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Title</label>
                        <input type="text" value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                          placeholder="e.g. Licensed Therapist, LCSW"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white" />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Internal Notes</label>
                        <input type="text" value={editForm.notes} onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                          placeholder="Admin notes only"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white" />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Profile Photo URL</label>
                        <div className="flex items-center gap-3">
                          <input type="url" value={editForm.photo_url} onChange={(e) => setEditForm((f) => ({ ...f, photo_url: e.target.value }))}
                            placeholder="https://..."
                            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f] bg-white" />
                          {editForm.photo_url && (
                            <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#b8ddd5] flex-shrink-0">
                              <img src={editForm.photo_url} alt="Preview" className="w-full h-full object-cover object-top"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            </div>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">This photo appears on homepage cards, the provider&apos;s profile page, and the assessment form.</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => handleSaveEdit(doc)} disabled={saving}
                        className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer transition-colors">
                        {saving ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</> : <><i className="ri-save-line"></i>Save Changes</>}
                      </button>
                      <button type="button" onClick={() => setEditingEmail(null)}
                        className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Expanded profile */}
                {isExpanded && !isEditing && (
                  <div className="border-t border-gray-100 px-5 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {/* Profile + Earnings summary */}
                      <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Profile Details</p>
                        <div className="space-y-2">
                          {[
                            { label: "Email", value: doc.email },
                            { label: "Phone", value: doc.contact?.phone ?? doc.profile?.phone ?? "—" },
                            { label: "Title", value: doc.profile?.title ?? "—" },
                            { label: "License #", value: doc.profile?.license_number ?? "—" },
                            { label: "Portal Account", value: doc.profile ? (doc.profile.is_active ? "Active" : "Inactive") : "No portal account" },
                            { label: "Status", value: isActive ? "Active" : "Deactivated" },
                            { label: "Member Since", value: doc.profile?.created_at ? new Date(doc.profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" },
                          ].map((item) => (
                            <div key={item.label} className="flex items-start justify-between gap-3">
                              <span className="text-xs text-gray-400 flex-shrink-0">{item.label}</span>
                              <span className={`text-xs font-semibold text-right ${item.label === "Status" && !isActive ? "text-red-500" : "text-gray-700"}`}>{item.value}</span>
                            </div>
                          ))}
                        </div>

                        {/* Payout Rate + Earnings Summary */}
                        <div className="mt-4 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold text-[#1a5c4f] uppercase tracking-wide">Payout Summary</p>
                            <button
                              type="button"
                              onClick={() => { setSetRateFor(doc.email); setRateInput(currentRate != null ? String(currentRate) : ""); setExpandedEmail(null); }}
                              className="whitespace-nowrap flex items-center gap-1 text-xs text-[#1a5c4f] hover:underline cursor-pointer font-bold"
                            >
                              <i className="ri-pencil-line text-xs"></i>Edit Rate
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-white rounded-lg border border-[#b8ddd5] px-3 py-2.5 text-center">
                              <p className={`text-lg font-extrabold ${currentRate != null ? "text-[#1a5c4f]" : "text-gray-300"}`}>
                                {currentRate != null ? `$${currentRate}` : "—"}
                              </p>
                              <p className="text-xs text-gray-400">Rate/Order</p>
                            </div>
                            <div className="bg-white rounded-lg border border-[#b8ddd5] px-3 py-2.5 text-center">
                              <p className="text-lg font-extrabold text-[#1a5c4f]">{doc.workload.completed}</p>
                              <p className="text-xs text-gray-400">Completed</p>
                            </div>
                            <div className="bg-white rounded-lg border border-[#b8ddd5] px-3 py-2.5 text-center">
                              <p className={`text-lg font-extrabold ${estimatedEarnings != null ? "text-[#1a5c4f]" : "text-gray-300"}`}>
                                {estimatedEarnings != null ? `$${estimatedEarnings}` : "—"}
                              </p>
                              <p className="text-xs text-gray-400">Est. Earned</p>
                            </div>
                          </div>
                          {currentRate == null && (
                            <button
                              type="button"
                              onClick={() => { setSetRateFor(doc.email); setRateInput(""); setExpandedEmail(null); }}
                              className="whitespace-nowrap mt-3 w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-[#b8ddd5] rounded-xl text-xs font-bold text-[#1a5c4f] hover:bg-[#e0f2ec] cursor-pointer transition-colors"
                            >
                              <i className="ri-add-line"></i>Set payout rate
                            </button>
                          )}
                        </div>

                        {isContactOnly && (
                          <div className="mt-4">
                            <button type="button" onClick={() => handleToggleContactActive(doc)} disabled={isToggling}
                              className={`whitespace-nowrap flex items-center gap-2 px-3 py-2 text-xs font-bold rounded-lg border cursor-pointer transition-colors disabled:opacity-50 ${isActive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-[#b8ddd5] text-[#1a5c4f] hover:bg-[#f0faf7]"}`}>
                              <i className={isActive ? "ri-forbid-line" : "ri-checkbox-circle-line"}></i>
                              {isActive ? "Deactivate Provider" : "Reactivate Provider"}
                            </button>
                          </div>
                        )}
                        {doc.contact?.notes && (
                          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                            <p className="text-xs font-bold text-amber-700 mb-0.5">Internal Notes</p>
                            <p className="text-xs text-amber-800 leading-relaxed">{doc.contact.notes}</p>
                          </div>
                        )}
                        {doc.profile?.bio && (
                          <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                            <p className="text-xs font-bold text-gray-500 mb-0.5">Bio</p>
                            <p className="text-xs text-gray-600 leading-relaxed">{doc.profile.bio}</p>
                          </div>
                        )}
                      </div>

                      {/* Licensed states */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Licensed States</p>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#1a5c4f]">{states.length} states</span>
                            <button type="button" onClick={() => setStatesModalDoc(doc)}
                              className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#1a5c4f] text-white text-xs font-bold rounded-lg hover:bg-[#17504a] cursor-pointer transition-colors">
                              <i className="ri-map-pin-add-line"></i>Manage States
                            </button>
                          </div>
                        </div>
                        {states.length === 0 ? (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-3 text-center">
                            <i className="ri-map-pin-2-line text-orange-400 text-xl mb-1"></i>
                            <p className="text-xs text-orange-700 font-semibold">No licensed states configured</p>
                            <p className="text-xs text-orange-500 mt-0.5">Click &quot;Manage States&quot; to add them.</p>
                          </div>
                        ) : (
                          <>
                            <div className="relative mb-2">
                              <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
                              <input type="text" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}
                                placeholder="Filter..." className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-[#1a5c4f]" />
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                              {states
                                .filter((s) => !stateFilter || s.toLowerCase().includes(stateFilter.toLowerCase()))
                                .map((s) => {
                                  const abbr = US_STATES_ABBR.find((us) => us.name === s)?.abbr ?? s;
                                  return (
                                    <span key={s} className="inline-flex items-center px-2 py-0.5 bg-[#f0faf7] text-[#1a5c4f] border border-[#b8ddd5] rounded-full text-xs font-semibold">{abbr}</span>
                                  );
                                })}
                            </div>
                          </>
                        )}

                        {/* Workload bar */}
                        <div className="mt-4 bg-gray-50 rounded-xl border border-gray-100 p-3">
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Workload</p>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center bg-white rounded-lg border border-gray-100 py-2.5">
                              <p className="text-xl font-extrabold text-sky-600">{doc.workload.active}</p>
                              <p className="text-xs text-gray-400 mt-0.5">Active Cases</p>
                            </div>
                            <div className="text-center bg-white rounded-lg border border-gray-100 py-2.5">
                              <p className="text-xl font-extrabold text-[#1a5c4f]">{doc.workload.completed}</p>
                              <p className="text-xs text-gray-400 mt-0.5">Completed</p>
                            </div>
                            <div className="text-center bg-white rounded-lg border border-gray-100 py-2.5">
                              <p className="text-xl font-extrabold text-gray-700">{doc.workload.active + doc.workload.completed}</p>
                              <p className="text-xs text-gray-400 mt-0.5">Total Cases</p>
                            </div>
                          </div>
                          {doc.workload.active + doc.workload.completed > 0 && (
                            <div className="mt-2">
                              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                                <span>Completion rate</span>
                                <span className="font-bold">{Math.round((doc.workload.completed / (doc.workload.active + doc.workload.completed)) * 100)}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-1.5">
                                <div className="bg-[#1a5c4f] h-1.5 rounded-full"
                                  style={{ width: `${Math.round((doc.workload.completed / (doc.workload.active + doc.workload.completed)) * 100)}%` }}></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {resetMsgMap[doc.email] && (
                  <div className={`mt-2 mx-4 mb-3 flex items-start gap-2 px-4 py-3 rounded-xl text-xs font-semibold border ${resetMsgMap[doc.email].success !== false ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                    <i className={`mt-0.5 flex-shrink-0 text-sm ${resetMsgMap[doc.email].success !== false ? "ri-checkbox-circle-line text-amber-600" : "ri-error-warning-line text-red-500"}`}></i>
                    <div className="flex-1 min-w-0">
                      <p className="leading-relaxed">{resetMsgMap[doc.email].text}</p>
                      {resetMsgMap[doc.email].link && (
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(resetMsgMap[doc.email].link!);
                            }}
                            className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 text-white text-xs font-bold rounded-lg hover:bg-amber-800 cursor-pointer transition-colors"
                          >
                            <i className="ri-clipboard-line text-xs"></i>Copy Reset Link
                          </button>
                          <span className="text-xs text-amber-600 italic">Send this link to the provider if the email doesn&apos;t arrive</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateDoctorModal
          onClose={() => setShowCreate(false)}
          onCreated={(result) => {
            setShowCreate(false);
            setCreateMsg(`${result.full_name} (${result.email}) — provider added successfully.`);
            setTimeout(() => setCreateMsg(""), 7000);
            loadData();
            onProviderAdded?.();
          }}
        />
      )}

      {/* Edit States modal */}
      {statesModalDoc && (
        <EditStatesModal
          doctor={{
            profileId: statesModalDoc.profile?.id,
            contactId: statesModalDoc.contact?.id,
            name: statesModalDoc.name,
            email: statesModalDoc.email,
            currentStates: statesModalDoc.contact?.licensed_states ?? statesModalDoc.profile?.licensed_states ?? [],
          }}
          onClose={() => setStatesModalDoc(null)}
          onSaved={(name, count) => {
            setStatesModalDoc(null);
            setSavedMsg(`${name} — ${count} licensed states saved`);
            setTimeout(() => setSavedMsg(""), 4000);
            loadData();
          }}
        />
      )}

      {/* Delete modal */}
      {deleteDoc && (
        <DeleteProviderModal
          providerName={deleteDoc.name}
          providerEmail={deleteDoc.email}
          activeCases={deleteDoc.workload.active}
          onConfirm={() => handleDeleteProvider(deleteDoc)}
          onClose={() => setDeleteDoc(null)}
        />
      )}

      {/* Review Application modal */}
      {reviewingApp && (
        <ProviderApplicationModal
          application={reviewingApp}
          onClose={() => setReviewingApp(null)}
          onDone={(msg) => {
            setReviewingApp(null);
            setSavedMsg(msg);
            setTimeout(() => setSavedMsg(""), 6000);
            loadData();
            loadPendingApps();
            onProviderAdded?.();
          }}
        />
      )}
    </div>
  );
}
