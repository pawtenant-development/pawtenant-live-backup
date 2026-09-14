# Partner Platform — Multi-partner management & manual PDF order intake

Task: **PARTNER-MULTI-BRAND-MANUAL-PDF-ORDER-INGESTION-001** · TEST only · 2026-09-11

## What this adds

PawTenant works with more than one partner brand (Rapid ESA Letter, SignMyESA,
and any future partner). A partner is a **row** in `partner_organizations`,
never a branch in code. Until a partner completes its API integration, an
admin can create partner orders **manually** from the paid-order PDF the
partner sends. The manual path and the API path converge on the same
canonical acceptance function, so the resulting order is an ordinary partner
order for every downstream system (assignment, consultation, documents,
completion, billing).

## Partner profile (Settings › Partner profile)

Per partner: display / legal name, unique slug, **domain** (display and
verification only — never attribution), **status** (draft → sandbox ⇄ paused;
archived; `active` = production-approved, an owner decision), **production
enabled** (read-only here; activation is a separate LIVE rollout), **intake
mode** (`manual` / `api` / `both`), communication policy, document-delivery
policy, support owner, allowed services and states.

Server: `partner_admin_update_profile(p_partner_id, p_patch jsonb)` —
allowlisted keys, `is_chat_admin()` gate, audit `partner_admin_profile_updated`
(field names only).

## Agreed per-order charge (rates)

`partner_admin_set_rate(p_partner_id, p_service, p_environment, p_amount_cents,
p_effective_from, p_notes)` closes the open rate card (`effective_to`) and
inserts `version + 1`. It **never edits an amount in place**. Accepted orders
carry their own immutable `partner_order_financials` snapshot and issued
invoices are frozen, so a rate change can never re-price history. Full history
is shown in Settings › Agreed per-order charge.

## Manual intake flow (Partner Platform › Orders › New Partner Order)

| Step | What happens | Where |
|---|---|---|
| 1 Partner | Only partners whose profile allows manual intake are offered | wizard |
| 2 Upload | Multipart upload to `partner-manual-intake?action=upload`. Validated by CONTENT (`%PDF-` header, `%%EOF` trailer, pdf-lib parse, encryption refusal, page count, active-content scan, ≤ 10 MB configurable, ≤ 15 MB hard/bucket cap). Stored in the **private** `partner-intake` bucket under `<partner_id>/<draft_id>.pdf`. Duplicate sha256 for the same partner → `409 duplicate_pdf`. | edge fn |
| 3 Extraction | Text layer via `unpdf`; per-page text stored in `private.partner_intake_page_text` (service-role RPCs only). Parser (`extract.ts`) produces fields with **page / method / confidence / warnings**, pets, Q/A pairs. No text layer → `ocr_required`; the admin's **browser** renders pages (pdfjs-dist) and OCRs them (tesseract.js) locally and posts only the text (`action=ocr_text`). `action=reparse` retries without re-upload. | edge fn + browser |
| 4 Review | Every field is editable; low-confidence values amber, missing required values red; ESA/PSD contradiction must be resolved by a human with a recorded note; PSD uses the canonical `psd_v1` questionnaire; consents are explicit admin attestations. `action=review` runs the **partner API's own validator** (`validateOrderRequest`) and stores issues. Optimistic concurrency via `review_version`. | wizard + edge fn |
| 5 Confirm | Shows what will be created and the current partner rate (display only). `action=commit`: atomic claim `reviewed → committing`, idempotency key `manual:<draft_id>`, re-validation, then `public.partner_accept_order(..., p_intake_method := 'manual')`. Replay returns the original order; failure releases the claim. | edge fn |

Draft states: `uploaded → extraction_pending → (ocr_required | extraction_failed | review_required) → reviewed → committing → committed`, or `cancelled` (source PDF and page text purged; row kept for audit).

## Canonical order

`partner_accept_order` (rewritten from its own definition, +`p_intake_method`)
stamps `orders.partner_intake_method` (frozen with the other partner snapshot
columns), sets `order_origin='partner'`, `paid_at`, no `payment_intent_id`,
`price = NULL`, materialises `assessment_answers`, snapshots policies and the
rate (`partner_order_financials`), and writes the idempotency ledger. The
order enters the normal paid/unassigned provider workflow.

## Visibility

* **Admin** — partner chip + intake method (Orders tab, intake list, order
  detail chip), external order id, source PDF (signed URL, 300 s), extraction
  record, snapshotted charge (Finance), Partner Contribution (Accounts), audit.
* **Provider** — the generic `Partner Case` label only. No partner name,
  domain, external id, charge, margin or invoice state (RLS + projection +
  guard).
* **Assessment PDF** — internal audience (admin + provider portals) is always
  the neutral `ESA Assessment` / `PSD Assessment` document with the PawTenant
  case reference; the customer portal keeps its historical output.

## Accounts › Partner Contribution

`get_partner_contribution_summary(p_from, p_to)` (admin-only, NY calendar):
one row per recognised partner charge (`clinical_work_completed`), with
`net = charge − provider payout (doctor_earnings) − approved credits`, plus
invoice/payment state. Separate section; never touches the Stripe bridge,
Channel Contribution, Marketing or closed periods.

## Audit

`partner_intake_*` actions in `audit_logs` (category `partner_intake`):
uploaded, extraction started/completed/failed, ocr received, admin corrected
(field NAMES only), draft confirmed, order created, financial snapshot
created, duplicate refused, source viewed, commit failed, draft cancelled;
`partner_contribution_recognized` from the completion trigger;
`partner_admin_profile_updated` / `partner_admin_rate_set` from the RPCs.
Metadata never carries page text, answers, contact details, secrets or
wholesale amounts (enforced in `partner_intake_audit`).

## Guard

`scripts/check-partner-manual-intake.mjs` — 42 checks, 21 planted controls
(`npm run check:partner-manual-intake` / `npm run test:partner-manual-intake`),
in the build chain after the workspace guard. `check-partner-assessment-pdf.mjs`
was rewritten for the audience contract (31 checks, 17 controls).

## Fixtures / TEST-only notes

* SignMyESA (`signmyesa`, `signmyesa.com`, intake `manual`, sandbox) is a TEST
  partner record with **placeholder** $45 ESA / $45 PSD sandbox rates pending
  the owner's agreed charge.
* OCR assets (tesseract core/worker/lang) load from the library defaults at
  runtime; page images never leave the admin's browser.
* No actual SignMyESA paid-order PDF was available; the parser was validated
  on representative synthetic PDFs (see the task record).
