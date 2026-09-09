# LIVE-PSD-ONE-TWO-DOG-129-ROLLOUT-001

Date: 2026-09-09 (America/New_York)  
Environment: LIVE  
Owner approval: explicit — “Approve LIVE PSD 1–2 dog $129 rollout.”

## Contract

- PSD Standard one-time, 1 dog: $129.
- PSD Standard one-time, 2 dogs: $129.
- PSD Standard one-time, exactly 3 dogs: $149 fixed total.
- Invalid counts (0, 4+, non-integer) remain rejected at the request boundary and by the strict server helper.
- ESA, subscriptions, RA bundles, historical orders, Stripe Price IDs, refunds and payouts are unchanged.

## Implementation

- Added matching strict `psdOneTimeTier` / `psdOneTimeCents` server pricing helpers.
- Both one-time PSD payment paths now use `psdOneTimeCents`:
  - `create-payment-intent` (card / PaymentIntent)
  - `create-checkout-session` (Klarna / QR Checkout Session)
- Updated the client pricing resolver, pricing cards, public PSD pages, assessment helper text, admin pricing reference and AI support source copy.
- Added an idempotent data migration for the two affected `site_pricing_settings` labels/descriptions. Amounts remain 12900 and 14900 cents.

## Verification before rollout

- Full production build: exit 0.
- Focused pricing/delivery guards: pass.
- Type-check: same 8 pre-existing errors; none in changed files.
- No real order or payment was created during validation.

## Rollback

Revert the feature commit, redeploy the previous versions of both payment functions with their existing `verify_jwt` setting, and restore the previous two display labels/descriptions. Historical orders require no rollback because no order row is rewritten.
