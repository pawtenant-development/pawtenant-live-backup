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
      const { data } = await supabase
        .from("approved_providers")
        .select("*")
        .eq("is_active", true)
        .order("created_at");
      if (cancelled) return;
      if (data) {
        setDoctors((data as ApprovedProviderRow[]).map(mapApprovedToDoctor));
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);
  return { doctors, loading, reload };
}
