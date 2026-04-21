# Skill: Payment Recovery & Link Integrity (PawTenant)

## Purpose
Handle retry payments, discount recovery, and manual payment links in a way that preserves order continuity and prevents duplicate clutter.

This skill ensures all payment flows correctly attach to the intended order.

## Core Goals
- Ensure retry and discount flows reconnect to the original order
- Prevent new order creation during recovery unless necessary
- Ensure Stripe payments map back to the correct order
- Ensure admin recovery actions do not create data inconsistency

## Environment Assumption
- ALWAYS operate in pawtenant-test
- NEVER modify live repo directly
- Use order-lifecycle.SKILL.md for continuity decisions
- Use safe-fix.SKILL.md for implementation

## Recovery Flow Types

### 1. Retry Payment Link
- Sent after abandoned checkout
- Should resume existing order
- Must NOT create a new order unless original is invalid

### 2. Discount Recovery Link
- Sent to incentivize conversion
- Must:
  - apply correct discount
  - remain tied to original order
  - update same order on payment

### 3. Manual Payment Link (Admin Generated)
- Used in support cases
- Must:
  - link payment back to correct order
  - not create orphan payment records
  - not create duplicate paid orders

## Required Investigation Flow

### 1. Identify Recovery Entry Point
Determine how the payment was triggered:
- retry button
- discount email
- manual link
- direct checkout

### 2. Identify Target Order
Find which order SHOULD receive the payment:
- original lead?
- duplicate?
- newly created record?

### 3. Trace Link Generation
Inspect:
- where payment link is created
- what identifiers are included (metadata)
- whether confirmation_id or order_id is passed

### 4. Trace Stripe Metadata
Check:
- metadata passed into Stripe
- whether order reference is included
- whether recovery links preserve context

### 5. Trace Payment Writeback
Inspect:
- stripe-webhook
- reconciliation logic
- manual linking logic

Check:
- how system finds order to update
- whether it prefers original order or latest duplicate

### 6. Identify Break Point
Common failures:
- recovery link missing order reference
- metadata mismatch
- webhook attaching payment to wrong record
- fallback creating new order instead of updating existing

## Required Output Format

### 1. Problem Summary
What recovery/payment issue is happening.

### 2. Expected Behavior
What should happen instead.

### 3. Recovery Entry Path
How the user reached payment.

### 4. Target Order
Which order should be updated.

### 5. Findings
What system currently does:
- link generation
- metadata handling
- webhook behavior

### 6. Exact Break Point
Where the failure occurs.

### 7. Risk Assessment
- duplicate orders
- lost attribution
- incorrect payment linking
- admin confusion

### 8. Safe Next Step
Choose ONE:
- inspect metadata flow
- inspect webhook matching logic
- inspect retry link generation
- move to safe-fix

## Style Rules
- Do not assume Stripe handles linking automatically
- Always verify metadata
- Prefer updating existing order over creating new one
- Avoid silent fallback behavior
- Highlight inconsistencies clearly

## Special PawTenant Rules
- Retry links should always prefer original order
- Discount links must not create new orders
- Manual payment links must preserve order mapping
- Payment completion must update order status immediately
- Recovery flows should not rely only on frontend state

## Red Flags To Watch
- retry link creates new order
- discount applied but not reflected in final Stripe amount
- payment succeeds but order remains unpaid
- manual payment creates disconnected record
- webhook attaches payment to wrong order
- missing or inconsistent metadata