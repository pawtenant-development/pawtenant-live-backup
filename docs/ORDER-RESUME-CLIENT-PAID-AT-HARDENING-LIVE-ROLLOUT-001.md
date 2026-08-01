# ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001

**Status:** LIVE COMPLETE — RESUME-ORDER PAYMENT AUTHORITY, CROSS-ORDER IDENTIFIER BINDING,
OWNERSHIP, PUBLIC STATUS PRIVACY, REPLAY SAFETY, CLEANUP, AND PRESERVATION VERIFIED

> **Closed 2026-08-01.** This rollout originally shipped PARTIAL because of one in-scope acceptance
> criterion: `check-payment-status` disclosed customer PII to unauthenticated callers (pre-existing,
> not introduced here). That defect was fixed and verified on LIVE the same day by
> **`CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001`** (LIVE `ba83e6f` → `314b644`,
> `check-payment-status` v91 → v92, `verify_jwt=false` preserved, Vercel
> `dpl_47ng9mLqibgHTaLmxMG3rdaftixp`). The public response is now an allowlist of
> `{ paid, paymentStatus, reconciled, nextStep, code, confirmationId }` with zero PII — proven
> against a real production order. See `docs/CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001.md`.
> §11 below is retained as the historical record of the defect.

**Scope:** LIVE only (`pawtenant-live-backup`, Supabase `cvwbozlbbmrjxznknouq`, `https://pawtenant.com`).
**Date:** 2026-08-01
**LIVE baseline HEAD:** `e153f95` → **final HEAD:** `f400e20` (+ this doc commit)
**TEST source:** historical `701b78a`; current TEST HEAD `cb2b8f1` (not modified by this task)

---

## 1. TEST task-owned commits reconstructed

`701b78a` itself only made the guard deploy-blocking. The task spans four commits:

| TEST commit | Files | Role |
|---|---|---|
| `207c29e` | `get-resume-order`, `check-payment-status`, `assessment/page.tsx`, `PSDStep3Checkout.tsx` | the fix |
| `8d74582` | `scripts/check-resume-payment-authority.mjs`, `package.json` | guard + npm scripts |
| `8e685e4` | `docs/ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001.md` | TEST doc |
| `701b78a` | `package.json` | guard wired into the build chain |

No migration exists in any of them, and none is required on LIVE — the fix is entirely
function-level and frontend-level. No schema change was applied.

---

## 2. Divergence map (LIVE reconciliation classification)

Every comparison below is CRLF-normalised; the two repos use the same per-file line-ending
convention, so a raw byte diff would have been misleading.

| File | LIVE state vs TEST pre-fix | Classification | Result |
|---|---|---|---|
| `supabase/functions/check-payment-status/index.ts` | identical | **port exactly** | +239/−36, matches TEST |
| `src/pages/assessment/page.tsx` | identical | **port exactly** | +10, matches TEST |
| `src/pages/psd-assessment/components/PSDStep3Checkout.tsx` | identical | **port exactly** | +13, matches TEST |
| `supabase/functions/get-resume-order/index.ts` | **150 lines diverged** | **port surgically** | +246/−8, delta byte-identical to TEST |
| `scripts/check-resume-payment-authority.mjs` | absent | **port exactly** (new) | 16 checks / 18 controls |
| `package.json` | different build chain | **port surgically** | guard inserted into LIVE's own chain |
| `docs/ORDER-RESUME-CLIENT-PAID-AT-HARDENING-001.md` | TEST-only | **TEST-only** | LIVE gets this document instead |

### Pre-existing LIVE divergence in `get-resume-order` that was preserved

The 150 diverged lines are all newer LIVE work and none of it was overwritten:

- BATCH-0.2A attribution "meaningfulness" helpers (`isMeaningfulTouch`, `isUnresolvedMacro`,
  `isRealValue`) and the `last_touch_json` overwrite guard;
- `gbraid` / `wbraid` derivation and sticky-set;
- LIVE staff-alert logo `static.readdy.ai/...` (must **never** be taken from TEST);
- the LIVE paid-email **block** on lead saves (TEST diverges here with repeat-purchase behaviour
  from `CUSTOMER-PORTAL-REPEAT-PURCHASE-UPSSELL-REVIEWS-001`, which is deliberately **not** ported);
