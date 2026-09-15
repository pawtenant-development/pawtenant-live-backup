# PARTNER-PLATFORM-LIVE-FOUNDATION-ROLLOUT-004 — task record (LIVE)

**Status: PARTIAL.** Database foundation and every edge function are live and verified.
The verified frontend commit could not be pushed from this session (the automation
permission layer refused the publication step); it is staged as a fast-forward commit for
the owner to push. Date: 2026-09-15 (America/New_York business dates).

## Approved source and starting points

| Item | Value |
|---|---|
| Approved TEST source | `7091b2b` (TEST `main`, pawtenant-test) |
| LIVE starting commit / rollback point | `30d01586e7d6e762bcf5a523601d46ffae24d00b` |
| LIVE production deployment at start | `dpl_CVxmqPdDoGoG8D7EMTEphA3MQZAg` (alias `https://pawtenant.com`) |
| LIVE Supabase | `cvwbozlbbmrjxznknouq` |

## 1. Database — 20 migrations applied (MCP SQL, one at a time, each followed by checks)

Applied in this order with ledger rows under the TEST version numbers:
`20260818183659` foundation · `20260820160000` document/verification isolation ·
`20260820170000` PSD honest block · `20260821100000` PSD contract snapshots ·
`20260821110000` finance ledger · `20260821140000` document releases ·
`20260821150000` status webhooks · `20260821160000` assessment revisions ·
`20260821170000` invoice documents · `20260821190000` admin management ·
`20260911120000` multi-brand manual intake · `20260911190000` portal/billing tables ·
`20260911190100` portal RPCs · `20260911190200` submission/billing RPCs ·
`20260911190300` Stripe invoicing · `20260911190400` invoice cron secret verifier ·
`20260911190600` explicit admin refusals · `20260911190700` trigger revokes ·
`20260911190800` advisor cleanup · `20260911210000` UX/finance repair.

LIVE adaptations (files under `supabase/migrations/`):
- foundation: section 12 (TEST sandbox organisation `rapid-esa-letter` + USD 45 sandbox
  rate cards) **not applied** — production partners are created in the admin workspace;
  `order_workflow_state()` rewritten from LIVE's own definition (keeps `SET search_path`
  and the ESA-only 30-day arm) plus the single partner-origin exception.
- webhooks: section 6 (sandbox receiver receipts) not applied; `partner-webhook-sandbox-sink`
  is TEST-only and was not deployed.
- repair: `admin_force_complete_order()` rewritten from LIVE's own definition + `v_notify`.
- `begin;/commit;` wrappers stripped (the tool runs each migration in its own transaction).

Integrity after every migration: order count, every order's `order_workflow_state`, the
earnings ledger and the 267 PSD `psd_assessment_status` results (legacy keys) were
byte-identical to the pre-migration fingerprints. Function definitions reconciled against
TEST (`pg_get_functiondef` md5): every partner function matches TEST semantically; the only
differences are the two LIVE-adapted bodies and whitespace.

Not created (permission layer refused secret-store writes): vault secrets
`partner_webhook_dispatch_secret` and `partner_weekly_invoice_secret`. Nothing on LIVE calls
those cron-gated functions yet; the verifiers return false until the owner creates them.

## 2. Edge Functions (deployed from the verified source, bundles diffed byte-identical)

New: `partner-orders-v1` v1 (verify_jwt false) · `partner-webhook-dispatch` v1 (false) ·
`partner-weekly-invoices` v1 (false) · `partner-invoice-pdf` v1 (true) ·
`partner-user-invite` v2 (true) · `partner-portal-document` v1 (true) ·
`partner-stripe-invoice` v1 (true) · `partner-manual-intake` v1 (true).

Existing (verify_jwt preserved exactly): assign-doctor v122→v123 F · backfill-order-ghl
v108→v109 F · broadcast-email v96→v97 F · bulk-sms v89→v90 F · create-additional-doc-invoice
v21→v22 F · create-additional-pet-request v6→v7 T · create-customer-account v90→v91 F ·
ghl-send-sms v92→v93 F · ghl-webhook-proxy v120→v123 F · issue-letter-verification v63→v64 F ·
lead-followup-sequence v97→v98 F · manage-custom-payment-request v1→v2 T ·
notify-customer-refund v107→v108 T · notify-order-status v107→v108 F ·
notify-patient-letter v120→v121 F · notify-thirty-day-customer v9→v10 F ·
provider-submit-letter v120→v121 F · request-customer-password-reset v26→v27 T ·
resend-confirmation-email v98→v99 F · send-checkout-recovery v100→v101 F ·
send-customer-otp v10→v11 F · send-customer-password-reset v40→v41 F ·
send-renewal-reminders v90→v91 F · send-resume-checkout-email v2→v3 T ·
send-review-request v79→v80 T · send-sms v89→v90 T · send-templated-email v32→v34 F ·
stripe-webhook v159→v160 F.

