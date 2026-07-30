# Contact submission / reply anonymous exposure — LIVE P0 hotfix

**Task:** `CONTACT-SUBMISSION-ANON-EXPOSURE-LIVE-HOTFIX-001`
**Date:** 2026-07-30 · **Environment:** LIVE only · **TEST mutations:** 0
**LIVE:** `074a436` → *(this commit)* · Supabase `cvwbozlbbmrjxznknouq`

---

## 1. Root cause

`public.contact_submissions` and `public.contact_submission_replies` had RLS **enabled** — which
reads as "protected" at a glance — but carried blanket policies scoped to `public` with a `true`
predicate, **plus** direct `anon` table grants:

| Table | Policy | Cmd | Roles | `USING` |
|---|---|---|---|---|
| `contact_submissions` | `contact_submissions_read_all` | SELECT | `public` | `true` |
| `contact_submissions` | `contact_submissions_update_all` | UPDATE | `public` | `true` (+ `WITH CHECK true`) |
| `contact_submission_replies` | `contact_submission_replies_read_all` | SELECT | `public` | `true` |

Grants before: `anon`, `authenticated` and `service_role` each held
`SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER`.

RLS being enabled is worthless when a policy says `USING (true) TO public`. The publishable anon
key ships inside the browser bundle, so **any member of the public could query these tables
directly over PostgREST.**

## 2. Exposed fields — measured, not estimated

A genuine `set local role anon` probe on LIVE immediately before the fix:

| Exposed to anyone with the anon key | Count |
|---|---|
| Contact submissions readable | **88** |
| Support replies readable | **71** |
| Distinct customer email addresses | **71** |
| Phone numbers | **14** |
| Rows carrying `metadata.request` (IP + user-agent + referrer) | **88 / 88** |

Per-row fields: `name`, `email`, `phone`, `subject`, `message` (free text, frequently containing
medical and housing detail), `source_page`, `status`, timestamps, and the full `metadata` blob.
Reply rows additionally exposed `admin_name` and `admin_email`.

Beyond reading, `contact_submissions_update_all` allowed **anonymous UPDATE of any row** — an
attacker could flip genuine customer requests to `resolved`/`archived` so they silently vanish
from the admin inbox, or rewrite `message` content. `DELETE` was already denied (grant present,
but no DELETE policy and RLS on).

## 3. Why the fix could not break the public Contact Us form

Both Edge Functions construct their Supabase client with `SUPABASE_SERVICE_ROLE_KEY`, which
bypasses RLS and depends on no anon grant:

- `contact-submit` — inserts the submission
- `contact-reply` — reads the submission, inserts the reply, patches status

The only client-side consumers are Admin surfaces, and they only ever **SELECT** and **UPDATE**:
`admin-orders/page.tsx` (count of `status='new'`), `commandCenter/useCommsQueue.ts` (new-submission
queue), `ContactRequestsTab.tsx` (list, detail, status update, reply log). No client path inserts
or deletes, so `INSERT`/`DELETE` were revoked from `authenticated` outright.

**No Edge Function source was changed, so no function was redeployed.** Versions and JWT modes are
untouched.

## 4. Migration

`supabase/migrations/20260730250000_contact_submission_anon_exposure_hotfix.sql`
Applied to LIVE via explicit MCP SQL (never `db push` on LIVE).
Ledger: `20260730171614 | contact_submission_anon_exposure_hotfix`.

1. Drop the three unsafe `TO public USING (true)` policies.
2. `revoke all … from anon` **and** `from public`, on both tables. Revoking "from public" alone
   does not undo an explicit per-role grant, so `anon` is named explicitly.
3. Narrow `authenticated` to `SELECT` (+ `UPDATE` on submissions only); revoke
   `INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER`, and `UPDATE` on replies.
4. Add staff policies gated on `public.is_admin_staff()` — SELECT on both tables, UPDATE on
   submissions with the predicate on **both** `USING` and `WITH CHECK`.

`is_admin_staff()` is the canonical LIVE staff helper (any *active* admin, any role), already
`SECURITY DEFINER` with `search_path` pinned. `is_chat_admin()` would have locked out the 2 support
and 3 read_only accounts; `check_is_admin()` omits the `is_active` test. All 8 current LIVE admins
are `is_active = true`, so **nobody lost access**.

**No historical data was touched** — the migration contains no INSERT/UPDATE/DELETE against either
table, no backfill, no status rewrite, no metadata deletion.

## 5. Final access matrix — verified with real PG role switches

| Actor | SELECT subs | SELECT replies | UPDATE | INSERT | DELETE |
|---|---|---|---|---|---|
| **anon** | `permission denied` | `permission denied` | `permission denied` | `permission denied` | `permission denied` |
| **customer** (authenticated) | 0 rows | 0 rows | 0 rows affected | `permission denied` | n/a |
| **unauthorized employee** | 0 rows | — | — | — | — |
| **support** | 88 | 71 | ✅ | — | — |
| **read_only** | 88 | — | ✅ | — | — |
| **admin / owner** | 88 | 71 | ✅ | — | — |
| **service_role** | 88 | ✅ insert | ✅ | ✅ | ✅ |

