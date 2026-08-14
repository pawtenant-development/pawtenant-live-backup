// AdminProviderContactPanel — PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001.
//
// The Admin half of the consented professional-contact pair. It is a separate
// component with its own save rather than an extension of the drawer's
// handleSaveEdit, because that handler fans the same values into
// doctor_contacts, and consent must not travel to a second table where nothing
// enforces the "approved implies a value" constraint.
//
// Authorisation is NOT the fact that this renders inside an admin screen. The
// write goes through the admin's own session and is authorised by the
// "Admins update all doctor profiles" policy (check_is_admin()). A non-admin
// reaching this mutation path updates zero rows.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { logAudit } from "@/lib/auditLogger";

interface Props {
  /** doctor_profiles.id */
  profileId: string;
  /** Display-only label for the audit trail; never a contact value. */
  providerLabel?: string;
}

interface ContactRow {
  professional_email: string | null;
  professional_phone: string | null;
  professional_email_public_approved: boolean;
  professional_phone_public_approved: boolean;
}

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"'.]+\.[^\s@<>"']{2,}$/;
const PHONE_RE = /^[0-9 ()+\-.]{7,24}$/;

/** Audit detail must never carry the value itself — only that it changed. */
function transition(before: string | null, after: string | null): "added" | "changed" | "cleared" | "unchanged" {
  const b = (before ?? "").trim();
  const a = (after ?? "").trim();
  if (b === a) return "unchanged";
  if (!b && a) return "added";
  if (b && !a) return "cleared";
  return "changed";
}

