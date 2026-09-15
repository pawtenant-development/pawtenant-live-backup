# ADDITIONAL-PET-FULL-CASE-REASSIGNMENT-PAYOUT-PRICE-001

## Owner decision

For a paid pet added after a completed order, a newly assigned provider receives
a neutral, ordinary clinical case containing the assessment and all pets, and
creates one letter covering all pets. Provider-facing copy reveals no handoff.
It must not say "complete case review," "replacement letter," "reassigned,"
"additional pet," or distinguish a new pet from previously covered pets. The
provider sees one ordinary case, one assessment and one combined Pets list.
The original provider keeps the original earning. The newly assigned provider
receives one separate payout at their configured per-order rate after the
new letter completes. Existing quotes remain frozen; new
post-completion pet additions cost $60. Pre-completion pricing is unchanged.

## Protected invariants

- Never rewrite the completed base order's provider.
- Never modify or cancel the original provider earning.
- Preserve the original approved document/version.
- Hide prior-provider decline/reassignment history from replacement providers.
- Show the replacement provider the original assessment and every pet.
- Create at most one replacement-provider earning per Additional Pet request.
- Do not charge the customer again for an already-paid request.

## Implementation

- Migration `20260915054500_additional_pet_reassignment_privacy_earnings_price.sql`
  adds the request-keyed earning, privacy projection, complete-case queue count,
  and versioned post-completion $60 pricing.
- Provider portal presents the work as an ordinary assigned case and requires
  one letter covering every pet, without handoff or replacement language.
- Admin and provider earning views identify the separate Additional Pet payout.
- Payment completion audit records use the request's immutable charged amount.
- Static guard `check-additional-pet-reassignment-pay-privacy-price.mjs` is in
  the full build chain.

## TEST evidence

- Migration applied to `opudhofjbydrljgleofq`.
- Edge Functions: `create-additional-pet-request` v19 (`verify_jwt=true`),
  `provider-additional-pet-decision` v16 (`verify_jwt=true`), and
  `stripe-webhook` v85 (`verify_jwt=false`).
- Rolled-back SQL fixture proved: complete assessment + two-pet projection,
  no prior decline leak, frozen $30 existing quote, exactly one $30 replacement
  earning at the fixture provider's configured rate, unchanged base provider
  and base earnings, current post-completion price $60, generic/pre-completion
  price $30, and zero residue.
- Full build and guard chain passed. Type-check has pre-existing unrelated
  errors and none in task-owned files.

## Target order

`PT-PSD8INJ5GQB` retains Robert Staaf as the base provider, his $35 earning,
and the original approved v1. Its frozen $30 Additional Pet request is assigned
at request level to Eve Rosno and is pending provider review. The original
assessment contains Madi; the request contains Maxine. The projection presents
both pets as one ordinary clinical case without mutating either source record.

## Assessment projection follow-up

The paid request pet remains immutable in `order_additional_pet_requests`; it is
not copied into the customer's original `orders.assessment_answers` entitlement
snapshot. Migration
`20260915013358_sync_reassigned_additional_pet_into_assessment.sql` adds an
authorization-gated internal projection that returns the original assessment
with applicable paid/included request pets merged into its `pets` array. Exact
JSON containment prevents duplicate pets. The projection returns no payment,
assignment, decision, decline, reassignment, or event-history fields.

The shared neutral assessment resolves that projection before rendering and
uses the same resolved order for its simple black-and-white PDF. Admin and
provider surfaces therefore show the same full Pets list and questionnaire;
they fail closed rather than display or download a clinically incomplete case.
