# CHECK-PAYMENT-STATUS-PUBLIC-PII-MINIMISATION-001

**Status:** LIVE COMPLETE — public payment-status PII removed, frontend compatibility, payment
security, cleanup and preservation verified.
**Date:** 2026-08-01
**TEST:** `pawtenant-test`, Supabase `opudhofjbydrljgleofq` — `cb2b8f1` → `01149a4`
**LIVE:** `pawtenant-live-backup`, Supabase `cvwbozlbbmrjxznknouq` — `ba83e6f` → `314b644`
**Canonical domain:** `https://pawtenant.com`

This closes the single open item that held
`ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001` at PARTIAL.

---

## 1. Original exposure

`check-payment-status` runs with `verify_jwt=false`. That is correct and was preserved — the Klarna
"I've completed payment" button and the ESA/PSD thank-you pages call it with no customer session.

But its `toPublicOrder()` projection (added 2026-06-18 by `THANK-YOU-SOURCE-OF-TRUTH`) returned the
whole customer record to **any caller with no credentials at all**, for any supplied
`confirmation_id`. Verified pre-change on both environments with a bare `curl` and no
`Authorization` header:

| Response field | Class |
|---|---|
| `order.first_name`, `order.last_name` | **PII** |
| `order.email` | **PII** |
| `order.price`, `order.coupon_code`, `order.coupon_discount` | order financials / discount |
| `order.plan_type`, `order.delivery_speed` | order detail |
| `order.letter_type` | **sensitive** — discloses ESA vs PSD service selection |
| `order.doctor_name` | provider identity |
| `order.status`, `order.paid_at` | internal workflow state |
| `order.confirmation_id` | redundant echo |
| `sessionId` (success path) | **Stripe identifier** |
| `error` (error path) | raw Stripe / Postgres message |

Affected routes: `/assessment/thank-you`, `/psd-assessment/thank-you`, and the Klarna payment tab —
all unauthenticated. Pre-existing since 2026-06-18; **not** introduced by `ba83e6f`.

---

## 2. Consumer inventory

| Consumer | Read from the response | Needed PII? |
|---|---|---|
| `src/pages/assessment/components/KlarnaPaymentTab.tsx` | `paid`, `reconciled`, `paymentStatus`, `error` | no |
| `src/pages/assessment-thankyou/page.tsx` | `order.{first_name,last_name,email,price,plan_type,delivery_speed,doctor_name,confirmation_id}` | **no** — every field had a local fallback |
| `src/pages/psd-assessment-thankyou/page.tsx` | same set | **no** — same fallbacks |

Nothing else calls the endpoint (`OrderDiscountBreakdown.tsx` only mentions it in a comment).

Decisive finding: every PII field the pages read already had a local source — this browser's own
`sessionStorage` / navigate state, plus the `?order_id=` and `?amount=` params that
`create-checkout-session` and the inline-card paths stamp. The server never needed to supply any of
it.

---

## 3. New public contract

Built by hand in `toPublicPaymentStatus()`. **Exactly** these keys, nothing else:

```jsonc
{
  "paid": true,                 // boolean
  "paymentStatus": "paid",      // "paid" | "unpaid"
  "reconciled": false,          // boolean
  "nextStep": "none",           // "none" | "retry" | "contact_support"
  "code": "paid",               // "paid" | "unconfirmed" | "invalid_request" | "error"
  "confirmationId": "PT-XXXX"   // ECHO of a caller-supplied confirmationId only
}
```

`confirmationId` is **never** resolved from a `sessionId` / `paymentIntentId`, so a Stripe
identifier can never be turned into someone's order number.

**Forbidden and now absent:** every field in §1 — names, email, phone, address, price, amount,
discounts, plan/delivery/letter type, provider, Stripe identifiers of any kind, workflow status,
`paid_at`, raw rows, and raw error messages.

**Defence in depth:** the `orders` SELECT no longer even *reads* the PII columns
(`id, confirmation_id, checkout_session_id, payment_intent_id, paid_at, status` only). If the row
does not carry it, it cannot leak.

### Enumeration hardening

Unpaid, cancelled, stored-identifier and completely unknown orders now return **byte-identical**
bodies. A Stripe lookup failure was previously allowed to fall through to `code:"error"`, which told
an unauthenticated caller "this order has a stored Stripe identifier that did not resolve" — an
existence oracle. It now collapses into the same `unconfirmed` answer.

### Cached-client behaviour

