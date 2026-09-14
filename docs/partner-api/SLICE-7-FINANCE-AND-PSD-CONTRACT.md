# PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 — Slice 7: Canonical PSD Contract + Finance Ledger

**Status:** TEST only. LIVE untouched. Production activation is a separate,
owner-approved step. Continues Slices 1–6 + the Slice 6 closure.

## 1. Canonical partner PSD intake

Contract `partner.assessment.psd.v1` = the retail `psd_v1` catalog verbatim
(16 required + 5 optional question ids). Enforced server-side in
`partner-orders-v1/validate.ts` against the LIVE `psd_assessment_questions`
registry (never a hardcoded list): required-completeness, catalog-only ids,
shape rules (`conditions`/`dogTasks` string arrays; other answers non-empty
strings ≤4000 chars), explicit refusal of eligibility-claim fields
(`eligible`, `approved`, `qualified`, `complete`, …), refusal of any other
schema version (including the generic `partner.assessment.v1`), and refusal
of duplicate JSON keys anywhere in the raw payload (scanner in `validate.ts`;
JSON.parse would silently collapse them). Nothing is ever inferred from the
generic fields — `primaryConcern`/`symptomDescription`/`durationOfSymptoms`
do not appear anywhere in the intake code (guard-asserted).

**Normalization provenance** (identity mapping, `norm.psd_v1.identity.1`):
- Canonical answer rows land under `psd_v1` / `source_step =
  'partner_api_normalized'` — the one canonical completion gate
  (`psd_assessment_status` → `psdCompletionGate`) evaluates them natively.
- `public.partner_assessment_snapshots` (one per order, UNIQUE, UPDATE
  refused by trigger): source/target schema versions, normalization version,
  source payload hash, accepted timestamp, partner org, external order ref,
  normalized question ids — ids only, never values.
- `private.partner_raw_submissions`: the accepted payload verbatim, in the
  Data-API-invisible private schema, UPDATE refused.
- Replay/retry: `partner_accept_order` returns the existing order before any
  write; same `partner_order_id` + different content → 409; an accepted
  snapshot is therefore unreplaceable. Revisions are support-mediated
  (documented in the integration guide) — never a silent overwrite.
- Mechanical completeness ≠ eligibility: a canonical payload with clinically
  non-qualifying content is ACCEPTED for provider review; no code path
  auto-qualifies or auto-rejects on content.

ESA intake is byte-identical to Slice 2 (generic contract, no normalization,
no answer gate at assignment). Direct PawTenant PSD is untouched (guarded).

## 2. Finance ledger

**Billing trigger — documented rule, not invented:** ARCHITECTURE-NOTE §7
fixes `clinical_work_completed` as the billable event (outcome-independent).
Implemented as a BEFORE UPDATE trigger on `orders` (partner origin +
`doctor_status → 'patient_notified'` transition) so every completion path —
notify-patient-letter's partner arm, admin actions, ad-hoc SQL — mints the
charge. Acceptance/assignment/approval/delivery are explicitly not triggers.

