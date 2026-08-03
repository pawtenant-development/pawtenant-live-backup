# GOOGLE WORKSPACE → MICROSOFT 365 — BACKEND & EMAIL DEPENDENCY AUDIT

**Task ID:** `GOOGLE-WORKSPACE-TO-MICROSOFT-365-BACKEND-DEPENDENCY-AUDIT-001`
**Priority:** P0 — email migration safety / business continuity
**Date:** 2026-08-04
**Mode:** READ-ONLY. No DNS, secret, recipient, database, function or deployment change was made.

**Final status:** `PARTIAL — ONE OR MORE CONFIGURATION SOURCES COULD NOT BE VERIFIED`

Two sources are owner-console-only and could not be read from this workstation:
the **Supabase Auth SMTP dashboard panel** (no Management API token present locally) and the
**GoHighLevel integrations console**. Both are scoped below with exact verification steps.
Critically, the Auth SMTP setting was proven **off the delivery path by code evidence**, so its
unread value does not gate the cutover.

---

## 1. Executive summary

**The migration is materially safer than the brief assumed. PawTenant has no Gmail dependency at all.**

Exhaustive search of both repositories found **zero** occurrences of the Gmail API, Gmail OAuth,
Gmail refresh tokens, `smtp.gmail.com`, Google Pub/Sub, Gmail watch, IMAP, POP, mailbox polling or
any inbound email ingestion. The only Google OAuth in the codebase is scoped exclusively to
`https://www.googleapis.com/auth/adwords` — Google **Ads**, not Workspace mail.

All PawTenant transactional email is sent by **Resend**, whose DNS lives entirely on
`resend._domainkey` and the `send.pawtenant.com` subdomain. **A root-MX flip from Google to
Microsoft does not touch Resend.**

Equally important: **not one admin notification recipient is an `@pawtenant.com` address.** Every
alert routes to a consumer Gmail or Yahoo mailbox, which is unaffected by cancelling Google
Workspace. Google Workspace today does exactly one job for PawTenant — *receiving* human mail at
`@pawtenant.com` — and that is the only thing the MX cutover has to replace.

That said, the audit surfaced **four concrete defects**, three of which are pre-existing and
independent of the migration but become dangerous during it:

| # | Severity | Finding |
|---|----------|---------|
| 1 | 🔴 P0 | **`support@pawtenant.com` is a live production sender** (189 sends, last 2026-07-29) and is **absent from the owner's M365 mailbox list**. Customer replies will bounce after cutover. |
| 2 | 🔴 P0 | **Root SPF contains two NXDOMAIN includes** → SPF **permerror** today. Pre-existing; masked by DKIM. |
| 3 | 🔴 P0 | **`send.pawtenant.com` has no SPF TXT record**, although Resend's dashboard reports it "verified" (cached state). |
| 4 | 🔴 P0 | **DMARC is `p=quarantine` with strict alignment (`adkim=s; aspf=s`).** Resend mail passes DMARC on **DKIM alone**. Disturbing `resend._domainkey` during Google cleanup quarantines 100% of transactional email. |

Findings 2–4 compound: because SPF is already broken and strictly aligned, the `resend._domainkey`
TXT record is currently the **single point of failure** for all customer-facing email.

---

## 2. Repository preflight

| | TEST | LIVE |
|---|---|---|
| Path | `pawtenant-test` | `pawtenant-live-backup` |
| Branch | `main` | `main` |
| HEAD | `e4c49528b2c7faa8ca0e7ca875aabda48648b6b5` | `e0c410c2805f389c3aca3621edf41ce4d158c5d4` |
| Origin sync | `0 0` — in sync | `0 0` — in sync |
| Working tree | clean (7 untracked docs only) | clean (1 untracked doc only) |
| Concurrent writer | none detected | none detected |
| Supabase project | `opudhofjbydrljgleofq` | `cvwbozlbbmrjxznknouq` |
| Vercel project | `pawtenant-test` | `pawtenant-production` |

No `reset`, `clean`, `stash`, `rebase`, `merge`, force push, worktree or side clone was used.

---

## 3. Current mail architecture (verified)

```
                      ┌──────────────────────────────────────────┐
  OUTBOUND            │  Supabase Edge Functions (Deno)          │
  (transactional)     │  ~40 functions, all → Resend HTTP API    │
                      │  From: PawTenant <hello@pawtenant.com>   │
                      │  From: PawTenant <support@pawtenant.com> │
                      │  From: PawTenant Admin <noreply@…>       │
                      │  Reply-To: hello@pawtenant.com           │
                      └────────────────┬─────────────────────────┘
                                       │  RESEND_API_KEY
                                       ▼
                      ┌──────────────────────────────────────────┐
                      │  RESEND  (domain pawtenant.com verified) │
                      │  DKIM  : resend._domainkey  ← LOAD-BEARING│
                      │  Return-Path / MAIL FROM : send.pawtenant.com │
                      │  Receiving: DISABLED                     │
                      └────────────────┬─────────────────────────┘
                                       │ status webhooks (Svix-signed)
                                       ▼
                      resend-webhook → communications / audit

  INBOUND (human)     Root MX → Google Workspace   ← THE ONLY GOOGLE DEPENDENCY
                      hello@ / info@ / accounts@ / support@ …
                      NO programmatic ingestion. Nothing in PawTenant reads a mailbox.

  ADMIN ALERTS        admin_notification_prefs → consumer Gmail / Yahoo addresses
                      (zero @pawtenant.com recipients)
```

**Target architecture** (unchanged from the brief, and confirmed correct by this audit):
Microsoft 365 receives human mail; Resend continues to send all transactional mail; no Graph
integration is required.

---

## 4. Google dependency inventory

### 4.1 Absent — searched and confirmed not present

Searched both repositories (all file types, case-insensitive) for:
`gmail`, `smtp.gmail.com`, `googleapis.com/gmail`, `GMAIL_`, `GOOGLE_MAIL`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, Gmail OAuth, Google service accounts, Google
Pub/Sub, Gmail watch, mailbox polling, IMAP, POP, email forwarding, webhook email ingestion.

