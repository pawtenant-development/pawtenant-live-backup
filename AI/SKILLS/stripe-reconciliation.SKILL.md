# Skill: Stripe Reconciliation & Payment Linking (PawTenant)

## Purpose
Ensure all Stripe payments correctly reconcile back to the intended PawTenant order, without requiring manual linking.

This skill diagnoses and enforces correct Stripe → Supabase order mapping.

## Core Goals
- Ensure payments automatically attach to the correct order
- Prevent "Payment Not Linked" scenarios
- Eliminate need for manual linking where possible
- Ensure webhook and fallback logic are reliable

## Environment Assumption
- ALWAYS operate in pawtenant-test
- NEVER deploy to live without deploy-check.SKILL.md
- Use order-lifecycle.SKILL.md to determine correct target order
- Use payment-recovery.SKILL.md for recovery flow context
- Use safe-fix.SKILL.md for implementation

## Key Systems Involved
- Stripe (PaymentIntent / Checkout Session / Charge)
- Supabase orders table
- stripe-webhook edge function
- manual link payment flow
- recovery payment flows

## Required Investigation Flow

### 1. Identify Payment Source
Determine how payment was created:
- create-payment-intent
- Stripe Checkout Session
- retry link
- discount link
- manual payment link
- external/manual Stripe payment

### 2. Identify Available Identifiers
Check what identifiers exist:
- confirmation_id
- order_id
- payment_intent_id
- charge_id
- email
- metadata fields

### 3. Inspect Stripe Metadata
Verify:
- metadata passed when creating payment
- whether order reference is included
- consistency across flows (normal vs recovery vs manual)

### 4. Trace Webhook Handling
Inspect stripe-webhook:

Check:
- which event is used (payment_intent.succeeded, checkout.session.completed, etc.)
- how order is matched
- whether matching prioritizes:
  1. confirmation_id
  2. payment_intent_id
  3. email fallback

### 5. Trace Matching Logic
Identify how system finds the order:

Check:
- whether it finds the original order or a duplicate
- whether it fails silently
- whether fallback logic is weak or inconsistent

### 6. Identify Failure Mode

Common issues:
- metadata missing or inconsistent
- webhook not triggered or not processed
- order match fails → no update
- match attaches to wrong (duplicate) order
- payment exists but no DB writeback
- delayed writeback or race condition

### 7. Verify Order Update Logic
Check:
- where payment_intent_id is written
- where status is updated
- whether status depends on multiple fields
- whether UI reflects DB state correctly

## Required Output Format

### 1. Problem Summary
What reconciliation issue is occurring.

### 2. Expected Behavior
What should happen instead.

### 3. Payment Source
How the payment was created.

### 4. Available Identifiers
What data exists for matching.

### 5. Findings
What current system does:
- metadata
- webhook handling
- matching logic
- DB update

### 6. Exact Break Point
Where linking fails.

### 7. Risk Assessment
- lost revenue visibility
- duplicate paid orders
- admin confusion
- manual workload increase

### 8. Safe Next Step
Choose ONE:
- fix metadata propagation
- fix webhook matching logic
- add fallback matching logic
- move to safe-fix

## Style Rules
- Do not assume Stripe automatically links to DB
- Always verify metadata explicitly
- Prefer deterministic matching over fallback guesses
- Avoid silent failures
- Highlight missing identifiers clearly

## Special PawTenant Rules
- Every payment must map to exactly one intended order
- Payment should not create a new order unless explicitly designed
- Manual linking should be fallback, not default
- confirmation_id should be primary matching key if available
- webhook must reliably update order status

## Red Flags To Watch
- "Payment Not Linked" appears frequently
- payment exists but order still shows unpaid
- webhook logs show success but DB not updated
- multiple orders share similar identifiers
- metadata differs across payment flows
- matching logic uses weak fallback (email only)