// TeamTab — Staff management with proper role system
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { logAudit } from "../../../lib/auditLogger";

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
  admin_manager: { label: "Admin",     color: "bg-[#e8f5f1] text-[#1a5c4f]",          icon: "ri-shield-star-line",         desc: "Full dashboard access",          isAdmin: true },
  support:       { label: "Support",   color: "bg-cyan-100 text-cyan-700",             icon: "ri-customer-service-2-line",  desc: "Orders & customers only",        isAdmin: true },
  finance:       { label: "Finance",   color: "bg-emerald-100 text-emerald-700",       icon: "ri-money-dollar-circle-line", desc: "Payments & refunds only",        isAdmin: true },
  read_only:     { label: "Read Only", color: "bg-gray-100 text-gray-600",             icon: "ri-eye-line",                 desc: "View access only",               isAdmin: true },
  provider:      { label: "Provider",  color: "bg-amber-100 text-amber-700",           icon: "ri-stethoscope-line",         desc: "Doctor portal only",             isAdmin: false },
};

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
  if (v === "Full") return <span className="text-xs font-bold text-[#1a5c4f]">Full</span>;
  if (v === "View") return <span className="text-xs text-gray-500">View</span>;
  if (v === "Edit") return <span className="text-xs font-semibold text-sky-600">Edit</span>;
  return <span className="text-xs text-gray-300">—</span>;
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
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string; role: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL as string;

  const loadMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("doctor_profiles")
      .select("id, user_id, full_name, title, email, phone, is_admin, is_active, role")
      .order("is_admin", { ascending: false })
      .order("full_name");
    setMembers((data as TeamMember[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadMembers();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from("doctor_profiles").select("full_name, role").eq("user_id", user.id).maybeSingle()
          .then(({ data }) => {
            if (data) setCurrentUser({ id: user.id, full_name: (data as { full_name: string; role: string }).full_name, role: (data as { full_name: string; role: string }).role ?? "admin_manager" });
          });
      }
    });
  }, []);

  const handleRoleChange = async (member: TeamMember, newRole: string) => {
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
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
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

  const handleDeleteMember = async (member: TeamMember) => {
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
          const { data: { session: freshSession } } = await supabase.auth.getSession();
          const token = freshSession?.access_token ?? "";
          const delRes = await fetch(`${supabaseUrl}/functions/v1/delete-auth-user`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              userId: member.user_id,
              entityType: "team_member",
              entityName: `${member.full_name} (${member.email ?? "no email"})`,
              reason: `Team member deleted by admin. Role: ${member.role ?? "unknown"}`,
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
    setFormError("");
    setSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
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

  return (
    <div>
      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: "Total Members", value: members.length, icon: "ri-team-line", color: "text-gray-700" },
            { label: "Admin Portal Access", value: members.filter((m) => m.is_admin).length, icon: "ri-shield-star-line", color: "text-[#1a5c4f]" },
            { label: "Active Accounts", value: members.filter((m) => m.is_active).length, icon: "ri-checkbox-circle-line", color: "text-emerald-600" },
            { label: "Providers", value: members.filter((m) => !m.is_admin).length, icon: "ri-stethoscope-line", color: "text-amber-600" },
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

      {successMsg && (
        <div className="mb-4 bg-[#f0faf7] border border-[#b8ddd5] rounded-xl px-4 py-3 flex items-start gap-3">
          <i className="ri-checkbox-circle-fill text-[#1a5c4f] text-base mt-0.5 flex-shrink-0"></i>
          <p className="text-sm text-[#1a5c4f] font-semibold">{successMsg}</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-base font-extrabold text-gray-900">Team &amp; Role Management</h2>
          <p className="text-xs text-gray-500 mt-0.5">Invite staff, assign roles, and control access levels.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setShowMatrix((v) => !v)}
            className={`whitespace-nowrap flex items-center gap-2 px-3 py-2.5 border text-sm font-bold rounded-xl cursor-pointer transition-colors ${showMatrix ? "bg-gray-100 border-gray-300 text-gray-700" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
            <i className="ri-grid-line"></i>Permissions
          </button>
          <button type="button" onClick={() => setShowModal(true)}
            className="whitespace-nowrap flex items-center gap-2 px-4 py-2.5 bg-[#1a5c4f] text-white text-sm font-bold rounded-xl hover:bg-[#17504a] cursor-pointer transition-colors">
            <i className="ri-user-add-line"></i>Invite Member
          </button>
        </div>
      </div>

      {/* Permissions matrix */}
      {showMatrix && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">Permissions Matrix</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wider w-32">Module</th>
                  {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                    <th key={key} className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${cfg.color}`}>
                        <i className={`${cfg.icon} text-xs`}></i>{cfg.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {PERMISSIONS.map((row) => (
                  <tr key={row.module} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-xs font-bold text-gray-600">{row.module}</td>
                    <td className="px-4 py-2.5 text-center"><PermValue v={row.owner} /></td>
                    <td className="px-4 py-2.5 text-center"><PermValue v={row.admin_manager} /></td>
                    <td className="px-4 py-2.5 text-center"><PermValue v={row.support} /></td>
                    <td className="px-4 py-2.5 text-center"><PermValue v={row.finance} /></td>
                    <td className="px-4 py-2.5 text-center"><PermValue v={row.read_only} /></td>
                    <td className="px-4 py-2.5 text-center"><PermValue v={row.provider} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
            <p className="text-xs text-gray-400">Note: Role-based access enforcement is currently informational. Full UI-level gating can be added per module as needed.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <i className="ri-loader-4-line animate-spin text-3xl text-[#1a5c4f]"></i>
        </div>
      ) : members.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-bold text-gray-700">No team members yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_160px_140px] gap-4 px-5 py-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase tracking-wider">
            <span>Name</span><span>Email</span><span>Title</span><span>Role</span><span>Status</span>
          </div>
          <div className="divide-y divide-gray-100">
            {members.map((member) => {
              const roleCfg = ROLE_CONFIG[member.role ?? (member.is_admin ? "admin_manager" : "provider")] ?? ROLE_CONFIG.provider;
              const currentRole = member.role ?? (member.is_admin ? "admin_manager" : "provider");

              return (
                <div key={member.id}
                  className={`px-5 py-4 transition-colors ${!member.is_active ? "opacity-60 bg-gray-50/50" : "hover:bg-gray-50/40"}`}>
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_160px_140px] gap-3 md:gap-4 items-center">
                    {/* Name */}
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0 text-sm font-extrabold ${member.is_active ? "bg-[#f0faf7] text-[#1a5c4f]" : "bg-gray-100 text-gray-400"}`}>
                        {member.full_name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{member.full_name}</p>
                        <p className="text-xs text-gray-400 md:hidden">{member.email}</p>
                      </div>
                    </div>

                    <div className="hidden md:block text-xs text-gray-500 truncate">{member.email ?? "—"}</div>
                    <div className="hidden md:block text-sm text-gray-500">{member.title ?? <span className="text-gray-300">—</span>}</div>

                    {/* Role selector */}
                    <div>
                      <div className="relative">
                        <select value={currentRole}
                          onChange={(e) => handleRoleChange(member, e.target.value)}
                          disabled={togglingId === member.id}
                          className={`appearance-none pl-2 pr-7 py-1.5 rounded-full text-xs font-bold cursor-pointer border-0 focus:outline-none focus:ring-2 focus:ring-[#1a5c4f]/20 disabled:opacity-50 ${roleCfg.color}`}>
                          {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                            <option key={key} value={key} className="bg-white text-gray-800 font-normal">{cfg.label} — {cfg.desc}</option>
                          ))}
                        </select>
                        <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 flex items-center justify-center">
                          {togglingId === member.id
                            ? <i className="ri-loader-4-line animate-spin text-current" style={{ fontSize: "10px" }}></i>
                            : <i className="ri-arrow-down-s-line text-current" style={{ fontSize: "10px" }}></i>}
                        </div>
                      </div>
                    </div>

                    {/* Status + actions */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-semibold ${member.is_active ? "text-emerald-600" : "text-gray-400"}`}>
                        {member.is_active ? "Active" : "Inactive"}
                      </span>
                      <button type="button" onClick={() => handleToggleActive(member)} disabled={togglingId === member.id}
                        className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer disabled:opacity-50 flex-shrink-0 ${member.is_active ? "bg-[#1a5c4f]" : "bg-gray-300"}`}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${member.is_active ? "translate-x-4" : "translate-x-0.5"}`}></div>
                      </button>
                      <div className="relative group">
                        <button
                          type="button"
                          onClick={() => handleSendPasswordReset(member)}
                          disabled={resetSendingId === member.id}
                          title={`Send password reset email to ${member.email ?? "this user"}`}
                          className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg border border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100 cursor-pointer transition-colors disabled:opacity-50"
                        >
                          {resetSendingId === member.id
                            ? <i className="ri-loader-4-line animate-spin text-xs"></i>
                            : <i className="ri-key-2-line text-xs"></i>
                          }
                        </button>
                        <div className="absolute bottom-full right-0 mb-1.5 w-40 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal">
                          Send password reset email
                        </div>
                      </div>
                      {/* Delete button */}
                      <div className="relative group">
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(member.id)}
                          title={`Remove ${member.full_name} from team`}
                          className="whitespace-nowrap w-7 h-7 flex items-center justify-center rounded-lg border border-red-200 text-red-500 bg-red-50 hover:bg-red-100 cursor-pointer transition-colors"
                        >
                          <i className="ri-delete-bin-line text-xs"></i>
                        </button>
                        <div className="absolute bottom-full right-0 mb-1.5 w-32 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal">
                          Remove from team
                        </div>
                      </div>
                    </div>
                  </div>
                  {resetMsgMap[member.id] && (
                    <div className={`mt-2 flex items-start gap-2 px-3 py-2 rounded-lg text-xs font-semibold ${resetMsgMap[member.id].text === "Reset link sent!" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
                      <i className={`mt-0.5 flex-shrink-0 ${resetMsgMap[member.id].text === "Reset link sent!" ? "ri-checkbox-circle-line" : "ri-error-warning-line"}`}></i>
                      <div>
                        <p>{resetMsgMap[member.id].text}</p>
                        {resetMsgMap[member.id].link && (
                          <p className="mt-1 text-amber-600">
                            <button
                              type="button"
                              onClick={() => navigator.clipboard.writeText(resetMsgMap[member.id].link!)}
                              className="underline cursor-pointer hover:text-amber-800 font-bold"
                            >
                              Copy reset link to clipboard
                            </button>
                          </p>
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
      <div className="mt-5 bg-[#0f1e1a] rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm font-bold text-white mb-0.5">Admin Login Portal URL</p>
          <p className="text-xs text-white/50">Share with new team members for dashboard access.</p>
        </div>
        <div className="flex items-center gap-2 bg-white/10 rounded-xl px-4 py-2.5 font-mono text-xs text-white/70 select-all">
          {typeof window !== "undefined" ? window.location.origin : ""}/admin-login
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (() => {
        const member = members.find((m) => m.id === deleteConfirmId);
        if (!member) return null;
        return (
          <div className="fixed inset-0 bg-black/40 z-[110] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 flex items-center justify-center bg-red-100 rounded-xl flex-shrink-0">
                    <i className="ri-delete-bin-fill text-red-600 text-lg"></i>
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-gray-900">Remove Team Member?</h2>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      This will remove <strong>{member.full_name}</strong> from the team. Their login access will be revoked immediately.
                    </p>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-red-50 border-b border-red-100">
                <div className="space-y-1 text-xs text-red-700">
                  <p className="flex items-center gap-1.5"><i className="ri-user-line"></i><strong>{member.full_name}</strong></p>
                  {member.email && <p className="flex items-center gap-1.5"><i className="ri-mail-line"></i>{member.email}</p>}
                  <p className="flex items-center gap-1.5"><i className="ri-shield-line"></i>Role: {ROLE_CONFIG[member.role ?? "provider"]?.label ?? member.role}</p>
                  <p className="flex items-center gap-1.5 font-semibold mt-1"><i className="ri-logout-box-r-line"></i>Their Supabase login account will also be deleted</p>
                </div>
              </div>
              <div className="px-6 py-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDeleteMember(member)}
                  disabled={deletingId === member.id}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-bold rounded-xl hover:bg-red-700 disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {deletingId === member.id
                    ? <><i className="ri-loader-4-line animate-spin"></i>Removing...</>
                    : <><i className="ri-delete-bin-line"></i>Yes, Remove</>
                  }
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="whitespace-nowrap flex-1 flex items-center justify-center gap-2 py-2.5 border border-gray-200 text-gray-600 text-sm font-semibold rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  Cancel
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
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-[#1a5c4f] font-bold uppercase tracking-widest mb-0.5">Invite</p>
                <h2 className="text-lg font-extrabold text-gray-900">Add Team Member</h2>
              </div>
              <button type="button" onClick={() => { setShowModal(false); setForm(INIT_FORM); setFormError(""); }}
                className="whitespace-nowrap w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 cursor-pointer">
                <i className="ri-close-line text-gray-500 text-lg"></i>
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="bg-[#f0faf7] border border-[#c3e8df] rounded-xl px-4 py-3 flex items-start gap-2.5">
                <i className="ri-mail-send-line text-[#1a5c4f] text-sm mt-0.5 flex-shrink-0"></i>
                <p className="text-xs text-[#1a5c4f] leading-relaxed">An <strong>invite email</strong> will be sent automatically. They click the link to set their own password.</p>
              </div>

              {formError && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-2">
                  <i className="ri-error-warning-line text-red-500 text-sm mt-0.5 flex-shrink-0"></i>
                  <p className="text-xs text-red-700">{formError}</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Full Name *</label>
                <input type="text" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Jane Smith" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Email Address *</label>
                <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="jane@pawtenant.com" className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Title (optional)</label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Operations Manager, Support Specialist..." className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#1a5c4f]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Role *</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(ROLE_CONFIG).map(([key, cfg]) => (
                    <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, role: key }))}
                      className={`whitespace-nowrap flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-colors cursor-pointer text-left ${form.role === key ? "border-[#1a5c4f] bg-[#f0faf7]" : "border-gray-200 hover:border-gray-300"}`}>
                      <div className="flex items-center gap-1.5">
                        <i className={`${cfg.icon} text-sm ${form.role === key ? "text-[#1a5c4f]" : "text-gray-400"}`}></i>
                        <span className={`text-xs font-bold ${form.role === key ? "text-[#1a5c4f]" : "text-gray-600"}`}>{cfg.label}</span>
                      </div>
                      <span className="text-xs text-gray-400 leading-tight">{cfg.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
              <button type="button" onClick={() => { setShowModal(false); setForm(INIT_FORM); setFormError(""); }}
                className="whitespace-nowrap px-4 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer">Cancel</button>
              <button type="button" onClick={handleCreateMember} disabled={submitting}
                className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#1a5c4f] text-white text-sm font-bold rounded-lg hover:bg-[#17504a] disabled:opacity-50 cursor-pointer">
                {submitting ? <><i className="ri-loader-4-line animate-spin"></i>Sending...</> : <><i className="ri-mail-send-line"></i>Send Invite</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
