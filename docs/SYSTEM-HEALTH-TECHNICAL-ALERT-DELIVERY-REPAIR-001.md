# SYSTEM HEALTH TECHNICAL ALERT — DELIVERY REPAIR

**Task ID:** `SYSTEM-HEALTH-TECHNICAL-ALERT-DELIVERY-REPAIR-001`
**Priority:** P0 — silent production alert failure
**Date:** 2026-08-04
**Predecessor:** `docs/MICROSOFT-365-PRECUTOVER-BACKEND-ROLE-MAILBOX-REMEDIATION-001.md`

**Final status:** `LIVE COMPLETE — TECHNICAL AND CONFIGURATION FAILURES NOW CREATE AUDIT EVIDENCE AND DELIVER DEDUPLICATED SYSTEM-HEALTH EMAIL ALERTS TO INFO@PAWTENANT.COM; SILENT FAILURE PATH REMOVED`

---

## 1. The defect

PawTenant's only technical alert had never delivered a single message. It was
broken in three independent ways, and each one alone was fatal.

`src/lib/auditLogger.ts` watched for `stripe_no_client_secret` — customers
unable to pay — and on the third occurrence in an hour tried to email an alert.
It did this by POSTing to `send-followup-email`:

```
POST /functions/v1/send-followup-email
Authorization: Bearer <ANON KEY>
{ to, subject, body }
```

**Failure 1 — authentication.** `send-followup-email` gates on
`resolveAdminAccess()`, which accepts only the service-role key or a Supabase
Auth session belonging to an admin. The anon key is neither, so the call
returned **401**.

The two environments even failed at different layers, which is worth recording:

| | `send-followup-email` `verify_jwt` | Where the 401 came from |
|---|---|---|
| TEST | `true` | anon key passes the platform gate, then `resolveAdminAccess()` rejects |
| LIVE | **`false`** | request reaches the function directly, `resolveAdminAccess()` rejects |

**Failure 2 — payload contract.** The function reads
`{ email, first_name, bulk }`. The caller sent `{ to, subject, body }`. `body.email`
was `undefined`, so an authorised call would have returned **400 "email is
required for single mode"**. Worse, had it somehow passed, the function sends a
**provider-application follow-up template** and writes `followup_sent_at` to
`provider_applications` — a customer-facing template and an unrelated table
mutation, triggered by a Stripe outage.

**Failure 3 — the silent catch.** Both failures landed in:

```ts
} catch {
  // Silent fail — don't break flow if alert fails
}
```

No log line, no audit row, no return value. The alert was invisible, so nobody
could discover it was broken by using the product.

**Why the previous task did not fix it.** `MICROSOFT-365-PRECUTOVER-...-001`
repointed the recipient from `admin@` to `info@` and documented the defect. The
recipient was never the problem. Repointing a dead route leaves it dead.

---

## 2. Architecture decision

The decisive constraint: `stripe_no_client_secret` is raised from
`src/pages/assessment/page.tsx` — the **public checkout flow**. There is no
admin session, and there cannot be one; the alert fires precisely when an
anonymous customer fails to pay. So the caller is an anonymous browser holding
only the anon key, and any design that assumes an authenticated admin is
unimplementable.

**Rejected:** reusing `send-followup-email` (wrong contract, customer-facing
template, mutates `provider_applications`). **Rejected:** a service-role key in
the browser. **Rejected:** disabling `verify_jwt` to make the call work.

**Chosen:** a dedicated endpoint, `send-system-health-alert`, that keeps
`verify_jwt = true` and treats the caller as untrusted anyway.

The key insight is that `verify_jwt = true` is **not** an obstacle here. The
Supabase anon key *is* a project-signed JWT, so it satisfies the platform gate —
demonstrated by `create-payment-intent` (v64) and `contact-submit` (v34), both
`verify_jwt = true` and both called anonymously from public pages every day. So
JWT verification stays on, and no bypass was needed. But because the anon key
ships in the public bundle, the gate is a speed bump, not the security boundary.
The boundary is the application layer:

| Control | Implementation |
|---|---|
| **Recipient** | `SYSTEM_ALERT_RECIPIENT` constant. A caller-supplied `to` is ignored and the attempt is recorded. |
| **No recipient in the client type** | `SystemAlertInput` has no `to` field, so a future caller cannot reintroduce one. |
| **Subject** | Composed server-side from the allowlisted `alert_type`. Callers supply facts, not content. |
| **Alert types** | Fixed allowlist of six. Unknown → 400 + audit row. |
| **Free text** | Tag-stripped, control-char stripped, whitespace-collapsed, length-capped, HTML-escaped at render. |
| **Metadata** | Primitives only, ≤12 keys, ≤200 chars each; nested objects/arrays dropped; credential-shaped keys removed. |
| **Flood control** | 60-min dedupe per alert + a 6/hour global ceiling. |
| **Audit** | A row for every outcome — sent, suppressed, rejected, failed. |
| **Recursion** | The function never calls itself; its own failures go to `audit_logs` and the console only. |

