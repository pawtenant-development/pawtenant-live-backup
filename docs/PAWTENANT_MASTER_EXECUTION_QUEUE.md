# PawTenant Master Execution Queue

> **Canonical execution order for every active, queued, blocked, deferred and pinned
> PawTenant / Zeek workstream.** This file is the backlog custodian of record.
>
> Consolidated by `PAWTENANT-MASTER-QUEUE-AND-UNIFIED-EMAIL-PHASE-1-001` on **2026-07-30**.
>
> **Related registries — do not duplicate, cross-reference:**
> - `docs/PAWTENANT_ACTIVE_TASKS.md` — per-task claim/lock/release records + evidence.
> - `docs/PAWTENANT_CURRENT_STATE.md` — system-by-system current behaviour.
> - `docs/tasks/*.md` — full task records (86 files).
> - `docs/PAWTENANT_CLAUDE_OPERATING_RULES.md` — safety rules that outrank this file.
>
> If this file disagrees with `git log` or the database, **trust git/DB and stop to reconcile.**

---

## A. Current state summary

| Fact | Value |
|---|---|
| **TEST repo** | `C:\Users\Hamza\Documents\PawTenant Website Repos\pawtenant-test` |
| **TEST HEAD at consolidation** | `701b78a` — clean, `0 0` ahead/behind `origin/main` |
| **TEST Supabase** | `opudhofjbydrljgleofq` |
| **TEST URL** | `https://pawtenant-test.vercel.app` |
| **Latest completed TEST task** | `CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001` (`01149a4`, fn `check-payment-status` v49, `verify_jwt=false`) |
| **LIVE repo** | `C:\Users\Hamza\Documents\PawTenant Website Repos\pawtenant-live-backup` — **owned by another session, do not touch** |
| **LIVE Supabase** | `cvwbozlbbmrjxznknouq` |
| **LIVE checkpoint** | `55d22b2` **local, unpushed**; 5 Pending-Delivery migrations applied to LIVE DB; edge functions + frontend reconciliation still underway |
| **Latest completed LIVE task** | `PROVIDER-DOCUMENT-CUSTOMER-NOTIFICATION-BYPASS-LIVE-HOTFIX-001` (`ca092e0`) |
| **Active parallel session** | `ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001` — LIVE lane |
| **This session** | `PAWTENANT-MASTER-QUEUE-AND-UNIFIED-EMAIL-PHASE-1-001` — TEST lane |

### Critical environment rules (restated, non-negotiable)

1. **TEST first.** No LIVE code/DB/data/payment/customer/provider/edge-function change without explicit owner approval.
2. **Never run `supabase db push` on LIVE.** Ledger versions do not match repo filenames. Apply via explicit MCP SQL.
3. **`supabase functions deploy` needs `--no-verify-jwt`** wherever `verify_jwt=false` must be preserved.
4. **Verify role-facing row visibility with RLS enforced** (`set local role authenticated` + JWT claims). Service-role SQL bypasses RLS and produces false "fixed".
5. **Never authorize an edge function with `bearer === SUPABASE_SERVICE_ROLE_KEY`** — authorize by capability probe.
6. **New function/table → `revoke ... from public, anon, authenticated` by name**, pin `search_path`, then re-run `get_advisors(security)`.
7. **FROZEN mega-files** (`OrderDetailModal.tsx`, `AnalyticsTab.tsx`) — surgical edits + tracker row only. See `CLAUDE.md` merge-freeze policy.
8. Canonical host is `https://pawtenant.com` (non-www).

### A.1 — Permanent safety controls (never remove)

These are standing controls, not task deliverables. Removing one silently
re-enables a defect that already reached production.

| Control | Where | Why it exists |
|---|---|---|
| `PT-LIVE-PENDINGQA-*` reserved-namespace GHL suppression | LIVE `ghl-webhook-proxy` (LIVE `8eb5d14`) | A `.test` $0 fixture on LIVE is **not** inert — the lead drip sent 4 real emails. LIVE QA fixtures must never fire real CRM events. **Do not modify.** |
| `uq_order_documents_one_current_unapproved` | `order_documents` | One current review candidate per (order, doc class). Without it, one order can present **two Approve & Deliver cards** and deliver two customer-visible letters with different verification IDs. |
| Three-condition TEST notification suppression | `_shared/testNotificationSuppression.ts` | Fail-closed gate (secret + TEST project ref + reserved `.test`/`.invalid` TLD). ⚠️ **Cannot suppress on LIVE by design** — `suppressForFixtureOrder()` requires the TEST ref. |

---

## B. Status definitions

| Status | Meaning |
|---|---|
| `COMPLETE` | Shipped and verified in its target environment. Preserved for history; do not reopen. |
| `ACTIVE — TEST` | A session is working it right now in TEST. |
| `ACTIVE — LIVE` | A session is working it right now in LIVE. |
| `TEST COMPLETE — LIVE PENDING` | Verified in TEST; the LIVE rollout has not started or has not finished. |
| `QUEUED — READY` | Fully specified, no blockers, can start now. |
| `QUEUED — DEPENDENCY` | Specified, but waits on a named predecessor. |
| `BLOCKED` | Cannot proceed — missing data, missing decision, or a hard external blocker. |
| `DEFERRED` | Deliberately postponed by the owner. |
| `INTAKE — NOT YET SCHEDULED` | Recorded idea. Does **not** displace active P1/P2 work. |
| `INFORMATIONAL / REFERENCE` | Audit, research or strategy artifact. No implementation queue slot. |

## C. Priority definitions

| Priority | Meaning |
|---|---|
| `P0` | Active security, money, privacy or customer-delivery incident. May pre-empt anything. |
| `P1` | Core operational blocker. |
| `P2` | Major workflow completion. |
| `P3` | Optimization or expansion. |
| `P4` | Strategy, research or later productization. |

---

## D. 🔴 P0 OPEN — found during this consolidation

### `CONTACT-SUBMISSION-ANON-EXPOSURE-P0-001` — customer contact PII is world-readable on **TEST and LIVE**

Discovered 2026-07-30 while inventorying the email surfaces for Phase 1. **Not previously tracked.**

`public.contact_submissions` and `public.contact_submission_replies` have RLS **enabled** but carry
blanket `TO public USING (true)` policies plus direct `anon` table grants on **both** projects:

| Project | Policy | Command | Roles | `USING` |
|---|---|---|---|---|
| TEST `opudhofjbydrljgleofq` | `contact_submissions_read_all` | `SELECT` | `public` | `true` |
| TEST | `contact_submissions_update_all` | `UPDATE` | `public` | `true` |
| TEST | `contact_submission_replies_read_all` | `SELECT` | `public` | `true` |
| **LIVE `cvwbozlbbmrjxznknouq`** | `contact_submissions_read_all` | `SELECT` | `public` | `true` |
| **LIVE** | `contact_submissions_update_all` | `UPDATE` | `public` | `true` |
| **LIVE** | `contact_submission_replies_read_all` | `SELECT` | `public` | `true` |

