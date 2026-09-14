# PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 — task record

**Status: PARTIAL on TEST · LIVE untouched.**
Everything in scope is built, deployed and verified on TEST **except one thing that
needs an owner decision, not more code**: a PSD order created through the simple
pasted-questionnaire form cannot be assigned to a provider, because the existing
PSD clinical gate refuses it (see “The PSD blocker” below). The task explicitly
forbids bypassing that gate, and the fix is a clinical mapping decision.

Date: 2026-09-11 · Supersedes the PDF/OCR intake as the DEFAULT manual path
(`PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001` stays as a labelled legacy control).

---

## Root cause of the PDF extraction failures

The previous task's own closure record lists five extraction defects found during its
QA (label regexes stopping at “Order”, a document title captured as an external id, a
colliding external id hitting a unique index mid-write, page text silently not stored
because the `private` schema is not in the Data API, and an `on delete set null` FK).
Each was fixed, and the pattern is the point: **every fix was a new rule inferred from
one more PDF.** Extraction was matching layout — label positions, title words, digit
shapes — in documents whose layout PawTenant does not control and whose partners can
change at any time without telling anyone. The previous task never validated against a
real SignMyESA PDF (it says so: “none was available; representative synthetic PDFs
used”), so the rule set was tuned to synthetic documents.

That is why the owner saw unreliable customer, pet and questionnaire extraction on real
partner PDFs, and why “fix the extractor” has no stable end state. This task removes the
inference step entirely: a human types the customer and pets into validated fields and
pastes the questionnaire verbatim. Nothing is guessed, so nothing can be guessed wrong.

---

## Preflight (recorded before any edit)

| Item | Value |
|---|---|
| TEST local HEAD at start | `6601f6dc4e55f84b11bdd0e251e31a0ae476d213` |
| origin/main | identical (`rev-list --left-right --count` = `0 0`) |
| **Rollback point** | `d5cb350` — the commit immediately before this task's first commit |
| Concurrent work preserved | Another session was working in the SAME worktree throughout. It committed `d5cb350` (checkout planner thumbnail) and `81880e5` (PSD checkout workbook thumbnail) while this task ran, and it swept this task's staged card file into its own commit `871278a`. No file overlap; nothing of theirs was reverted or bundled. |
| Untracked, left alone | `deno.lock`, `mig.json`, 7 untracked `docs/*.md` from earlier sessions |
| DB baseline (TEST) | orders 616 · audit_logs 2928 · auth.users 60 · doctor_earnings 102 · communications 961 · assessment_answers 394 · partner_organizations 2 · partner_rate_cards 6 · partner_order_financials 0 · partner_billable_events 0 · partner_invoices 0 · partner_intake_drafts 2 · doctor_profiles 14 |
| Deployed fns vs repo | `stripe-webhook` v83 byte-identical to the repo (10/10 files, LF-normalised) before any edit |
| Type-check baseline | 8 pre-existing errors (AIAssistantTrustCard, AdminProviderContactPanel, EmployeeHrDirectory ×5, ProviderInternalRecords) |
| Advisor baseline | security: 29 INFO rls_enabled_no_policy · 23 search_path_mutable · 1 extension_in_public · 57 anon_security_definer · 230 authenticated_security_definer · 1 leaked_password |

---

## Existing code reused, not rebuilt

* **`partner_accept_order()`** — THE canonical order-creation transaction. The portal
  wizard, the admin form and the partner API all submit through it, so manual and API
  orders remain one order type (Phase 10). The only change to its body is accepting a
  third intake method and mapping the answer `source`.
* `partner_organizations`, `partner_rate_cards` (versioned, effective-dated),
  `partner_admin_set_rate()`, `partner_order_financials` (immutable frozen snapshot),
  `partner_billable_events` / `partner_invoices` / `_lines` / `_payments` /
  `partner_invoice_aging`, `partner_clinical_state()`, the comms and document gates, the
  provider-safe “Partner Case” presentation, the webhook outbox, `is_chat_admin()` /
  `is_admin_staff()`, `partner_intake_audit()` (PHI-key refusal), the neutral assessment
  renderer, and the five-sub-tab Partner Platform workspace.
* The provider payout UX (`EarningsPanel.tsx`: per-row “Mark as Paid” + bulk, with a
  payment reference) is the shape “Mark Partner Order Paid” copies — in a **separate
  ledger**, so the two accounting domains never mix.