| Dependency | Result |
|---|---|
| Gmail API | **absent** |
| Gmail OAuth / refresh tokens | **absent** |
| `smtp.gmail.com` | **absent** |
| Google Pub/Sub / Gmail watch | **absent** |
| IMAP / POP / mailbox polling | **absent** |
| Inbound email ingestion (any provider) | **absent** |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` (generic names) | **absent** — only `GOOGLE_ADS_*`-prefixed variants exist |

All `@gmail.com` matches in the repositories fall into three harmless classes: **consumer**
recipient addresses in notification config, email-masking helper docstrings
(`j•••@gmail.com`), and mock/fixture provider data. None are Workspace-hosted.

### 4.2 Present — Google dependencies that exist but are **not** mail

| Dependency | Location | Purpose | Breaks on Workspace cancellation? |
|---|---|---|---|
| Google Ads OAuth (`adwords` scope) | `google-oauth-start`, `google-oauth-callback` | Ads conversion upload + reporting | **Depends on identity** — see §12 |
| `GOOGLE_ADS_REFRESH_TOKEN` | Supabase secrets, TEST + LIVE | Ads API auth | **Depends on identity** — see §12 |
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | Supabase secrets, **LIVE only** | none — **zero code consumers** | No (orphaned) |
| `GOOGLE_SHEETS_WEBHOOK_URL` + `SHEETS_SECRET` | `sync-to-sheets`, TEST + LIVE | Apps Script Web App sync | **Depends on identity** — see §12 |
| `fonts.googleapis.com` | `index.html` | Web fonts | No |
| `google-site-verification` TXT | Root DNS | Search Console | No — **must be kept** |

---

## 5. Supabase Edge Function audit

Every email-sending function follows one pattern: build HTML → `POST https://api.resend.com/emails`
with `RESEND_API_KEY`. There is **no SMTP transport, no Gmail transport, and no provider fallback**
anywhere in either repository.

| Function | From | Reply-To | Recipient source | Provider | Google dep | Action |
|---|---|---|---|---|---|---|
| `assign-doctor` | `hello@` | — | `orders.doctor_email` | Resend | none | none |
| `notify-patient-letter` | `hello@` | — | `orders.email` | Resend | none | none |
| `notify-order-status` | `hello@` | `hello@` | order + `ADMIN_EMAIL` fallback | Resend | none | none |
| `notify-approval-request` | `noreply@` | — | admin prefs + `ADMIN_EMAIL` fallback | Resend | none | verify `noreply@` |
| `provider-reject-order` | `noreply@` | — | admin prefs | Resend | none | verify `noreply@` |
| `notify-customer-refund` | `hello@` | `hello@` | order + admin prefs | Resend | none | none |
| `notify-provider-application` | `hello@` | `hello@` | admin prefs | Resend | none | none |
| `notify-license-change` | `hello@` | `hello@` | admin prefs | Resend | none | none |
| `notify-thirty-day-reissue` / `-customer` | `hello@` | — | order / provider | Resend | none | none |
| `lead-followup-sequence` | `hello@` | `hello@` | leads | Resend | none | none |
| `send-checkout-recovery` | `hello@` | `hello@` | leads | Resend | none | none |
| **`send-review-request`** | **`support@`** | — | order | Resend | none | 🔴 **mailbox required** |
| `contact-submit` | `noreply@` | **customer address** | → `hello@pawtenant.com` | Resend | none | 🔴 `hello@` must receive |
| `contact-reply` | `hello@` | `hello@` | contact submitter | Resend | none | none |
| `send-templated-email` / `send-template-test` | `hello@` | — | dynamic | Resend | none | none |
| `broadcast-email` / `-unsubscribe` | `hello@` | `hello@` | segments | Resend | none | none |
| `send-payroll-summary-email` | `hello@` | `hello@` | hardcoded payroll list | Resend | none | none |
| `send-monthly-business-report` | `hello@` | `hello@` | report recipients table | Resend | none | none |
| `send-payout-reminder`, `send-renewal-reminders`, `send-followup-email` | `hello@` | `hello@` | various | Resend | none | none |
| `create-provider`, `create-team-member`, `approve-provider-application` | `hello@` | `hello@` | invitee | Resend | none | none |
| `admin-update-auth-email` | `hello@` | `hello@` | customer | Resend | none | none |
| `send-admin-otp`, `send-customer-otp` | `hello@` | `hello@` | staff / customer | Resend | none | none |
| `request-customer-password-reset`, `send-customer-password-reset`, `provider-reset-password`, `admin-send-password-reset` | `hello@` | — | user | Resend | none | none |
| `resend-confirmation-email` | `hello@` | `hello@` | customer | Resend | none | none |
| `create-additional-doc-invoice`, `_shared/completeAdditionalPetPayment`, `_shared/completeAdditionalDocPayment`, `fix-order-payment`, `stripe-webhook` | `hello@` | `hello@` | customer + internal | Resend | none | none |
| `resend-webhook` | n/a (receiver) | n/a | Svix-signed status events | Resend | none | none |
| `health-check` | n/a | n/a | n/a | probes `SMTP_HOST` **presence only** | none | see §7 |

**Delivery-status handling.** `resend-webhook` is subscribed to `email.sent`, `email.delivered`,
`email.delivery_delayed`, `email.complained`, `email.bounced`, `email.opened`, `email.clicked` and
verifies Svix HMAC-SHA256 with 5-minute replay protection. Message IDs are stored against
`communications`. **Carry-over from the prior audit, still unresolved and unchanged by this task:**
Resend returns 2xx for suppressed recipients, so `status='sent'` never proves delivery.

---

## 6. Supabase Auth SMTP

**Could not read the dashboard value** — no Supabase Management API token is present on this
workstation (`~/.supabase` contains only telemetry), and reading it via the browser would require
an owner session. This is the reason for the PARTIAL status.

**However, the setting was proven irrelevant to delivery by code evidence, which is a stronger
result than reading it.**

Every authentication email path in both repositories calls
`adminClient.auth.admin.generateLink(...)` — which **mints a link and returns it without sending
mail** — and then delivers that link over **Resend**. The calls that *would* invoke Supabase's
built-in mailer are absent:

| API that uses the built-in mailer | Occurrences, TEST | Occurrences, LIVE |
|---|---|---|
| `resetPasswordForEmail` | 0 (one comment noting deliberate removal) | 0 (same comment) |
| `signInWithOtp` | 0 | 0 |
| `inviteUserByEmail` | 0 | 0 |

`src/pages/customer-login/page.tsx:61` states the intent explicitly: the built-in path was replaced
"so delivery goes through Resend".

**Conclusion:** password reset, OTP, magic link and provider/team invitations all send from
`PawTenant <hello@pawtenant.com>` via Resend. The Supabase Auth SMTP panel is **inert**, and its
contents — Google credentials or otherwise — cannot break the cutover.

**Owner verification (5 minutes, non-blocking):** Supabase Dashboard → Project → Authentication →
Emails → SMTP Settings, for both projects. If the host is `smtp.gmail.com` or a Workspace user,
note it for cleanup in Task B. Do **not** change it during cutover — nothing depends on it, and an
edit risks enabling a path that is currently dormant.