Impact — anyone holding the **publishable anon key** (which ships in the browser bundle) can:

- read **every** contact submission: name, email, phone, free-text message, `source_page`, and
  `metadata` (which `contact-submit` populates with the submitter's **IP address**, user-agent,
  referrer and `order_reference`);
- read **every** support reply body, including `admin_name` and `admin_email`;
- **UPDATE any submission row** — silently flip `status` to `resolved`/`archived` and make real
  customer requests disappear from the admin inbox, or rewrite `message` content.

`DELETE` is denied (grant present, but no DELETE policy and RLS is on).

**TEST is remediated by this task** (see `UNIFIED-EMAIL-CONVERSATION-DATA-MODEL-001`).
**LIVE is NOT remediated** — the LIVE repo/DB is owned by the concurrent Pending-Delivery session,
and this queue's own rules forbid touching it. This needs its own approved LIVE task.

| Field | Value |
|---|---|
| **Status** | `TEST COMPLETE — LIVE PENDING` |
| **Priority** | **P0** |
| **Next action** | Owner approval to run `CONTACT-SUBMISSION-ANON-EXPOSURE-LIVE-HOTFIX-001` **after** the Pending Delivery LIVE rollout releases the LIVE lane. |
| **Parallel safe?** | No — LIVE lane is occupied. |

---

## E. Canonical queue

Lane codes: **LIVE** = LIVE rollout · **TEST** = TEST product dev · **ADS** = Ads/SEO/reporting ·
**HR** = HR / Company OS · **ZEEK** = Zeek strategy/productization.

### E.1 — Active and immediate rollout

