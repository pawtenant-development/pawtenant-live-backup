-- Seed the lead-recovery sequence + transactional email templates that exist
-- in TEST but were never present in LIVE's email_templates table.
--
-- Why (ACTIVE-DB-EDITABLE-2 / LIVE Templates Hub):
--   LIVE was missing seq_30min/seq_24h/seq_3day/checkout_recovery/
--   checkout_recovery_discount/review_request/order_confirmation, so the
--   Templates Hub could not expose them as individually-editable rows — only
--   legacy DEFAULT_TEMPLATES presets ("Abandoned Checkout Recovery", "Order
--   Confirmed", "ESA Letter Ready") showed as Not-wired fallbacks. Seeding
--   these rows lets admins edit the wording / discount code from the UI, and
--   (with the PRESET_SUPERSEDED_BY frontend logic) hides the legacy presets.
--
--   Content mirrored verbatim from TEST (opudhofjbydrljgleofq) as the source
--   of truth. id === slug for all 7 rows (matches TEST).
--
-- Idempotent + NON-DESTRUCTIVE: ON CONFLICT (id) DO NOTHING — seeds only the
-- missing rows, never overwrites an existing LIVE template.

INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived) VALUES
(
  'seq_30min', '30-Min Sequence', 'Sequence',
  $t$Complete Your {letter_type} Letter — Your answers are saved$t$,
  $t$Hi {name},

You started your {letter_type} letter assessment with PawTenant but didn't complete checkout. Your answers are saved — pick up right where you left off in just one click.

Your Application Status:
✓ Assessment complete — answers saved
● Payment pending — one step left

Questions? Call us at (409) 965-5885 or reply to this email.$t$,
  $t$Complete My {letter_type} Letter Payment$t$, $t${resume_url}$t$, 'email', 'seq_30min', false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived) VALUES
(
  'seq_24h', '24-Hour Sequence', 'Sequence',
  $t$Still thinking? Get your {letter_type} letter today and avoid housing issues.$t$,
  $t$Hi {name},

Still thinking about your {letter_type} letter? Thousands of pet owners rely on their ESA letter to avoid housing issues, pet fees, and lease restrictions. Don't let your pet's housing security wait.

🐶 Protect your pet's right to live with you
🏡 Avoid housing discrimination under the Fair Housing Act
✅ 100% money-back guarantee if not approved

Your assessment answers are still saved. Complete checkout in under 2 minutes.$t$,
  $t$Get My {letter_type} Letter Today$t$, $t${resume_url}$t$, 'email', 'seq_24h', false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived) VALUES
(
  'seq_3day', '3-Day Sequence + Discount', 'Sequence',
  $t$Here's $20 off your {letter_type} letter (limited time) — Discount code: {discount_code}$t$,
  $t$Hi {name},

We want to make it easy for you to get your {letter_type} letter. Here's an exclusive $20 off just for you — limited time only.

Use promo code at checkout: {discount_code}

Applies automatically — expires in 48 hours

Your assessment answers are still saved. This discount expires in 48 hours — don't miss it!$t$,
  $t$Claim My $20 Discount$t$, $t${resume_url_with_promo}$t$, 'email', 'seq_3day', false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived) VALUES
(
  'checkout_recovery', 'Checkout Recovery', 'Lead Recovery',
  $t$Complete Your {letter_type} Consultation — Order {order_id}$t$,
  $t$Hi {name}, {first_name} {letter_type} {resume_url} {amount}

You started a {letter_type} assessment with PawTenant but didn't complete checkout. Your assessment answers have been saved — pick up right where you left off without filling anything out again.

Questions? Call us at (409) 965-5885 or reply to this email.$t$,
  $t$Complete My {letter_type} Payment$t$, $t${resume_url}$t$, 'email', 'checkout_recovery', false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived) VALUES
(
  'checkout_recovery_discount', 'Checkout Recovery + Discount', 'Lead Recovery',
  $t$Your {letter_type} + Exclusive {discount_savings} Discount Inside — Order {order_id}$t$,
  $t$Hi {name},

We noticed you started a {letter_type} assessment but didn't complete checkout. We're offering you an exclusive discount to help you complete your letter today.

Use promo code at checkout: {discount_code}

Applies automatically — expires in 48 hours.

Your assessment answers are still saved. Don't miss it!$t$,
  $t$Claim My Discount & Complete$t$, $t${resume_url_with_promo}$t$, 'email', 'checkout_recovery_discount', false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived) VALUES
(
  'review_request', 'Review Request', 'Transactional',
  $t${name}, share your PawTenant experience ⭐$t$,
  $t$Hi {name},

We hope your ESA letter is everything you needed. It was a pleasure supporting you and your pet through this process.

If you had a positive experience, we'd love to hear about it! Your review helps other pet owners find the support they need — and it means the world to our small team.

Takes less than 60 seconds.$t$,
  $t$⭐ Write My Review$t$, $t${review_url}$t$, 'email', 'review_request', false
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug, archived) VALUES
(
  'order_confirmation', 'Order Confirmation', 'Transactional',
  $t$Order Confirmed — {order_id}$t$,
  $t$Hi {name},

Thank you for choosing PawTenant. Your ESA consultation has been confirmed and a licensed mental health provider will be reviewing your case shortly.

[ORDER_DETAILS]

What happens next:
1. A licensed provider reviews your assessment and pet information.
2. They prepare and sign your official ESA letter.
3. You receive your completed documents by email and in your portal.

You don't need to do anything right now. We'll send you another email the moment your documents are ready.$t$,
  $t$Track My Order$t$, $t${portal_url}$t$, 'email', 'order_confirmation', false
)
ON CONFLICT (id) DO NOTHING;
