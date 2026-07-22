# SEO-BREADCRUMB-MISSING-ITEM — LIVE rollout (Phase A of ROLLOUT-001)

**Status:** LIVE deployed + verified.
**Date:** 2026-07-22
**Starting LIVE SHA:** `8c83778`. **Source commit (TEST, verified):** `7bb4062`.
**Pre-task rollback deployment:** `pawtenant-production-jkclrz8qs` (served `8c83778`).

## Parity audit (TEST `7bb4062` → current LIVE)
| Surface | TEST source | LIVE before | Action | Risk |
|---|---|---|---|---|
| `src/lib/providerJsonLd.ts` | `item: url` on final crumb (pos 3 profile, pos 2 directory) | byte-identical to pre-fix TEST (final crumb missing `item`) | apply the 2 hunks | none — additive JSON-LD |
| `scripts/check-breadcrumb-structured-data.mjs` | new guard | absent | port verbatim (306 lines, byte-identical to `7bb4062`) | none |
| `package.json` build chain | TEST-specific (has cluster + sitemap-parity guards) | LIVE-specific (has `verify-attribution-hygiene`) | **surgical insert only** `check-breadcrumb-structured-data.mjs` after `check-provider-entity.mjs`; add `check:/test:breadcrumbs` | none — TEST package.json NOT copied |

Confirmed current LIVE production still had the defect at rollout start: `/our-providers` (pos 2) and
`/doctors/robert-staaf` (pos 3) both lacked `item`.

## Files changed (3, surgical)
- `src/lib/providerJsonLd.ts` — `item: url` added to the final ListItem in `breadcrumbNode` (pos 3)
  and `buildOurProvidersJsonLd` (pos 2). No other schema (Person/ProfilePage/ItemList/Organization) changed.
- `scripts/check-breadcrumb-structured-data.mjs` — new guard (ported verbatim from `7bb4062`).
- `package.json` — guard wired into the LIVE build chain (after `check-provider-entity.mjs`);
  `check:/test:breadcrumbs` scripts added. LIVE-only guards (verify-attribution-hygiene, etc.) preserved.

## Validation
- Guard self-test: 15/15 negative controls fire; baseline clean.
- Full `npm run build`: PASS. Breadcrumb guard: builder fixtures + 9 raw-HTML pages (all 8 providers +
  /our-providers) + 26 source files + 404/410-no-schema. `check-provider-entity`: "BreadcrumbList once"
  per provider (no duplication). All LIVE guards green.
- `tsc --noEmit`: 0 errors. ESLint `providerJsonLd.ts`: 0 warnings. `git diff --check`: clean. Secrets/PII: clean.
- Built `out/`: `/doctors/robert-staaf` pos-3 and `/our-providers` pos-2 now carry `item` = page canonical.

## Commits / deployment
- Code: `fix: repair breadcrumb structured data` — `5055028`.
- Docs: `docs: record live breadcrumb schema rollout` (this commit).
- Deployment: auto-deploy on push of the docs commit; served SHA + deployment ID recorded in the
  session final report. Verified on `pawtenant.com` (below).
- Rollback: `pawtenant-production-jkclrz8qs` (pre-task) → the Phase A deployment becomes the Phase B rollback target.

## Production verification (pawtenant.com)
- `/our-providers` + all 8 `/doctors/<slug>`: HTTP 200, final crumb carries `item` = canonical, one
  BreadcrumbList, canonical unchanged, no console errors. Invalid `/doctors/<x>` + unrelated invalid
  route: 404, no provider BreadcrumbList/Person/ProfilePage schema.

## Remaining
GSC "Validate Fix" (breadcrumb) after production verification. Phase B (PSD/ESA cluster) follows.

## Safety
No LIVE content/route/canonical/sitemap/pricing/checkout/Ads/Supabase/DB change beyond the breadcrumb
JSON-LD fix + guard. No migration, no Edge Function, no DB write. `/esa-letter-housing` untouched.
No ESA Housing work. Only 3 files staged; orphan docs preserved.