**Wholesale amount — deliberate, flagged divergence:** the Slice 7 brief said
"rate card effective at the billable timestamp"; the committed Slice 1 rule
freezes economics AT ACCEPTANCE (`partner_order_financials`, "editing the
rate card later can never rewrite this order's economics"). The acceptance
snapshot wins: the charge carries `wholesale_fee_cents` +
`rate_card_id`/`version` provenance from the frozen snapshot, which itself
was resolved from the ACTIVE database rate card at acceptance. Never
`orders.price` (NULL for partner orders), never a literal (guard-scanned).
**Owner may switch to completion-time pricing with a one-line trigger change.**

**Active TEST rate cards (sandbox, confirmed from data + owner records):**
ESA v2 **$55.00** (owner instruction 2026-08-20; v1 $45 closed), PSD v1
**$45.00** (original Slice 1–2 seed, unchanged by the owner).

**Ledger objects** (`20260821110000_partner_finance_ledger.sql`):
- `partner_billable_events` — append-only (UPDATE always refused; DELETE only
  under the explicit `app.fixture_cleanup` session flag for TEST hygiene).
  One charge per order (partial unique). Credits are NEW rows
  (`event_kind='credit'`, negative amount, `related_event_id`); double-credit
  refused; originals never mutated. ESA and PSD stay separate per event
  (`service`); additional services would be distinct `event_type`s (none yet).
- `partner_invoices` — manual, admin-created. `draft → issued →
  partially_paid → paid`, void from draft/issued/partially_paid (reason
  required). Financial identity freezes at issue (trigger + no authenticated
  UPDATE grant — two layers). Stable numbers `PTINV-YYYY-NNNN`. Overdue is
  DERIVED in `partner_invoice_aging` (security_invoker view), never stored.
- `partner_invoice_lines` — immutable snapshots of event amounts; draft-only
  membership; an event may sit on at most one NON-void invoice
  (trigger-enforced), so voiding an invoice releases its events for
  re-billing.
- `partner_invoice_payments` — append-only manual reconciliation entries
  (negative rows are explicit corrections); status recomputed by the RPC.
- Write path = five SECURITY DEFINER RPCs (`partner_create_draft_invoice`,
  `partner_issue_invoice`, `partner_void_invoice`,
  `partner_record_invoice_payment`, `partner_credit_billable_event`), each
  internally gated on `is_chat_admin()`; cross-partner events are refused in
  the draft RPC. No automated ACH/card/QuickBooks/provider payments exist.

**Money separation (unchanged invariants):** receivable = this ledger;
provider pay = `doctor_earnings.doctor_amount` from `per_order_rate`
(the finance migration references no earnings object — guard-asserted);
margin lives in `partner_order_financials`; `orders.price` stays NULL.

## 3. Authorization / RLS matrix

| Surface | admin (`is_chat_admin`) | other authenticated (incl. providers) | anon | service_role |
|---|---|---|---|---|
| billable events / invoices / lines / payments / aging / snapshots | SELECT | 0 rows (forced RLS) | permission denied | full (RPC/trigger paths) |
| invoice RPCs | execute | `42501 admin access required` | `42501` | execute |
| raw submissions (private schema) | — (no Data API path) | — | — | full |
| finance UI (`PartnerFinancePanel`) | Partner Orders workspace only | — | — | — |

Provider portal references none of `partner_billable_events` /
`partner_invoice*` / `wholesale_fee_cents` / `partner_rate_cards`
(guard-asserted). Partner customers receive nothing (Slice 6 suppression
unchanged, re-verified).

## 4. Admin workflow (PartnerFinancePanel, in the Partner Orders tab)

Order finance roll-up (partner org + external ref, PSD intake truthfulness —
"Canonical (psd_v1)" vs "Unsupported intake — unassignable" from the snapshot
record, billable state, wholesale, invoice linkage), unbilled-events →
create-draft, and the invoice table with Issue / Record payment / Void
actions plus overdue badges. All writes go through the guarded RPCs; the
panel holds no financial logic.

## 5. Documentation

[`openapi.yaml`](./openapi.yaml) (machine contract, synthetic examples,
sandbox-only) + [`rapid-esa-letter-integration.md`](./rapid-esa-letter-integration.md)
(auth, rotation, idempotency/retries, PSD contract, lifecycle, PHI rules,
sandbox test cases, escalation). Honest gaps stated in-doc: no webhooks yet
(pull-only status), document retrieval by API not yet offered, revision
endpoint planned (support-mediated meanwhile).

## 6. Remaining production/compliance decisions (owner)

1. Acceptance-time vs completion-time wholesale pricing (current: acceptance —
   see §2 flag).
2. Production rate card values + production credential issuance + Rapid
   production activation (`production_enabled`).
3. Partner document-retrieval API + webhook/HMAC design.
4. API-mediated clinical revision workflow.
5. Provider agreement disclosure for partner-labelled work (carried from
   Slice 3 blocker list).
6. Invoice PDF/branding + remittance details for real invoices (ledger is
   ready; rendering is not built).
