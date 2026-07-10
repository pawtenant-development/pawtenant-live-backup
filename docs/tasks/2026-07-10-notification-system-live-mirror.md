# NOTIFICATION-SYSTEM-LIVE-MIRROR-001

**Date:** 2026-07-10
**Repos:** TEST `pawtenant-test` · LIVE `pawtenant-live-backup`
**Supabase:** TEST `opudhofjbydrljgleofq` · LIVE `cvwbozlbbmrjxznknouq`
**Scope:** Notification system only. Audit + mirror TEST→LIVE (or fix LIVE if incomplete).

---

## Phase 1 — Preflight

- TEST branch `main`, up to date with origin. Dirty (preserved, unrelated):
  `supabase/functions/send-meta-capi-event/index.ts` + untracked docs.
- LIVE branch `main`, up to date with origin. Untracked docs only (preserved):
  `PAWTENANT_CLAUDE_OPERATING_RULES.md`, 3 google-ads trackers.
- No notification files were dirty in either repo at start.
- Prior LIVE admin-nav/owner-access hotfix: not found as a distinct commit in
  LIVE `main` log (latest = `5855742 fix: add command center to communications
  permissions`). Not part of this task's scope; noted only.

## Phase 2 — Audit (TEST vs LIVE)

### Mounted admin notification bell = `CompanyNotificationsBell.tsx`
(`NotificationsBell.tsx` exists in both repos but is **dead code** — imported
nowhere except itself. The old flat bell was replaced by the grouped
`CompanyNotificationsBell`, which is what admin actually sees.)

| Piece | TEST | LIVE | Status |
|---|---|---|---|
| `CompanyNotificationsBell.tsx` (frontend) | present | present | **byte-identical** (CRLF-normalized diff = 0) |
| `get_company_notifications()` RPC | — | **deployed** | present in LIVE DB, `is_admin` gated |
| `mark_company_notifications_read()` RPC | — | **deployed** | present in LIVE DB |
| `company_notification_reads` table | — | **exists** | present in LIVE DB |
| Migration `20260611160000_company_notifications_bell.sql` | present | present | in both repos |
| `AdminNotificationPrefsPanel.tsx` (routing/settings UI) | present | present | **byte-identical** (diff = 0) |

**Conclusion:** the notification **bell/dropdown + routing settings** are already
fully mirrored to LIVE and functional. Behaviors present in LIVE: accurate
unread count, dropdown open, grouping by category (Approvals / Communications /
Orders & Bookings), mark-group-read, mark-all-read, refresh, durable per-user
read state via RPC (not localStorage). Bell is RPC-poll based (45s + on open) —
no realtime dependency.

### Only TEST-only delta = two desktop OS-notification hooks
Wired in `src/context/AdminChatContext.tsx` (17-line diff = 2 imports + comments
+ 2 hook calls). LIVE lacks both hook files and the wiring.

1. `hooks/useAiSupportEventNotifier.ts` — OS toast + AI-Support badge refresh for
   AI events (draft_pending / escalated / blocked / send_error / …). Reads
   `ai_support_notifications`. **AI-Support-coupled** (excluded-subsystem-adjacent).
2. `hooks/useAdminOpsNotifier.ts` — OS toast for missed calls (`communications`)
   + new contact-form emails (`contact_submissions`).

Both are **opt-in gated** (`soundPrefs.desktopNotificationsEnabled` AND browser
`Notification.permission`), foreground-only, and **send nothing external** (no
SMS/email/call — local OS notifications only). All their shared deps
(`desktopNotify`, `soundPrefs`, `useAiSupportPendingCount`) already exist in LIVE.

### DB reality in LIVE (read-only checks)
- Tables present: `company_notification_reads`, `contact_submissions`,
  `ai_support_notifications`, `doctor_notifications`. ✅
- Realtime publication `supabase_realtime` contains: `ai_support_notifications`,
  `contact_submissions`. **NOT** `communications`, `orders`, `doctor_notifications`.
- Impact: `useAiSupportEventNotifier` would work fully. `useAdminOpsNotifier`
  contact-email half works; **missed-call half is inert** until `communications`
  is added to the realtime publication (a DB change — out of no-migration scope).

## Phase 3 — Fix/mirror

Pending owner scope decision (see below). No LIVE code changed yet.

## Provider-rejection rule (owner correction)
- The dead `NotificationsBell.tsx` had a `provider_rejected` type sourced from
  `doctor_notifications` filtered to `type=eq.provider_rejected_admin` — already
  **admin-internal only**. It is unmounted anyway.
- The mounted `CompanyNotificationsBell` has **no** provider-rejection group and
  adds **no** customer-facing notification.
- No customer-facing provider-rejection notification exists or was added. Rule
  documented: provider rejection = internal/admin workflow event only.

## Safety confirmations
- No SMS/email/call sent. No Stripe/payment/order/provider/GHL/ads/cron changes.
- No Supabase migration or function deploy performed. Only read-only SQL run
  against LIVE for verification.
- Unrelated dirty/untracked files preserved in both repos.
