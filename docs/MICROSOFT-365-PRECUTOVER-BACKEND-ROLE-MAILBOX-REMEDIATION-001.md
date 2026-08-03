# MICROSOFT 365 PRE-CUTOVER — BACKEND ROLE-MAILBOX & NOTIFICATION REMEDIATION

**Task ID:** `MICROSOFT-365-PRECUTOVER-BACKEND-ROLE-MAILBOX-REMEDIATION-001`
**Priority:** P0 — email continuity before the Microsoft 365 MX cutover
**Date:** 2026-08-04
**Predecessor:** `docs/GOOGLE-WORKSPACE-TO-MICROSOFT-365-BACKEND-DEPENDENCY-AUDIT-001.md`

**Final status:** `PARTIAL — CORE ROUTING IS SAFE BUT ONE OR MORE RECIPIENT, GHL, DELIVERY-MONITORING OR OWNER-CONSOLE ITEMS REMAIN`

Core routing is implemented, deployed to TEST and LIVE, and proven by delivered
mail. Four items remain that this task could not close from a workstation: the
GHL console audit, the Supabase Auth SMTP panel read, the dead Stripe-alert code
path, and the owner's decision on pruning personal recipient addresses.

---

## 1. What changed and why

Three defects were fixed. All three were live before this task.

**`support@pawtenant.com` had no Reply-To.** It is the visible sender on review
requests — 189 LIVE sends, most recent 2026-07-29. Every customer who replied
landed in `support@`, a mailbox with no monitoring path. Replies now go to
`hello@`. The support-branded sender is preserved deliberately, not folded away.

**`admin@pawtenant.com` was a dead alert route.** It sat in `src/lib/auditLogger.ts`
as the destination for Stripe client-secret failure alerts, implying working
coverage that did not exist.

**`unpaid_lead` on LIVE routed solely to a hard-bounced, Resend-suppressed
address.** 100% of unpaid-lead alerts had been silently dropped. Now `hello@`.

---

## 2. Repository preflight

| | TEST | LIVE |
|---|---|---|
| Branch | `main` | `main` |
| HEAD before | `6f15156` | `a2716b1` |
| HEAD after | **`2da5eb4`** | **`dc03029`** |
| Origin sync before | `0 0` | `0 0` |
| Tracked working tree | clean | clean |
| Concurrent writer | none during this task | none during this task |
| `send-review-request` | v47 → **v48**, `verify_jwt` true (preserved) | v76 → **v77**, `verify_jwt` true (preserved) |

A concurrent LIVE writer was active during the *previous* task (`a2716b1`). It
was idle throughout this one; LIVE was re-verified `0 0` immediately before both
the DB write and the commit. No `reset`, `clean`, `stash`, `rebase`, `merge`,
force push, worktree or side clone was used.

---

## 3. Owner-confirmed mailboxes

| Mailbox | Exists | Now used by the application |
|---|---|---|
| `accounts@pawtenant.com` | ✅ | financial alerts (4 notification keys) |
| `hello@pawtenant.com` | ✅ | Reply-To everywhere; contact target; unpaid-lead alerts |
| `info@pawtenant.com` | ✅ | system alerts (5 keys) + frontend config-alert constant |
| `support@pawtenant.com` | ✅ | **preserved** as the review-request visible sender |
| `socials@pawtenant.com` | ✅ | **deliberately unused** — no social-media notification exists |

All five confirmed **not suppressed** in Resend (checked individually; each
returned 404 *suppression not found*). This mattered: routing `unpaid_lead` to a
suppressed address is exactly the failure being fixed.

---

## 4. Sender matrix (post-change, both environments)

| Sender | Used by | Reply-To | Status |
|---|---|---|---|
| `PawTenant Support <support@pawtenant.com>` | `send-review-request` | **`hello@`** (new) | ✅ delivered-tested |
| `PawTenant <hello@pawtenant.com>` | ~35 functions — auth, orders, providers, leads, refunds, broadcasts | `hello@` | unchanged |
| `PawTenant Contact <noreply@pawtenant.com>` | `contact-submit` | customer's own address | unchanged |
| `PawTenant Admin <noreply@pawtenant.com>` | `notify-approval-request`, `provider-reject-order` | none (internal) | unchanged |

