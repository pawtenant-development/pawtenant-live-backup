// MissingProfessionalContactNotice — PROVIDER-PROFESSIONAL-CONTACT-PUBLIC-CONSENT-001.
//
// One notice, mounted on the two surfaces that submit or review an eligible
// FINAL ESA/PSD letter. It is informational only: nothing here blocks an upload,
// a review, an approval or delivery, and it never touches order state.
//
// It reads only the two approval booleans plus whether a value exists. It never
// selects doctor_profiles.email or .phone, so the provider's login address and
// the legacy unlabelled number cannot leak through this component — including as
// a "did you mean" suggestion.
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

interface Props {
  /** doctor_profiles.id of the issuing provider (Admin surfaces hold this). */
  providerId?: string | null;
  /** doctor_profiles.user_id (the Provider Portal holds this instead). */
  providerUserId?: string | null;
  /** Mount only where an eligible final ESA/PSD letter is being submitted or reviewed. */
  eligible?: boolean;
  className?: string;
}

export default function MissingProfessionalContactNotice({
  providerId,
  providerUserId,
  eligible = true,
  className = "",
}: Props) {
  const [emailOk, setEmailOk] = useState<boolean | null>(null);
  const [phoneOk, setPhoneOk] = useState<boolean | null>(null);

  const key = providerId ?? providerUserId ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!key || !eligible) { setEmailOk(null); setPhoneOk(null); return; }
    (async () => {
      const q = supabase
        .from("doctor_profiles")
        .select("professional_email, professional_phone, professional_email_public_approved, professional_phone_public_approved");
      const { data } = await (providerId
        ? q.eq("id", providerId)
        : q.eq("user_id", providerUserId as string)
      ).maybeSingle();
      if (cancelled) return;
      const row = data as {
        professional_email: string | null;
        professional_phone: string | null;
        professional_email_public_approved: boolean | null;
        professional_phone_public_approved: boolean | null;
      } | null;
      setEmailOk(!!row?.professional_email_public_approved && !!row?.professional_email);
      setPhoneOk(!!row?.professional_phone_public_approved && !!row?.professional_phone);
    })();
    return () => { cancelled = true; };
  }, [key, providerId, providerUserId, eligible]);

  if (!eligible || !key || emailOk === null || phoneOk === null) return null;
  if (emailOk && phoneOk) return null;

  const message = (!emailOk && !phoneOk)
    ? "Professional contact is not configured. The letter can still be issued and verified, but phone/email will be omitted from the public verification result."
    : !emailOk
      ? "Professional email is not configured. The letter can still be issued and verified, but the email will be omitted from the public verification result."
      : "Professional phone is not configured. The letter can still be issued and verified, but the phone number will be omitted from the public verification result.";

  return (
    <div className={`flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 ${className}`}>
      <i className="ri-information-line text-amber-600 text-sm flex-shrink-0 mt-0.5"></i>
      <p className="text-xs text-amber-800 leading-relaxed">{message}</p>
    </div>
  );
}
