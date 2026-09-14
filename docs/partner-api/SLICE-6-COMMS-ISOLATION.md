# PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 — Slice 6: Communication & Commercial-Data Isolation

**Status:** TEST only. LIVE untouched. Continues Slice 5 (`8204a99`).

## Canonical communication policy

The decision is always `_shared/partnerPolicy.ts` → `resolveOrderPolicy()` on the
order's own policy snapshot (`order_origin`, `partner_communication_policy`,
`partner_document_policy`) — never a partner name, email domain, filename or
frontend flag. `partner_communication_policy = 'partner_managed'` means the
partner owns every customer touchpoint: PawTenant sends the customer **nothing**
(email, SMS, GHL contact/workflow sync, payment links, review requests,
lifecycle/renewal mail, ad-platform identity pushes). Providers keep every
operational notification; admins keep operational alerts. Unknown or unreadable
classification **fails closed** (no contact). A partner configured
`pawtenant_managed` would keep customer comms — the policy decides, not the
origin.

Enforcement is server-side via `_shared/partnerCommsGate.ts`:
- `mayContactCustomerForOrder(client, {orderId|confirmationId})` — owns the DB
  read (callers cannot hand it an under-selected row; forged payloads cannot
  reclassify an order), refuses on partner_managed, missing policy, unknown
  origin, unreadable or missing order.
- `auditSuppressedCustomerContact(...)` — writes `audit_logs` with
  `action='partner_policy_suppressed'`, channel + event only, **no recipient,
  no body, no PHI**.
- A suppressed message is a policy outcome, never a delivery failure: no
  `communications` row is reserved or finalized for it, `email_log` gets no
  entry, and callers return success-shaped responses so nothing retries.

## Complete communication-emitter inventory

Audience: C = customer, P = provider, A = admin. Enforcement: **gate** =
`partnerCommsGate` call in the emitter; **predicate** = direct-only cohort
query; **sink** = covered by the ghl-webhook-proxy DB-re-read gate;
**structural** = cannot fire for a partner order by construction (reason given).

