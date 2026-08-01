# ORDER-RESUME-SECURE-TOKEN-AND-PII-CONFIDENTIALITY-LIVE-ROLLOUT-001

**Status:** ✅ **LIVE COMPLETE** — expiring order-bound resume credential, all LIVE
link producers, template migration, rate limiting, browser confidentiality,
cleanup and preservation verified.

**Source:** TEST `849b48e` (`pawtenant-test`).
**LIVE:** `67337bc` → `b58398e` (4 commits).
**LIVE Supabase:** `cvwbozlbbmrjxznknouq`.
**Deployment:** `pawtenant-production-nrf31pzxn`, Ready, Production, serving
`https://pawtenant.com`.
**Baseline cutoff for preservation:** `2026-08-01 22:20:57.935623+00`.

---

## 1. The production defect this closed

`get-resume-order`'s READ path is reachable with the **public anon key every
browser holds**. On LIVE, for any confirmation id, it returned:

```
confirmation_id, first_name, last_name, email, phone, state, delivery_speed,
price, assessment_answers, payment_intent_id, paid_at, status, plan_type,
letter_type, package_key, billing_plan
```

— including the full **`assessment_answers`**, the customer's mental-health
intake. The projection was named `safeOrder`. This was live in production until
this rollout; it now returns `{confirmation_id, status, already_paid}` and
nothing else, verified against a fully-populated fixture.

---

## 2. Mandatory LIVE producer audit (§9)

Performed before any mutation, and driven by **evidence** rather than by the
prior task's inventory.

### Code producers (all migrated)

| Producer | Was | Now |
|---|---|---|
| `lead-followup-sequence` (5 email stages + 5-min recovery SMS) | `?resume=<cid>` | canonical builder, lazy + memoised |
| `send-checkout-recovery` | `?resume=<cid>` | canonical builder |
| `broadcast-email` | `?resume=<cid>` per recipient | canonical builder, per-recipient token |
| `send-templated-email` (admin email) | client-supplied `{resume_url}` | minted **server-side**, non-overridable |
| `ghl-send-sms` (admin SMS) | template-substituted `?resume={order_id}` | `{resume_url}` resolved **server-side** at send |
| `bookingProgress.resumeHref` → portal CTA | `?resume=<cid>` | `resumePath()` + on-click issuance |
| `account-checkout` | `Navigate` → `?resume=<cid>` | requests a token, then redirects |
| `/r/` bridge | redirected to `?resume=<cid>` | carries `?rt=` through |
| `LeadActionsModal` open-link | permanent `?resume=` credential | **removed** (see §6) |
| `CommunicationsTemplatesPanel` seeds | `?resume={order_id}` | `{resume_url}` |
| `issue-resume-link` | — | **new**: admin **or** order owner |
| `send-new-esa-order-link` | — | **does not exist on LIVE** — TEST-only, nothing to migrate |

### Database templates

| Object | Finding | Action |
|---|---|---|
| 9 active LIVE email templates | use the `{resume_url}` merge tag | none — migrating the sender migrated them |
| 1 active SMS template (`custom_1782668432605`) | uses `{resume_url}` | none |
| 3 active SMS templates (`sms_finish_esa`, `sms_still_thinking`, `sms_consultation_booked`) | hardcoded `pawtenant.com/assessment?resume={order_id}` | **migrated to `{resume_url}`** (rollback values in §10) |
| `comms_settings.recovery_sms_5min_template` | admin override, already uses `{resume_url}` | none |

### GHL / external

The GHL token lacks `templates.readonly` and `campaigns.readonly` scopes, so
hosted template bodies could **not** be read via API. The audit was therefore
driven by production evidence instead:

- **Workflows** (readable): the only recovery-related workflow, *"ESA Abandoned
  Checkout Recovery"*, is **`draft`** — not active. The five published workflows
  are Call/SMS HUB, ESA Order/Contact Status Automation, Log Inbound Call,
  MultipleMessages and SMS Reply Webhook.
- **`communications` evidence**: across all history, exactly **two** messages
  attributed to sender `GHL` ever contained a resume link (2026-07-10 and
  2026-07-13). Both are free-form and differently worded — one is a bare pasted
  URL — i.e. **humans pasting a link from the GHL inbox**, not templated
  automation. An automated workflow would produce identical text on a cadence.
- Every other resume-link sender in the data is one of our own code producers
  (`auto_sequence:sms_5min`, `PawTenant System`, named staff, `admin_comms`),
  all of which are migrated.

**Conclusion: no active automated GHL producer of confirmation-ID links exists**,
so the frontend deploy was safe. Residual risk in §11.

---

## 3. Deployment order (§7) and what it protected