No compatibility shim was needed and none was added. The pre-fix bundle's exact handling is
`if (j && j.order) setDbOrder(j.order)`. With `order` absent that is falsy, `dbOrder` stays `null`,
and every local fallback engages. Verified by replaying the old handler against the new endpoint:
`dbOrder=null`, `firstName="there"`, `email=""`, `price=90`, `provider=""`, **no crash, no PII**.

---

## 4. Frontend changes

Both thank-you pages now use only local sources. Personalization survives from the customer's own
device — the greeting is unchanged for the normal same-browser flow and degrades to "there" for a
cross-tab arrival. No PII is fetched to support it.

The reconciler call is retained but is now **purely fire-and-forget**: it exists to trigger
server-side reconciliation, not to fetch anything.

Provider name is gone from both pages. At thank-you time no provider is assigned yet, so the block
does not render and the copy falls back to the generic "A licensed provider".

**Amount — a real regression that was compensated.** A Checkout Session opened in a NEW tab has
neither `?amount=` nor the originating tab's `sessionStorage`; `dbOrder.price` used to cover that
case. Rather than render the base-price DEFAULT as if it were the amount charged — wrong for any
discounted order — a `priceKnown` guard suppresses the figure:

- "Plan Purchased" renders `Standard` instead of `Standard ($90)`
- "Amount Paid" renders `See your emailed receipt`
- the Payment Confirmed step drops the amount from its copy

Verified in the browser both ways: with `?amount=109` the figure renders; without it, the
suppression text renders and no wrong number is shown.

`KlarnaPaymentTab` reads the generic `code` instead of the removed raw `error` string.

---

## 5. Logging privacy

No email, name, phone, raw order row, request body or Stripe secret is logged. Confirmation ids go
through `logRef()`, which truncates to 6 characters. The reconcile log drops the Stripe identifiers
and the amount; that detail still lives in the **admin-only** `audit_logs` row, so the operator
signal is unchanged. Production logs were inspected and contain no fixture PII.

---

## 6. Privacy matrix (both environments, unauthenticated)

Recursive key + value scan against a forbidden list (names, email, phone, address, pet, provider,
price, amount, Stripe ids, subscription, document, verification, notes, coupon, plan/delivery/letter
type, `paid_at`) and against fixture value fragments (`@pawtenant.test`, surnames, `esa`/`psd`,
`Dr `, `cs_`, `pi_`, `SAVE20`).

| Order state | Result |
|---|---|
| unpaid | 6 allowlisted keys, **0 forbidden keys, 0 sensitive values** |
| unpaid with stored session id | identical body to plain unpaid |
| paid / completed | 6 keys, `paid:true`, no PII |
| refunded | 6 keys, no PII |
| cancelled | identical body to unpaid |
| unknown / random ids | identical body to unpaid |
| **real production order** (`PT-MS9S1TW8`, read-only) | 6 keys, no PII — **the decisive proof** |

### Attack tests

| Test | Result |
|---|---|
| cross-order checkout session | `unconfirmed`, no mutation, audit row written |
| cross-order payment intent | `unconfirmed`, no mutation |
| malformed JSON | generic `code:"error"`, no leak |
| empty body | generic `code:"error"`, no leak |
| no identifiers | `code:"invalid_request"` (request-level, order-independent) |
| random / odd confirmation ids | uniform `unconfirmed` |
| SQL-injection-shaped id | blocked upstream by Cloudflare WAF; the function also uses parameterized `.eq()` |
| 5 sequential | identical, no drift |
| 8 concurrent | 8/8 identical, no drift |

---

## 7. Payment-security regression (from `ba83e6f`) — no regression

| Protection | Result |
|---|---|
| forged `paidAt` + `status:"processing"` + fabricated PI | ignored; order stayed `lead`, `paid_at` NULL, **PI not written** |
| cross-order identifier binding | still refuses, audit row still written |
| `.is("paid_at", null)` idempotency guard | intact (guard P12) |
| server `paid_at` timestamp | intact (guard P13) |
| `check-payment-status` `verify_jwt` | **false** — preserved |
| `get-resume-order` `verify_jwt` | **true** — untouched, v101 |
| anonymous `get-resume-order` | HTTP **401** |
| `check:resume-payment-authority` | 16/16 PASS on both repos |

---

## 8. Guards and build

