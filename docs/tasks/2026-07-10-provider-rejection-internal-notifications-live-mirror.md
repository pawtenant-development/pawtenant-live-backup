# PROVIDER-REJECTION-INTERNAL-NOTIFICATIONS-LIVE-MIRROR-001

**Owner/session:** Claude session (2026-07-10) — LIVE production mirror (owner-approved).
**Started from commit:** LIVE `5760ddb`
**TEST source:** `ac3d06f` (code) + `4e8ee11` (docs/E2E), TEST fn v31, synthetic E2E PASSED.

## Goal
Mirror the TEST-verified internal/admin provider-rejection **email** into LIVE's
`provider-reject-order` edge function. Internal/admin ONLY — no customer email, no
customer notification, no customer-facing rejection wording.

## 🔴 Preflight discrepancy — verify_jwt
- Task brief assumed LIVE `verify_jwt=true`. **Reality: LIVE deployed `provider-reject-order`
  is v55 with `verify_jwt=FALSE`.** (TEST is v31 `verify_jwt=true`.) The function performs
  its own in-body JWT verification (`auth.getUser` on the Bearer token), so it is safe under
  either gateway setting. **Decision: PRESERVE LIVE's actual setting (`false`).** Flipping it
  to `true` is an unrequested behavior change that could break the LIVE provider reject flow —
  out of scope and against the "don't change provider workflow beyond the rejection email" rule.

## Preflight
- LIVE branch `main`, HEAD `5760ddb`, `origin/main...HEAD = 0 0`.
- LIVE dirty (untracked, PRESERVED, not staged): `docs/PAWTENANT_CLAUDE_OPERATING_RULES.md`,
  `docs/google-ads-assets-sitelinks-callouts-snippets-tracker.md`,
  `docs/google-ads-housing-keywords-tracker.md`, `docs/google-ads-psd-rsa-tracker.md`.
- No LIVE `docs/PAWTENANT_ACTIVE_TASKS.md` exists → no registered locks; nothing owns
  `provider-reject-order` / notification routing / provider-workflow files in LIVE.
- TEST commits `ac3d06f` + `4e8ee11` confirmed present.

## Diff (LIVE vs TEST ac3d06f)
LIVE base is byte-identical (both LF) to the pre-change TEST base. LIVE is missing EXACTLY
the additive blocks: `escapeHtml` / `getAdminNotifRecipients` / `sendAdminRejectionEmail`
helpers, the `ADMIN_PORTAL_URL` / `FROM_ADDRESS` / `FALLBACK_ADMIN_EMAIL` consts, the
routing-gated email-send block before the final return, and the `adminEmail` response field.
No LIVE-only content in this file to preserve. → Mirrored LIVE file == TEST `ac3d06f` version.

## Result (2026-07-10) — DONE
- **Routing (read-only):** LIVE `get-admin-notif-recipients` v40 deployed. DB row
  `provider_rejected_order` enabled=true, `per_notif_emails=["eservices.dm@gmail.com"]`;
  global fallback `hamzaengr94@gmail.com`. Live resolver call returned
  `{enabled:true, recipients:["eservices.dm@gmail.com"], source:"specific", group:"Providers"}`.
  Both admin/internal; neither is a customer.
- **Function mirror:** `supabase/functions/provider-reject-order/index.ts` set byte-identical
  (LF) to TEST `ac3d06f` — adds `escapeHtml`/`getAdminNotifRecipients`/`sendAdminRejectionEmail`
  + consts + routing-gated email-send block + `adminEmail` return field. Base rejection logic,
  admin portal notif, provider confirmation, shared note unchanged. `order.email` used only as
  body content; `to:` comes only from resolver output.
- **Deploy:** LIVE `provider-reject-order` **v55 → v56**, **verify_jwt=FALSE preserved** (CLI
  `--no-verify-jwt`). Deployed source re-read from LIVE: contains the routing-gated internal
  email; `to: [opts.to]`. LIVE `get_edge_function` confirms verify_jwt=false, v56.
- **Customer safety:** deployed code sends no customer email/notification/SMS/call/GHL (only
  Resend to admin recipients + DB). LIVE `my-orders/page.tsx` `getDisplayStatus` maps
  `provider_rejected`→`processing`→"Payment Confirmed"; no `provider_rejected` string exists in
  LIVE my-orders → no customer-facing rejection language. No customer email template added.
- **Build:** LIVE `npm run type-check` = only pre-existing unrelated errors
  (`AIAssistantTrustCard`, `EmployeeHrDirectory`, `ProviderInternalRecords`, frozen `AnalyticsTab`);
  `npm run build` PASS (prerender 242/0 err, attribution parity OK). Edge fn is Deno, not in tsconfig.
- **Browser (LIVE, owner's authed Chrome — no OTP wall):** Settings → Communications →
  "Notification Routing Test" → **Check Routing** (no emails sent) shows **"Provider Rejected" →
  Specific → eservices.dm@gmail.com (1 recipient)**; all events route to admin/staff addresses,
  none to a customer. No console errors. No rejection triggered.
- **NOT triggered on a real LIVE order** (owner did not approve a specific live/synthetic order).