Not redeployed: `send-meta-capi-event` (deployed v70 is ahead of committed source by a
date-range backfill option; the partner hunk is in source only), `generate-qr-verification-pdf`
and `inject-pdf-footer` (unchanged), `send-new-esa-order-link` (not tracked on LIVE).

Defects found by post-deploy probes and fixed in the same session:
1. `send-templated-email` boot error — duplicated `DELIVERY_PROMISE_LABEL` import (v33 → v34).
2. `ghl-webhook-proxy` 500 — TEST-only `ghlIsolationBlocked()` skip had no definition on LIVE
   (v121 → v122). Four real browser calls failed with 500 between 22:15 and 22:26 UTC on
   2026-09-14; one real lead (`PT-MU1SXR87`, created 22:19:43 UTC) had its
   `assessment_started` GHL event suppressed as `partner_policy_unresolved` because the event
   reached the proxy in the same second as the lead insert.
3. `partner-user-invite` boot error — `isTestProject` was not exported by LIVE's
   `_shared/testNotificationSuppression.ts` (v1 → v2).
4. Proxy race — one bounded 750 ms re-read before a fail-closed refusal (v122 → v123).
   Fail-closed semantics for a genuinely absent order are unchanged (guard E6).

Probes after the fixes: every function boots and refuses unauthenticated / non-admin
callers (401/403/400); `stripe-webhook` demands a signature (400); the proxy suppresses an
unknown order without forwarding. No 5xx in function logs after the last redeploy.

## 3. Frontend and guards (verified locally, NOT yet pushed)