| P | Task ID | Title | Lane | Status | Env | Dependency | Surfaces | Evidence | Next action | ∥ safe |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | `ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001` | Pending Delivery workflow → LIVE | LIVE | `ACTIVE — LIVE` | LIVE | — | `order_workflow_state`, order docs, notif RPC, Admin Orders | LIVE `55d22b2` unpushed; 5 migrations applied; gate ON | Deploy the 4 edge fns + frontend; push `55d22b2` | ❌ owns LIVE |
| P1 | `ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001` | Resume/paid_at authority hardening → LIVE | LIVE | ✅ `LIVE COMPLETE` | LIVE | — | `get-resume-order` v101 (`verify_jwt=true`), `check-payment-status` v92 (`verify_jwt=false`) | LIVE `e153f95`→`ba83e6f`; Vercel `dpl_24uR8qpTannZDKTe1wyDQky1xKix` | 🔑 LIVE root cause ≠ TEST's: LIVE has NO entitlement-snapshot trigger; `detect_order_lifecycle_events` counts a non-null `payment_intent_id` as PAID ⇒ the DB stamps `paid_at` itself, then immutability REJECTS the real Stripe value. Shipped PARTIAL, **closed to COMPLETE** by `CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001`. `docs/ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001.md` (LIVE repo) | ✅ |
| **P0** | `CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001` | Remove unauthenticated customer PII from the public payment-status endpoint | TEST+LIVE | ✅ `LIVE COMPLETE` | BOTH | — | `check-payment-status` TEST v49 / LIVE v92, `verify_jwt=false` preserved | TEST `cb2b8f1`→`01149a4`; LIVE `ba83e6f`→`314b644`; Vercel `dpl_47ng9mLqibgHTaLmxMG3rdaftixp` READY on pawtenant.com | 🔴 `toPublicOrder()` returned first/last name, **email**, price, coupon, plan, delivery, **letter_type (ESA vs PSD)**, provider, status, paid_at to callers with **NO credentials at all** (pre-existing since 2026-06-18 THANK-YOU-SOURCE-OF-TRUTH, identical on TEST). Now an allowlist of `{paid,paymentStatus,reconciled,nextStep,code,confirmationId}`; the orders SELECT no longer even READS PII columns. Unpaid/cancelled/unknown/stored-id responses are byte-identical (enumeration closed). Proven against a REAL production order. Guard 15/15 + 17/17 controls. Zero Stripe/Ads/GHL/email/SMS. `docs/CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001.md` | ✅ |
| **P0** | `ADMIN-ORDERS-KPI-CARD-LIST-PARITY-AND-MONTH-SEMANTICS-001` | Lead KPI card counted the all-time backlog instead of the month | TEST+LIVE | ✅ `LIVE COMPLETE` | BOTH | — | migration `20260801180000_admin_orders_monthly_lead_excludes_archived` (both envs) | TEST `52b1536`→`ecc60f3`; LIVE `4449a6e`→`4c96ba2`; Vercel `dpl_GVjuhKq7oSBL31bwKyR6UiQ22LnK` READY on pawtenant.com | 🔴 Lead displayed **1257** (every open lead ever) instead of **5** (this America/New_York month). Root cause = CLIENT MAPPING only — the RPC already returned the correct `leadUnpaid`; the card read `leadUnpaidCurrent`. 🔑 Lead is an ACQUISITION metric (resets monthly); Paid/Under Review/Pending Delivery are queue DEPTH (must stay 'now'); Completed stays monthly on `last_completed_at`. 🔑 Month-scoped cards now apply their month range on click so card↔tab reconcile. 🔴 The prior current-workload guard ASSERTED the wrong contract (all four cards 'now') — scope corrected, not bypassed; its MIG constant also pointed at a superseded migration. Guard 14/14 + 14 controls. `docs/ADMIN-ORDERS-KPI-CARD-LIST-PARITY-AND-MONTH-SEMANTICS-001.md` | ✅ |
| **P0** | `ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001` | Clickable operational KPI cards with exact count-to-list parity | TEST+LIVE | ✅ `LIVE COMPLETE` | BOTH | supersedes the KPI half of the task below | `orderFacetCounts.ts` (`fetchKpiCardCounts`, `KPI_CARD_BASIS`), Admin Orders banner/tabs/URL | TEST `2ecf8e8`→`429fe9d`; LIVE `7b82e51`→`1ae8d22`; Vercel `pawtenant-production-99b49avbk` (`dpl_8tFAnLXkRNLVBsuHbitPLtxhUMKd`) READY on pawtenant.com | 🔑 The previous task's display-only period-EVENT cards were the WRONG contract, and left the real defect: an EVENT card can never agree with a CURRENT-state tab. Named on LIVE: “Orders Paid”=3 (`PT-MS9TNN34`,`PT-MSANYT96`→Completed; `PT-MSAQI6SS`→Pending Delivery) vs **0** actual; “Entered PD”=4 vs **1**. 🔴 **Completed=7 was NEVER wrong** — all 7 completed on NY Aug 1; only 1 sat under the “Today” ribbon because ribbons group on the ACTIVE Date Basis, not the completion date. Cards are now CURRENT-STATE ∧ entered-in-window on each stage's own column. 🔑 **Parity is STRUCTURAL**: `fetchKpiCardCounts()` reuses the SAME `applyNonStatusFilters`+`applyBucket` pair as the list total, and the click applies a DERIVED effective window — `activeKpi` is the only state a card writes, so toggle-off/All clear it completely and no invisible date filter can survive. Verified TEST 28/4/9/2/11 and LIVE 20/0/0/0/9, each card's clicked list total == its count == SQL. 🔴 **Two defects only a real click found**: the prior task's sanitiser listed `kpi` as OBSOLETE and stripped it the instant a card wrote it (every selection deselected itself); and a direct `?kpi=` load was wiped because the URL-WRITER effect ran before the reader on mount. Guard 59/59 + **24/24** controls; 3 assertions TIGHTENED after their controls exposed them. **Frontend only — no SQL. Zero fixtures in either env.** `docs/ADMIN-ORDERS-CLICKABLE-KPI-CARD-COUNT-TO-LIST-PARITY-001.md` | ✅ |
| **P0** | `ADMIN-ORDERS-NEW-YORK-CLOCK-KPI-STABILITY-AND-STATUS-FILTER-INTEGRITY-001` | New York business clock, NY day grouping, display-only stable KPI cards, strict status tabs | TEST+LIVE | ✅ `LIVE COMPLETE` | BOTH | — | `businessTime.ts`, new `useBusinessClock.ts` + `BusinessClock.tsx`, Admin Orders banner/grouping/filters | TEST `cfebf56`→`10e9102`; LIVE `6dbcd0b`→`1555117`; Vercel `pawtenant-production-l8xwvf52y` (`dpl_Fr3XPJJnnqo7fR7bJ7xQiUe5wYtE`) READY on pawtenant.com | 🔑 **Nine reported symptoms, TWO defects.** (1) The five KPI cards were `<button onClick>` mutating `statusFilter`/`dateBasis`/`dateFrom`/`dateTo` — a highlighted “Paid (Unassigned)” card had set `statusFilter="all"`, so it listed Under Review + Completed rows; month-scoped cards set From+To ⇒ the invisible **“Filters (2)”**; setting a range flipped all five cards into the *other* KPI universe ⇒ the flicker. (2) Today/Yesterday used `toDateString()` = the **browser** day (~9h ahead from Karachi). 🔴 **The status predicates were never wrong** — measured before touching anything: **every** cross-tab overlap = 0 on BOTH envs (TEST 585, LIVE all non-archived), 0 leads with a payment ⇒ `orderClassification.ts` left UNCHANGED. Now ONE period-event semantics over ONE normalized NY window; cards are `<div>`, no handler/role/tabIndex, `cursor-default`. Values never reset while fetching (skeleton = first load only). All 10 tabs match the DB exactly on both envs. **Frontend only — no SQL, no migration, no edge fn.** New guard 54/54 + **16/16** planted controls; 2 controls exposed weak assertions which were TIGHTENED not accommodated (a fixed-24h rollover passed a “is it mentioned” check; comment-stripping was missing). TEST fixtures `PT-TEST-NYCLOCK-01/02/03` cleaned by **exact row id + confirmation_id**, 0 side-effect rows, 585/587 baseline restored; **zero LIVE fixtures**. `docs/ADMIN-ORDERS-NEW-YORK-CLOCK-KPI-STABILITY-AND-STATUS-FILTER-INTEGRITY-001.md` | ✅ |
| — | `ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001` + `…-LIVE-ROLLOUT-001` | Expiring order-bound resume credential; kill confirmation-ID access to order PII | TEST + LIVE | ✅ `LIVE COMPLETE` | — | none — closed | LIVE fns `issue-resume-token` v1, `exchange-resume-token` v1 (**jwt=false**), `issue-resume-link` v1, `get-resume-order` v103, `send-checkout-recovery` v96, `send-templated-email` v27 (**jwt=false**), `ghl-send-sms` v85 (**jwt=false**), `lead-followup-sequence` v85 (**jwt=false**), `broadcast-email` v92, `manual-run-lead-followup-sequence` v22; migrations `20260801170000` + `20260801190000` | TEST `05a00fd`→`849b48e`; LIVE `67337bc`→`504e9bb`; Vercel `pawtenant-production-nrf31pzxn` | 🔴 **PRODUCTION PII EXPOSURE CLOSED**: LIVE `get-resume-order` READ returned name/email/phone/price/package **and full `assessment_answers` (mental-health intake)** for ANY confirmation id + the public anon key. Now `{confirmation_id,status,already_paid}` only. 🔑 256-bit CSPRNG, sha256-only, order/purpose/environment-bound, single-use (**1 of 8 concurrent**), rate-limited; RLS deny-all verified with roles ACTUALLY ASSUMED (`set local role`), not inferred from grants. 🔴 **Browser QA on production caught a leak static review could not**: scrubbing `?rt=` in React is a RACE — nine third-party beacons (Google Ads/GA4/Facebook/Bing) carried the token, incl. GA4 `dr`. Fixed by a PRE-BOOT scrub in `index.html`; guard S28 asserts the ordering. **Ported back to TEST — the code was never safe there either.** ⚠️ `RESUME_TOKEN_ENVIRONMENT` was UNSET on LIVE (would mint every token as `test` and fail closed) — set to `live` BEFORE deploying token fns. `SITE_URL` moved to canonical non-www. ⚠️ `ghl-send-sms` + `lead-followup-sequence` are **jwt=false on LIVE but true on TEST** — deploying without `--no-verify-jwt` silently breaks both. 🔴 **Deviation**: fixture cleanup deleted **28 pre-existing audit rows** — the reserved pattern `PT-LIVE-PENDINGQA-%` is SHARED across LIVE QA tasks and the predicate was not scoped by `created_at`. No customer data affected (orders/earnings/comms hashes byte-identical). `docs/…-LIVE-ROLLOUT-001.md` (LIVE repo) | ✅ |
| **P0** | `CONTACT-SUBMISSION-ANON-EXPOSURE-LIVE-HOTFIX-001` | Close anon read/update on contact PII → LIVE | LIVE | ✅ `COMPLETE` | LIVE | — | `contact_submissions`, `contact_submission_replies` | **LIVE `f7425d5`**, deploy `dpl_CEuDE94cVhwKq7YXGEMGiPqRqaUg` READY | Done. anon denied at the GRANT layer; 88/71 rows + hashes preserved; `docs/CONTACT-SUBMISSION-ANON-EXPOSURE-LIVE-HOTFIX-001.md` | — |
| **P1** | `PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-001` | One current unapproved provider document per (order, doc class) | TEST | ✅ `TEST COMPLETE — LIVE PENDING` | TEST | — | `provider_submit_document_slot`, `uq_order_documents_one_current_unapproved`, `provider-submit-letter` v59 | 🔴 Fixes the LIVE QA defect: **two `pending_admin_approval` rows ⇒ two Approve & Deliver cards ⇒ two customer-visible letters**. 8-way + 6-way real concurrency proven; raw-INSERT bypass blocked by the index; fixture hashes reconcile | LIVE rollout — **run the historical conflict audit on LIVE FIRST**; the unique index will fail to create if any order already holds 2 unapproved docs | ✅ |
| P1 | `PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-LIVE-ROLLOUT-001` | Single-current-pending invariant → LIVE | LIVE | `QUEUED — READY` | LIVE | TEST complete ✅ | same as above | `docs/PROVIDER-DOCUMENT-SINGLE-CURRENT-PENDING-VERSION-001.md` §9 | Audit LIVE conflicts → explicit MCP SQL → deploy `--no-verify-jwt`. **Never blind-copy TEST→LIVE.** Keep the `PT-LIVE-PENDINGQA-*` GHL suppression | ❌ |
| — | `ADMIN-ORDER-PENDING-DELIVERY-LIVE-OPERATIONS-QA-004` | Pending Delivery LIVE operations QA | LIVE | 🛑 `OWNER-STOPPED / DEPRIORITIZED — CORE WORKFLOW VERIFIED, OPTIONAL CLOSURE QA CANCELLED` | LIVE | none — **no longer blocks the roadmap** | Admin Orders, order docs | **Verified and closed as core-complete:** correction → resubmit → re-approve end to end; RLS privacy (customer never sees the correction reason, before *and* after delivery; unrelated provider + anon see nothing); Customer View; Provider View; current-workload KPI regression; gate OFF/ON through the real Settings UI; realtime without Refresh; full fixture cleanup + preservation (6/6 guards). Last run LIVE `38e857a`, `dpl_FGZ9p22UjJe7PP6CLG9oJXBZjPJa`, **no code change** | 🛑 **Owner stopped 2026-08-01.** Cancelled, not deferred: notification deep links, stale-response/flicker matrix, five-width responsive matrix, full realtime matrix. **No further fixtures. Do not resume unless the owner explicitly reauthorizes.** Not to be recorded as LIVE COMPLETE. The known observation "Approve & Deliver does not refresh the acting tab's KPI aggregates (reload fixes)" stays documented in `docs/tasks/` and is **out of scope here**, except that the same aggregate architecture is re-examined by `MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001` where it affects month-end KPI correctness | — |
| **P0** | `PROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-001` | Delivered-submission replay must be a no-op | TEST | ✅ `TEST COMPLETE — LIVE PENDING` | TEST | — | `provider-submit-letter` v60 (`verify_jwt=false`), replay guard | 🔴 **Customer-delivery integrity.** A replay minted a 2nd verification id, overwrote `orders.letter_id`, re-injected the footer, added a 2nd version row and reset `doctor_status` — so a delivered order returned to Pending Delivery and public verification of the customer's actual PDF broke. Fixed by returning before every mutation. 14 replays incl. **8 concurrent** ⇒ zero row growth, zero storage residue | LIVE rollout below. TEST `3d3df9e`, `docs/PROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-001.md` | ✅ |
| **P0** | `MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001` | Canonical month-end payload, America/New_York KPI + report integrity | TEST | ✅ `TEST COMPLETE — LIVE ROLLOUT AWAITING OWNER APPROVAL` | TEST | — | `get_monthly_business_report(p_month)` v2, `get_admin_orders_range_event_kpis`, orders lifecycle-entry columns, `send-monthly-business-report`, Admin Orders KPI cards, cron jobid 13 (disabled) | 🔴 Root incident: the whole reporting stack was TEST-only and emailed TEST figures to the owner for 3 months; Monthly Books omitted ad spend (July overstated by exactly $9,909.17). Phase 2: ONE server-authoritative NY payload with to-the-cent internal reconciliation; acquisition/organic/traffic insights with explicit connection states (missing sync is never $0); executive email + 11-sheet workbook render the payload verbatim; custom-range period-event KPI cards reconcile with the list on business-day bounds; DST-safe cron v2 created DISABLED. Guards: new `check-month-end-canonical-payload` (7/7 plants) + 3 extended suites. `docs/MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-001.md` §13–§24; previews in `docs/report-previews/` | LIVE rollout below — owner approval required; TEST crons 10 + 13 stay disabled | ✅ |
| **P0** | `MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-LIVE-ROLLOUT-001` | Month-end reporting stack → LIVE (built new) | LIVE | ✅ `LIVE COMPLETE` | LIVE | — | LIVE `38e857a`→`e153f95`; migrations order_lifecycle_event_timestamps / admin_orders_current_workload_kpi_all_cards / month_end_report_stack_*; fn `send-monthly-business-report` (--no-verify-jwt); Vercel `dpl_7hg2rKjuZSL8ZNzkfsh8MvYmPpmQ` READY on pawtenant.com; cron jobid 16 ACTIVE ('0 6-13 1-5 * *') | 🔑 July 2026 = `skipped_owner_review`, `delivery_allowed=false` — TERMINAL (force cannot override); real-July invocation proven deliveryDisabled; first deliverable month = **August 2026** (Sept 1–5 window). Fresh July payload reconciles to the cent: $22,076 / 190 orders / operating net **$4,119.57**; preservation hashes byte-identical; zero QA fixtures created. `docs/MONTH-END-BUSINESS-TIMEZONE-KPI-REPORTING-INTEGRITY-LIVE-ROLLOUT-001.md` (LIVE repo) | To release July manually: flip `delivery_allowed` then force-send. Next queued task: `ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001` | — |
| **P0** | `PROVIDER-SUBMISSION-REPLAY-DELIVERED-STATE-IDEMPOTENCY-LIVE-ROLLOUT-001` | Replay no-op → LIVE | LIVE | `QUEUED — READY` | LIVE | TEST complete ✅ | `provider-submit-letter` v107 → v108 | Pure code deploy: the LIVE data-repair audit returned **0 corrupted rows**, so no correction is needed (re-confirm before deploying) | Port only the `if (isReplay)` early-return block; deploy `--no-verify-jwt`; re-run D/E/F on `PT-LIVE-PENDINGQA-*`. **Never blind-copy TEST→LIVE.** Then unblock QA-004 | ❌ |

