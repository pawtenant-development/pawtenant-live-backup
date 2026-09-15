// PartnerCreateForm — PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002.
//
// ONE admin action creates a partner and invites its first user:
//   1. the organization (profile, services, active status)          — RPC
//   2. the agreed per-order charge(s) on the existing rate-card system — RPC
//   3. the completion-notification contact                          — RPC
//   4. the first partner-user membership (one role: Partner user)   — RPC
//   5. the account-setup invitation through Supabase Auth           — edge fn
//
// There is no migration in this task, so the steps run as the existing
// SECURITY DEFINER RPCs in sequence with SAFE, IDEMPOTENT RESUMPTION instead
// of one SQL transaction:
//   * a retry after a partial failure finds the organization by its slug and
//     REUSES it (only when the display name matches — a stranger's slug is a
//     refusal, never a silent takeover);
//   * an existing membership for the same address in that organization is
//     reused, never duplicated;
//   * rates are recorded only when no current rate exists for that service;
//   * the completion contact is set only when empty.
// Every outcome is reported honestly: an organization that exists but whose
// invitation did not send is NOT "success" — it is "created, invitation not
// sent", with a working "Send new password link" path (PartnerUsersPanel).
//
// Nothing here sends a customer anything, touches Stripe, or changes rates
// that already exist.

import { useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { FIRST_RELEASE_PARTNER_ROLE, PARTNER_USER_ROLE_LABEL } from "../../../../lib/partnerRoles";
import { Notice, Section, type PartnerOrg } from "./shared";

interface Props {
  /** Every organization the workspace knows, for slug/name collision checks. */
  orgs: PartnerOrg[];
  /** Called with the new (or resumed) organization id once the flow finishes. */
  onCreated: (partnerId: string) => void;
}

type Outcome = { tone: "ok" | "warn"; text: string };

const slugify = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Ask Supabase Auth (through the admin-gated edge function) to send the
 *  invitation. Never sets a password. Returns the honest dispatch result. */
async function dispatchInvitation(partnerUserId: string): Promise<{ suppressed: boolean }> {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("Your admin session expired — sign in again.");
  const base = (import.meta.env.VITE_PUBLIC_SUPABASE_URL as string).replace(/\/$/, "");
  const res = await fetch(`${base}/functions/v1/partner-user-invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ partner_user_id: partnerUserId }),
  });
  const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; suppressed?: boolean };
  if (!res.ok || body.ok !== true) throw new Error(body.error ?? `Invitation email failed (${res.status})`);
  return { suppressed: body.suppressed === true };
}

export default function PartnerCreateForm({ orgs, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [form, setForm] = useState({
    name: "",
    contactName: "",
    email: "",
    completionEmail: "",
    completionEmailTouched: false,
    esa: true,
    psd: false,
    active: true,
    esaRate: "",
    psdRate: "",
    notes: "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const slug = useMemo(() => slugify(form.name), [form.name]);
  const email = form.email.trim().toLowerCase();
  // The completion contact DEFAULTS to the partner email and follows it until
  // the admin deliberately types a different one.
  const completionEmail = (form.completionEmailTouched ? form.completionEmail : form.email).trim().toLowerCase();

  const problems: string[] = [];
  if (!form.name.trim()) problems.push("Business name is required.");
  if (form.name.trim() && !slug) problems.push("Business name must contain letters or digits.");
  if (!form.contactName.trim()) problems.push("Primary contact name is required.");
  if (!EMAIL_RE.test(email)) problems.push("A valid partner email is required.");
  if (!EMAIL_RE.test(completionEmail)) problems.push("A valid completion-notification email is required.");
  if (!form.esa && !form.psd) problems.push("Enable at least one service.");
  const cents = (v: string) => Math.round(Number(v) * 100);
  if (form.esa && !(Number.isFinite(cents(form.esaRate)) && cents(form.esaRate) > 0)) problems.push("Enter the agreed ESA charge in dollars (e.g. 52.00).");
  if (form.psd && !(Number.isFinite(cents(form.psdRate)) && cents(form.psdRate) > 0)) problems.push("Enter the agreed PSD charge in dollars (e.g. 45.00).");
  const canSubmit = problems.length === 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true); setError(""); setOutcome(null);
    const steps: string[] = [];
    try {
      // ── 1. Organization: create, or resume the one this exact retry created.
      let partnerId: string | null = null;
      const existing = orgs.find((o) => o.slug === slug);
      if (existing) {
        if (existing.display_name.trim().toLowerCase() !== form.name.trim().toLowerCase()) {
          throw new Error(`The identifier "${slug}" already belongs to ${existing.display_name}. Use a different business name.`);
        }
        partnerId = existing.id;
        steps.push("organization already existed — resumed");
      } else {
        const { data, error: err } = await supabase.rpc("partner_admin_create_organization", {
          p_display_name: form.name.trim(),
          p_legal_name: form.name.trim(),
          p_slug: slug,
          p_billing_contact: { name: form.contactName.trim(), email },
          p_technical_contact: { name: form.contactName.trim(), email },
          p_notes: form.notes.trim() || null,
        });
        if (err) {
          if (/already exists|23505/.test(err.message)) {
            // Created by an earlier attempt that failed later: resume it.
            const { data: found } = await supabase.from("partner_organizations").select("id, display_name").eq("slug", slug).maybeSingle();
            if (!found || String(found.display_name).trim().toLowerCase() !== form.name.trim().toLowerCase()) throw err;
            partnerId = String(found.id);
            steps.push("organization already existed — resumed");
          } else throw err;
        } else {
          partnerId = String(data);
          steps.push("organization created");
        }
      }
      if (!partnerId) throw new Error("No organization id was returned.");

      // ── 2. Services + manual intake mode (profile allowlist RPC).
      const services = [form.esa ? "esa" : null, form.psd ? "psd" : null].filter(Boolean);
      const { error: profErr } = await supabase.rpc("partner_admin_update_profile", {
        p_partner_id: partnerId,
        p_patch: { allowed_services: services, intake_mode: "manual" },
      });
      if (profErr) throw new Error(`Services could not be saved: ${profErr.message}`);
      steps.push(`services: ${services.map((s) => String(s).toUpperCase()).join(", ")}`);

      // ── 3. Active status: an invitation requires an active (sandbox) organization.
      if (form.active) {
        const { error: sbErr } = await supabase.rpc("partner_admin_set_sandbox_access", { p_partner_id: partnerId, p_enabled: true });
        if (sbErr) throw new Error(`Activation failed: ${sbErr.message}`);
        steps.push("active (sandbox)");
      }

      // ── 4. Rates on the EXISTING rate-card system — only where none is current.
      const { data: rateRows } = await supabase.from("partner_rate_cards")
        .select("service, environment, effective_to").eq("partner_id", partnerId).is("effective_to", null);
      const hasRate = (svc: string) => (rateRows ?? []).some((r) => r.service === svc && r.environment === "sandbox");
      for (const [svc, on, dollars] of [["esa", form.esa, form.esaRate], ["psd", form.psd, form.psdRate]] as const) {
        if (!on) continue;
        if (hasRate(svc)) { steps.push(`${svc.toUpperCase()} rate already recorded — kept`); continue; }
        const { error: rateErr } = await supabase.rpc("partner_admin_set_rate", {
          p_partner_id: partnerId, p_service: svc, p_environment: "sandbox",
          p_amount_cents: cents(dollars), p_effective_from: new Date().toISOString(),
          p_notes: "Recorded at partner creation (PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002).",
        });
        if (rateErr) throw new Error(`${svc.toUpperCase()} rate could not be recorded: ${rateErr.message}`);
        steps.push(`${svc.toUpperCase()} rate $${(cents(dollars) / 100).toFixed(2)}`);
      }

      // ── 5. Completion-notification contact — only when not already set.
      const { data: orgRow } = await supabase.from("partner_organizations")
        .select("completion_notification_email").eq("id", partnerId).maybeSingle();
      if (!orgRow?.completion_notification_email) {
        const { error: ccErr } = await supabase.rpc("partner_admin_set_completion_contact", { p_partner_id: partnerId, p_email: completionEmail });
        if (ccErr) throw new Error(`Completion contact could not be saved: ${ccErr.message}`);
      }
      steps.push(`completion notices → ${orgRow?.completion_notification_email ?? completionEmail}`);

      // ── 6. First partner user: reuse an existing membership for this address.
      const { data: users } = await supabase.rpc("partner_admin_list_users", { p_partner_id: partnerId });
      const existingUser = ((users ?? []) as { id: string; email: string; status: string }[])
        .find((u) => u.email.toLowerCase() === email && u.status !== "revoked");
      let partnerUserId = existingUser?.id ?? null;
      if (!partnerUserId) {
        const { data: invited, error: invErr } = await supabase.rpc("partner_admin_invite_user", {
          p_partner_id: partnerId, p_email: email, p_role: FIRST_RELEASE_PARTNER_ROLE,
        });
        if (invErr) {
          throw new Error(invErr.message.includes("address_belongs_to_internal_staff")
            ? "That address belongs to PawTenant staff or a provider and cannot become a partner login."
            : `The partner user could not be created: ${invErr.message}`);
        }
        partnerUserId = String(invited);
        steps.push(`${PARTNER_USER_ROLE_LABEL.toLowerCase()} ${email} created`);
      } else {
        steps.push(`${PARTNER_USER_ROLE_LABEL.toLowerCase()} ${email} already existed — reused`);
      }

      // ── 7. Invitation dispatch — the one step whose failure is NOT success.
      try {
        const sent = await dispatchInvitation(partnerUserId);
        setOutcome({
          tone: "ok",
          text: sent.suppressed
            ? `${form.name.trim()} is set up. The invitation was recorded but not emailed because ${email} is a test address. (${steps.join(" · ")})`
            : `${form.name.trim()} is set up and the account-setup invitation was sent to ${email}. (${steps.join(" · ")})`,
        });
      } catch (e) {
        setOutcome({
          tone: "warn",
          text: `${form.name.trim()} was created but the invitation was NOT sent: ${e instanceof Error ? e.message : String(e)}. Use "Send new password link" under Partner portal users once the cause is fixed. (${steps.join(" · ")})`,
        });
      }
      onCreated(partnerId);
      setForm({ name: "", contactName: "", email: "", completionEmail: "", completionEmailTouched: false, esa: true, psd: false, active: true, esaRate: "", psdRate: "", notes: "" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="New partner"
      subtitle="One step: the partner's business details, services and agreed charges, plus the first Partner user — who receives an account-setup invitation."
      actions={
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white" data-partner-create-toggle>
          {open ? "Close" : "Create partner + invite user"}
        </button>
      }
    >
      <Notice notice={outcome?.tone === "ok" ? outcome.text : ""} error={error} />
      {outcome?.tone === "warn" && (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">{outcome.text}</p>
      )}
      {open && (
        <div className="grid grid-cols-1 gap-3 rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 sm:grid-cols-2" data-partner-create-form>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Partner / business name *</span>
            <input value={form.name} onChange={(e) => set("name", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Acme Pet Services" />
            {slug && <span className="mt-1 block text-[11px] text-gray-400">Identifier: <span className="font-mono">{slug}</span></span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Primary contact name *</span>
            <input value={form.contactName} onChange={(e) => set("contactName", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Jordan Lee" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Partner email (receives the invitation) *</span>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="orders@partner.example" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Completion-notification email *</span>
            <input type="email" value={form.completionEmailTouched ? form.completionEmail : form.email}
              onChange={(e) => setForm((f) => ({ ...f, completionEmail: e.target.value, completionEmailTouched: true }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="same as partner email" />
            <span className="mt-1 block text-[11px] text-gray-400">Told when clinical work completes. Defaults to the partner email.</span>
          </label>
          <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={form.esa} onChange={(e) => set("esa", e.target.checked)} /> ESA orders
              </label>
              {form.esa && (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Agreed ESA charge per order (USD) *</span>
                  <input inputMode="decimal" value={form.esaRate} onChange={(e) => set("esaRate", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="52.00" />
                </label>
              )}
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={form.psd} onChange={(e) => set("psd", e.target.checked)} /> PSD orders
              </label>
              {form.psd && (
                <label className="mt-2 block">
                  <span className="mb-1 block text-xs font-medium text-gray-600">Agreed PSD charge per order (USD) *</span>
                  <input inputMode="decimal" value={form.psdRate} onChange={(e) => set("psdRate", e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="45.00" />
                </label>
              )}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-800">
            <input type="checkbox" checked={form.active} onChange={(e) => set("active", e.target.checked)} />
            Active — the partner can sign in and submit orders
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">Notes</span>
            <input value={form.notes} onChange={(e) => set("notes", e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="Contract reference, who agreed the rate" />
          </label>
          <div className="sm:col-span-2">
            <p className="mb-2 text-[11px] text-gray-500">
              Role: <span className="font-semibold">{PARTNER_USER_ROLE_LABEL}</span> — the only partner role in this release. Charges use the existing rate-card system and are frozen on each order at submission.
            </p>
            {problems.length > 0 && form.name.trim() && (
              <ul className="mb-2 list-disc pl-5 text-xs text-gray-500">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            )}
            <button type="button" disabled={!canSubmit} onClick={() => void submit()}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" data-partner-create-submit>
              {busy ? "Creating…" : "Create partner and send invitation"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}
