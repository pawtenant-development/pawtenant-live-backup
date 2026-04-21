# Skill: Checkout Debug (PawTenant)

## Purpose
Diagnose and isolate issues in the PawTenant checkout flow (Step 3), including:
- terms checkbox blocking submission
- disabled CTA issues
- coupon application inconsistencies
- Stripe payment intent creation
- final amount mismatches
- thank-you page navigation
- purchase tracking failures

This skill is for investigation and root-cause identification.
Use safe-fix.SKILL.md for implementation.

## Scope
Focus ONLY on:
- Step3Checkout.tsx (or equivalent)
- coupon logic (frontend + backend)
- create-payment-intent edge function
- Stripe Elements / payment submission
- thank-you route + purchase completion
- relevant UI state handling

## Required Investigation Flow

### 1. Identify Symptom Clearly
Start by restating:
- what the user sees
- what is blocked (e.g., cannot submit, wrong amount, stuck button)
- what is expected

### 2. Classify Issue Type
Determine which category:

- UI State Issue
  (checkbox, button disabled, validation mismatch)

- Coupon Logic Issue
  (validates in UI but not applied in backend)

- Payment Intent Issue
  (wrong amount, not created, mismatch)

- Submission Flow Issue
  (button click does nothing / blocked)

- Navigation Issue
  (not reaching thank-you page)

- Tracking Issue
  (purchase not firing)

### 3. Trace Frontend Flow
Inspect:
- Step3Checkout.tsx

Focus on:
- terms checkbox state variable
- CTA disabled logic
- validation conditions before submit
- coupon state (applied vs validated)
- data passed to backend

Check:
- is the checkbox state actually true?
- is the button disabled condition using stale or mismatched state?
- is any condition incorrectly blocking submission?

### 4. Trace Backend Flow
Inspect:
- create-payment-intent/index.ts

Check:
- what amount is being used
- whether coupon is applied
- whether fallback DB lookup is triggered
- any hardcoded overrides (e.g., ADMINDISCOUNT90)
- logging presence

### 5. Verify Data Consistency
Check consistency between:
- frontend amount
- backend calculated amount
- Stripe payment intent amount

Look for:
- mismatch between UI discount and backend discount
- coupon validated but not applied to amount

### 6. Check Blocking Conditions
For submission issues, identify:
- all conditions required for button enable
- any condition incorrectly evaluated
- any race condition or async state issue

### 7. Identify Exact Break Point
Pinpoint:
- where the flow diverges from expected behavior

Examples:
- checkbox state true but validation still failing
- coupon marked applied but not included in payload
- backend ignoring coupon path
- button disabled due to incorrect condition

Do NOT stop at symptoms — find the exact failing line or condition.

## Required Output Format

### 1. Problem Summary
Clear description of what is broken.

### 2. Expected Behavior
What should happen.

### 3. Issue Classification
(UI / Coupon / Payment Intent / Submission / Navigation / Tracking)

### 4. Frontend Findings
What the UI code is doing and where it may be wrong.

### 5. Backend Findings
What the backend logic is doing and where it may be wrong.

### 6. Exact Break Point
Precise condition, line, or logic failure.

### 7. Confidence Level
High / Medium / Low

### 8. Safe Next Step
Choose ONE:
- add logging
- inspect specific variable
- move to safe-fix
- verify Stripe behavior

## Style Rules
- Be precise, not vague
- Do not guess — trace logic
- Do not propose fixes unless confident
- Highlight unknowns clearly
- Separate frontend vs backend clearly

## Special PawTenant Rules
- Do NOT assume frontend validation = backend application
- Coupons often validate visually but fail in backend
- Always verify final Stripe amount path
- Be cautious with:
  - terms checkbox logic
  - CTA disable conditions
  - async state updates
  - coupon fallback logic

## Red Flags To Watch
- Hardcoded coupon exceptions
- Silent fallback failures
- Mismatch between UI state and payload
- Disabled button logic using incorrect dependency
- Missing or inconsistent logging