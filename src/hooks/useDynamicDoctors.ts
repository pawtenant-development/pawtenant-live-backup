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

interface DoctorProfileRow {
  email: string | null;
  full_name: string | null;
  title: string | null;
  role: string | null;
  bio: string | null;
  photo_url: string | null;
  npi_number: string | null;
  is_published: boolean | null;
  licensed_states: string[] | null;
  created_at: string | null;
}

interface DoctorContactRow {
  email: string;
  full_name: string | null;
  photo_url: string | null;
  licensed_states: string[] | null;
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

// Slug fallback — used only when a published provider exists in doctor_profiles
// but has no matching approved_providers row to provide a slug. Mirrors the
// admin "approve" slug pattern: lowercase, hyphen-joined, alpha-only.
function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
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

      // doctor_profiles is the source-of-truth for publish status (admin's "Published" toggle
      // writes is_published here). Drive the homepage from this table so any provider the
      // admin marks Published is guaranteed to render — even if approved_providers is missing
      // their row or has an email-case mismatch.
      const [profilesRes, approvedRes, contactsRes] = await Promise.all([
        supabase.from("doctor_profiles").select("email, full_name, title, role, bio, photo_url, npi_number, is_published, licensed_states, created_at"),
        supabase.from("approved_providers").select("*").order("created_at"),
        supabase.from("doctor_contacts").select("email, full_name, photo_url, licensed_states"),
      ]);

      if (cancelled) return;

      const allProfiles = (profilesRes.data as DoctorProfileRow[] | null) ?? [];
      const allApproved = (approvedRes.data as ApprovedProviderRow[] | null) ?? [];
      const allContacts = (contactsRes.data as DoctorContactRow[] | null) ?? [];

      // Phase 4 Step 4 — fallback decision: do any provider-eligible profiles exist?
      // Internal/team roles are filtered out so they cannot suppress fallback themselves.
      const realProviderRowsExist = allProfiles.some(
        (p) => !NON_PROVIDER_ROLES.has((p as DoctorProfileRow & { role: string | null }).role ?? "")
      );
      setHasProviderRows(realProviderRowsExist);

      const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

      // Index enrichment tables by lowercased email so case/whitespace mismatches
      // between admin-written rows can't drop providers.
      const approvedByEmail = new Map<string, ApprovedProviderRow>();
      for (const a of allApproved) {
        const key = norm(a.email);
        if (key) approvedByEmail.set(key, a);
      }
      const contactByEmail = new Map<string, DoctorContactRow>();
      for (const c of allContacts) {
        const key = norm(c.email);
        if (key) contactByEmail.set(key, c);
      }

      // Visible set = doctor_profiles where is_published === true, NOT in public blocklist.
      // is_active / availability_status are intentionally NOT checked — those control
      // assignment only. PUBLIC_HIDDEN_PROVIDER_EMAILS is the only public hide gate.
      const publishedProfiles = allProfiles.filter((p) => {
        if (p.is_published !== true) return false;
        const key = norm(p.email);
        if (!key) return false;
        if (PUBLIC_HIDDEN_PROVIDER_EMAILS.has(key)) return false;
        return true;
      });

      // Build the Doctor[] from doctor_profiles, enriching with approved_providers
      // (slug, verification_url, highlights, bio fallback) and doctor_contacts
      // (photo fallback, states fallback). Image precedence matches admin lookup:
      // doctor_profiles.photo_url → doctor_contacts.photo_url → approved_providers.photo_url.
      const merged: Doctor[] = publishedProfiles.map((p) => {
        const key = norm(p.email);
        const a = approvedByEmail.get(key);
        const c = contactByEmail.get(key);

        const fullName = (p.full_name ?? a?.full_name ?? c?.full_name ?? "").trim();
        const photo =
          (p.photo_url && p.photo_url.trim() !== "") ? p.photo_url
          : (c?.photo_url && c.photo_url.trim() !== "") ? c.photo_url
          : (a?.photo_url && a.photo_url.trim() !== "") ? a.photo_url
          : "";

        const states = (p.licensed_states && p.licensed_states.length > 0)
          ? p.licensed_states
          : (a?.states && a.states.length > 0)
          ? a.states
          : (c?.licensed_states ?? []);

        const slug = a?.slug && a.slug.trim() !== ""
          ? a.slug
          : slugifyName(fullName || (p.email ?? ""));

        return {
          id: slug,
          name: fullName,
          title: p.title ?? a?.title ?? "LCSW",
          role: p.role ?? a?.role ?? "Licensed Mental Health Professional",
          bio: (p.bio && p.bio.trim() !== "") ? p.bio : (a?.bio ?? ""),
          states,
          highlights: a?.highlights ?? ["Licensed Professional", "Telehealth Evaluations", "ESA Letters"],
          verificationUrl: a?.verification_url ?? "https://pawtenant.com/join-our-network",
          image: photo,
          email: p.email ?? "",
          npi_number: p.npi_number ?? a?.npi_number ?? null,
        } satisfies Doctor;
      });

      // Stable, deterministic order: approved_providers.created_at when available,
      // otherwise doctor_profiles.created_at, otherwise name. Prevents random
      // reordering between page loads.
      const orderKey = (d: Doctor): string => {
        const a = approvedByEmail.get(norm(d.email));
        if (a?.created_at) return `0:${a.created_at}`;
        const p = publishedProfiles.find((x) => norm(x.email) === norm(d.email));
        if (p?.created_at) return `1:${p.created_at}`;
        return `2:${d.name}`;
      };
      merged.sort((x, y) => orderKey(x).localeCompare(orderKey(y)));

      if (!cancelled) setDoctors(merged);
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [tick]);

  const reload = () => setTick((t) => t + 1);
  return { doctors, loading, reload, hasProviderRows };
}
