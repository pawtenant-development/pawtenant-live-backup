import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import type { Doctor } from "../mocks/doctors";

const DEFAULT_IMAGE = "https://readdy.ai/api/search-image?query=professional%20licensed%20mental%20health%20therapist%20portrait%20headshot%20neutral%20warm%20background%20soft%20studio%20lighting%20confident%20friendly%20expression&width=200&height=200&seq=default-dyn-provider&orientation=squarish";

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
    image: p.photo_url ?? DEFAULT_IMAGE,
    email: p.email ?? "",
    npi_number: p.npi_number ?? null,
  };
}

export function useDynamicDoctors(): { doctors: Doctor[]; loading: boolean; reload: () => void } {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);

      // Fetch approved providers
      const { data: providers } = await supabase
        .from("approved_providers")
        .select("*")
        .eq("is_active", true)
        .order("created_at");

      if (cancelled) return;

      if (providers && providers.length > 0) {
        // Fetch NPI numbers from doctor_profiles for these providers
        const emails = (providers as ApprovedProviderRow[])
          .map((p) => p.email)
          .filter(Boolean) as string[];

        let npiMap: Record<string, string> = {};
        if (emails.length > 0) {
          const { data: profiles } = await supabase
            .from("doctor_profiles")
            .select("email, npi_number")
            .in("email", emails);
          if (profiles) {
            npiMap = Object.fromEntries(
              (profiles as { email: string; npi_number: string | null }[])
                .filter((p) => p.npi_number)
                .map((p) => [p.email.toLowerCase(), p.npi_number as string])
            );
          }
        }

        const mapped = (providers as ApprovedProviderRow[]).map((p) => ({
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
  return { doctors, loading, reload };
}
