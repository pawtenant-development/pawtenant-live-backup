# PROVIDER-PUBLIC-PROFILES-LIVE-ROLLOUT-001

**Status:** LIVE COMPLETE — curated public provider profiles deployed to pawtenant.com.
**Source:** validated TEST implementation AI-SEO-PROVIDER-CANONICAL-DEDUP-AND-EXPANSION-001 (TEST code `ef74627`).
**LIVE start SHA:** `569cca4` → **LIVE code commit:** `266946c`.

## What shipped to LIVE
Curated, fail-closed public provider surface — exactly eight owner-approved providers
(Robert Staaf, Michelle Lafferty, Lytara Garcia, Stephanie White + new Eve Rosno,
Henry Smith, Chad Cunningham, Karla Delgado) + `/our-providers` directory. Facts
verified read-only against LIVE authoritative records; disputed optional facts omitted
conservatively (Staaf 30 states / omit PA·NH; Lafferty NC·PA / no NPI; White LCSW / 24;
Garcia LCSW / 7).

- `src/data/publicProviders.ts` — owner-curated allowlist snapshot (public fields only).
- `src/lib/providerVisibility.ts` — env-separated fail-closed adapter. Production reads
  live status and fails closed; the snapshot fallback is gated by `isTestProviderEnv()`
  (TEST Supabase ref, defaults to production) — cannot run in LIVE.
- `doctor-profile/page.tsx` — synchronous curated render (prerenderable); real 404/noindex
  for non-approved slugs.
- `our-providers/page.tsx` + `/our-providers` route — directory (CollectionPage/ItemList).
- **Homepage carousel (DoctorsSection) repointed to the curated eight** with controlled
  images (4 repo photos + 4 initials) — no longer the DB-published roster. Owner decision
  (Option 1). This excludes the unapproved DB-published providers (Cassandra Enriquez,
  Jessica Bailey) and keeps the four new providers as initials (their unvetted LIVE photos
  never surface). Same change applied to TEST for parity.
- Edge fail-closed 404: only the 8 approved `/doctors` slugs valid; Edna, Cassandra,
  Jessica, aliases, and unknown provider URLs → real 404/noindex.
- Prerender 8 profiles + `/our-providers`; ProfilePage/Person/BreadcrumbList JSON-LD in `<head>`.
- `vercel.json` 4 one-hop alias 301(308) redirects; XML + HTML sitemaps; footer / About /
  homepage internal links. Removed fabricated "Dr. M. Reeves" sample identity.
- `scripts/check-provider-entity.mjs` blocking guard wired into the LIVE build.

## Database / Supabase safety — NONE TOUCHED
No migration, no Supabase function deploy, no writes to approved_providers /
doctor_profiles / provider_applications, no is_active / is_published / lifecycle change,
no bio / state / NPI / image / email change, no storage bucket / RLS change. Read-only
LIVE verification only. Public allowlist controls public discoverability ONLY — Edna,
Cassandra, Jessica, and all other providers remain in admin unchanged.

## Mirror method (no blind copy)
Sourced every provider file from the committed TEST ref `ef74627` (immune to a concurrent
TEST writer's unrelated refund-policy working-tree changes — those were excluded). 6 new
files + 9 baseline-identical files copied; DoctorsSection replaced with the curated version;
8 diverged LIVE files (package.json, sitemap.xml, seoConfig.ts, about-us, everything-esa-online,
router/config, vercel.json + regenerated routeManifest) received surgical provider hunks only,
preserving all unrelated LIVE content.

## Image contract (this release)
Repo photos: Staaf, Lafferty, Garcia, White. Initials: Eve (ER), Henry (HS), Chad (CC),
Karla (KD). No LIVE Supabase image URLs copied/hardcoded (build-output scan: 0 storage URLs
in provider pages). Real photos for the four new providers deferred to **PROVIDER-PHOTO-PARITY-001**.

## Validation (all green)
`gen:routes` (DOCTOR_SLUGS=8) · `check-provider-entity` · full `npm run build` (Vite +
prerender + check-full-body-prerender [9 provider routes] + check-machine-facts +
check-route-status + pricing/funnel guards) · type-check (no errors in changed files) ·
ESLint (new/rewritten code clean; only pre-existing `router/config` react-refresh warnings) ·
build-output scans (self-canonical + ProfilePage/Person/BreadcrumbList in head, 0 JSON-LD in
#root, indexable robots, M. Reeves absent, 0 real-provider emails, 0 Supabase storage URLs) ·
`git diff --check` clean.

## Deployment record (LIVE)
- LIVE deployment ID: `dpl_4SbpJTdksVfcByGgEtZouNGj1yXi` (target production)
- Served SHA: `266946c` (`githubCommitSha 266946cbffc66b00201443523c9acbd54f3b08eb`)
- Previous Ready rollback deployment: `dpl_HSwsZSwFb5ghJbEPrRqZsarqLUui` (SHA `569cca4`)
- Production domain: https://pawtenant.com

## Future task
**PROVIDER-PHOTO-PARITY-001** (deferred, separate controlled rollout): verify + vet real
photos for Eve, Henry, Chad, Karla; create stable repo assets (strip metadata; confirm
identity); update public cards + profiles; test in TEST; separate LIVE rollout.

## Pre-existing issues (NOT fixed — out of scope)
- `router/config.tsx` has pre-existing `react-refresh/only-export-components` warnings
  (fail `--max-warnings 0`, but not in the build chain). No new lint issues introduced.
- A concurrent TEST writer's unrelated "Refund Policy" feature was active during this
  rollout; it was intentionally excluded from LIVE (sourced from committed `ef74627`).