* `stripe-webhook`'s signature verification, untouched. The partner branch sits inside it.

---

## Schema and RLS changes

Eight migrations, all applied to TEST through MCP `apply_migration`:

| Migration | What it does |
|---|---|
| `20260911190000_partner_portal_manual_order_billing` | `partner_users`, `partner_billing_profiles`, `partner_order_reconciliations` (append-only), `partner_order_drafts`; Stripe + billing-period columns on `partner_invoices`; extends `partner_order_financials.invoice_status`; `current_partner_id()` / `current_partner_role()`; `orders.partner_intake_method` accepts `partner_portal_manual` |
| `20260911190100_partner_portal_manual_order_rpcs` | `partner_accept_order` rewritten from this database's own `pg_get_functiondef`; `partner_manual_order_validate`; the partner-facing projections |
| `20260911190200_partner_portal_submission_and_billing_rpcs` | `partner_submit_manual_order`, partner-user administration, billing profile, one-active-invoice-per-charge trigger |
| `20260911190300_partner_stripe_invoicing_and_reconciliation` | `partner_prepare_invoice`, `partner_attach_stripe_invoice`, `partner_record_stripe_invoice_paid`, `partner_admin_mark_orders_paid`, `partner_admin_billing_summary`, `partner_weekly_invoice_candidates` |
| `20260911190400_partner_weekly_invoice_cron_secret` | vault-backed `verify_partner_invoice_cron_secret` |
| `20260911190500_partner_manual_validate_and_audit_action_fix` | **two defects found by the role matrix** (below) |
| `20260911190600_partner_admin_reads_refuse_explicitly` | **defect found by deployed-surface QA** (below) |
| `20260911190700_partner_trigger_functions_revoke_public` | **advisor finding** — revoke EXECUTE on the SECURITY DEFINER trigger functions |
| `20260911190800_partner_portal_advisor_cleanup` | **advisor findings** — one combined `partner_users` policy, `(select …)`-wrapped predicates, two FK indexes |

**Authorization model.** The partner tables keep their existing admin-only RLS; **no
policy was added that lets a partner read a partner table**. Every partner-facing read
is a SECURITY DEFINER projection filtered by `current_partner_id()`, which derives the
organisation from `auth.uid()` through `partner_users`. A partner session that queries
`orders`, `partner_order_financials`, `partner_organizations`, `partner_rate_cards`,
`partner_invoices`, `doctor_earnings`, `doctor_profiles`, `audit_logs`,
`partner_order_drafts`, `partner_billing_profiles` or `partner_order_reconciliations`
directly gets **zero rows** — verified against the deployed REST API as a real signed-in
partner user. `partner_users` is the one exception: a partner sees exactly their own
membership row and no colleague's.

All 25 new functions pin `search_path` and are revoked from `anon`. The four
service-role-only functions (`partner_prepare_invoice`, `partner_attach_stripe_invoice`,
`partner_record_stripe_invoice_paid`, `partner_weekly_invoice_candidates`) are revoked
from `authenticated` too.

---

## Partner invitation / access model

Individual, invite-only accounts — never a shared partner password, and no password is
ever generated, transported or stored by PawTenant.

* An admin invites an address (`partner_admin_invite_user`), choosing `partner_admin` or
  `partner_staff`. A staff/provider address is refused outright — the two populations
  share one auth pool and must not overlap.
* `partner-user-invite` (edge fn) asks **Supabase Auth** to send its own invite, or a
  recovery link if the account already exists, pointed at `/partner-portal`. The address
  is read from the membership row, never from the request body.
* The invitation binds to the authenticated user on first visit
  (`partner_portal_accept_invitation`, matched on the JWT email). `last_access_at` is
  recorded on every visit.
* Revoking flips the row to `revoked`; `current_partner_id()` stops returning anything
  for that user immediately. It is the authorization, not a hidden button.
* Admin sees email, role, status, invited-by, invitation count and last sent, accepted
  at, revoke reason and **last successful portal access**.

---

## Manual order payload and validation

One wizard component, mounted twice (partner portal / admin Partner Platform). Admins
pick the partner first; partner users are locked to theirs and the browser sends
**no partner id at all**.