---

## 7. Supabase secrets (names only; all values are masked by the CLI as SHA-256 digests)

### 7.1 Email / Google related

| Secret | TEST | LIVE | Code consumers | Classification |
|---|---|---|---|---|
| `RESEND_API_KEY` | ✅ | ✅ | ~40 functions | **RETAIN** |
| `RESEND_WEBHOOK_SECRET` | ✅ | ✅ | `resend-webhook` | **RETAIN** |
| `ADMIN_EMAIL` | ❌ | ✅ | `notify-order-status`, `notify-license-change`, `notify-approval-request`, `get-admin-notif-recipients` | **RETAIN** — verify value points to a monitored mailbox |
| `TRUSTPILOT_BCC_EMAIL` | ✅ | ✅ | `send-review-request` | **RETAIN** |
| `SMTP_HOST` | ❌ | ✅ | presence check in `health-check` only | 🟠 **UNKNOWN — owner confirmation** |
| `SMTP_PORT` | ❌ | ✅ | **none** | 🟠 **UNKNOWN — owner confirmation** |
| `SMTP_USER_CUSTOMER` | ❌ | ✅ | **none** | 🟠 **UNKNOWN — owner confirmation** |
| `SMTP_USER_DOCTOR` | ❌ | ✅ | **none** | 🟠 **UNKNOWN — owner confirmation** |
| `SMTP_PASS_CUSTOMER` | ❌ | ✅ | **none** | 🟠 **UNKNOWN — owner confirmation** |
| `SMTP_PASS_DOCTOR` | ❌ | ✅ | **none** | 🟠 **UNKNOWN — owner confirmation** |
| `GOOGLE_ADS_OAUTH_CLIENT_ID` | ✅ | ✅ | Ads functions | **RETAIN** (Ads, not mail) |
| `GOOGLE_ADS_OAUTH_CLIENT_SECRET` | ❌ | ✅ | Ads functions | **RETAIN** (Ads, not mail) |
| `GOOGLE_ADS_REFRESH_TOKEN` | ✅ | ✅ | Ads functions | 🟠 **identity-dependent — see §12** |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | ❌ | ✅ | Ads functions | **RETAIN** |
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | ❌ | ✅ | **none** | 🟠 **REMOVE after migration** (orphaned) |
| `GOOGLE_SHEETS_WEBHOOK_URL` | ✅ | ✅ | `sync-to-sheets` | 🟠 **identity-dependent — see §12** |
| `SHEETS_SECRET` | ✅ | ✅ | `sync-to-sheets` | **RETAIN** |
| Microsoft tenant / client / Graph credentials | ❌ | ❌ | — | **not required** (see §13) |

**Key observations.**

The six `SMTP_*` secrets exist on **LIVE only**, were all written on **2026-03-25** (four days
*before* the Resend domain was verified on 2026-03-25 02:36 and the Resend key was set on
2026-04-01), and have **never been updated since**. `SMTP_USER_CUSTOMER` and `SMTP_USER_DOCTOR`
share an identical digest, as do the two `SMTP_PASS_*` secrets — i.e. one credential pair stored
under four names. **No function reads any of them**; `health-check` only tests whether `SMTP_HOST`
is non-empty to decide whether to print a warning.

This is the signature of a **pre-Resend SMTP configuration that was superseded and never cleaned
up**. If the host is `smtp.gmail.com` and the user is a Workspace mailbox, these credentials die at
cancellation — with **zero functional impact**, because nothing uses them. They should be removed
in Task B for hygiene, not for continuity.

⚠️ Do not delete `SMTP_HOST` casually: removing it flips `health-check` into a "No email provider
configured" warning branch unless `RESEND_API_KEY` is present. It is present, so the branch will
not fire — but confirm before deleting.

---

## 8. Vercel environment audit

| Variable | TEST | LIVE | Type | Consumer | Email-relevant |
|---|---|---|---|---|---|
| `VITE_PUBLIC_SUPABASE_URL` | ✅ | ✅ | URL | client | no |
| `VITE_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | publishable key | client | no |
| `VITE_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | ✅ | publishable key | client | no |
| `VITE_MICROSOFT_UET_ID` / `_ENABLED` / `_DEBUG` | ❌ | ✅ | tracking config | client | no — Microsoft **Advertising** UET, unrelated to M365 |

**Vercel is completely clean.** Zero Gmail, zero Google OAuth, zero SMTP, zero Resend keys, zero
sender addresses, zero Reply-To, zero admin/support/accounts recipients, zero Microsoft Graph
configuration, in **both** environments. All email configuration lives in Supabase secrets and
source constants. **No Vercel variable requires any migration action.**

---

## 9. Database audit

### 9.1 Tables inspected

| Table | TEST | LIVE | Email relevance |
|---|---|---|---|
| `communications` | ✅ | ✅ | canonical email/SMS/call log (`type`, `direction`, `email_to`, `email_from`, `subject`) |
| `email_templates` | ✅ | ✅ | template bodies; contain `hello@pawtenant.com` |
| `payroll_email_log` | ✅ | ✅ | payroll send log |
| `admin_notification_prefs` | ✅ | ✅ | admin recipient routing |
| `admin_email_threads` | ✅ | ❌ | **TEST ONLY** |
| `admin_email_messages` | ✅ | ❌ | **TEST ONLY** |

### 9.2 Production sender reality (LIVE `communications`, `type='email'`)

| `email_from` | Rows | Last seen |
|---|---:|---|
| `PawTenant <hello@pawtenant.com>` | 7,214 | 2026-08-03 |
| *(null — legacy rows)* | 289 | 2026-04-22 |
| **`PawTenant <support@pawtenant.com>`** | **189** | **2026-07-29** |
| **inbound rows** | **0** | — |

Two facts follow. **`support@pawtenant.com` is unambiguously a live production sender** — not a
leftover constant. And **production has never recorded a single inbound email**, confirming there is
no ingestion path to preserve.

### 9.3 Mailbox inventory required at cutover

