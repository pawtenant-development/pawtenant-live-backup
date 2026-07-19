# STRIPE-WEBHOOK-SIGNATURE-FAIL-CLOSED-LIVE-ROLLOUT-001

**Status:** ✅ LIVE COMPLETE — Stripe webhook signature enforcement verified.
**Date:** 2026-07-19 · **Owner-authorized** urgent security rollout.

## Owner authorization
Hamza explicitly authorized the LIVE mirror of the already-verified TEST fix
STRIPE-WEBHOOK-SIGNATURE-FAIL-CLOSED-001 (TEST code `4d5ad89`, docs `f3482db`, TEST fn v61).
Scope: LIVE Stripe webhook signature enforcement only — nothing else.

## Confirmed vulnerability (fixed)
Deployed LIVE `stripe-webhook v147` (verify_jwt=false) verified the Stripe signature only when
`webhookSecret && sigHeader` were both present; otherwise it ran `JSON.parse(rawBody)` and dispatched
the **unsigned** body as a real event. With verify_jwt=false at the gateway, an unauthenticated caller
could **omit the `stripe-signature` header** and submit crafted JSON that reached event dispatch
(forge `payment_intent.succeeded`, `charge.refunded`, etc.). High severity.

## Fix (surgical mirror of TEST 4d5ad89)
Fail closed — authenticate ONLY when the secret is set, `stripe-signature` is present, and Stripe's
official `constructEventAsync` verifies against the untouched raw body. **No `JSON.parse` fallback**,
no unsigned/query-param/env bypass, no shape-based acceptance.
- New `supabase/functions/stripe-webhook/verifyStripeSignature.ts` — pure injectable `authenticateStripeWebhook` (**byte-identical to the approved TEST file**).
- New `verifyStripeSignature_test.ts` — 10 deterministic tests (byte-identical to TEST).
- `stripe-webhook/index.ts` — import + auth-block replacement ONLY. **All LIVE payment / subscription / refund / email / SMS / order-processing / Google-Ads / Meta trigger logic preserved** (LIVE's auth block was byte-identical to TEST's old block; nothing else touched).

## Authentication flow
raw body read once → no secret → 500 "Server configuration error" → no `stripe-signature` → 400
"Webhook signature required" → `constructEventAsync` fails → 400 "Webhook signature mismatch" →
else dispatch the Stripe-verified event only.

## Repos / commit
- **LIVE starting SHA:** `9bf3ee3` → **LIVE code SHA `b83f74b`** (3 files, +199/−9). Pushed to `origin/main`.
- TEST source mirrored: `4d5ad89`. TEST untouched by this task.

## Deployment
| Function | old → new | verify_jwt | rollback | timestamp |
|---|---|---|---|---|
| stripe-webhook | **v147 → v148** | false (preserved) | **v147** | 2026-07-19 12:32:10 UTC |
`create-refund` (v101) and `sync-google-ads-conversions` (v82) **NOT deployed / unchanged.**
Deploy: `supabase functions deploy stripe-webhook --project-ref cvwbozlbbmrjxznknouq --no-verify-jwt`.

## Verification
- Unit: **10/10** LIVE (`node --test verifyStripeSignature_test.ts`); byte-parity with approved TEST files confirmed.
- Negative control: reintroducing the unsigned fallback in a scratchpad copy → **4 failures** (sig 2/5/6/7); real files untouched. Secret scan clean; `git diff --check` clean.
- Deployed-source check (v148): imports + calls `authenticateStripeWebhook`; **`JSON.parse(rawBody)` fallback ABSENT**; verify_jwt=false.
- Post-deploy probes (LIVE endpoint): A) unsigned JSON → **400 `Webhook signature required`**; B) invalid signature → **400 `Webhook signature mismatch`**; C) non-JSON no sig → **400 `Webhook signature required`** (before parse). No valid/forged signed event sent.
- DB no-write: before == after (orders_paid **412**, orders_refunded **18**, order_status_logs **1237**, payment_attempts **526** — identical, timestamps unchanged; 0 probe-attributable rows). Probes 400 before the Supabase client is created.

## Safety
No payment · no refund · no subscription · no event resend · no customer communication · no Google Ads
upload · no other Edge Function deployed · no secret/env change · no TEST change. Only the 3 webhook
files changed; production payment-processing code outside authentication is untouched.

## Rollback
Redeploy the prior **v147** source (`git show 9bf3ee3:supabase/functions/stripe-webhook/index.ts`) with
`--no-verify-jwt`. (Not expected — the signed path is unchanged; real Stripe deliveries with valid
signatures continue to process exactly as before.)