`src/lib/assessmentIdentityRules.ts` now holds the canonical email regex, the 18+ rule,
the max-DOB helper, the state list and the 1–3 animal limit. **`Step2PersonalInfo.tsx`
imports them back**, so the customer assessment and the partner form share one rule set
rather than two that drift. The database repeats the rules in
`partner_manual_order_validate()` — defence in depth, and the copy that actually decides.

Questionnaire: one required textarea, max 20 000 characters, stored **verbatim** on
`orders.assessment_answers.partnerQuestionnaireText` with its line breaks and numbering.
It is rendered as a React text child (never HTML), and the audit row carries a character
count, never the text. No OCR, no AI extraction, no eligibility decision.

Submission requires an explicit authorization confirmation; Submit stays disabled until
it is ticked.

**Idempotency**: the wizard mints one `client_request_id` and keeps it across re-renders,
saved drafts and page reloads. `partner_submit_manual_order` looks it up in the existing
`private.partner_api_requests` ledger and replays. Three submit clicks in one tick
produced **exactly one order**. A reused partner reference belonging to a different
submission is refused as `duplicate_partner_reference`.

If no active rate exists, submission is refused with `no_active_rate` and the draft is
kept.

---

## Rate snapshot behaviour

`partner_accept_order` freezes `rate_card_id`, `rate_card_version`, the fee and the
currency into `partner_order_financials` at submission. Proved on TEST: an order taken
at ESA v1 $52.00 kept $52.00 v1 after the rate was closed and a v2 $99.00 opened, and
the billable charge minted at completion used the **frozen** $52.00, not the live rate.
Rate history is versioned, never edited in place. Invoicing reads the frozen charge —
`partner_prepare_invoice` never touches `partner_rate_cards`.

---

## Invoice and reconciliation state machine

```
uninvoiced ──(admin selects, or the weekly job)──▶ invoiced
invoiced ──(Stripe invoice.paid)──▶ invoice_paid_unreconciled
invoice_paid_unreconciled ──(admin marks the order paid)──▶ paid
                     ↘ void            ↘ credited
```

`uninvoiced` is this project's existing spelling of “unbilled” and keeps its meaning;
`invoice_paid_unreconciled` and `credited` were added.

**Confirmed: paying an invoice does not complete a clinical order.**
`partner_record_stripe_invoice_paid` writes only to `partner_invoices`,
`partner_invoice_payments`, `partner_order_financials.invoice_status` and `audit_logs`.
It contains no statement touching `orders`, `doctor_status`, `doctor_earnings`,
`order_documents` or `communications` — asserted textually by guard M21 and measured on
real fixtures: clinical status stayed `completed` / `patient_notified` and the
earning / communication / document counts were 0 → 0 across the payment.

**Confirmed: orders require manual paid reconciliation.** `invoice.paid` moved 2 orders
to `invoice_paid_unreconciled` and set **zero** to `paid` (guard M22 forbids the
statement outright). An admin then marked ONE order paid; the other stayed
unreconciled on the same invoice. The reconciliation created no provider earning, left
clinical status untouched, and did not alter the original financial snapshot. The ledger
is append-only (update and delete both refused).

---

## Stripe test invoice / webhook results

* Stripe account is TEST mode (`pk_test_…`; the hosted invoice page shows the TEST MODE
  banner).
* Manual invoice through the deployed `partner-stripe-invoice`: **PTINV-2026-0011**,
  `in_1UEVQuGwm9wIWlgiHAKFOTIq`, $113.00, 2 orders, customer `cus_VEzPFGtM4Z0qvK`
  created and recorded on the billing profile.
* **Line items on the hosted Stripe page** (screenshot evidence):
  `PT-7F768EF3DA — ESA clinical fulfillment  $52.00` and
  `PT-E372433A7A — PSD clinical fulfillment  $61.00`. No customer name, pet name, DOB,
  email or health information anywhere on the invoice. `assertNoCustomerData` re-checks
  every description against the canonical form before it is sent, and refuses all four
  customer-shaped variants tested.
* **Weekly job**, driven exactly as pg_cron drives it (`net.http_post` with the vault
  secret, which never left the database): dry run listed the partner as due
  (period `w:2026-W37`, 1 order, $52.00); the real run created **PTINV-2026-0012**
  (source `weekly`, Stripe id recorded); an immediate second run **considered 0
  partners**; and calling `partner_prepare_invoice` again with the same period key
  returned `already_existed: true` — both layers of the duplicate guard.