| Emitter | Audience/channel | Trigger | Partner behavior now | Enforcement |
|---|---|---|---|---|
| assign-doctor | C email, P email, P in-portal, GHL | admin/auto assignment | provider notified (labelled "Partner Case"); customer email + GHL suppressed + audited; earning `order_amount=NULL`, `doctor_amount=per_order_rate` | gate (in-row policy) + sink |
| ghl-webhook-proxy | GHL contact upsert + workflow | 15+ callers incl. browser | any order-scoped event re-read from DB; partner → `{ok:true, skipped:"partner_policy_suppressed"}` + audit, **before** the TEST-isolation skip | sink gate (fail closed on unknown order) |
| backfill-order-ghl | GHL (direct upsert + proxy) | admin backfill | refused + audited before any GHL call (would otherwise misread partner as unpaid lead) | gate |
| lead-followup-sequence (+ manual-run) | C email ×3 + C SMS | cron / admin | cohort `.eq(order_origin,'direct')` + per-lead belt | predicate |
| send-checkout-recovery | C email (pay link) | admin | 409 `partner_policy_suppressed` | gate |
| resend-confirmation-email | C email | webhook/client/admin/force | 409 refusal (covers force + retries) | gate |
| notify-order-status | C email + A fan-out | admin status change | customer branch suppressed; **admin fan-out still fires** | gate (customer branch only) |
| notify-patient-letter | C email + GHL + earning self-heal | doc approval / provider / admin | completion transition + earning (`order_amount=NULL`) still happen; **no** customer email, **no** `patient_notification_sent_at` (PawTenant did not notify the patient), no GHL; ok:true so the frozen modal shows no false failure | gate + sink |
| admin-review-document | P email (correction), GHL, chains notify-patient-letter | admin review | provider mail allowed; GHL covered by sink; customer chain covered inside notify-patient-letter | sink + downstream gate (no edit needed) |
| notify-thirty-day-customer | C email | 30-day reopen cron (pg_net) | `{ok:true, skipped}` so the DB caller never retries | gate |
| notify-thirty-day-reissue | P email only | same cron / admin | allowed (`mayNotifyInternalStaff`) | none needed (provider-facing) |
| send-renewal-reminders | C email | cron | cohort `.eq(order_origin,'direct')`; belt: partner orders no longer carry `patient_notification_sent_at` | predicate |
| send-templated-email | C email (any slug) | admin comms | 409 refusal when a confirmationId is supplied | gate |
| ghl-send-sms | C SMS | admin / AI sendViaGhl | 409 refusal when order-scoped | gate |
| send-review-request | C email + C SMS (Twilio) | admin review panel | 409 refusal (new order lookup — it never read the order before) | gate |
| send-new-esa-order-link | C email | admin | 409 refusal on partner parent order | gate |
| manage-custom-payment-request / create-custom-payment-request | C email (pay link) | admin | 409 refusal before any send (create- sends nothing itself) | gate |
| create-additional-doc-invoice | C email + Stripe checkout | portal/admin | 409 refusal before any Stripe object | gate |
| create-additional-pet-request | C email + Stripe checkout | portal/admin | 409 refusal before any request row | gate |
| completeAdditionalDocPayment / completeAdditionalPetPayment | C email | Stripe payment completion | structural: upstream creation now refused; requires a Stripe payment no partner order can have | structural |
| stripe-webhook (confirmation, receipt, portal welcome, RA request) | C email | Stripe events | structural: partner orders have no payment_intent/session; ⚠️ residual: `:255` email+NULL-PI fallback could match a partner row if the same person later buys direct — the chained confirmation send is gated inside resend-confirmation-email | structural + downstream gate |
| notify-customer-refund / create-refund / cancel-order | C email + GHL | refund flows | structural: no Stripe payment to refund; cancel-order sends nothing itself; GHL covered by sink | structural + sink |
| send-resume-checkout-email | C email | admin | structural: `already_paid` eligibility refusal (partner orders are created paid) | structural |
| broadcast-email / bulk-sms | C email / Twilio SMS | admin BroadcastModal | audiences filtered to `order_origin === 'direct'` in the modal (list + counts); recipients arrive as body payloads with no order linkage server-side | frontend predicate (see residuals) |
| send-meta-capi-event | Meta CAPI (hashed PII) | stripe-webhook / admin | sweep/retry cohorts structurally exclude (require PI); mode:single now refuses non-direct | predicate |
| send-meta-events / sync-google-ads / sync-microsoft-ads | ad platforms | cron/admin | structural: PI + gclid/msclkid + price all absent for partner orders (double/triple-gated) | structural |
| send-customer-otp / verify-customer-otp / password resets / create-customer-account | C email/SMS (auth) | customer-initiated | excluded: authentication is user-initiated identity mail, keyed on the person not the order; see residuals | documented exclusion |
| twilio-sms-webhook / ghl inbound / ai-handle-inbound-sms / ai-process-pending-sms / ai-send-support-reply | C SMS replies | customer-initiated inbound | excluded: replies to inbound support messages are conversation-scoped; order-scoped outbound goes through ghl-send-sms (gated). See residuals | documented exclusion + partial gate |
| contact-submit/contact-reply, newsletter, provider/admin identity mail (send-followup-email, notify-license-change, approve-provider-application, recruitment, payroll, payout reminders, health alerts, monthly report) | not order-customer-scoped | various | not customer-facing for an order, or internal/provider/applicant audiences | out of scope by audience |

## Provider earnings — meaning and safety decision

`doctor_earnings.order_amount` is a **retail order-value snapshot for the
admin-only EarningsPanel**; no payout, report, payroll or provider surface
computes from it. `doctor_amount` (the payout truth) always comes from
`doctor_profiles.per_order_rate` — a flat per-case rate with no service
dimension — via the existing resolver in all three writers (base, ra_completion,
additional_documentation). **Decision: the existing schema supports partner
compensation safely.** Partner base earnings are created by the same two
writers (assign-doctor, notify-patient-letter self-heal) with
`order_amount = NULL` enforced by policy (never `orders.price`, which is NULL
for partner orders by intake design, and never any rate-card value — no code
path reads `partner_rate_cards` into earnings; guarded). `doctor_earnings`
already carries `order_origin`/`partner_id` via the Slice 1 derive trigger.
Duplicates stay impossible via `doctor_earnings_base_conf_uniq`.
No Slice 7 finance ledger was implemented.

## Closure correction (2026-08-20): partner PSD workflow status — PROVEN UNASSIGNABLE

The original Slice 6 report was contradictory: it counted the partner-PSD
matrix arm as passed while also noting partner PSD orders remain unassignable.
The truth, re-proven end-to-end through the REAL partner API (temporary sandbox
credential, normal payloads, no manual answer inserts):

- **Genuine partner PSD orders have never been assignable.** Intake stores
  answers under the server constant `partner.assessment.v1` (the partner's
  declared `assessment.schema_version` is validated but never stored as the
  version — no payload can steer it). `psd_assessment_questions` has no rows
  for that version, so `psd_assessment_status` fails closed.
- Slice 6's "PSD arm green" was achieved only by inserting retail-versioned
  (`psd_v1`) answers directly — a simulation of a future MAPPED state, not the
  real workflow. The comms/earnings conclusions it demonstrated remain valid
  (they were re-proven on the ESA arm and on the PSD fixtures' suppression
  surfaces), but partner PSD ASSIGNMENT was not, and is not, a working flow.