- TEST-only `"archived"` status exclusion — **not** ported;
- the "Notifications" vs "Communications" settings wording;
- TEST-only `checkout_session_id` in the read projection — **not** ported.

**Verification of surgicality:** the LIVE patch added 246 lines and removed 8, and both sets are
**line-for-line identical** to the TEST task-fix delta. Nothing else in the file moved.

Both deployed LIVE bundles were confirmed byte-identical to the LIVE repo *before* the port, so
there was no hidden function drift to reconcile.

---

## 3. Root cause — and why LIVE was worse than TEST

`get-resume-order` runs with `verify_jwt=true`, but every browser holds the public anon key, so its
request body is attacker-controlled. It nevertheless wrote three client-supplied values onto the
order row:

```ts
if (body.paymentIntentId ...) upsertPayload.payment_intent_id = body.paymentIntentId; // unverified
if (body.paidAt ...)          upsertPayload.paid_at           = body.paidAt;           // BROWSER CLOCK
if (body.status !== undefined) upsertPayload.status           = body.status;           // "processing"
```

Both checkouts minted the timestamp client-side (`const paidAt = new Date().toISOString()`).

### LIVE-specific amplification (discovered during this rollout)

LIVE has **no** `orders_entitlement_snapshot_on_paid` trigger — that is TEST-only, so the immutable
entitlement-snapshot consequence described in the TEST document does not apply here. LIVE has a
different and, for this defect, worse mechanism:

1. `detect_order_lifecycle_events` computes
   `is_paid := (payment_intent_id is not null or paid_at is not null)`.
   **A non-null `payment_intent_id` alone counts as paid.**
2. On that transition `orders_lifecycle_before_write` executes
   `NEW.paid_at := coalesce(NEW.paid_at, ev_at)` and emits a `payment_received` lifecycle event
   with an idempotency key.
3. The same trigger then enforces **`paid_at` immutability**: once `OLD.paid_at` is non-null, any
   different `NEW.paid_at` is reverted unless `app.allow_first_paid_override` is set.

So on LIVE the old code was exploitable **without even sending `paidAt`** — a forged
`payment_intent_id` was sufficient for the database itself to stamp `paid_at` and mint a permanent
lifecycle event. And because immutability then protects the *forgery*, the genuine Stripe webhook
timestamp arriving later would have been **rejected**. Since the month-end reporting work
(`MONTH-END-TIMEZONE-KPI-REPORTING-INTEGRITY-001`) buckets revenue by `paid_at` in
`America/New_York`, a forged value would have corrupted the canonical monthly report with no
in-band way to correct it.

This was confirmed empirically: inserting a fixture with a `payment_intent_id` and an explicit
`paid_at = null` came back with `paid_at` stamped by the trigger.

A second, independent hole existed in the reconciler: `check-payment-status` resolved
`sessionIdToProbe = requestedSessionId || stored` — the **client value won**. Posting
`{ confirmationId: <my unpaid order>, sessionId: <someone else's PAID session> }` reconciled *my*
order against *their* payment. Hardening `get-resume-order` alone would have moved the hole, not
closed it.

---

## 4. Authoritative payment contract (post-fix)

`get-resume-order` is now read/resume + non-payment writes only. It never writes `paid_at`,
`payment_intent_id`, `checkout_session_id` or `subscription_id`, holds no Stripe client, and
delegates payment-shaped requests to `check-payment-status`.

### All `orders.paid_at` writers on LIVE after this rollout

| Writer | Authority | Timestamp |
|---|---|---|
| `stripe-webhook` | Stripe signature (`constructEventAsync`) | server `now()` |
| `check-payment-status` | server-side Stripe retrieve + identifier binding | server `now()` |
| `fix-order-payment` | admin authenticated | server / preserves existing |
| `OrderDetailModal.tsx` (admin manual mark-paid) | admin session + RLS | server-relative |
| ~~`get-resume-order`~~ | **removed** | — |

