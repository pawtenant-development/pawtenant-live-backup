// src/data/publicProviders.ts
//
// AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001
//
// OWNER-CURATED PUBLIC PROVIDER SNAPSHOT — the single source of truth for the
// public /doctors/<slug> profile pages, the /our-providers directory, the XML +
// HTML sitemaps, and the full-body prerender. It is an ALLOWLIST: only the eight
// providers below may ever render publicly, regardless of what the provider
// database contains.
//
// Provenance: every fact was verified READ-ONLY against the LIVE authoritative
// records (approved_providers + doctor_profiles, both is_active AND is_published)
// on lastVerified. Where authoritative sources disagreed on an optional fact the
// disputed value was OMITTED (conservative), never broadened:
//   - Robert Staaf:   PA and NH each appeared in only one source -> omitted (30 states kept).
//   - Michelle Lafferty: VA appeared in one source only -> omitted (NC, PA kept); no NPI exists.
//   - Stephanie White: PsyD/DCSW/BCD titles dropped -> conservative LCSW; states agreed (24).
//   - Lytara Garcia:  SAP/CEAP dropped -> conservative LCSW; "ESA Mental Health Specialist" = role label.
// No private fields (email/phone/address/internal id/private license numbers) live here.
// This file MUST NOT contain the live active/published GATE for production — see
// src/lib/providerVisibility.ts. `snapshotActive`/`snapshotPublished` are the
// LAST-VERIFIED status used ONLY for deterministic TEST rendering and MUST NOT
// override a negative LIVE status.

export interface PublicProvider {
  /** Clean canonical slug — the public URL is /doctors/<slug>. */
  slug: string;
  /** Authoritative approved_providers.slug (the -hex alias for the 4 flagship providers). */
  dbSlug: string;
  name: string;
  /** Post-nominal shown after the name in the H1 (e.g. "LCSW"). */
  title: string;
  /** Role / credential subtitle (e.g. "Licensed Clinical Social Worker"). Not a Physician type. */
  role: string;
  /** Neutral, verified-facts-only biography. No experience/specialties/awards/quotes/"Dr.". */
  bio: string;
  /** Verified public NPI, or null when none is verified for this exact provider. */
  npi: string | null;
  /** Exact verified licensed/service state CODES (conservative — disputed states omitted). */
  states: string[];
  /** Neutral highlight chips. */
  highlights: string[];
  /** Repo-safe public asset path, or null -> component renders a branded initials avatar. */
  image: string | null;
  /** True for the four providers added in this task (initials avatars until owner uploads photos). */
  isNew: boolean;
  /** ISO date the facts were last verified against LIVE authoritative records. */
  lastVerified: string;
  /** Last-verified authoritative status. TEST-only fallback; never overrides negative LIVE status. */
  snapshotActive: boolean;
  snapshotPublished: boolean;
}

export const PROVIDER_SNAPSHOT_VERIFIED = "2026-07-21";