### E.2 — Unified email and communications

| P | Task ID | Title | Lane | Status | Env | Dependency | Surfaces | Evidence | Next action | ∥ safe |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | `UNIFIED-EMAIL-CONVERSATION-DATA-MODEL-001` | Canonical email thread/message model + RLS + backfill | TEST | `TEST COMPLETE — LIVE PENDING` | TEST | — | `admin_email_threads`, `admin_email_messages`, `contact_submissions` | TEST `9a…` (see `docs/UNIFIED-EMAIL-SYSTEM-PHASE-1.md`) | LIVE rollout after the LIVE lane frees | ✅ |
| **P1** | `TEST-SUPPRESSION-COVER-CONTACT-SENDERS-001` | `contact-submit`/`contact-reply` ignore TEST suppression | TEST | ✅ `COMPLETE` | TEST | — | `contact-submit` v33, `contact-reply` v33, `_shared/testNotificationSuppression.ts` | Provider-side proof: **0 Resend calls** from a 4-op matrix that previously sent 3 | Done. Hard TEST-project block; `docs/TEST-SUPPRESSION-COVER-CONTACT-SENDERS-001.md`. ⚠️ TEST and production share ONE Resend account | ✅ |
| P1 | `EMAIL-INBOUND-THREADING-AND-RECONCILIATION-001` | Real inbound provider ingestion + `Message-ID`/`References` threading | TEST | `QUEUED — DEPENDENCY` | TEST | data model | Resend inbound webhook, `resend-webhook` | **No inbound email provider is connected today.** Phase 1 threads only first-party submissions/replies | Connect Resend inbound (or IMAP) and route to `email_thread_ingest` | ✅ |
| P1 | `CUSTOMER-EMAIL-MULTI-REPLY-THREAD-001` | Customer can reply repeatedly in-portal | TEST | `TEST COMPLETE — LIVE PENDING` | TEST | data model | `MyConversationsCard`, my-orders | Phase 1 doc §7 | ⚠️ One gap: the card was **not** rendered in a live customer session (password login; no account created). Verify in a real customer session | ✅ |
| P2 | `EMAIL-COMPOSER-REPLY-FORWARD-ATTACHMENTS-001` | Reply-all, forward, attachments, signatures | TEST | `QUEUED — DEPENDENCY` | TEST | data model | Admin Email tab, `EmailHubPanel` | — | Out of Phase 1 scope by design | ✅ |
| P1 | `EMAIL-NOTIFICATIONS-IN-ADMIN-BELL-001` | Email groups in the live bell + thread deep-link | TEST | `TEST COMPLETE — LIVE PENDING` | TEST | data model | `get_company_notifications`, `CompanyNotificationsBell` | dead `communications` arm replaced; verified in an authenticated session | LIVE rollout with the rest of Phase 1 | ✅ |
| P2 | `EMAIL-ASSIGNMENT-SLA-INTERNAL-NOTES-001` | Assignment, SLA timers, internal-only notes | TEST | `QUEUED — DEPENDENCY` | TEST | data model | Admin Email tab | schema fields landed in Phase 1, no UI | — | ✅ |
| P2 | `EMAIL-DELIVERY-BOUNCE-FAILURE-RECONCILIATION-001` | Bounce/complaint/delivery reconciliation | TEST | `QUEUED — DEPENDENCY` | TEST | data model + inbound | `resend-webhook` | `resend-webhook` exists; not thread-aware | Map Resend delivery events onto `admin_email_messages.status` | ✅ |
| P3 | `AI-SUPPORT-EMAIL-DRAFTS-001` | AI-drafted email replies (draft-only) | TEST | `QUEUED — DEPENDENCY` | TEST | composer | `ai-send-support-reply`, AI Support Center | AI chat is draft-only by policy | Never auto-send. Human approves every draft | ✅ |
| P3 | `UNIFIED-COMMUNICATIONS-SEARCH-EXPORT-AND-RETENTION-001` | Cross-channel search, export, retention | TEST | `QUEUED — DEPENDENCY` | TEST | email + dialer | Command Center | — | — | ✅ |

