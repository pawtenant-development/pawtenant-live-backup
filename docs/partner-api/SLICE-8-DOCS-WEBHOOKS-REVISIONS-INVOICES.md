# PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 — Slice 8: Document Retrieval, Webhooks, Revisions, Invoice PDFs, Provider Disclosure

**Status:** TEST only. LIVE untouched. Production activation is a separate,
owner-approved step — see
[`PRODUCTION-ACTIVATION-CHECKLIST.md`](./PRODUCTION-ACTIVATION-CHECKLIST.md).
Continues Slices 1–7.

## 1. Secure partner document retrieval (Part A)

`GET /orders/{ref}/document` (scope `documents:read`, per-credential rate
limit, tenant predicate first).

**The release model:** the partner never receives a URL into PawTenant's
internal document store. Approval of a partner order's letter makes the order
*ready*; the partner's first fetch **mints a release** — the approved bytes
copied into the private `partner-documents` bucket under
`releases/{random-id}.{ext}` (no internal order id, partner id or customer
identity in the path). One release per source document (DB-unique,
`partner_document_releases`, append-only). The API signs **only** release
objects, for **300 seconds**, with a sanitized download filename (hostile
`partner_order_id` values cannot escape into the Content-Disposition header).

- Not approved / not deliverable / superseded → `409 document_not_ready`.
- Superseded + re-approved letter = new source document = new release; the
  endpoint always serves the CURRENT one (derived, never stored state).
- Belt: a partner order whose letter somehow carries a footer/QR/processed
  artifact (Slice 5 boundary breach) is refused outright and audited.
- Audit rows carry partner, reference, outcome and release id — never URLs,
  contents or PHI.

## 2. Signed outbound webhooks (Part B)

**Storage:** endpoints in `partner_webhook_endpoints` (admin-read RLS; HTTPS
check); secrets in `private.partner_webhook_endpoint_secrets` (Data-API
invisible, returned exactly once by `partner_register_webhook_endpoint`,
never readable afterwards).

**Outbox:** `partner_webhook_events` — immutable (UPDATE refused;
fixture-flag DELETE only); one row per logical event, idempotent creation via
`(partner_id, event_type, dedupe_key)`; the stored `payload` is byte-what-is
delivered. Built ONLY by `partner_emit_webhook_event` from an explicit field
allowlist: `event_id, event_type, event_version, partner_order_id,
pawtenant_reference, occurred_at, data{coarse status}`. No assessment
content, no customer contact fields, no provider identity, no internal UUIDs,
no wholesale margins, no credentials.

**Emitters (database triggers — every path emits, including ad-hoc SQL):**
order INSERT → `order.accepted`; order UPDATE → `order.provider_assigned`
(no provider identity), `order.additional_information_required`,
`order.correction_required` (the "rejected" family, truthfully named),
`order.completed` (clinical work completed), `order.cancelled`;
document approval → `order.document_approved`; release INSERT →
`order.document_ready`; invoice status → `invoice.issued` / `invoice.paid`;
credit INSERT → `billing.credit_issued`.

**Deliveries:** `partner_webhook_deliveries` — UNIQUE(event, endpoint); a
succeeded row is frozen by trigger (a second success is structurally
impossible); attempts appended to `partner_webhook_delivery_attempts`.
Claim discipline (`partner_webhook_claim_deliveries`, service-role only —
rows carry the signing secret): build → claim (`delivering`) → send → record
(`partner_webhook_record_attempt`). Failure releases the claim with
exponential backoff (60s·5^n capped 12h; terminal after 8); a crashed claim
is reclaimed after 10 minutes. Manual admin retry
(`partner_webhook_retry_delivery`) re-drives the EXISTING delivery only —
no outbox insert exists in that code path, and succeeded deliveries refuse.

