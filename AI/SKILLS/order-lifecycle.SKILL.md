# Skill: Order Lifecycle & Status Integrity (PawTenant)

## Purpose
Ensure PawTenant orders move through the correct lifecycle, keep statuses accurate, and maintain continuity between lead, resumed checkout, payment, provider assignment, review, and completion.

This skill is for diagnosing and enforcing correct order-state behavior.

## Core Goals
- Keep one customer journey tied to one primary recoverable order whenever appropriate
- Prevent messy or misleading status changes
- Ensure payment updates the correct order
- Ensure resumed checkout does not create unnecessary duplicate orders
- Ensure admin portal reflects the true order state

## Environment Assumption
- ALWAYS work in pawtenant-test first
- NEVER propose direct live edits during lifecycle diagnosis
- Use safe-fix.SKILL.md for implementation after diagnosis
- Use deploy-check.SKILL.md before any move to live

## Lifecycle Principles

### 1. Single Order Continuity
If a customer:
- starts assessment
- abandons checkout
- returns later
- uses the same email and/or phone
- pays from a retry or discount link

then the system should prefer reconnecting to the original recoverable order rather than creating a new clutter record.

### 2. Status Must Reflect Reality
Displayed order status must reflect actual order state, not partial or stale signals.

### 3. Payment Must Update the Correct Order
Any completed payment should attach to the correct original order whenever continuity rules apply.

### 4. Duplicate Detection Is Not Enough
A DUP tag is only a warning after duplication already happened.
Prefer preventing or resolving duplicate creation before new clutter is written.

## Common Lifecycle States
Use these as the expected conceptual states:

- lead_unpaid
- resumed_lead
- payment_pending
- paid_unassigned
- under_review
- provider_assigned
- completed
- duplicate_detected
- payment_linked_late
- abandoned_recoverable

Do not assume current DB/UI labels are perfect. Map current implementation to intended lifecycle clearly.

## Required Investigation Flow

### 1. Identify Current Entry Point
Determine how the order entered the system:
- fresh assessment
- resumed checkout
- retry payment link
- discounted payment link
- manual payment link
- webhook reconciliation
- admin manual override

### 2. Identify Current Order of Record
Determine which order SHOULD be treated as the primary order:
- earliest relevant recoverable lead?
- latest unpaid duplicate?
- paid record?
- manually created record?

### 3. Trace Status Logic
Inspect:
- order creation logic
- resume/recovery logic
- payment writeback logic
- webhook/update logic
- admin display logic

Check:
- where status is assigned
- where status is updated
- whether UI and DB status can diverge
- whether payment presence, provider assignment, and review state are mapped correctly

### 4. Trace Continuity Keys
Check how the system matches returning users:
- email
- phone
- confirmation_id
- payment_intent_id
- charge id
- session_id
- metadata

Identify whether continuity is based on reliable keys or weak matching.

### 5. Trace Duplicate Creation Conditions
Identify when a new order is created instead of resuming an existing one.

Check:
- same email
- same phone
- same assessment user returning later
- retry link flow
- discount recovery flow
- manual payment link flow

### 6. Trace Payment Linking
For payments, identify:
- what record receives the writeback
- whether original order is found first
- whether webhook or recovery logic can attach to the wrong/new record
- whether unpaid duplicate records remain even after correct payment

### 7. Identify Exact Lifecycle Break Point
Pinpoint the exact break:
- duplicate created too early
- resumed checkout not reusing original order
- payment linked to wrong order
- status not updated after payment
- admin UI showing stale state

Do not stop at symptoms.

## Required Output Format

### 1. Problem Summary
What lifecycle/status issue is happening.

### 2. Expected Lifecycle Behavior
What should happen instead.

### 3. Current Entry Path
How this order/customer entered the flow.

### 4. Current Order of Record
Which order is currently treated as primary.

### 5. Lifecycle Findings
What current logic is doing across:
- creation
- resumption
- payment
- status update
- admin display

### 6. Exact Break Point
Precise logic failure or mismatch.

### 7. Duplicate Risk Assessment
Whether the issue creates clutter, split history, or payment confusion.

### 8. Safe Next Step
Choose ONE:
- inspect matching logic
- inspect payment writeback path
- inspect status mapping logic
- move to safe-fix

## Style Rules
- Be precise, not vague
- Prefer continuity over duplication
- Do not normalize messy duplicate behavior
- Separate UI status from DB status clearly
- Highlight unknowns clearly
- Do not propose schema changes first unless truly necessary

## Special PawTenant Rules
- If customer returns later with same email or phone, check for recoverable original order first
- Retry payment links should prefer original order continuity
- Discounted payment links should remain tied to original order
- Payment completion should not leave the primary order as Lead (Unpaid)
- Manual override should not become the default recovery strategy
- Admin portal must show the operational truth, not stale placeholders

## Red Flags To Watch
- DUP tag appears often because prevention is weak
- payment exists but original order still shows unpaid
- retry/discount links create new records
- webhook attaches payment to a newer duplicate instead of original order
- UI status depends on incomplete fields
- order continuity depends on only one fragile identifier