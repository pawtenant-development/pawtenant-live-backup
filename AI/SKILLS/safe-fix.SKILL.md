# Skill: Safe Fix Implementation

## Purpose
Implement low-risk fixes inside pawtenant-test after triage is complete, while protecting checkout, Stripe, Supabase, tracking, and admin workflows.

## Environment Assumption
- ALWAYS work only in pawtenant-test
- NEVER edit pawtenant-live-backup during this skill
- NEVER suggest live deployment as part of implementation
- Stop at test-ready changes unless explicitly asked to continue

## Critical Protection Rules
Do not casually break or rewrite:
- Stripe payment flow
- create-payment-intent logic without understanding current flow
- stripe-webhook behavior
- Supabase order creation / updates / status transitions
- thank-you page conversion behavior
- tracking / attribution / pixels / Google Ads / Meta dedup
- provider assignment, verification, or email flows
- admin portal order visibility and current operational flows

## Required Implementation Process

### 1. Read Before Editing
Before changing code:
- inspect the relevant files
- identify current logic path
- summarize what the code is doing now
- state what minimal change is proposed

Do NOT jump into editing without first understanding the relevant code.

### 2. Minimal Change Rule
Prefer:
- the smallest safe patch
- reversible edits
- localized fixes
- preserving existing architecture

Avoid:
- broad rewrites
- renaming many files
- changing unrelated logic
- “cleanup” changes mixed into a bug fix

### 3. Evidence-Based Edits
Only implement changes supported by:
- current code behavior
- triage findings
- logs
- reproducible symptoms

Do not turn guesses into code.

### 4. Debug-First When Needed
If root cause is not fully confirmed:
- add targeted temporary logging first
- make it easy to remove later
- keep logging scoped to the affected flow only

### 5. Preserve Existing Business Logic
When fixing bugs, preserve:
- existing form data mapping
- existing DB structure unless explicitly approved
- current live operational expectations
- current order/admin/provider/customer workflows

### 6. Test-Ready Stop Point
After implementing:
- stop at a clean test-ready state
- summarize changed files
- explain what changed
- explain what to test
- explain risk areas to re-check

Do not continue into live promotion.

## Required Output Format

### 1. Current Understanding
What the relevant code is doing now.

### 2. Proposed Minimal Fix
What exact change will be made and why.

### 3. Files To Change
List only the files that actually need edits.

### 4. Risk Check
What could still be affected:
- Stripe
- Supabase
- checkout UX
- tracking
- admin/provider/customer flows

### 5. Implementation Summary
After edits, summarize:
- exact files changed
- exact logic changed
- any logging added
- anything intentionally not changed

### 6. Test Instructions
Give exact steps to verify in pawtenant-test.

### 7. Rollback Note
Explain the simplest rollback path if the patch behaves badly.

## Style Rules
- Be precise, not vague
- Prefer minimal safe changes
- Keep scope tight
- Highlight unknowns clearly
- Separate fact from assumption
- Do not present speculative fixes as confirmed
- Do not bundle unrelated improvements into the same patch

## Special Rules For PawTenant
- If checkout is involved, be extra cautious with:
  - terms checkbox state
  - button disabled logic
  - coupon application
  - payment intent creation
  - thank-you navigation
  - purchase tracking
- If Stripe is involved, verify whether the issue is:
  - frontend only
  - backend only
  - webhook/writeback related
  - reconciliation related
- If comms are involved, distinguish:
  - delivery failure
  - logging failure
  - notification visibility failure
  - workflow trigger failure

## Refusal / Pause Conditions
Pause and ask for confirmation before proceeding if:
- the change requires schema changes
- the change touches many unrelated files
- the safest next step is investigation/logging rather than a direct fix
- the requested fix conflicts with critical protection rules