* Weekly sending cannot be enabled for a half-configured partner: removing the Stripe
  customer while it is on raises `partner_billing_weekly_ready`.
* **Webhook signature enforcement**: three forged `invoice.paid` events carrying our
  `pawtenant_kind: partner_receivable` metadata were POSTed to the deployed
  `stripe-webhook` — no signature, a junk signature, and a well-formed wrong signature.
  All three were refused (400 “Webhook signature required” / “signature mismatch”) and
  the invoice stayed `issued` with `amount_paid_cents` 0.

**One gap, stated plainly.** A genuine Stripe-signed `invoice.paid` was **not** delivered
end to end. Paying the hosted invoice requires driving Stripe's cross-origin card iframes,
and the Browser pane blocks the popup that page opens — so the payment could not be
completed from here. What that leaves unproven is only the transport: the signature check
is pre-existing, untouched code, and it demonstrably refuses forgeries. The partner branch
behind it was then driven with the **real** Stripe invoice id and amount, through the exact
RPC the branch calls with the exact arguments it passes. To close the gap the owner can open
the hosted invoice for a fixture partner and pay with `4242 4242 4242 4242`.

---

## Assessment PDF — before / after

`buildNeutralAssessmentHTML` is the internal document for **all four** cases (direct ESA,
direct PSD, partner ESA, partner PSD) — that routing already existed; this task rebuilt
the document.

| | Before | After |
|---|---|---|
| Face | Georgia / Times serif | `"Helvetica Neue", Helvetica, Arial, sans-serif` |
| Spacing | `letter-spacing: 0.08em` on section titles, `0.01em` on the title | `letter-spacing: normal` everywhere (asserted: zero non-normal values in the stylesheet) |
| Page size | A4 in one branch, Letter in the other | US Letter throughout, real 8.5in × 11in sheets |
| Page breaks | `page-break-inside: avoid` hints only | laid out into real sheets; measured 0 px of clipping on every page |
| Page numbers | none | “Page N of M” on every page |
| Footer | last page only | confidentiality line on every page, exactly as specified |
| Long answers | could clip | flow across pages inside a light-grey bordered block |
| Headings | could orphan | a heading alone at a page foot is moved down with its content |

Sections: **ESA/PSD Assessment → Customer Information → Pet Information → Mental Health
Questionnaire → Consent and Attestations**, thin black rules, no logo, no colour, no
partner brand, no partner external id, no charge, payout or margin.

Rendered and inspected page by page (short ESA 1 page; long partner ESA 2; PSD 2; direct
ESA 2; hostile 1): 0 clipped pages, 0 orphaned headings, 0 overlapping blocks, 0 elements
outside the sheet, no horizontal overflow, 0 images/links/iframes. Hostile payloads
(`<script>`, `<img onerror>`, a CSS breakout) render as literal text and the body stays
visible. Verified on the **deployed** provider portal too: the provider's “Download PDF”
produced `ESA Assessment`, Case Reference `PT-7F768EF3DA`, Letter size, Helvetica,
normal spacing, the confidentiality line, zero brand leaks, 0 images, escaped payload.

The paginator needs one script. It is a **constant**: the guard asserts it is
byte-identical for a benign order and for an order whose every field is hostile, and that
it contains no `fetch` / `XMLHttpRequest` / `eval` / `Function(` / `innerHTML` /
`document.write` / URL / tag. The customer-facing branded intake form and every letter,
QR copy and invoice PDF are untouched.

---

## Defects found and fixed during this task

1. **`text[] || 'literal'` is ambiguous in PostgreSQL** — an untyped literal resolves as
   `anyarray || anyarray`, so every bare error-code append in the validator raised
   “malformed array literal” instead of recording the code. Only the parenthesised pet
   errors worked, which is why a PSD/cat order was refused correctly while an under-18
   order died with a cast error. Now `array_append()` throughout.
2. **`partner_intake_audit()` only accepts `^partner_intake_[a-z_]+$`** — the submission
   used `partner_portal_order_submitted`, so **every** portal submission aborted at the
   audit step. Renamed into the canonical namespace rather than loosening the guard.
3. **Three admin READ projections returned HTTP 200 + `[]` to a partner** instead of
   refusing, because `is_chat_admin()` sat in a WHERE clause. No data leaked; the problem
   is the shape of the gate. Each now raises 42501 at the top.
