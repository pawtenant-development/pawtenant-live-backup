import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Doctor } from "../mocks/doctors";
import { PUBLIC_HIDDEN_PROVIDER_EMAILS } from "./useActiveProviders";

// Phase 4 Step 4 — Internal/team roles that should NOT count as "real provider rows"
// when deciding whether to allow the static DOCTORS fallback. Mirrors the same set
// used in src/pages/admin-orders/page.tsx and DoctorsTab.tsx.
const NON_PROVIDER_ROLES = new Set(["owner", "admin_manager", "support", "finance", "read_only"]);

export interface ApprovedProviderRow {
  id: string;
  application_id: string | null;
  slug: string;
  full_name: string;
  title: string | null;
  role: string | null;
  bio: string | null;
  email: string | null;
  phone: string | null;
  photo_url: string | null;
  states: string[] | null;
  highlights: string[] | null;
  verification_url: string | null;
  is_active: boolean;
  created_at: string;
  npi_number?: string | null;
}

export function mapApprovedToDoctor(p: ApprovedProviderRow): Doctor {
  return {
    id: p.slug,
    name: p.full_name,
    title: p.title ?? "LCSW",
    role: p.role ?? "Licensed Mental Health Professional",
    bio: p.bio ?? "",
    states: p.states ?? [],
    highlights: p.highlights ?? ["Licensed Professional", "Telehealth Evaluations", "ESA Letters"],
    verificationUrl: p.verification_url ?? "https://pawtenant.com/join-our-network",
    // Empty string → UI renders a neutral initials avatar. No AI-generated fallback image.
    image: p.photo_url ?? "",
    email: p.email ?? "",
    npi_number: p.npi_number ?? null,
  };
}

export function useDynamicDoctors(): {
  doctors: Doctor[];
  loading: boolean;
  reload: () => void;
  hasProviderRows: boolean;
} {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  // Phase 4 Step 4 — true when at least one provider-eligible doctor_profiles row
  // exists. Consumers should suppress the static DOCTORS fallback when this is true.
  const [hasProviderRows, setHasProviderRows] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      // Parallel fetch — providers for display + role probe for fallback decision.
      const [approvedRes, roleProbeRes] = await Promise.all([
        supabase.from("approved_providers").select("*").order("created_at"),
        supabase.from("doctor_profiles").select("role"),
      ]);

      if (cancelled) return;

      // Phase 4 Step 4 — fallback decision: do any provider-eligible profiles exist?
      // Internal/team roles are filtered out so they cannot suppress fallback themselves.
      // Null role is treated as provider-eligible (matches DoctorsTab logic).
      const realProviderRowsExist = ((roleProbeRes.data as { role: string | null }[] | null) ?? [])
        .some((r) => !NON_PROVIDER_ROLES.has(r.role ?? ""));
      setHasProviderRows(realProviderRowsExist);

      const rawProviders = approvedRes.data;

      // Phase 4 Step 3 — public visibility gated by doctor_profiles.is_published.
      // approved_providers is still the display source (slug, photo, bio, states),
      // but its is_active flag is no longer used as the public gate.
      const providers = (rawProviders ?? []).filter(
        (p: ApprovedProviderRow) => !p.email || !PUBLIC_HIDDEN_PROVIDER_EMAILS.has(p.email.toLowerCase())
      );

      if (providers && providers.length > 0) {
        const emails = (providers as ApprovedProviderRow[])
          .map((p) => p.email)
          .filter(Boolean) as string[];

        // Single doctor_profiles fetch — gives us both is_published (gate) and npi_number (display).
        let npiMap: Record<string, string> = {};
        let publishedSet = new Set<string>();
        if (emails.length > 0) {
          const { data: profiles } = await supabase
            .from("doctor_profiles")
            .select("email, npi_number, is_published")
            .in("email", emails);
          if (profiles) {
            const rows = profiles as { email: string | null; npi_number: string | null; is_published: boolean | null }[];
            npiMap = Object.fromEntries(
              rows
                .filter((p) => p.email && p.npi_number)
                .map((p) => [(p.email as string).toLowerCase(), p.npi_number as string])
            );
            publishedSet = new Set(
              rows
                .filter((p) => p.email && p.is_published === true)
                .map((p) => (p.email as string).toLowerCase())
            );
          }
        }

        // Phase 4 Step 3 gate — only show providers whose doctor_profiles row has is_published === true.
        // Missing profile, null, undefined, or false → hidden. Strict equality on purpose.
        // Note: is_active (availability) intentionally NOT checked here — availability
        // controls assignment only, publish controls homepage visibility.
        const visible = (providers as ApprovedProviderRow[]).filter(
          (p) => !!p.email && publishedSet.has(p.email.toLowerCase())
        );

        const mapped = visible.map((p) => ({
          ...p,
          npi_number: p.email ? (npiMap[p.email.toLowerCase()] ?? null) : null,
        }));

        if (!cancelled) setDoctors(mapped.map(mapApprovedToDoctor));
      } else {
        if (!cancelled) setDoctors([]);
      }

      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);
  return { doctors, loading, reload, hasProviderRows };
}
