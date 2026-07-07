# ORDER-COMMS-TIMELINE-LIVE-MIRROR-001 — LIVE per-order comms timeline

**Date:** 2026-07-08 · Started from LIVE `eb83f2d` (in sync).
**Status:** ✅ **accepted — already present in LIVE; NO code change (and none safe).**

## Headline (verify-before-acting)
The task premise — "LIVE admin per-order modal still does not show the unified
SMS/call timeline" — is **FALSE**. **LIVE already has the full per-order
communications timeline**, and outbound GHL calls already appear in the LIVE
order-detail Comms tab. The premise came from a misdiagnosis in the prior
GHL-CALL-CAPTURE report (which read the frozen `OrderDetailModal.tsx`'s
`loadEmailLog` and wrongly concluded "email_log only" — it never checked LIVE
`CommunicationTab.tsx`, which is where the Comms tab actually queries
`communications`). Corrected here.

## Evidence — LIVE already renders it
- `OrderDetailModal.tsx` (frozen) L3440–3442: `{section === "comms" && <CommunicationTab orderId=… confirmationId=… emailLog=… …/>}` — the Comms tab **is** `CommunicationTab` (non-frozen), same as TEST. Import L7.
- LIVE `CommunicationTab.tsx` already does the whole timeline:
  - L318–323: fetch `communications` by **`order_id.eq` OR `confirmation_id.eq`** (`.or(...)`), selecting `duration_seconds`, status, direction, body, phones, subject, slug.
  - L60 `UnifiedLogEntry`; L94/113/568 `getChatConfig` → "Outbound Call"/"Inbound Call"/"Missed Call"; L351 duration mapped.
  - L373–378: merge legacy `orders.email_log`, sorted newest-first.
  - L528 error state ("Failed to load communications"); L540 empty state ("No communications yet").
- Git history: this has been in LIVE since `d8b9f35` "feat: phase 2 comms
  unification with DB templates and **unified logging**" + `8de08c3` — long
  before this task. LIVE was never email_log-only.

## LIVE SQL evidence (read-only; no mutation)
All three verification orders have order-linked `call_outbound` rows from
`ghl-call-reconcile`, with BOTH `order_id` and `confirmation_id` set (so the
`order_id OR confirmation_id` query catches them):
- PT-PSDFIDCLQRR — call_outbound, 47s, completed
- PT-MQZQ1TKE — call_outbound, 824s, completed
- PT-MRANZSCX — call_outbound, 6s, completed (+ several call_inbound)
→ These render as sky "Outbound Call · {duration}" bubbles in the LIVE modal's
Comms tab today.

## Why NOT to mirror TEST's CommunicationTab (would be harmful)
The only TEST↔LIVE divergence in `CommunicationTab.tsx` is **unrelated** to the
timeline (normalized diff): TEST's version adds the **ADMIN-CALLING-MVP**
(`import CallCustomerModal`) and **AISupportAssistant** (`import AISupportAssistant`)
— both TEST-only features. LIVE is **missing** `CallCustomerModal.tsx` and
`AISupportAssistant.tsx`, so copying TEST's file would:
1. **Break the LIVE build** (imports non-existent components), and
2. Drag in out-of-scope features (calling MVP + AI assistant) this task
   explicitly excludes.
The label difference (`seq_30min` → "5-Min" on LIVE vs "30-Min" on TEST) is an
**intentional LIVE choice** (`a91d9e2` "rename recovery sequence labels to
5-minute") — do not "fix" it. Per the merge policy + safety rules ("no random
parity copy", "only modify what is required"), **no mirror is performed.**

## What I changed
**No LIVE code.** Only this task card (+ a corrective coordination note in the
TEST docs, no TEST source change). No deploy (nothing to deploy).

## Verification
- Code path + git history (above) + read-only LIVE SQL (above). Typecheck/build
  N/A (no code change). Browser: LIVE admin is behind the OTP login wall
  (headless blocker) — but there is no new code to exercise; the timeline is
  pre-existing, long-shipped LIVE behavior.

## Exclusions honored
No LIVE code/deploy; no SMS/email/call sent; no GHL workflow/cron/function
change; no schema/migration; no ads/payment/order/provider/refund/checkout/
pricing change; no communications rows altered; no backfill; frozen
`OrderDetailModal.tsx` untouched; unrelated LIVE dirty files (Microsoft UET
mirror: index.html / microsoftUet.ts / vite-env.d.ts) preserved, not staged.

## Next recommended action
None required — the LIVE per-order comms timeline (incl. outbound GHL calls)
already works. Optional, separate, owner-gated: if desired, port the TEST-only
ADMIN-CALLING-MVP (CallCustomerModal) + AISupportAssistant to LIVE — but that is
a different feature set, needs those component files first, and is NOT this task.