### E.3 — Dialer and calls

| P | Task ID | Title | Lane | Status | Env | Dependency | Surfaces | Evidence | Next action | ∥ safe |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 | `ADMIN-DIALER-CLICK-TO-CALL-FOUNDATION-001` | Click-to-call foundation | TEST | `QUEUED — DEPENDENCY` | TEST | email model stable | `GlobalDialpad`, `CallCustomerModal`, `twilio-voice-token` | partial scaffolding exists | **Do not start until the canonical email thread model is stable** | ✅ |
| P2 | `GHL-CALL-CAPTURE-AND-ORDER-LINKING-001` | GHL call capture → order linking | TEST | `QUEUED — DEPENDENCY` | TEST | dialer | `ghl-call-inbound`, `ai-ghl-missed-call-webhook` | `docs/tasks/2026-07-08-ghl-call-capture-and-reconcile-cadence.md` | — | ✅ |
| P2 | `ADMIN-ACTIVE-CALL-CONTROLS-001` | In-call controls | TEST | `QUEUED — DEPENDENCY` | TEST | dialer | `IncomingCallBanner` | — | — | ✅ |
| P3 | `CALL-DISPOSITION-NOTES-AND-FOLLOWUP-001` | Disposition + follow-up | TEST | `QUEUED — DEPENDENCY` | TEST | dialer | Command Center | — | — | ✅ |
| P3 | `CALL-RECORDING-TRANSCRIPTION-CONSENT-001` | Recording, transcription, consent | TEST | `QUEUED — DEPENDENCY` | TEST | dialer | `twilio-recording-callback` | consent is a legal gate | Requires a written consent policy before build | ✅ |

### E.4 — Notification and command center

| P | Task ID | Title | Lane | Status | Env | Dependency | Surfaces | Evidence | Next action | ∥ safe |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 | `NOTIFICATION-CENTER-V2-EMAIL-CALL-HR-001` | Bell v2 across email/call/HR | TEST | `QUEUED — DEPENDENCY` | TEST | email bell + dialer | `get_company_notifications` | Phase 1 adds the email arms | Also fix: `mark_company_notifications_read(null)` enumerates a **hardcoded group array** that already omits `order_pending_delivery` and `order_correction`, so "Mark all read" silently misses them | ⚠️ shares the RPC |
| P2 | `COMMAND-CENTER-PERMISSIONS-LIVE-FIX-001` | Command Center permissions → LIVE | LIVE | `TEST COMPLETE — LIVE PENDING` | LIVE | LIVE lane free | `CommandCenterPanel`, `adminPermissions` | `ai-support-command-center-parity` | — | ❌ |

### E.5 — HR and Company OS

