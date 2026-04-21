# Skill: Deployment Safety Check (PawTenant)

## Purpose
Ensure any change made in pawtenant-test is safe to move to production (pawtenant-live-backup).

This skill prevents:
- breaking checkout
- breaking Stripe payments
- breaking tracking (Google Ads / Meta)
- breaking admin/provider/customer workflows
- silent production failures

## When To Use
Use this skill BEFORE:
- copying code from test → live
- committing production changes
- deploying via GitHub / Vercel

## Core Principle
No change should reach production without:
- understanding what changed
- understanding risk
- confirming test coverage

## Required Checklist

### 1. Changed Files Summary
List:
- all files modified
- what was changed in each file (1–2 lines only)

Do NOT skip this.

---

### 2. Change Type Classification
Classify the change:

- UI only
- Checkout logic
- Coupon logic
- Payment / Stripe
- Supabase / backend
- Tracking / attribution
- Admin workflow
- Comms (email/SMS/calls)

---

### 3. Critical Risk Areas Check

Explicitly confirm impact on:

#### Stripe
- payment intent creation still correct?
- amount calculation verified?
- webhook behavior unchanged?

#### Checkout Flow
- Step 3 still submits correctly?
- terms checkbox logic intact?
- CTA enable/disable correct?

#### Tracking
- Purchase event still fires?
- no duplicate events?
- no missing events?

#### Supabase
- order creation still works?
- status transitions unchanged?
- no schema mismatch?

#### Admin / Provider / Customer Flows
- order visible in admin?
- provider assignment unaffected?
- email notifications still triggered?

---

### 4. Test Coverage Confirmation
List EXACT tests performed in pawtenant-test:

Example:
- applied coupon → correct discounted amount
- completed payment → reached thank-you page
- verified Stripe dashboard amount
- verified order appears in admin
- verified purchase tracking fires

---

### 5. Edge Case Check
Confirm:
- behavior without coupon
- behavior with coupon
- mobile vs desktop (if relevant)
- retry scenarios (double submit, reload)

---

### 6. Risk Level
Classify overall risk:

- Low → safe to deploy
- Medium → deploy with caution
- High → DO NOT deploy

Explain why.

---

### 7. Safe Deployment Steps
Provide exact steps:

- which folder to copy from → to
- which files specifically
- GitHub commit note suggestion
- whether to deploy immediately or monitor

---

### 8. Post-Deploy Verification
What to check AFTER live deploy:

- test real checkout
- verify Stripe payment
- confirm order appears in admin
- confirm tracking events fire
- confirm no console errors

---

## Style Rules
- Be concise, not vague
- Do not skip checks
- Do not assume “it should work”
- Highlight any uncertainty
- Prefer blocking deployment over risking production

---

## Hard Stop Conditions
STOP and warn if:

- Stripe logic changed without full verification
- checkout submission logic changed but not tested
- payment amounts not verified in Stripe
- webhook-related code modified without confirmation
- multiple unrelated systems changed together

---

## PawTenant-Specific Notes
- Checkout = revenue → treat as high risk always
- Stripe issues can silently lose money → double verify
- Tracking errors can break ad optimization → verify events
- Admin visibility issues delay support → confirm flows