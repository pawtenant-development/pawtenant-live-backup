# Refund Policy + Housing-Denial Terms — Production Rollout

**Task:** REFUND-POLICY-HOUSING-DENIAL-LIVE-ROLLOUT-001
**Scope:** LIVE (`pawtenant-live-backup` → pawtenant.com). Mirror of verified TEST work.
**TEST source:** code `2c5800f`, docs `6818364` (verified + deployed on pawtenant-test.vercel.app).
**LIVE starting SHA:** `c5c3fab` (provider-profile rollout + RA-earnings correction; no refund policy).

## Surgical mirror method
- Preflight: both repos clean, canonical `main`, 0/0.
- 2 new files copied from TEST: `src/pages/refund-policy/page.tsx`, `scripts/check-refund-guarantee-parity.mjs`.
- 14 of 18 modified files applied via `git apply` from the TEST commit patch (clean).
- 4 diverged files edited manually, preserving LIVE divergence:
  - `package.json` — added the refund guard to the (LIVE-specific) build chain + npm scripts.
  - `terms-of-use` — replaced only the refund section; **kept LIVE's AR/CA/IA/LA/MT notice**;
    refreshed "Last Updated" Sept 18 2024 → July 22 2026.
  - `no-risk-guarantee` — concise two-scenario rewrite using **LIVE's `font-extrabold` h1** (not
    the TEST-only `pt-hero-display` class).
  - `housing-rights` — only the line-52 "only grounds" FAQ; **LIVE's twitter meta was already
    the hedged version** (no change needed).
- Route manifest regenerated from the combined LIVE tree (`gen:routes`).

## What changed on LIVE
New `/refund-policy` (source of truth: categories A–I, housing-denial review, evidence examples,
up-to-$40 discretionary fee, 5–10-day timing, disputes, fair-housing resources) wired into
router + manifest + XML/HTML sitemaps + footer + `CORE_PAGE_META`. Terms refund summary + link.
Privacy refund-evidence additions. Concise No-Risk page. FAQ + public contradiction removals.
Portal + admin-SMS timing → 5–10 days. Internal support KB + post-request admin email template.

## Up-to-$40 rule
Discretionary, manual, case-specific, never exceeds amount paid, only after substantial
professional work, exempt from every guaranteed full-refund category, subject to applicable law.
**No automatic backend deduction.** Appears only in `/refund-policy` + the concise Terms summary.

## Guardrails preserved
provider-entity, provider-ra-earnings, route-status, full-body-prerender, machine-facts, pricing,
funnel, order-package all green after the mirror. Checkout untouched. No migration, no Supabase
function deploy, no Stripe/orders/earnings change.

## Deferred (follow-ups, not in this rollout)
- DB-seeded refund email may still say "3–5 business days" — needs a separate owner-approved
  DB migration; do not create one here.
- Edge-function redeploy carrying the `aiSupport/knowledgeBase.ts` evidence reference.
- Pre-existing unrelated `type-check` errors (`AIAssistantTrustCard`, `AnalyticsTab`,
  `EmployeeHrDirectory`, `ProviderInternalRecords`).