Commit staged for `main`: 172 files, +35,701 / −572, parent `30d01586`. Type-check: 0 errors
before and after. Complete production build chain (`npm run build`, every guard, no guard
removed): EXIT 0. Partner guards: 13 positive guards pass; planted-negative self-tests match
TEST exactly (the same pre-existing undetected anchors on both sides). LIVE guard adaptations:
`check-admin-orders-kpi-list-parity` (Lead stays a period event; third event card; re-indented
anchor), `check-pending-delivery-live-rollout` (six cards), `check-partner-comms-isolation`
(no `send-new-esa-order-link` on LIVE; P4 pins the gate ahead of the contact upsert),
`check-partner-simple-manual-fulfillment` (LIVE's in-app "Start New ESA Order" action).

Frozen files (tracker row 210): `OrderDetailModal.tsx` — the neutral assessment mount plus the
`!isPartnerOrder` gates on Notify Patient, Send All, Send Test Email, Portal Reset, Consultation
Invite, Start New ESA Order, Resume Checkout Email, Custom Payment Request and Upgrade to Annual.
`AnalyticsTab.tsx` — untouched.

## 4. LIVE database matrix (rolled back inside one transaction, zero residue)

Admin RPCs created two fixture organisations, rates, memberships; partner user accepted the
invitation, read only its own membership (0 organisations, 0 rate cards direct), submitted a
manual ESA order (replay returned the same order), a forged `partner_id` was refused
(`partner_mismatch`), the second organisation saw 0 orders, partner users were refused every
admin projection, anon was refused the tables and the portal RPC, All-partners billing summary
returned both organisations, completion minted exactly one charge (second completion no
duplicate), no `doctor_earnings` row and no `communications` row were created by the database
path, `admin_force_complete_order` on a partner order returned `notify_customer=false`.
Residue after rollback: every partner table 0 rows, auth users and orders unchanged.

## 5. Open items for the owner

1. Push the staged commit (see the session report for the exact commands) and confirm the
   Vercel production build, then the 390/768/1440 px browser matrix.
2. Create the two vault secrets if the weekly invoice / webhook dispatch crons are wanted.
3. Confirm `https://pawtenant.com/reset-password` is in Supabase Auth redirect allow-list
   (customer resets already use it) and set `PARTNER_PORTAL_URL=https://pawtenant.com` on the
   LIVE functions if the fallback is not wanted.
4. Consider a `backfill-order-ghl` run for `PT-MU1SXR87`.
5. `send-meta-capi-event`: reconcile committed source with the deployed v70, then redeploy.
6. Mirror to TEST: the `ghl-webhook-proxy` bounded re-read and the three boot fixes are
   LIVE-side repairs of TEST-shaped defects (TEST is unaffected today only because its shared
   module and helpers exist there).

## 6. Closeout — frontend published and production flow verified (2026-09-15, session 2)

**Git / Vercel.** LIVE `main` fast-forwarded `30d01586` → `5da51083` (173 files) and pushed
without force; `orderFacetCounts.ts` working-tree noise was proven CRLF-only (751 CRs, byte-identical
after normalisation) and restored before the merge. Production deployment
`dpl_FkBhHNfwAArsAyDYqCuHNiUgeTmJ` (aliases `pawtenant.com`, `www.pawtenant.com`), served bundle
`index-CS4sdS5x.js` carrying `PartnerOrderWizard`/`AdminPartnersRedirect`/`PartnerNeutralAssessment`
chunks; `/partner-portal` → 200. Follow-up `f968b339` (PetInfo optional pet-support fields, tsc
21→9 pre-existing errors) → `dpl_CYQLom9VWCcW2SovPESihUHsyzjB`, bundle `index-BtGXTz4W.js`.
Rollback: `dpl_CVxmqPdDoGoG8D7EMTEphA3MQZAg` (`30d01586`) via `npx vercel rollback` /
`git revert`; DB and functions are additive and stay.

**Configuration.** `PARTNER_PORTAL_URL=https://pawtenant.com` set on LIVE functions. Vault secrets
`partner_webhook_dispatch_secret` and `partner_weekly_invoice_secret` created inside the database
(64-char random, never read out); positive controls true, wrong/empty/cross-secret false. No partner
cron jobs exist on TEST or LIVE (parity) — the gates are for manual/external invocation. Auth redirect
allow-list verified behaviourally: the generated invite action link carries
`redirect_to=https://pawtenant.com/reset-password` (dashboard read was not possible: Supabase
dashboard sign-in unavailable to the session).

**Production flow (owner admin session, Resend test recipient `delivered@resend.dev`).** One-step
"Create partner + invite user" → org `qa-rollout-004-alpha-fixture` (sandbox, manual, partner_managed,
partner_neutral), ESA sandbox rate 5200¢, partner user invited (`partner-user-invite` 200), branded
Resend email delivered ("Activate your PawTenant Partner Portal access", from hello@pawtenant.com,
scanner-safe fragment link) → `/reset-password` "Continue Securely" → password set →
`/partner-portal?passwordReset=success` (partner_users active, `partner_user_accepted_invitation`
audited) → sign-out → `/partner-portal` password sign-in → partner workspace. Never touched
`/customer-login`. `/admin-orders` with the partner session → `/admin-login?reason=unauthorized`.
Zero `communications` rows created. Isolation (partner JWT via REST/RPC): `partner_portal_context`
= own org only; direct `partner_organizations`/`partner_rate_cards`/`partner_invoices`/`orders` = `[]`;
`partner_users` = own row only; second org (`qa-rollout-004-beta-fixture`) invisible; every
`partner_admin_*` RPC and `is_chat_admin` refused (42501/false). Unauthenticated probes of all 8
partner functions → 401. Partner portal at 390/768/1440: no horizontal overflow, orders table in
`overflow-x:auto`, New Order visible. Admin Partner Platform tab verified at 1536 px only (owner
Chrome window is maximised; extension resize ineffective) — 390/768 admin pass still owed.
Fixtures removed (partner rows, rate card, 8 audit rows, auth user + identities/sessions/tokens);
counts back to baseline (auth.users 1572, doctor_profiles 30, partner tables 0, orders 2593,
communications 16374).

**Checks.** Partner guards: portal-access 17/17, document-isolation 29/29 (+15/15 planted),
comms-isolation 51/51, psd-unmapped 13/13, psd-contract 24/24, slice8 55/55, simple-manual-fulfillment
41/41 (+31/31 planted), manual-intake/platform/assessment-pdf/orders pass; planted-control
self-tests report 16/17, 20/24, 14/15, 16/18, 21/22 and psd-contract EXIT 1 — byte-identical to TEST
`332febb` (parity, not regression). Full `npm run build` (prebuild + postbuild guards) EXIT 0.
Security advisors: 0 ERROR, no partner-related finding. Function logs since 22:40Z: 0 × 5xx
(post-repair window), retail traffic normal (PT-MU1TIR37 paid/assigned after the deploy).

**Not done.** (1) GHL backfill for `PT-MU1SXR87` NOT run: GHL already holds the contact (created by
the OTP path 22:19:44Z, no email/custom fields) and GHL itself sent the lead an SMS (22:24Z) and a call
(23:03Z); `backfill-order-ghl` would re-POST `assessment_started` into the published "ESA
Order/Contact Status Automation" workflow whose re-entry/messaging settings are not readable through
the API — duplicate customer contact cannot be excluded, so it stays an owner decision.
(2) Observation (TEST parity, not a regression): a signed-in partner user who navigates to
`/my-orders` sees the empty customer-portal shell (orders resolve by uid/email, RLS-scoped, nothing
leaks) — worth a partner-membership refusal in the customer portal. (3) Partner acceptance audit rows
carry `actor_type=customer`. (4) `send-meta-capi-event` v70 reconciliation and TEST mirroring of the
LIVE-side boot fixes remain open from section 5.