- **Root cause is a missing contract, not a version label.** The partner API
  defines no PSD question set at all — `assessment.answers` accepts any
  non-empty `question_id → answer` object, and the canonical Slices 1–2 example
  vocabulary (`primaryConcern`, `symptomDescription`, `durationOfSymptoms`) has
  no semantic equivalents for the 16 required `psd_v1` clinical questions.
  Intake does not collect clinically equivalent answers, so no mapping was
  invented.
- **What shipped instead (the narrowest safe correction):**
  `psd_assessment_status` now judges a PSD order whose stored answer-version is
  absent from the question catalog against canonical `psd_v1`, counting
  NOTHING as answered (no id-collision equivalence), and reports
  `unmapped_version: true` + `judged_version` + the full missing list — the
  previously vacuous `0 of 0 required, missing []` refusal now names all 16
  unmet questions. `psdCompletionGate` adds a belt (`allowed = complete &&
  !unmappedVersion`) and an admin message naming the mapping gap;
  `assign-doctor` surfaces both fields in its 409. Known-version (direct)
  behaviour is byte-identical — verified against pre-change captures of
  `psd_v1` and `psd_v0_legacy` orders. Partner identity is never an input to
  the clinical decision (guarded).
- **Adversarially proven:** a forged payload sending the 16 retail question
  ids under a claimed `schema_version: "psd_v1"` is stored under the server
  constant and refused with `answered: 0` — content is never evaluated on an
  unmapped schema, and qualifying-looking, non-qualifying-looking and forged
  payloads all receive the identical refusal.
- Guard: `scripts/check-psd-partner-unmapped-version.mjs` (13 checks, executes
  the real gate, 7/7 planted weakenings detected), wired into every build via
  the Slice 6 comms guard's W2 slot.

**Minimum partner intake extension (proposed, NOT implemented — needs the
partner agreement + clinical owner):** define a versioned partner PSD answer
contract (e.g. `partner.assessment.psd.v1`) covering all 16 required `psd_v1`
questions — either adopting the retail question ids verbatim or Rapid's own
vocabulary plus an explicit, clinically-approved per-question mapping — and
have `partner-orders-v1` validate PSD payloads against it at intake (rejecting
`assessment_incomplete` with the missing question ids, mirroring the retail
gate). Until then, partner PSD orders are accepted for intake and blocked from
assignment with the honest diagnostics above.

## Known residuals (accepted, documented for Slice 7 / production onboarding)

1. **Identity-keyed messages** (OTP, password reset, account welcome, broadcast
   targets supplied as raw emails/phones, AI support replies to inbound SMS)
   cannot be order-classified without compiling identity→order mappings.
   Partner customers are not expected to hold PawTenant portal accounts;
   production onboarding must decide the partner-customer portal story.
2. **stripe-webhook `findOrder` fallback** (email + NULL payment_intent_id) can
   match a partner row for a person who also buys direct; the customer-email
   consequence (confirmation resend) is gated downstream, but the match itself
   should be origin-filtered in a later slice.
3. **`doctor_earnings` RLS** is row-level (`auth.uid() = doctor_user_id`) with
   no column masking: a provider could select `order_amount` on their own rows
   via the Data API. Partner rows now hold NULL there; direct rows expose the
   retail price to that provider's own cases (pre-existing, unchanged).
4. **bulk-sms** posts to Twilio directly (bypasses the GHL DND path) — pre-existing;
   its audience is now direct-only at the modal, but targets remain body-supplied.
5. **`partner_order_financials.clinical_completed_at` / `billable_status`** are
   still never flipped by completion — that is the Slice 7 billable event.

## Slice 7 confirmed requirements (documented, NOT implemented)

- Partner finance ledger: flip `billable_status`/`clinical_completed_at` on the
  clinical-completion event; receivables at the rate-card price
  (**ESA now $55.00 sandbox v2** — superseded $45 v1 on 2026-08-20 per owner;
  PSD remains $45 v1; amounts remain owner-changeable data, never code);
  invoice generation/status/aging; reconciliation.
- Partner document handover API (the partner pulls the neutral assessment/letter;
  today nothing customer-facing delivers partner documents — deliberate).
- Production credentials + onboarding docs + OpenAPI.
- Decide the origin-filter for stripe-webhook `findOrder` and the
  partner-customer portal/OTP story.
- **Partner PSD answer contract + mapping** (see the closure correction above):
  without it, partner PSD orders are accepted at intake and honestly blocked
  from assignment; partner ESA is unaffected (no answer gate at assignment).