| P | Task ID | Title | Lane | Status | Env | Dependency | Surfaces | Evidence | Next action | ∥ safe |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 | `HR-OFFBOARDING-PAYROLL-LIVE-ROLLOUT-001` | Offboarding + prorated payroll → LIVE | HR | `BLOCKED` | LIVE | LIVE lane free | HR tables, payroll fns | 🔴 **ROLLED BACK on LIVE** | Re-land **migration + frontend together**; `CREATE OR REPLACE` on a dropped fn re-adds the anon grant | ❌ |
| P2 | `HR-EMPLOYEE-PROFILES-COMPENSATION-RBAC-001` | Employee profiles + comp RBAC | HR | `QUEUED — DEPENDENCY` | TEST | offboarding | `TeamTab` | — | — | ✅ |
| P2 | `HR-LEAVE-SHIFTS-ATTENDANCE-APPROVALS-001` | Leave / shifts / attendance approvals | HR | `QUEUED — READY` | TEST | — | attendance | `d99666d` coverage + nightly recompute landed | Build the approval surface on the existing coverage spine | ✅ |
| P2 | `HR-PAYROLL-BONUSES-COMMISSIONS-001` | Bonuses + commissions | HR | `QUEUED — DEPENDENCY` | TEST | payroll LIVE | `send-payroll-summary-email` | — | — | ✅ |
| P3 | `HR-PERFORMANCE-DISCIPLINE-AND-REVIEWS-001` | Performance / discipline / reviews | HR | `QUEUED — DEPENDENCY` | TEST | profiles | `TeamTab` | — | — | ✅ |
| P2 | `SUPPORT-TICKETING-EMPLOYEE-PERFORMANCE-001` | Ticketing + per-employee performance | HR | `QUEUED — DEPENDENCY` | TEST | email assignment | Communications | — | Ticketing rides on `EMAIL-ASSIGNMENT-SLA-INTERNAL-NOTES-001` — do not fork a second thread model | ✅ |
| P2 | `HR-ATTENDANCE-COVERAGE-AND-NIGHTLY-RECOMPUTE-001` | Attendance coverage + nightly recompute | HR | `TEST COMPLETE — LIVE PENDING` | TEST | — | attendance | TEST `d99666d` | 📌 **PINNED #2** — trusted coverage is DECLARED, never derived | ✅ |

### E.6 — Customer, provider, order, document

| P | Task ID | Title | Lane | Status | Env | Dependency | Surfaces | Evidence | Next action | ∥ safe |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 | `ORDER-NOTARY-SERVICE-WORKFLOW-001` | Notary service workflow | TEST | `QUEUED — READY` | TEST | — | orders, documents, checkout | — | Needs a pricing decision from the owner first | ✅ |
| P2 | `CUSTOMER-PORTAL-DUAL-LETTER-DOWNLOAD-001` | Dual-letter download | TEST | `QUEUED — READY` | TEST | — | `MyDocumentsCard` | — | **Explicitly out of scope for this task** | ✅ |
| P2 | `ORDER-DOCUMENT-STORAGE-DELETE-CASCADE-001` | Storage delete cascade | TEST | `QUEUED — READY` | TEST | — | storage buckets | 🔴 `supabase storage rm` silently no-ops; `letters` has **no DELETE policy** | Add DELETE policies, then cascade | ✅ |
| P3 | `PROVIDER-PORTAL-MOBILE-TAB-OVERFLOW-001` | Provider Portal mobile tab overflow | TEST | `QUEUED — READY` | TEST | — | provider-portal | — | **Explicitly out of scope for this task** | ✅ |
| P1 | `ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001` | Secure resume token + PII confidentiality | TEST | `QUEUED — READY` | TEST | — | `get-resume-order` | 🔴 `get-resume-order` is **anon-key reachable**; body is attacker-controlled | Replace the guessable resume path with a server-minted single-use token | ✅ |
| P2 | `ADMIN-ORDER-DELETE-REPAIR-001` | Admin order delete repair | TEST | `QUEUED — READY` | TEST | — | Admin Orders | — | — | ✅ |

### E.7 — Finance, Ads, SEO, operational

| P | Task ID | Title | Lane | Status | Env | Dependency | Surfaces | Evidence | Next action | ∥ safe |
|---|---|---|---|---|---|---|---|---|---|---|
| P2 | `ACCOUNTS-RECONCILIATION-UX-PHASE-B-001` | Accounts reconciliation UX phase B | ADS | `QUEUED — READY` | TEST | — | `AccountsTab` | LIVE `0dced86` phase A | **Label rule: two formulas never share a label** | ✅ |
| P2 | `GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001` | Refund-adjustment consumer (canary → full) | ADS | `BLOCKED` | LIVE | reporting window | `sync-google-ads-conversions` | LIVE `bab140f`; 1 retraction accepted ($99) | 🔴 **Wait for the reporting window before the remaining 6 — a retraction cannot be undone** | ⚠️ |
| P2 | `SEO-AEO-EXECUTION-PLAN-V1-1-001` | SEO/AEO execution plan v1.1 | ADS | `ACTIVE — TEST` | TEST | — | content, schema, prerender | TEST `ece1a18` | 📌 **PINNED #1** — only roadmap is `docs/PAWTENANT_SEO_AI_SEO_EXECUTION_PLAN.md`; the workspace-root v1.0 is **stale**. `/esa-letter-housing` is **NOINDEX by policy** | ✅ |
| P4 | `PAWTENANT-GOOGLE-ADS-INVESTOR-REPORT-001` | Google Ads investor report | ADS | `QUEUED — READY` | n/a | — | reporting | real CPA $69.02; "All conv." triple-counts | 📌 **PINNED #6** — report **real** CPA, never the triple-counted figure | ✅ |
| P4 | `PAWTENANT-AD-CREATIVE-PRODUCTION-001` | Ad creatives | ADS | `QUEUED — READY` | n/a | — | creative assets | — | 📌 **PINNED #8** | ✅ |
| P4 | `PAWTENANT-SAAS-PRODUCTIZATION-AUDIT-001` | SaaS productization audit | ZEEK | `INFORMATIONAL / REFERENCE` | n/a | — | `docs/saas-productization-audit.md` | doc exists | 📌 **PINNED #9** — feeds the Zeek lane; no app-repo implementation | ✅ |
| P4 | `PAWTENANT-MASTER-KNOWLEDGE-BASE-001` | Master Knowledge Base | TEST | `INFORMATIONAL / REFERENCE` | n/a | — | `PAWTENANT_CURRENT_STATE.md` (1185 ln), `PAWTENANT_ACTIVE_TASKS.md` (889 ln) | both exist | 📌 **PINNED #5** — the KB is these two docs plus this queue. **No third registry.** | ✅ |
| P2 | `ADMIN-ORDER-EXPORT-PROVIDER-NET-001` | Provider payment in Admin Orders export | ADS | `COMPLETE` | TEST+LIVE | — | Admin Orders CSV | TEST `6c646f7` / LIVE `6a5c9b4` | 📌 **PINNED #3** — done, retained for history | ✅ |
| P0→ | `ADMIN-ORDERS-DATASET-FLICKER-P0-001` | Admin Orders dataset flicker | TEST | `BLOCKED` | LIVE | — | Admin Orders loader | TEST `d7a7b89`; 🔴 **LIVE reverted `119b948`** | 📌 **PINNED #4** — atomic backfill was too slow at LIVE scale. **Fix = in-flight guard, not atomic backfill.** | ✅ |