4. **Portal orders were labelled “API” in Admin Orders** — the badge was
   `method === "manual" ? "manual" : "api"`. Replaced with a map that must carry a label
   for every accepted method. `check-partner-manual-intake`'s G4 had pinned that exact
   ternary and would have kept passing; it now requires a label per method, with a new
   planted control.
5. **The admin review screen showed “Confirmed at submission”** instead of the partner
   charge, because in admin mode the partner is chosen inside the wizard and its rates
   cannot be passed in. The wizard now loads them for the selected partner.
6. **The Accounts contribution table showed “Paid” for every order on a paid invoice**,
   including unreconciled ones — erasing exactly the distinction this task draws. The
   badge now leads with the order's own state.
7. **A SECURITY DEFINER trigger function was anon-executable** (PostgreSQL grants EXECUTE
   to PUBLIC by default). Not exploitable — a trigger function called directly fails on
   the unset trigger context — but revoked anyway; the guard now demands a revoke for
   every function, trigger functions included.
8. **Three performance-advisor findings on the new tables** (per-row `auth.uid()`
   evaluation, two permissive policies on `partner_users`, two unindexed FKs), all closed;
   isolation re-proved with RLS enforced afterwards.

---

## The PSD blocker (owner decision needed)

`psd_assessment_status()` judges a PSD order against the canonical `psd_v1` question
catalog. A portal PSD order stores `portal.manual.v1`, which is not in the catalog, so
the order is judged `unmapped_version: true`, `required_total: 16`, `answered: 0`,
`complete: false` — and `assign-doctor` refuses to assign a provider.

**This is the gate working as designed.** It exists so that no partner answer can
implicitly satisfy a retail clinical question without an explicit, versioned,
clinically-approved mapping, and the task says in terms: *do not bypass the established
disability/clinical gate.* So a PSD order submitted through the simple form is accepted,
priced, invoiceable and visible — but cannot reach a provider.

I did not invent a mapping; that is a clinical decision. The options are:

1. **Restrict the portal form to ESA** for now, and keep PSD on the API contract (which
   already submits canonical `psd_v1` answers). Smallest, safest.
2. **Add the 16 canonical PSD questions as structured fields** to the portal form for PSD
   orders, so they satisfy `psd_v1` directly. More work; no clinical mapping invented.
3. **Approve a `portal.manual.v1 → psd_v1` mapping.** Only the owner and a clinician can
   authorise this, and a free-text transcript may not be mappable at all.

Everything else in the task — ESA end to end, billing, reconciliation, the assessment
document, the portal, the admin form — is complete regardless of which option is chosen.

(Note: the provider-portal QA below reached a PSD partner case because this task set the
assignment columns directly in SQL to exercise the provider screens; the normal
`assign-doctor` path would have refused it.)

---

## TEST verification

* **Migrations** — 8, applied through MCP `apply_migration`.
* **Security advisors** — identical to baseline (29 / 23 / 1 / 57 / 230 / 1). No new
  finding; the new tables do not appear in `rls_enabled_no_policy`.
* **Performance advisors** — the three findings this task introduced were closed.
* **Type-check** — 8 errors, the same 8 as baseline, none in files this task touched.
* **Build chain** — 113/117 guards pass when run individually. Three of the four
  “failures” are an artefact of re-running the prerender injector against an
  already-injected `out/` (all three PASSED in the chained build). The fourth is A21 in
  `check-provider-document-approval-gate`, the **pre-existing local CRLF artefact** —
  proved by LF-normalising `src/pages/my-orders/page.tsx`, which takes that guard to
  32/32; the working copy was restored to CRLF afterwards, and Vercel (LF) builds it
  green. The chained `npm run build` reached A21 with everything before it passing.
* **Guards** — new `check-partner-portal-manual-order-billing.mjs`: **41 checks, 27/27
  planted controls detected, tree restored**. Rewritten `check-partner-assessment-pdf`:
  **34 checks, 24/24 controls**. Updated `check-partner-manual-intake`: **42 checks,
  22/22 controls**. `check-assessment-pet-support`'s document-mount assertion is now
  behavioural instead of a stale textual call count. Wired into the build chain and into
  `check-partner-platform-workspace`'s `REQUIRED_GUARDS`.
* **Database / RLS role matrix** — three rolled-back transactions with RLS actually
  enforced via `set local role`: **37/37** identity and isolation, **21/21** partner
  privilege and confidentiality, **32/32** billing state machine. Zero residue.