---

## 3. Payload

```ts
{
  alert_type: "stripe_no_client_secret" | "missing_configuration"
            | "edge_function_failure"   | "integration_failure"
            | "delivery_health"         | "system_health_test",
  severity?: "info" | "warning" | "critical",
  summary?: string,          // ≤1000, sanitized
  source?: string,           // ≤120
  route?: string,            // ≤200
  correlation_id?: string,   // ≤120
  occurred_at?: string,      // ISO; server falls back to now()
  metadata?: Record<string, string | number | boolean>,
}
```

No `to`, no `subject`, no HTML. Explicitly refused: arbitrary markup, arbitrary
recipients, request bodies, API keys, tokens, service-role keys, Stripe
secrets, customer/assessment/medical data, provider notes, raw DB records, full
stack traces.

**Dedupe key** is server-derived: `${environment}:${alert_type}:${source}:${route}`.
**Environment** comes from the existing `RESUME_TOKEN_ENVIRONMENT` secret (present
in both projects), failing safe to `test` — an unset value can never mislabel a
TEST alert as LIVE. No new secret was introduced.

**Email:** From `PawTenant System <hello@pawtenant.com>` (already-verified
sender), To `info@pawtenant.com`, **no Reply-To** — machine-to-operator, nobody
replies. Timestamps render in America/New_York.

---

## 4. Delivery logging

Every attempt writes to `audit_logs` with `category = "system_health"`:

| Action | When | Records |
|---|---|---|
| `system_health_alert_sent` | email accepted | Resend message id, `delivery_status: "accepted"`, masked recipient, dedupe key, environment, subject |
| `system_health_alert_suppressed` | dedupe or ceiling | reason, dedupe key — the occurrence is counted, not lost |
| `system_health_alert_rejected` | unknown/missing `alert_type` | reason |
| `system_health_alert_failed` | Resend or internal error | failure reason, Resend status |

**`accepted` is never rendered as `delivered`.** Resend returns 2xx for
suppressed recipients, so HTTP acceptance is not proof of delivery — the
terminal state lives in the `resend-webhook` events. The controlled tests below
were confirmed `delivered` by reading Resend directly.

---

## 5. Admin System Health visibility

The four alert actions were added to the existing `SystemHealthTab` audit query
— no new dashboard. They are **deliberately excluded from `clearOldErrors`**,
the 30-day bulk-delete button: these rows are the evidence that alerting works,
and quietly enrolling them in a bulk delete would be a footgun. Volume is
bounded to ≤6/hour by design, so unbounded growth is not a concern.

`loadAuditFailures`' own `catch { /* silent */ }` was replaced with a logged catch.

---

## 6. TEST proof

Fixtures ran against the **deployed** TEST function (v1, `verify_jwt` true).
Synthetic only — no customer, provider, order, payment, Stripe write, GHL, SMS
or Ads mutation.

| Case | Expectation | Result |
|---|---|---|
| **K** unauthenticated (no JWT) | rejected | **401** `UNAUTHORIZED_NO_AUTH_HEADER` ✅ |
| **L** authenticated (anon key) | accepted | 200, sent ✅ |
| **C** missing `alert_type` | 400 + audit | 400, `system_health_alert_rejected` ✅ |
| **C2** unknown `alert_type` | 400 + audit | 400, `system_health_alert_rejected` ✅ |
| **A** valid alert | sent to info@, message id | ✅ `13b092a3…`, `recipientRole: INFO` |
| **A** status wording | `accepted`, never `delivered` | ✅ |
| **F** duplicate in cooldown | suppressed, no 2nd email | ✅ `reason: deduped` |
| **B** caller-supplied `to: attacker@example.com` | **ignored** | ✅ delivered to `info@pawtenant.com`; audit `caller_supplied_recipient_ignored: true` |
| **B** `api_key` / `session_token` / `authorization` metadata | dropped | ✅ all three absent; only `safe_field` survived |
| **D** 4000-char summary | truncated | ✅ capped at 1000 |
| **E** `<script>` + `<img onerror>` | stripped/escaped | ✅ tags gone, quotes escaped, inert text |
| **E** nested object / array metadata | dropped | ✅ `nested`/`arr` absent; `num`/`bool` coerced |
| **H** different alert type | sends independently | ✅ not deduped against others |
| **M** TEST subject | says TEST | ✅ `[PawTenant TEST] …` |
| **N** no customer/provider data | none present | ✅ |
| **O** recursion guard | static | ✅ guard S10 |