### E.8 — Zeek lane (separate repo/product — never implement inside the PawTenant app repo)

| P | Task ID | Title | Lane | Status | Env | Dependency | Evidence | Next action | ∥ safe |
|---|---|---|---|---|---|---|---|---|---|
| P4 | `ZEEK-GOOGLE-ADS-OPERATIONS-AGENT-001` | Zeek Engine Google Ads Operations Agent | ZEEK | `INTAKE — NOT YET SCHEDULED` | Zeek | PawTenant Ads guardrails | 📌 **PINNED #10**; `docs/PAWTENANT_TO_ZEEK_ENGINES_SAAS_EXTRACTION_PLAN.md` | Keep out of the PawTenant repo | ✅ |
| P4 | `ZEEK-PHASE-2B-STEP-1-GATED-EDIT-PIPELINE-001` | Phase 2B step 1 — gated edit pipeline | ZEEK | `INTAKE — NOT YET SCHEDULED` | Zeek | agent | 📌 **PINNED #11** | Gated = human approves every write | ✅ |
| P4 | `ZEEK-WORKFLOW-ORCHESTRATION-001` | Zeek Engine workflow orchestration | ZEEK | `INTAKE — NOT YET SCHEDULED` | Zeek | 2B step 1 | 📌 **PINNED #12**; `docs/company-os-multi-brand-saas-architecture.md` | — | ✅ |

### E.9 — COMPLETE (retained for history, do not reopen)

| Task | Env | Evidence |
|---|---|---|
| Additional Pet upgrade workflow + $30 pricing + eligibility + gating | LIVE | `075546f`, `c91edf2` |
| Additional Pet refund hardening / function drift reconciliation | TEST | `a75d288`, `80dfd75` |
| Order entitlement snapshot writer | TEST | `771acb8` |
| Entitlement + document versioning foundation | TEST | `9c69099` |
| Provider-document Admin approval gate | LIVE | `2ee6610` |
| Document correction / resubmission → Under Review | TEST | `b12cfc1` |
| Provider reassignment rejection-note privacy | LIVE | `1ce5a32` |
| Provider headshot object-key de-identification | LIVE | `a16f3a6` |
| Admin "Preview as Provider" | TEST+LIVE | `ab853dc` / `492df02` |
| Accounts Channel Contribution breakdown | TEST+LIVE | `ccc7d46` / `74ecf82` |
| Accounts reconciliation bridge + financial-flow UX | LIVE | `0dced86` |
| Customer-document notification bypass closure (4th bypass) | LIVE | `ca092e0` |
| 30-day reopen LIVE audit | TEST | `0bf2659` |
| Pending Delivery workflow + toggle + reopen + realtime | TEST | `b12cfc1` |
| Portal role-projection / approval-gate RBAC QA closure | TEST | `280a72e`, `d576309` |
| TEST notification suppression | TEST | `69ec1d8` |
| Resume-payment authority hardening | TEST | `701b78a` |
| Google Ads brand exact-defense reactivation | LIVE | campaign `23648138802`, AI Max OFF |
| Admin Orders lifecycle date semantics | TEST+LIVE | `3994b41` / `ea76ce2` |
| Admin Orders monthly KPI banner | TEST+LIVE | `4f4febc` / `60bf61e` |
| LIVE public pages + provider visibility | LIVE | `047e910` |
| SEO breadcrumb + PSD/ESA condition cluster | LIVE | `5055028`, `12a9fdb` |
| Checkout pricing stability + unification | LIVE | `265bf37` |

---

## F. Parallel-execution map

| Lane | Owns | Must not touch |
|---|---|---|
| **1. LIVE rollout** | `pawtenant-live-backup`, LIVE Supabase `cvwbozlbbmrjxznknouq`, LIVE Vercel | Anything in `pawtenant-test` |
| **2. TEST product dev** | `pawtenant-test`, TEST Supabase `opudhofjbydrljgleofq`, TEST Vercel | Any LIVE surface |
| **3. Ads / SEO / reporting** | Google Ads API, GSC, `docs/PAWTENANT_SEO_AI_SEO_EXECUTION_PLAN.md`, `src/pages/**` content | Order/payment/comms logic |
| **4. HR / Company OS** | HR tables, `TeamTab`, payroll fns, attendance | Orders, Stripe, comms |
| **5. Zeek** | Zeek repo, extraction/architecture docs | The PawTenant application repo entirely |

### Known file/system overlaps — coordinate before editing

| Surface | Contended by | Rule |
|---|---|---|
| `get_company_notifications()` | Unified email · Pending Delivery LIVE · Notification Center v2 | Its `RETURNS TABLE` signature must stay **byte-identical**. A `DROP`+`CREATE` re-adds the default `anon EXECUTE` grant. Body-only `CREATE OR REPLACE`. |
| `CompanyNotificationsBell.tsx` | Unified email · Pending Delivery LIVE | Additive group keys only. Never remove an existing arm. |
| `OrderDetailModal.tsx` **FROZEN** | Almost every order task | Surgical hunks + tracker row. Never blanket-copy. |
| `AnalyticsTab.tsx` **FROZEN** | Analytics + Accounts | TEST/LIVE diverge **by design**. |
| `communications` table | SMS · calls · email · Command Center | `type`/`direction` are the classifier. Do not add a parallel log. |
| `contact_submissions` | Unified email · Contact form | Phase 1 keeps it as the **source-of-record**; threads reference it, never replace it. |
| `order_workflow_state(orders)` | Pending Delivery (both envs) | **THE** workflow classifier. Extend it; never add a parallel status column. |

---

## G. Next 20 execution tasks (frozen order)

