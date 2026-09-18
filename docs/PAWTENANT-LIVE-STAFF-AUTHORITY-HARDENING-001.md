# PAWTENANT-LIVE-STAFF-AUTHORITY-HARDENING-001

Promotes the TEST-verified `doctor_profiles` privilege-escalation fix to LIVE.
Owner-approved for this exact task.

## The vulnerability that was live on production

`public.doctor_profiles` carried a policy `"Doctors manage own profile"` declared
`FOR ALL USING/WITH CHECK (user_id = auth.uid())`, **plus a table-level UPDATE
grant to `authenticated` covering every column**. A `FOR ALL` policy also covers
INSERT, and permissive policies are OR'ed together. The consequences, each one
re-proved on LIVE by a capability probe rather than by reading policies:

1. a provider could PATCH their own row to `is_admin = true`;
2. a provider could set `role = 'owner'`;
3. a provider could grant themselves any Company OS tab via `custom_tab_access`;
4. `check_is_admin()` — which read `doctor_profiles.is_admin` — then returned
   true for them;
5. worst: **any ordinary customer, with no staff profile at all, could INSERT
   one for themselves** with `is_admin = true, role = 'owner'`.

One authenticated HTTP request turned any signed-in account into a full admin.

## The fix

Authority moves to **`private.staff_authority`**, which no browser role can read
or write: the `private` schema is not exposed through the Data API, the table has
RLS enabled with no policies, and it carries no grants to `anon` or
`authenticated`.

- `check_is_admin()` keeps its exact signature and semantics — so every existing
  RLS policy that calls it keeps working — but reads the hardened source.
- `is_admin_level()` is the owner / admin_manager tier.
- `current_staff_access()` answers about the CALLER only, so it is safe for
  `authenticated`; `staff_access_for(uuid)` answers about a named user and is
  **service-role only**.
- `doctor_profiles` remains a **display mirror** for the dozens of existing read
  sites, but is no longer authoritative and no longer writable by the account it
  describes.
- `admin_set_staff_access()` is the ONE writer. It verifies the caller is an
  owner or admin manager, refuses a self-change in either direction, and writes
  the authority row and the mirror in a single transaction so they cannot drift.
- A reverse-sync trigger keeps the four existing service-role writers
  (`create-team-member`, `create-provider`, `create-owner-admin`,
  `approve-provider-application`) working with **zero code changes**.
- `is_admin` is DERIVED (`role <> 'provider'`), never a separate stored truth.

Nobody's access was widened or narrowed. The backfill records a non-provider role
whose stored `is_admin` was false as INACTIVE rather than promoting it; on LIVE
that case did not occur (0 rows).

## What is NOT in this rollout, and why

The TEST task this was promoted from also carried **SEO Editor RBAC**. The SEO
Editor does not exist in the LIVE repository or the LIVE project at all — no
route, no page, no `_shared/seoEditor.ts`, none of the four Edge Functions, none
of the seven `seo_*` tables, no `seo_editor_accounts`. Adding a `seo_editor`
navigation entry here would render a Company OS menu item pointing at a route
that 404s, and promoting the editor itself is a separate, unapproved feature
rollout.

So the `seo_editor` tab key is **deliberately absent** from this repository's
`TeamTab.ALL_TABS`, `page.tsx` and `AdminSidebar`. The recurrence guard keeps all
four SEO Editor controls and reports them as SKIPPED by name on every run; they
begin enforcing automatically, with no edit, the moment the editor lands here.

`src/lib/staffAccess.ts` is copied from TEST **byte for byte**, including
`SEO_EDITOR_TAB` / `canUseSeoEditor` / `canApproveSeoContent`, so the authority
module stays identical across the two repositories and the eventual editor
promotion is a clean diff.

## Traps this rollout hit

1. **A column-level `REVOKE UPDATE (col)` does nothing while a TABLE-level
   UPDATE grant exists.** The correct shape is `revoke update on <table> from
   authenticated;` then `grant update (<allowed cols>) ... to authenticated;`.
2. **TEST's database had drifted from TEST's migrations.** Comparing the two
   databases object by object — not file to file — showed 16 of 18 authority
   objects hashing identically and two that did not:
   - `tg_doctor_profiles_sync_authority()` + its trigger and
     `staff_access_for(uuid)` existed on the TEST database but in **no migration
     file at all**. Both are load-bearing. Captured here as part 3.
   - `tg_doctor_profiles_privilege_guard()` differed in logic: the TEST database
     treats a direct database connection as privileged, the TEST migration file
     does not. `auth.role()` is NULL on a direct connection, not `'service_role'`,
     so the file's version refuses every future migration against this table.
     Part 3 adopts the database's verified predicate.
   - `admin_set_staff_access()` differed only in comments (normalised hashes
     match), so LIVE simply keeps the better-documented version.
3. **A status code is not a result.** The role matrix first reported "provider
   CAN change lifecycle_status" — status 204. `lifecycle_status` defaults to
   `'approved'` and every LIVE row already carries it, so the PATCH was a no-op
   the trigger correctly ignored. The loop now derives a genuinely different
   value per column and reads the row back through the provider's own session.
4. **A substring is not a name.** The planted control that renames the sync
   trigger to `doctor_profiles_sync_authority_disabled` did not bite, because the
   new name still contains the old one. The check now matches the whole statement
   including its `UPDATE OF` column list.

## Running the guards

```
npm run check:rbac          # source invariants
npm run test:rbac           # + planted negatives
npm run check:rbac:db       # + live database state
npm run test:rbac:db        # + database planted negatives (plants and restores)
```

`check:rbac --self-test && check:rbac` runs at the end of `npm run build`.

## QA fixtures

`scripts/qa-admin-escalation-probe.mjs` and `scripts/qa-rbac-role-matrix.mjs` run
over real HTTP with real tokens against the LIVE project, and refuse to run
against any other project ref. They use four disposable accounts on the RFC 2606
reserved `.invalid` TLD (`rbac-*-qa@pawtenant-live.invalid`), which can never
belong to a real person; `scripts/qa-rbac-restore.sql` resets them and
`scripts/qa-rbac-cleanup.sql` removes them and re-asserts the real baseline.
Never point these at a real customer, provider or staff account.