Anonymous denial happens at the **GRANT** layer (`permission denied for table`), not merely as an
empty result set — the strongest available outcome. Guessing a valid submission UUID does not help:
the denial precedes any row filtering.

Real-world proof over the actual attack surface (PostgREST + publishable anon key):

```
GET /rest/v1/contact_submissions?select=id,email,phone,metadata  → 401 {"code":"42501","message":"permission denied for table contact_submissions"}
GET /rest/v1/contact_submission_replies?select=id,message        → 401 {"code":"42501","message":"permission denied for table contact_submission_replies"}
```

## 6. Public form + admin verification

- `contact-submit` invalid payload → `400 {"ok":false,"error":"Message is required"}` — function
  boots, validates safely, leaks no internals. **No valid submission was sent**, so no email was
  generated to `hello@pawtenant.com` or anyone else.
- Service-role INSERT of a submission and of a reply both succeeded — the exact DB operations
  `contact-submit` and `contact-reply` perform.
- Admin status lifecycle on the synthetic fixture under RLS: `new → viewed → resolved → reopened →
  archived`, 1 row each; reply readable.
- Production Admin UI (`pawtenant.com` → Communications → Emails) loads under the new policies:
  `All 87 · New 0 · Viewed 52 · Resolved 35 · Archived 2` (All excludes archived; 52+35+2 = 89 =
  88 real + 1 fixture). Full list renders, no empty state, **zero console errors** after a tracked
  reload.

## 7. Preservation

| Metric | Before | After |
|---|---|---|
| Submissions | 88 | **88** |
| Replies | 71 | **71** |
| Distinct emails | 71 | **71** |
| Rows with phone | 14 | **14** |
| Rows with `metadata.request` | 88 | **88** |
| Newest submission | 2026-07-30 15:12:04 | **unchanged** |
| Submissions hash | `e28cec4b13f1323f56dbf364aef90112` | **identical** |
| Replies hash | `9828c165011484bccfecfa0dc9c470fd` | **identical** |
| Metadata hash | `6d5ccc5319c19f55e684cec2996e9fc1` | **identical** |
| Status distribution | viewed 52 · resolved 35 · archived 1 | **identical** |

**Zero real customer rows modified.** Synthetic fixture (`p0-hotfix-qa@pawtenant.test`, non-routable
`+15550100`) and its reply were deleted; `fixtures_remaining = 0`. No email sent, no SMS sent.

## 8. Guard

`scripts/check-contact-submission-privacy.mjs` — 14 invariants, 14 planted negative controls, all
caught; wired into `npm run build` so a regression is deploy-blocking. It pins: no blanket public
SELECT/UPDATE policy, anon revoked by name and never re-granted, `authenticated` cannot
INSERT/DELETE, staff policies exist on both tables, UPDATE gated on both `USING` and `WITH CHECK`,
the canonical helper is used (no second role system), no customer-facing policy, both functions keep
the service-role path, `contact-submit`'s response exposes no metadata/IP, the migration mutates no
historical data, no TEST reference, no unified-email schema.

One matcher was corrected after the first run: `\btruncate\b` matched the *privilege name* inside
`revoke insert, delete, truncate, … from authenticated` — which is exactly the right to remove. All
DML tests now anchor on the statement form (verb + target), never the bare keyword.

`npm run build` exit 0 (all guards). `type-check`: 9 errors, all pre-existing in files this task
never touched (`AnalyticsTab`, `EmployeeHrDirectory` ×5, `ProviderInternalRecords`,
`admin-orders/page.tsx` ×2) — this task changed no TypeScript.

## 9. Rollback

**Rollback must never restore anonymous access.** The unsafe policies are gone permanently.

If admin access were to break, the corrective action is *forward*: adjust the staff predicate (e.g.
widen `is_admin_staff()` to `check_is_admin()` if an `is_active` flag is wrong), never re-create a
`TO public USING (true)` policy. Historical data is unaffected by any rollback path because the
migration is pure DDL.

- Repo rollback: `git revert` this commit (removes the guard + migration file; the DB grant/policy
  state persists until explicitly changed).
- Deployment rollback: the previous production deployment remains available.
- No Edge Function was redeployed, so there is no function version to roll back.

## 10. Residual risk — IP retention

Historical IP/user-agent/referrer metadata is **retained** on all 88 rows, per scope. It is now
unreadable to anon, to ordinary customers, and to unauthorized employees; only admin staff and the
server can read it, and `contact-submit`'s response never returns it.

**Whether PawTenant should keep collecting IPs at all, and for how long, is a separate decision.**
There is currently no retention period and no minimization. Recommended follow-up:
`CONTACT-SUBMISSION-IP-RETENTION-MINIMIZATION-001` — out of scope here.
