// ProviderDrawer — Right-side sliding panel for full provider management.
// NEVER calls create-team-member or any team-member endpoint.
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";
import ImpersonateProviderView from "./ImpersonateProviderView";

type AvailabilityStatus = "active" | "at_capacity" | "inactive";

interface StateLicense { state: string; license_number: string; }

interface DoctorProfile {
  id: string; user_id: string; full_name: string; title: string | null;
  email: string | null; phone: string | null; license_number: string | null;
  npi_number: string | null; state_license_numbers: Record<string, string> | null;
  bio: string | null; is_admin: boolean; is_active: boolean;
  availability_status: AvailabilityStatus | null;
  licensed_states: string[] | null; per_order_rate: number | null;
  role: string | null; created_at: string; photo_url?: string;
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
interface ProviderNote {
  id: string; note_body: string; admin_name: string | null; admin_user_id: string | null; created_at: string;
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

const AVAIL_CONFIG: Record<AvailabilityStatus, { label: string; desc: string; icon: string; badge: string; btn: string }> = {
  active:      { label: "Active",       desc: "Accepting new assignments",          icon: "ri-checkbox-circle-fill",   badge: "bg-[#e8f5f1] text-[#3b6ea5] border-[#b8cce4]",       btn: "border-[#b8cce4] bg-[#e8f0f9] text-[#3b6ea5]" },
  at_capacity: { label: "At Capacity",  desc: "No new assignments — still visible", icon: "ri-time-line",              badge: "bg-amber-50 text-amber-700 border-amber-200",          btn: "border-amber-200 bg-amber-50 text-amber-700" },
  inactive:    { label: "Inactive",     desc: "Hidden from website + assignments",  icon: "ri-forbid-line",            badge: "bg-gray-100 text-gray-500 border-gray-200",            btn: "border-gray-200 bg-gray-50 text-gray-500" },
};

interface ProviderDrawerProps {
  doc: DoctorRow | null;
  pendingSetupIds: Set<string>;
  onClose: () => void;
  onRefresh: () => void;
  onOpenStates: (doc: DoctorRow) => void;
  onDelete: (doc: DoctorRow) => void;
  canDeleteProviders?: boolean;
}

export default function ProviderDrawer({ doc, pendingSetupIds, onClose, onRefresh, onOpenStates, onDelete, canDeleteProviders = true }: ProviderDrawerProps) {
  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const [activeTab, setActiveTab] = useState<"overview" | "notes" | "portal">("overview");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    full_name: "", phone: "", title: "", license_number: "", npi_number: "",
    bio: "", notes: "", per_order_rate: "", photo_url: "",
  });
  const [saving, setSaving] = useState(false);

  // Photo upload
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // Reset PW
  const [resetMsg, setResetMsg] = useState<{ text: string; link?: string; success?: boolean } | null>(null);
  const [resetSending, setResetSending] = useState(false);

  // Copy invite link
  const [copyingLink, setCopyingLink] = useState(false);
  const [copyLinkMsg, setCopyLinkMsg] = useState<{ text: string; success: boolean } | null>(null);

  // Auth email
  const [authEmailOpen, setAuthEmailOpen] = useState(false);
  const [authEmailInput, setAuthEmailInput] = useState("");
  const [authEmailSaving, setAuthEmailSaving] = useState(false);
  const [authEmailMsg, setAuthEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Actions
  const [resending, setResending] = useState(false);
  const [availSaving, setAvailSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [rateOpen, setRateOpen] = useState(false);
  const [rateInput, setRateInput] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // Notes tab
  const [providerNotes, setProviderNotes] = useState<ProviderNote[]>([]);
  const [noteInput, setNoteInput] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Helper: convert state_license_numbers object to array for display
  const objToStateLicenses = (obj: Record<string, string> | null): StateLicense[] => {
    if (!obj) return [];
    return Object.entries(obj).map(([state, license_number]) => ({ state, license_number }));
  };

  // Create portal for contact-only providers
  const [creatingPortal, setCreatingPortal] = useState(false);
  const [createPortalMsg, setCreatePortalMsg] = useState<{ text: string; success: boolean } | null>(null);

  useEffect(() => {
    if (doc) {
      setForm({
        full_name: doc.name,
        phone: doc.contact?.phone ?? doc.profile?.phone ?? "",
        title: doc.profile?.title ?? "",
        license_number: doc.profile?.license_number ?? "",
        npi_number: doc.profile?.npi_number ?? "",
        bio: doc.profile?.bio ?? "",
        notes: doc.contact?.notes ?? "",
        per_order_rate: doc.profile?.per_order_rate != null ? String(doc.profile.per_order_rate) : (doc.contact?.per_order_rate != null ? String(doc.contact.per_order_rate) : ""),
        photo_url: doc.profile?.photo_url ?? doc.contact?.photo_url ?? "",
      });
      setEditing(false);
      setResetMsg(null);
      setAuthEmailOpen(false);
      setRateOpen(false);
      setPhotoFile(null);
      setPhotoPreview(doc.profile?.photo_url ?? doc.contact?.photo_url ?? "");
      setActiveTab("overview");
      setProviderNotes([]);
      setNoteInput("");
      setCreatingPortal(false);
      setCreatePortalMsg(null);
    }
  }, [doc?.email]);

  useEffect(() => {
    if (activeTab === "notes" && doc) loadNotes();
  }, [activeTab, doc?.email]);

  const loadNotes = async () => {
    if (!doc) return;
    setLoadingNotes(true);
    const { data } = await supabase
      .from("provider_admin_notes")
      .select("id, note_body, admin_name, admin_user_id, created_at")
      .eq("provider_email", doc.email.toLowerCase())
      .order("created_at", { ascending: false });
    setProviderNotes((data as ProviderNote[]) ?? []);
    setLoadingNotes(false);
  };

  const handleSubmitNote = async () => {
    if (!doc || !noteInput.trim()) return;
    setSubmittingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    const adminName = user?.email ?? "Admin";
    const { error } = await supabase.from("provider_admin_notes").insert({
      provider_email: doc.email.toLowerCase(),
      note_body: noteInput.trim(),
      admin_user_id: user?.id ?? null,
      admin_name: adminName,
    });
    setSubmittingNote(false);
    if (!error) {
      setNoteInput("");
      loadNotes();
    } else {
      showToast("Failed to save note: " + error.message);
    }
  };

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 5000); };

