// ProviderPublicContactPanel — PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001.
//
// The only place a provider can put contact details on a public verification
// result. It is deliberately NOT wired to any existing column:
//
//   • doctor_profiles.email is the provider's auth/login address (identical for
//     every provider on both arms, mostly personal mailboxes) and
//   • doctor_profiles.phone is an unlabelled legacy number.
//
// Neither may ever prefill these inputs, so the fields start empty and stay
// empty until the provider types something. A value is still not permission:
// publication requires the matching approval checkbox, and the DB carries a
// check constraint so approval cannot be stored without a value.
//
// Writes go through the provider's own session, so the "Doctors manage own
// profile" policy (user_id = auth.uid()) is what authorises the update — a
// provider cannot reach another provider's row from here.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  userId: string;
  /** Admin preview — renders read-only. */
  readOnly?: boolean;
}

interface ContactRow {
  professional_email: string | null;
  professional_phone: string | null;
  professional_email_public_approved: boolean;
  professional_phone_public_approved: boolean;
}

/** Conservative shapes. Anything rejected here never reaches the database. */
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"'.]+\.[^\s@<>"']{2,}$/;
const PHONE_RE = /^[0-9 ()+\-.]{7,24}$/;

export default function ProviderPublicContactPanel({ userId, readOnly = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [emailApproved, setEmailApproved] = useState(false);
  const [phoneApproved, setPhoneApproved] = useState(false);
  const [stored, setStored] = useState<ContactRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("doctor_profiles")
        .select("professional_email, professional_phone, professional_email_public_approved, professional_phone_public_approved")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError("Could not load your professional contact settings.");
      } else if (data) {
        const row = data as ContactRow;
        setStored(row);
        // Only ever seeded from these dedicated columns — never from the login
        // email or the legacy phone.
        setEmail(row.professional_email ?? "");
        setPhone(row.professional_phone ?? "");
        setEmailApproved(!!row.professional_email_public_approved);
        setPhoneApproved(!!row.professional_phone_public_approved);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const trimmedEmail = email.trim();
  const trimmedPhone = phone.trim();
  const emailValid = trimmedEmail === "" || EMAIL_RE.test(trimmedEmail);
  const phoneValid = trimmedPhone === "" || PHONE_RE.test(trimmedPhone);

  // The DB constraint is the real gate; this keeps the UI honest about it.
  const emailConsentBlocked = emailApproved && trimmedEmail === "";
  const phoneConsentBlocked = phoneApproved && trimmedPhone === "";
  const canSave = !readOnly && !saving && emailValid && phoneValid
    && !emailConsentBlocked && !phoneConsentBlocked;

  const nothingApproved =
    !(stored?.professional_email_public_approved) && !(stored?.professional_phone_public_approved);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true); setSaved(false); setError("");
    const { error: err } = await supabase
      .from("doctor_profiles")
      .update({
        professional_email: trimmedEmail || null,
        professional_phone: trimmedPhone || null,
        // Clearing a value clears its consent in the same write, so the pair can
        // never drift into "approved with nothing to publish".
        professional_email_public_approved: trimmedEmail ? emailApproved : false,
        professional_phone_public_approved: trimmedPhone ? phoneApproved : false,
      })
      .eq("user_id", userId);
    setSaving(false);
    if (err) {
      setError("Could not save. Please check the values and try again.");
      return;
    }
    setStored({
      professional_email: trimmedEmail || null,
      professional_phone: trimmedPhone || null,
      professional_email_public_approved: !!trimmedEmail && emailApproved,
      professional_phone_public_approved: !!trimmedPhone && phoneApproved,
    });
    if (!trimmedEmail) setEmailApproved(false);
    if (!trimmedPhone) setPhoneApproved(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="h-4 w-52 bg-gray-100 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 flex items-center justify-center bg-[#E8F1EE] rounded-xl flex-shrink-0">
          <i className="ri-contacts-book-line text-[#1A5C4F] text-lg"></i>
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-900 leading-snug">Public Professional Contact</h3>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            These approved professional contact details may appear publicly when someone
            successfully verifies a letter you issued. Your login email and private account
            information are never displayed.
          </p>
        </div>
      </div>

      {nothingApproved && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
          <i className="ri-information-line text-amber-600 text-sm flex-shrink-0 mt-0.5"></i>
          <p className="text-xs text-amber-800 leading-relaxed">
            Your letters remain valid, but your professional contact details will not appear on
            public verification results until you add and approve them.
          </p>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label htmlFor="prof-email" className="block text-[11px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
            Professional email
          </label>
          <input
            id="prof-email"
            type="email"
            value={email}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              setEmail(v);
              // Clearing a value clears its consent in the same gesture. Without
              // this the "approved but empty" state disables Save, and a provider
              // trying to remove a published address is stuck.
              if (v.trim() === "") setEmailApproved(false);
              setSaved(false);
            }}
            placeholder="e.g. verification@yourpractice.com"
            autoComplete="off"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-[#1A5C4F] focus:ring-2 focus:ring-[#1A5C4F]/10 disabled:bg-gray-50"
          />
          {!emailValid && (
            <p className="text-xs text-red-500 mt-1.5">Enter a valid email address.</p>
          )}
          <label className="mt-2 flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={emailApproved}
              disabled={readOnly}
              onChange={(e) => { setEmailApproved(e.target.checked); setSaved(false); }}
              className="mt-0.5 w-4 h-4 accent-[#1A5C4F] cursor-pointer"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              Display this email publicly on verification results.
              {stored?.professional_email_public_approved && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#1A5C4F]">
                  <i className="ri-checkbox-circle-fill"></i>Currently public
                </span>
              )}
            </span>
          </label>
          {emailConsentBlocked && (
            <p className="text-xs text-red-500 mt-1.5">Add an email address before approving it for display.</p>
          )}
        </div>

        <div>
          <label htmlFor="prof-phone" className="block text-[11px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
            Professional phone
          </label>
          <input
            id="prof-phone"
            type="tel"
            value={phone}
            disabled={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              setPhone(v);
              if (v.trim() === "") setPhoneApproved(false);
              setSaved(false);
            }}
            placeholder="e.g. (555) 010-0000"
            autoComplete="off"
            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-300 focus:outline-none focus:border-[#1A5C4F] focus:ring-2 focus:ring-[#1A5C4F]/10 disabled:bg-gray-50"
          />
          {!phoneValid && (
            <p className="text-xs text-red-500 mt-1.5">Enter a valid phone number.</p>
          )}
          <label className="mt-2 flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={phoneApproved}
              disabled={readOnly}
              onChange={(e) => { setPhoneApproved(e.target.checked); setSaved(false); }}
              className="mt-0.5 w-4 h-4 accent-[#1A5C4F] cursor-pointer"
            />
            <span className="text-xs text-gray-600 leading-relaxed">
              Display this phone number publicly on verification results.
              {stored?.professional_phone_public_approved && (
                <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#1A5C4F]">
                  <i className="ri-checkbox-circle-fill"></i>Currently public
                </span>
              )}
            </span>
          </label>
          {phoneConsentBlocked && (
            <p className="text-xs text-red-500 mt-1.5">Add a phone number before approving it for display.</p>
          )}
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-4 flex items-center gap-1.5">
          <i className="ri-error-warning-line"></i>{error}
        </p>
      )}

      {!readOnly && (
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="whitespace-nowrap inline-flex items-center gap-2 px-5 py-2.5 bg-[#1A5C4F] text-white text-sm font-bold rounded-xl hover:bg-[#15493F] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
          >
            <i className="ri-save-line"></i>
            {saving ? "Saving…" : "Save contact settings"}
          </button>
          {saved && (
            <span className="text-xs font-semibold text-[#1A5C4F] inline-flex items-center gap-1.5">
              <i className="ri-checkbox-circle-line"></i>Saved
            </span>
          )}
        </div>
      )}

      <p className="text-[11px] text-gray-400 mt-4 leading-relaxed">
        Revoking an approval removes that detail from public verification results immediately,
        including letters you have already issued.
      </p>
    </div>
  );
}