**12/12 runtime assertions passed.** Four fixture emails were confirmed
**delivered** in Resend, all to `info@pawtenant.com`.

Not simulated: **I** (Resend API failure) and **J** (audit insert failure).
Both would have required breaking a live credential or table to exercise. The
handling paths are pinned statically instead — `system_health_alert_failed` is
written before the 502 return, and the audit helper cannot throw. Listed in
§10 as a residual risk.

---

## 7. Regression guard

`scripts/check-system-health-alert-delivery.mjs` — **11 checks, 12 negative
controls, all caught**, wired into `build` in both repos.

S1 no `send-followup-email` call · S2 escalation via the typed client, not a raw
`{to,subject,body}` · S3 no service-role key in shipped `src/` · S4 client has no
recipient parameter · S5 server ignores caller `to` · S6 recipient is info@ ·
S7 dedupe **and** ceiling enforced · S8 no empty `catch {}` in the alert path ·
S9 metadata HTML-escaped · S10 no self-invocation · S11 no reuse of the
follow-up mailer.

Three guard bugs were found by its own self-test and fixed before the guard was
trusted:

- **S3 read from disk**, so it could not see a mutated in-memory source and
  reported a false pass. It now checks the in-memory copies first, then walks
  the rest of `src/`.
- **S7/S7b tested the mention, not the declaration.** Renaming
  `const MAX_EMAILS_PER_HOUR` left the identifier at its use site, so the check
  still passed with the limit gone. It now asserts
  `const MAX_EMAILS_PER_HOUR = <number>;` and `const COOLDOWN_MINUTES = <number>;`.

A real defect was also caught: an empty `catch { /* ignore */ }` left in
`loggedFetch`. Rather than weaken the guard, the code was made explicit —
`catch { body = null; }` — since an absent JSON error body is expected, not a
swallowed failure.

**`check-role-mailbox-routing` R4 was re-contracted, not bypassed.** It pinned
`ALERT_EMAIL === "info@pawtenant.com"` inside `auditLogger`. That constant is now
deliberately gone, because the browser must not name a recipient at all. The
replacement contract is strictly stronger: *the frontend holds no address, and
the server constant is info@* — with two negative controls (reintroduce a
frontend address; repoint the server constant).

---

## 8. Commits, versions and deployment

| | TEST | LIVE |
|---|---|---|
| Starting SHA | `2da5eb4` | `26eeda3` |
| Final SHA | **`7f5ef90`** | **`3365af8`** (+ docs) |
| Origin sync | `0 0` before and after | `0 0` before and after |
| Working tree | clean (untracked docs only) | clean (untracked docs only) |
| Concurrent writer | none | none |
| Typecheck | **0 errors** | **0 errors** |
| Build | **PASS** (exit 0) | **PASS** (exit 0) |
| `send-system-health-alert` | **v1**, `verify_jwt` **true** | **v1**, `verify_jwt` **true** |
| `send-review-request` | v48 unchanged | v77 unchanged |
| Guards | 11/11 + 12/12; 5/5 + 7/7 | 11/11 + 12/12; 5/5 + 7/7 |

**Migrations: none.** Dedupe, occurrence counting and the hourly ceiling all run
off existing `audit_logs` columns (`action`, `metadata` jsonb, `created_at`), so
no schema change and no forward-only SQL was needed in either environment.

**Files changed (8, identical set both repos):** `supabase/functions/send-system-health-alert/index.ts` (new) ·
`src/lib/systemAlert.ts` (new) · `scripts/check-system-health-alert-delivery.mjs` (new) ·
`supabase/functions/_shared/roleMailboxes.ts` · `src/lib/auditLogger.ts` ·
`src/pages/admin-orders/components/SystemHealthTab.tsx` ·
`scripts/check-role-mailbox-routing.mjs` · `package.json`.

**LIVE drift preserved.** LIVE's `SystemHealthTab.tsx` carries its own "5min"
follow-up copy where TEST says "30min". Only the two routing hunks were ported;
post-mirror the sole remaining difference is those three copy lines.

---

## 9. Controlled LIVE test

