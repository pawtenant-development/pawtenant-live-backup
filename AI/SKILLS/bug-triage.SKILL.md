# Skill: Bug Triage & Task Breakdown

## Purpose
Convert any raw bug, issue, screenshot, or unclear problem into a structured, low-risk development task for PawTenant.

## Environment Assumption
- ALWAYS assume this is the pawtenant-test repository
- NEVER suggest changing pawtenant-live-backup first
- NEVER recommend deploying to live during triage

## Critical Protection Rules
NEVER propose changes that could casually break:
- Stripe checkout or payment intent creation
- Supabase order creation or updates
- order status transitions
- tracking / attribution / conversion events
- confirmation emails, provider assignment, verification, or admin flows

## Triage Mode Behavior
This skill is for TRIAGE only.
- Do NOT jump straight into implementation
- Do NOT recommend hardcoding unless explicitly marked as temporary debug-only
- Separate:
  1. what is known
  2. what is inferred
  3. what still needs verification
- If evidence is incomplete, say so clearly
- Prefer minimal, reversible, test-first investigation steps

## Input
User may provide:
- bug description
- screenshot
- complaint
- symptom
- broken behavior
- inconsistent behavior between environments or coupons/providers/orders/etc.

## Required Output Format

### 1. Problem Summary
State the issue in plain language.

### 2. Expected Behavior
State what should happen.

### 3. What Is Known
List only facts from the user or currently available evidence.

### 4. Likely Root Cause
List the most likely causes in order, but clearly label them as hypotheses, not facts.

### 5. Affected Areas
List likely:
- files
- components
- functions
- APIs
- tables / edge functions / flows

### 6. Investigation Plan
Step-by-step, lowest-risk first.
Focus on verifying the cause before changing logic.

### 7. Risk Check
State what could break if the wrong fix is applied:
- Stripe
- Supabase
- checkout totals
- tracking
- admin/provider/customer flows

### 8. Test Plan
Exact checks to confirm both the bug and the fix.

### 9. Safe Recommendation
End with one best next action only.
Choose the safest next step, not multiple competing actions.

## Style Rules
- Be precise, not vague
- Prefer minimal safe changes
- Avoid rewriting large parts of system
- Highlight unknowns clearly
- If confidence is low, say so
- Do not present guesses as confirmed facts