| Address | Role | Evidence | In owner's M365 list? | Risk |
|---|---|---|---|---|
| `hello@pawtenant.com` | Reply-To on ~all mail; `contact-submit` notification target; DMARC `rua`/`ruf` target; published on site, `llms.txt`, schema.org, legal pages | 58 edge-function + 89 `src` references | ✅ yes | — |
| **`support@pawtenant.com`** | **`send-review-request` From**; shown in `AssessmentSupportWidget`; in `provider-reset-password` error copy | 189 production sends | ❌ **NO** | 🔴 **replies bounce** |
| `noreply@pawtenant.com` | From-only: `contact-submit`, `notify-approval-request`, `provider-reject-order` | 4 edge-function references | ❌ not stated | 🟠 replies bounce (may be intended) |
| `admin@pawtenant.com` | **Recipient** of Stripe client-secret failure alerts (`src/lib/auditLogger.ts:3` → `send-followup-email`) | 2 `src` references | ❌ not stated | 🟠 **security alerts vanish** |
| `info@pawtenant.com` | — | **zero code references** | ✅ yes | none |
| `accounts@pawtenant.com` | — | **zero code references** | ✅ yes | none |

`ghl-test@`, `test@`, `preview@`, `you@`, `jane@` are placeholder/fixture strings — no action.

### 9.4 Admin notification recipients — LIVE (masked)

| Notification | Enabled | Recipients (masked) | Mailbox type |
|---|---|---|---|
| `_global_settings` (fallback) | ✅ | `h***********4@gmail.com` | consumer |
| `new_paid_order` | ✅ | `e*********m@gmail.com`, `o*******m@yahoo.com`, `a***********0@gmail.com` | consumer |
| `order_cancelled` | ✅ | `e*********m@gmail.com` | consumer |
| `order_completed` | ✅ | `e*********m@gmail.com` | consumer |
| `order_under_review` | ✅ | `e*********m@gmail.com` | consumer |
| `payout_reminder` | ✅ | `e*********m@gmail.com`, `o*******m@yahoo.com` | consumer |
| `provider_letter_submitted` | ✅ | `e*********m@gmail.com`, `o*******m@yahoo.com`, `a***********0@gmail.com` | consumer |
| `provider_rejected_order` | ✅ | `e*********m@gmail.com` | consumer |
| `refund_issued` | ✅ | `e*********m@gmail.com` | consumer |
| `system_health_alert` | ✅ | `e*********m@gmail.com` | consumer |
| **`unpaid_lead`** | ✅ | **`f***********t@gmail.com`** | consumer, 🔴 **hard-bounced / suppressed** |
| `provider_application` | ✅ | *(none)* → global fallback | consumer |
| `provider_license_change` | ✅ | *(none)* → global fallback | consumer |
| `checkout_recovery_sent` | ❌ | — | — |
| `renewal_reminder_sent` | ❌ | — | — |

TEST mirrors this with a smaller recipient set; `unpaid_lead` is disabled with an empty list on TEST.

**Conclusion: no admin notification depends on Google Workspace.** Every recipient is a consumer
Gmail or Yahoo account that survives cancellation untouched.

Two pre-existing issues, unchanged by this audit and carried forward from
`PROVIDER-RESEND-SUPPRESSION-AUDIT-AND-EDNA-TEST-EMAIL-001`:

- `unpaid_lead` still routes solely to a **hard-bounced, Resend-suppressed** address. Unpaid-lead
  alerts continue to be dropped. Recommendation stands: correct the address rather than
  un-suppress a bouncing one. **Not touched.**
- No admin alerting flows through any `@pawtenant.com` mailbox, so the newly provisioned `info@`
  and `accounts@` mailboxes are currently unused by the platform.

---

## 10. Admin notification recipient matrix

| Alert | Source | Current recipient (masked) | M365 mailbox needed? | Monitored? | Suppressed? | Recommended M365 target |
|---|---|---|---|---|---|---|
| Unpaid leads | `admin_notification_prefs.unpaid_lead` → `lead-followup-sequence` | `f***********t@gmail.com` | no | ❌ | 🔴 **yes** | `accounts@` or corrected personal |
| Payment failures / new paid order | `new_paid_order` → `stripe-webhook`, `notify-order-status` | 3 consumer addresses | no | ✅ | no | `accounts@` |
| Refunds | `refund_issued` → `notify-customer-refund` | `e*********m@gmail.com` | no | ✅ | no | `accounts@` |
| Disputes | *(no dedicated key — folded into Stripe webhook logging)* | — | no | — | — | `accounts@` (gap) |
| Provider failures / rejection | `provider_rejected_order` → `provider-reject-order` | `e*********m@gmail.com` | no | ✅ | no | `info@` |
| Provider assignment failures | `assign-doctor` (logs only, no admin email) | — | no | — | — | `info@` (gap) |
| Document failures / letter submitted | `provider_letter_submitted` | 3 consumer addresses | no | ✅ | no | `info@` |
| System failures | `system_health_alert` → `health-check` | `e*********m@gmail.com` | no | ✅ | no | `info@` |
| **Stripe config alerts** | **`src/lib/auditLogger.ts` → `admin@pawtenant.com`** | `admin@pawtenant.com` | 🔴 **YES** | ❓ **unknown** | unknown | **`accounts@` (or create `admin@`)** |
| Resend delivery failures | `resend-webhook` (writes DB; **no email alert**) | — | no | — | — | gap — no human is notified |
| Accounts alerts / monthly report | `send-monthly-business-report` recipients table | `h***********4@gmail.com` | no | ✅ | no | `accounts@` |

No test email was sent during this audit.

---

## 11. Resend status (read-only)

| Property | Value |
|---|---|
| Domain | `pawtenant.com` |
| Status | **verified** |
| Region | `us-east-1` |
| Sending | **enabled** |
| **Receiving** | **disabled** |
| Open / click tracking | false / false |
| Created | 2026-03-25 |
| DKIM | `resend._domainkey` — verified, resolves publicly ✅ |
| Send-subdomain MX | `send` → `feedback-smtp.us-east-1.amazonses.com` (prio 10) — verified, resolves ✅ |
| **Send-subdomain SPF TXT** | dashboard says **verified**; **does NOT resolve publicly** 🔴 |
| Webhook | `https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/resend-webhook` — enabled |
| Webhook events | `sent`, `delivered`, `delivery_delayed`, `complained`, `bounced`, `opened`, `clicked` |
| Active From addresses | `hello@`, `support@`, `noreply@` |
| Active Reply-To | `hello@` (plus per-message customer address on `contact-submit`) |

**No Resend sender or Reply-To address depends on a Google mailbox for *sending*.** Resend
authenticates by DKIM against `pawtenant.com` and is entirely independent of the MX record.
`hello@` and `support@` do, however, need working *inboxes* so replies land somewhere.

**Discrepancy to resolve (finding 3).** Resend reports the `send` SPF TXT verified, but
`send.pawtenant.com` returns **no TXT record** from a public resolver, while its MX resolves
normally — so the zone is served and only the TXT is missing. Resend caches verification state and
does not continuously re-check, which is how a "verified" badge survives record deletion. The
practical impact is limited today because Resend passes DMARC on DKIM, but it should be restored.