**Exactly one** alert-producing invocation, plus one deliberate duplicate to
prove dedupe. No real Stripe or configuration failure was triggered.

| | |
|---|---|
| Invocations | 1 send + 1 duplicate |
| Emails sent | **1** |
| Resend id | `515b3aab-1e48-4d5e-ace5-0e7a13e6e16c` |
| From | `PawTenant System <hello@pawtenant.com>` |
| To | **`info@pawtenant.com`** |
| Subject | `[PawTenant LIVE] System Health Alert — System Health Alert Delivery Test` |
| Reply-To | none (by design) |
| **Final status** | **delivered** |
| Dedupe key | `live:system_health_test:precutover_delivery_test:/system-health/delivery-test` |
| Rerun | `sent: false, suppressed: true, reason: "deduped"` |
| Audit rows | exactly 2 — one `sent` (`delivery_status: accepted`, `i***@pawtenant.com`), one `suppressed` |
| Duplicates | none |
| Unrelated notifications | none |

The `live:` dedupe-key prefix independently confirms the environment
discriminator resolves correctly in production.

---

## 10. Preservation

| Claim | Evidence |
|---|---|
| No customer email | only sender is the alert path → `info@` |
| No provider email | none |
| No SMS | no Twilio/GHL call |
| No GHL change | none |
| No Google Ads change | none |
| No Stripe account/config change | no Stripe API call |
| No payment/refund/dispute created | none |
| No order-status change | no write to `orders` |
| No provider-assignment change | none |
| No suppression removed | suppression list untouched |
| No DNS change | none |
| No Microsoft mailbox change | none |
| Google Workspace not cancelled | untouched |
| Role-mailbox routing intact | `check-role-mailbox-routing` 5/5 both repos |
| Notification bell intact | `check-admin-notification-*` PASS in both builds |
| No audit/communications history deleted | inserts only |
| Resend remains sender, receiving still disabled | unchanged |

---

## 11. Rollback

| Component | Rollback |
|---|---|
| Caller + client + UI + guards | `git revert 7f5ef90` (TEST) / `git revert 3365af8` (LIVE) |
| Edge Function | it is **new** — deleting it cannot regress anything. To disable without a deploy, set the guard aside and revert the caller; the endpoint then simply receives no traffic. |
| Configuration | none introduced — no new secret, no new env var |
| Database migration | **none applied**; nothing to roll back |
| Admin UI | reverting restores the previous action list and `catch { /* silent */ }` |
| Vercel | promote the prior production deployment |

**Do not roll back by deleting `system_health_alert_*` audit rows** — they are
genuine delivery evidence.

**Rollback triggers:** a customer or provider email sent from this path; any
arbitrary-recipient behaviour; a duplicate-alert flood; System Health page
regression; checkout crashing because of the alert path; secrets appearing in an
alert; alerts reaching the wrong role mailbox; a Resend failure loop.

Reverting restores a **silent, dead** alert path. Prefer fixing forward.

---

## 12. Remaining risks

1. **Delivery tracking is account-wide, not per-alert.** The function records
   `accepted`; the terminal state arrives via `resend-webhook`. A suppressed
   `info@` would still read `accepted` in `audit_logs`. `info@` is currently
   **not** suppressed (verified), but nothing yet reconciles alert message IDs
   against webhook events. Deliberately out of scope — that is a Resend-wide
   monitoring change, not this repair.
2. **`resend-webhook` audit inserts have historically failed** (missing
   `details` column, per the provider-suppression audit). Fixing that is the
   prerequisite for closing risk 1.
3. **Fixtures I and J were not simulated** (Resend API failure, audit insert
   failure). Handling is pinned statically only.
4. **A hostile caller can still burn the 6/hour budget** with varied
   `source`/`route` values, which could crowd out a genuine alert within that
   hour. Every attempt is still audited, so nothing is lost — only delayed. Raise
   the ceiling or key it per alert type if this ever bites.
5. **`send-followup-email` remains `verify_jwt = false` on LIVE** (v89) while
   TEST is `true`. Unrelated to this repair and untouched, but it is a real
   TEST/LIVE divergence on a function that requires admin access; worth a
   separate look.

---

## 13. Exact next task

`GHL-MICROSOFT-RECONNECTION-001` — unchanged from the previous task, and still
the last dependency that could break at Google Workspace cancellation.

Worth queueing after it: `RESEND-DELIVERY-STATUS-RECONCILIATION-001` — repair
the `resend-webhook` audit insert and reconcile message IDs to terminal
delivery state, which closes risks 1 and 2 above for every PawTenant email, not
just alerts.
