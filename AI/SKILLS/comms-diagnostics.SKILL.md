# Skill: Communication Diagnostics & Visibility (PawTenant)

## Purpose
Ensure all customer communication events (calls, SMS, emails) are reliably captured, logged, and visible in the admin portal.

This skill diagnoses missing notifications, logging failures, and visibility gaps.

## Core Goals
- Ensure no customer interaction is missed
- Ensure calls, SMS, and emails are visible in admin
- Ensure notifications are triggered reliably
- Prevent silent failures in communication flows

## Environment Assumption
- ALWAYS operate in pawtenant-test
- NEVER deploy to live without deploy-check.SKILL.md
- Use safe-fix.SKILL.md for implementation

## Systems Involved
- GHL (GoHighLevel)
- SMS / Call workflows
- Webhooks (GHL → Supabase)
- Supabase (comms logs / orders table)
- Admin portal (Comms tab)
- Email system (Resend / Gmail)

## Required Investigation Flow

### 1. Identify Event Type
What happened:
- inbound call
- outbound call
- SMS sent/received
- email sent/received

### 2. Trace Event Origin
Where event originates:
- GHL workflow
- manual action
- automated sequence
- external system

### 3. Verify Event Trigger
Check:
- was workflow triggered?
- was webhook sent?
- was API call executed?

### 4. Verify Data Transmission
Check payload:
- email
- phone
- confirmation_id (if available)
- message body
- event type

### 5. Verify Backend Logging
Check:
- did Supabase receive the event?
- was it written to correct table?
- is it linked to an order?

### 6. Verify Order Linking
Check:
- is event attached to correct order?
- or just floating without linkage?

### 7. Verify Admin Visibility
Check:
- appears in Comms tab?
- appears in order timeline?
- appears in dashboard?

### 8. Verify Notifications
Check:
- did admin get notified?
- SMS alert?
- email alert?
- GHL notification?

## Common Failure Modes

- workflow triggered but webhook not sent
- webhook sent but not processed
- event logged but not linked to order
- event linked but not displayed in UI
- UI shows partial data (phone only, no context)
- notifications not triggered
- multiple systems out of sync

## Required Output Format

### 1. Problem Summary
What communication issue occurred.

### 2. Event Type
Call / SMS / Email

### 3. Source System
GHL / internal / external

### 4. Data Flow Trace
Step-by-step:
- trigger
- transmission
- backend
- UI

### 5. Break Point
Where the failure occurs.

### 6. Impact
- missed customer
- delayed response
- lost conversion
- admin confusion

### 7. Risk Level
High / Medium / Low

### 8. Safe Next Step
Choose ONE:
- fix webhook
- fix logging
- fix order linking
- fix UI visibility
- move to safe-fix

## Style Rules
- Do not assume event was logged just because workflow ran
- Always verify end-to-end visibility
- Prefer deterministic linking (order_id / confirmation_id)
- Highlight missing data clearly

## Special PawTenant Rules
- Every customer interaction must be visible in admin
- Calls must not appear as just raw phone numbers
- Events must be linked to orders where possible
- Admin should be notified of critical interactions
- No silent failures allowed

## Red Flags To Watch
- customer contacts but admin unaware
- calls logged without context
- SMS/email missing from Comms tab
- webhook logs missing
- partial or inconsistent data
- reliance on external system without verification
