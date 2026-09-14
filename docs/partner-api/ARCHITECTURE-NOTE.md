# PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 — Architecture Note

**Status:** Phase 1 complete (read-only investigation). TEST-only. LIVE untouched.
**Written before any schema or code change**, as required by the project brief.

Baseline validated at session start:

| Check | Expected | Observed |
|---|---|---|
| TEST HEAD | `1fa2894` | `1fa2894` ✅ |
| LIVE HEAD | `5135084c` | `5135084c` ✅ |
| LIVE deployment | `bggx60pd0` | `bggx60pd0` (Ready, Production) ✅ |
| TEST Supabase | `opudhofjbydrljgleofq` | confirmed ✅ |
| LIVE Supabase | `cvwbozlbbmrjxznknouq` | read-only, untouched ✅ |

No competing session: TEST untracked files are stale scratch dated 2026-08-15
(`deno.lock`, `mig.json`, 7 marketing docs); LIVE has one untracked audit doc. No
lockfiles, no in-flight worktree writes.

---

## 1. The governing principle

Zeek is building a **B2B clinical-fulfillment platform**, not a Rapid integration.
Every design decision below therefore chooses the *generic* option, and Rapid ESA
Letter exists only as **one row** in a partner table plus **two rows** in a rate-card
table. There is no `rapid` conditional anywhere in application code.

The second principle: **PawTenant already knows how to do almost all of this.**
Order intake, lifecycle, assessment storage, provider licensing, assignment,
earnings, document release, QR injection, audit and comms suppression are all
solved, canonical and battle-tested. This foundation must *reuse* them and add
exactly four genuinely new things: **who the partner is**, **what they pay**,
**how they authenticate**, and **what must not happen to their orders**.

---

## 2. Canonical systems being reused (NOT duplicated)