Suppression list was **not enumerated** in this task; the prior audit's finding that
`f***********t@gmail.com` is hard-bounced still stands. No suppression was added or removed, no key
rotated, no DNS edited, no receiving enabled, no email sent.

---

## 12. Google login / identity risk

The following are **identity-dependent**: they work today because a Google account authorised
them. If that account is a **Workspace** identity (`someone@pawtenant.com`), disabling it revokes
the grant. If it is the owner's **consumer** account, it survives.

| Dependency | Failure if minted by a Workspace identity | How to check |
|---|---|---|
| `GOOGLE_ADS_REFRESH_TOKEN` | Ads conversion uploads + spend sync stop; `sync-google-ads-conversions`, `sync-marketing-spend`, `fetch-ad-spend`, `google-ads-refund-adjustments` all fail auth | Google Account → Security → Third-party apps, on **each** candidate identity |
| `GOOGLE_SHEETS_WEBHOOK_URL` (Apps Script Web App) | `sync-to-sheets` breaks — the script executes as its **owner** | Apps Script project → Overview → owner |
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | none — orphaned, no consumers | — |
| Google Search Console | Verified via the root `google-site-verification` TXT, which persists. Per-user **access** may still be tied to a Workspace identity | Search Console → Settings → Users |
| Google Ads account access | Ads UI login lost if the manager user is a Workspace identity | Ads → Admin → Access |

**Known signal from prior work:** the SEO/GSC audit recorded that the browser's default Google
account `h***********4@gmail.com` does **not** have GSC access — implying GSC is held under a
*different* identity, which is exactly the pattern that breaks silently at cancellation.
**Verify GSC ownership before cancelling.**

### Vendor "Sign in with Google" exposure

Insufficient evidence exists in the repositories to determine login methods for third-party
consoles. This must be checked by the owner, console by console, **before** cancellation:

Cloudflare · Supabase · Vercel · GitHub · Resend · Stripe · GoHighLevel · GoDaddy · Google Ads ·
Microsoft Ads · Meta.

For each: confirm a password + MFA login exists that is **not** "Sign in with Google" on a
`@pawtenant.com` identity. Where SSO-with-Google is the only method, add an email/password
credential first. **PawTenant Admin users** authenticate against Supabase Auth with
password/OTP — there is **no Google identity provider** in the codebase, so admin access is
unaffected.

No authentication was changed.

---

## 13. Unified Admin Email & Microsoft Graph requirements

### Current state

| | TEST | LIVE |
|---|---|---|
| Email Hub tables | `admin_email_threads`, `admin_email_messages` present | **absent** |
| Inbound source | **none** — 5 "inbound" rows are first-party submissions written by `send-admin-email`, not mailbox ingestion | **none** |
| Outbound / reply source | `send-admin-email` → Resend | `communications` only |
| Thread creation | first-party, on send/draft | n/a |
| Order correlation | `order_id` on the thread | via `communications.order_id` |
| Unread state | column on thread row | n/a |
| Bell email items | `admin_notification_unified_email_contact_identity` migration | reads `communications` |
| Message volume | 5 outbound / 5 inbound (fixture scale) | 7,692 outbound / **0 inbound** |

`EmailHubPanel.tsx` is explicit that the inbox is a placeholder: *"Connect Resend inbound routing
or the Gmail API to receive emails here."* The master execution queue confirms it:
`EMAIL-INBOUND-THREADING-AND-RECONCILIATION-001` — *"No inbound email provider is connected
today."*

### Will it stop working after Google cancellation?

**No.** The Admin Portal email system depends on **none** of: Gmail API, Gmail OAuth, Gmail refresh
tokens, Google Pub/Sub, Gmail watch, Gmail forwarding, Resend inbound, or Microsoft Graph. It reads
first-party database rows written by PawTenant's own send path. Cancelling Google Workspace changes
nothing about it.

### Microsoft Graph requirement

**Microsoft Graph is NOT required for the cutover.** It becomes relevant only if the owner later
decides to build genuine inbound threading (the queued `EMAIL-INBOUND-THREADING-...-001` task).

Should that be chosen, the minimum-privilege design is — **not to be implemented in this task**:

| Item | Value |
|---|---|
| App registration | one per environment: `pawtenant-test-graph`, `pawtenant-live-graph` |
| Tenant ID | owner's M365 tenant (verification TXT `MS=ms82604276` present at root) |
| Client ID / secret | per registration; store as `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET` in Supabase secrets |
| Permissions | `Mail.Read` **application** permission, **plus an ApplicationAccessPolicy** restricting it to a mail-enabled security group containing only `hello@`, `info@`, `accounts@`, `support@`. `Mail.Send` only if the portal must send as those mailboxes — otherwise keep sending on Resend |
| Explicitly **not** requested | `Mail.ReadWrite`, `Mail.Read.All` without a scoping policy, `User.Read.All`, `Directory.Read.All` |
| Webhook (change notification) URL | `https://<project>.supabase.co/functions/v1/ms-graph-inbound` — distinct per environment |
| Lifecycle notification URL | `https://<project>.supabase.co/functions/v1/ms-graph-lifecycle` |
| Subscription renewal | Graph mail subscriptions expire in ≤3 days; a scheduled function must renew (recommend every 12 h) |
| Shared mailboxes | `hello@`, `info@`, `accounts@`, `support@` only |
| TEST / LIVE separation | separate app registrations, secrets, access policies and webhook URLs; never share a client secret |

`Mail.Read` is tenant-wide by default — **the ApplicationAccessPolicy is the control that makes it
minimum-necessary and must not be skipped.**

---

## 14. GoHighLevel

**Code-side finding (verified):** PawTenant → GHL is **outbound only** — REST calls and webhook
posts for contact upsert, pipeline stage moves, SMS send, and call logging
(`ghl-send-sms`, `ghl-webhook-proxy`, `ghl-contact-link`, `ghl-call-*`, `ghl-message-reconcile`,
`ghl-sms-inbound`, `_shared/aiSupport/ghl.ts`). Authentication is `GHL_API_KEY` +
`GHL_LOCATION_ID` — **no Google OAuth, no SMTP, no IMAP, no Google Calendar** anywhere in the
integration.

**Console-side (could not be verified — owner action).** The admin guide documents GHL-side *email
workflows* (`doctor_assigned` notification email, refund email workflow). Those run inside GHL on
GHL's own sending infrastructure and are **not visible from the repositories**. Whether GHL's
sending identity, inbound routing or calendar is currently connected to Google Workspace can only
be determined in the GHL console.