`scripts/check-public-payment-status-privacy.mjs` — `npm run check:public-payment-privacy`
(self-test: `npm run test:public-payment-privacy`). Deploy-blocking, wired into both build chains
after `check-resume-payment-authority`.

**15/15 checks pass; 17/17 planted negative controls trip** in both repos. Controls include adding
`email` / `first_name` / `last_name` / `price` to the allowlist, adding `payment_intent_id` to a
response, spreading the order row, logging the raw row, logging a full confirmation id,
reintroducing frontend name personalization, removing identifier binding, dropping the idempotency
guard, flipping the JWT contract, returning the raw error message, re-adding PII to the SELECT, and
bypassing the allowlist with an ad-hoc body.

> One control initially reported **NO-OP** on LIVE: its anchor was an interface that had since been
> replaced by a contract comment, so the mutation changed nothing. A control that cannot mutate the
> source proves nothing — it was re-anchored and re-verified at 17/17 in both repos. The earlier
> "17/17" reading on TEST predated the interface removal and was stale.

| Check | TEST | LIVE |
|---|---|---|
| `check:public-payment-privacy` | 15/15 | 15/15 |
| `test:public-payment-privacy` | 17/17 controls | 17/17 controls |
| `check:resume-payment-authority` | 16/16 | 16/16 |
| `check-edge-function-modules` | 4/4 | 3/3 |
| `npm run build` | **exit 0** | **exit 0** |
| `type-check` | 7 errors — baseline, none in task files | 9 errors — baseline, none in task files |

---

## 9. Deployment

| | TEST | LIVE |
|---|---|---|
| `check-payment-status` | v49 (from v47) | **v91 → v92** |
| `verify_jwt` | `false` preserved | **`false` preserved** |
| `get-resume-order` | untouched | untouched, v101, `verify_jwt=true` |
| Vercel | n/a (verified via dev server) | **`dpl_47ng9mLqibgHTaLmxMG3rdaftixp`** READY |
| Aliases | — | `pawtenant.com`, `www.pawtenant.com` |
| Previous deployment (rollback) | — | `dpl_24uR8qpTannZDKTe1wyDQky1xKix` |
| Vercel project | — | `pawtenant-production` (`prj_Fgggz5TXMHk9ohNAjeyNkg6o1Tfj`, team `team_XfWlgijQ0EC5fkEKpxi7Rz3l`), `vercel whoami` = `pawtenant-3686` |

### Active-bundle proof

161 chunks downloaded from `pawtenant.com`. The two chunks that call `check-payment-status` no
longer read `j.order` at all, and the fetch is fire-and-forget with no response handler. The
remaining `first_name` / `doctor_name` occurrences elsewhere in the bundle set belong to
**authenticated** admin/doctor surfaces reading RLS-protected queries — unrelated to this endpoint.

---

## 10. Side effects

