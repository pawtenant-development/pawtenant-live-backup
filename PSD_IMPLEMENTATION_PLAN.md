# PSD (Psychiatric Service Dog) — Implementation Plan

## Overview
Add a second assessment flow for Psychiatric Service Dog (PSD) letters, parallel to the existing ESA letter flow.
PSD letters are legally distinct from ESA letters — they grant broader public access rights under the ADA (not just housing).

---

## 1. Stripe Products & Price IDs You Need to Create

Go to **Stripe Dashboard → Products → Add Product** and create these:

| Product Name | Billing | Price | Notes |
|---|---|---|---|
| PSD Letter — Standard (2-3 days) | One-time | $89.00 | Slightly lower than ESA due to market |
| PSD Letter — Priority (24hrs) | One-time | $109.00 | |
| PSD Letter — Annual Subscription | Recurring (yearly) | $99.00 | |

**After creating each product, copy the Price ID (price_xxx...)**
You'll need to give me 3 Price IDs to add to the edge functions.

---

## 2. New Pages to Create

| Page | Route | Description |
|---|---|---|
| PSD Assessment | `/psd-assessment` | 3-step form parallel to ESA, with PSD-specific questions |
| PSD Thank You | `/psd-assessment/thank-you` | Same as ESA thank-you but says "PSD Letter" |

---

## 3. PSD-Specific Questions (Different from ESA)

PSD assessment replaces mental health questionnaire with ADA-relevant criteria:

**Step 1 — Pet Info (same as ESA):**
- Number of dogs (max 1 per ADA)
- Dog name, breed, age, weight

**Step 2 — Personal Info (same as ESA):**
- Same fields (name, email, phone, state, DOB)

**Step 3 — PSD Mental Health Assessment (DIFFERENT from ESA):**
Replace ESA questions with:
1. Do you have a diagnosed mental health condition? (depression, PTSD, anxiety, bipolar, schizophrenia, etc.)
2. Has a mental health professional evaluated you in the last 12 months?
3. How does your dog perform tasks that assist your disability? (describe tasks — must be TASK-trained, not just comfort)
4. Has your dog completed any formal or self-directed task training?
5. Have you been denied housing or public access due to your dog?
6. Are you currently under the care of a mental health or medical provider?

**Key legal difference:** PSD requires the dog performs specific tasks directly related to a disability. ESA only requires emotional support.

---

## 4. Edge Functions Changes

### New edge function OR modify existing ones:

**Option A (Recommended): Reuse existing functions with a `letterType` param**
- `create-payment-intent` → accept `letterType: "esa" | "psd"` and use different price IDs
- `stripe-webhook` → already handles both (no change needed — uses metadata)
- `generate-esa-letter` → modify to accept `letterType` and generate PSD letter with different header/content

**Option B: Duplicate functions**
- `create-psd-payment-intent`
- `generate-psd-letter`
- More code to maintain but cleaner separation

**Recommendation: Option A** — less code, same Stripe webhook handles both.

---

## 5. Database Changes Needed

```sql
-- Add letter_type to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS letter_type TEXT DEFAULT 'esa';
-- Values: 'esa' | 'psd'
```

The admin portal will then show "PSD" or "ESA" badge on each order.

---

## 6. Provider Portal Changes

**Providers need to know if they're reviewing ESA vs PSD:**
- Show "PSD Letter Request" vs "ESA Letter Request" badge in provider order view
- PSD letters need different template/language in the generated PDF
- Provider qualifications: PSD letters typically require a licensed mental health professional (LMHP) — same as ESA in most states, but some states require in-person evaluation for PSD

---

## 7. PDF Template Differences

**ESA Letter says:**
> "This letter certifies [Name] qualifies for an Emotional Support Animal under the Fair Housing Act..."

**PSD Letter says:**
> "This letter certifies [Dog Name] is a trained Psychiatric Service Dog under the Americans with Disabilities Act for [Name]..."

The `generate-esa-letter` edge function needs a PSD template variant.

---

## 8. Admin Portal Changes

- Show `letter_type` badge (green "ESA" or orange "PSD") on every order row
- Filter by letter type in advanced filters
- Dashboard stats split by ESA vs PSD

---

## 9. Customer Portal (/my-orders)

- Show "Your PSD Letter" or "Your ESA Letter" based on letter_type
- No other changes needed

---

## 10. Implementation Order (Step by Step)

1. **You do first:** Create 3 Stripe products + get the Price IDs
2. **I implement:** Add `letter_type` DB column
3. **I implement:** Create `/psd-assessment` page (3-step form with PSD questions)
4. **I implement:** Update `create-payment-intent` to handle PSD pricing
5. **I implement:** Update `generate-esa-letter` with PSD PDF template
6. **I implement:** Update admin portal to show ESA vs PSD badge
7. **I implement:** Update provider portal to show letter type
8. **Test:** Run a PSD test order end-to-end

---

## 11. Questions to Confirm Before Starting

1. Should PSD share the same provider pool as ESA, or will you have separate PSD-only providers?
2. Do you want a separate `/psd` landing page (marketing page before the assessment), or just the assessment flow?
3. Should PSD have the same add-on services (Zoom call, certified mail, landlord letter)? Or different add-ons like "ADA Trainer Verification Letter"?
4. Pricing confirmed: $89/$109 one-time, $99/yr subscription — or different?

---

## Summary

**What you need to do RIGHT NOW:**
- Create 3 Stripe products (PSD Standard, Priority, Annual)
- Send me the 3 Price IDs

**What I'll implement after you give me the Price IDs:**
- Full PSD assessment flow (new page at `/psd-assessment`)
- PDF generation for PSD letters
- Admin + provider portal updates to show ESA vs PSD

**Estimated implementation time:** 1-2 sessions after you provide the Price IDs.