| # | Task ID | Lane | Why here |
|---|---|---|---|
| 1 | `ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001` | LIVE | In flight; owns the LIVE lane |
| 2 | `UNIFIED-EMAIL-CONVERSATION-DATA-MODEL-001` | TEST | In flight (this task); unblocks the whole comms tree |
| 3 | `CUSTOMER-EMAIL-MULTI-REPLY-THREAD-001` | TEST | Ships with #2 — the actual owner-reported pain |
| 4 | `EMAIL-NOTIFICATIONS-IN-ADMIN-BELL-001` | TEST | Ships with #2; the current `email` bell group is dead |
| 5 | `CONTACT-SUBMISSION-ANON-EXPOSURE-LIVE-HOTFIX-001` | LIVE | **P0** — first thing into the LIVE lane once #1 releases it |
| 5b | `TEST-SUPPRESSION-COVER-CONTACT-SENDERS-001` | TEST | Small but urgent: TEST QA can currently email `hello@pawtenant.com` for real |
| 6 | `ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001` | LIVE | Payment-authority hardening; reconciler first |
| 7 | `ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001` | TEST | Closes the anon-reachable resume surface at the root |
| 8 | `EMAIL-INBOUND-THREADING-AND-RECONCILIATION-001` | TEST | Real inbound mail; needs a provider connection |
| 9 | `EMAIL-COMPOSER-REPLY-FORWARD-ATTACHMENTS-001` | TEST | Makes the mailbox operationally complete |
| 10 | `EMAIL-DELIVERY-BOUNCE-FAILURE-RECONCILIATION-001` | TEST | Honest delivery state |
| 11 | `EMAIL-ASSIGNMENT-SLA-INTERNAL-NOTES-001` | TEST | Prerequisite for ticketing |
| 12 | `ADMIN-DIALER-CLICK-TO-CALL-FOUNDATION-001` | TEST | Unlocked once the thread model is stable |
| 13 | `GHL-CALL-CAPTURE-AND-ORDER-LINKING-001` | TEST | Calls become linked history |
| 14 | `ADMIN-ACTIVE-CALL-CONTROLS-001` | TEST | Completes the call lifecycle |
| 15 | `HR-OFFBOARDING-PAYROLL-LIVE-ROLLOUT-001` | HR | Re-land after the rollback; migration + frontend together |
| 16 | `SUPPORT-TICKETING-EMPLOYEE-PERFORMANCE-001` | HR | Rides on #11 |
| 17 | `ADMIN-ORDERS-DATASET-FLICKER-P0-001` | TEST | Re-fix via in-flight guard |
| 18 | `ORDER-DOCUMENT-STORAGE-DELETE-CASCADE-001` | TEST | Storage DELETE policies |
| 19 | `CUSTOMER-PORTAL-DUAL-LETTER-DOWNLOAD-001` | TEST | Customer-visible improvement |
| 20 | `PROVIDER-PORTAL-MOBILE-TAB-OVERFLOW-001` | TEST | Small, high-visibility polish |

Everything else — notary, accounts phase B, ads reporting, creatives, SaaS audit, Zeek — runs in
its own lane or waits behind #20.

---

## H. Intake rule

New ideas are recorded as `INTAKE — NOT YET SCHEDULED` and **do not** displace active P1/P2 work.

An intake item may jump the queue only when it:

1. is explicitly reprioritized by the owner; **or**
2. is a P0 security / payment / privacy / customer-delivery incident; **or**
3. blocks the currently active task; **or**
4. is required for a safe deployment.

Anything else waits for its slot in §G.

---

## I. Pinned-source reconciliation

| # | Pinned item | Canonical location | Queue entry | Status |
|---|---|---|---|---|
| 1 | SEO/AEO execution plan v1.1 | `docs/PAWTENANT_SEO_AI_SEO_EXECUTION_PLAN.md` | `SEO-AEO-EXECUTION-PLAN-V1-1-001` | `ACTIVE — TEST` |
| 2 | Attendance coverage nightly recompute | `docs/tasks/HR-ATTENDANCE-COVERAGE-AND-NIGHTLY-RECOMPUTE-001.md` | same ID | `TEST COMPLETE — LIVE PENDING` |
| 3 | Provider payment Admin Orders export | `docs/admin-order-export-provider-net.md` | `ADMIN-ORDER-EXPORT-PROVIDER-NET-001` | `COMPLETE` |
| 4 | Admin Orders dataset flicker P0 | `docs/admin-orders-dataset-flicker-fix.md` | `ADMIN-ORDERS-DATASET-FLICKER-P0-001` | `BLOCKED` (LIVE reverted) |
| 5 | PawTenant Master Knowledge Base | `docs/PAWTENANT_CURRENT_STATE.md` + `docs/PAWTENANT_ACTIVE_TASKS.md` | `PAWTENANT-MASTER-KNOWLEDGE-BASE-001` | `INFORMATIONAL / REFERENCE` |
| 6 | Google Ads investor report | `docs/google-ads-performance-search-terms-landing-pages-audit-2026-07.md` | `PAWTENANT-GOOGLE-ADS-INVESTOR-REPORT-001` | `QUEUED — READY` |
| 7 | HR operations redesign | `docs/tasks/2026-07-10-hr-team-operations-admin-ui-implement.md` + HR-* rows | `HR-*` family (§E.5) | mixed |
| 8 | PawTenant ad creatives | `docs/meta-landing-heygen-video-plan.md` | `PAWTENANT-AD-CREATIVE-PRODUCTION-001` | `QUEUED — READY` |
| 9 | SaaS productization audit | `docs/saas-productization-audit.md` | `PAWTENANT-SAAS-PRODUCTIZATION-AUDIT-001` | `INFORMATIONAL / REFERENCE` |
| 10 | Zeek Google Ads Operations Agent | `docs/PAWTENANT_TO_ZEEK_ENGINES_SAAS_EXTRACTION_PLAN.md` | `ZEEK-GOOGLE-ADS-OPERATIONS-AGENT-001` | `INTAKE` |
| 11 | Zeek Phase 2B step 1 gated edit pipeline | same extraction plan | `ZEEK-PHASE-2B-STEP-1-GATED-EDIT-PIPELINE-001` | `INTAKE` |
| 12 | Zeek Engine workflow orchestration | `docs/company-os-multi-brand-saas-architecture.md` | `ZEEK-WORKFLOW-ORCHESTRATION-001` | `INTAKE` |

**All 12 pinned items are represented.** Items 7 and 8 did not exist under their pinned titles;
they are mapped to the nearest canonical repository document rather than duplicated under a new ID.

---

## J. Queue totals at consolidation (`701b78a`)

| Status | Count |
|---|---|
| `COMPLETE` | 23 |
| `ACTIVE — TEST` | 4 |
| `ACTIVE — LIVE` | 1 |
| `TEST COMPLETE — LIVE PENDING` | 4 |
| `QUEUED — READY` | 9 |
| `QUEUED — DEPENDENCY` | 14 |
| `BLOCKED` | 3 |
| `DEFERRED` | 0 |
| `INTAKE — NOT YET SCHEDULED` | 3 |
| `INFORMATIONAL / REFERENCE` | 2 |
| **Total tracked** | **63** |
