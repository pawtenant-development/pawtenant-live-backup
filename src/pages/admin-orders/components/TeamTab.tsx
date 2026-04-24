// TeamTab — Staff management with proper role system
import { useState, useEffect, useRef } from "react";
import { supabase, getAdminToken } from "../../../lib/supabaseClient";
import { logAudit } from "../../../lib/auditLogger";
import { canManageTeam, ADMIN_REQUIRED_LABEL } from "../../../lib/adminPermissions";

// All admin portal tabs that can be toggled per member.
// Keys MUST match the TabKey union in ../page.tsx (dashboard/orders/analytics/
// comms/chats/contacts/customers/doctors/earnings/payments/team/audit/
// settings/health) so the sidebar's visibleTabs filter respects them.
const ALL_TABS = [
  { key: "orders",      label: "Orders",       icon: "ri-shopping-bag-line" },
  { key: "customers",   label: "Customers",    icon: "ri-user-3-line" },
  { key: "doctors",     label: "Providers",    icon: "ri-stethoscope-line" },
  { key: "payments",    label: "Payments",     icon: "ri-bank-card-line" },
  { key: "analytics",   label: "Analytics",    icon: "ri-bar-chart-2-line" },
  { key: "comms",       label: "Communication", icon: "ri-message-3-line" },
  { key: "chats",       label: "Chats",        icon: "ri-chat-3-line" },
  { key: "contacts",    label: "Contacts",     icon: "ri-mail-line" },
  { key: "team",        label: "Team",         icon: "ri-team-line" },
  { key: "settings",    label: "Settings",     icon: "ri-settings-3-line" },
  { key: "audit",       label: "Audit Log",    icon: "ri-file-list-3-line" },
  { key: "health",      label: "System Health",icon: "ri-heart-pulse-line" },
] as const;

type TabKey = typeof ALL_TABS[number]["key"];

// Default tab access per role
const ROLE_DEFAULT_TABS: Record<string, TabKey[]> = {
  owner:         ["orders","customers","doctors","payments","analytics","comms","chats","contacts","team","settings","audit","health"],
  admin_manager: ["orders","customers","doctors","payments","analytics","comms","chats","contacts","team","settings","audit","health"],
  support:       ["orders","customers","comms","chats","contacts","audit"],
  finance:       ["payments","analytics","audit"],
  read_only:     ["orders","customers","analytics","audit"],
  provider:      [],
};

interface TeamMember {
  id: string;
  user_id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  is_admin: boolean;
  is_active: boolean;
  role: string | null;
  custom_tab_access: TabKey[] | null;
}

interface AddMemberForm {
  full_name: string;
  email: string;
  title: string;
  role: string;
}

const INIT_FORM: AddMemberForm = { full_name: "", email: "", title: "", role: "admin_manager" };

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: string; desc: string; isAdmin: boolean }> = {
  owner:         { label: "Owner",     color: "bg-[#f3e8ff] text-[#7c3aed]",         icon: "ri-vip-crown-line",          desc: "Full control + billing",        isAdmin: true },
  admin_manager: { label: "Admin",     color: "bg-[#dbeafe] text-[#3b6ea5]",          icon: "ri-shield-star-line",         desc: "Full dashboard access",          isAdmin: true },
  support:       { label: "Support",   color: "bg-cyan-100 text-cyan-700",             icon: "ri-customer-service-2-line",  desc: "Orders & customers only",        isAdmin: true },
  finance:       { label: "Finance",   color: "bg-emerald-100 text-emerald-700",       icon: "ri-money-dollar-circle-line", desc: "Payments & refunds only",        isAdmin: true },
  read_only:     { label: "Read Only", color: "bg-gray-100 text-gray-600",             icon: "ri-eye-line",                 desc: "View access only",               isAdmin: true },
  provider:      { label: "Provider",  color: "bg-amber-100 text-amber-700",           icon: "ri-stethoscope-line",         desc: "Doctor portal only",             isAdmin: false },
};

// Roles available when inviting — owner sees all including "owner" role
// Admin sees all except "owner"
const TEAM_INVITE_ROLES_OWNER = ["owner", "admin_manager", "support", "finance", "read_only"] as const;
const TEAM_INVITE_ROLES_ADMIN = ["admin_manager", "support", "finance", "read_only"] as const;

const PERMISSIONS: { module: string; owner: string; admin_manager: string; support: string; finance: string; read_only: string; provider: string }[] = [
  { module: "Orders",    owner: "Full", admin_manager: "Full",  support: "Edit",  finance: "View",  read_only: "View",  provider: "—" },
  { module: "Customers", owner: "Full", admin_manager: "Full",  support: "View",  finance: "View",  read_only: "View",  provider: "—" },
  { module: "Doctors",   owner: "Full", admin_manager: "Full",  support: "View",  finance: "—",     read_only: "View",  provider: "—" },
  { module: "Payments",  owner: "Full", admin_manager: "Full",  support: "—",     finance: "Full",  read_only: "View",  provider: "—" },
  { module: "Refunds",   owner: "Full", admin_manager: "Full",  support: "—",     finance: "Full",  read_only: "—",     provider: "—" },
  { module: "Settings",  owner: "Full", admin_manager: "Full",  support: "—",     finance: "—",     read_only: "—",     provider: "—" },
  { module: "Team",      owner: "Full", admin_manager: "Full",  support: "—",     finance: "—",     read_only: "—",     provider: "—" },
  { module: "Audit Log", owner: "View", admin_manager: "View",  support: "View",  finance: "View",  read_only: "View",  provider: "—" },
];

function PermValue({ v }: { v: string }) {
  if (v === "Full") return <span className="text-xs font-bold text-[#3b6ea5]">Full</span>;
  if (v === "View") return <span className="text-xs text-gray-500">View</span>;
  if (v === "Edit") return <span className="text-xs font-semibold text-sky-600">Edit</span>;
  return <span className="text-xs text-gray-300">—</span>;
}