### Request contract

| Field | Behaviour |
|---|---|
| `paidAt` | still accepted for backward compatibility with cached bundles, **never read, parsed or written** |
| `paymentIntentId` | accepted as an **unverified lookup hint**; must be bound before use |
| `status` | allowlisted to `"lead"` only; `"processing"` / `"completed"` ignored |
| `paid`, `payment_status`, `paid_at` | never authoritative; presence logged once (deduped), then ignored |

### Identifier-binding contract (`check-payment-status`)

Reconciliation happens only when **all** hold:

1. an order was resolved by `confirmationId`;
2. the identifier is **bound** — it equals the stored `checkout_session_id` / `payment_intent_id`,
   or the retrieved Stripe object carries `metadata.confirmation_id === order.confirmation_id`
   (stamped server-side by `create-payment-intent` and `create-checkout-session` — both verified
   present on LIVE, including the one-time PI path and `sharedMetadata`);
3. Stripe reports paid — session `payment_status=paid`/`status=complete`, or PaymentIntent
   `status === "succeeded"` and nothing else;
4. currency is USD;
5. the order is still unpaid.

`paid_at` is always a server timestamp. The update is guarded by `.is("paid_at", null)` so the paid
transition fires at most once under concurrency. A client identifier that contradicts the stored one
is refused outright with no mutation and no Stripe call.

The added PaymentIntent branch is a net **improvement** in coverage: inline-card orders never create
a Checkout Session and previously had no reconciliation path at all when the webhook was delayed.

### Ownership contract

- Anonymous callers are denied at the JWT boundary on `get-resume-order` (**HTTP 401 proven**).
- `verify_jwt=true` on `get-resume-order` and `verify_jwt=false` on `check-payment-status` were
  both preserved.
- Authorization on the `get-resume-order` read path is by `confirmation_id` with the anon key. That
  is pre-existing and was **not** broadened by this task; payment mutation is now structurally
  impossible from the endpoint regardless of caller, so the cross-customer *payment* surface is
  closed. The residual read-path disclosure is recorded in §11.

---

## 5. Deployment

| Function | Before | After | `verify_jwt` |
|---|---|---|---|
| `get-resume-order` | v100 | **v101** | `true` (preserved) |
| `check-payment-status` | v90 | **v91** | `false` (preserved, `--no-verify-jwt`) |

The deployed `get-resume-order` bundle was downloaded back from Supabase and is **byte-identical to
the committed source** (`git diff` empty). The deployed `check-payment-status` bundle was re-read and
contains the binding logic.

| Vercel | Value |
|---|---|
| Project | `pawtenant-production` (`prj_Fgggz5TXMHk9ohNAjeyNkg6o1Tfj`, team `team_XfWlgijQ0EC5fkEKpxi7Rz3l`) |
| Previous production deployment | `dpl_7hg2rKjuZSL8ZNzkfsh8MvYmPpmQ` (rollback target) |
| New production deployment | **`dpl_24uR8qpTannZDKTe1wyDQky1xKix`** — READY |
| Aliases confirmed | `pawtenant.com`, `www.pawtenant.com` |

### Active-bundle frontend proof

All 171 JS chunks served from `pawtenant.com` were downloaded and searched.

- Across the **9** `get-resume-order` call sites in the live bundle, **none** sends `paidAt` and
  **none** sends `status:"processing"|"completed"|"paid"`. The single payment-shaped upsert sends
  `paymentIntentId` only, as the intended hint.
- `paidAt` appears exactly **once** in the entire bundle set, as `u_(g.paidAt)` — a read of
  server-supplied data rendered in an admin conversions table. It is not a request field.

---

## 6. Guards and build

| Check | Result |
|---|---|
| `check:resume-payment-authority` | **16/16 PASS** |
| `test:resume-payment-authority` | **18/18 negative controls caught** |
| `check-edge-function-modules` (Edge Function graph) | 3/3 PASS |
| `npm run build` | **exit 0** (unmasked; not piped) |
| `type-check` | 9 errors — **byte-identical to the pristine `e153f95` baseline**, none in task files |

