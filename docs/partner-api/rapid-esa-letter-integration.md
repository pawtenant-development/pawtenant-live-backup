# PawTenant Partner API — Sandbox Integration Guide (Rapid ESA Letter)

**Environment: SANDBOX/TEST only.** Production activation is a separate,
owner-approved onboarding step with separate credentials. Every value in this
guide is synthetic. Machine contract: [`openapi.yaml`](./openapi.yaml).

## 1. Authentication & credential rotation

Every request carries two headers over TLS:

```
X-Partner-Key-Id: pk_sandbox_EXAMPLEONLY
X-Partner-Secret: <secret issued at onboarding>
```

Secrets are verified inside the database against a SHA-256 digest; PawTenant
cannot read your secret back and never logs it. **Rotation:** request a new
key pair → cut your traffic over → confirm → PawTenant revokes the old key id
(revocation is immediate; there is no grace period, so complete cutover
first). A revoked or expired credential returns `401 unauthenticated` with no
further detail — treat repeated 401s as a rotation/credential problem, not a
retry case.

Sandbox credentials cannot transact in production (`environment` is bound to
the credential and the partner org's `production_enabled` flag).

## 2. Idempotency & retries

- `Idempotency-Key` header is **required** on every create.
- Same key + byte-identical payload (canonical JSON — key order does not
  matter) → the original outcome is replayed (`200`,
  `idempotent_replay: true`). Safe to retry on timeouts and 5xx.
- Same key + different payload → `409 idempotency_conflict`. Never reuse keys.
- Same `partner_order_id` + different content (any key) →
  `409 partner_order_conflict`. An accepted order — and its accepted clinical
  submission — is **never silently replaced**.
- Retry guidance: network error / 5xx → retry with the SAME key, exponential
  backoff, max ~6 attempts. Any 4xx → do not retry unchanged; fix and submit
  with a NEW key. `429 rate_limited` → wait for the window (per-credential
  requests/minute; the limit is stated on your credential sheet).
- Duplicate JSON keys anywhere in a payload are refused
  (`422 schema_violation`) — a duplicated clinical answer would otherwise be
  silently collapsed by JSON parsing.

## 3. ESA orders

`service: "esa"` with `assessment.schema_version: "partner.assessment.v1"` and
a free-form `answers` summary (≥1 entry). See the `esa` example in the
OpenAPI file. ESA intake is operational context; it is not used for clinical
eligibility scoring.

## 4. PSD orders — the canonical clinical contract

PSD is psychiatric-service-dog clinical work. A PSD order is accepted **only**
under:

```
assessment.schema_version: "partner.assessment.psd.v1"
```

with `answers` containing **all 16 required canonical questions** (list and
shapes in the OpenAPI `PsdAssessment` schema; 5 further optional questions are
accepted). Validation is strict and fails closed:

| Submission problem | Response |
|---|---|
| any other schema_version (incl. `partner.assessment.v1`) | `422 assessment_schema_unsupported` |
| missing required question / empty or malformed answer | `422 assessment_incomplete` (question ids listed by name) |
| unknown question id | `422 schema_violation` |
| any eligibility-claim field (`eligible`, `approved`, `qualified`, `complete`, …) | `422 schema_violation` — eligibility is determined solely by PawTenant clinicians |
| duplicate JSON keys | `422 schema_violation` |

On acceptance your answers are normalized onto PawTenant's canonical clinical
model (`psd_v1`, an identity mapping on question ids, normalization version
`norm.psd_v1.identity.1`). Your original payload is preserved verbatim and
immutably; the normalization provenance (source/target versions, payload
hash, timestamp) is recorded per order.

**Revisions (Slice 8):** `POST /orders/{partner_order_id}/revisions` with

```json
{ "revision_reason": "customer corrected medication history",
  "assessment": { "schema_version": "partner.assessment.psd.v1", "answers": { …all 16+… } } }
```

- The body is the **complete** canonical assessment, re-validated exactly like
  intake. Partial patches are refused — the server only materializes complete
  immutable snapshots.
- The accepted original is **never overwritten**: the new version is stored as
  revision N+1 linked to N, with its own payload hash and your stated reason;
  every prior version stays auditable.
- Allowed only while the order is accepted and **not yet assigned** to a
  provider, completed or cancelled. After assignment the API refuses with
  `409 revision_locked` — contact partner support for the administrative +
  clinical review path. ESA (generic-contract) orders are not API-revisable
  (`422 revision_unsupported_for_service`); use partner support.
- `Idempotency-Key` required; identical content can never create a duplicate
  version. A revision never approves, rejects or advances the order.
- Identity fields (customer, service, animals, payment) are not part of a
  revision; those changes are support-mediated.
- A resubmission of the same `partner_order_id` through the CREATE endpoint
  with different content remains refused (`409 partner_order_conflict`).

## 5. Order lifecycle & status retrieval

`GET /orders/{partner_order_id}` returns your order's `clinical_status`:

`received → ready_for_assignment → provider_review →
(consultation_required | correction_required)* → document_ready →
clinical_work_completed`, or `cancelled`.

- `clinical_work_completed` is the terminal billable state and is
  **independent of the clinical outcome** — a professionally completed
  evaluation that does not qualify is still completed work. Your
  `clinical_completed_at` timestamp populates at that transition.
- Status responses never include clinical answer content, provider identity
  economics or internal identifiers. `pawtenant_reference` (PT-…) is a display
  reference, never a credential.
- Poll politely (≥60s intervals) — or subscribe to **signed webhooks** (§5a),
  which make polling unnecessary for state changes.

### 5a. Signed status webhooks (Slice 8)

PawTenant can POST signed status events to an HTTPS endpoint you nominate at
onboarding (sandbox endpoints are exercised against PawTenant's controlled
sandbox receiver first). Event families:

`order.accepted`, `order.provider_assigned`,
`order.additional_information_required`, `order.correction_required`
(a submission returned for correction), `order.document_approved`,
`order.completed` (clinical work completed — the billable milestone),
`order.document_ready` (the partner-safe document is retrievable),
`order.cancelled`, `invoice.issued`, `invoice.paid`, `billing.credit_issued`.

Envelope: `{ event_id, event_type, event_version, partner_order_id,
pawtenant_reference, occurred_at, data }` — coarse status only; never
assessment content, clinical detail, customer contact fields, provider
identity or internal identifiers.

**Verify every delivery:**

1. Read headers `X-PawTenant-Event-Id`, `X-PawTenant-Event-Type`,
   `X-PawTenant-Timestamp` (unix seconds), `X-PawTenant-Signature`
   (`v1=<hex>`).
2. Recompute `HMAC_SHA256(endpoint_secret, timestamp + "." + raw_body)` over
   the RAW request bytes and compare to the signature **in constant time**.
3. Reject when `|now − timestamp|` exceeds 5 minutes (replay protection).
4. Deduplicate on `event_id`: automatic retries and manual redelivery reuse
   the SAME event id, so your processing must be idempotent per event.
5. Respond 2xx quickly. Non-2xx is retried with exponential backoff
   (~1m/5m/25m/~2h then 12h; 8 attempts) before terminal failure is surfaced
   to PawTenant admins.

The endpoint secret is issued exactly once at registration and is never
retrievable afterwards; report suspected compromise for rotation (new
endpoint + secret, old one disabled).

## 6. Documents & delivery

You own all customer communication and delivery. PawTenant produces neutral,
partner-safe clinical documents (no PawTenant branding, QR, or public
verification identity).

**Retrieval (Slice 8):** `GET /orders/{partner_order_id}/document`
(scope `documents:read`) returns a **short-lived signed URL** (300 seconds)
for the current approved partner-safe release, plus its `sha256`, size and
content type. Semantics:

- Before approval/release: `409 document_not_ready` — wait for
  `order.document_ready` (or poll status) and retry.
- The URL expires; **never store it**. Repeat the GET for a fresh URL — the
  call is idempotent and rate-limited, and re-signs the same immutable
  release. There is no permanent document URL.
- Verify downloaded bytes against `sha256`. If a letter is corrected
  (superseded and re-approved), the endpoint serves the NEW current release —
  a changed `sha256` tells you to refresh your stored copy.
- The response never contains provider uploads, internal derivatives,
  verification IDs, QR artifacts, internal identifiers or storage paths of
  other systems — releases live in a partner-isolated store.

## 7. Privacy & PHI handling

- Assessment answers are clinical PHI: transmit only over TLS, only the
  contract fields. Error responses echo field NAMES, never values; PawTenant
  does not log raw answers in API/audit logs.
- **Never transmit payment card data.** Any card-shaped value anywhere in a
  payload refuses the whole request (`422 payment_credentials_rejected`).
  Your `payment.reference` must be an opaque reference, not an instrument.
- Customer identity fields are used solely for clinical fulfillment and are
  excluded from PawTenant marketing, retail analytics and ad platforms.
- PawTenant sends your customers nothing: no email, no SMS, no CRM sync.

## 8. Sandbox test cases

Run these before requesting production review (expected results in
parentheses; all live in the sandbox and cost nothing):

1. ESA happy path (`201`, then `200 idempotent_replay` on retry).
2. PSD canonical happy path (`201`; status reaches `provider_review` after
   PawTenant assigns in sandbox).
3. PSD with `partner.assessment.v1` (`422 assessment_schema_unsupported`).
4. PSD missing `safetyCheck` (`422 assessment_incomplete` naming it).
5. PSD with an invented question id (`422 schema_violation`).
6. PSD with `"eligible": "true"` (`422 schema_violation`).
7. Duplicate JSON key in answers (`422 schema_violation`).
8. Same key, altered payload (`409 idempotency_conflict`).
9. Same `partner_order_id`, altered payload, new key (`409 partner_order_conflict`).
10. Unpaid order (`payment.status` ≠ paid → `422 payment_not_paid`).
11. Unserviceable state (e.g. a state with no licensed provider →
    `422 no_provider_coverage` / `422 state_unsupported`).
12. `GET` a `partner_order_id` you never created (`404 not_found`).
13. Document before approval (`409 document_not_ready`).
14. Document after release (`200`; download within 300s; bytes match `sha256`;
    re-GET after expiry returns a fresh URL, same `sha256`).
15. Revision before assignment (`201`, `revision: 2`; original stays intact).
16. Revision replay — same key, same body (`200 idempotent_replay`).
17. Revision with a missing required question (`422 assessment_incomplete`).
18. Revision after provider assignment (`409 revision_locked`).
19. Webhook signature verification: recompute the HMAC over a received raw
    body and match `X-PawTenant-Signature`; replay the same body 10 minutes
    later and confirm your receiver rejects it on timestamp skew.

## 9. Support & escalation

Every response carries a `request_id`. For integration issues, send your
sandbox `key_id` (never the secret), the `request_id`, the `partner_order_id`
and the observed response code to the PawTenant partner-support channel
agreed at onboarding. Clinical revision requests follow §4. Suspected
credential compromise: report immediately; the key id is revoked and a
replacement issued.