**Owner checks, per surface:**

| Surface | Where to look | Action if Google-connected |
|---|---|---|
| Outbound email | Settings → Email Services / SMTP | Reconnect via M365 SMTP or LeadConnector; prefer keeping transactional mail on Resend |
| Inbound replies | Settings → Email Services → inbound routing | Repoint to the M365 mailbox |
| Conversation threading | Conversations → Email provider | Reconnect; threads may not backfill |
| Calendar | Settings → Calendars → Connections | Disconnect Google, connect Outlook/M365 |
| Appointment booking | Calendar → integration | Re-verify booking after reconnect |
| Notification sender | Settings → Business Profile | Update to an M365 address |
| Shared mailbox support | Settings → Email Services | M365 shared mailboxes may need a licensed account or SMTP AUTH enabled |

GHL was **not** reconnected or modified.

---

## 15. DNS — current verified state

Queried against `8.8.8.8` on 2026-08-04.

| Record | Current value | Status |
|---|---|---|
| Root `MX` | `aspmx.l.google.com` (1), `alt1`/`alt2` (5), `alt3`/`alt4` (10) — **Google** | coexistence, cutover pending |
| Root `TXT` SPF | `v=spf1 include:_spf.google.com include:spf.protection.outlook.com include:spf.resend.com include:dc-fd741b8612._spfm.send.pawtenant.com ~all` | 🔴 **2 of 4 includes NXDOMAIN** |
| Root `TXT` | `MS=ms82604276` | Microsoft tenant verification ✅ |
| Root `TXT` | `google-site-verification=_LQqSINT1aSUu0dfuHxrSLyxWdp1yftJ8JLKegYSPiE` | Search Console — **KEEP** ✅ |
| `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:hello@pawtenant.com; ruf=mailto:hello@pawtenant.com; fo=1; adkim=s; aspf=s` | 🔴 **strict alignment** |
| `google._domainkey` | `v=DKIM1; k=rsa; p=MIIBIjANBg…` | Google DKIM, present |
| `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEB…` | **Resend DKIM — LOAD-BEARING** ✅ |
| `selector1._domainkey` | CNAME → `selector1-pawtenant-com._domainkey.pawtenant1.q-v1.dkim.mail.microsoft` | M365 DKIM ✅ |
| `selector2._domainkey` | CNAME → `selector2-pawtenant-com._domainkey.pawtenant1.q-v1.dkim.mail.microsoft` | M365 DKIM ✅ |
| `autodiscover` | CNAME → `autodiscover.outlook.com` | M365 ✅ |
| `send` `MX` | `feedback-smtp.us-east-1.amazonses.com` (10) | Resend ✅ |
| `send` `TXT` | **absent** (name exists, MX resolves) | 🔴 **missing SPF** |
| M365 MX target probe | `pawtenant-com.mail.protection.outlook.com` → `52.101.9.26`, `52.101.40.2`, `52.101.11.15` | **resolves — tenant provisioned, exact cutover value confirmed** ✅ |

### The three DNS defects explained

**(a) SPF permerror.** `spf.resend.com` and `dc-fd741b8612._spfm.send.pawtenant.com` both return
NXDOMAIN. Under RFC 7208 §4.6.4, an `include` whose target has no SPF record yields **permerror** —
the SPF result is not "softfail", it is *unusable*. Resend does not publish an `spf.resend.com`
record at all; its design puts SPF on the customer's `send.` subdomain, which is what the `send` MX
is for. Both includes are dead weight and should be removed.

**(b) Missing `send` SPF TXT.** The Return-Path domain for Resend mail has no SPF record, so the
Return-Path SPF check fails too.

**(c) Strict DMARC turns (a)+(b) into a single point of failure.** With `aspf=s`, SPF could never
align for Resend anyway (`send.pawtenant.com` ≠ `pawtenant.com` under strict matching). So **every
transactional email currently passes DMARC on `resend._domainkey` DKIM alone**, against a
`p=quarantine` policy. Remove or corrupt that one TXT record during Google cleanup and all
customer email is quarantined.

**Consequence for the plan: `resend._domainkey` must be treated as untouchable, and must be
re-verified after every DNS change.**

M365 DKIM CNAMEs are published, but publishing is not the same as enabling — DKIM signing must be
switched on in the Microsoft Defender portal, or M365 mail will sign as
`<tenant>.onmicrosoft.com`, which fails `adkim=s`. M365 would still pass DMARC via SPF (its
Return-Path aligns), but enabling DKIM removes the single-leg dependency.

---

## 16. DNS cutover plan

### Group A — keep unchanged during coexistence

| Record | Reason |
|---|---|
| Root `MX` → Google (all 5) | still receiving mail |
| `google._domainkey` | Google still signing outbound |
| `include:_spf.google.com` in root SPF | Google still sending |
| `include:spf.protection.outlook.com` | M365 already sending |
| `MS=ms82604276` | tenant verification |
| `google-site-verification=…` | **Search Console — never delete** |
| `selector1` / `selector2` CNAMEs | M365 DKIM |
| `autodiscover` CNAME | M365 client config |
| `resend._domainkey` | 🔴 **load-bearing — never touch** |
| `send` MX | Resend bounce handling |
| `_dmarc` | leave policy alone until the SPF repair is verified |

### Group A′ — recommended repair **before** cutover (independent of Google)

These fix pre-existing defects and de-risk the cutover. Each is a separate, reversible change:

1. Add the missing `send.pawtenant.com` TXT: `v=spf1 include:amazonses.com ~all`
2. Remove the two NXDOMAIN includes from root SPF, giving:
   `v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all`
3. Enable DKIM signing for `pawtenant.com` in the Microsoft Defender portal
4. Re-verify `resend._domainkey` resolves and send one Resend test to a seed address

Do **not** relax `adkim`/`aspf` — strict alignment is working correctly and is a security benefit.

### Group B — change at MX cutover

| Action | Record | Value |
|---|---|---|
| **Remove** | root `MX` | all 5 `*.aspmx.l.google.com` entries |
| **Add** | root `MX` | `pawtenant-com.mail.protection.outlook.com`, priority **0** *(verified to resolve)* |
| **Preserve** | `send` `MX` | `feedback-smtp.us-east-1.amazonses.com` (10) — 🔴 **must not be removed with the Google MX** |
| **Preserve** | `resend._domainkey` | unchanged |
| **Preserve** | `google-site-verification` | unchanged |

Lower root MX TTL to 300 s at least 24 h beforehand.

### Group C — remove only after complete Google retirement