1. Writer lock, dual-repo preflight, LIVE deployment + function-version baseline.
2. Producer audit (above).
3. Secrets — **`RESUME_TOKEN_ENVIRONMENT` was NOT SET on LIVE**. The functions
   default to `"test"`, so every LIVE token would have minted as `test` and every
   exchange would have failed closed. Set to `live` **before** deploying either
   token function. `SITE_URL` moved `https://www.pawtenant.com` →
   `https://pawtenant.com` (canonical; www 308s to apex preserving the query
   string, so this only removes a redirect hop the token would otherwise traverse).
4. Both migrations via explicit MCP SQL.
5. DB security verification (§4).
6. Functions.
7. DB SMS template migration.
8. **Frontend last.**

> Setting the two secrets re-versions **every** function. That is why
> `check-payment-status` reads v92 → v93 with **no source change** (+1 from the
> secret change), while functions actually deployed moved +2.

---

## 4. Database security (verified on LIVE)

| Check | Result |
|---|---|
| `anon` / `authenticated` SELECT on `order_resume_tokens` | false / false |
| `anon` INSERT | false |
| `anon` / `authenticated` SELECT on `resume_rate_limits` | false / false |
| `anon` / `authenticated` EXECUTE on issue/consume RPCs | false |
| `service_role` EXECUTE | true |
| RLS enabled on both tables | true, **0 policies** |
| `search_path` pinned on SECURITY DEFINER functions | **5 / 5** |
| Function owner | `postgres` |

**RLS-enforced negative test** (roles actually assumed with `set local role`, not
inferred from grants — service-role SQL bypasses RLS and would have given a false
pass):

```
anon SELECT order_resume_tokens            → DENIED 42501
authenticated SELECT order_resume_tokens   → DENIED 42501
anon EXECUTE consume_order_resume_token    → DENIED 42501
authenticated EXECUTE issue_order_resume_token → DENIED 42501
anon SELECT resume_rate_limits             → DENIED 42501
```

---

## 5. LIVE test matrix — 41 runtime checks, all passing

**PII closure (the headline)**

| Check | Result |
|---|---|
| anon bare confirmation-ID read | `confirmation_id, status, already_paid` **only** |
| name / email / intake / price / package / state in response | **none** |

**Issuance** — token minted (`rt_` + 43 chars); anon refused 403; completed,
cancelled and nonexistent orders all return an identical `not_issuable` (no
existence oracle).

**Exchange** — valid works; `resume_checkout` withholds the intake,
`resume_assessment` releases it; no payment/internal identifiers ever returned;
sequential replay, rotation, malformed, random, empty and wrong-purpose all
return **one identical** `invalid_or_expired` body; expired and wrong-environment
tokens are rejected **and not consumed** (`use_count` stayed 0).

**Environment binding** — a LIVE-minted token exchanges (proving
`RESUME_TOKEN_ENVIRONMENT=live` is correct); a `test`-bound token is refused on LIVE.

**Concurrency (8-way)** — 1 of 8 succeeds on a one-time token; 0 of 8 on a
revoked token; 8 concurrent issues leave exactly **1** active token; concurrent
cross-order attempts never resolve to another order.

**Rate limiting** — the per-token bucket blocks an otherwise-valid exchange after
10 attempts *without consuming the token*; request-new-link allows 5 of 7 per
confirmation reference and the throttled response is byte-identical to an unknown
order; a new window lets a genuine customer straight back in; every stored bucket
key is a 64-char HMAC.

**Ownership** — no bearer → 401; anon key → 401; owner may mint for their own
order and gets a canonical `https://pawtenant.com/...?rt=` link; a signed-in
customer may **not** mint for another order (403, byte-identical to an unknown
order, so no enumeration); an unrelated customer is refused; a completed order
yields `not_issuable`; audit records actor/order/purpose/expiry and **no token or
URL**.

**Storage** — every stored credential is a 64-char digest; zero raw tokens.

---

## 6. Admin flow

Admin email and SMS mint **server-side at send time**, so the raw token never
enters an admin browser and is never copyable from the console. In
`send-templated-email` the resume vars are applied after the caller's vars, so a
caller cannot inject an arbitrary link into a customer email.

The per-lead "open resume link" shortcut in `LeadActionsModal` was **removed**
rather than tokenised: minting there would **auto-revoke the link already emailed
to the customer**, and opening it would **consume its single use** — a staff
preview click would silently break the customer's own recovery link.

---

## 7. Browser confidentiality — and the LIVE-only leak it caught

### 🔴 Nine production beacons were carrying the token

Verified on `pawtenant.com`, the `/r/manual?rt=…` bridge hop leaked the raw
credential to **nine third-party requests** across Google Ads, GA4, Facebook and
Bing — including GA4's `dr` (document referrer) parameter:

```
dr = https://pawtenant.com/r/manual?rt=rt_aXRB4YYH…&p=esa&dc=SAVE20
```