// ── Tab Access Editor Modal ──────────────────────────────────────────────────
function TabAccessEditor({
  member,
  onClose,
  onSaved,
}: {
  member: TeamMember;
  onClose: () => void;
  onSaved: (updated: TeamMember) => void;
}) {
  const roleDefaults = ROLE_DEFAULT_TABS[member.role ?? "read_only"] ?? [];
  const initialTabs: TabKey[] = member.custom_tab_access ?? roleDefaults;
  const [selected, setSelected] = useState<Set<TabKey>>(new Set(initialTabs));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const toggle = (key: TabKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSaved(false);
  };

  const resetToRoleDefaults = () => {
    setSelected(new Set(roleDefaults));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const tabs = Array.from(selected) as TabKey[];
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ custom_tab_access: tabs })
      .eq("id", member.id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      onSaved({ ...member, custom_tab_access: tabs });
      setTimeout(() => { setSaved(false); onClose(); }, 1200);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/40 z-[120] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 flex items-center justify-center bg-[#e8f0f9] rounded-xl flex-shrink-0">
            <i className="ri-layout-grid-line text-[#3b6ea5] text-lg"></i>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest mb-0.5">Tab Access</p>
            <h2 className="text-base font-extrabold text-gray-900 truncate">{member.full_name}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer flex-shrink-0"
          >
            <i className="ri-close-line text-gray-500 text-lg"></i>
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Info */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
            <i className="ri-information-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
            <p className="text-xs text-amber-800 leading-relaxed">
              Choose exactly which tabs <strong>{member.full_name}</strong> can see in the admin portal. This overrides their role defaults.
            </p>
          </div>

          {/* Role badge + reset */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${ROLE_CONFIG[member.role ?? "read_only"]?.color ?? "bg-gray-100 text-gray-600"}`}>
                <i className={`${ROLE_CONFIG[member.role ?? "read_only"]?.icon ?? "ri-user-line"} text-xs`}></i>
                {ROLE_CONFIG[member.role ?? "read_only"]?.label ?? member.role}
              </span>
              <span className="text-xs text-gray-400">role defaults: {roleDefaults.length} tabs</span>
            </div>
            <button
              type="button"
              onClick={resetToRoleDefaults}
              className="whitespace-nowrap text-xs font-semibold text-[#3b6ea5] hover:underline cursor-pointer"
            >
              Reset to role defaults
            </button>
          </div>

          {/* Tab toggles */}
          <div className="grid grid-cols-2 gap-2">
            {ALL_TABS.map((tab) => {
              const isOn = selected.has(tab.key);
              const isDefault = roleDefaults.includes(tab.key);
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => toggle(tab.key)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 transition-all cursor-pointer text-left ${
                    isOn
                      ? "border-[#3b6ea5] bg-[#e8f0f9]"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 ${isOn ? "bg-[#3b6ea5]/10" : "bg-gray-100"}`}>
                    <i className={`${tab.icon} text-sm ${isOn ? "text-[#3b6ea5]" : "text-gray-400"}`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold leading-tight ${isOn ? "text-[#3b6ea5]" : "text-gray-600"}`}>{tab.label}</p>
                    {!isDefault && isOn && (
                      <p className="text-xs text-amber-600 leading-tight mt-0.5">Custom</p>
                    )}
                    {isDefault && !isOn && (
                      <p className="text-xs text-gray-400 leading-tight mt-0.5">Removed</p>
                    )}
                  </div>
                  <div className={`w-4 h-4 flex items-center justify-center rounded-full flex-shrink-0 ${isOn ? "bg-[#3b6ea5]" : "bg-gray-200"}`}>
                    {isOn && <i className="ri-check-line text-white" style={{ fontSize: "9px" }}></i>}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Summary */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <p className="text-xs text-gray-500">
              <strong className="text-gray-700">{selected.size}</strong> of {ALL_TABS.length} tabs enabled
              {selected.size === 0 && <span className="text-red-500 ml-2">— this member won&apos;t see any tabs!</span>}
            </p>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || saved}
            className={`whitespace-nowrap flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-lg cursor-pointer transition-colors disabled:opacity-60 ${
              saved ? "bg-[#e8f0f9] text-[#3b6ea5] border border-[#b8cce4]" : "bg-[#3b6ea5] text-white hover:bg-[#2d5a8e]"
            }`}
          >
            {saving
              ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</>
              : saved
              ? <><i className="ri-checkbox-circle-fill"></i>Saved!</>
              : <><i className="ri-save-line"></i>Save Access</>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamTab() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [form, setForm] = useState<AddMemberForm>(INIT_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resetSendingId, setResetSendingId] = useState<string | null>(null);
  const [resetMsgMap, setResetMsgMap] = useState<Record<string, { text: string; link?: string }>>({});
  const [successMsg, setSuccessMsg] = useState("");
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string; role: string; user_id: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [tabAccessMember, setTabAccessMember] = useState<TeamMember | null>(null);
  const [changeEmailMemberId, setChangeEmailMemberId] = useState<string | null>(null);
  const [changeEmailValue, setChangeEmailValue] = useState("");
  const [changeEmailSaving, setChangeEmailSaving] = useState(false);
  const [changeEmailMsg, setChangeEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const loadMembers = async () => {
    setLoading(true);
    // Load ONLY team members (admin roles). Providers are managed separately in the Providers tab.
    const { data } = await supabase
      .from("doctor_profiles")
      .select("id, user_id, full_name, title, email, phone, is_admin, is_active, role")
      .eq("is_admin", true)
      .order("full_name");
    setMembers((data as TeamMember[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("doctor_profiles").select("id, full_name, role").eq("user_id", user.id).maybeSingle()
          .then(({ data }) => {
            if (data) {
              const d = data as { id: string; full_name: string; role: string };
              setCurrentUser({ id: d.id, user_id: user.id, full_name: d.full_name, role: d.role ?? "admin_manager" });
            }
          });
      }
    });
  }, []);

  const handleRoleChange = async (member: TeamMember, newRole: string) => {
    if (!canManageTeam(currentUser?.role ?? null)) {
      setSuccessMsg(ADMIN_REQUIRED_LABEL);
      setTimeout(() => setSuccessMsg(""), 4000);
      return;
    }
    setTogglingId(member.id);
    const cfg = ROLE_CONFIG[newRole] ?? ROLE_CONFIG.provider;
    const oldRole = member.role ?? "admin_manager";
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ role: newRole, is_admin: cfg.isAdmin })
      .eq("id", member.id);
    if (!error) {
      setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, role: newRole, is_admin: cfg.isAdmin } : m));
      if (currentUser) {
        await logAudit({
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          object_type: "staff",
          object_id: member.email ?? member.id,
          action: "role_changed",
          description: `Changed ${member.full_name}'s role from ${oldRole} to ${newRole}`,
          old_values: { role: oldRole, is_admin: member.is_admin },
          new_values: { role: newRole, is_admin: cfg.isAdmin },
        });
      }
    }
    setTogglingId(null);
  };

  const handleToggleActive = async (member: TeamMember) => {
    if (!canManageTeam(currentUser?.role ?? null)) {
      setSuccessMsg(ADMIN_REQUIRED_LABEL);
      setTimeout(() => setSuccessMsg(""), 4000);
      return;
    }
    setTogglingId(member.id);
    const newActive = !member.is_active;
    const { error } = await supabase
      .from("doctor_profiles")
      .update({ is_active: newActive })
      .eq("id", member.id);
    if (!error) {
      setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, is_active: newActive } : m));
      if (currentUser) {
        await logAudit({
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          object_type: "staff",
          object_id: member.email ?? member.id,
          action: "active_toggled",
          description: `${newActive ? "Activated" : "Deactivated"} account for ${member.full_name}`,
          old_values: { is_active: member.is_active },
          new_values: { is_active: newActive },
        });
      }
    }
    setTogglingId(null);
  };

  const handleSendPasswordReset = async (member: TeamMember) => {
    if (!member.email) return;
    setResetSendingId(member.id);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-send-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: member.email }),
      });
      const result = await res.json() as { ok?: boolean; error?: string; message?: string; action_link?: string };
      const entry = result.ok
        ? { text: "Reset link sent!", link: result.action_link ?? undefined }
        : { text: result.error ?? "Failed to send reset" };
      setResetMsgMap((prev) => ({ ...prev, [member.id]: entry }));
      setTimeout(() => setResetMsgMap((prev) => { const next = { ...prev }; delete next[member.id]; return next; }), 8000);
    } catch {
      setResetMsgMap((prev) => ({ ...prev, [member.id]: { text: "Network error" } }));
    } finally {
      setResetSendingId(null);
    }
  };

  // ── Change email for owner (self only) ──────────────────────────────────
  const handleChangeEmail = async (member: TeamMember) => {
    if (!changeEmailValue.trim() || !changeEmailValue.includes("@")) {
      setChangeEmailMsg({ ok: false, text: "Please enter a valid email address." });
      return;
    }
    setChangeEmailSaving(true);
    setChangeEmailMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-auth-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId: member.user_id, newEmail: changeEmailValue.trim() }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (result.ok) {
        // Also update doctor_profiles email
        await supabase.from("doctor_profiles").update({ email: changeEmailValue.trim() }).eq("id", member.id);
        setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, email: changeEmailValue.trim() } : m));
        setChangeEmailMsg({ ok: true, text: "Email updated successfully. A verification email may be sent." });
        setTimeout(() => { setChangeEmailMemberId(null); setChangeEmailMsg(null); setChangeEmailValue(""); }, 3000);
      } else {
        setChangeEmailMsg({ ok: false, text: result.error ?? "Failed to update email." });
      }
    } catch {
      setChangeEmailMsg({ ok: false, text: "Network error. Please try again." });
    }
    setChangeEmailSaving(false);
  };

  const handleDeleteMember = async (member: TeamMember) => {
    // Owner account can NEVER be deleted — not even by admins
    if (member.role === "owner") {
      setSuccessMsg("The owner account cannot be deleted.");
      setTimeout(() => setSuccessMsg(""), 4000);
      setDeleteConfirmId(null);
      return;
    }
    // Only owner can delete other owners/admins; admins can delete non-owner members
    const currentIsOwner = currentUser?.role === "owner";
    const currentIsAdmin = currentUser?.role === "admin_manager";
    if (!currentIsOwner && !currentIsAdmin) {
      setSuccessMsg("You don't have permission to delete team members.");
      setTimeout(() => setSuccessMsg(""), 4000);
      setDeleteConfirmId(null);
      return;
    }
    setDeletingId(member.id);
    const { error } = await supabase
      .from("doctor_profiles")
      .delete()
      .eq("id", member.id);

    if (!error) {
      setMembers((prev) => prev.filter((m) => m.id !== member.id));
      setDeleteConfirmId(null);

      // Delete the Supabase auth user + write HIPAA audit log via edge function
      if (member.user_id) {
        try {
          const token = await getAdminToken();
          const delRes = await fetch(`${supabaseUrl}/functions/v1/delete-auth-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              userId: member.user_id,
              entityType: "team_member",
              entityName: `${member.full_name} (${member.email ?? "no email"})`,
              reason: `Team member deleted by ${currentUser?.role ?? "admin"}. Role: ${member.role ?? "unknown"}`,
            }),
          });
          const delResult = await delRes.json() as { ok?: boolean; error?: string; message?: string };
          if (!delResult.ok) {
            setSuccessMsg(`${member.full_name} removed from team. ⚠️ Auth deletion failed: ${delResult.error ?? "unknown error"} — go to System Health → Auth Cleanup to remove the login manually.`);
            setTimeout(() => setSuccessMsg(""), 12000);
          } else {
            setSuccessMsg(`${member.full_name} has been removed from the team and their Supabase login permanently deleted.`);
            setTimeout(() => setSuccessMsg(""), 6000);
          }
        } catch (e) {
          console.error("[TeamTab] delete-auth-user network error:", e);
          setSuccessMsg(`${member.full_name} removed from team. ⚠️ Could not reach delete function — go to System Health → Auth Cleanup to remove their login.`);
          setTimeout(() => setSuccessMsg(""), 12000);
        }
      } else {
        setSuccessMsg(`${member.full_name} has been removed from the team (no auth account to delete).`);
        setTimeout(() => setSuccessMsg(""), 6000);
      }
    } else {
      setSuccessMsg(`Failed to delete: ${error.message}`);
      setTimeout(() => setSuccessMsg(""), 5000);
    }
    setDeletingId(null);
  };

  const handleCreateMember = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      setFormError("Name and email are required.");
      return;
    }
    // Admins cannot promote to owner
    if (currentUser?.role !== "owner" && form.role === "owner") {
      setFormError("Only the owner can assign the Owner role.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const token = await getAdminToken();
      const cfg = ROLE_CONFIG[form.role] ?? ROLE_CONFIG.admin_manager;
      const res = await fetch(`${supabaseUrl}/functions/v1/create-team-member`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          title: form.title.trim() || null,
          is_admin: cfg.isAdmin,
        }),
      });
      const result = await res.json() as { ok: boolean; error?: string; invite_sent?: boolean };
      if (!result.ok) throw new Error(result.error ?? "Failed to send invite");

      // Update role after creation — retry up to 3 times to handle async profile creation
      let roleUpdated = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        const { error: roleErr, count } = await supabase.from("doctor_profiles")
          .update({ role: form.role, is_admin: cfg.isAdmin })
          .eq("email", form.email.trim())
          .select("id", { count: "exact", head: true });
        if (!roleErr && (count ?? 0) > 0) { roleUpdated = true; break; }
      }
      if (!roleUpdated) {
        // Fallback: find by user metadata from auth
        await supabase.from("doctor_profiles")
          .update({ role: form.role, is_admin: cfg.isAdmin })
          .ilike("email", form.email.trim());
      }

      if (currentUser) {
        await logAudit({
          actor_id: currentUser.id,
          actor_name: currentUser.full_name,
          actor_role: currentUser.role,
          object_type: "staff",
          object_id: form.email.trim(),
          action: "staff_invited",
          description: `Invited ${form.full_name} (${form.email}) with role: ${cfg.label}`,
          new_values: { full_name: form.full_name, email: form.email, role: form.role },
        });
      }

      const msg = result.invite_sent
        ? `Invite sent to ${form.email} — they'll set their own password.`
        : `${form.full_name} updated successfully.`;
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(""), 9000);
      setShowModal(false);
      setForm(INIT_FORM);
      loadMembers();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    }
    setSubmitting(false);
  };

  const roleGroups = {
    admin: members.filter((m) => m.is_admin),
    provider: members.filter((m) => !m.is_admin),
  };

  // Tab access alone is not enough to manage team members — only owner and
  // admin_manager may edit roles, tab access, invite, deactivate, or delete.
  // Non-admin viewers (support/finance/read_only with Team tab access) see a
  // read-only staff directory.
  const canManage = canManageTeam(currentUser?.role ?? null);

  return (
    <div>
      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total Staff",         value: members.length,                                                                          icon: "ri-team-line",           color: "text-gray-700",     bg: "bg-gray-50",       border: "border-gray-200" },
            { label: "Admin Portal Access", value: members.filter((m) => m.is_admin).length,                                                icon: "ri-shield-star-line",    color: "text-[#3b6ea5]",   bg: "bg-[#e8f0f9]",     border: "border-[#b8cce4]" },
            { label: "Active Accounts",     value: members.filter((m) => m.is_active).length,                                               icon: "ri-checkbox-circle-line", color: "text-emerald-600", bg: "bg-emerald-50",    border: "border-emerald-200" },
            { label: "Owners / Admins",     value: members.filter((m) => ["owner", "admin_manager"].includes(m.role ?? "")).length,          icon: "ri-vip-crown-line",      color: "text-amber-600",    bg: "bg-amber-50",      border: "border-amber-200" },
          ].map((s) => (
            <div key={s.label} className={`bg-white rounded-xl border ${s.border} p-4`}>
              <div className={`w-9 h-9 flex items-center justify-center ${s.bg} rounded-xl mb-3`}>
                <i className={`${s.icon} ${s.color} text-base`}></i>
              </div>
              <p className={`text-2xl font-extrabold ${s.color} leading-none mb-1`}>{s.value}</p>
              <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {successMsg && (
        <div className="mb-4 bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-start gap-3">
          <i className="ri-checkbox-circle-fill text-[#3b6ea5] text-base mt-0.5 flex-shrink-0"></i>
          <p className="text-sm text-[#3b6ea5] font-semibold">{successMsg}</p>
        </div>
      )}

      {/* Security roadmap notice */}
      <div className="mb-5 bg-[#f3e8ff] border border-[#d8b4fe] rounded-xl px-4 py-3 flex items-start gap-3">
        <div className="w-8 h-8 flex items-center justify-center bg-[#ede9fe] rounded-lg flex-shrink-0 mt-0.5">
          <i className="ri-shield-keyhole-line text-[#7c3aed] text-base"></i>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-extrabold text-[#6d28d9] mb-0.5">Enhanced Security — Coming Soon</p>
          <p className="text-xs text-[#7c3aed] leading-relaxed">
            <strong>Email OTP verification</strong> and <strong>Google Authenticator (TOTP)</strong> will be added as login methods for all team members and admins. Owner account is fully protected — it cannot be deleted by anyone.
          </p>
        </div>
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-extrabold text-gray-900">Internal Staff &amp; Role Management</h2>
          <p className="text-xs text-gray-500 mt-0.5 max-w-lg">Invite internal staff, assign dashboard roles, and control access levels. To add a licensed provider, use the <strong className="text-[#3b6ea5]">Providers tab</strong>.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowMatrix((v) => !v)}
            className={`whitespace-nowrap flex items-center gap-2 px-3 py-2.5 border text-sm font-bold rounded-xl cursor-pointer transition-colors ${showMatrix ? "bg-gray-100 border-gray-300 text-gray-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
            <i className="ri-grid-line"></i><span className="hidden sm:inline">Permissions</span>
          </button>
          {/* Owner AND admins can invite new team members */}
          {(currentUser?.role === "owner" || currentUser?.role === "admin_manager") && (
            <button type="button" onClick={() => setShowModal(true)}
              className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl hover:bg-[#2d5a8e] cursor-pointer transition-colors">
              <i className="ri-user-add-line"></i><span>Invite Member</span>
            </button>
          )}
        </div>
      </div>

      {/* Permissions matrix */}
      {showMatrix && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Permissions Matrix</p>
            <button type="button" onClick={() => setShowMatrix(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-400 cursor-pointer transition-colors">
              <i className="ri-close-line text-sm"></i>
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider w-28">Module</th>
                  {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                    <th key={key} className="px-3 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.color}`}>
                        <i className={`${cfg.icon} text-xs`}></i>{cfg.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {PERMISSIONS.map((row) => (
                  <tr key={row.module} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-700">{row.module}</td>
                    <td className="px-3 py-2.5 text-center"><PermValue v={row.owner} /></td>
                    <td className="px-3 py-2.5 text-center"><PermValue v={row.admin_manager} /></td>
                    <td className="px-3 py-2.5 text-center"><PermValue v={row.support} /></td>
                    <td className="px-3 py-2.5 text-center"><PermValue v={row.finance} /></td>
                    <td className="px-3 py-2.5 text-center"><PermValue v={row.read_only} /></td>
                    <td className="px-3 py-2.5 text-center"><PermValue v={row.provider} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">Role-based access enforcement is currently informational. Full UI-level gating can be added per module as needed.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#3b6ea5]"></i>
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded-xl mx-auto mb-3">
            <i className="ri-team-line text-gray-400 text-xl"></i>
          </div>
          <p className="text-sm font-bold text-gray-700">No team members yet</p>
          <p className="text-xs text-gray-400 mt-1">Invite your first staff member above.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Table header — desktop only */}
          <div className="hidden lg:grid grid-cols-[2fr_1.8fr_0.8fr_180px_auto] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <span>Name</span><span>Email</span><span>Title</span><span>Role</span><span>Status &amp; Actions</span>
          </div>
          <div className="divide-y divide-gray-100">
            {members.map((member) => {
              const roleCfg = ROLE_CONFIG[member.role ?? (member.is_admin ? "admin_manager" : "provider")] ?? ROLE_CONFIG.provider;
              const currentRole = member.role ?? (member.is_admin ? "admin_manager" : "provider");

              return (
                <div key={member.id}
                  className={`px-4 py-4 transition-colors ${!member.is_active ? "opacity-60 bg-gray-50/50" : "hover:bg-gray-50/30"}`}>
                  {/* Desktop layout */}
                  <div className="hidden lg:grid grid-cols-[2fr_1.8fr_0.8fr_180px_auto] gap-4 items-center">
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 text-sm font-extrabold ${member.is_active ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-gray-100 text-gray-400"}`}>
                        {member.full_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{member.full_name}</p>
                        {member.custom_tab_access && (
                          <p className="text-xs text-[#3b6ea5] mt-0.5 flex items-center gap-1">
                            <i className="ri-layout-grid-line" style={{ fontSize: "10px" }}></i>
                            <span>{member.custom_tab_access.length} custom tabs</span>
                          </p>
                        )}
                      </div>
                    </div>
                    {/* Email */}
                    <div className="text-xs text-gray-500 truncate">{member.email ?? "—"}</div>
                    {/* Title */}
                    <div className="text-xs text-gray-500 truncate">{member.title ?? <span className="text-gray-300">—</span>}</div>
                    {/* Role selector — read-only pill for non-admins */}
                    <div>
                      {canManage ? (
                        <div className="relative inline-block">
                          <select value={currentRole}
                            onChange={(e) => handleRoleChange(member, e.target.value)}
                            disabled={togglingId === member.id}
                            className={`appearance-none pl-3 pr-7 py-1.5 rounded-full text-xs font-bold cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-[#3b6ea5]/20 disabled:opacity-50 ${roleCfg.color}`}>
                            {(currentUser?.role === "owner" ? TEAM_INVITE_ROLES_OWNER : TEAM_INVITE_ROLES_ADMIN).map((key) => {
                              const cfg = ROLE_CONFIG[key];
                              return <option key={key} value={key} className="bg-white text-gray-800 font-normal">{cfg.label} — {cfg.desc}</option>;
                            })}
                          </select>
                          <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                            {togglingId === member.id
                              ? <i className="ri-loader-4-line animate-spin text-current" style={{ fontSize: "10px" }}></i>
                              : <i className="ri-arrow-down-s-line text-current" style={{ fontSize: "10px" }}></i>
                            }
                          </div>
                        </div>
                      ) : (
                        <span
                          title={ADMIN_REQUIRED_LABEL}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${roleCfg.color}`}>
                          <i className={`${roleCfg.icon} text-xs`}></i>
                          {roleCfg.label}
                        </span>
                      )}
                    </div>
                    {/* Status + actions — all in one row, no wrapping */}
                    <div className="flex items-center gap-1.5 flex-nowrap">
                      <span className={`text-xs font-semibold whitespace-nowrap ${member.is_active ? "text-emerald-600" : "text-gray-400"}`}>
                        {member.is_active ? "Active" : "Inactive"}
                      </span>
                      {/* Owner cannot be deactivated; non-admins cannot deactivate anyone */}
                      {member.role !== "owner" && canManage && (
                        <button type="button" onClick={() => handleToggleActive(member)} disabled={togglingId === member.id}
                          className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ${member.is_active ? "bg-[#3b6ea5]" : "bg-gray-300"}`}>
                          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${member.is_active ? "translate-x-4" : "translate-x-0.5"}`}></div>
                        </button>
                      )}
                      {canManage && (
                        <>
                          <div className="w-px h-4 bg-gray-200 mx-0.5 flex-shrink-0"></div>
                          <button type="button" onClick={() => setTabAccessMember(member)} title="Edit tab access"
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#b8cce4] text-[#3b6ea5] bg-[#e8f0f9] hover:bg-[#dbeafe] cursor-pointer transition-colors flex-shrink-0">
                            <i className="ri-layout-grid-line text-xs"></i>
                          </button>
                          {/* Owner row: only show Change Email (no password reset, no delete) */}
                          {member.role === "owner" ? (
                            <button type="button"
                              onClick={() => { setChangeEmailMemberId(member.id); setChangeEmailValue(member.email ?? ""); setChangeEmailMsg(null); }}
                              title="Change owner email"
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-[#b8cce4] text-[#3b6ea5] bg-[#e8f0f9] hover:bg-[#dbeafe] cursor-pointer transition-colors flex-shrink-0">
                              <i className="ri-mail-settings-line text-xs"></i>
                            </button>
                          ) : (
                            <>
                              <button type="button" onClick={() => handleSendPasswordReset(member)} disabled={resetSendingId === member.id}
                                title="Send password reset"
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100 cursor-pointer transition-colors disabled:opacity-50 flex-shrink-0">
                                {resetSendingId === member.id
                                  ? <i className="ri-loader-4-line animate-spin text-xs"></i>
                                  : <i className="ri-key-2-line text-xs"></i>
                                }
                              </button>
                              <button type="button" onClick={() => setDeleteConfirmId(member.id)} title="Remove member"
                                className="w-7 h-7 flex items-center justify-center rounded-lg border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 cursor-pointer transition-colors flex-shrink-0">
                                <i className="ri-delete-bin-line text-xs"></i>
                              </button>
                            </>
                          )}
                        </>
                      )}
                      {!canManage && (
                        <span className="ml-1 text-[10px] font-semibold text-gray-400 whitespace-nowrap" title={ADMIN_REQUIRED_LABEL}>
                          <i className="ri-lock-line mr-0.5"></i>View only
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mobile layout — card style */}
                  <div className="lg:hidden">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0 text-sm font-extrabold ${member.is_active ? "bg-[#e8f0f9] text-[#3b6ea5]" : "bg-gray-100 text-gray-400"}`}>
                        {member.full_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{member.full_name}</p>
                          <div className="flex items-center gap-1.5">
                            <span className={`text-xs font-semibold ${member.is_active ? "text-emerald-600" : "text-gray-400"}`}>
                              {member.is_active ? "Active" : "Inactive"}
                            </span>
                            {member.role !== "owner" && canManage && (
                              <button type="button" onClick={() => handleToggleActive(member)} disabled={togglingId === member.id}
                                className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ${member.is_active ? "bg-[#3b6ea5]" : "bg-gray-300"}`}>
                                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${member.is_active ? "translate-x-4" : "translate-x-0.5"}`}></div>
                              </button>
                            )}
                          </div>
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{member.email ?? "—"}</p>
                        {member.title && <p className="text-xs text-gray-400">{member.title}</p>}
                        {/* Role selector — read-only pill for non-admins */}
                        <div className="mt-2">
                          {canManage ? (
                            <div className="relative inline-block">
                              <select value={currentRole}
                                onChange={(e) => handleRoleChange(member, e.target.value)}
                                disabled={togglingId === member.id}
                                className={`appearance-none pl-3 pr-7 py-1.5 rounded-full text-xs font-bold cursor-pointer border-0 focus:outline-none disabled:opacity-50 ${roleCfg.color}`}>
                                {(currentUser?.role === "owner" ? TEAM_INVITE_ROLES_OWNER : TEAM_INVITE_ROLES_ADMIN).map((key) => {
                                  const cfg = ROLE_CONFIG[key];
                                  return <option key={key} value={key} className="bg-white text-gray-800 font-normal">{cfg.label} — {cfg.desc}</option>;
                                })}
                              </select>
                              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                                <i className="ri-arrow-down-s-line text-current" style={{ fontSize: "10px" }}></i>
                              </div>
                            </div>
                          ) : (
                            <span
                              title={ADMIN_REQUIRED_LABEL}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${roleCfg.color}`}>
                              <i className={`${roleCfg.icon} text-xs`}></i>
                              {roleCfg.label}
                            </span>
                          )}
                        </div>
                        {/* Mobile action buttons — hidden for non-admin viewers */}
                        {canManage ? (
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <button type="button" onClick={() => setTabAccessMember(member)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#b8cce4] text-[#3b6ea5] bg-[#e8f0f9] text-xs font-semibold cursor-pointer">
                              <i className="ri-layout-grid-line text-xs"></i>Tabs
                            </button>
                            {member.role === "owner" ? (
                              <button type="button"
                                onClick={() => { setChangeEmailMemberId(member.id); setChangeEmailValue(member.email ?? ""); setChangeEmailMsg(null); }}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#b8cce4] text-[#3b6ea5] bg-[#e8f0f9] text-xs font-semibold cursor-pointer">
                                <i className="ri-mail-settings-line text-xs"></i>Change Email
                              </button>
                            ) : (
                              <>
                                <button type="button" onClick={() => handleSendPasswordReset(member)} disabled={resetSendingId === member.id}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-200 text-amber-600 bg-amber-50 text-xs font-semibold cursor-pointer disabled:opacity-50">
                                  {resetSendingId === member.id
                                    ? <i className="ri-loader-4-line animate-spin text-xs"></i>
                                    : <i className="ri-key-2-line text-xs"></i>
                                  }
                                  Reset
                                </button>
                                <button type="button" onClick={() => setDeleteConfirmId(member.id)}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 bg-red-50 text-xs font-semibold cursor-pointer">
                                  <i className="ri-delete-bin-line text-xs"></i>Remove
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-gray-400" title={ADMIN_REQUIRED_LABEL}>
                            <i className="ri-lock-line"></i>View only · {ADMIN_REQUIRED_LABEL}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Reset message */}
                  {resetMsgMap[member.id] && (
                    <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${resetMsgMap[member.id].text === "Reset link sent!" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                      <i className={`mt-0.5 flex-shrink-0 ${resetMsgMap[member.id].text === "Reset link sent!" ? "ri-checkbox-circle-line" : "ri-error-warning-line"}`}></i>
                      <div>
                        <p>{resetMsgMap[member.id].text}</p>
                        {resetMsgMap[member.id].link && (
                          <button type="button" onClick={() => navigator.clipboard.writeText(resetMsgMap[member.id].link!)}
                            className="underline cursor-pointer hover:text-amber-800 font-bold mt-1">
                            Copy reset link to clipboard
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Login link */}
      <div className="mt-6 bg-[#1e3a5f] rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-white mb-0.5">Admin Login Portal URL</p>
          <p className="text-xs text-white/50">Share with new team members for dashboard access.</p>
        </div>
        <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5 font-mono text-xs text-white/70 select-all break-all">
          {typeof window !== "undefined" ? window.location.origin : ""}/admin-login
        </div>
      </div>

      {/* Tab Access Editor Modal */}
      {tabAccessMember && (
        <TabAccessEditor
          member={tabAccessMember}
          onClose={() => setTabAccessMember(null)}
          onSaved={(updated) => {
            setMembers((prev) => prev.map((m) => m.id === updated.id ? updated : m));
            setTabAccessMember(null);
            setSuccessMsg(`Tab access updated for ${updated.full_name}.`);
            setTimeout(() => setSuccessMsg(""), 4000);
          }}
        />
      )}

      {/* Change Email Modal (owner only) */}
      {changeEmailMemberId && (() => {
        const member = members.find((m) => m.id === changeEmailMemberId);
        if (!member) return null;
        return (
          <div className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-[#e8f0f9] rounded-xl flex-shrink-0">
                  <i className="ri-mail-settings-line text-[#3b6ea5] text-lg"></i>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest mb-0.5">Owner Account</p>
                  <h2 className="text-base font-extrabold text-gray-900">Change Email Address</h2>
                </div>
                <button type="button" onClick={() => { setChangeEmailMemberId(null); setChangeEmailMsg(null); setChangeEmailValue(""); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer flex-shrink-0">
                  <i className="ri-close-line text-gray-500 text-lg"></i>
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                  <i className="ri-information-line text-amber-600 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Changing the owner email will update both the login credentials and the profile. A verification email may be sent to the new address.
                    <br /><strong className="mt-1 block">Email OTP verification will be enforced once that feature is live.</strong>
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Current Email</label>
                  <p className="text-sm text-gray-500 font-mono bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">{member.email ?? "—"}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">New Email Address <span className="text-red-400">*</span></label>
                  <input
                    type="email"
                    value={changeEmailValue}
                    onChange={(e) => setChangeEmailValue(e.target.value)}
                    placeholder="new@email.com"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]"
                  />
                </div>
                {changeEmailMsg && (
                  <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold border ${changeEmailMsg.ok ? "bg-[#e8f0f9] text-[#3b6ea5] border-[#b8cce4]" : "bg-red-50 text-red-700 border-red-200"}`}>
                    <i className={`mt-0.5 flex-shrink-0 ${changeEmailMsg.ok ? "ri-checkbox-circle-line" : "ri-error-warning-line"}`}></i>
                    {changeEmailMsg.text}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex items-center gap-2">
                <button type="button" onClick={() => handleChangeEmail(member)} disabled={changeEmailSaving || !changeEmailValue.trim()}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-xl hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                  {changeEmailSaving ? <><i className="ri-loader-4-line animate-spin"></i>Saving...</> : <><i className="ri-save-line"></i>Update Email</>}
                </button>
                <button type="button" onClick={() => { setChangeEmailMemberId(null); setChangeEmailMsg(null); setChangeEmailValue(""); }}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (() => {
        const member = members.find((m) => m.id === deleteConfirmId);
        if (!member) return null;
        // Safety net: block owner deletion at UI level too
        const isOwner = member.role === "owner";
        return (
          <div className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0 ${isOwner ? "bg-[#f3e8ff]" : "bg-red-100"}`}>
                    <i className={`text-lg ${isOwner ? "ri-vip-crown-fill text-[#7c3aed]" : "ri-delete-bin-fill text-red-600"}`}></i>
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-gray-900">
                      {isOwner ? "Cannot Remove Owner" : "Remove Team Member?"}
                    </h2>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      {isOwner
                        ? "The owner account is protected and cannot be deleted by anyone — including admins."
                        : <>This will remove <strong>{member.full_name}</strong> from the team. Their login access will be revoked immediately.</>
                      }
                    </p>
                  </div>
                </div>
              </div>
              {!isOwner && (
                <div className="px-6 py-4 bg-red-50 border-b border-red-100">
                  <div className="space-y-1 text-xs text-red-700">
                    <p className="flex items-center gap-1.5"><i className="ri-user-line"></i><strong>{member.full_name}</strong></p>
                    {member.email && <p className="flex items-center gap-1.5"><i className="ri-mail-line"></i>{member.email}</p>}
                    <p className="flex items-center gap-1.5"><i className="ri-shield-line"></i>Role: {ROLE_CONFIG[member.role ?? "provider"]?.label ?? member.role}</p>
                    <p className="flex items-center gap-1.5 font-semibold mt-1"><i className="ri-logout-box-r-line"></i>Supabase login account will also be deleted</p>
                  </div>
                </div>
              )}
              <div className="px-6 py-4 flex items-center gap-2">
                {!isOwner && (
                  <button type="button" onClick={() => handleDeleteMember(member)} disabled={deletingId === member.id}
                    className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors">
                    {deletingId === member.id
                      ? <><i className="ri-loader-4-line animate-spin"></i>Removing...</>
                      : <><i className="ri-delete-bin-line"></i>Yes, Remove</>
                    }
                  </button>
                )}
                <button type="button" onClick={() => setDeleteConfirmId(null)}
                  className={`whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors ${isOwner ? "bg-[#e8f0f9] border-[#b8cce4] text-[#3b6ea5] font-bold" : ""}`}>
                  {isOwner ? "Got it" : "Cancel"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Invite Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden">
            {/* Modal header */}
            <div className="px-6 py-5 border-b border-gray-100 flex items-center gap-3">
              <div className="w-10 h-10 flex items-center justify-center bg-[#e8f0f9] rounded-xl flex-shrink-0">
                <i className="ri-user-add-line text-[#3b6ea5] text-lg"></i>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[#3b6ea5] font-bold uppercase tracking-widest mb-0.5">Invite</p>
                <h2 className="text-base font-extrabold text-gray-900">Add Internal Staff Member</h2>
              </div>
              <button type="button" onClick={() => { setShowModal(false); setForm(INIT_FORM); setFormError(""); }}
                className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer flex-shrink-0">
                <i className="ri-close-line text-gray-500 text-lg"></i>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Info notice */}
              <div className="bg-[#e8f0f9] border border-[#b8cce4] rounded-xl px-4 py-3 flex items-start gap-2.5">
                <i className="ri-mail-send-line text-[#3b6ea5] text-sm mt-0.5 flex-shrink-0"></i>
                <p className="text-xs text-[#3b6ea5] leading-relaxed">An <strong>invite email</strong> will be sent automatically. They click the link to set their own password.</p>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <i className="ri-error-warning-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-red-700">{formError}</p>
                </div>
              )}

              {/* Name + Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="Jane Smith"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">Email Address <span className="text-red-400">*</span></label>
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="jane@pawtenant.com"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Title <span className="text-gray-400 font-normal">(optional)</span></label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Operations Manager, Support Specialist..."
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#3b6ea5]" />
              </div>

              {/* Role selection — owner sees all roles, admin sees all except owner */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Role <span className="text-red-400">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {(currentUser?.role === "owner" ? TEAM_INVITE_ROLES_OWNER : TEAM_INVITE_ROLES_ADMIN).map((key) => {
                    const cfg = ROLE_CONFIG[key];
                    const isSelected = form.role === key;
                    return (
                      <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, role: key }))}
                        className={`whitespace-nowrap flex items-start gap-2.5 p-3 rounded-xl border-2 transition-all cursor-pointer text-left ${isSelected ? "border-[#3b6ea5] bg-[#e8f0f9]" : "border-gray-200 hover:border-gray-300 bg-white"}`}>
                        <div className={`w-7 h-7 flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5 ${isSelected ? "bg-[#3b6ea5]/10" : "bg-gray-100"}`}>
                          <i className={`${cfg.icon} text-sm ${isSelected ? "text-[#3b6ea5]" : "text-gray-400"}`}></i>
                        </div>
                        <div className="min-w-0">
                          <p className={`text-xs font-bold leading-tight ${isSelected ? "text-[#3b6ea5]" : "text-gray-700"}`}>{cfg.label}</p>
                          <p className="text-xs text-gray-400 leading-tight mt-0.5">{cfg.desc}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {currentUser?.role !== "owner" && (
                  <div className="mt-2.5 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <i className="ri-information-line text-amber-600 flex-shrink-0 mt-0.5 text-xs"></i>
                    <p className="text-xs text-amber-700">Only the <strong>Owner</strong> can assign the Owner role.</p>
                  </div>
                )}
                <div className="mt-2 flex items-start gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <i className="ri-information-line text-gray-400 flex-shrink-0 mt-0.5 text-xs"></i>
                  <p className="text-xs text-gray-500">
                    To add a licensed provider, use the <strong>Providers tab</strong> instead.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setShowModal(false); setForm(INIT_FORM); setFormError(""); }}
                className="whitespace-nowrap px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer transition-colors">Cancel</button>
              <button type="button" onClick={handleCreateMember} disabled={submitting}
                className="whitespace-nowrap flex items-center gap-2 px-5 py-2.5 bg-[#3b6ea5] text-white text-sm font-bold rounded-lg hover:bg-[#2d5a8e] disabled:opacity-50 cursor-pointer transition-colors">
                {submitting ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</> : <><i className="ri-mail-send-line"></i>Send Invite</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