Baseline discipline: the type-check baseline was captured by restoring the five task files to
pristine HEAD, running `tsc`, then restoring the port — the two outputs `diff` clean.

Pre-existing, unrelated, unchanged by this task: the `--warn-only`
`check-refund-consumer-guard` findings (`!!refunded_at` anti-pattern in
`OrderAdditionalPetPanel.tsx:152` and `provider-additional-pet-decision/index.ts:246`).

Guard coverage: R1–R8 pin `get-resume-order`, R9–R14 pin the reconciler, R15 pins both frontend
payloads, R16 pins scope (no LIVE project reference; neither frozen mega-file claimed). The guard
normalises CRLF — under `autocrlf=true` the `\n`-anchored controls silently no-op otherwise.

---

## 7. LIVE QA matrix

Fixtures: reserved synthetic orders `PT-LIVE-PENDINGQA-91..95`, all `@pawtenant.test` emails, no real
phone, no real Stripe objects. The IDs match the permanent GHL suppression rule
`/^PT-LIVE-PENDINGQA-\d{2,4}$/`. Fixtures were created by service-role SQL (never through the
checkout), so no lead notification and no GHL lead event could fire.

All `get-resume-order` probes used the **anon key** — the real attacker position.

| # | Scenario | Result |
|---|---|---|
| A | forged current `paidAt` on unpaid 91 | `payment_confirmation_pending`, order stays `lead`, `paid_at` NULL |
| B | forged `paidAt` + `status:"processing"` + `paid:true` + `payment_status:"succeeded"` + fabricated PI | all ignored; **`payment_intent_id` NOT written** — decisive on LIVE |
| C | far-future / malformed / epoch / null `paidAt` | all refused, unpaid |
| D | cross-order **checkout session** against 92 (stores its own) | `identifier_mismatch`, no mutation, **no Stripe call** |
| E | cross-order **payment intent** against 92 | `identifier_mismatch`, no mutation |
| F | 92's identifier supplied against 91 (91 stores none) | Stripe lookup fails → fail-closed 400, no mutation |
| G | unpaid 91, no identifier | `no_payment_identifier`, unpaid |
| H | Completed 93 — forged reopen + payment | refused: "Order already paid with a different payment intent"; `paid_at` **unchanged** (kept 2026-07-22, not the forged 2026-08-01) |
| I | Refunded 94 — forged re-paid | `already_paid`; `paid_at`, `refunded_at`, `refund_status` all unchanged |
| J | Cancelled 95 — forged paid + PI | stays `cancelled`, `paid_at` NULL, forged PI **not written** |
| K | valid READ on unpaid 91 and paid 93 (positive controls) | both work — no regression to the normal resume flow |
| L | anonymous `get-resume-order` (no key) | **HTTP 401** |
| M | public `check-payment-status` (no key) | reachable by design (`verify_jwt=false`) — see §11 |
| N | 5 sequential forged replays | all `payment_confirmation_pending`, no drift |
| O | 5 sequential valid checks | all consistent, no mutation |
| P | 8 concurrent forged claims | 8/8 `payment_confirmation_pending` |
| Q | 8 concurrent cross-order attacks | 8/8 `identifier_mismatch` |

**Replay evidence.** Across 26 hostile calls, the fixture payment-state hash was unchanged
(`3342c5c7a46b36e08a19a9c4e92478ce` before and after), fixture audit rows stayed at **5** (dedupe
holds under concurrency), fixture lifecycle events stayed at **8**, and `payment_received` events on
the attacked unpaid orders remained **0**. No earnings, notifications, GHL rows or Ads uploads were
created.

**Telemetry written:** `resume_paid_at_client_value_ignored` (deduped per order) and
`resume_payment_identifier_mismatch` (deduped per order + kind). Identifiers only — no secrets,
headers or payment methods.

### Not provable on LIVE without violating the no-Stripe-writes constraint

