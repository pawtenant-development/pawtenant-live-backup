# PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002 — task record (TEST)

**Status: PARTIAL on TEST · LIVE untouched · no migration applied.**
Every non-migration requirement is deployed and verified on TEST. Manual PSD partner
intake stays visibly unavailable until the proposed migration is approved and applied.
Date: 2026-09-13 · Business dates: America/New_York.

Rollback point (commit before this task's first commit): `a724747`.
Feature commit: `884fae4`. Browser-QA fixes: `5598fdc`. Closure: see the end of this record.
TEST Vercel: `dpl_GfsNoZZpzsyKbqQ1f2VpredwYPVw` (feature) → `dpl_569cA5WG3QoPYrxpPLuGhyvoaFcN` (fixes),
alias `https://pawtenant-test.vercel.app`.

---

## 1. Root cause, per reported symptom

| Symptom | Root cause | Where |
|---|---|---|
| Provider upload fails with `Failed to fetch` | Commit `c416db7` (LETTER-PORTAL-ID-NO-QR-001) deleted the `corsHeaders` and `SUPABASE_ANON_KEY` constants from `provider-submit-letter` while both stayed referenced (`json()`, the OPTIONS branch, `auth.getUser`, the letter-id call). Deployed v69 was byte-identical to that source. Every request threw `ReferenceError: corsHeaders is not defined` inside the handler; the CORS preflight answered **500 with no Access-Control headers** (function logs 18:47:48Z and 19:01:00Z on 2026-09-12), so the browser surfaced the opaque `TypeError: Failed to fetch`. Not a MIME issue: the request never reached the parser. | `supabase/functions/provider-submit-letter/index.ts` |
| Provider sees "Partner Case" chip + blue partner disclaimer | Slice 8 deliberately labelled partner cases for providers. Owner decision reverses it. | `provider-portal/page.tsx`, `assign-doctor` email ("Case Source" row + operational notice) |
| Direct assessment PawTenant-branded; partner assessment exposes consent/attestation | Three on-screen renderers (modal inline block, provider inline block, `EsaIntakeView`) plus `PSDAssessmentView` for direct PSD; the neutral component rendered consents for everyone; screen and PDF had separate data paths. | `assessmentUtils.ts`, `PartnerNeutralAssessment.tsx`, `OrderDetailModal.tsx`, `ProviderOrderDetail.tsx`, `EsaIntakeView.tsx` |
| Customer-send actions visible on partner orders | The frozen modal gated only phone/SMS/GHL/payment panels on `isPartnerOrder`; Notify Patient, Send All to Customer, Send Test Email, Send Portal Reset, Consultation Invite, New ESA Order Link, Resume Checkout Email, Custom Payment Request and Upgrade to Annual were ungated (server already refused the sends). | `OrderDetailModal.tsx` (tracker row 210) |
| Partner Platform opens on a specific partner with misleading zeros | `selected = selectable.find(id) ?? selectable[0]` — the first alphabetical organization (Rapid ESA Letter, zero orders) was selected silently; Overview had no all-partners path and read `partner_admin_onboarding_state` (one partner only); "needs action" was computed over the 8 recent rows. | `PartnerPlatformWorkspace.tsx`, `PartnerOverviewTab.tsx` |
| Finance shows zero for a "completed" order | Two truths: (a) the default scope was Rapid ESA Letter (no orders); (b) **neither SignMyESA order is clinically completed** — `PT-DD8693B285` is `pending_delivery` (document uploaded, awaiting admin approval) and `PT-C3CE3A9D29` is `under_review`. Finance correctly reports them as in-progress ($104.00 / 2 orders, provider cost so far $60.00). Nothing is falsified. | `partner_admin_billing_summary` (unchanged) |
| Partner creation is two steps + a Partner staff/admin role selector | Legacy Settings form created a `draft` organization; invitation was a separate panel; role distinction gated nothing anywhere (only a header label). | `PartnerSettingsTab.tsx`, `PartnerUsersPanel.tsx` |
| Manual PSD orders cannot be assigned | Proven last task: `partner_submit_manual_order` passes `p_target_assessment_version => NULL`, answers land as `portal.manual.v1`, `psd_assessment_status` is unmapped ⇒ `assign-doctor` 409. Needs a SQL-function change ⇒ **migration proposed, not applied**. | `docs/PROPOSED-partner-psd-manual-intake-canonical-answers.md` |

Pre-existing, observed, not changed: `approve_order_document()` (migration `20260729121500`) stamps
`patient_notification_sent_at = now()` on every approved letter, partner orders included. The customer
was never emailed (communications = 0, proven below); the stamp is a false delivery claim on partner
orders and needs a SQL change to fix — recorded here, out of this task's no-migration scope.

## 2. What was already working and preserved

`partnerCommsGate` fail-closed firewall across 24 edge functions; the partner completion notice
(`${confirmationId}:partner_completion`, recyclable only after a failed send); `assign-doctor`'s pending
base earning at assignment (`order_amount` NULL, `doctor_profiles.per_order_rate`) and the partial unique
index preventing a second active base earning; `tg_partner_billable_on_completion` (charge event + frozen
`provider_earning_snapshot_cents`); tenant isolation via `current_partner_id()` and SECURITY DEFINER
projections; provider-submit-letter's magic-byte PDF sniff, 50 MB limit and WebP acceptance
(PROVIDER-PDF-UPLOAD-COMPATIBILITY-001); the exact-replay fingerprint; the legacy intake 410 tombstone;
the direct-customer branded portal copy; `verify_jwt` modes on every function.

## 3. Exact behaviour implemented

**A · Provider origin invisibility.** Provider case list: no chip, no disclaimer; the provider query no
longer selects `order_origin`, `partner_id`, `partner_order_id`; the case modal derives no partner state;
the assignment email has no "Case Source" row and no partner notice. Provider Earnings unchanged (never
distinguished). Admins keep the Partner Order chip, partner reference and funding summary.

**B · One neutral assessment.** `buildAssessmentDocumentModel(order)` (assessmentUtils) is the single
source for the screen component (`PartnerNeutralAssessment`, now mounted for EVERY order in the admin
modal, the admin intake view and the provider modal) and for the PDF (`buildNeutralAssessmentHTML`).
Direct ESA renders the retail catalog, direct PSD renders the canonical `psd_v1` catalog with option
labels and follow-ups, partner orders render the lossless pasted transcript. Sections: Customer
Information, Pet Information (+ per-animal support evidence), Mental Health Questionnaire (+ Additional
Questionnaire Information). No logo, no PawTenant name, no orange, no partner brand/reference, no
economics. Consent/attestation rows are on the model but render ONLY for `audience="admin"` as
"Authorization Record (admin only)"; never for providers, never in the PDF. Customer-portal copies
(`EsaIntakeView` variant `customer`, `PSDAssessmentView`) are untouched.

**C · Upload repair.** Constants restored; `provider-submit-letter` v69 → **v70** (`verify_jwt=false`
preserved). Deployed preflight now `200` with CORS headers; unauthenticated POST answers JSON `401`. The
client reads the body defensively and explains failures (`describeUploadException` /
`describeUploadHttpFailure`); the professional-contact warning no longer renders in the provider upload
tab (profile fields untouched). The build now runs a TypeScript program over
`provider-submit-letter`, `notify-patient-letter` and `assign-doctor` and fails on any "Cannot find name".

**D · Customer-notification firewall (UI).** On a partner order the modal hides: Notify Patient banner,
Notify Patient Now, Send All to Customer, Send Test Email, Send Portal Reset, Consultation Invite, New ESA
Order Link, Resume Checkout Email, Custom Payment Request, Upgrade to Annual. Provider submission copy is
neutral on every order: "Internal Note (Optional)", "Submit N Document(s) for Review", dialog "Nothing is
sent to the customer from here". Backend unchanged and still authoritative (gate before every send).

**E/F · Scope + finance.** Partner Platform opens on **All partners**; the only selection memory is the
URL (`?partner=<uuid>`, validated against the loaded organizations; unknown/stale ids fall back to All).
Overview counts (Partner orders / Completed / Needs action) go through `partnerOrderScope` — the same
`applyListPredicates` funnel (with `FacetFilters.partnerId`) the Orders list uses — over the FULL scope;
Documents ready = `partner_document_releases`; Unbilled = charge events on no non-void invoice; Recent
orders show a Partner column in All mode. Orders and Finance follow the header scope (their own partner
selectors were removed); Finance in All mode sums `partner_admin_billing_summary(null)` rows within one
currency (mixed currencies refused) and prompts for a partner before billing-profile / invoice /
reconciliation actions. Settings and Integration prompt for a partner where an organization is required;
Settings still hosts creation.

**G · Earnings.** No code change needed: assignment writes the pending base earning without any
PaymentIntent; completion self-heals if missing and tolerates the unique violation. Verified end to end.

**H · One partner role, one action.** `src/lib/partnerRoles.ts`: `FIRST_RELEASE_PARTNER_ROLE =
"partner_admin"`; both legacy values (`partner_admin`, `partner_staff`, kept by the check constraint) are
the same effective role and display as "Partner user" everywhere (no migration, no destructive cleanup).
`PartnerCreateForm` (Settings → New partner): business name, primary contact, partner email,
completion-notification email (defaults to the partner email), ESA/PSD availability, active status, agreed
per-order charge(s) → `partner_admin_create_organization` → `partner_admin_update_profile`
(services, `intake_mode='manual'`) → `partner_admin_set_sandbox_access` → `partner_admin_set_rate` (only
where no current rate) → `partner_admin_set_completion_contact` (only when empty) →
`partner_admin_invite_user` (reused when the address already has a membership) → `partner-user-invite`.
Retry resumes an existing organization ONLY when the slug's display name matches; a stranger's slug is
refused. Invitation dispatch failure is reported as "created, invitation NOT sent" with the existing
Resend path. The users panel exposes one role.

**I · Partner portal.** Tabs Orders · Accounts · New Order; header shows the signed-in email and
"Partner user" with Sign out. Orders: PawTenant id, partner reference, service, status, submitted date,
document state, Download. Accounts: per-order charges (frozen), status totals, invoices. New Order: the
shared wizard in partner mode (drafts resume there). Every read is a session-scoped SECURITY DEFINER
projection; no provider identity or payout is selected.

**J · PSD (frontend shipped, backend blocked).** `src/lib/partnerPsdIntake.ts`
(`PARTNER_PSD_MANUAL_INTAKE_ENABLED = false`, client twin of the SQL validator),
`PartnerPsdQuestionnaire.tsx` (requirement set from the live `psd_assessment_questions` catalog; wording
from `psdAssessmentSchema`). With the flag off the PSD tile is disabled with the honest reason and
`p_psd_answers` is never sent; with the flag on the wizard collects the canonical answers, refuses an
incomplete set and sends `p_psd_answers`. Guard J1 couples the flag to a migration declaring
`p_psd_answers jsonb`.

**K · Legacy PDF intake.** No active caller: the retired wizard files (`PartnerManualIntake.tsx`,
`pdfOcr.ts`) have zero importers, the only live call is the read-only `source_url` from the history panel,
and the server tombstone refuses `upload` / `commit` / `review` with **410** (proved on the deployed
function with an admin JWT). Later deletion step (not done — needs a function deletion): delete
`partner-manual-intake` (keep `source_url` history via a read-only replacement or drop the history panel),
delete the two orphaned files, retire checks G2/G9b/G10/G17/G19b/G20/G23 + two controls in
`check-partner-manual-intake.mjs` and M3 in `check-partner-portal-manual-order-billing.mjs`.

## 4. Remaining migration-dependent behaviour

Manual PSD partner orders. Proposal: `docs/PROPOSED-partner-psd-manual-intake-canonical-answers.md`
(suggested file `supabase/migrations/20260913120000_partner_manual_psd_canonical_answers.sql`) —
`partner_manual_psd_answers_problems(jsonb)`, `partner_submit_manual_order(... p_psd_answers jsonb)`
passing `p_target_assessment_version => 'psd_v1'`, and `partner_clinical_state` gaining
`assessment_incomplete`. **NOT APPLIED.** Frontend step once applied: flip the one-line flag.

## 5. Files changed

New: `src/lib/partnerRoles.ts`, `src/lib/partnerPsdIntake.ts`, `src/lib/partnerBillingSummary.ts`,
`src/pages/admin-orders/partnerOrderScope.ts`,
`src/pages/admin-orders/components/partner-platform/PartnerCreateForm.tsx`,
`src/pages/partner-portal/components/PartnerPortalAccounts.tsx`,
`src/components/partner/PartnerPsdQuestionnaire.tsx`, `scripts/check-partner-simple-manual-fulfillment.mjs`.
Changed: `assessmentUtils.ts`, `PartnerNeutralAssessment.tsx`, `EsaIntakeView.tsx`,
`OrderDetailModal.tsx` (frozen — tracker row 210; hunks: assessment section = one neutral mount + branded
block removed; imports; 12 one-line `!isPartnerOrder` gates), `ProviderOrderDetail.tsx`,
`provider-portal/page.tsx`, `PartnerPlatformWorkspace.tsx`, `PartnerOverviewTab.tsx`, `PartnerOrdersTab.tsx`,
`PartnerFinanceTab.tsx`, `PartnerReceivablesPanel.tsx`, `PartnerSettingsTab.tsx`, `PartnerUsersPanel.tsx`,
`PartnerOrderWizard.tsx`, `partner-portal/page.tsx`, `PartnerPortalOrders.tsx`,
`supabase/functions/provider-submit-letter/index.ts`, `supabase/functions/assign-doctor/index.ts`,
`package.json`, the proposal doc, and seven re-targeted guards (`check-partner-orders-segregation`,
`check-partner-assessment-pdf`, `check-partner-slice8-closure`, `check-partner-platform-workspace`,
`check-partner-manual-intake`, `check-partner-order-ux-assessment-finance`, `check-assessment-pet-support`).

## 6. Functions

| Function | Before | After | verify_jwt before → after |
|---|---|---|---|
| `provider-submit-letter` | v69 | **v70** | false → false (`--no-verify-jwt`) |
| `assign-doctor` | v58 | **v59** | false → false (`--no-verify-jwt`) |
| `notify-patient-letter` | v60 | v60 (untouched) | false |
| `admin-review-document` | v4 | v4 (untouched) | true |
| `partner-user-invite` | v1 | v1 (untouched) | true |
| `partner-manual-intake` | v6 | v6 (untouched, 410 tombstone) | true |

Deployed artifacts of both deployed functions (index + every `_shared` file) diffed byte-identical to the
repository source after deployment.

## 7. Database / API / role matrix (TEST, RFC 2606 `.test` fixtures, suppression armed)

| Case | Result |
|---|---|
| Admin creates partner + first user in one action | `SMF2 QA Partner` (sandbox, services `[esa]`, intake `manual`, completion contact set), ESA sandbox rate v1 $52.00, one `partner_users` row (`partner_admin`, invited); invitation **suppressed** (test address), reported honestly |
| Retry | "organization already existed — resumed", "partner user … already existed — reused", "ESA rate already recorded — kept": still 1 org / 1 rate / 1 membership; audit shows only idempotent profile/sandbox re-applies |
| Resend invitation | suppressed, `invitation_sent_count` 1 → 2, audit `partner_user_invitation_resent` |
| Partner sign-in (auth user created via the admin API) | `partner_portal_accept_invitation` → `{accepted:true}`; context = SMF2 only, role label "Partner user" |
| Partner sees only own organization | `partner_portal_orders` → SMF2 rows only; direct reads of `partner_organizations`, `orders`, `partner_order_financials`, `doctor_earnings` → `[]`; `partner_users` → own row only |
| Cross-organization access | `partner-portal-document` for SignMyESA's `PT-DD8693B285` → **404 `order_not_found`**; forged `p_partner_id` → **`partner_mismatch` 42501** |
| Admin creates ESA partner order | `PT-A083CCEE16` (admin wizard, TX, frozen $52.00 v1, `partner_portal_manual`, `paid_unassigned`, 0 communications) |
| Partner creates ESA partner order | `PT-B7565ADF76` (portal wizard) |
| PSD flow | tile disabled: "PSD partner orders are not available yet … waiting on a backend change that has not been approved" (admin and partner wizards) |
| Admin assigns | `PT-A083CCEE16` → QA Provider (`under_review`); pending base earning $30 (`order_amount` NULL); customer email + GHL suppressed by policy (audited); customer communications 0 |
| Provider sees an ordinary case | no chip, no disclaimer, "ESA Assessment" neutral, no consent, no professional-contact warning, "Submit 1 Document for Review" |
| Provider uploads a synthetic PDF | 200 through v70; **exactly one** `order_documents` row + one `provider-letters` object; retry with the identical file → still one row (fingerprint replay) |
| Customer communications | **0** rows to the fixture customer's email/phone at every stage |
| Completion | approve via `admin-review-document` (fixture email → customer notice suppressed) → `notify-patient-letter` ×2 → `completed`, **exactly one** provider earning, **exactly one** `partner_completion` row (subject `Clinical work completed — PT-A083CCEE16 (SMF2-REF-001)`, body carries no customer data, to the partner contact only, recorded as not delivered); after that row is `sent`, a third call reports `partnerContactAlreadyNotified:true` and adds nothing |
| Partner finance | `partner_order_financials`: fee 5200 v1, `billable`, `provider_earning_snapshot_cents` 3000, margin 2200; billable charge event 5200; summary: charges $52 − cost $30 = **$22** net |
| Overview vs Orders | All partners: Overview 4 = Orders "4 orders"; per partner 2 + 2; completed 1; documents ready 1; unbilled $52 |
| Legacy endpoint | `upload` / `commit` / `review` → **410 `legacy_intake_retired`** |

## 8. Communication proof

Every communications row on both fixture orders: `provider_assigned_provider` (to the QA provider,
suppressed) and `partner_completion` (to the partner contact, suppressed). Rows addressed to the fixture
customer's email or phone: **0** at every stage. Suppression audits: `provider_assigned_customer` (email),
`doctor_assigned` (ghl), `letter_delivery` (email ×2), `documents_ready_for_patient` (ghl ×2),
`order_completed` (ghl) — all `partner_policy_suppressed`.

## 9. Guards

`scripts/check-partner-simple-manual-fulfillment.mjs`: **41 checks / 31 planted controls**, all detected,
tree restored. Wired into `npm run build` (121 → 122 steps). Seven prior guards re-targeted to the new
rules (each still asserts a rule, none deleted). Full chain from an LF `git archive` of the committed
tree: `BUILD_EXIT=0` both times. `npm run type-check`: 9 pre-existing errors before and after (none in
this task's files). Known local-only artifacts on a CRLF working copy: `check-letter-portal-id-no-qr
--self-test` N2 and `check-provider-document-approval-gate` A21 (both pass from an LF archive and on
Vercel). Pre-existing at HEAD before this task: `check-provider-document-single-current-pending` S16/S17
(not in the build chain).

## 10. Browser QA (deployed TEST alias, authenticated sessions)

Admin (390 / 768 / 1440): Partner Platform opens on All partners; Overview 4 orders = Orders 4; Finance
All partners (awaiting $52, charges $52, cost $30, net $22, in progress $156 / 3 orders) and SignMyESA
scope by direct URL ($104 / 2 orders, no completed order — truthful); Settings without a partner shows
the one-step creation form and "No partner selected" for users, with `?partner=` it selects; the
partner order's Documents tab offers no Send All / Notify Patient / Send Test Email; the header menu
offers no portal reset, consultation invite, new-order link, resume-checkout email, custom payment or
Upgrade to Annual; Assessment is neutral with the admin-only authorization record; Accounts → Earnings
lists `PT-A083CCEE16` ($30); no legacy PDF control; no horizontal overflow at 375/768/1440.
Provider (375 / 768 / desktop): no chip, no disclaimer, no partner wording; neutral assessment on the
partner case AND on a direct case (`PT-HFXE2E1`); no consent rows; no professional-contact warning;
successful synthetic upload; Earnings tab lists the completed partner order without partner wording; no
overflow.
Partner (375 / 768 / desktop): only own orders (2), Accounts, New Order, profile essentials, Download on
the completed order; no other organization, no provider data; no overflow.
Screenshots captured at 375, 768 and 1440 (admin Overview).

## 11. Fixture cleanup

Inventory before deletion: 2 orders, 10 assessment answers, 1 document + 1 document version, 1 earning,
2 communications, 30 audit rows, 2 provider notifications, 2 financial snapshots, 1 billable event,
1 document release, 2 private API-request rows, 1 partner user, 1 rate card, 1 organization, 1 auth
user, 2 storage objects (`provider-letters/PT-A083CCEE16/…`, `partner-documents/releases/7a659fd2….pdf`).
Teardown: one `DO` block (user triggers disabled across every FK child of `orders`, deletes by FK column,
re-enabled in the same transaction), then the two storage objects through the Storage API.
Final counts: see §12.

## 12. Closure counts

Preflight baseline → after teardown (identical): orders 621, partner organizations 2, partner users 1,
earnings 105, documents 43, communications 978, billable events 0, assessment answers 401, audit rows
2988, financial snapshots 2, invoices 0, assessment snapshots 0, auth users 63, rate cards 6. Fixture
residue across orders, answers, documents, versions, storage, earnings, communications, audits,
invitations/memberships, auth identities, financial snapshots, billable events, releases, private API
requests, rate cards and organizations: **0**. `pg_trigger` rows not enabled: **0**. QA account
passwords for `qa-admin-claude@pawtenant.test` and `ra-qa-provider@pawtenant-qa.test` were rotated for
this session (TEST QA accounts, as in prior tasks). No LIVE row, function, secret or deployment was read
for mutation or mutated; no Stripe object was touched.

Closure commit: see git log (`PARTNER-PLATFORM-SIMPLE-MANUAL-FULFILLMENT-REPAIR-002: closure`).

## 13. Untouched

LIVE (repo, database, functions, Vercel), Stripe, customer clinical letters, public sample letters,
checkout/entitlements, provider payout rates, partner rate-card history, QR-removal behaviour, every
`verify_jwt` mode, real customer/provider/partner records (the owner's two SignMyESA orders and the
`eservices.dm@gmail.com` invitation were read, never modified).