* **Deployed-surface authorization QA** — **32/32** against the real REST API as
  anonymous, a revoked partner user, an active partner user and the bare anon key.

### Browser QA (deployed, 1024×768 unless noted)

| # | Scenario | Result |
|---|---|---|
| 1 | Partner admin invited and accepts access | ✅ membership bound on first visit |
| 2 | Partner staff signs in, sees only its organization | ✅ “PT002 QA Partner”, role Staff |
| 3 | Partner creates an ESA draft and submits it | ✅ **PT-7F768EF3DA** |
| 4 | Partner creates a PSD order with pasted answers | ✅ **PT-E372433A7A**, $61.00 rate v1 |
| 5 | Refresh / double-click does not duplicate | ✅ 3 clicks in one tick → 1 order; draft survived a full reload |
| 6 | Partner sees the generated PawTenant order ID | ✅ shown on the success screen and in the list |
| 7 | Admin creates an order for the same partner | ✅ **PT-78BE9237F4** |
| 8 | Both appear with the partner chip in Admin Orders | ✅ chip + `PORTAL` intake badge |
| 9 | Provider sees generic Partner Case + the simple PDF | ✅ 3 “Partner Case” badges; PDF verified from the deployed bundle |
| 10 | Provider sees no partner identity or economics | ✅ zero matches for partner name, reference, charge, wholesale, invoice, contribution, margin |
| 11 | Admin creates a Stripe test invoice | ✅ PTINV-2026-0011, PHI-free lines |
| 12 | Signed `invoice.paid` updates the invoice only | ⚠️ signature gate proved (3 forgeries refused); the signed delivery itself not driven — see the gap above |
| 13 | Orders remain `invoice_paid_unreconciled` | ✅ 2 of 2, none auto-paid |
| 14 | Admin manually marks selected orders paid | ✅ 1 marked; the other untouched |
| 15 | Clinical statuses remain unchanged | ✅ `completed` / `patient_notified` throughout; 0 earnings, comms, documents |
| 16 | Accounts displays the correct partner contribution | ✅ $113.00 charges, net $113.00, and **three different per-order billing states on one page** — including two orders on the SAME paid invoice reading “Paid” and “Payment received · to reconcile” |
| 17 | No horizontal overflow, truncation or console errors | ✅ 390 / 768 / 1440 all clean; the wide orders table scrolls inside its own container; the only console entries were the 401/403 produced by the deliberate refusal tests |

### Also proved

Anonymous cannot create or read partner orders · a revoked partner user is denied in the
browser (“No partner access”) · Partner A cannot read, modify or invoice Partner B's
orders · a forged `p_partner_id` is refused with `partner_mismatch` · a partner cannot set
its own rate, paid state or invoice state, choose a provider or a payout, complete an
order, or reach provider identity, earnings or internal notes · questionnaire text appears
in no audit JSON · pasted HTML stays inert · an admin can create for any active partner ·
one order cannot be billed twice · PSD refuses a cat · an under-18 DOB is refused · four
animals are refused · submission without the authorization confirmation is refused.

---

## Files changed

**New** — `supabase/migrations/2026091119{0000,0100,0200,0300,0400,0500,0600,0700,0800}_*.sql` ·
`supabase/functions/_shared/partnerAdminAuth.ts` ·
`supabase/functions/_shared/partnerStripeInvoice.ts` ·
`supabase/functions/partner-user-invite/index.ts` ·
`supabase/functions/partner-stripe-invoice/index.ts` ·
`supabase/functions/partner-weekly-invoices/index.ts` ·
`src/lib/assessmentIdentityRules.ts` ·
`src/components/partner/PartnerOrderWizard.tsx` ·
`src/pages/partner-portal/page.tsx` ·
`src/pages/partner-portal/components/PartnerPortalOrders.tsx` ·
`src/pages/partner-portal/components/PartnerPortalInvoices.tsx` ·
`src/pages/admin-orders/components/partner-platform/PartnerAdminOrderIntake.tsx` ·
`src/pages/admin-orders/components/partner-platform/PartnerUsersPanel.tsx` ·
`src/pages/admin-orders/components/partner-platform/PartnerReceivablesPanel.tsx` ·
`scripts/check-partner-portal-manual-order-billing.mjs`