**Root cause: scrubbing `?rt=` inside React is a race, and production loses it.**
LIVE runs a far heavier tag stack than TEST; those tags read `location` and fire
on page load, before React mounts. TEST passed the same assertion only because
its lighter, interaction-triggered tag stack happened to lose the race the other
way — **the code was never actually safe, on either environment.**

**Fix:** the address bar is scrubbed **synchronously in the pre-boot inline
script** in `index.html`, before the tracking bootstrap beneath it can read
`location`. The raw value is handed to the app in memory
(`window.__ptCredentialParams`, read via `readResumeToken()`) — never
sessionStorage, never localStorage. React's own scrub remains as a backstop for a
stale cached `index.html`. Scrubbing before the redirect also fixes the referrer,
since the bridge's own URL is what the next page reports as `dr`.

Guard check **S28** now asserts this ordering, which is the class of defect the
earlier checks structurally could not catch — the code was "correct" and only the
*ordering* was wrong.

### Verified after the fix (production)

| Assertion | `/assessment?rt=` | `/r/manual?rt=` |
|---|---|---|
| Token in address bar | absent | absent |
| Request URLs carrying the token | **0** | **0** (was 9) |
| Third-party beacons carrying the token | **0** | **0** (was 9) |
| URL reported to analytics | scrubbed | scrubbed |
| `document.referrer` | — | scrubbed `/r/manual?p=esa&dc=SAVE20` |
| localStorage / sessionStorage / cookies / DOM | clean | clean |
| `landing_url` attribution | scrubbed, UTMs preserved | scrubbed |
| Recovery attribution flag | — | stage only, **no confirmation id** |
| Resume still works | yes | yes |
| After reload / back-navigation | absent | absent |

**Legacy `?resume=` on LIVE** → "Link expired or not found… receive a new payment
link", **zero PII**, resend form present, no blank page, no redirect loop; the
legacy param is now stripped from the address bar too.

---

## 8. Guards and build

| Check | Result |
|---|---|
| `check-secure-resume-credential` | **28 / 28** |
| Negative controls | **27 / 27 caught** |
| `check:resume-payment-authority` | 16/16 |
| `check:public-payment-privacy` | 15/15 |
| KPI / reporting / suppression / function-graph guards | all pass in-build |
| Type-check `tsconfig.app.json` | **9 errors — identical to LIVE baseline**, all in HR / provider / admin-orders files untouched by this task; **0** task-owned |
| `npm run build` | **exit 0** (unmasked) |

> `tsc -p tsconfig.json` type-checks **nothing** in this repo (solution-style
> config), and esbuild strips types without checking — a missing import is a
> runtime error that passes the build. Always use `tsconfig.app.json`.

### Deployed LIVE functions

| Function | Version | `verify_jwt` |
|---|---|---|
| `issue-resume-token` | v1 (new) | true |
| `exchange-resume-token` | v1 (new) | **false** (`--no-verify-jwt`) |
| `issue-resume-link` | v1 (new) | true |
| `get-resume-order` | v101 → v103 | true |
| `send-checkout-recovery` | v94 → v96 | true |
| `send-templated-email` | v25 → v27 | **false** (`--no-verify-jwt`) |
| `ghl-send-sms` | v83 → v85 | **false** (`--no-verify-jwt`) |
| `lead-followup-sequence` | v83 → v85 | **false** (`--no-verify-jwt`) |
| `broadcast-email` | v90 → v92 | true |
| `manual-run-lead-followup-sequence` | v20 → v22 | true |
| `check-payment-status` | v92 → v93 | false — **no source change** (secret re-version) |

**0 JWT/status mismatches.** `ghl-send-sms` and `lead-followup-sequence` are
`verify_jwt=false` on LIVE but `true` on TEST — deploying them without
`--no-verify-jwt` would have silently broken both.

---

## 9. Side effects — none

| Effect | Result |
|---|---|
| Communications for fixtures | **0** |
| Real emails / SMS from this task | **0** |
| Tokens minted for real customer orders during QA | **0** |
| Stripe writes / refunds / Ads / GHL forwarding / earnings / notifications | **0** |