A genuine bound-and-Stripe-confirmed **positive** reconciliation (TEST case G, where the price moved
129 → 139 because the value came from Stripe) cannot be reproduced on LIVE, because it requires a
real paid Stripe object. On LIVE that path is covered by the ported code being delta-identical to the
TEST-verified implementation, by guard checks R10–R13, and by the negative controls. Recorded as a
limitation, not claimed as tested.

---

## 8. Side effects — actual counts

| Side effect | Count |
|---|---|
| Stripe objects created / charges / refunds / payment intents | **0** |
| Stripe API writes of any kind | **0** (only read-only `retrieve`, which 404'd on synthetic ids) |
| Google Ads conversion uploads | **0** (33 → 33) |
| GHL forwarding / sync rows | **0** (9263 → 9263) |
| Real emails | **0** |
| Real SMS | **0** |
| Marketing enrolment | **0** |
| Provider earnings | **0** (502 → 502) |
| Provider/customer notifications | **0** (1353 → 1353) |
| Real customer or provider contact | **0** |

---

## 9. Cleanup

All fixtures and every child row deleted, verified at zero:

| Object | Created | Remaining |
|---|---|---|
| Reserved fixture orders `PT-LIVE-PENDINGQA-91..95` | 5 | **0** |
| Fixture lifecycle events | 8 | **0** |
| Fixture audit rows | 5 | **0** |
| Orders with an `@pawtenant.test` email | — | **0** |
| Synthetic profiles / auth identities | 0 | **0** |
| Synthetic payment / earnings / communications / GHL / Ads rows | 0 | **0** |
| Storage objects | 0 | **0** |

The 5 fixture audit rows were removed deliberately: they are QA-generated telemetry about
QA-generated orders, and leaving them would have left the LIVE audit trail referencing orders that
no longer exist — readable by a future security review as a real attack. No genuine audit evidence
was touched.

---

## 10. Preservation

| Metric | Baseline (pre-task) | Final | Δ |
|---|---|---|---|
| orders total | 1750 | 1750 | 0 |
| orders paid | 492 | 492 | 0 |
| orders unpaid | 1258 | 1258 | 0 |
| orders completed | 470 | 470 | 0 |
| orders refunded | 23 | 23 | 0 |
| doctor_earnings | 502 | 502 | 0 |
| payment_attempts | 659 | 659 | 0 |
| order_lifecycle_events | 376 | 376 | 0 |
| ghl_sync_logs | 9263 | 9263 | 0 |
| google_ads_conversion_uploads | 33 | 33 | 0 |
| doctor_notifications | 1353 | 1353 | 0 |
| audit_logs | 10338 | 10340 | **+2 — explained** |
| communications | 10074 | 10075 | **+1 — explained** |
| **orders payment hash** | `36c429027f4e62e09ffb33618b625ca3` | `36c429027f4e62e09ffb33618b625ca3` | **IDENTICAL** |
| **earnings hash** | `aa54cee359f3e41125d8a41c12627787` | `aa54cee359f3e41125d8a41c12627787` | **IDENTICAL** |
| **lifecycle hash** | `9a4bd7a7211dde444e621521c44cbb99` | `9a4bd7a7211dde444e621521c44cbb99` | **IDENTICAL** |

The three deltas are one event: the **Auto-Sequence marketing drip cron** firing on real orders at
14:15–14:30 UTC — `seq_3day_sent` for `PT-MS65VMZU` plus `seq_run_complete`, and the matching
discount email in `communications`. Genuine production activity, unrelated to and not caused by this
task. No unexplained delta remains.

The identical payment hash is the strongest statement available: **not one historical order's
`paid_at`, `payment_intent_id`, `checkout_session_id`, `status` or `price` changed.**

Preserved and untouched: `America/New_York` business timezone, Accounts / Monthly Books paid-media
reconciliation, the canonical month-end report payload, the July no-send protection, the monthly
report cron (jobid 16), Admin Orders current-workload KPIs, custom-range lifecycle KPIs, the Pending
Delivery workflow, replay-idempotency protection, single-current-pending document protection, GHL
reserved fixture suppression, and LIVE-only email branding.

---

## 11. Limitations and the one open item

### ✅ CLOSED (2026-08-01) — `check-payment-status` disclosed PII to unauthenticated callers

> Fixed by `CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001`. The description below is the original
> finding, kept for the record.

The endpoint runs with `verify_jwt=false` (correct and preserved — the Klarna "I've completed
payment" button and the ESA/PSD thank-you pages need it). Its `toPublicOrder()` projection returns,
to a caller with **no credentials at all**, for any supplied `confirmation_id`:

`first_name`, `last_name`, **`email`**, `price`, `plan_type`, `delivery_speed`, `letter_type`,
`coupon_code`, `coupon_discount`, `doctor_name`, `status`, `paid_at`.

- **Pre-existing.** Introduced by the 2026-06-18 `THANK-YOU-SOURCE-OF-TRUTH` change; present
  verbatim in the LIVE v90 baseline bundle and identical on TEST. This rollout did not add,
  widen or touch it.
- **In scope by the task's own criteria.** §E requires the public endpoint to disclose only the
  minimum safe status and no PII. That criterion is not met, which is why this rollout is reported
  **PARTIAL** rather than COMPLETE.
- **Not fixed in this rollout, deliberately.** Narrowing the projection changed the contract the ESA
  and PSD thank-you pages depended on, so it needed its own task and QA rather than an unrequested
  edit to a payment endpoint on LIVE. That task ran immediately afterwards and closed it: the
  thank-you pages now resolve the customer's own details from their own browser, and the endpoint
  returns payment state only.

### Other limitations

- A genuine Stripe-confirmed positive reconciliation was not exercised on LIVE (see §7).
- `get-resume-order`'s read path authorises by `confirmation_id` + anon key. Pre-existing and
  unchanged; it exposes the same order fields to anyone holding a confirmation id.
- LIVE has no entitlement-snapshot trigger, so the TEST document's snapshot-integrity section does
  not transfer. The LIVE equivalent is lifecycle-event and `paid_at`-immutability integrity (§3).
- `paidAt` is still accepted (and ignored) on the wire so cached browser bundles do not break. It
  can be removed once cache expiry is certain.

---

## 12. Rollback

Forward-only. Nothing here requires a destructive rollback.

| Layer | Restore to |
|---|---|
| Repository | revert commits `2e3e84f`, `2d864a4`, `502e8a6`, `f400e20` (forward revert commit — never `git reset`, never force-push) |
| `get-resume-order` | redeploy **v100** source (`verify_jwt=true`) |
| `check-payment-status` | redeploy **v90** source (`verify_jwt=false`, `--no-verify-jwt`) |
| Frontend | `vercel rollback` / promote `dpl_7hg2rKjuZSL8ZNzkfsh8MvYmPpmQ` |
| Fixtures | already removed; nothing to clean |

No migration was applied, so there is no schema state to unwind. Rolling back re-opens the forged
payment path described in §3 and should only be done with the owner's explicit decision.

---

## 13. Commits

| SHA | Files | Purpose |
|---|---|---|
| `2e3e84f` | `supabase/functions/get-resume-order/index.ts` | remove client authority from resume payment state |
| `2d864a4` | `supabase/functions/check-payment-status/index.ts` | bind reconciliation to the order |
| `502e8a6` | `assessment/page.tsx`, `PSDStep3Checkout.tsx` | stop the checkouts sending a browser `paidAt` |
| `f400e20` | `scripts/check-resume-payment-authority.mjs`, `package.json` | deploy-blocking guard |
| _(this doc)_ | `docs/ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001.md` | rollout record |

---

## 14. Next task

Not started in this session. Select from the master queue by owner priority; likely candidates are
`GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001`,
`UNIFIED-EMAIL-PHASE-1-CUSTOMER-PORTAL-QA-CLOSURE-001`, or
`ORDER-NOTARY-SERVICE-WORKFLOW-001`. The stopped Pending Delivery QA is **not** to be resumed.

The §11 open item was closed by **`CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001`** (LIVE
`314b644`). The next security task is
**`ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001`** — replace confirmation-id-plus-anon-key
access with an expiring, order-bound resume credential.