Only once Workspace is cancelled, no Google mail has flowed for ≥30 days, and Ads/Sheets/GSC
identity migration (§12) is confirmed complete:

| Record | Condition |
|---|---|
| `google._domainkey` | after no Google-signed mail remains in flight |
| `include:_spf.google.com` from root SPF | after Workspace cancellation |
| Obsolete Google mail-routing records (if any) | after verification |
| **`google-site-verification`** | 🔴 **NEVER — Search Console depends on it** |

---

## 17. Breakage risk register

| # | Risk | Severity | Breaks on cancellation? | Mitigation |
|---|---|---|---|---|
| 1 | `support@` has no M365 mailbox | 🔴 P0 | **yes — replies bounce** | create mailbox/alias before cutover |
| 2 | `resend._domainkey` disturbed | 🔴 P0 | only if touched | treat as untouchable; verify after every change |
| 3 | Root SPF permerror | 🔴 P0 | already broken | Group A′ repair |
| 4 | `send` SPF TXT missing | 🔴 P0 | already broken | Group A′ repair |
| 5 | `send` MX deleted with Google MX | 🔴 P0 | only if mis-executed | explicit preserve step in Group B |
| 6 | `admin@` alerts vanish | 🟠 P1 | if no mailbox | create or repoint `auditLogger.ts` |
| 7 | `noreply@` replies bounce | 🟠 P1 | if no catch-all | create alias or accept by design |
| 8 | Ads refresh token revoked | 🟠 P1 | **if Workspace-minted** | verify identity; re-mint on a consumer account |
| 9 | Apps Script owner disabled | 🟠 P1 | **if Workspace-owned** | transfer ownership |
| 10 | GSC access lost | 🟠 P1 | if Workspace-held | add a surviving identity as owner |
| 11 | Vendor Google-SSO logins | 🟠 P1 | **if Workspace-based** | add password + MFA per §12 |
| 12 | GHL Google connection | 🟠 P1 | unknown | console audit §14 |
| 13 | M365 DKIM not enabled | 🟡 P2 | no | enable in Defender portal |
| 14 | Orphaned LIVE SMTP secrets | 🟡 P2 | no consumers | Task B cleanup |
| 15 | `unpaid_lead` suppressed recipient | 🟠 P1 | **already broken** | pre-existing; owner decision |
| 16 | Supabase Auth SMTP unread | 🟡 P2 | **no** — proven off the delivery path | verify in dashboard |

---

## 18. Required migration matrix

| Dependency | Current system | Location | Purpose | Breaks? | Replacement | Owner action | Claude work | Timing | Rollback |
|---|---|---|---|---|---|---|---|---|---|
| Human inbound `@pawtenant.com` | Google Workspace MX | Cloudflare root MX | receive mail | **YES** | M365 MX | flip MX | none | cutover | restore Google MX |
| `hello@` mailbox | Workspace | M365 (created) | Reply-To + contact target + DMARC reports | **YES** | M365 mailbox | verify receive | none | pre-cutover | — |
| **`support@` mailbox** | Workspace | **not in M365** | review-request From | **YES** | M365 mailbox/alias | **create** | none | **pre-cutover** | — |
| `noreply@` | Workspace | not stated | From-only | partial | alias or none | decide | none | pre-cutover | — |
| `admin@` | Workspace | not stated | Stripe alerts | **YES** | M365 or repoint | create or repoint | Task D | pre-cutover | revert constant |
| Transactional send | Resend | Supabase secrets | all customer email | **no** | unchanged | none | none | — | — |
| `resend._domainkey` | Resend DKIM | Cloudflare | DMARC pass | **no** | unchanged | **protect** | none | — | re-add TXT |
| Root SPF | broken | Cloudflare | authentication | already broken | corrected SPF | apply A′ | none | pre-cutover | restore string |
| `send` SPF TXT | missing | Cloudflare | Return-Path SPF | already broken | add TXT | apply A′ | none | pre-cutover | delete TXT |
| Admin recipients | consumer mailboxes | `admin_notification_prefs` | alerting | **no** | optional move to role mailboxes | decide | Task D | post-cutover | restore rows |
| Supabase Auth SMTP | unread | dashboard | **unused** | **no** | Resend | verify | none | post-cutover | — |
| LIVE `SMTP_*` secrets | unknown | Supabase secrets | **none** | **no** | delete | confirm | Task B | post-cutover | re-add |
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | orphaned | Supabase secrets | **none** | **no** | delete | confirm | Task B | post-cutover | re-add |
| Ads OAuth refresh token | Google OAuth | Supabase secrets | Ads uploads | **maybe** | re-mint | verify identity | Task F | pre-cutover | re-mint |
| Apps Script webhook | Google | Supabase secrets | Sheets sync | **maybe** | transfer owner | verify | Task F | pre-cutover | re-deploy |
| GSC verification TXT | Google | Cloudflare | Search Console | **no** | keep | **never delete** | none | — | — |
| GHL email/calendar | unknown | GHL console | workflows | unknown | M365 | audit | Task E | pre-cutover | reconnect |
| Unified Email Hub | TEST-only, first-party | Supabase | admin UI | **no** | unchanged | none | none | — | — |
| Microsoft Graph | not present | — | inbound threading | **no** | optional | decide later | Task C | optional | — |

---

## 19. Implementation task queue

### Task A — `MS365-MAILBOX-AND-DNS-CUTOVER-001` · P0
**Impact:** LIVE mail routing (no repo change).
**Owner:** create/verify `support@`, decide `noreply@` and `admin@`; apply Group A′ repairs; lower
root MX TTL to 300 s; at cutover remove Google MX, add
`pawtenant-com.mail.protection.outlook.com` priority 0, **explicitly preserve the `send` MX and
`resend._domainkey`**; enable M365 DKIM.
**Claude:** none.
**Verification:** send to `hello@`, `info@`, `accounts@`, `support@` from an external address;
confirm each lands in M365. Re-resolve `resend._domainkey` and `send` MX. Send one Resend
transactional email and confirm `delivered` (not merely `sent`). Confirm a DMARC aggregate report
arrives at `hello@`.
**Rollback:** re-add the 5 Google MX records (TTL 300 s makes this ~5 min).

### Task B — `SUPABASE-VERCEL-SECRET-CLEANUP-001` · P2
**Impact:** LIVE Supabase secrets only. **Run only after Task A is verified stable ≥7 days.**
**Owner:** confirm the six `SMTP_*` secrets and `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` are unused;
record values offline before deletion.
**Claude:** re-confirm zero consumers; check the `health-check` warning branch before removing
`SMTP_HOST`.
**Verification:** deploy nothing; run `health-check`; confirm no new warning.
**Rollback:** re-add secrets from the offline record.