  const handlePhotoFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPhotoPreview(e.target?.result as string ?? "");
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handlePhotoFile(file);
  }, [handlePhotoFile]);

  const uploadPhotoToStorage = async (file: File, email: string): Promise<string | null> => {
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const safeName = email.replace(/[^a-z0-9]/gi, "_");
      const path = `${safeName}.${ext}`;
      const { error } = await supabase.storage.from("provider-headshots").upload(path, file, { upsert: true, contentType: file.type });
      if (error) { console.error("Storage upload error:", error.message); return null; }
      const { data } = supabase.storage.from("provider-headshots").getPublicUrl(path);
      return data.publicUrl ?? null;
    } catch { return null; }
  };

  const handleSaveEdit = async () => {
    if (!doc) return;
    setSaving(true);
    let finalPhotoUrl = form.photo_url;
    if (photoFile) {
      setUploadingPhoto(true);
      const uploaded = await uploadPhotoToStorage(photoFile, doc.email);
      setUploadingPhoto(false);
      if (uploaded) { finalPhotoUrl = uploaded; setForm((f) => ({ ...f, photo_url: uploaded })); setPhotoPreview(uploaded); setPhotoFile(null); }
    }
    const updates: Promise<unknown>[] = [];
    const rate = form.per_order_rate !== "" ? parseInt(form.per_order_rate, 10) : null;
    const safeRate = (rate != null && !isNaN(rate) && rate >= 0) ? rate : null;
    if (doc.profile) {
      updates.push(supabase.from("doctor_profiles").update({
        full_name: form.full_name, phone: form.phone || null, title: form.title || null,
        license_number: form.license_number || null,
        npi_number: form.npi_number || null,
        bio: form.bio || null,
        photo_url: finalPhotoUrl || null, per_order_rate: safeRate,
      }).eq("id", doc.profile.id));
    }
    if (doc.contact) {
      updates.push(supabase.from("doctor_contacts").update({
        full_name: form.full_name, phone: form.phone || null,
        notes: form.notes || null, photo_url: finalPhotoUrl || null, per_order_rate: safeRate,
      }).eq("id", doc.contact.id));
    } else if (doc.profile) {
      updates.push(supabase.from("doctor_contacts").upsert({
        full_name: form.full_name, email: doc.email.toLowerCase(),
        phone: form.phone || null, licensed_states: doc.profile.licensed_states ?? [],
        is_active: doc.profile.is_active, notes: form.notes || null, per_order_rate: safeRate,
      }, { onConflict: "email" }));
    }
    await Promise.all(updates);
    setSaving(false);
    setEditing(false);
    showToast(`${form.full_name} profile saved.`);
    onRefresh();
  };

  const handleSetAvailability = async (status: AvailabilityStatus) => {
    if (!doc) return;
    setAvailSaving(true);
    const newIsActive = status !== "inactive";
    const updates: Promise<unknown>[] = [
      supabase.from("approved_providers").update({ is_active: newIsActive }).eq("email", doc.email),
    ];
    if (doc.profile) updates.push(supabase.from("doctor_profiles").update({ is_active: newIsActive, availability_status: status }).eq("id", doc.profile.id));
    if (doc.contact) updates.push(supabase.from("doctor_contacts").update({ is_active: newIsActive, availability_status: status }).eq("id", doc.contact.id));
    await Promise.all(updates);
    setAvailSaving(false);
    const cfg = AVAIL_CONFIG[status];
    showToast(`${doc.name} set to "${cfg.label}" — ${cfg.desc}.`);
    onRefresh();
  };

  const handleSendPasswordReset = async () => {
    if (!doc) return;
    setResetSending(true);
    setResetMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-send-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: doc.email, user_id: doc.profile?.user_id ?? undefined }),
      });
      let result: { ok?: boolean; error?: string; message?: string; action_link?: string; used_email?: string; email_sent?: boolean };
      try { result = await res.json(); }
      catch { setResetMsg({ text: `Server returned invalid response (HTTP ${res.status}). Please try again.`, success: false }); return; }
      if (!res.ok && !result.ok) {
        setResetMsg({ text: result.error ?? `Server error (${res.status})`, success: false });
        return;
      }
      const displayEmail = result.used_email ?? doc.email;
      setResetMsg(result.ok ? {
        text: result.email_sent
          ? `Reset email sent to ${displayEmail} via Resend — should arrive within a minute.`
          : `Reset link generated for ${displayEmail}. Email delivery unavailable — copy the fallback link below.`,
        link: result.action_link ?? undefined,
        success: true,
      } : { text: result.error ?? `Failed to send reset link (HTTP ${res.status})`, success: false });
    } catch (fetchErr) {
      setResetMsg({ text: `Network error: ${fetchErr instanceof Error ? fetchErr.message : "Unknown"}`, success: false });
    } finally { setResetSending(false); }
  };

  const handleUpdateAuthEmail = async () => {
    if (!doc) return;
    const newEmail = authEmailInput.trim().toLowerCase();
    if (!newEmail || !newEmail.includes("@")) return;
    setAuthEmailSaving(true); setAuthEmailMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-auth-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ current_email: doc.email, new_email: newEmail, user_id: doc.profile?.user_id ?? undefined, provider_name: doc.name }),
      });
      const result = await res.json() as { ok: boolean; error?: string; message?: string };
      setAuthEmailMsg({ ok: result.ok, text: result.ok ? (result.message ?? "Email updated.") : (result.error ?? "Failed to update email") });
      if (result.ok) { setAuthEmailOpen(false); setAuthEmailInput(""); showToast("Sign-in email updated."); onRefresh(); }
    } catch { setAuthEmailMsg({ ok: false, text: "Network error — could not reach server." }); }
    finally { setAuthEmailSaving(false); }
  };

  const handleResendInvite = async () => {
    if (!doc) return;
    setResending(true);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/create-provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: doc.email, full_name: doc.name,
          phone: doc.profile?.phone ?? doc.contact?.phone ?? null,
          licensed_states: doc.profile?.licensed_states ?? doc.contact?.licensed_states ?? [],
          per_order_rate: doc.profile?.per_order_rate ?? doc.contact?.per_order_rate ?? null,
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string };
      if (!result.ok) throw new Error(result.error ?? "Server error");
      showToast(`Invite resent to ${doc.email}.`);
    } catch (err) { showToast(`Could not resend invite: ${err instanceof Error ? err.message : "Unknown error"}`); }
    finally { setResending(false); }
  };

  const handleCopyInviteLink = async () => {
    if (!doc) return;
    setCopyingLink(true);
    setCopyLinkMsg(null);
    try {
      const token = await getAdminToken();
      await fetch(`${supabaseUrl}/functions/v1/create-provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: doc.email, full_name: doc.name,
          phone: doc.profile?.phone ?? doc.contact?.phone ?? null,
          licensed_states: doc.profile?.licensed_states ?? doc.contact?.licensed_states ?? [],
          per_order_rate: doc.profile?.per_order_rate ?? doc.contact?.per_order_rate ?? null,
        }),
      });
      const resetRes = await fetch(`${supabaseUrl}/functions/v1/admin-send-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: doc.email, user_id: doc.profile?.user_id ?? undefined }),
      });
      const resetResult = await resetRes.json() as { ok?: boolean; action_link?: string; error?: string };
      if (resetResult.ok && resetResult.action_link) {
        await navigator.clipboard.writeText(resetResult.action_link);
        setCopyLinkMsg({ text: "Invite link copied to clipboard! Valid for 1 hour.", success: true });
      } else {
        setCopyLinkMsg({ text: resetResult.error ?? "Could not generate invite link.", success: false });
      }
    } catch (err) {
      setCopyLinkMsg({ text: `Error: ${err instanceof Error ? err.message : "Unknown"}`, success: false });
    } finally {
      setCopyingLink(false);
      setTimeout(() => setCopyLinkMsg(null), 8000);
    }
  };

  const handleSaveRate = async () => {
    if (!doc) return;
    setSavingRate(true);
    const parsed = rateInput.trim() !== "" ? parseInt(rateInput, 10) : null;
    const rate = (parsed != null && !isNaN(parsed) && parsed >= 0) ? parsed : null;
    const updates: Promise<unknown>[] = [];
    if (doc.profile) updates.push(supabase.from("doctor_profiles").update({ per_order_rate: rate }).eq("id", doc.profile.id));
    if (doc.contact) updates.push(supabase.from("doctor_contacts").update({ per_order_rate: rate }).eq("id", doc.contact.id));
    await Promise.all(updates);
    setSavingRate(false); setRateOpen(false);
    showToast(rate != null ? `Rate set to $${rate}/order for ${doc.name}.` : `Rate cleared for ${doc.name}.`);
    onRefresh();
  };

  const handleCreatePortal = async () => {
    if (!doc) return;
    setCreatingPortal(true);
    setCreatePortalMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/create-provider`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: doc.email,
          full_name: doc.name,
          phone: doc.contact?.phone ?? null,
          licensed_states: doc.contact?.licensed_states ?? [],
          per_order_rate: doc.contact?.per_order_rate ?? null,
          bio: doc.contact?.notes ?? null,
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string; welcome_email_sent?: boolean };
      if (result.ok) {
        setCreatePortalMsg({
          text: result.welcome_email_sent
            ? `Portal created! Invite email sent to ${doc.email}. They can now log in at /provider-portal.`
            : `Portal account created for ${doc.email}. Email delivery unavailable — use "Copy Invite Link" to share manually.`,
          success: true,
        });
        onRefresh();
      } else {
        setCreatePortalMsg({ text: result.error ?? "Failed to create portal account.", success: false });
      }
    } catch (err) {
      setCreatePortalMsg({ text: `Network error: ${err instanceof Error ? err.message : "Unknown"}`, success: false });
    } finally {
      setCreatingPortal(false);
    }
  };

  const isOpen = !!doc;
  const availabilityStatus: AvailabilityStatus = (doc?.profile?.availability_status ?? doc?.contact?.availability_status ?? (doc?.profile?.is_active !== false && doc?.contact?.is_active !== false ? "active" : "inactive")) as AvailabilityStatus;
  const isActive = availabilityStatus !== "inactive";
  const isPendingSetup = !!doc?.profile && pendingSetupIds.has(doc.profile.user_id);
  const states = doc?.contact?.licensed_states ?? doc?.profile?.licensed_states ?? [];
  const currentRate = doc?.profile?.per_order_rate ?? doc?.contact?.per_order_rate ?? null;
  const estimatedEarnings = currentRate != null && doc ? currentRate * doc.workload.completed : null;
  const total = doc ? doc.workload.active + doc.workload.completed : 0;
  const completionRate = total > 0 && doc ? Math.round((doc.workload.completed / total) * 100) : 0;
  const initials = doc ? doc.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2) : "";
  const currentPhotoUrl = photoPreview || form.photo_url || doc?.profile?.photo_url || doc?.contact?.photo_url || "";
  const availCfg = AVAIL_CONFIG[availabilityStatus];

  // Get existing state licenses for view mode
  const existingStateLicenses = objToStateLicenses(doc?.profile?.state_license_numbers ?? null);

  return (
    <>
      <div
        className={`fixed inset-0 z-[200] bg-black/30 transition-opacity ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      <div className={`fixed top-0 right-0 h-full z-[201] w-full max-w-[500px] bg-white flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? "translate-x-0" : "translate-x-full"}`}>
        {!doc ? null : (
          <>
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <div className={`w-11 h-11 rounded-full flex-shrink-0 overflow-hidden border-2 ${isActive ? "border-[#b8cce4]" : "border-gray-200"}`}>
                {currentPhotoUrl ? (
                  <img src={currentPhotoUrl} alt={doc.name} className="w-full h-full object-cover object-top" />
                ) : (
                  <div className={`w-full h-full flex items-center justify-center text-sm font-extrabold ${isActive ? "bg-[#e8f5f1] text-[#3b6ea5]" : "bg-gray-100 text-gray-400"}`}>{initials}</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-extrabold text-gray-900 truncate">{doc.name}</p>
                  {doc.profile?.title && <span className="text-xs text-gray-400">{doc.profile.title}</span>}
                  <span className={`px-2 py-0.5 text-xs font-bold rounded-full border flex items-center gap-1 ${availCfg.badge}`}>
                    <i className={`${availCfg.icon} text-xs`}></i>{availCfg.label}
                  </span>
                  {isPendingSetup && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs font-bold rounded flex items-center gap-1"><i className="ri-time-line text-xs"></i>Pending setup</span>}
                </div>
                <p className="text-xs text-gray-400 truncate">{doc.email}</p>
              </div>
              <button type="button" onClick={onClose} className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 cursor-pointer transition-colors flex-shrink-0">
                <i className="ri-close-line text-gray-500 text-lg"></i>
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 flex-shrink-0 px-6">
              {(["overview", "notes", "portal"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-3 text-xs font-bold border-b-2 transition-colors cursor-pointer capitalize ${activeTab === tab ? "border-[#3b6ea5] text-[#3b6ea5]" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                >
                  <i className={tab === "overview" ? "ri-user-line" : tab === "notes" ? "ri-sticky-note-line" : "ri-eye-line"}></i>
                  {tab === "overview" ? "Overview" : tab === "notes" ? "Admin Notes" : "View Portal"}
                  {tab === "notes" && providerNotes.length > 0 && (
                    <span className="px-1.5 py-0.5 bg-[#e8f5f1] text-[#3b6ea5] text-xs font-extrabold rounded-full">{providerNotes.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Toast */}
            {toast && (
              <div className="mx-6 mt-3 flex-shrink-0 flex items-center gap-2 px-4 py-2.5 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl text-xs text-[#3b6ea5] font-semibold">
                <i className="ri-checkbox-circle-fill flex-shrink-0"></i>{toast}
              </div>
            )}

            {/* ══════════ OVERVIEW TAB ══════════ */}
            {activeTab === "overview" && (
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">

                {/* Profile */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Profile</p>
                    <button type="button" onClick={() => { setEditing((v) => !v); if (!editing) setPhotoPreview(form.photo_url || doc.profile?.photo_url || doc.contact?.photo_url || ""); }}
                      className={`whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer transition-colors ${editing ? "bg-gray-100 border-gray-200 text-gray-600" : "border-[#b8cce4] text-[#3b6ea5] bg-[#e8f0f9] hover:bg-[#e0f2ec]"}`}>
                      <i className={editing ? "ri-close-line" : "ri-pencil-line"}></i>{editing ? "Cancel" : "Edit"}
                    </button>
                  </div>
                  {editing ? (
                    <div className="space-y-3">
                      {/* Photo Upload */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Provider Headshot</label>
                        <div
                          className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer ${dragOver ? "border-[#3b6ea5] bg-[#e8f0f9]" : "border-gray-200 hover:border-gray-300 bg-gray-50"}`}
                          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={handleDrop}
                          onClick={() => photoInputRef.current?.click()}
                        >
                          {photoPreview ? (
                            <div className="flex items-center gap-3 p-3">
                              <div className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                                <img src={photoPreview} alt="Preview" className="w-full h-full object-cover object-top" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-700">{photoFile ? photoFile.name : "Current photo"}</p>
                                <p className="text-xs text-gray-400 mt-0.5">Click or drop to replace</p>
                                <button type="button" onClick={(e) => { e.stopPropagation(); setPhotoFile(null); setPhotoPreview(""); setForm((f) => ({ ...f, photo_url: "" })); }}
                                  className="whitespace-nowrap mt-1 text-xs text-red-500 hover:text-red-700 font-semibold cursor-pointer">Remove photo</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center py-5 gap-2">
                              <div className="w-9 h-9 flex items-center justify-center bg-gray-100 rounded-xl">
                                <i className="ri-image-add-line text-gray-400 text-lg"></i>
                              </div>
                              <div className="text-center">
                                <p className="text-xs font-semibold text-gray-600">Drop photo here or click to upload</p>
                                <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WebP — max 5MB</p>
                              </div>
                            </div>
                          )}
                          <input ref={photoInputRef} type="file" accept="image/*" className="sr-only"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); }} />
                        </div>
                        {uploadingPhoto && <div className="mt-1.5 flex items-center gap-2 text-xs text-[#3b6ea5] font-semibold"><i className="ri-loader-4-line animate-spin"></i>Uploading...</div>}
                      </div>

                      {[
                        { label: "Full Name", key: "full_name", type: "text", placeholder: "Dr. Jane Smith" },
                        { label: "Phone", key: "phone", type: "tel", placeholder: "+1 (555) 000-0000" },
                        { label: "Title / Credentials", key: "title", type: "text", placeholder: "PhD, LCSW, MD" },
                      ].map(({ label, key, type, placeholder }) => (
                        <div key={key}>
                          <label className="block text-xs font-semibold text-gray-500 mb-1">{label}</label>
                          <input type={type} value={form[key as keyof typeof form]}
                            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                            placeholder={placeholder}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                        </div>
                      ))}

                      {/* NPI Number */}
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">
                          NPI Number
                          <span className="ml-1 text-gray-400 font-normal">(National Provider Identifier)</span>
                        </label>
                        <input type="text" value={form.npi_number}
                          onChange={(e) => setForm((f) => ({ ...f, npi_number: e.target.value }))}
                          placeholder="e.g. 1234567890"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                      </div>

                      {/* State License Numbers — managed via Manage States */}
                      <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-start gap-2">
                        <i className="ri-information-line text-[#3b6ea5] text-sm flex-shrink-0 mt-0.5"></i>
                        <p className="text-xs text-[#3b6ea5]/80 leading-relaxed">
                          State license numbers are managed in <strong>Manage States</strong> — click the &quot;Manage States&quot; button below to add or update license numbers per state.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Bio <span className="font-normal text-gray-400">(shown to customers)</span></label>
                        <textarea value={form.bio} onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                          placeholder="Short professional summary..." rows={3} maxLength={500}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] resize-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Internal Notes</label>
                        <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                          placeholder="Quick admin-only note"
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Per-Order Rate ($)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-bold">$</span>
                          <input type="number" min="0" value={form.per_order_rate}
                            onChange={(e) => setForm((f) => ({ ...f, per_order_rate: e.target.value }))}
                            placeholder="e.g. 30"
                            className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                        </div>
                      </div>
                      <button type="button" onClick={handleSaveEdit} disabled={saving || uploadingPhoto}
                        className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                        {saving || uploadingPhoto ? <><i className="ri-loader-4-line animate-spin"></i>{uploadingPhoto ? "Uploading..." : "Saving..."}</> : <><i className="ri-save-line"></i>Save Changes</>}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {currentPhotoUrl && (
                        <div className="mb-3 flex items-center gap-3">
                          <div className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
                            <img src={currentPhotoUrl} alt={doc.name} className="w-full h-full object-cover object-top" />
                          </div>
                          <p className="text-xs text-gray-400">Provider headshot</p>
                        </div>
                      )}
                      {[
                        { label: "Email", value: doc.email },
                        { label: "Phone", value: doc.contact?.phone ?? doc.profile?.phone ?? "—" },
                        { label: "Title", value: doc.profile?.title ?? "—" },
                        { label: "Portal", value: doc.profile ? "Account active" : "No portal account" },
                        { label: "Member Since", value: doc.profile?.created_at ? new Date(doc.profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—" },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex items-start justify-between gap-4">
                          <span className="text-xs text-gray-400 flex-shrink-0 w-24">{label}</span>
                          <span className="text-xs font-semibold text-gray-700 text-right">{value}</span>
                        </div>
                      ))}

                      {/* NPI Number */}
                      <div className="flex items-start justify-between gap-4">
                        <span className="text-xs text-gray-400 flex-shrink-0 w-24">NPI #</span>
                        <span className="text-xs font-semibold text-gray-700 text-right font-mono">
                          {doc.profile?.npi_number ?? "—"}
                        </span>
                      </div>

                      {/* State License Numbers */}
                      {existingStateLicenses.length > 0 && (
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs font-bold text-gray-500 mb-2">State License Numbers</p>
                          <div className="space-y-1.5">
                            {existingStateLicenses.map(({ state, license_number }) => (
                              <div key={state} className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-1.5">
                                <span className="text-xs font-bold text-gray-600 uppercase w-8 flex-shrink-0">{state}</span>
                                <span className="text-xs font-mono text-gray-700 flex-1 text-right">{license_number}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1.5">Used for customer license verification</p>
                        </div>
                      )}

                      {doc.profile?.bio && (
                        <div className="pt-2 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 mb-1">Bio</p>
                          <p className="text-xs text-gray-600 leading-relaxed">{doc.profile.bio}</p>
                        </div>
                      )}
                      {doc.contact?.notes && doc.contact.notes.trim() !== (doc.profile?.bio ?? "").trim() && (
                        <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-1">
                          <p className="text-xs font-bold text-amber-700 mb-0.5">Internal Note</p>
                          <p className="text-xs text-amber-800 leading-relaxed">{doc.contact.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Licensed States */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Licensed States <span className="text-[#3b6ea5] font-extrabold ml-1">{states.length}</span></p>
                    <button type="button" onClick={() => onOpenStates(doc)}
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] cursor-pointer transition-colors">
                      <i className="ri-map-pin-add-line"></i>Manage States
                    </button>
                  </div>
                  {states.length === 0 ? (
                    <p className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">No licensed states — provider cannot receive case assignments.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {states.map((s) => {
                        const abbr = US_STATES_ABBR.find((u) => u.name === s)?.abbr ?? s;
                        return <span key={s} className="px-2 py-0.5 bg-[#e8f0f9] text-[#3b6ea5] border border-[#b8cce4] rounded-full text-xs font-semibold">{abbr}</span>;
                      })}
                    </div>
                  )}
                </div>

                {/* Payout & Workload */}
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Payout &amp; Workload</p>
                    <button type="button" onClick={() => { setRateOpen((v) => !v); setRateInput(currentRate != null ? String(currentRate) : ""); }}
                      className="whitespace-nowrap flex items-center gap-1.5 px-3 py-1.5 border border-[#b8cce4] text-[#3b6ea5] bg-[#e8f0f9] text-xs font-bold rounded-lg hover:bg-[#e0f2ec] cursor-pointer transition-colors">
                      <i className="ri-money-dollar-circle-line"></i>{currentRate != null ? `$${currentRate}/order` : "Set rate"}
                    </button>
                  </div>
                  {rateOpen && (
                    <div className="mb-3 p-3 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3b6ea5] font-bold text-sm">$</span>
                          <input type="number" min="0" value={rateInput} onChange={(e) => setRateInput(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleSaveRate(); if (e.key === "Escape") setRateOpen(false); }}
                            placeholder="e.g. 30" autoFocus
                            className="w-full pl-7 pr-3 py-2 border border-[#b8cce4] rounded-lg text-sm font-bold focus:outline-none focus:border-[#3b6ea5] bg-white text-[#3b6ea5]" />
                        </div>
                        <button type="button" onClick={handleSaveRate} disabled={savingRate}
                          className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer">
                          {savingRate ? <i className="ri-loader-4-line animate-spin"></i> : "Save"}
                        </button>
                        <button type="button" onClick={() => setRateOpen(false)} className="whitespace-nowrap text-xs text-gray-500 hover:text-gray-700 cursor-pointer px-2 py-2">Cancel</button>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Active Cases", value: doc.workload.active, color: "text-sky-600" },
                      { label: "Completed", value: doc.workload.completed, color: "text-[#3b6ea5]" },
                      { label: "Est. Earned", value: estimatedEarnings != null ? `$${estimatedEarnings}` : "—", color: "text-[#3b6ea5]" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-gray-50 rounded-xl border border-gray-100 p-3 text-center">
                        <p className={`text-lg font-extrabold ${color}`}>{value}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  {total > 0 && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>Completion rate</span><span className="font-bold">{completionRate}%</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div className="bg-[#3b6ea5] h-1.5 rounded-full" style={{ width: `${completionRate}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Account Actions — for providers WITH a portal */}
                {doc.profile && (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Account Actions</p>
                    <div className="space-y-2">
                      <button type="button" onClick={handleResendInvite} disabled={resending}
                        className="whitespace-nowrap w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50">
                        <div className="w-7 h-7 flex items-center justify-center bg-[#e8f0f9] rounded-lg flex-shrink-0">
                          <i className="ri-mail-send-line text-[#3b6ea5] text-sm"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{resending ? "Sending invite..." : "Resend Portal Invite"}</p>
                          <p className="text-xs text-gray-400">Send a fresh account setup email</p>
                        </div>
                        {resending && <i className="ri-loader-4-line animate-spin text-[#3b6ea5] flex-shrink-0"></i>}
                      </button>

                      <button type="button" onClick={handleCopyInviteLink} disabled={copyingLink}
                        className="whitespace-nowrap w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50">
                        <div className="w-7 h-7 flex items-center justify-center bg-sky-50 rounded-lg flex-shrink-0">
                          <i className="ri-links-line text-sky-600 text-sm"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{copyingLink ? "Generating link..." : "Copy Invite Link"}</p>
                          <p className="text-xs text-gray-400">Copy setup link to share manually</p>
                        </div>
                        {copyingLink && <i className="ri-loader-4-line animate-spin text-sky-600 flex-shrink-0"></i>}
                      </button>
                      {copyLinkMsg && (
                        <div className={`px-4 py-3 rounded-xl border text-xs font-semibold ${copyLinkMsg.success ? "bg-sky-50 text-sky-800 border-sky-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                          <div className="flex items-start gap-2">
                            <i className={`mt-0.5 flex-shrink-0 text-sm ${copyLinkMsg.success ? "ri-checkbox-circle-line text-sky-600" : "ri-error-warning-line text-red-500"}`}></i>
                            <p className="leading-relaxed">{copyLinkMsg.text}</p>
                          </div>
                        </div>
                      )}

                      <button type="button" onClick={handleSendPasswordReset} disabled={resetSending}
                        className="whitespace-nowrap w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 cursor-pointer transition-colors disabled:opacity-50">
                        <div className="w-7 h-7 flex items-center justify-center bg-amber-50 rounded-lg flex-shrink-0">
                          <i className="ri-key-2-line text-amber-600 text-sm"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{resetSending ? "Sending..." : "Send Password Reset"}</p>
                          <p className="text-xs text-gray-400">Email a secure reset link to the provider</p>
                        </div>
                        {resetSending && <i className="ri-loader-4-line animate-spin text-amber-600 flex-shrink-0"></i>}
                      </button>
                      {resetMsg && (
                        <div className={`px-4 py-3 rounded-xl border text-xs font-semibold ${resetMsg.success !== false ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                          <div className="flex items-start gap-2">
                            <i className={`mt-0.5 flex-shrink-0 text-sm ${resetMsg.success !== false ? "ri-checkbox-circle-line text-amber-600" : "ri-error-warning-line text-red-500"}`}></i>
                            <p className="leading-relaxed">{resetMsg.text}</p>
                          </div>
                          {resetMsg.link && (
                            <button type="button" onClick={() => navigator.clipboard.writeText(resetMsg.link!)}
                              className="whitespace-nowrap mt-2 flex items-center gap-1.5 px-3 py-1.5 bg-amber-700 text-white text-xs font-bold rounded-lg cursor-pointer hover:bg-amber-800">
                              <i className="ri-clipboard-line"></i>Copy Reset Link
                            </button>
                          )}
                        </div>
                      )}

                      <button type="button" onClick={() => { setAuthEmailOpen((v) => !v); setAuthEmailInput(""); setAuthEmailMsg(null); }}
                        className="whitespace-nowrap w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 text-left hover:bg-gray-50 cursor-pointer transition-colors">
                        <div className="w-7 h-7 flex items-center justify-center bg-violet-50 rounded-lg flex-shrink-0">
                          <i className="ri-mail-settings-line text-violet-600 text-sm"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">Change Sign-in Email</p>
                          <p className="text-xs text-gray-400">Update the Supabase auth email (login email)</p>
                        </div>
                        <i className={`${authEmailOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} text-gray-400 flex-shrink-0`}></i>
                      </button>
                      {authEmailOpen && (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl px-4 py-4">
                          <p className="text-xs text-violet-700 mb-2">Current: <strong>{doc.email}</strong></p>
                          <div className="flex items-center gap-2">
                            <input type="email" value={authEmailInput} onChange={(e) => setAuthEmailInput(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleUpdateAuthEmail(); if (e.key === "Escape") setAuthEmailOpen(false); }}
                              placeholder="new@email.com" autoFocus
                              className="flex-1 px-3 py-2 border border-violet-200 rounded-lg text-sm focus:outline-none focus:border-violet-500 bg-white" />
                            <button type="button" onClick={handleUpdateAuthEmail} disabled={authEmailSaving || !authEmailInput.includes("@")}
                              className="whitespace-nowrap flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white text-xs font-bold rounded-lg disabled:opacity-50 cursor-pointer hover:bg-violet-700">
                              {authEmailSaving ? <i className="ri-loader-4-line animate-spin"></i> : "Update"}
                            </button>
                          </div>
                          {authEmailMsg && (
                            <p className={`mt-2 text-xs font-semibold ${authEmailMsg.ok ? "text-emerald-700" : "text-red-600"}`}>{authEmailMsg.text}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Account Actions — for contact-only providers (No Portal) */}
                {!doc.profile && doc.contact && (
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Portal Access</p>
                    <p className="text-xs text-gray-400 mb-3">
                      This provider doesn&apos;t have a portal account yet. Create one to give them access to the provider portal.
                    </p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={handleCreatePortal}
                        disabled={creatingPortal}
                        className="whitespace-nowrap w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#b8cce4] bg-[#e8f0f9] text-left hover:bg-[#e0f2ec] cursor-pointer transition-colors disabled:opacity-50"
                      >
                        <div className="w-7 h-7 flex items-center justify-center bg-[#3b6ea5] rounded-lg flex-shrink-0">
                          <i className="ri-user-add-line text-white text-sm"></i>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#3b6ea5]">
                            {creatingPortal ? "Creating portal account..." : "Create Portal Account"}
                          </p>
                          <p className="text-xs text-gray-400">Sends invite email &amp; activates provider login</p>
                        </div>
                        {creatingPortal
                          ? <i className="ri-loader-4-line animate-spin text-[#3b6ea5] flex-shrink-0"></i>
                          : <i className="ri-arrow-right-line text-[#3b6ea5] text-sm flex-shrink-0"></i>
                        }
                      </button>
                      {createPortalMsg && (
                        <div className={`px-4 py-3 rounded-xl border text-xs font-semibold ${createPortalMsg.success ? "bg-[#e8f0f9] text-[#3b6ea5] border-[#b8cce4]" : "bg-red-50 text-red-700 border-red-200"}`}>
                          <div className="flex items-start gap-2">
                            <i className={`mt-0.5 flex-shrink-0 text-sm ${createPortalMsg.success ? "ri-checkbox-circle-fill text-[#3b6ea5]" : "ri-error-warning-line text-red-500"}`}></i>
                            <p className="leading-relaxed">{createPortalMsg.text}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Availability & Access */}
                <div className="border-t border-gray-100 pt-4 pb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Availability &amp; Access</p>
                  <p className="text-xs text-gray-400 mb-3">Controls whether this provider receives new case assignments and appears on the website.</p>

                  <div className="space-y-1.5 mb-4">
                    {(["active", "at_capacity", "inactive"] as AvailabilityStatus[]).map((status) => {
                      const cfg = AVAIL_CONFIG[status];
                      const isCurrent = availabilityStatus === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => !isCurrent && handleSetAvailability(status)}
                          disabled={availSaving || isCurrent}
                          className={`whitespace-nowrap w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors cursor-pointer disabled:cursor-default ${isCurrent ? `${cfg.btn} border-current` : "border-gray-200 hover:bg-gray-50 text-gray-600"}`}
                        >
                          <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${isCurrent ? "bg-white/60" : "bg-gray-100"}`}>
                            <i className={`${cfg.icon} text-sm ${isCurrent ? "" : "text-gray-400"}`}></i>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${isCurrent ? "" : "text-gray-600"}`}>{cfg.label}</p>
                            <p className={`text-xs ${isCurrent ? "opacity-70" : "text-gray-400"}`}>{cfg.desc}</p>
                          </div>
                          {isCurrent && <span className="text-xs font-bold opacity-70 flex-shrink-0">Current</span>}
                          {availSaving && !isCurrent && <i className="ri-loader-4-line animate-spin text-gray-400 flex-shrink-0"></i>}
                        </button>
                      );
                    })}
                  </div>

                  {canDeleteProviders ? (
                    <button type="button" onClick={() => onDelete(doc)}
                      className="whitespace-nowrap w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-red-200 text-left hover:bg-red-50 cursor-pointer transition-colors">
                      <div className="w-7 h-7 flex items-center justify-center bg-red-50 rounded-lg flex-shrink-0">
                        <i className="ri-delete-bin-6-line text-red-500 text-sm"></i>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-red-700">Delete Provider</p>
                        <p className="text-xs text-gray-400">Permanently removes account — past orders preserved</p>
                      </div>
                    </button>
                  ) : (
                    <div
                      title="Admin access required"
                      className="whitespace-nowrap w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50 text-left opacity-60 cursor-not-allowed">
                      <div className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg flex-shrink-0">
                        <i className="ri-lock-line text-gray-400 text-sm"></i>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-500">Delete Provider</p>
                        <p className="text-xs text-gray-400">Admin access required</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════ NOTES TAB ══════════ */}
            {activeTab === "notes" && (
              <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Add Admin Note</p>
                  <p className="text-xs text-gray-400 mb-3">Private — only visible to admin users. Timestamped automatically.</p>
                  <textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Enter note about this provider..."
                    rows={3}
                    maxLength={1000}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5] resize-none bg-white"
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{noteInput.length}/1000</span>
                    <button
                      type="button"
                      onClick={handleSubmitNote}
                      disabled={submittingNote || !noteInput.trim()}
                      className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      {submittingNote ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</> : <><i className="ri-sticky-note-add-line"></i>Post Note</>}
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                    Notes History {providerNotes.length > 0 && <span className="text-[#3b6ea5] ml-1">{providerNotes.length}</span>}
                  </p>
                  {loadingNotes ? (
                    <div className="flex items-center justify-center py-10">
                      <i className="ri-loader-4-line animate-spin text-[#3b6ea5] text-xl"></i>
                    </div>
                  ) : providerNotes.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-gray-200 rounded-xl">
                      <i className="ri-sticky-note-line text-2xl text-gray-300 block mb-2"></i>
                      <p className="text-sm font-semibold text-gray-400">No notes yet</p>
                      <p className="text-xs text-gray-400 mt-1">Add a note above to get started.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {providerNotes.map((note) => (
                        <div key={note.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 flex items-center justify-center bg-[#e8f5f1] rounded-full">
                                <i className="ri-admin-line text-[#3b6ea5] text-xs"></i>
                              </div>
                              <span className="text-xs font-semibold text-gray-700">{note.admin_name ?? "Admin"}</span>
                            </div>
                            <span className="text-xs text-gray-400 flex-shrink-0">
                              {new Date(note.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                              {" · "}
                              {new Date(note.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{note.note_body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════ PORTAL VIEW TAB ══════════ */}
            {activeTab === "portal" && doc?.profile && (
              <div className="flex-1 overflow-y-auto px-4 py-4 bg-[#f8f7f4]">
                <ImpersonateProviderView
                  provider={{
                    user_id: doc.profile.user_id,
                    full_name: doc.profile.full_name,
                    email: doc.profile.email,
                    per_order_rate: doc.profile.per_order_rate,
                    photo_url: doc.profile.photo_url,
                  }}
                />
              </div>
            )}
            {activeTab === "portal" && !doc?.profile && (
              <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mb-4">
                  <i className="ri-user-forbid-line text-gray-400 text-2xl"></i>
                </div>
                <p className="text-sm font-bold text-gray-700 mb-1">No Portal Account</p>
                <p className="text-xs text-gray-400 max-w-[240px]">
                  This provider doesn&apos;t have a portal account yet. They need to complete setup before you can view their portal.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
