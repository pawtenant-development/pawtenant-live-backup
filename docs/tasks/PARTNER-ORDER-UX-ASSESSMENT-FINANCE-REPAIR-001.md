# PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001 — task record (TEST)

**Status: COMPLETE on TEST · LIVE untouched (awaiting owner approval).**
Date: 2026-09-11 · Business dates: America/New_York.

Rollback point (commit before this task's first commit): `7b208ac`.
Feature commit: `9568377`. Closure commit: see the end of this record.

---

## 1. Root causes, per reported defect (PT-DD8693B285)

| Symptom | Root cause found | Where |
|---|---|---|
| Admin / Provider Assessment show an empty Mental Health Questionnaire | The pasted text WAS stored verbatim (`orders.assessment_answers.partnerQuestionnaireText`, 1,731 chars, plus a row in `public.assessment_answers`). The on-screen renderers looped over the retail ESA question catalog only (`QUESTIONNAIRE_ITEMS`); the pasted key is not in the catalog, so every item was “empty” and the loop emitted zero rows with no fallback. The PDF already showed the transcript — screen ≠ PDF. | `OrderDetailModal.tsx` (assessment section), `ProviderOrderDetail.tsx`, `EsaIntakeView.tsx` |
| Assessment branded “PawTenant ESA Intake Form” | Hard-coded branded header in the three on-screen renderers; the neutral document existed only for the PDF. | same three files |
| Payments tab shows customer recovery actions | `PaymentHistoryTab.tsx` keyed everything on `payment_intent_id` and had no partner condition at all — a partner order (no PaymentIntent by design) read as “No Payment Received Yet” with Retry Payment Link / Discount Recovery Email. The backend already refused those sends (409); the UI never said so. | `PaymentHistoryTab.tsx` |
| Finance tab shows $0 | `partner_admin_billing_summary` counted charges only where `billable_status = 'billable'`, which flips only on `doctor_status → patient_notified` (clinical completion). The example order is `pending` (document uploaded, awaiting admin approval), so every tile read 0 while the frozen $52.00 charge and the $30.00 provider earning already existed. Provider cost was summed over ALL partner earnings regardless of status, unscoped to the counted orders; `provider_earning_snapshot_cents` was declared but never written. | migration `20260911190600`, `PartnerReceivablesPanel.tsx`, `PartnerFinanceTab.tsx` |
| Partner orders absent from the main Orders view / KPIs | `applyOrderOriginFilter` defaults every retail surface to `order_origin = 'direct'`, and the retail list never opted out. Even if included, every “paid” bucket keyed on `payment_intent_id`, so a partner order would have been an unpaid lead. `OrderCard` and the page's display-status helper had the same `!payment_intent_id ⇒ lead` rule; `orderWorkflowState` (client) too. | `orderFacetCounts.ts`, `page.tsx`, `OrderCard.tsx`, `orderLifecycle.ts` |
| Provider submission says “Notify Patient” | Single copy for all orders in `ProviderOrderDetail.tsx`. | — |
| Sandbox onboarding checklist dominates Overview | Rendered by `PartnerOverviewTab.tsx` together with API/webhook stat cards. | — |
| Legacy PDF upload still visible | `PartnerPlatformWorkspace.tsx` kept a “Legacy: PDF upload” button and mounted the PDF wizard + table; `partner-manual-intake` still accepted every action. | — |

Is PT-DD8693B285 a disposable fixture? It is a TEST-project order created by the owner through the admin form (`evidence: admin_portal`), `is_test = false`, pet and partner-reference fields are lorem ipsum. The order identity was treated as a fixture; the questionnaire text was treated as potentially real clinical content: it was never logged, never written to a persistent file, and never modified. The repair ADDED a parsed representation next to it (see §3) through an admin-gated, lossless-checked RPC; the raw text is byte-identical before and after (length 1,731 → 1,731; audit row `partner_intake_questionnaire_blocks_rebuilt` with counts only).

---

## 2. Exact behaviour implemented

**Legacy PDF intake (§1).** Button, wizard and intake table removed from the Orders tab. `partner-manual-intake` now refuses every action except `source_url` with HTTP 410 `legacy_intake_retired` (proved on the deployed function: `upload` 410, `commit` 410). Historical `partner_intake_drafts` rows and storage objects are untouched; a read-only “Legacy PDF intake history” panel lives under Settings (dashed border, labelled *Read-only history*), offering only “View source PDF” and “Open order”.

**Structured order creation (§2).** One wizard, mounted for admins (Partner Platform → Orders → New Partner Order) and for partner users (portal → New Order). Steps: Service → Customer (name, email, phone, DOB, street, city, state, ZIP, optional partner reference) → Pets (1–3, name/type/breed/age/weight, add/remove) → Questionnaire (large textarea, live “how the provider will see it” preview, block-count feedback, empty-text validation, attestation *“I confirm this information is accurate and authorized for clinical review.”*, submit). Both surfaces call `partner_submit_manual_order` → `partner_accept_order`: PT id minted, partner frozen on the order (`tg_orders_partner_snapshot_immutable`), `partner_intake_method = partner_portal_manual`, rate frozen into `partner_order_financials`, no Stripe attempt, no customer communication, audit metadata = ids/counts/lengths only (`partner_intake_audit` refuses PHI-shaped keys). Partner users cannot name a partner (`p_partner_id` is null from the portal; the database derives it from `current_partner_id()`; a forged id raises `partner_mismatch`).

**Questionnaire data path (§3).** `src/lib/partnerQuestionnaire.ts` (pure, no imports) parses the paste into ordered `{number, question, answer}` blocks plus `additional` lines; `questionnaireIsLossless()` proves nothing dropped/invented; `resolvePartnerQuestionnaire()` returns stored blocks only when they still match the raw text, else re-parses the raw text — never empty when raw text exists. The wizard sends `p_questionnaire_blocks` / `p_questionnaire_additional`; `partner_questionnaire_blocks_lossless()` repeats the check in SQL and the submission raises `questionnaire_blocks_not_lossless` otherwise. Admin repair RPC `partner_admin_store_questionnaire_blocks` (is_chat_admin, partner-origin only, lossless-checked, raw text untouched).

**Neutral assessment (§4).** `PartnerNeutralAssessment.tsx` (screen) and `buildNeutralAssessmentHTML` (PDF) render the same resolver output: title `ESA Assessment` / `PSD Assessment`, Case Reference = PT id, submission date, customer, pets, numbered Q&A (long answers wrap), “Additional Questionnaire Information”, consents, page numbers (PDF). No PawTenant name/logo/domain/contact/orange, no partner name/reference, no economics. Direct-customer branded assessment untouched (guard P12/B2).

**Provider experience (§5).** Partner cases: neutral assessment on screen + PDF (ESA and PSD), “Submit N Documents for Review”, “Internal Note (Optional)”, confirm dialog “Submit Documents for Review? … No customer email is sent from here”. Nothing partner-identifying reaches the provider bundle (guard B4).

**Customer-notification firewall (§6).** `partnerCommsGate.ts` gained the identity gate (`mayContactCustomerIdentity` / `gateCustomerContactIdentity`): refuses when ANY partner-managed order carries the email/phone (ambiguity fails closed; no identity fails closed; read error fails closed). Newly gated: `send-sms`, `bulk-sms` (per target), `broadcast-email` (per recipient), `send-resume-checkout-email`, `notify-customer-refund`, `send-customer-otp` (portal sign-in code = invitation), `request-customer-password-reset`, `send-customer-password-reset`, `create-customer-account`. Already gated before this task: `notify-patient-letter`, `notify-order-status`, `resend-confirmation-email`, `send-checkout-recovery` (retry-payment + discount-recovery), `send-templated-email`, `ghl-send-sms`, `send-review-request`, `notify-thirty-day-customer` (cron), `send-new-esa-order-link`, `manage-custom-payment-request`, `create-additional-doc-invoice`, `create-additional-pet-request`, `backfill-order-ghl`, `ghl-webhook-proxy`, `assign-doctor`; `lead-followup-sequence` and `send-renewal-reminders` (drips) are direct-only by predicate. Completion: `notify-patient-letter`'s partner arm now emails ONLY `partner_organizations.completion_notification_email` (new column, Settings → Notifications & contacts) with the PT id, the partner's reference, the status and the portal path — no customer, clinical, provider or pricing content; TEST suppression applies to `.test` addresses. `admin_force_complete_order` returns `notify_customer = false` for partner orders.

**Main Admin Orders (§7).** Explicit Order Origin filter (Direct + Partner / Direct / Partner, plus a partner select), default both. “Partner Order · <brand>” chip on the card (desktop and mobile), admin-only by construction (`partner_organizations` is admin-only under RLS; the directory is imported by admin code only). Sixth KPI card **Partner Orders** (event on `created_at`, counts orders in the selected period, never money); clicking it selects the partner origin on the All tab; retail cards pin `direct`. `fetchKpiCardCounts` builds every count with `applyListPredicates` through `kpiCardListSelection`, so count = list by construction (guard K12 covers all six cards). Buckets, the Payment filter and the default-scope arm use one `CONFIRMED_PAYMENT_ARM` (PaymentIntent OR partner + paid_at); Lead never includes a partner order. Creation-date grouping/sort/pagination untouched (`orderGroupingIso(order, "created")`, `orderComparator("created")`, `base.order("created_at")`; lifecycle-date guard 90 invariants + 6-card contract).

**Payments tab (§8).** Partner orders render `PartnerFundingSummary` (partner brand, frozen charge + rate version, provider cost from the payout ledger, adjustments, net contribution, billable status, invoice status/number, manually-marked-paid by/when, “Needs financial reconciliation” flag) + the single lifecycle panel. No customer warning, no recovery actions, no Stripe attempt log.

**Finance (§9).** `partner_admin_order_finance_rows(p_partner_id)` = the ONE per-order definition (charge − provider cost + credits; provider cost excludes cancelled/voided/refunded earnings; credits = credit events; reconciliation flag when billable without provider evidence or no snapshot). `partner_admin_order_finance(p_order_id)` for the Payments tab. `partner_admin_billing_summary` keeps its columns and adds `orders_in_progress`, `in_progress_charges_cents`, `in_progress_provider_cost_cents`, `orders_needing_reconciliation`; charges/cost/adjustments are scoped to the same billable orders. `tg_partner_billable_on_completion` now snapshots `provider_earning_snapshot_cents` from the ledger (NULL ⇒ flagged, never zeroed). Invoice paid (`invoice_paid_unreconciled`) and manual paid (`partner_admin_mark_orders_paid` → `partner_order_reconciliations`, who/when) remain separate; nothing completes a clinical order on invoice payment (unchanged, guard M21/M22). No Stripe invoice was created or sent.

**Partner Platform UI (§10).** Orders: filters collapsed by default with an active-filter badge and Clear filters; rows `role=button`, `tabIndex`, Enter/Space. Overview: partner, orders, documents ready, unbilled, outstanding invoices, needs-action, recent orders (rows keyboard-navigable to Orders). Settings: Partner organizations · Profile & rate · Notifications & contacts (open) · Portal users · then collapsed technical sections (Sandbox onboarding checklist, Environments & production activation, API keys, Webhooks, Integration readiness & sandbox handoff) · Legacy PDF intake history (read-only).

**Partner portal (§11).** Rows open a detail row by mouse/keyboard (PT id, reference, workflow status, completion date, customer, animals, billing, document availability); “Download” calls the new `partner-portal-document` function (session-derived partner; other partners' orders are 404; anon/service keys 401; admins without membership 403), which reuses the API's immutable release + 5-minute signed URL. Billing tab unchanged.

---

## 3. Questionnaire storage and rendering model

```
orders.assessment_answers
  partnerQuestionnaireText        verbatim paste (canonical clinical record; never rewritten)
  partnerQuestionnaireBlocks      [{number, question, answer}] — stored only if lossless vs the text
  partnerQuestionnaireAdditional  [string] — un-numbered lines (preamble / whole paste when unparseable)
  partnerQuestionnaireFormat      "qa_blocks.v1"
public.assessment_answers         one row per key (partner_accept_order), unchanged
```
Readers (admin modal, provider portal, admin Provider View, shared intake view, PDF) call `resolvePartnerQuestionnaire(answers)`: stored blocks if present AND lossless, else `parsePartnerQuestionnaire(raw)`. Parser rules: numbered starts (`1 `, `1.`, `1)`, `Q1:`, `#1`), numbers must increase by one, a numbered line is a question only with a `?` or a question opener (“How/What/In your own words/Describe/…”), a question wraps onto the next line while it has no `?` and the next line ends with one, blank lines inside an answer are kept, everything else is the answer until the next question. Lossless = every non-blank source line (numbering normalised) is present and the letter/digit count is identical. Rendering is text-only React children on screen and `escapeHtml` per fragment in the PDF (tag allowlist unchanged: div/p/span/table).

---

## 4. Role / access matrix (server-enforced)

| Surface | Admin | Correct partner user | Other partner user | Assigned provider | Unassigned provider | Customer | Anonymous |
|---|---|---|---|---|---|---|---|
| Create partner order (`partner_submit_manual_order`) | ✅ for any active partner | ✅ own org only (id from session) | ✗ `partner_mismatch` | ✗ | ✗ | ✗ | ✗ 42501 |
| Read partner orders (`partner_portal_orders`) | (admin uses admin surfaces) | ✅ own only | ✗ 0 rows | ✗ | ✗ | ✗ | ✗ |
| Partner document (`partner-portal-document`) | 403 no membership | ✅ own order | 404 | — | — | — | 401 |
| Order finance (`partner_admin_order_finance*`, billing summary) | ✅ is_chat_admin | ✗ 42501 | ✗ | ✗ | ✗ | ✗ | ✗ |
| Store questionnaire blocks | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Completion contact | ✅ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Provider clinical projection | (Provider View, audited) | — | — | ✅ own assignment (orders RLS) — no partner name/reference/economics | ✗ | ✗ | ✗ |
| Partner chip / directory | ✅ (admin-only RLS table) | — | — | never imported | — | never imported | — |
| Admin Portal | ✅ | ✗ (no doctor_profiles admin row) | ✗ | ✗ | ✗ | ✗ | ✗ |

Proved on the deployed TEST functions (2026-09-11 17:34 UTC): portal document as partner 409 `document_not_ready` (document still pending review), as admin 403, with the anon key 401.

---

## 5. Notification matrix (partner orders)

| Channel / event | Result |
|---|---|
| Customer email (any template), SMS (Twilio `send-sms`, `bulk-sms`, GHL), checkout / retry-payment / discount-recovery links, resume-checkout email, refund email, review request, 30-day cron, drips, Meta/GHL fires | Refused server-side (409 / skipped), audited `partner_policy_suppressed` (channel + event, no PHI) |
| Customer portal invitation / account / sign-in code / password reset | Refused (409 / enumeration-safe `ok`) via the identity gate |
| Provider document submission | `provider-submit-letter` → `pending_admin_approval`; no customer contact; note stored as internal |
| Admin Approve & Deliver / force complete | Clinical completion recorded; customer email refused; `notify_customer=false` |
| Partner contact | ONE email to `completion_notification_email` (PT id, partner reference, status, portal path) — TEST-suppressed for `.test` addresses; audited `partner_completion_notified` |
| Partner API webhook | unchanged (signed outbox) |

Deployed probes: `send-resume-checkout-email` preview 200 `eligible:false` / send 409; `send-sms` with order ref 409, with phone only 409; `send-customer-otp` for the partner customer's email 409. Communications count stayed at 969 throughout.

---

## 6. Finance reconciliation — PT-DD8693B285

| Item | Value | Source |
|---|---|---|
| Partner | SignMyESA | `orders.partner_id` (immutable) |
| Frozen partner charge | $52.00 (ESA rate card v2, frozen 2026-09-11 15:30 UTC) | `partner_order_financials.wholesale_fee_cents` |
| Provider cost | $30.00 (pending base earning, Fariaa) | `doctor_earnings` |
| Adjustments | $0.00 | `partner_billable_events` credits |
| Net partner contribution | **$22.00** | rows RPC |
| Billable status | pending (document uploaded, awaiting admin review) | — |
| Invoice status | uninvoiced · manually marked paid: No | — |
| Needs reconciliation | No (provider cost evidence present) | — |
| Billing summary (SignMyESA) | completed charges $0 · in progress $52.00 (1 order, provider cost so far $30.00) · awaiting invoice $0 · reconciliation flags 0 | `partner_admin_billing_summary` |

Backfill: TEST has exactly one partner order; it carried a valid snapshot and ledger evidence, so nothing was invented. Orders lacking evidence would surface as “Needs financial reconciliation”.

---

## 7. Main Orders — KPI / list / creation-date proof (deployed TEST, 2026-09-11)

| Check | Result |
|---|---|
| Six-card banner at 1440 / 768 / 390 | Lead 465 · Paid (Unassigned) 41 · Under Review 15 · Pending Delivery 2 · Completed 0 · **Partner Orders 1 → 2** (after the fixture); stacked on phones, no horizontal overflow at any width |
| Click Partner Orders | list = the partner orders only, "1 of 1" then "2 of 2", card `aria-pressed=true`, URL `?kpi=partner_orders`, banner "N partner orders received in 2026-09-01 – 2026-09-30 · grouped by Created date" |
| Direct load of `?kpi=partner_orders` | after fix `02639ce`: "2 of 2" (before: empty list under a card reading 2 — the status was seeded from the raw key) |
| Partner chip | "Partner Order · SignMyESA" on the desktop rows and, after `34d39b2`, on the phone layout (2 visible chips at 390); admin-only (provider / customer / partner-portal code never import the directory) |
| Creation-date grouping | fixture PT-24F6386EB8 was created 2026-09-10 (aged) then assigned, document-submitted, approved, completed and partner-notified on 2026-09-11 — it stayed under **Yesterday**; PT-DD8693B285 stayed under **Today**. Guard O6 proves `orderGroupingIso(o,"created")` ignores every lifecycle date; the `2a70fd4b`-equivalent contract (`orderGroupingIso(order, "created")`, `orderComparator("created")`, `base.order("created_at")`) is intact and pinned by `check-admin-orders-lifecycle-dates` (90 invariants, 24 controls) |
| Revenue separation | `paymentDayBuckets` and the Stripe daily report already exclude partner orders (unchanged); the Partner Orders card counts orders only |

## 8. Files changed

**New** — `src/lib/partnerQuestionnaire.ts` · `src/lib/partnerOrder.ts` · `src/lib/partnerDirectory.ts` ·
`src/components/partner/PartnerNeutralAssessment.tsx` · `src/pages/admin-orders/components/PartnerFundingSummary.tsx` ·
`src/pages/admin-orders/components/partner-platform/{PartnerOnboardingChecklist,PartnerLegacyIntakeHistory,PartnerCompletionContact}.tsx` ·
`supabase/functions/partner-portal-document/index.ts` · `supabase/migrations/20260911210000_partner_order_ux_assessment_finance_repair.sql` ·
`scripts/check-partner-order-ux-assessment-finance.mjs` · this record.

**Modified** — `src/components/partner/PartnerOrderWizard.tsx` (rewritten: 4 steps + preview) · `src/lib/orderLifecycle.ts` ·
`src/pages/admin-orders/{page.tsx,orderFacetCounts.ts}` · `src/pages/admin-orders/components/{OrderCard,EsaIntakeView,PartnerOrdersTab,PaymentHistoryTab}.tsx` ·
`src/pages/admin-orders/components/assessmentUtils.ts` · `src/pages/admin-orders/components/partner-platform/{PartnerFinanceTab,PartnerOverviewTab,PartnerPlatformWorkspace,PartnerReceivablesPanel,PartnerSettingsTab,PartnerProfilePanel,shared}.tsx` ·
`src/pages/partner-portal/components/PartnerPortalOrders.tsx` · `src/pages/provider-portal/components/ProviderOrderDetail.tsx` ·
`supabase/functions/_shared/partnerCommsGate.ts` · `supabase/functions/{send-sms,bulk-sms,broadcast-email,send-resume-checkout-email,notify-customer-refund,send-customer-otp,request-customer-password-reset,send-customer-password-reset,create-customer-account,notify-patient-letter,partner-manual-intake}/index.ts` ·
`package.json` (guard wired into `build` and `check:partner-portal-manual-order-billing`) ·
guards `check-admin-orders-{kpi-list-parity,lifecycle-dates,ny-clock-kpi-status}.mjs`, `check-pending-delivery-admin-orders.mjs`, `check-partner-{assessment-pdf,manual-intake,portal-manual-order-billing}.mjs`.

**Frozen file** — `OrderDetailModal.tsx`: three hunks, tracker row 210 (neutral assessment mount + PDF button condition; `!isPartnerOrder &&` around the two customer payment panels). `AnalyticsTab.tsx` untouched.

## 9. Migration

`20260911210000_partner_order_ux_assessment_finance_repair.sql` — **applied to TEST** through MCP `apply_migration` (idempotent: `add column if not exists`, `create or replace`, explicit `drop function if exists` where a signature or return type changed so PostgREST never sees two overloads). Objects: `partner_organizations.completion_notification_email`; `partner_admin_set_completion_contact`; `partner_questionnaire_blocks_lossless` (revoked from anon AND authenticated); `partner_submit_manual_order` (+2 optional args, rewritten from the database's own definition); `partner_admin_store_questionnaire_blocks`; `tg_partner_billable_on_completion` (provider-cost snapshot); `partner_admin_order_finance_rows`; `partner_admin_order_finance`; `partner_admin_billing_summary` (+4 columns); `partner_portal_orders` (+2 columns); `admin_force_complete_order` (partner ⇒ `notify_customer=false`). Every function pins `search_path`; privileges verified with `has_function_privilege`. Security advisors: 29 / 23 / 1 / **55** (was 57) / **232** (was 230 — the new authenticated-callable, internally gated RPCs) / 1 — no new search_path or RLS finding.

## 10. Edge functions

| Function | Version | verify_jwt |
|---|---|---|
| `partner-portal-document` | **v1 (new)** | true |
| `send-sms` | v45 | true |
| `bulk-sms` | v44 | true |
| `broadcast-email` | v49 | false (preserved) |
| `send-resume-checkout-email` | v2 | true |
| `notify-customer-refund` | v44 | true |
| `send-customer-otp` | v22 | false (preserved) |
| `request-customer-password-reset` | v32 | true |
| `send-customer-password-reset` | v24 | false (preserved) |
| `create-customer-account` | v45 | true |
| `notify-patient-letter` | v58 | false (preserved) |
| `partner-manual-intake` | v6 | true |

Deployed with the Supabase CLI (`--no-verify-jwt` where the mode was false); modes read back from `functions list` after deploy.

## 11–12. Commits, rollback, deployment

Rollback point **`7b208ac`**. Commits: `9568377` (feature) · `02639ce` (QA fixes: `?kpi=` seeding, partner payment panels, copy, six-card pending-delivery guard) · `34d39b2` (phone-layout chip) · `49c40c0` (banner wording) · the closure docs commit. Deployments (Git auto-deploy, alias `pawtenant-test.vercel.app`): `dpl_2texB5GTvv81Zk8oJj3Pvp3AE5wa` → `dpl_AxjPEUH4iuvNY91htM4y4QqAFyk7` → **`dpl_HM2jrrvgYUBHKXEfAbEjyEQz2aAV`** (final).

## 13. Build, type-check, guards, browser

* **Type-check** — 8 errors, the same 8 as the recorded baseline (AIAssistantTrustCard, AdminProviderContactPanel, EmployeeHrDirectory ×5, ProviderInternalRecords). **No new error.**
* **Build chain** — `npm run build` (119 steps): the Vite build and every guard through step 65 are green; step 66 `check-provider-document-approval-gate` fails only on the pre-existing local CRLF artefact A21 (LF-normalising `my-orders/page.tsx` takes it to 32/32; the working copy was restored, and Vercel's LF build is green — the three Git deployments above are the proof). The 53 steps after it were run individually on the final tree: **0 failures**. `check-refund-consumer-guard` reports 5 pre-existing `refunded_at` drift warnings in files this task did not touch (warn-only).
* **New guard** `check-partner-order-ux-assessment-finance.mjs` — **60 checks, 28/28 planted controls detected, tree restored** (questionnaire parse / lossless / malformed / HTML / raw-vs-stored / no-drop-no-invent; branding on screen + PDF, direct stays branded, provider bundle clean; nine gated emitters + partner-only completion + neutral provider language + force-complete + identity-gate behaviour; authorization; finance formula / exclusions / adjustments / flags / state separation / frozen rate / Payments tab; six-card KPI, paid arm, parity by construction, list card, client classifier, creation-date grouping; UI contract; retired intake 410).
* **Amended guards** — kpi-list-parity 23/23 (13/13 controls), lifecycle-dates (90 invariants, 24 controls), ny-clock 59/59, pending-delivery 33/33 (37/40 controls — the 3 misses are pre-existing and identical on the untouched guard), segregation 29/29 (17/17), assessment-pdf 34/34 (24/24, loader now bundles), manual-intake 42/42 (22/22), portal-billing 41/41 (28/28).
* **Browser (deployed TEST, QA admin / QA provider / pt003 partner user)** — 1440 · 768 · 390: main Orders + Partner Orders card, click and direct-load parity, chips, creation-date groups before and after status changes; Assessment tab (neutral, 13 numbered Q&A, long answers wrap, no brand or reference); Payments tab (partner funding summary, no recovery actions); admin Provider View (neutral, "Partner Case", no brand or economics); Partner Platform Orders (filters collapsed, badge, Clear filters, keyboard rows open the modal), Overview (business only), Finance (in-progress $52.00 / provider cost $30.00 / net $22.00 row), Settings (collapsed technical sections, notifications contact, read-only legacy history with 2 records, "View source PDF" 200 on the surviving draft); New Partner Order (4 steps, live preview of 13 blocks, `<script>` inert, submit disabled until attestation, frozen $52.00 rate v2 shown, PT-24F6386EB8 created); real provider portal ("Partner Case", neutral assessment, "Internal Note (Optional)", "Submit 1 Document for Review", "Sent for internal review — no customer notification", document submitted); partner portal (own 2 orders only, keyboard row detail, Download → 5-minute signed PDF URL, New Order locked to SignMyESA, 390 clean). Console: no new errors on a clean reload (the buffer's older 409 was the pre-fix payment-panel call, since removed; the 401s were the deliberate signed-out phases). Deployed-function probes: resume-checkout preview 200 / `eligible:false` and send 409; `send-sms` 409 (order reference and bare phone); `send-customer-otp` 409; legacy `upload` / `commit` 410; `partner-portal-document` 409 not-ready / 403 admin / 401 anon; `notify-patient-letter` partner arm → `partnerContactSuppressed:true` (TEST `.test` contact), audit `partner_completion_notified {sent:false, suppressed:true}`.

## 14. Fixtures and cleanup

Baseline (before any fixture): orders 619 · communications 969 (last 16:02 UTC) · audit_logs 2950 · auth.users 62 · doctor_earnings 103 · assessment_answers 396 · order_documents 43 · partner_users 0 · partner_billable_events 0 · partner_order_financials 1 · partner_invoices 0.

Created: partner order **PT-24F6386EB8** (SignMyESA, reference `PT003-REF-1`, `.test` customer, aged to 2026-09-10), its document / release / financials / billable event / earning / notifications / lifecycle events / api-request / audit rows, one provider comms row (suppressed `.test` send), partner user `pt003-partner@pawtenant.test` (+ auth user and identity), completion contact `pt003-partner-contact@pawtenant.test`, temporary passwords on the two reused QA accounts (hashes backed up in `private.pt003_qa_pw_backup`).

Removed (inspected first, scoped by the fixture's ids, one transaction, triggers bypassed with `set local session_replication_role = replica`): 1 order, 1 document, 1 release, 1 financial snapshot, 1 billable event, 1 earning, 2 notifications, 6 lifecycle events, 5 webhook events (0 deliveries), 1 communication, 5 assessment-answer rows, 1 api-request, 15 audit rows, the partner user, the auth identity and user; both storage objects deleted through the Storage API (200 → 400 afterwards); the two QA password hashes restored (verified equal) and the backup table dropped; the completion contact reset to NULL.

After: orders 619 · communications 969 (same last row) · auth.users 62 · doctor_earnings 103 · assessment_answers 396 · order_documents 43 · partner_users 0 · billable 0 · financials 1 · invoices 0 · **0 residue**. audit_logs 2959 = baseline + 9 legitimate rows on the owner's order / admin actions (1 questionnaire-blocks rebuild, 6 refused-send audits from the deployed-function probes, 1 read-only source view, 1 Provider View access) — kept as truthful history.

**PT-DD8693B285** (the owner's example): untouched except the added parsed representation (13 lossless blocks; raw text 1,731 chars before and after). It remains in `pending_admin_approval` awaiting the owner's own review; nothing was sent to its customer.

## 15. What did not happen

No LIVE repository, database, edge function, Vercel deployment or Stripe object was touched. No Stripe invoice or payment was created. No customer email or SMS was sent (communications count identical; the single provider email row was a suppressed `.test` fixture send and was removed). No price or rate changed (the frozen $52.00 v2 snapshot was read, never written). No real order was mutated (the example order gained only a derived, lossless representation).

## 16. Remaining owner decisions / blockers

1. **PSD portal orders cannot be assigned** (unchanged from the previous task): `psd_assessment_status()` refuses the unmapped `portal.manual.v1` version. Options remain: restrict the form to ESA, add the 16 structured PSD fields, or approve a clinical mapping.
2. **Completion contact** for SignMyESA is empty on TEST (reset after QA). Set it under Partner Platform → Settings → Notifications & contacts before real partner completions.
3. `partner_admin_billing_summary.provider_cost_cents` is now scoped to billable orders (previously every partner earning regardless of status); the Accounts "Partner contribution" panel already used the scoped definition, so the two now agree.
4. The admin `/company` workspace gate showed "Checking workspace access…" indefinitely at the very end of QA (after the QA password hashes were restored); `check-admin-status` answered 200 for the same session, so this is a stale-session artefact of the QA pane, not this task's code — re-verify at the start of the next session.
5. LIVE promotion needs the CRLF/LF discipline noted in memory (deploy from an LF `git archive`) and the four `verify_jwt=false` functions re-deployed with `--no-verify-jwt`.

## 17. Final status

**COMPLETE on TEST** for every requirement in scope, with the one pre-existing owner decision (the PSD assignment gate) carried forward unchanged.

Next: **`Approve LIVE rollout of PARTNER-ORDER-UX-ASSESSMENT-FINANCE-REPAIR-001.`**
