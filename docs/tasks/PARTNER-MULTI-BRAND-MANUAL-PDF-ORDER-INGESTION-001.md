# PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001 — task record

**Status: COMPLETE on TEST · LIVE untouched · awaiting `Approve LIVE rollout of PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001.`**
Date: 2026-09-11 · Runbook: `docs/partner-api/MANUAL-PDF-INTAKE.md`

## Preflight
| Item | Value |
|---|---|
| TEST main at start | `8c086a7` (local was 7 behind; fast-forwarded before any edit) |
| Concurrent work observed | Another session pushed `24faac0`, `e953847` (planner marketing) into this tree while I worked and created eight `fixture.test` direct orders on TEST. No file overlap; left untouched and unstaged. |
| Type-check baseline | 8 pre-existing errors (AIAssistantTrustCard, AdminProviderContactPanel, EmployeeHrDirectory ×5, ProviderInternalRecords) — unchanged after. |
| Deployed partner fns vs repo | `partner-orders-v1` v5, `partner-webhook-dispatch` v1, `partner-webhook-sandbox-sink` v1, `partner-invoice-pdf` v1 — all byte-identical (LF-normalised) to the repo before work. |
| TEST Vercel before | `dpl_ngKcYWPWykob4g7yCTi1C3uf5yqw` |
| DB baseline | orders 616 · audit_logs 2914 · auth.users 60 · doctor_earnings 102 · communications 961 · partner_organizations 1 (Rapid) · partner_rate_cards 3 · partner-intake bucket did not exist |
| Rollback point | `e953847` (commit before this task's first commit) |

## What already existed (reused, not rebuilt)
`partner_organizations`, `partner_rate_cards` (versioned, one open card), `partner_accept_order()` (single acceptance transaction), `partner_order_financials` immutable snapshot, billable/invoice ledger + `partner_invoice_aging`, PSD canonical contract validator (`partner-orders-v1/validate.ts`), comms/document gates, webhooks outbox, `partner_admin_*` management RPCs, the five-sub-tab Partner Platform workspace, the neutral assessment renderer (`assessmentUtils.ts`), `is_chat_admin()` gate, RLS discipline, the multipart-drain lesson from the planner upload.

## What was added / repaired
* **Migration** `20260911120000_partner_multi_brand_manual_pdf_intake.sql` (applied via MCP `apply_migration`; ledger version aligned to `20260911120000`; the page-text RPCs and the `on delete restrict` FK were applied afterwards with `execute_sql` and are in the file — the ledger `statements` column therefore holds the original applied text, not the final file; a LIVE rollout must apply the repo file once).
* **Edge function** `partner-manual-intake` v1→**v5** (`verify_jwt=true`; user JWT + `is_chat_admin()` probe; refuses anon/service bearers; drains before every early refusal). Files: `index.ts`, `extract.ts`, `payload.ts`, `_shared/pdfSafety.ts`.
* **UI**: `PartnerManualIntake.tsx` (drafts list + 5-step wizard, browser OCR via `pdfOcr.ts`), `PartnerProfilePanel.tsx` (domain / intake mode / policies / services / states / rates + history), `PartnerContributionPanel.tsx` (Accounts), `headerAction` slot + intake label in `PartnerOrdersTab.tsx`, workspace + settings mounts, `shared.tsx` profile fields, `AccountsSectionNav` "Partner Contribution", one `PaymentsTab` mount, `partner_intake_method` in `types.ts` + `page.tsx` projection.
* **Assessment PDF**: `buildPrintHTML(order, ctx?, audience = "internal")` — internal (admin + provider) is always the neutral `ESA Assessment` / `PSD Assessment` with the PawTenant case reference and never the partner's external id; `AssessmentCard.tsx` (customer portal) passes `"customer"` and keeps its historical output. Letters, QR copies, sample letters, partner document releases and invoice PDFs are untouched (guard G29).
* **Guards**: `check-partner-manual-intake.mjs` (42 checks, **21/21** planted controls) added to the build chain + `REQUIRED_GUARDS`; `check-partner-assessment-pdf.mjs` rewritten for the audience contract (31 checks, **17/17** controls).
* **Deps**: `pdfjs-dist@4.10.38`, `tesseract.js@5.1.1` (lazy chunks; OCR assets from library defaults).
* **Fixtures**: SignMyESA org (`signmyesa`, `signmyesa.com`, intake `manual`, sandbox, placeholder rates) created through the admin RPCs under the QA admin identity.

## Extraction defects found and fixed during QA
1. `private` schema is not exposed through the Data API — page text was silently not stored → replaced with service-role RPCs (`partner_intake_store/read/purge_page_text`).
2. External order id regex stopped at "Order" (captured "Number:SME-…") → longest-label regex.
3. A document title "Order Receipt" was captured as external id "Receipt" → a reference must contain a digit; title words excluded.
4. A colliding external id hit the unique index during the extraction/review write → collisions are REPORTED as issues, never written.
5. `committed_order_id` was `on delete set null`, which the committed-consistency check refused during order deletion → `on delete restrict` (a committed draft never loses its order).

## Proof
* **API/role matrix** (`scratchpad/intake-matrix.mjs`, synthetic `.test` fixtures): **73/74** programmatic checks passed; the one "failure" was the harness reading `assessment_answers` over REST (that table has no admin read policy) — verified by SQL instead: ESA 6 answers `partner_api`, PSD 16/16 required under `psd_v1` / `partner_api_normalized`, `psd_assessment_status` complete. Covered: roles (no JWT, anon key, provider 403, RLS zero rows for drafts/economics/orgs/contribution, provider cannot set rates), corrupt / non-PDF / encrypted / oversized / api-only-partner refusals, text extraction with provenance, low-confidence flags, commit-before-review refused, missing email blocked, stale review 409, concurrent commit → one order, replay returns the same order, one canonical order (origin partner, intake manual, paid_at, no PI, price null, is_test), no attribution mutation, snapshot at the partner's rate, no earning/communication at acceptance, duplicate PDF under another filename, duplicate external id at review, multi-pet, cross-partner same external id allowed and priced at ITS rate ($60), rate change v1→v2 with old snapshot unchanged and new order at v2, missing pets, cancel + no source, ESA/PSD contradiction fail-closed until a resolution note, image-only → `ocr_required` → OCR text → review, reparse without re-upload, signed URL 300 s, PSD non-canonical keys refused / missing required question named / eligibility-claim refused / canonical accepted → snapshot revision 1, audit actions present, no PII in audit metadata.
* **API parity**: minted a sandbox key for the second synthetic partner, POST `partner-orders-v1/orders` → 201 `PT-3A9D46628E`, replay 200 `idempotent_replay`, status route `ready_for_assignment`, order stamped `partner_intake_method='api'`, key revoked → 401.
* **Webhooks**: eight outbox events (`order.accepted`, …) were emitted for fixture orders with no endpoints registered; dispatcher untouched (v1).
* **Browser QA** (in-app browser, QA admin `qa-admin-claude@pawtenant.test`, alias `https://pawtenant-test.vercel.app`, deployment `dpl_DG6VPyBx7P4HVqj9HtUBEuX7y1F5`): Orders sub-tab with chips + MANUAL labels; New Partner Order → SignMyESA → duplicate PDF refused with "Open existing order"; fresh PDF → extraction → review (provenance badges, amber low-confidence state 70% / age 80%, red missing) → Save & continue blocked by `consent_missing` → consents attested → Confirm ($52.00 rate v2 shown, disclosures) → `PT-2928C1155F` created (one order; audit chain of 8 actions) → Open order shows Partner Order · SignMyESA · Partner funded · "Payment collected by SignMyESA" · no payment repair → provider assigned through the normal control (QA Provider, TX-licensed; assignment email suppressed for `.test`; customer contact refused by policy ×2; canonical $30 pending earning, `order_amount` null). Settings: created a fourth partner through the UI (`qa-intake-partner-three`), set domain + intake Manual, recorded a $55 ESA rate; history shown; audit attributed to the QA admin. Accounts › Partner Contribution: SignMyESA $52.00 − $30.00 − $0.00 = **$22.00**, "Billable · not invoiced", company bridge unchanged ($0 Stripe). Provider portal (`ra-qa-provider@pawtenant-qa.test`): "Partner Case" label + neutral disclosure, NO SignMyESA / external id / amounts anywhere on list, detail or Earnings ($30 only). Responsive 390 / 768 / 1440: no horizontal overflow, wizard 390 / 721 px, table scrolls in its container. Neutral documents rendered from the deployed source: `ESA Assessment` / `PSD Assessment` with Case Reference, zero brand tokens. Console: only pre-existing login-page 404/401, a blocked Meta pixel, and the expected 409 duplicate.
* **Screenshots**: captured for the Orders tab (1440 and 390), wizard steps (partner, duplicate refusal, review, confirm, created), order modal with chips, and the neutral ESA document; later captures failed because the Browser pane was hidden — those states are text-verified above.
* **Build**: `npm run build` locally stops at step 64 (`check-provider-document-approval-gate` A21) on a **local CRLF artifact only** (the guard reads the file raw; the working copy of `my-orders/page.tsx` is CRLF; LF-normalised it passes) — the 51 remaining steps were run individually: **51/51 pass**; Vercel (LF) built the same commit READY.

## Side effects
Communications: one provider assignment email row (`.test`, suppressed). Earnings: one pending $30 provider earning from the pre-existing assign path (deleted with the fixture). Stripe: none. Tracking/attribution: none. LIVE: none.

## Fixture teardown (inspect → delete)
Deleted: 7 fixture orders (+dependents: answers, financials, billable event, snapshot, raw submission, api requests, lifecycle events, earning, communication), 9 drafts (+page text), 6 storage objects via the Storage API, 8 webhook outbox rows, 73 `partner_intake` audit rows + 20 order-linked + 8 platform rows of the two synthetic partners, the parity API key, and the two synthetic partner orgs with their rate cards. **Retained on purpose**: SignMyESA org, its 3 rate cards (ESA v1 $45 closed, ESA v2 $52 open — changed by the matrix, PSD v1 $45) and its 6 platform audit rows — pending the owner's decision. Restored: orders 616 = baseline, auth.users 60, doctor_earnings 102, communications 961, api_credentials 1, partner-intake objects 0, no orphans; audit_logs 2921 = 2914 + 6 SignMyESA rows + 1 row not from this task.

## Owner decisions still open
1. SignMyESA agreed per-order charge (placeholder $45 PSD / $52 ESA sandbox).
2. Keep the SignMyESA TEST record and its audit rows, or remove.
3. Whether Net Partner Contribution should also feed Operating Net (kept separate by spec).
4. Self-host tesseract/pdfjs OCR assets instead of the library CDN defaults.
5. Validation against a real SignMyESA paid-order PDF (none was available; representative synthetic PDFs used).
6. LIVE rollout: `Approve LIVE rollout of PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001.`
