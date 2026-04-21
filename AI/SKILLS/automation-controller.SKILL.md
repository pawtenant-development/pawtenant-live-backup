# Skill: Automation Controller (PawTenant)

## Purpose
Act as the central decision-making system that selects and executes the correct skill based on the issue type.

This skill orchestrates:
- detection
- diagnosis
- fixing
- safety checks

## Core Goal
Eliminate manual decision-making and allow fast, structured execution of fixes.

## Environment Rules
- ALWAYS operate in pawtenant-test
- NEVER modify live repo directly
- ALWAYS use deploy-check.SKILL.md before deployment

## Skill Routing Logic

### 1. Checkout Issues
If issue involves:
- Step 3 not working
- coupon issues
- CTA disabled
- payment intent failures

→ Use:
1. checkout-debug.SKILL.md
2. safe-fix.SKILL.md

---

### 2. Payment Issues
If issue involves:
- payment not linked
- order shows unpaid after payment
- webhook issues

→ Use:
1. stripe-reconciliation.SKILL.md
2. order-lifecycle.SKILL.md
3. safe-fix.SKILL.md

---

### 3. Duplicate Orders
If issue involves:
- DUP tags
- multiple orders for same user

→ Use:
1. order-lifecycle.SKILL.md
2. safe-fix.SKILL.md

---

### 4. Recovery / Payment Links
If issue involves:
- retry links
- discount links
- abandoned checkout

→ Use:
1. payment-recovery.SKILL.md
2. order-lifecycle.SKILL.md
3. safe-fix.SKILL.md

---

### 5. Communication Issues
If issue involves:
- missing calls
- missing SMS
- no admin notification
- comms tab issues

→ Use:
1. comms-diagnostics.SKILL.md
2. safe-fix.SKILL.md

---

### 6. Unknown / Mixed Issues
If unclear:
→ Use:
1. observability.SKILL.md
2. then route accordingly

---

## Execution Flow

### Step 1: Identify issue type
Classify into one of:
- checkout
- payment
- orders
- recovery
- comms

### Step 2: Run diagnosis skill
Use appropriate diagnostic skill

### Step 3: Identify root cause
Do not guess — verify

### Step 4: Apply safe fix
Use safe-fix.SKILL.md

### Step 5: Validate in test
Ensure:
- no regression
- expected behavior works

### Step 6: Prepare for deploy
Use deploy-check.SKILL.md

## Output Rules
- Always show:
  - issue classification
  - skill chain used
  - root cause
  - fix plan
- Do not skip steps
- Prefer minimal changes

## Special PawTenant Rules
- Checkout issues = highest priority
- Payment integrity must never break
- Do not create new orders unless required
- Always preserve order continuity
- Never allow silent failures

## Red Flags
- skipping diagnosis
- applying fixes blindly
- touching multiple systems at once
- modifying live without test validation