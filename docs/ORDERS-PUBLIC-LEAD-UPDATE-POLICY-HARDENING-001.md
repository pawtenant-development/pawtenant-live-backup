# ORDERS-PUBLIC-LEAD-UPDATE-POLICY-HARDENING-001

**Status:** QUEUED — not started.
**Raised by:** CUSTOMER-PORTAL-ORDER-IDENTITY-LINK-INTEGRITY-AND-SELF-HEALING-001 (2026-08-06).
**Priority:** **P0 — payment-amount forgery is reachable today.** See "Proven exploit chain".
**Scope discipline:** deliberately NOT fixed inside the identity task, at the owner's
instruction. Do not fold it into unrelated work.

---

## Proven exploit chain (verified end to end on TEST, 2026-08-06)

An **authenticated customer** can set the amount they will be charged for their own unpaid
order.

1. **Write.** `orders` carries permissive UPDATE policies (below) with `WITH CHECK (true)`.
   RLS is row-level only — it cannot restrict *which columns* a permitted UPDATE writes.
   Verified with a real customer session (fixture `alpha@idqa2.test`, a plain customer with
   no admin rights) against their own `status='lead'` order:

   ```
   PATCH /rest/v1/orders?confirmation_id=eq.<own lead>   {"price": 1}
   → HTTP 204;  orders.price  129 → 1
   ```

2. **Read-back.** `create-payment-intent` → `resolveLegacyQuoteLock()` reads `orders.price`
   for any order that is not yet paid and, if `savedPrice > 0`, does:

   ```ts
   out.baseCents = savedCents;   // lock the base to the original quoted amount
   ```

   There is **no floor, no comparison against configured pricing, and no sanity bound** —
   whatever is in the column becomes the charge base.

3. **Charge.** `finalAmount` derives from that base and is passed straight to
   `stripe.paymentIntents.create({ amount: finalAmount, ... })`.

**Net effect: a customer can pay $0.01 for a $129 letter.**

### Scope of step 2

The lock is applied when `letterType !== "psd-consultation" && !isBundle` — i.e. **standard
one-time ESA and PSD orders**. RA-bundle orders take `BUNDLE_ONE_TIME_AMOUNT` and the retired
consultation is flat, so those two are not affected by this particular path. Subscriptions
should be re-checked separately; they were not tested.

### What is NOT exposed (checked, do not chase)

- **Anonymous callers cannot reach any order row.** Although the policies below are granted
  to `{public}` (which includes `anon`), an UPDATE with a `WHERE` filter also requires the
  row to pass a SELECT policy, and every `orders` SELECT policy requires
  `auth.uid() is not null` (or admin/provider). Verified: an anon-key PATCH against a real
  lead returned `HTTP 204` but changed **nothing** (0 rows matched). A bare 204 from
  PostgREST does not mean a write happened — always re-read the row.
- **`user_id` and `email` are already protected.** The identity task's
  `orders_protect_identity_columns_trg` rejects those from any client session. Verified:
  `PATCH {"user_id": …}` → `42501 orders.user_id is not writable from a client session`.
  Order hijacking and address re-pointing are closed. **Keep that trigger `SECURITY INVOKER`** —
  as `SECURITY DEFINER`, `current_user` is the function owner, so its trusted-writer bypass
  matched every call and the guard protected nothing (shipped, then caught in testing).

---

## The policies

Verified on TEST (`opudhofjbydrljgleofq`) and LIVE (`cvwbozlbbmrjxznknouq`) via `pg_policies`:

| policyname | roles | `USING` | `WITH CHECK` |
|---|---|---|---|
| `allow_anon_lead_payment_update` | `{public}` | `status = 'lead'` | `true` |
| `anyone_can_update_lead_order` | `{public}` | `status = 'lead'` | `true` |
| `Users can claim their own orders` | `{public}` | `auth.email() = email` | `true` |

They exist because the anonymous/returning checkout updates its own lead in flight from the
browser. Naively dropping them **will break checkout** — which is why the identity task added
a column trigger rather than touching them.

---

## Remaining exposed surface

Every column other than `user_id` / `email` on a row the caller can see and that satisfies a
permitted `USING`. High-consequence examples:

- `price`, `plan_type`, `package_key`, `billing_plan`,
  `includes_reasonable_accommodation_letter` — **pricing and entitlement forgery (proven)**.
- `status`, `paid_at`, `payment_intent_id` — payment-state forgery. `paid_at` has partial
  protection from `orders_lifecycle_before_write`; confirm coverage, do not assume it.
- `letter_type`, `state`, `assessment_answers` — clinical/product routing.
- `doctor_user_id`, `doctor_email`, `doctor_status` — provider assignment.
- `first_name`, `last_name`, `phone` — PII rewrite.
- attribution columns — marketing data integrity.

---

## Required scope

1. **Stop the bleeding first.** The cheapest correct fix for the proven chain is to make
   `resolveLegacyQuoteLock` refuse a saved price that is *below* configured pricing (a legacy
   quote lock only ever needs to preserve an *older, higher-or-equal* quote), and/or to stop
   trusting `orders.price` as a charge basis at all. This alone removes the P0 without
   touching checkout's write path.
2. **Audit the real write surface.** Enumerate every column the anonymous checkout and the
   authenticated portal actually write to a lead, from the code paths
   (`src/pages/assessment/*`, `src/pages/psd-assessment/*`, checkout components) — not from
   assumption. That set is the allowlist.
3. **Pick a mechanism.** RLS cannot do column-level control, so:
   - extend `orders_protect_identity_columns` to a full allowlist (reject any change to a
     non-allowlisted column from a client session); **or**
   - move lead mutation behind a `SECURITY DEFINER` RPC / edge function with a typed payload
     and revoke the direct UPDATE policies (cleaner end-state, larger change); **or** both.
4. **Narrow `USING`** beyond `status='lead'` — also require
   `paid_at is null and payment_intent_id is null`, so a row cannot be reopened for writes by
   flipping status.
5. **Re-check `Users can claim their own orders`.** With `user_id`/`email` now immutable to
   clients it may be entirely redundant — if so, drop it.
6. **Preserve anonymous checkout end to end.** TEST first, browser-verified through a real
   ESA and a real PSD checkout including resume-from-link.
7. **Regression:** identity guarantees from CUSTOMER-PORTAL-ORDER-IDENTITY-LINK-INTEGRITY-001
   must still hold (browser email cannot claim an order; another authenticated user cannot
   claim an order; RLS stays restrictive).

## Out of scope

Do not reopen the completed 181-row identity backfill, the `orders` SELECT policy, or the
self-heal / admin-repair RPCs.

## Reproduction

Sign in as any customer with an unpaid `status='lead'` order, `PATCH` that order's `price`
to `1` with the session JWT, then start checkout. Expected today: Stripe PaymentIntent is
created for $0.01. Verified on TEST at the DB/API layer (steps 1–2); step 3 was **not**
executed against Stripe — no PaymentIntent was created during this investigation.
