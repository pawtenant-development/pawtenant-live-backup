# PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 — Production Activation Package

**Status: PREPARED, NOT EXECUTED.** Nothing in this document is authorized to
run against LIVE (`cvwbozlbbmrjxznknouq` / pawtenant.com) until the owner
gives explicit written approval for each step marked ⛔. TEST references:
Supabase `opudhofjbydrljgleofq`, repo `pawtenant-test`.

## 1. Exact TEST commits to promote

Promote the partner platform as a unit (cherry-picking a slice apart from its
guards is not supported):

| Slice | TEST commit |
|---|---|
| 1–2 schema/security + partner API | `186b4e3`, `37d7109` |
| 3 workspace + modal segregation | `50a4efc`, `97107ca`, `3d50248`, `3903745` |
| 4 neutral assessment PDF | `1c2d838` |
| 5 document/QR/verification isolation | `8204a99` |
| 6 comms + earnings isolation | `c34229b`, `90b56e5` |
| 6-closure PSD unmapped-version block | `8360e65` |
| 7 PSD contract + finance ledger | `4579b0c` |
| 8 docs/webhooks/revisions/invoices/disclosure | (this slice's commit — see final report) |

LIVE currently carries unrelated Admin Orders KPI work at `431c2d9e`; the
partner promotion must be REBASED onto LIVE's HEAD at activation time, never
the reverse. The two MERGE-FROZEN mega-files are not touched by any partner
slice.

## 2. Migration ordering (apply via explicit MCP SQL — never `db push`)

1. `20260818183659_partner_clinical_fulfillment_foundation.sql`
2. `20260820160000_partner_document_verification_isolation.sql`
3. `20260820170000_psd_partner_unmapped_version_honest_block.sql`
4. `20260821100000_partner_psd_contract_snapshots.sql`
5. `20260821110000_partner_finance_ledger.sql`
6. `20260821140000_partner_document_releases.sql`
7. `20260821150000_partner_status_webhooks.sql`
8. `20260821160000_partner_assessment_revisions.sql`
9. `20260821170000_partner_invoice_documents.sql`

Notes: LIVE's admin predicate is `check_is_admin()` on some legacy surfaces
but the partner stack uses `is_chat_admin()`, which EXISTS on LIVE and is
identical — port unmodified. After each migration: verify
`has_function_privilege` for anon/authenticated on every new function, and
RLS with `set local role` probes (service-role reads prove nothing).

## 3. Edge function deployment ordering + verify_jwt inventory

Deploy AFTER the migrations, in this order, reading each function's current
`verify_jwt` first and passing `--no-verify-jwt` exactly where required:

| Function | verify_jwt | flag |
|---|---|---|
| `partner-orders-v1` | false | `--no-verify-jwt` |
| `partner-webhook-dispatch` | false | `--no-verify-jwt` |
| `partner-invoice-pdf` | true | (none) |
| `assign-doctor` | false | `--no-verify-jwt` |
| plus the 18 Slice 6 comms-gated functions and the 4 Slice 5 document
  functions at their recorded values (see SLICE-6/SLICE-5 docs) | mixed | per inventory |

`partner-webhook-sandbox-sink` is **TEST-only and is NOT deployed to LIVE.**
`partner_webhook_sandbox_receipts` is not migrated to LIVE either (omit §6 of
the webhook migration or drop after apply).

## 4. Production rate-card plan ⛔

- Owner sets production wholesale prices (TEST sandbox values — ESA $55 v2,
  PSD $45 v1 — are NOT automatically the production prices).
- Insert `partner_rate_cards` rows with `environment='production'`, explicit
  `effective_from`; never edit sandbox rows.
- Acceptance-frozen pricing policy carries over unless the owner directs the
  completion-time alternative (one-line trigger change, documented in
  SLICE-7).

## 5. Production credential ceremony ⛔

1. Owner approves Rapid for production (`production_enabled=true` — the
   final switch; keep false until every other step is complete).
2. Generate a production key pair via the credential RPC; deliver key id +
   secret over the agreed secure channel; secret is never stored in clear,
   never in git, never in chat logs.
3. Confirm scopes: `orders:create, orders:read, documents:read`.
4. Record rotation contacts and the revocation SLA.

## 6. Webhook endpoint/secret exchange ⛔

1. Rapid nominates a production HTTPS endpoint (public host; no redirects).
2. Admin runs `partner_register_webhook_endpoint(partner, 'production', url,
   …)` — allowed only once `production_enabled=true`; the secret is returned
   once and handed over via the secure channel.
3. Rapid confirms signature verification (guide §5a: HMAC over raw bytes,
   constant-time compare, ±5 min window, event-id dedupe) against a
   `order.accepted` test event from a pilot order.
4. Schedule the dispatcher: pg_cron (or the platform scheduler) invoking
   `partner-webhook-dispatch` with the production `x-dispatch-secret`
   (create a NEW vault secret `partner_webhook_dispatch_secret` on LIVE —
   never copy TEST's) every minute. Respect the LIVE disk-IO/cron-retention
   budget when adding the schedule.

## 7. Rapid sandbox acceptance checklist ⛔ (gate before any production call)

Rapid must demonstrate, in sandbox, integration guide §8 cases 1–19 —
including document expiry re-fetch (14), revision replay (16),
revision-locked handling (18) and webhook signature + replay rejection (19).
PawTenant verifies from its side: audit rows for each case, zero
customer-comms rows for partner orders, correct ledger provenance.

## 8. Provider disclosure acceptance ⛔

Owner (with clinical leadership) signs off the Part E disclosure texts
(assignment email block + portal notice) as the operational description of
the partner arrangement shown to providers. Any wording change is a normal
TEST-first edit; the no-economics rule is guard-enforced and not negotiable.

## 9. Invoice / remittance configuration ⛔

Replace the synthetic TEST remittance placeholder in `partner-invoice-pdf`
with the real remittance instructions (bank details) supplied by the owner —
a code change reviewed on TEST first. Confirm invoice numbering continues the
LIVE sequence (`PTINV-YYYY-NNNN`, sequence starts fresh on LIVE at 0001) and
that no automatic email/charging is enabled (none exists).

## 10. Monitoring & alerting

- `partner_webhook_deliveries` where `status='failed_terminal'` → daily admin
  surface (already visible in the Partner integration panel); consider an
  `audit_logs`-based alert (LIVE has no `system_errors` table —
  `logSystemError` is a silent no-op there).
- `partner_invoice_aging.is_overdue` — weekly finance review.
- Audit rows `action='document_retrieval', outcome<>'signed_url_issued'`
  spikes → integration problem or probing; review.
- Edge function error rates for `partner-orders-v1` /
  `partner-webhook-dispatch` via the platform dashboard.

## 11. Rollback steps

Application rollback: redeploy the prior LIVE commit; redeploy prior edge
function versions (each function's pre-deploy version must be recorded at
activation time); `verify_jwt` values restored per the inventory above.
Schema rollback: the partner schema is additive — leave tables in place
(they are inert without credentials/endpoints); disable intake by setting the
partner credential `status='revoked'` and `active=false` on all webhook
endpoints (two UPDATEs, reversible). NEVER drop tables holding accepted
clinical submissions or ledger rows.

## 12. Staged pilot limits ⛔

- Phase 1: `production_enabled=true`, rate limit 10/min, Rapid submits ≤5
  real orders; PawTenant manually verifies each end-to-end (intake →
  assignment → completion → billable event → document retrieval → webhook).
- Phase 2: ≤50 orders/week, first manual invoice cycle incl. PDF + payment
  reconciliation.
- Phase 3: limits lifted by owner sign-off.

## 13. Explicit owner approvals still required

1. Production wholesale prices (§4) and pricing-time policy re-confirmation.
2. Production credential issuance + `production_enabled` (§5).
3. Webhook production endpoint + secret exchange + cron schedule (§6).
4. Sandbox acceptance sign-off (§7).
5. Provider disclosure text (§8).
6. Real remittance details + invoice numbering (§9).
7. Whether invoice PDFs are exposed through the partner API (currently
   admin-only by design).
8. Whether ESA (generic-contract) orders get an API revision path (currently
   support-mediated by design).
9. LIVE promotion itself (§1–3) and each pilot phase gate (§12).