| Side effect | Count |
|---|---|
| Stripe objects / charges / refunds / payment intents | **0** |
| Stripe API writes | **0** (read-only `retrieve` only, which 404'd on synthetic ids) |
| Google Ads conversion uploads | **0** (33 → 33) |
| GHL forwarding for fixtures | **0** |
| Real emails / SMS / marketing enrolment | **0** |
| Provider earnings | **0** (502 → 502, hash identical) |
| Fixture notifications / communications | **0** |

---

## 11. Cleanup

| Object | TEST | LIVE |
|---|---|---|
| Fixture orders | `PT-QA-PII-91..95` → **0** | `PT-LIVE-PENDINGQA-81..85` → **0** |
| Fixture lifecycle events | **0** | **0** |
| Fixture audit rows | **0** | **0** |
| Orders with `@pawtenant.test` email | **0** | **0** |
| Synthetic profiles / auth identities | **0** | **0** |
| Fixture GHL / Ads / communications / earnings / Storage | **0** | **0** |

LIVE retains 28 `audit_logs` rows under `PT-LIVE-PENDINGQA-51/52/61/71`. Those are **append-only
evidence from earlier Pending Delivery QA sessions dated 2026-07-31**, pre-date this task, and were
correctly left untouched — this task's cleanup was scoped to the `8x` fixtures it created.

---

## 12. Preservation

| Metric | Before (LIVE, `ba83e6f` close-out) | After | Δ |
|---|---|---|---|
| orders total | 1750 | 1750 | 0 |
| orders paid | 492 | 492 | **0** |
| orders refunded | 23 | 23 | 0 |
| doctor_earnings | 502 | 502 | 0 |
| payment_attempts | 659 | 659 | 0 |
| google_ads_conversion_uploads | 33 | 33 | 0 |
| **earnings hash** | `aa54cee359f3e41125d8a41c12627787` | `aa54cee359f3e41125d8a41c12627787` | **IDENTICAL** |
| orders completed | 470 | 471 | +1 — explained |
| order_lifecycle_events | 376 | 380 | +4 — explained |
| communications | 10074 | 10081 | +7 — explained |
| ghl_sync_logs | 9263 | 9265 | +2 — explained |
| doctor_notifications | 1353 | 1354 | +1 — explained |
| audit_logs | 10340 | 10354 | +14 — explained |

**Every delta traces to one real customer order, `PT-MS9S1TW8`**, progressing through normal
fulfilment during the session: `entered_pending_delivery` 15:09 → `provider_completed` +
`customer_notified` 15:38, with the matching delivery emails, GHL sync, provider notification and
audit rows. Genuine production activity, not caused by this task.

**Decisive payment-preservation evidence:** `count(*) from orders where paid_at > now() - interval
'4 hours'` = **0**. No order gained or changed a payment timestamp during this session. `orders_paid`
is unchanged at 492 and the earnings hash is byte-identical. The whole-table `orders` hash moved only
because it includes `status`, and exactly one real order's status advanced `processing → completed`.

TEST preservation is exact: `orders_hash` `38cf233d94c103cd6a4e978e99eaa0d7` **identical** before and
after, 587 orders / 147 paid unchanged.

**Note on baseline discipline:** a fresh LIVE database baseline was not re-captured immediately
before creating this task's LIVE fixtures; the close-out numbers from
`ORDER-RESUME-CLIENT-PAID-AT-HARDENING-LIVE-ROLLOUT-001` (~1.5 h earlier, same session) were used as
the effective baseline. Every delta is nonetheless individually explained above.

---

## 13. Residual risks

1. **Paid-order existence oracle (by design, unavoidable here).** A caller who guesses or obtains a
   confirmation id of a *paid* order still learns `paid:true`. Unpaid and unknown orders are now
   indistinguishable, but a paid/unpaid distinction is the endpoint's entire purpose. Removing this
   requires an expiring, order-bound credential — that is
   `ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001`, deliberately out of scope here.
2. **`get-resume-order` read path.** Still authorises by `confirmation_id` + anon key and still
   returns order detail including customer fields. Untouched by this task and covered by the same
   secure-token follow-up.
3. **Amount display on new-tab Checkout Session arrivals.** Now correctly suppressed rather than
   wrong. Restoring an accurate figure without public disclosure would mean stamping the final
   charged amount into the Stripe `success_url`; `create-checkout-session` builds that URL before the
   post-coupon total is known, so it was not attempted here.
4. **No rate limiting** on the endpoint. Out of scope; relevant to the secure-token task.

---

## 14. Rollback

Forward-only.

| Layer | Restore to |
|---|---|
| TEST repo | revert `c94951a`, `88b67a7`, `01149a4` |
| LIVE repo | revert `c897b63`, `6abfe6b`, `314b644` (forward revert commit — never `git reset`, never force-push) |
| `check-payment-status` LIVE | redeploy **v91** source (`--no-verify-jwt`) |
| `check-payment-status` TEST | redeploy v47 source (`--no-verify-jwt`) |
| Frontend | promote `dpl_24uR8qpTannZDKTe1wyDQky1xKix` |
| Fixtures | already removed |

No migration was applied. Rolling back re-opens the unauthenticated PII disclosure.

---

## 15. Commits

| SHA | Repo | Files | Purpose |
|---|---|---|---|
| `c94951a` | TEST | `check-payment-status/index.ts` | public response minimization |
| `88b67a7` | TEST | 2 thank-you pages, `KlarnaPaymentTab.tsx` | frontend compatibility |
| `01149a4` | TEST | guard, `package.json` | privacy guard |
| `c897b63` | LIVE | `check-payment-status/index.ts` | public response minimization |
| `6abfe6b` | LIVE | 2 thank-you pages, `KlarnaPaymentTab.tsx` | frontend compatibility |
| `314b644` | LIVE | guard, `package.json` | privacy guard |

Each LIVE delta was verified line-for-line identical to its TEST counterpart before commit.

---

## 16. Next task

`ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-001` — replace confirmation-id-plus-anon-key
access with an expiring, order-bound resume credential, closing residual risks 1, 2 and 4.