The From display name on review requests changed from `PawTenant` to
`PawTenant Support`, matching the task's preferred configuration. This is
visible to customers and appears in `communications.email_from`.

---

## 5. Reply-To matrix

| Flow | Before | After |
|---|---|---|
| Review request | **none** | `hello@` |
| Customer/provider transactional | `hello@` | `hello@` (unchanged) |
| Contact-form acknowledgement | submitter's address | unchanged |
| Internal admin alerts | none | none (no human reply expected) |

No Reply-To anywhere points at a Google-only or personal address.

---

## 6. Internal recipient matrix

Additive by design: **existing team recipients were preserved, not replaced.**
Role mailboxes are new and not yet proven to be monitored day-to-day; removing
the working personal addresses in the same change would have risked going dark.
Pruning is an owner decision — SQL in §12.

| Notification key | Before (masked) | After | Class | Change |
|---|---|---|---|---|
| `new_paid_order` | `e***@gmail.com`, `o***@yahoo.com`, `a***@gmail.com` | + `accounts@` | financial | added |
| `order_cancelled` | `e***@gmail.com` | + `accounts@` | financial | added |
| `payout_reminder` | `e***@gmail.com`, `o***@yahoo.com` | + `accounts@` | financial | added |
| `refund_issued` | `e***@gmail.com` | + `accounts@` | financial | added |
| `order_completed` | `e***@gmail.com` | + `info@` | system | added |
| `order_under_review` | `e***@gmail.com` | + `info@` | system | added |
| `provider_letter_submitted` | `e***@gmail.com` (+2 on LIVE) | + `info@` | system | added |
| `provider_rejected_order` | `e***@gmail.com` | + `info@` | system | added |
| `system_health_alert` | `e***@gmail.com` | + `info@` | system | added |
| **`unpaid_lead`** | **`f***@gmail.com` (hard-bounced)** | **`hello@` only** | lead ops | **replaced** |
| `provider_application` | NULL → global fallback | *unchanged* | provider ops | **not touched** |
| `provider_license_change` | NULL → global fallback | *unchanged* | provider ops | **not touched** |
| `_global_settings` | `h***@gmail.com` | *unchanged* | owner catchall | **not touched** |
| `checkout_recovery_sent` | disabled | *unchanged* | — | — |
| `renewal_reminder_sent` | disabled | *unchanged* | — | — |

**Why `provider_application` and `provider_license_change` were left alone.**
Both are `NULL`, which means "fall through to the global catchall" — currently
the owner's own address, and working. Writing an array into them would *remove*
that fallback and reduce the owner's visibility. That is a behaviour change the
task did not ask for. Flagged as an owner decision in §11.

**Why `unpaid_lead` was replaced rather than appended.** Its only recipient
delivers nothing. Appending would have left a permanently bouncing address in
the fan-out. The Resend suppression itself was **not** removed, no historical
alerts were replayed, and no lead was contacted.

---

## 7. Accounts / Stripe handling

The Stripe **account** email is already `accounts@pawtenant.com` and was **not
touched**. No Stripe setting, key, webhook, payment, refund or dispute was
created or modified.

Application-generated financial alerts (`new_paid_order`, `order_cancelled`,
`payout_reminder`, `refund_issued`) now include `accounts@`.

### The `admin@pawtenant.com` classification

`admin@` was **not** blanket-replaced with Accounts. It appeared exactly twice in
each repo and each was classified by business purpose:

| Site | Purpose | Decision |
|---|---|---|
| `src/lib/auditLogger.ts:3` | Stripe **client-secret failure** alert | → **`info@`** |
| `AdminNotificationPrefsPanel.tsx:725` | UI **placeholder text** only | → `info@` (cosmetic) |

