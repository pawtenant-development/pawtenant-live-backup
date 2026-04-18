import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * Providers hidden from the PUBLIC website only.
 * They remain fully visible in the admin portal and provider assignment logic.
 * Add a provider's lowercase email here to hide them from all customer-facing surfaces.
 */
export const PUBLIC_HIDDEN_PROVIDER_EMAILS: ReadonlySet<string> = new Set([
  "edna_kwan@yahoo.com",
  "plester601@gmail.com",
]);

/**
 * Returns a Set of lowercase emails for all DEACTIVATED providers.
 * Doctors whose email appears in this set should be hidden from the website and checkout.
 */
export function useDeactivatedProviderEmails(): { deactivated: Set<string>; loading: boolean } {
  const [deactivated, setDeactivated] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      const [profilesRes, contactsRes] = await Promise.all([
        supabase.from("doctor_profiles").select("email").eq("is_active", false),
        supabase.from("doctor_contacts").select("email").eq("is_active", false),
      ]);
      if (cancelled) return;
      const emails = new Set<string>();
      (profilesRes.data ?? []).forEach((r: { email: string | null }) => {
        if (r.email) emails.add(r.email.toLowerCase());
      });
      (contactsRes.data ?? []).forEach((r: { email: string }) => {
        if (r.email) emails.add(r.email.toLowerCase());
      });
      setDeactivated(emails);
      setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, []);

  return { deactivated, loading };
}
