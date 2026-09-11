# LIVE-REFUND-POLICY-CLINICAL-WORK-FEE-DISCLOSURE-001

Date: 2026-09-11  
Target: LIVE (`pawtenant.com`)  
Owner authorization: direct LIVE implementation

## Decision

- Full refund when a licensed provider determines the customer does not qualify, rejects/is unable
  to complete the case, PawTenant fails to deliver, a charge is duplicate/erroneous, or the customer
  cancels before documented clinical work begins.
- When the customer requests cancellation after documented clinical work begins, PawTenant retains
  a $30 professional evaluation and administrative services fee and refunds the remainder.
- Provider review, provider outreach/call, consultation, and clinical document preparation can be
  evidence of clinical work. `Under Review` status alone is not evidence.
- A disclosed state waiting period is not provider non-qualification. The fee decision remains a
  manual support/finance review and is never an automatic backend deduction.

## Surfaces

- Detailed Refund Policy and Terms summary.
- California 30-day notice in Terms.
- Homepage hero: small link from the full-refund promise to the detailed cancellation-fee section,
  including the prerendered pre-hydration hero.
- AI support knowledge source so support cannot quote the retired up-to-$40 rule.

## Safety and verification

- No order, refund, payment, Stripe, pricing, checkout, communication, or database record changed.
- No migration.
- Focused refund guard and runtime guard, including their negative controls.
- Full production build and existing regression chain.
- Type-check compared with the recorded eight-error baseline; no task-file error.

## Rollback

Revert the feature commit and redeploy the prior `ai-handle-inbound-chat` function source while
preserving its existing JWT-verification setting. No data rollback is required.
