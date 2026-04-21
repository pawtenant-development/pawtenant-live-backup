# Skill: System Observability & Failure Detection (PawTenant)

## Purpose
Continuously monitor critical system flows and detect failures early before they impact customers.

This skill ensures that issues like broken checkout, missing payments, failed communications, and system errors are surfaced immediately.

## Core Goals
- Detect failures before customers report them
- Monitor system health continuously
- Trigger alerts for critical issues
- Provide visibility across all systems

## Environment Assumption
- ALWAYS operate in pawtenant-test
- NEVER deploy monitoring logic to live without deploy-check.SKILL.md
- Use safe-fix.SKILL.md for implementation

## Critical Systems To Monitor

### 1. Checkout System
- Step 3 load success
- CTA enabled state
- Payment intent creation success
- Stripe response success

### 2. Payment Processing
- Stripe payment success
- webhook execution
- order status update
- payment linking

### 3. Order Lifecycle
- duplicate order creation rate
- abandoned checkout recovery success
- order status transitions

### 4. Communication System
- call events received
- SMS sent/received
- email delivery success
- comms tab visibility

### 5. Recovery System
- retry payment links working
- discount links applied correctly
- recovery emails sent

## Monitoring Checks

### Checkout Monitoring
- detect CTA disabled unexpectedly
- detect payment intent failures
- detect drop-off spikes

### Payment Monitoring
- payment succeeded but order still unpaid
- webhook not firing
- missing confirmation_id

### Order Monitoring
- duplicate orders with same email/phone
- abandoned orders not recovered
- incorrect status states

### Communication Monitoring
- calls not logged
- SMS not appearing in admin
- webhook failures from GHL
- missing notifications

## Detection Methods

- database anomaly detection
- webhook success/failure tracking
- API response validation
- event consistency checks
- log-based monitoring

## Required Output Format

### 1. Issue Detected
What anomaly was found.

### 2. System Affected
Checkout / Payment / Orders / Comms

### 3. Detection Method
How it was detected.

### 4. Impact Level
High / Medium / Low

### 5. Affected Users
Single / Multiple / System-wide

### 6. Recommended Action
One next step:
- investigate with debug skill
- fix with safe-fix
- monitor further

## Style Rules
- Prefer early detection over reactive debugging
- Do not assume system is healthy without verification
- Highlight anomalies clearly
- Focus on high-impact issues first

## Special PawTenant Rules
- Checkout failures = highest priority
- Payment not linked = critical issue
- Missing communication = high urgency
- Duplicate orders = system flaw, not user behavior
- Admin must never be unaware of system failures

## Red Flags To Watch
- sudden increase in unpaid orders
- payment success without status update
- multiple duplicate orders
- missing comms events
- webhook execution failures
- inconsistent data across systems
