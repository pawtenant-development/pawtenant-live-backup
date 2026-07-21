# Refund Runtime Cleanup (LIVE)

**Task:** REFUND-POLICY-RUNTIME-CLEANUP-001
**LIVE start SHA:** 024aefd · **LIVE code commit:** f5dd089
**TEST source:** code d87fc12 / docs 6a79e4a (verified on TEST: chat v13→v14, sms v16→v17).

## What shipped to LIVE
1. **DB migration** `20260721202807_refund_email_timing_5_10_business_days.sql` — applied to
   LIVE Supabase (cvwbozlbbmrjxznknouq). Updated exactly two active rows:
   `order_cancelled_refund` (email, en-dash) and `sms_refund_processed` (sms, hyphen) from
   "3–5"/"3-5" to "approximately 5–10 business days." Idempotent, fail-safe count checks.
2. **AI knowledge** (`knowledgeBase.ts`) — refund facts wired into the prompt as accuracy
   guardrails (identical to TEST). Safety gates (policy.ts NEVER_AUTO_SEND, DND) untouched.
3. **Redeployed** `ai-handle-inbound-chat` v5→v6 (verify_jwt=true preserved). Surgical: only
   `knowledgeBase.ts` differed between the deployed bundle and the LIVE repo (policy.ts,
   ghl.ts, db.ts, prompt.ts, index.ts all byte-identical).
4. **Guard** `check-refund-runtime-parity.mjs` wired into the LIVE build (deploy list =
   `ai-handle-inbound-chat` only).

## LIVE dependency matrix
| Function | Consumes KB | v (old→new) | verify_jwt | Redeployed |
|---|---|---|---|---|
| ai-handle-inbound-chat | yes (prompt.ts + direct) | 5→6 | true | yes |
| (no ai-handle-inbound-sms on LIVE) | — | — | — | — |
| ghl-sms-inbound / ghl-webhook-proxy | do NOT import the KB | — | — | no |

## Verification
- LIVE DB: both rows now 5–10, 0 active templates with 3–5, placeholders intact.
- LIVE deployed chat v6 bundle: contains all refund facts (5–10, ESA+PSD full refund, HUD
  optional, RA full add-on refund, up-to-$40 discretionary/not-automatic, housing-denial
  reviewed under Refund Policy) and no stale 3–5. Verified by deployed-bundle inspection —
  no LLM invocation, no outbound customer message.
- pawtenant.com/refund-policy still 200; checkout, provider profiles, RA earnings unchanged.

## Rollback
- DB: reverse `replace()` SQL in the migration file.
- Function: redeploy previous source (v5). Previous LIVE frontend deploy unaffected.

## Deferred
- Pre-existing stale AI-prompt pricing ($109/year, $79 consultation) — unrelated to refunds;
  not touched.