**Dispatcher:** `partner-webhook-dispatch` (verify_jwt=false) — authorized by
the vault-verified `x-dispatch-secret`
(`verify_partner_webhook_cron_secret`, the payout-cron pattern) or an admin
JWT proven by a user-context `is_chat_admin()` capability probe (never a
service-key comparison). Send-time endpoint safety: HTTPS only, no
private/loopback hosts, redirects refused, and **sandbox traffic may only
reach the controlled sandbox receiver on this project's own functions host**
(`partner-webhook-sandbox-sink`, TEST-only, which records raw body +
signature headers into `partner_webhook_sandbox_receipts` so signatures are
verified independently of the dispatcher's code).

**Signature:** `X-PawTenant-Signature: v1=HEX(HMAC_SHA256(secret,
timestamp + "." + raw_body))` with `X-PawTenant-Timestamp` (unix seconds),
`X-PawTenant-Event-Id`, `X-PawTenant-Event-Type`. Rapid verifies over raw
bytes, constant-time compare, ±5 min timestamp window, dedupe on event_id
(documented in the integration guide §5a and OpenAPI `webhooks:`).

No cron schedule is created on TEST; dispatch runs are driven by the admin
panel button or the harness. The production schedule is part of the
activation package.

## 3. Immutable assessment revisions (Part C)

`POST /orders/{ref}/revisions` — complete canonical payload + explicit
`revision_reason` + `Idempotency-Key`, re-validated through the SAME
`validatePsdContractAssessment` the intake route uses (extracted in Slice 8 so
the two can never diverge). `partner_revise_assessment` (service-role-only
SECURITY DEFINER, one transaction):

- Tenant predicate lookup; fail-closed state gate (assigned / completed /
  cancelled → `revision_locked`; the documented path is then an
  administrative + clinical review via partner support).
- Canonical-contract orders only (`revision_unsupported_for_service` for ESA
  generic-contract orders — no canonical schema exists to re-validate; this
  is a deliberate scope decision flagged to the owner).
- Content-hash replay: identical content NEVER mints a duplicate version.
- Inserts snapshot revision N+1 (`prior_snapshot_id` → N, reason, new payload
  hash, question ids) and raw submission revision N+1 (verbatim, private
  schema). The existing immutability triggers are untouched — nothing ever
  UPDATEs a snapshot or raw row; "current" is derived as max(revision).
- Re-materializes `assessment_answers` from the complete new payload
  (upsert + removal of withdrawn optional canonical answers, partner-sourced
  rows only) and refreshes the order's legacy `assessment_answers` jsonb.
  The canonical completeness gate re-evaluates naturally. **No status column
  moves; nothing auto-approves or auto-rejects.**
- Schema change: `partner_assessment_snapshots` and
  `private.partner_raw_submissions` gained `revision` (existing rows = 1) and
  moved from UNIQUE(order) to UNIQUE(order, revision);
  `orders.partner_payload_hash` stays frozen at the ORIGINAL acceptance
  (trigger-enforced) — the create route's conflict semantics are unchanged.

Direct PawTenant assessment behaviour is untouched (no retail code path
reads or writes any of this).

## 4. Invoice / remittance PDFs (Part D)

`partner-invoice-pdf` (verify_jwt=true; caller must pass the user-context
`is_chat_admin()` capability probe). Renders **from the frozen snapshot
only** — `partner_invoices` (frozen at issue) + `partner_invoice_lines`
(immutable) + `partner_invoice_payments`; the ONLY orders columns touched are
`id, partner_order_id`. It reads **no rate card and recomputes nothing**.

- One artifact per (invoice, kind) in `partner_invoice_documents`
  (DB-unique, trigger-frozen) + the private `partner-invoices` bucket.
  Re-requests return the SAME artifact re-signed (600s TTL) — never a
  re-render. Drafts refuse (`409`).
- Voids: the original `invoice` artifact is never rewritten; a separate
  `void_notice` artifact renders the void date/reason. Credits appear as
  negative frozen lines on whichever invoice bills them.
- Content: invoice number, partner legal/display name, issue/due dates,
  service-level lines with the partner's own order references, qty, unit
  amount, credits, payments, balance, status, synthetic TEST remittance
  placeholders, and "not a payment request" footer. Never: customer
  name/contact, assessment detail, internal order UUIDs, provider
  compensation, margin.
- No automatic email exists. Admin-only retrieval; exposure through the
  partner API is an owner decision recorded in the activation package.

## 5. Provider disclosure (Part E)

Partner cases are labelled, never hidden, and the label is operational only:

- **Assignment email** (assign-doctor): the existing "Case Source: Partner
  Case" row plus a disclosure block — authorized-partner origin, PawTenant
  responsible for assignment/clinical workflow, customer-facing support
  handled by the partner, use the authenticated portal for clinical
  information. Rendered only when the policy resolver labels the order;
  direct assignment emails are byte-identical to before. No new PHI.
- **Provider portal**: a "Partner Case" chip + the same four-point notice on
  partner-origin order cards, gated on `order_origin === "partner" &&
  partner_id`. No wholesale rate, invoice state, margin or customer payment
  amount appears on any provider surface (guard-scanned).

## 6. Authorization / RLS matrix (new surfaces)

| Surface | admin (`is_chat_admin`) | provider / other authenticated | anon | service_role |
|---|---|---|---|---|
| document releases / webhook endpoints / events / deliveries / attempts / sandbox receipts / invoice documents / snapshots (rev chain) | SELECT | 0 rows (forced RLS) | permission denied | full |
| `partner_register_webhook_endpoint` / `partner_disable_webhook_endpoint` / `partner_webhook_retry_delivery` | execute | `42501 admin access required` | `42501` | execute |
| `partner_webhook_claim_deliveries` / `partner_webhook_record_attempt` / `partner_emit_webhook_event` / `partner_revise_assessment` / `verify_partner_webhook_cron_secret` | **denied** (secret-bearing / server-only) | denied | denied | execute |
| `private.partner_webhook_endpoint_secrets` | — (no Data API path) | — | — | full |
| partner API document/revision routes | — | — | — | partner credential + scope |

## 7. Files

Migrations: `20260821140000_partner_document_releases.sql`,
`20260821150000_partner_status_webhooks.sql`,
`20260821160000_partner_assessment_revisions.sql`,
`20260821170000_partner_invoice_documents.sql`.
Edge functions: `partner-orders-v1` (+`document.ts`, +`revise.ts`,
validate.ts contract extraction), `partner-webhook-dispatch` (new),
`partner-webhook-sandbox-sink` (new, TEST-only), `partner-invoice-pdf` (new),
`assign-doctor` (disclosure block).
Frontend: `PartnerIntegrationPanel.tsx` (new), `PartnerFinancePanel.tsx`
(PDF actions), `PartnerOrdersTab.tsx` (mount), `provider-portal/page.tsx`
(disclosure).
Guard: `scripts/check-partner-slice8-closure.mjs` (build-chained).