### Task C — `MS-GRAPH-UNIFIED-EMAIL-INTEGRATION-001` · P3 — **OPTIONAL, NOT REQUIRED**
**Impact:** TEST first, then LIVE. Only if genuine inbound threading is wanted.
**Owner:** create per-environment app registrations; grant `Mail.Read` **with**
ApplicationAccessPolicy scoped to a group of the four role mailboxes.
**Claude:** `ms-graph-inbound` + `ms-graph-lifecycle` functions, subscription-renewal cron, ingest
into `admin_email_threads`/`admin_email_messages` (LIVE needs the tables created first).
**Verification:** send to `hello@`, confirm a thread appears in TEST; confirm the policy blocks a
non-listed mailbox.
**Rollback:** delete the subscription and revoke the app registration.

### Task D — `ADMIN-RECIPIENT-MIGRATION-001` · P1
**Impact:** LIVE `admin_notification_prefs` + `src/lib/auditLogger.ts`.
**Owner:** decide whether alerts move to `info@`/`accounts@`; decide the `unpaid_lead` fix.
**Claude:** update rows and the `auditLogger` constant per the §10 matrix.
**Verification:** trigger one alert per group; confirm receipt in M365 and `delivered` in Resend —
**`sent` is not proof**.
**Rollback:** restore the prior `per_notif_emails` arrays (capture before/after).

### Task E — `GHL-MICROSOFT-RECONNECTION-001` · P1
**Impact:** GHL console only.
**Owner:** audit and reconnect the seven surfaces in §14.
**Claude:** none (no code change; `GHL_API_KEY` is unaffected).
**Verification:** send a GHL test email; book a test appointment; confirm an inbound reply threads.
**Rollback:** reconnect the previous provider.

### Task F — `GOOGLE-OAUTH-VENDOR-LOGIN-CLEANUP-001` · P1 — **BEFORE cancellation**
**Impact:** external consoles + Ads/Sheets identity.
**Owner:** determine the identity behind the Ads refresh token, Apps Script ownership and GSC
access; re-mint or transfer to a surviving identity; add password + MFA to every vendor console in
§12 currently using Google SSO.
**Claude:** re-run `google-ads-auth-debug` **after** re-minting to confirm the token still works.
**Verification:** Ads conversion upload succeeds; `sync-to-sheets` succeeds; GSC loads.
**Rollback:** the old token remains valid until Workspace is actually cancelled — do this first.

### Task G — `POST-MIGRATION-GOOGLE-DNS-CREDENTIAL-REMOVAL-001` · P2 — **LAST**
**Impact:** Cloudflare DNS + Google account.
**Owner:** after ≥30 days of stable M365 mail, remove `google._domainkey` and
`include:_spf.google.com`; then cancel Workspace. **Never remove `google-site-verification`.**
**Claude:** none.
**Verification:** re-resolve root SPF; confirm ≤10 lookups and no NXDOMAIN include; send a Resend
test and confirm DMARC pass; confirm GSC still verified.
**Rollback:** re-add the removed records (values recorded in §15).

---

## 20. Exact safe cutover order

1. **Task F** — vendor logins, Ads token, Apps Script, GSC. *Before anything else; reversible only while Workspace lives.*
2. **Task A, part 1** — create `support@`; decide `noreply@`/`admin@`; apply Group A′ SPF repairs; enable M365 DKIM. Verify `resend._domainkey` and `send` MX still resolve.
3. **Task E** — GHL console audit and reconnection.
4. **Soak 48 h.** Confirm Resend still shows `delivered`, and DMARC reports arrive at `hello@`.
5. **Task A, part 2** — lower root MX TTL to 300 s; wait 24 h; flip MX to Microsoft, preserving the `send` MX and `resend._domainkey`.
6. **Verify** — external mail to all four role mailboxes; one Resend transactional email confirmed `delivered`; DMARC report received.
7. **Task D** — migrate admin recipients; fix `unpaid_lead`.
8. **Soak 7 days.**
9. **Task B** — secret cleanup.
10. **Soak to 30 days**, then **Task G** — remove Google DKIM + SPF include, cancel Workspace. **Keep `google-site-verification`.**
11. **Task C** — optional, any time after step 6.

---

## 21. Rollback summary

| Step | Rollback | Time |
|---|---|---|
| MX flip | re-add the 5 Google MX records (values in §15) | ~5 min at TTL 300 |
| SPF repair | restore the original SPF string verbatim | ~5 min |
| `send` TXT added | delete the TXT | ~5 min |
| Admin recipients | restore prior `per_notif_emails` arrays | immediate |
| Secret cleanup | re-add from the offline record | immediate |
| Google DKIM/SPF removal | re-add (values in §15) — **only possible while Workspace lives** | ~5 min |
| Workspace cancellation | **IRREVERSIBLE** — the true point of no return | — |

The only irreversible step is cancellation itself. Everything before it is a DNS or config edit
recoverable in minutes, which is why Group C must wait 30 days.

---

## 22. Owner actions required (consolidated)

**Blocking, before cutover**
1. Create `support@pawtenant.com` in M365 — **live sender with 189 production sends**.
2. Decide `noreply@pawtenant.com` — alias, catch-all, or accept bouncing replies.
3. Decide `admin@pawtenant.com` — create it, or approve repointing `auditLogger.ts`.
4. Determine the Google identity behind `GOOGLE_ADS_REFRESH_TOKEN`, the Apps Script Web App, and Search Console access.
5. Add non-Google credentials to every vendor console currently using Google SSO.

**Blocking, verification only**
6. Read the Supabase Auth SMTP panel on both projects (record; do not change).
7. Audit the seven GHL surfaces in §14.

**Recommended before cutover**
8. Approve the Group A′ SPF repairs and enable M365 DKIM.
9. Decide the `unpaid_lead` suppressed-recipient fix (carried from the prior audit).

---

## 23. Confirmation

No Cloudflare or Microsoft DNS was changed. No Google MX, `google._domainkey` or SPF record was
removed or edited. Google Workspace was not cancelled. No Supabase SMTP setting, secret or database
row was changed. No secret was rotated. No customer, provider, admin or test email was sent. No SMS
was sent. No GHL, Vercel or Resend configuration was modified. No Edge Function or frontend was
deployed. No Resend suppression was added or removed and receiving was not enabled.

All secret values shown by the Supabase CLI are SHA-256 digests, not plaintext. Personal email
addresses are masked. No API key, OAuth secret, refresh token, SMTP credential or customer PII
appears in this document.
