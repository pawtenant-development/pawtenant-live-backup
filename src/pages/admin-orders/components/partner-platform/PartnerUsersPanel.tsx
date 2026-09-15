// Partner Platform → Settings → Partner portal users.
//
// PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.
//
// Invite-only, individual accounts. There is no shared partner password and
// nothing on this screen sets one: "Send invitation" asks Supabase Auth to
// email the person its own sign-in link, and the person chooses their own
// password on that link. Passwords and MFA are never automated here.
//
// The membership row is what grants access. Revoking flips it to `revoked`,
// and `current_partner_id()` — the function every partner-facing read and
// write derives its organization from — stops returning anything for that
// user immediately. It is not a hidden button; it is the authorization.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { Badge, ConfirmDialog, EmptyState, Notice, Section, type PartnerOrg } from "./shared";
// PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 — ONE partner role.
import { FIRST_RELEASE_PARTNER_ROLE, PARTNER_USER_ROLE_LABEL, partnerRoleLabel } from "../../../../lib/partnerRoles";

interface PartnerUserRow {
  id: string;
  partner_id: string;
  partner_name: string;
  email: string;
  /** Legacy column values; both display as "Partner user" (see lib/partnerRoles). */
  role: string;
  status: "invited" | "active" | "revoked";
  invited_by_email: string | null;
  invited_at: string;
  invitation_sent_count: number;
  invitation_last_sent_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  last_access_at: string | null;
  has_auth_user: boolean;
}

const NY = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "short", day: "2-digit",
  hour: "2-digit", minute: "2-digit",
});
const when = (iso: string | null) => (iso ? NY.format(new Date(iso)) : "—");

const STATUS_TONE: Record<PartnerUserRow["status"], string> = {
  invited: "bg-amber-50 text-amber-700 ring-amber-200",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  revoked: "bg-gray-100 text-gray-500 ring-gray-300",
};

export default function PartnerUsersPanel({ selected }: { selected: PartnerOrg | null }) {
  const [rows, setRows] = useState<PartnerUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; confirmLabel: string; run: () => void } | null>(null);

  const load = useCallback(async () => {
    if (!selected) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase.rpc("partner_admin_list_users", { p_partner_id: selected.id });
    if (err) setError(err.message); else setError("");
    setRows((data ?? []) as PartnerUserRow[]);
    setLoading(false);
  }, [selected]);

  useEffect(() => { void load(); }, [load]);

  /** Ask the admin-gated edge function for a fresh one-time setup/recovery
   *  link. No password is generated, transported or stored by PawTenant. */
  const sendInvitationEmail = async (partnerUserId: string, address: string) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) throw new Error("Your admin session expired — sign in again.");
    const base = (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string).replace(/\/$/, "");
    const res = await fetch(`${base}/functions/v1/partner-user-invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ partner_user_id: partnerUserId, email: address }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error ?? `Invitation email failed (${res.status})`);
    return body as { suppressed?: boolean };
  };

  const invite = async () => {
    if (!selected) return;
    setBusy("invite");
    setError(""); setNotice("");
    try {
      const { data, error: err } = await supabase.rpc("partner_admin_invite_user", {
        p_partner_id: selected.id, p_email: email.trim().toLowerCase(), p_role: FIRST_RELEASE_PARTNER_ROLE,
      });
      if (err) throw err;
      const result = await sendInvitationEmail(String(data), email.trim().toLowerCase());
      setNotice(result.suppressed
        ? `Invitation recorded. The email was suppressed because this is a test address.`
        : `Invitation sent to ${email.trim().toLowerCase()}.`);
      setEmail("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const resend = async (row: PartnerUserRow) => {
    setBusy(row.id); setError(""); setNotice("");
    try {
      const result = await sendInvitationEmail(row.id, row.email);
      const { error: err } = await supabase.rpc("partner_admin_record_invitation_sent", { p_partner_user_id: row.id });
      if (err) throw err;
      setNotice(result.suppressed
        ? "Password link re-recorded (test address — email suppressed)."
        : `Fresh password link sent to ${row.email}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const setAccess = async (row: PartnerUserRow, revoked: boolean) => {
    setBusy(row.id); setError(""); setNotice("");
    try {
      const { error: err } = await supabase.rpc("partner_admin_set_user_access", {
        p_partner_user_id: row.id, p_revoked: revoked, p_reason: revoked ? "Revoked by admin" : null,
      });
      if (err) throw err;
      setNotice(revoked ? `${row.email} can no longer access the partner portal.` : `${row.email} restored.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section
      title="Partner portal users"
      subtitle="Individual invite-only accounts. Each user is locked to this organization and its orders — never a shared password."
    >
      <Notice notice={notice} error={error} />

      {!selected ? (
        <EmptyState title="No partner selected" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <label className="flex-1 min-w-[220px]">
              <span className="mb-1 block text-xs font-medium text-gray-600">Invite by email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="name@partner.example"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500" />
            </label>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-600">Role</span>
              <p className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700" data-partner-role-fixed>{PARTNER_USER_ROLE_LABEL}</p>
            </div>
            <button type="button" disabled={!email.trim() || busy === "invite"} onClick={() => void invite()}
              className="rounded-lg bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40">
              {busy === "invite" ? "Inviting…" : "Send invitation"}
            </button>
          </div>

          {loading ? (
            <p className="py-6 text-center text-sm text-gray-400">Loading…</p>
          ) : rows.length === 0 ? (
            <EmptyState title="No portal users yet" hint="Invite the partner's first user above." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Invited</th>
                    <th className="py-2 pr-3">Accepted</th>
                    <th className="py-2 pr-3">Last portal access</th>
                    <th className="py-2 pr-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2 pr-3 font-medium text-gray-900 break-all">{r.email}</td>
                      <td className="py-2 pr-3 text-gray-600">
                        {partnerRoleLabel(r.role)}
                      </td>
                      <td className="py-2 pr-3">
                        <Badge label={r.status} tone={STATUS_TONE[r.status]} />
                        {r.status === "revoked" && r.revoke_reason && (
                          <span className="ml-2 text-xs text-gray-400">{r.revoke_reason}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">
                        {when(r.invited_at)}
                        {r.invitation_sent_count > 1 && (
                          <span className="block text-gray-400">sent {r.invitation_sent_count}×</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">{when(r.accepted_at)}</td>
                      <td className="py-2 pr-3 text-xs text-gray-500 whitespace-nowrap">{when(r.last_access_at)}</td>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {r.status !== "revoked" && (
                            <button type="button" disabled={busy === r.id} onClick={() => void resend(r)}
                              className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">
                              Send new password link
                            </button>
                          )}
                          {r.status === "revoked" ? (
                            <button type="button" disabled={busy === r.id} onClick={() => void setAccess(r, false)}
                              className="rounded border border-emerald-300 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">
                              Restore access
                            </button>
                          ) : (
                            <button type="button" disabled={busy === r.id}
                              onClick={() => setConfirm({
                                title: "Revoke partner access",
                                body: `${r.email} will lose access to the partner portal immediately. Their submitted orders and invoices are not affected.`,
                                confirmLabel: "Revoke access",
                                run: () => void setAccess(r, true),
                              })}
                              className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40">
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel}
          onConfirm={() => { confirm.run(); setConfirm(null); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </Section>
  );
}