export default function AdminProviderContactPanel({ profileId, providerLabel }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [stored, setStored] = useState<ContactRow | null>(null);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailApproved, setEmailApproved] = useState(false);
  const [phoneApproved, setPhoneApproved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("doctor_profiles")
        // doctor_profiles has no updated_at column — selecting one 400s the whole
        // panel, so it can never load and the admin save is unreachable.
        .select("professional_email, professional_phone, professional_email_public_approved, professional_phone_public_approved")
        .eq("id", profileId)
        .maybeSingle();
      if (cancelled) return;
      if (err) setError("Could not load professional contact.");
      else if (data) {
        const row = data as ContactRow;
        setStored(row);
        setEmail(row.professional_email ?? "");
        setPhone(row.professional_phone ?? "");
        setEmailApproved(!!row.professional_email_public_approved);
        setPhoneApproved(!!row.professional_phone_public_approved);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [profileId]);

  const tEmail = email.trim();
  const tPhone = phone.trim();
  const emailValid = tEmail === "" || EMAIL_RE.test(tEmail);
  const phoneValid = tPhone === "" || PHONE_RE.test(tPhone);
  const emailBlocked = emailApproved && tEmail === "";
  const phoneBlocked = phoneApproved && tPhone === "";
  const canSave = !saving && emailValid && phoneValid && !emailBlocked && !phoneBlocked;

  const emailLive = !!stored?.professional_email && stored.professional_email_public_approved;
  const phoneLive = !!stored?.professional_phone && stored.professional_phone_public_approved;
  const nothingApproved = !emailLive && !phoneLive;

  const handleSave = async () => {
    if (!canSave || !stored) return;
    setSaving(true); setSaved(false); setError("");

    const nextEmail = tEmail || null;
    const nextPhone = tPhone || null;
    const nextEmailApproved = !!nextEmail && emailApproved;
    const nextPhoneApproved = !!nextPhone && phoneApproved;

    const { error: err, count } = await supabase
      .from("doctor_profiles")
      .update({
        professional_email: nextEmail,
        professional_phone: nextPhone,
        professional_email_public_approved: nextEmailApproved,
        professional_phone_public_approved: nextPhoneApproved,
      }, { count: "exact" })
      .eq("id", profileId);

    setSaving(false);

    // A non-admin session is refused by RLS as zero updated rows, not an error.
    // Treat that as a failure so no "changed" audit event is ever written for a
    // write that did not happen.
    if (err || count === 0) {
      setError(err ? "Could not save. Check the values and try again." : "Not authorised to edit this provider.");
      return;
    }

    const emailChange = transition(stored.professional_email, nextEmail);
    const phoneChange = transition(stored.professional_phone, nextPhone);
    const emailConsent = stored.professional_email_public_approved === nextEmailApproved
      ? "unchanged" : (nextEmailApproved ? "granted" : "revoked");
    const phoneConsent = stored.professional_phone_public_approved === nextPhoneApproved
      ? "unchanged" : (nextPhoneApproved ? "granted" : "revoked");

    if (emailChange !== "unchanged" || phoneChange !== "unchanged"
        || emailConsent !== "unchanged" || phoneConsent !== "unchanged") {
      // Field names, actions and transitions only. No address, no number, no
      // login identifier — the audit row must not become a contact directory.
      await logAudit({
        actor_type: "admin",
        actor_role: "admin",
        object_type: "doctor_profile",
        object_id: profileId,
        action: "provider_professional_contact_updated",
        description: "Provider professional contact updated from the Admin surface",
        source: "admin_provider_drawer",
        entity_type: "doctor_profile",
        entity_id: profileId,
        metadata: {
          surface: "admin",
          target_provider_id: profileId,
          professional_email: emailChange,
          professional_phone: phoneChange,
          email_public_approval: emailConsent,
          phone_public_approval: phoneConsent,
        },
      });
    }

    setStored({
      professional_email: nextEmail,
      professional_phone: nextPhone,
      professional_email_public_approved: nextEmailApproved,
      professional_phone_public_approved: nextPhoneApproved,
    });
    if (!nextEmail) setEmailApproved(false);
    if (!nextPhone) setPhoneApproved(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) {
    return <div className="h-20 bg-gray-50 border border-gray-100 rounded-xl animate-pulse" />;
  }

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-widest">Public Professional Contact</h4>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
            Shown publicly on a successful letter verification once approved
            {providerLabel ? ` for ${providerLabel}` : ""}.
          </p>
        </div>
      </div>

      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        <i className="ri-alert-line text-amber-600 text-xs flex-shrink-0 mt-0.5"></i>
        <p className="text-[11px] text-amber-800 leading-relaxed">
          Do not copy a provider&apos;s login email or private phone number without their authorization.
        </p>
      </div>

      {nothingApproved && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <i className="ri-information-line text-gray-400 text-xs flex-shrink-0 mt-0.5"></i>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            No approved professional contact. Verification results for this provider omit phone and email.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
            Professional email
            <span className={`ml-2 normal-case tracking-normal font-semibold ${emailLive ? "text-emerald-600" : "text-gray-400"}`}>
              {emailLive ? "· eligible for public display" : "· not displayed"}
            </span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
              // Clearing a value clears its consent in the same gesture, so an
              // "approved but empty" state can never disable Save.
              if (v.trim() === "") setEmailApproved(false);
              setSaved(false);
            }}
            placeholder="verification@practice.com"
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:border-[#3b6ea5]"
          />
          {!emailValid && <p className="text-[11px] text-red-500 mt-1">Enter a valid email address.</p>}
          <label className="mt-1.5 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={emailApproved}
              onChange={(e) => { setEmailApproved(e.target.checked); setSaved(false); }}
              className="w-3.5 h-3.5 accent-[#3b6ea5] cursor-pointer"
            />
            <span className="text-[11px] text-gray-600">Approved for public display</span>
          </label>
          {emailBlocked && <p className="text-[11px] text-red-500 mt-1">Add an email before approving it.</p>}
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">
            Professional phone
            <span className={`ml-2 normal-case tracking-normal font-semibold ${phoneLive ? "text-emerald-600" : "text-gray-400"}`}>
              {phoneLive ? "· eligible for public display" : "· not displayed"}
            </span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => {
              const v = e.target.value;
              setPhone(v);
              if (v.trim() === "") setPhoneApproved(false);
              setSaved(false);
            }}
            placeholder="(555) 010-0000"
            autoComplete="off"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-300 focus:outline-none focus:border-[#3b6ea5]"
          />
          {!phoneValid && <p className="text-[11px] text-red-500 mt-1">Enter a valid phone number.</p>}
          <label className="mt-1.5 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={phoneApproved}
              onChange={(e) => { setPhoneApproved(e.target.checked); setSaved(false); }}
              className="w-3.5 h-3.5 accent-[#3b6ea5] cursor-pointer"
            />
            <span className="text-[11px] text-gray-600">Approved for public display</span>
          </label>
          {phoneBlocked && <p className="text-[11px] text-red-500 mt-1">Add a phone number before approving it.</p>}
        </div>
      </div>

      {error && <p className="text-[11px] text-red-500 mt-3 flex items-center gap-1"><i className="ri-error-warning-line"></i>{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="whitespace-nowrap inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#3b6ea5] text-white text-xs font-bold rounded-lg hover:bg-[#33608f] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <i className="ri-save-line"></i>{saving ? "Saving…" : "Save contact"}
        </button>
        {saved && <span className="text-[11px] font-semibold text-emerald-600 inline-flex items-center gap-1"><i className="ri-checkbox-circle-line"></i>Saved</span>}
      </div>
    </div>
  );
}