| Concern | Canonical implementation | How partner orders reuse it |
|---|---|---|
| **Order record** | `public.orders` | Partner orders are ordinary `orders` rows. No shadow order table. |
| **Lifecycle classifier** | `public.order_workflow_state(orders)` — `IMMUTABLE`, arms: cancelled / lead / completed / pending_delivery / reopened / under_review / paid_unassigned | Reused verbatim. **One minimal arm added** so a partner order (paid by Rapid, therefore no `payment_intent_id`) is not misclassified as a `lead`. Direct-order output is provably byte-identical — see §6. |
| **Payment classifier** | `public.order_payment_state(orders)` | Untouched. Partner orders carry no Stripe payment, so `paid_at` is the only paid signal. |
| **Lifecycle events** | `order_lifecycle_events` + `detect_order_lifecycle_events` + `orders_lifecycle_before/after_write` | Reused. Partner state transitions emit the same events. |
| **Status log** | `order_status_logs` + `log_order_status_change` | Reused unchanged. |
| **Structured assessment** | `public.assessment_answers` (`order_id, assessment_version, question_id, question_version, answer_value jsonb, source_step, answered_at, revision`) | **This is the authoritative store for Rapid's payload.** Rapid's own PDF is never a source of truth. |
| **Assessment PDF** | `src/pages/admin-orders/components/assessmentUtils.ts → buildPrintHTML()` — the single generator, consumed by admin, provider portal and customer portal | Neutralised **globally** (Phase 7), not forked per partner. |
| **ESA vs PSD** | `orders.letter_type` + `supabase/functions/_shared/letterType.ts` (`LETTER_LABELS`, `isPsdLetter`, `getLetterMeta`) | Reused as the only service taxonomy. Partner `service` maps onto `letter_type`. |
| **Package / entitlement** | `orders.package_key`, `package_display_name`, `billing_plan`, `_shared/packageEntitlement.ts`, `order_entitlement_snapshots` | Reused. Partner orders get an entitlement snapshot like any other order. |
| **Immutable snapshot pattern** | `ensure_order_entitlement_snapshot()` + `tg_order_entitlement_immutable` + `order_price_quotes_immutable` | **Copied as a pattern** for the partner rate / comms-policy / document-policy snapshots. Same shape, same immutability trigger discipline. |
| **Provider licensing** | `doctor_profiles.licensed_states` (array) + `state_license_numbers` (jsonb) | Reused as the *only* eligibility truth. Partner availability is **calculated** from this, never asserted. |
| **Provider assignment** | `auto_assign_unassigned_orders()`, `claim_my_orders()`, `assign-doctor` edge function | Reused unchanged. Partner orders enter the same queue. |
| **Provider earning amount** | `doctor_profiles.per_order_rate` → `doctor_earnings.doctor_amount` | **The one and only payout truth.** The partner model *snapshots a reference to it*; it never recomputes or duplicates it. |
| **Earnings ledger** | `public.doctor_earnings` (+ `cancel_order_and_void_earnings`) | Reused. Gains a partner/origin **dimension** only — no second ledger. |
| **Provider document submission** | `provider_submit_document_slot()`, `order_documents`, `order_document_versions`, `approve_order_document`, `auto_deliver_order_document`, `tg_order_document_release_gate` | Reused unchanged. |
| **QR / verification injection** | `inject-pdf-footer` (with its `VERIFIABLE_DOC_TYPES` **allowlist**), `_shared/qrVerificationPdf.ts`, `generate-qr-verification-pdf`, `issue-letter-verification`, `letter_verifications` | Reused. The document policy becomes a **second fail-closed gate** in front of the existing allowlist — the same defensive shape already proven there. |
| **Comms suppression** | `_shared/testNotificationSuppression.ts` — three-condition, fail-closed, `.test`/`.invalid` fixture TLDs | Reused for fixtures **and** its design copied for the partner comms gate. |
| **Rate limiting** | `_shared/rateLimit.ts` | Reused for the partner API. |
| **Audit** | `public.audit_logs` (`object_type/object_id/action/category/source/order_id/metadata/actor_*`) + `_shared/auditActor.ts` | Reused for every partner API and policy event. |
| **Admin predicate** | `is_chat_admin()` (owner / admin_manager, active) — narrowest; `check_is_admin()`, `is_admin_staff()` broader | Partner financial data uses **`is_chat_admin()`**. Never `user_metadata`. |
| **Secret verification** | `verify_payout_cron_secret(p_secret)` — `SECURITY DEFINER`, `search_path=''`, compares inside the DB against `vault.decrypted_secrets`, returns **boolean only** | **The credential pattern.** Partner keys extend it: hash stored in a `private` schema, verified in-DB, secret never returned or logged. |
| **Private schema precedent** | `private.cron_secrets` already exists | Partner credential material and server-only integration state live in `private`, invisible to the Data API. |
| **Admin Orders server-side query** | `src/pages/admin-orders/orderFacetCounts.ts` → `applyListPredicates()` / `applyNonStatusFilters()` / `fetchOrderFacetCounts()` / `isDefaultScopeEligible()`, projection `ORDERS_LIST_COLUMNS`, page size + deterministic `(basis, created_at, id)` ordering in `page.tsx` | Reused wholesale. `applyNonStatusFilters` is a **single funnel** shared by the row query, the list total, the KPI cards and all ten facet buckets — so one predicate there segregates partner orders from direct KPIs everywhere at once. |
| **Order Detail modal** | `OrderDetailModal.tsx` (MERGE-FROZEN) | Reused. Only an **additive isolated panel mount** — an approved edit type under CLAUDE.md — never a second modal. |
| **Client write protection** | `orders_reject_client_column_writes`, `orders_protect_identity_columns` | Reused. Partner columns inherit this protection automatically. |

**Nothing in the list above is re-implemented.** The partner model is a thin,
generic layer bolted onto proven machinery.

---

## 3. What is genuinely new

Only four things do not already exist:

1. **Partner identity** — `partner_organizations` (who they are, what they may buy,
   which states, default policies).
2. **Partner economics** — `partner_rate_cards` (records, not code) + per-order
   immutable financial snapshots.
3. **Partner authentication** — scoped, revocable, rotatable server-to-server
   credentials in a `private` schema, verified in-DB.
4. **Partner constraints** — immutable per-order **communication policy** and
   **document policy** snapshots, each enforced fail-closed.

Everything else is a column, a predicate, or a mount point.

---

## 4. Why the partner is not a brand, a source, or an attribution value

The brief forbids overloading `utm_*`, `attribution_json`, `referred_by`,
`source_system`, `webhook_source` or `ghl_*`. That is correct, and the
investigation confirms why: those columns are consumed by Google Ads /
Microsoft Ads conversion upload, Meta CAPI, `channel_performance`,
`analytics_roi_summary`, `funnel_summary` and `get_channel_contribution_orders`.
Writing a partner name into any of them would inject wholesale B2B fulfillment
into paid-media ROAS and retail funnel maths.

Partner identity therefore gets **its own dedicated, purpose-named columns**
(`order_origin`, `partner_id`, `partner_order_id`) and its own tables.