// The curated approved public set — EXACTLY EIGHT. Do not add a ninth.
export const PUBLIC_PROVIDERS: readonly PublicProvider[] = [
  {
    slug: "robert-staaf",
    dbSlug: "robert-staaf-c9240",
    name: "Robert Staaf",
    title: "LCSW",
    role: "Licensed Clinical Social Worker",
    bio: "Robert Staaf is a Licensed Clinical Social Worker who provides telehealth mental health evaluations, including assessments for emotional support animal (ESA) documentation. Each evaluation is conducted individually, and a letter is issued only when it is clinically appropriate.",
    npi: "1467172478",
    states: ["AL", "AZ", "CO", "CT", "DC", "FL", "GA", "ID", "IL", "IN", "KY", "ME", "MD", "MA", "MI", "MN", "MS", "MT", "NV", "NJ", "NM", "NC", "OH", "OK", "RI", "SC", "TX", "UT", "VT", "VA"],
    highlights: ["LCSW", "Telehealth Evaluations", "ESA Documentation"],
    image: "/assets/providers/provider-robert-staaf.jpg",
    isNew: false,
    lastVerified: PROVIDER_SNAPSHOT_VERIFIED,
    snapshotActive: true,
    snapshotPublished: true,
  },
  {
    slug: "michelle-lafferty",
    dbSlug: "michelle-lafferty-ff1309",
    name: "Michelle Lafferty",
    title: "LCSW",
    role: "Licensed Clinical Social Worker",
    bio: "Michelle Lafferty is a Licensed Clinical Social Worker who conducts telehealth mental health evaluations, including assessments for emotional support animal (ESA) documentation. She reviews each client individually and issues a letter only when it is clinically appropriate.",
    npi: null,
    states: ["NC", "PA"],
    highlights: ["LCSW", "Telehealth Evaluations", "ESA Documentation"],
    image: "/assets/providers/provider-michelle-lafferty.jpg",
    isNew: false,
    lastVerified: PROVIDER_SNAPSHOT_VERIFIED,
    snapshotActive: true,
    snapshotPublished: true,
  },
  {
    slug: "lytara-garcia",
    dbSlug: "lytara-garcia-5a39d",
    name: "Lytara Garcia",
    title: "LCSW",
    role: "ESA Mental Health Specialist",
    bio: "Lytara Garcia is a Licensed Clinical Social Worker who provides telehealth mental health evaluations, including emotional support animal (ESA) assessments. Each evaluation is completed individually, and a letter is issued only when it is clinically appropriate.",
    npi: "1386996213",
    states: ["CA", "NV", "AZ", "TX", "UT", "ID", "FL"],
    highlights: ["LCSW", "Telehealth Evaluations", "ESA Documentation"],
    image: "/assets/providers/provider-lytara-garcia.jpg",
    isNew: false,
    lastVerified: PROVIDER_SNAPSHOT_VERIFIED,
    snapshotActive: true,
    snapshotPublished: true,
  },
  {
    slug: "stephanie-white",
    dbSlug: "stephanie-white-0fd45",
    name: "Stephanie White",
    title: "LCSW",
    role: "Licensed Clinical Social Worker",
    bio: "Stephanie White is a Licensed Clinical Social Worker who provides telehealth mental health evaluations, including assessments for emotional support animal (ESA) documentation. Every evaluation is individual, and a letter is issued only when it is clinically appropriate.",
    npi: "1528423795",
    states: ["AL", "AK", "CA", "CO", "DE", "FL", "GA", "HI", "ID", "IA", "KS", "KY", "LA", "MT", "NE", "NV", "NJ", "ND", "OR", "TX", "VT", "WV", "WI", "WY"],
    highlights: ["LCSW", "Telehealth Evaluations", "ESA Documentation"],
    image: "/assets/providers/provider-stephanie-white.jpg",
    isNew: false,
    lastVerified: PROVIDER_SNAPSHOT_VERIFIED,
    snapshotActive: true,
    snapshotPublished: true,
  },
  {
    slug: "eve-rosno",
    dbSlug: "eve-rosno",
    name: "Eve Rosno",
    title: "PhD",
    role: "Licensed Psychologist",
    bio: "Eve Rosno is a licensed psychologist who provides telehealth mental health evaluations, including assessments for emotional support animal (ESA) documentation. Each evaluation is conducted individually, and a letter is issued only when it is clinically appropriate.",
    npi: "1588688816",
    states: ["AL", "AZ", "AR", "CO", "CT", "DE", "FL", "GA", "ID", "IL", "IN", "KS", "KY", "ME", "MD", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NC", "ND", "OH", "OK", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "DC", "WV", "WI", "WY"],
    highlights: ["Licensed Psychologist", "Telehealth Evaluations", "ESA Documentation"],
    image: null,
    isNew: true,
    lastVerified: PROVIDER_SNAPSHOT_VERIFIED,
    snapshotActive: true,
    snapshotPublished: true,
  },
  {
    slug: "henry-smith",
    dbSlug: "henry-smith",
    name: "Henry Smith",
    title: "LCSW",
    role: "Licensed Clinical Social Worker",
    bio: "Henry Smith is a Licensed Clinical Social Worker who provides telehealth mental health evaluations, including assessments for emotional support animal (ESA) documentation. Each evaluation is conducted individually, and a letter is issued only when it is clinically appropriate.",
    npi: "1336686450",
    states: ["FL", "CO", "NM", "IL", "MA"],
    highlights: ["LCSW", "Telehealth Evaluations", "ESA Documentation"],
    image: null,
    isNew: true,
    lastVerified: PROVIDER_SNAPSHOT_VERIFIED,
    snapshotActive: true,
    snapshotPublished: true,
  },
  {
    slug: "chad-cunningham",
    dbSlug: "chad-cunningham",
    name: "Chad Cunningham",
    title: "LPC",
    role: "Licensed Professional Counselor",
    bio: "Chad Cunningham is a Licensed Professional Counselor who provides telehealth mental health evaluations, including assessments for emotional support animal (ESA) documentation. Each evaluation is conducted individually, and a letter is issued only when it is clinically appropriate.",
    npi: "1619165966",
    states: ["MO", "SD", "NM", "UT"],
    highlights: ["LPC", "Telehealth Evaluations", "ESA Documentation"],
    image: null,
    isNew: true,
    lastVerified: PROVIDER_SNAPSHOT_VERIFIED,
    snapshotActive: true,
    snapshotPublished: true,
  },
  {
    slug: "karla-delgado",
    dbSlug: "karla-delgado",
    name: "Karla Delgado",
    title: "LMFT",
    role: "Licensed Marriage and Family Therapist",
    bio: "Karla Delgado is a Licensed Marriage and Family Therapist who provides telehealth mental health evaluations, including assessments for emotional support animal (ESA) documentation. Each evaluation is conducted individually, and a letter is issued only when it is clinically appropriate.",
    npi: "1730728858",
    states: ["CA"],
    highlights: ["LMFT", "Telehealth Evaluations", "ESA Documentation"],
    image: null,
    isNew: true,
    lastVerified: PROVIDER_SNAPSHOT_VERIFIED,
    snapshotActive: true,
    snapshotPublished: true,
  },
];

// Clean canonical slugs (exactly 8). Consumed by the route manifest generator,
// the prerender entry, sitemaps, and the entity guard.
export const CURATED_PROVIDER_SLUGS: readonly string[] = PUBLIC_PROVIDERS.map((p) => p.slug);

// Homepage subset — a smaller, curated strip that MUST include Eve Rosno.
export const HOMEPAGE_PROVIDER_SLUGS: readonly string[] = [
  "eve-rosno",
  "robert-staaf",
  "stephanie-white",
  "lytara-garcia",
];

// Explicitly EXCLUDED from all public surfaces (both the clean and -hex slugs
// must resolve to a privacy-safe 404/noindex). The underlying DB record is
// preserved; this is a public-visibility exclusion only. No reason is exposed.
export const EXCLUDED_PROVIDER_SLUGS: readonly string[] = [
  "edna-kwan",
  "edna-kwan-78e66",
];

const BY_SLUG: ReadonlyMap<string, PublicProvider> = new Map(
  PUBLIC_PROVIDERS.map((p) => [p.slug, p]),
);

/**
 * Resolve a clean slug to a curated public provider, or null. Pure and
 * synchronous so the profile page + prerender render without a Supabase round
 * trip. A null result MUST be treated as "not a public provider" (404/noindex) —
 * this is the allowlist half of the fail-closed contract.
 */
export function getPublicProvider(slug: string | undefined | null): PublicProvider | null {
  if (!slug) return null;
  return BY_SLUG.get(slug.trim().toLowerCase()) ?? null;
}

export function isCuratedProviderSlug(slug: string | undefined | null): boolean {
  return getPublicProvider(slug) !== null;
}