**Why `info@` and not `accounts@`.** The alert body reads: *missing or invalid
Stripe publishable key · edge function configuration issue · Stripe account
connectivity problem · check the System Health tab*. Nobody reconciles money in
response to it — an engineer fixes a key. The task's own mapping puts
"configuration alerts" and "integration failures" under `info@`, and scopes
`accounts@` to money events (payments, refunds, disputes, chargebacks, payouts,
reconciliation). This one is titled "Stripe" but is not a money event.

**This is the one judgement call in the task that a reasonable owner might flip.**
If you want it in Accounts, it is a one-line change in `src/lib/auditLogger.ts`
in both repos — see §12.

### 🔴 The alert has never worked, and repointing it does not fix that

Verified in both repositories:

1. **Auth fails.** `auditLogger.ts` runs in the browser and calls
   `send-followup-email` with `VITE_PUBLIC_SUPABASE_ANON_KEY`. That function's
   `resolveAdminAccess()` accepts only the service-role key or an admin Supabase
   Auth session. The anon key is neither → **401**.
2. **Payload shape is wrong.** It posts `{ to, subject, body }`. The function
   reads `{ email, first_name, bulk }`, returns **400** on the missing `email`,
   and even on success would send a *provider-application follow-up* template —
   not this alert — and would write to `provider_applications`.

Both failures are swallowed by the `catch {}`. `admin@pawtenant.com` has never
received a single alert. The address is now correct; **the route is still dead**
and needs its own task (a service-role system-alert endpoint — the browser
should not be the trigger). A comment in both repos records this so a future
reader does not mistake the fix for working coverage.

---

## 8. Supabase Auth & Resend — preserved

**Auth architecture unchanged.** Every auth email still uses
`auth.admin.generateLink()` (mints a link, sends nothing) and delivers via
Resend. `resetPasswordForEmail`, `signInWithOtp` and `inviteUserByEmail` remain
absent from both repos. No dependency on Gmail SMTP, Microsoft SMTP, or the
Supabase default mailer was introduced.

**Resend unchanged.** API keys, verified domain, `resend._domainkey`,
`send.pawtenant.com` MX and SPF TXT, sending-enabled state, and the full
suppression history are all untouched. Receiving remains **disabled**. Resend
was **not** replaced with Microsoft SMTP.

---

## 9. Tests and quality gates

### Static

| Gate | TEST | LIVE |
|---|---|---|
| `check-role-mailbox-routing` | **5/5 pass** | **5/5 pass** |
| Negative controls (self-test) | **6/6 caught** | **6/6 caught** |
| Typecheck (`tsc --noEmit`) | **0 errors** | **0 errors** |
| Production build | **PASS** (exit 0) | **PASS** (exit 0) |
| Full existing guard suite | PASS | PASS |

No pre-existing errors were present in either repo, so there were none to
distinguish from new ones.

The guard's negative controls include `R3b`, which **comments out** the
`reply_to` wiring rather than deleting it — proving the check tests the *use*
inside the Resend payload object, not the mere presence of the identifier
somewhere in the file. Comments are stripped before every "must NOT contain"
scan. Both the guard and its self-test were re-run **after** the final source
edit in each repo.

### Deployed-artifact verification

`send-review-request` deployed source was read back from TEST (v48) and confirmed
to contain `const FROM_EMAIL = SUPPORT_FROM;`, `reply_to: OPERATIONAL_REPLY_TO`
inside `resendPayload`, and the bundled `_shared/roleMailboxes.ts`. Verified by
**source**, not by bundle hash. LIVE (v77) was verified by asset manifest,
version increment and local-source diff.

### Controlled sends — all three DELIVERED

No customer, provider or marketing email was sent. No SMS. Each send carried an
idempotency key so a retry could not duplicate.

| # | From | To | Reply-To | Resend ID | **Final status** |
|---|---|---|---|---|---|
| 1 | `PawTenant Support <support@>` | `hello@` | `hello@` | `7a0aef9f…` | **delivered** |
| 2 | `PawTenant <hello@>` | `accounts@` | `hello@` | `7d4400ba…` | **delivered** |
| 3 | `PawTenant <hello@>` | `info@` | `hello@` | `3e4dff8e…` | **delivered** |