**Modified** — `supabase/functions/stripe-webhook/index.ts` (two surgical additions) ·
`src/pages/admin-orders/components/assessmentUtils.ts` ·
`src/pages/assessment/components/Step2PersonalInfo.tsx` ·
`src/pages/admin-orders/components/PartnerContributionPanel.tsx` ·
`src/pages/admin-orders/components/PartnerOrdersTab.tsx` · `src/pages/admin-orders/types.ts` ·
`src/pages/admin-orders/components/partner-platform/{PartnerPlatformWorkspace,PartnerManualIntake,PartnerFinanceTab,PartnerSettingsTab}.tsx` ·
`src/router/config.tsx` · `src/router/adminRoutes.tsx` · `src/generated/routeManifest.ts` ·
`public/robots.txt` · `package.json` ·
`scripts/{check-partner-assessment-pdf,check-partner-manual-intake,check-assessment-pet-support,check-partner-platform-workspace}.mjs`

**Frozen files** — `OrderDetailModal.tsx` and `AnalyticsTab.tsx` were **not touched**.

## Edge functions and verify_jwt

| Function | Version | verify_jwt |
|---|---|---|
| `partner-user-invite` | v1 (new) | **true** |
| `partner-stripe-invoice` | v1 (new) | **true** |
| `partner-weekly-invoices` | v1 (new) | **false** (cron; vault-secret gated) |
| `stripe-webhook` | v83 → **v84** | **false** (preserved) |
| `partner-manual-intake` | v5 (unchanged) | true |
| `partner-orders-v1` | v5 (unchanged) | false |
| `partner-invoice-pdf` | v1 (unchanged) | true |
| `partner-webhook-dispatch` | v1 (unchanged) | false |
| `partner-webhook-sandbox-sink` | v1 (unchanged) | false |

## Fixture cleanup and baseline restoration

Inspected before deleting, scoped to one partner id and the task-unique `pt002-` prefix,
with a collision check first (a previous task once deleted two unrelated rows via a
prefix sweep). Removed: 3 orders and their answers, lifecycle events, financials,
billable events, api-request rows; 2 invoices, 3 lines, 1 payment; 1 reconciliation;
2 drafts; 1 billing profile; 2 rate cards; 3 partner users; 12 webhook events; the
partner organisation; 3 auth users and their identities; 10 audit rows (8 by metadata,
then 2 more located by primary key after the first pass missed them — they carry the
partner id in `object_id`, not in metadata).

Restored: the two reused QA accounts' **exact original password hashes** (verified equal),
and the scratch table holding them was dropped. `session_replication_role` was `SET LOCAL`
only and is back to `origin`; all 29 triggers across `orders` and every partner table are
enabled.

Counts vs baseline — every table back to baseline except two rows created by **other
activity on TEST while this ran**: `orders` 617 (the other session's `PT-QATHUMB-1`
checkout fixture) and `auth.users` 61 + 3 audit rows (a real customer signup,
`PT-MTX1C8IV`, at 14:13). Neither is mine and neither was touched.

**Retained on purpose**: the SignMyESA partner record and the owner's own in-progress
SignMyESA PDF draft (uploaded by `hamzaengr94@gmail.com` at 17:09), left exactly as found.

**Left in the Stripe TEST account**: customer `cus_VEzPFGtM4Z0qvK` and two test-mode
invoices (`PTINV-2026-0011` paid-in-our-DB/open-in-Stripe, `PTINV-2026-0012` open). No
real money; the owner can void them from the Stripe dashboard in test mode. The
`partner_invoice_number_seq` also advanced (sequences are not transactional).

## Commits, deployment

Rollback point **`d5cb350`**. Commits: `785aa96`, `4868b68`, `9847741`, `cc919d6`,
`6020013`, `e0202d9`, plus the closure commit. TEST deployment
**`dpl_BaAkHY5WnSiA7ihvuANvipTqGG1P`** carried most of the browser QA; the label and
Accounts fixes were verified on the deployment that followed.

## LIVE

**LIVE was not touched.** No LIVE repository file, no LIVE Supabase object, no LIVE Vercel
deployment, no LIVE Stripe call, no real partner billing email, no real customer and no
real provider payout. Every fixture address is a reserved non-deliverable TLD, every order
was stamped `is_test`, and `TEST_SUPPRESS_EXTERNAL_NOTIFICATIONS` is enabled on TEST.

Next: `Approve LIVE rollout of PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002.`
— and a decision on the PSD blocker above.
