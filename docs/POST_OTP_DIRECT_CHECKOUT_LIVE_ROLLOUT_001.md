# ASSESSMENT-FUNNEL-OTP-TO-CHECKOUT-REDIRECT-LIVE-ROLLOUT-001

**Status:** ✅ LIVE COMPLETE — POST-OTP DIRECT CHECKOUT VERIFIED.
**Owner:** Hamza visually reviewed + approved the deployed TEST flow (pawtenant-test.vercel.app) and explicitly authorized this LIVE rollout.

## Provenance
- Approved TEST code: `4decbab`; TEST final main: `99e4a98`; TEST deploy `dpl_BUkNhJrF65PKvMzfBeiPHuBJzY44` (pawtenant-test.vercel.app), PSD checkout visually approved.
- LIVE starting main: `ec51076`.
- LIVE code commit: `6914d03` — "feat: send verified customers directly to checkout".
- LIVE docs commit: (this file).

## Surgical mirror (not a blind copy)
The 7 funnel code files were **byte-identical (mod CRLF)** between LIVE `ec51076` and the TEST patch base `3a9813d`, so the approved patch (`git diff 3a9813d 4decbab`) applied cleanly and each resulting LIVE file now matches TEST `99e4a98` exactly (hash-verified). `package.json` **differs** on LIVE (its own build chain), so it was adapted surgically — only the funnel-flow guard was added; LIVE's `verify-attribution-hygiene` etc. preserved. Recent LIVE work confirmed intact (soft-404/410 middleware, full-body prerender, machine-facts, package-card presentation, state-page pricing parity, payment logos, Stripe-webhook signature hardening, RA order chips/filters).

## Flow before / after
- **Before:** OTP verified → AssuranceScreen → PackageSelectionStep → Pay.
- **After (direct_checkout_v1, LIVE default):** OTP verified → **Pay**. Assurance + Package no longer auto-shown; package comparison reachable via checkout **"Change package"**.

## Files changed (10)
NEW: `src/config/flowVersion.ts`, `scripts/check-funnel-flow.mjs`.
MODIFIED: `src/lib/trackEvent.ts`, `src/pages/assessment/page.tsx`, `src/pages/psd-assessment/page.tsx`, `src/pages/assessment/components/CustomerOtpStep.tsx`, `src/pages/assessment/components/PackageSelectionStep.tsx`, `src/pages/assessment/components/Step3Checkout.tsx`, `src/pages/psd-assessment/components/PSDStep3Checkout.tsx`, `package.json`.

## OTP
Unchanged and still required before checkout (email 6-digit, current expiry, resend cooldown, magic-link session, portal ownership). Mirrored UX: masked email, one-time-code autocomplete + numeric inputmode (already in OtpDigitsInput), clear resend/verifying states, network-safe send, privacy-safe telemetry. No bypass, not moved after payment, no QA OTP sent.

## Assurance
Standalone AssuranceScreen bypassed in the direct flow (not deleted). Its trust points (licensed-provider review, approval-not-automatic, refund-if-not-approved, private/secure) relocated as a **compact** checkout strip — no new full interstitial.

## Package screen
`PackageSelectionStep` preserved and reused as the "Change package" destination (ESA shows Standard/ESA+RA; PSD shows Standard/PSD+RA; never mixed). Change preserves plan/answers/attribution/confirmation-id and returns to checkout.

## Default package / plan
Package precedence: resumed → in-session → validated `?package=` → `esa_standard`/`psd_standard`. RA never auto-selected; no price inference. Plan: fresh = one-time, annual visible, survives Change + Standard↔RA, restored on resume (ESA `setStep3`; PSD `initialPlan`).

## PaymentIntent lifecycle
Eager one-time PI reused on direct entry (`!stripeClientSecret` guard) — no duplicate identical mint. Server re-derives amount from package/plan/pet count; client dollar untrusted; `fetchClientSecret` hard-codes `plan:"one-time"` (stale-closure leak impossible); `<Elements key={stripeClientSecret}>` remounts so a stale secret can't confirm; subscription-abandon cancel intact.

## Order / entitlement + attribution
Same confirmation ID throughout; lead still created at Step 2; checkout creates no order; entitlement stamped server-side on the unpaid order; `package_key`/RA flag/`billing_plan` match selection; paid orders unaffected; Google Ads value derives from the paid order. `session_id` + first/last-touch preserved (no new analytics session).

## Instrumentation
`otp_screen_viewed`, `otp_send_succeeded`, `otp_send_failed`, `otp_entry_started`, `otp_resend_requested`, `otp_verify_failed`, `otp_verified`, `post_otp_destination`, `checkout_viewed` (repaired), `package_change_opened`, `package_screen_viewed`, `package_selected`, `plan_changed` — all with `flow_version:"post_otp_direct_checkout_v1"`, via `record_event` (**no migration**), no OTP code/email/PII, no double-fire on rerenders.

## Guards + negative controls
`node scripts/check-funnel-flow.mjs` — green on LIVE. `--self-test` proves all **12 negative controls (A–L)** trip, in-memory only (no disk mutation). Wired into `npm run build`. Full LIVE `npm run build` = exit 0 (vite + prerender + machine-facts + route-status + pricing + package-card + state-pricing + funnel-flow + order-package 52/52).

## Typecheck / build
`type-check`: 0 errors in changed files; pre-existing errors remain in unrelated `AIAssistantTrustCard`, frozen `AnalyticsTab` (LIVE-only divergence), `EmployeeHrDirectory`, `ProviderInternalRecords`. ESLint changed files: 0 errors, 4 pre-existing "unused eslint-disable" warnings (unchanged from HEAD). Build: exit 0.

## Console-error classification
Only errors seen locally were a Vite **dev-server dependency-optimize cache artifact** ("Invalid hook call … more than one copy of React" from mismatched `?v=` optimize hashes in `useAssessmentTracking`/`useSearchParams` — a file NOT in scope). Cleared the `.vite` cache → restart → **zero** first-party errors on ESA + PSD. Not present in the production build. No extension-injected errors (clean local browser). Stripe advisories (Elements API migration, lineHeight, Link testmode) are warnings only — out of scope; no Elements migration performed.

## Deployment
- New production deploy: `dpl_Dp1nsxcVyRux5BgHiLi3gdPuTEro` (target production, commit `6914d03`).
- Production alias: **pawtenant.com** (branch alias `pawtenant-production-git-main-pawtenant-3686s-projects.vercel.app`).
- Prior READY production deploy / **rollback target**: `dpl_2BqxotzecR6NyFnCwc9W9GxYgfty` (commit `ec51076`, `isRollbackCandidate: true`).

## Rollback (two independent)
1. **Flag** — env `VITE_POST_OTP_FLOW=legacy` (redeploy) or `?postOtpFlow=legacy` (per-session), restores OTP → Assurance → Package → Pay without a code revert.
2. **Deploy** — instant-rollback / promote prior `dpl_2BqxotzecR6NyFnCwc9W9GxYgfty` (`ec51076`).

## Migration / Edge Functions / Stripe
No DB migration. **No Supabase Edge Function changed or deployed** (OTP send-result telemetry is client-side) → no `verify_jwt` values touched. No Stripe product/price/dashboard change.

## Safety
LIVE-only; TEST unchanged. No real OTP sent, no lead/order created, no PaymentIntent created/confirmed, no payment, no customer communication, no PII displayed. Portal RA add-on untouched — the separate $70-shown/$50-charged issue remains **PORTAL-ADDON-PRICE-RECONCILE-001** (not started here).