Status was read back per message and is **`delivered`**, not `sent` — an HTTP 200
and a `sent` status prove nothing, since Resend returns 2xx for suppressed
recipients. Test 1 doubles as proof that the new `unpaid_lead` destination
accepts mail.

Because Google MX is still authoritative, these landed in Google during
coexistence. That is expected and does not weaken the proof: what is being
verified pre-cutover is **sender, recipient, Reply-To, delivered status and
absence of duplicates**. Microsoft inbound receipt is verified after the flip.

### LIVE drift preserved

LIVE's `send-review-request` carries a different logo URL from TEST
(`static.readdy.ai/...` vs `pawtenant.com/assets/...`). Only the three routing
hunks were ported. Post-mirror diff between the two files is **exactly one line
— the logo** — confirming no accidental parity copy.

---

## 10. Preservation proof

| Claim | Evidence |
|---|---|
| Stripe account email still `accounts@pawtenant.com` | never accessed or modified |
| No Stripe setting changed | no Stripe API call made |
| No payment / refund / dispute created | none |
| No customer email sent | 3 sends, all to internal role mailboxes |
| No provider email sent | none |
| No SMS | no Twilio/GHL call |
| No GHL change | none |
| No Google Ads change | none |
| No order-status change | no write to `orders` |
| No provider-assignment change | none |
| No suppression deleted | suppression list read-only (4 lookups) |
| No DNS / MX / SPF / DKIM / DMARC change | none |
| Google Workspace not cancelled | untouched |
| Resend remains the sender | unchanged |
| Resend receiving still disabled | unchanged |
| `verify_jwt` preserved | true → true, both environments |

---

## 11. Owner actions remaining

1. **GHL console audit** — could not be inspected from a workstation. PawTenant →
   GHL is outbound-only (API key + webhooks, no Google OAuth/SMTP/IMAP/Calendar
   in code), but GHL-side email workflows and any Google connection live in the
   GHL console. Seven surfaces listed in the predecessor audit §14.
2. **Supabase Auth SMTP panel** — read and record on both projects. Proven off
   the delivery path by code, so non-blocking. Do not change it during cutover.
3. **Decide the `auditLogger` classification** — `info@` (implemented) vs
   `accounts@`. One-line change, §12.
4. **Approve the dead Stripe-alert repair** as its own task — restoring it needs
   a service-role system-alert endpoint, not a browser call.
5. **Decide whether to prune personal recipients** once `accounts@` and `info@`
   are confirmed monitored. SQL in §12.
6. **Decide `provider_application` / `provider_license_change`** — leave on the
   owner catchall (current) or route to a role mailbox.
7. **Confirm `noreply@pawtenant.com`** — alias, catch-all, or accept that replies
   bounce. It is a From-only address on three functions.

---

## 12. Rollback

All rollbacks are forward-only SQL or a one-line edit. Nothing here requires a
history rewrite.

**Recipient routing — LIVE.** Restore the exact pre-change arrays:

```sql
update admin_notification_prefs set per_notif_emails = array['eservices.dm@gmail.com','omer_kam@yahoo.com','asimiqbal2030@gmail.com']::text[] where notification_key = 'new_paid_order';
update admin_notification_prefs set per_notif_emails = array['eservices.dm@gmail.com']::text[] where notification_key in ('order_cancelled','order_completed','order_under_review','provider_rejected_order','refund_issued','system_health_alert');
update admin_notification_prefs set per_notif_emails = array['eservices.dm@gmail.com','omer_kam@yahoo.com']::text[] where notification_key = 'payout_reminder';
update admin_notification_prefs set per_notif_emails = array['eservices.dm@gmail.com','omer_kam@yahoo.com','asimiqbal2030@gmail.com']::text[] where notification_key = 'provider_letter_submitted';
update admin_notification_prefs set per_notif_emails = array['freelancerspit@gmail.com']::text[] where notification_key = 'unpaid_lead';
```