---

## 5. Why partner orders must not reach the direct KPI surfaces

`orders.price`, `stripe_gross_charged_cents` and `stripe_net_retained_cents` feed
retail revenue KPIs. **Rapid's retail price is never transmitted to us and is not
our revenue.** Our revenue for a partner case is the wholesale fee ($45), which is
a *fulfillment* line, not a *retail sale*.

So partner orders are excluded at `applyNonStatusFilters` (one funnel → every
count surface), and partner economics live only in partner-specific admin views
gated on `is_chat_admin()`.

---

## 6. The one lifecycle change, and why it is provably safe

`order_workflow_state` currently begins:

```sql
when o.status = 'cancelled'                            then 'cancelled'
when o.payment_intent_id is null or o.status = 'lead'  then 'lead'
```

A partner order is genuinely paid — by Rapid, to Rapid — so it has `paid_at` set
but **no `payment_intent_id`**. Unchanged, every partner order would classify as a
`lead` and pollute the lead funnel.

The change splits the second arm and adds one origin-guarded exception:

```sql
when o.status = 'cancelled'                            then 'cancelled'
when o.status = 'lead'                                 then 'lead'
when o.payment_intent_id is null
     and not (o.order_origin = 'partner'
              and o.paid_at is not null)               then 'lead'
-- …all remaining arms unchanged…
```

For any **direct** order `o.order_origin = 'partner'` is false, so the third arm
collapses to `o.payment_intent_id is null` — and arms two and three together are
logically identical to the original disjunction. Direct behaviour is unchanged by
construction, and this is verified empirically against every existing row before
the migration is accepted (old vs new output diff must be **zero rows**).

`order_workflow_state` is never called in a `WHERE` clause (whole-row argument
⇒ TOAST expansion) — that existing rule is preserved.

---

## 7. Clinical independence (non-negotiable)

The provider's compensation is `doctor_profiles.per_order_rate`, snapshotted at
acceptance. It is **not a function of the clinical outcome**. A completed
evaluation that results in *not qualified* pays the provider exactly the same and
is still billable to the partner.

Consequently the partner lifecycle deliberately separates:

- `qualified` / `not_qualified` — the **clinical determination**
- `clinical_work_completed` — the **billable + payable event**

and `qualified` is never equated with `completed`. No automated surface ranks,
scores, rewards or nudges a provider toward approval, and the provider-facing UI
is barred from showing the wholesale rate, the margin or the invoice status.

---

## 8. Deployment reality found during investigation

- **No `supabase/config.toml` exists in the repo.** The `verify_jwt` policy lives
  only on the Supabase project. 140 functions are deployed; **33 run with
  `verify_jwt=false`** (`stripe-webhook`, `ghl-*`, `inject-pdf-footer`,
  `provider-submit-letter`, `issue-letter-verification`, …). The partner API must
  join that set (Rapid presents an API key, not a Supabase JWT) and must therefore
  **fail closed before reading or writing any clinical data**, exactly as the
  existing external-webhook functions do. Deploys must pass `--no-verify-jwt`, and
  the flag must be re-verified after deploy.
- **Known edge-function drift** (pre-existing, not caused here):
  deployed-but-not-in-repo `ai-support-test-helper`, `investor-channel-report`;
  in-repo-never-deployed `fetch-ad-spend-keyword-probe`.

---

## 9. Known hazards carried into implementation

- `public.system_errors` **does not exist on LIVE** ⇒ `logSystemError` is a silent
  no-op there. Partner alerting must use `audit_logs`.
- `communications.type` is `sms_outbound` / `sms_inbound` / `email` — never `'sms'`.
- `orders.addon_services` is NULL for all rows.
- `payment_attempts` is incomplete — absence of a row never proves absence of payment.
- MCP `execute_sql` returns only the **last** statement's result.
- `buildPrintHTML` interpolates values into HTML **unescaped**. Partner payloads
  arrive from an external API, so escaping is a genuine security requirement of
  this work, not a nicety.
- `npm run build` does **not** type-check; `type-check` must be run separately and
  compared against the 8 known pre-existing errors.

---

## 10. Explicitly out of scope this session

Final invoicing (draft → preview → finalize/lock → download → payment → aging →
credit notes) is **Phase 2** and is deliberately not built. Only the *financial
foundation* it will consume is created here. No LIVE change, no LIVE deploy, and
no PageSpeed/RUM work.
