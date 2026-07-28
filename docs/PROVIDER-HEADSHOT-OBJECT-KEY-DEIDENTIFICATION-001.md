# PROVIDER-HEADSHOT-OBJECT-KEY-DEIDENTIFICATION-001 — ✅ LIVE

Privacy hardening of the public `provider-headshots` storage bucket.
Completed 2026-07-29. LIVE `047e910` → `9af7d5f`.

---

## What was wrong

### 1. Object keys were derived from provider email addresses

Both upload paths built the key as:

```js
const safeName = email.replace(/[^a-z0-9]/gi, "_");
const path = `${safeName}.${ext}`;
```

`provider-headshots` is a **public** bucket, so the key appeared verbatim in public
page markup and in every browser image request. After
`LIVE-PUBLIC-PAGES-...-PROVIDER-FIX-001` began serving admin-uploaded photos on
the marketing site, a trivially decodable provider email address was rendered on
the homepage, `/our-providers` and every `/doctors/<slug>` page.

It also wrote to a **fixed** path with `upsert: true`, so replacing a photo reused
the same URL and correctness depended on cache invalidation.

### 2. 🔴 Anonymous bucket listing (the more serious defect)

Policy `Public read headshots` was `FOR SELECT USING (bucket_id =
'provider-headshots')` with **no role restriction**. Verified over real HTTP with
only the publishable anon key:

```
POST /storage/v1/object/list/provider-headshots  ->  16 objects
```

Because every key was email-derived, that endpoint **enumerated 16 provider email
addresses** — including providers who were never published publicly. This was
reachable by anyone, with no account.

### 3. Any authenticated user could write provider headshots

`INSERT` and `UPDATE` were gated only on `auth.role() = 'authenticated'`, i.e.
every signed-in customer.

---

## The standard now

```
provider-headshots/<provider_uuid>/<version_uuid>.<ext>
```

Generated centrally in `src/lib/providerHeadshotKey.ts`:

- keyed on an internal UUID — an email, a provider name or a traversal path is **refused**
- a fresh version UUID per upload, so replacement is immutable and cache-safe
- extension derived from the **validated MIME type**, never the supplied filename
- size and type validated against the bucket's own limits
- `upsert: false` on both paths
- a failed upload leaves the provider's existing photo untouched

> **Note for future readers:** this repo compiles with `strictNullChecks: false`,
> under which TypeScript does **not** narrow a discriminated union by its boolean
> literal discriminant. `isHeadshotKeyFailure` / `isHeadshotKeySuccess` exist for
> that reason — `if (!result.ok)` does not narrow here.

---

## Migration result

| Item | Result |
|---|---|
| Objects inventoried | 16 (all with email-derived keys) |
| Objects copied to neutral keys | 16 / 16, byte-for-byte verified |
| References repointed | 32 — `approved_providers` 14, `doctor_profiles` 12, `doctor_contacts` 6 |
| Failures | 0 |
| Legacy objects deleted | 16 (after production verification) |
| Legacy objects retained | 0 |

Publication status, approval status, bios, NPI, licences and states were never
touched — only `photo_url` columns were written.

The privileged copy ran inside a **temporary Edge Function** so the service-role
key never left Supabase, never entered the repo and never entered a shell
history. It never deleted, was idempotent, defaulted to `dry_run`, and returned
counts plus neutral keys only. **It was deleted immediately after use** —
`/functions/v1/migrate-provider-headshots` now returns 404.

Its source is retained at `supabase/functions/migrate-provider-headshots/` purely
as the record of what ran; it is **not deployed**.

---

## Storage policies (after)

All four verbs scoped to `is_admin_staff()` (an **active** admin):

| Verb | Policy | Before |
|---|---|---|
| SELECT (list/metadata) | `provider_headshots_admin_select` | anon could list the whole bucket |
| INSERT | `provider_headshots_admin_insert` | any authenticated user |
| UPDATE | `provider_headshots_admin_update` | any authenticated user |
| DELETE | `provider_headshots_admin_delete` | no policy (service_role only) |

**Public images are unaffected.** For a public bucket, `/object/public/<bucket>/<key>`
is served without consulting RLS; only the LIST/metadata API goes through the
SELECT policy. Verified 200 with exact byte counts after the change.

Verified after: anon list → 0; non-admin authenticated list → 0; anon upload →
HTTP 400; legacy public URL → HTTP 400; neutral public URL → HTTP 200.

---

## 🔴 Known disclosure — not fully remediable

`docs/SITE-WIDE-SEARCH-INDEX-AND-RESULTS-001.md`, written by the previous task,
quoted **a real provider's normalised email** as the example object key, and it
was pushed to a **public GitHub repository**. The example is now redacted to a
generic shape, but the value remains in git history — history was not rewritten
(forbidden by the operating rules, and it would not remove copies already
fetched or cached).

**That provider's email address should be treated as publicly disclosed.** The
repo-wide `git grep` check added to the guard exists specifically so this cannot
recur; it was verified to fail on a planted key and pass when clean.

---

## Rollback

Private mapping (contains provider emails — **never commit**), outside every git
repo:

```
C:\Users\Hamza\Documents\PawTenant Website Repos\_private-rollback\
    rollback-provider-headshots-PRE.tsv     (32 rows: table, row_id, old URL)
    rollback-provider-headshots-POST.tsv    (32 rows: table, row_id, new key)
```

Because the legacy objects are now deleted, **do not apply the PRE file** — it
would repoint the database at keys that no longer exist. The correct rollback is:

- **Code:** revert to `047e910` (upload paths only; images unaffected).
- **Storage:** none needed — the neutral objects hold the original bytes.
- **Policies:** re-create the three previous policies as quoted in
  `supabase/migrations/20260729090000_provider_headshots_storage_hardening.sql`.
- **Deployment:** previous production `dpl_CnoqPkzWQyLVx6EhXvEPG1NJRBut` (`l95ckxlk3`).

---

## Remaining limitations

1. The git-history disclosure above.
2. `provider_applications.headshot_url` uses `headshots/<timestamp>-<original-filename>`
   in the **private** `provider-uploads` bucket. Not email-derived, and not public,
   but some filenames contain a person's name. Out of scope here; worth a follow-up
   if that bucket ever becomes public.
3. The Admin upload path was verified by unit-level checks and static guards. It
   was **not** exercised end-to-end against a real published provider, because
   doing so would have replaced a live provider's photo purely for QA. First real
   admin upload should be spot-checked.
4. Pre-existing, unrelated, non-blocking: `OrderAdditionalPetPanel.tsx:152` reads
   `refunded_at` as a boolean.