⚠️ The last line restores a **hard-bounced** address and re-breaks unpaid-lead
alerting. Only run it if the whole change is being reverted.

**Recipient routing — TEST.** Same, except `new_paid_order` and
`provider_letter_submitted` had no `asimiqbal2030@` entry, and `unpaid_lead` was
`{}` with `enabled = false`.

**Optional prune** (only after the role mailboxes are confirmed monitored):

```sql
update admin_notification_prefs
set per_notif_emails = array(select e from unnest(per_notif_emails) e where e like '%@pawtenant.com'), updated_at = now()
where notification_key in ('new_paid_order','order_cancelled','payout_reminder','refund_issued',
                           'order_completed','order_under_review','provider_letter_submitted',
                           'provider_rejected_order','system_health_alert');
```

**Move the Stripe config alert to Accounts** — in both repos, change
`src/lib/auditLogger.ts` line `const ALERT_EMAIL = "info@pawtenant.com";` to
`"accounts@pawtenant.com"`, then update guard check `R4` in
`scripts/check-role-mailbox-routing.mjs` to expect the new value.

**Code rollback:** `git revert 2da5eb4` (TEST) / `git revert dc03029` (LIVE),
then redeploy `send-review-request` with a plain
`npx supabase functions deploy send-review-request --project-ref <ref>` — plain
deploy is correct here because `verify_jwt` is **true**; passing
`--no-verify-jwt` would wrongly flip it to false.

---

## 13. Exact MX cutover checklist

This task changed **no DNS**. The owner is handling DNS manually. Backend state
is now ready.

**Before the flip**
- [ ] Confirm all five role mailboxes receive external mail in Microsoft.
- [ ] Confirm `resend._domainkey` still resolves. 🔴 **Under `p=quarantine` with
      strict alignment, this DKIM record is the only thing making transactional
      mail pass DMARC.** Re-check after every DNS edit.
- [ ] Confirm `send.pawtenant.com` MX **and** its SPF TXT resolve.
- [ ] Confirm root SPF has no NXDOMAIN includes (`spf.resend.com` and
      `dc-fd741b8612._spfm.send.pawtenant.com` were both dead — removing them was
      the planned correction).
- [ ] Enable DKIM signing for `pawtenant.com` in the Microsoft Defender portal.
- [ ] Lower root MX TTL to 300 s at least 24 h ahead.

**At the flip**
- [ ] Remove the five Google MX records.
- [ ] Add `pawtenant-com.mail.protection.outlook.com`, priority **0**.
- [ ] 🔴 **Preserve `send.pawtenant.com` MX** — it is an MX record and is easy to
      delete alongside the Google ones. Removing it breaks Resend bounce handling.
- [ ] 🔴 **Preserve `resend._domainkey`.**
- [ ] 🔴 **Preserve the root `google-site-verification` TXT** — Search Console.

**After the flip**
- [ ] Send external mail to `hello@`, `info@`, `accounts@`, `support@`,
      `socials@`; confirm each arrives in Microsoft.
- [ ] Reply to a review-request email; confirm the reply lands in `hello@`.
- [ ] Trigger one financial alert; confirm `accounts@` receives it.
- [ ] Trigger one system alert; confirm `info@` receives it.
- [ ] Confirm one real transactional email reaches **`delivered`** in Resend.
- [ ] Confirm a DMARC aggregate report arrives at `hello@`.
- [ ] Restore DMARC from the temporary `p=none` back to `p=quarantine`.

---

## 14. Exact next task

`GHL-MICROSOFT-RECONNECTION-001` — audit the seven GHL surfaces and reconnect
anything bound to Google Workspace. It is the last dependency that could break
at cancellation and is entirely owner-console work.

Running in parallel, owner-side: `MS365-MAILBOX-AND-DNS-CUTOVER-001` (the §13
checklist).

Deferred until after the cutover: `SYSTEM-ALERT-ROUTE-REPAIR-001` — give the
Stripe client-secret alert a real service-role delivery path.