LIVE has **no** notification suppression — `testNotificationSuppression` hard-keys
its block on the TEST project ref and never fires on LIVE. Fixtures were
therefore blocked from the drip four independent ways: `followup_opt_out=true`,
`sms_opted_out=true`, `phone=NULL`, and all four `*_sent_at` pre-stamped (which
also removes the row from the drip's eligibility `.or()` filter entirely).

One organic drip email went to a real customer at `22:30:01`, **ten minutes
before** `lead-followup-sequence` was deployed at `22:40:44` — so it used the old
code and carried a legacy link. Expected, not a defect. The first tokenised
organic send occurs on the next cron tick.

---

## 10. Rollback

| Item | Restore to |
|---|---|
| LIVE code | revert `fabd250`, `36dac83`, `6bd0d6a`, `b58398e` |
| Functions | redeploy from `67337bc`; **`--no-verify-jwt` for `exchange-resume-token`, `send-templated-email`, `ghl-send-sms`, `lead-followup-sequence`** |
| Vercel | promote `pawtenant-production-a4k2uibsa` |
| Secrets | `RESUME_TOKEN_ENVIRONMENT` was unset before; `SITE_URL` was `https://www.pawtenant.com` |
| Migrations | additive — both tables + 5 RPCs droppable without touching `orders` |

**SMS template rollback values:**

```
sms_finish_esa          Hi {name}, you're one step away from your ESA letter! Complete your order here: pawtenant.com/assessment?resume={order_id}
sms_still_thinking      Hi {name}, still thinking about your ESA letter? Get it today and avoid housing issues. Complete here: pawtenant.com/assessment?resume={order_id}
sms_consultation_booked Hi {name}, your provider consultation with PawTenant is confirmed! Complete your payment to lock in your spot: pawtenant.com/assessment?resume={order_id}
```

Reverting re-opens the confirmation-ID PII disclosure.

---

## 11. Cleanup, preservation, and one deviation

Fixtures `PT-LIVE-PENDINGQA-01..05`, their tokens, and all rate-limit rows
deleted. Two temporary auth identities deleted by the test run.

| Metric (baseline-scoped, `created_at <= cutoff`) | Baseline | After | |
|---|---|---|---|
| orders | 1760 | 1760 | ✅ |
| `orders_hash` | `0f95171e…56d0` | `0f95171e…56d0` | ✅ **byte-identical** |
| communications | 10136 | 10136 | ✅ |
| `comms_hash` | `4b6d343e…1a9f` | `4b6d343e…1a9f` | ✅ **byte-identical** |
| doctor_earnings | 504 | 504 | ✅ |
| `earnings_hash` | `3f722a75…7b8a` | `3f722a75…7b8a` | ✅ **byte-identical** |
| auth users | 768 | 768 | ✅ |
| doctor_profiles | 23 | 23 | ✅ |
| fixture orders / tokens / rate rows | — | 0 / 0 / 0 | ✅ |
| **audit_logs** | **10433** | **10405** | 🔴 **−28** |

### 🔴 Deviation: 28 pre-existing audit rows deleted

The fixture cleanup used

```sql
delete from public.audit_logs
 where object_id like 'PT-LIVE-PENDINGQA-%'
    or (metadata->>'confirmation_id') like 'PT-LIVE-PENDINGQA-%';
```

That predicate matched the reserved QA pattern **globally** instead of being
scoped to rows created during this run. The reserved pattern
`/^PT-LIVE-PENDINGQA-\d{2,4}$/` is **shared by every LIVE QA task**, so it also
matched 28 audit rows left by the earlier Pending Delivery LIVE QA task.

- **What was lost:** 28 audit rows referencing `PT-LIVE-PENDINGQA-*` **fixture**
  orders, created before `2026-08-01 22:20:57`. They were prior-task QA evidence.
- **What was not affected:** no genuine customer audit evidence — orders,
  payment state, earnings and communications are all byte-identical.
- **Not recovered:** the only mechanism is PITR, i.e. restoring the entire
  production database over 28 QA rows. That is not proportionate and was not done.
- **Prevention:** cleanup deletes must always carry `and created_at > <cutoff>`
  in addition to the ID predicate. This is what the baseline-scoped audit count
  exposed; a whole-table count would have hidden it behind organic growth.

---

## 12. Residual risks

1. **GHL hosted templates were not readable** (missing API scopes). The evidence
   above shows no active automated GHL producer, but a hosted template could not
   be positively inspected. A legacy link from that path now fails **safe** — the
   request-new-link screen, no PII — so the downside is a dead-ending funnel, not
   a disclosure. Recommend granting `templates.readonly` and re-auditing.
2. **Legacy links already in customers' inboxes/SMS stop resuming.** This is the
   intended consequence of retiring confirmation-ID credentials; those customers
   land on the safe screen with a resend form.
3. **Residual paid-state oracle** on a known confirmation id remains (needed by
   `account-checkout`), now throttled to 5 per 15 min per reference and leaking no
   PII.
4. **Rate limiter fails open** on infrastructure error, by design — an outage must
   not stop a customer resuming their own paid-for order.
5. **`RESUME_RATE_LIMIT_PEPPER` unset** on LIVE, so the limiter derives its pepper
   from the service-role key. Functionally equivalent; a dedicated secret would
   decouple them.
6. **Staff pasting old links from the GHL inbox** (observed twice historically) is
   a process matter; such links now fail safe.

---

## 13. Next

No further resume-token QA task. Return to the owner's product queue; likely next
priority `ORDER-NOTARY-SERVICE-WORKFLOW-001` (not started here).
