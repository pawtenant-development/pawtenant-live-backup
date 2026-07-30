-- 20260730250000_contact_submission_anon_exposure_hotfix.sql
-- CONTACT-SUBMISSION-ANON-EXPOSURE-LIVE-HOTFIX-001 — P0 privacy hotfix (LIVE)
--
-- INCIDENT. public.contact_submissions and public.contact_submission_replies had
-- RLS *enabled* but carried blanket "TO public USING (true)" policies AND direct
-- anon table grants:
--
--   contact_submissions_read_all         SELECT  public  USING (true)
--   contact_submissions_update_all       UPDATE  public  USING (true) WITH CHECK (true)
--   contact_submission_replies_read_all  SELECT  public  USING (true)
--
-- Anyone holding the PUBLISHABLE anon key — which ships in the browser bundle —
-- could therefore read every contact submission and every support reply, and
-- could UPDATE any submission's status (silently marking genuine customer
-- requests "resolved" so they vanish from the admin inbox).
--
-- Measured on LIVE with a genuine `set local role anon` probe immediately before
-- this migration: 88 submissions, 71 replies, 71 distinct customer email
-- addresses, 14 phone numbers, and request metadata (IP + user-agent +
-- referrer) present on 88 of 88 rows.
--
-- WHY THIS IS SAFE FOR THE PUBLIC CONTACT FORM. Both Edge Functions construct
-- their Supabase client with SUPABASE_SERVICE_ROLE_KEY, which BYPASSES RLS and
-- does not depend on any anon grant:
--   * contact-submit  — inserts the submission
--   * contact-reply   — reads the submission, inserts the reply, patches status
-- The only client-side (authenticated) consumers are Admin surfaces, and they
-- only ever SELECT and UPDATE:
--   * admin-orders/page.tsx                    — count of status='new'
--   * commandCenter/useCommsQueue.ts           — new-submission queue
--   * ContactRequestsTab.tsx                   — list, detail, status update, replies
-- No client path inserts or deletes, so INSERT/DELETE are revoked outright.
--
-- ACCESS MODEL AFTER THIS MIGRATION
--   anon / public          — no privileges at all (hard permission denied)
--   authenticated          — SELECT (+ UPDATE on submissions) at the GRANT layer,
--                            then narrowed by RLS to active admin staff only.
--                            An ordinary signed-in customer matches no policy
--                            and therefore sees zero rows.
--   admin staff            — full operational read + status update
--   service_role           — unchanged (bypasses RLS; the server path)
--
-- is_admin_staff() is the canonical LIVE staff helper (any active admin, any
-- role) — the same helper the Admin Email Hub already uses. is_chat_admin()
-- would have locked out the 2 support and 3 read_only accounts; check_is_admin()
-- omits the is_active test. All 8 current LIVE admins are is_active = true, so
-- nobody loses access.
--
-- HISTORICAL DATA IS UNTOUCHED. This migration contains no INSERT, UPDATE or
-- DELETE against either table — no backfill, no status rewrite, no metadata
-- deletion, no timestamp change. Existing IP metadata is retained and merely
-- becomes unreadable to anon; whether to minimize or expire it is a separate
-- retention task.
--
-- Forward-only and idempotent.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Drop the unsafe public policies
-- ─────────────────────────────────────────────────────────────────────────
drop policy if exists contact_submissions_read_all        on public.contact_submissions;
drop policy if exists contact_submissions_update_all      on public.contact_submissions;
drop policy if exists contact_submission_replies_read_all on public.contact_submission_replies;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Remove direct table privileges from anon / PUBLIC
-- ─────────────────────────────────────────────────────────────────────────
-- Revoking "from public" alone does NOT undo an explicit per-role grant, so
-- anon is named explicitly.
revoke all on public.contact_submissions        from anon;
revoke all on public.contact_submissions        from public;
revoke all on public.contact_submission_replies from anon;
revoke all on public.contact_submission_replies from public;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Narrow the authenticated grant to what the Admin UI actually performs
-- ─────────────────────────────────────────────────────────────────────────
-- Nothing client-side inserts or deletes these rows; the server path is
-- service_role. RLS below is what actually restricts these to admin staff.
revoke insert, delete, truncate, references, trigger
  on public.contact_submissions        from authenticated;
revoke insert, delete, truncate, references, trigger
  on public.contact_submission_replies from authenticated;
revoke update on public.contact_submission_replies from authenticated;

grant select, update on public.contact_submissions        to authenticated;
grant select          on public.contact_submission_replies to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Authorized Admin/Support policies
-- ─────────────────────────────────────────────────────────────────────────
alter table public.contact_submissions        enable row level security;
alter table public.contact_submission_replies enable row level security;

drop policy if exists contact_submissions_admin_select on public.contact_submissions;
create policy contact_submissions_admin_select on public.contact_submissions
  for select to authenticated
  using (public.is_admin_staff());

-- Status operations only (viewed / resolved / reopened / archived). The row is
-- still an admin-staff row on both sides of the write, so a non-staff caller
-- can neither read it nor write it.
drop policy if exists contact_submissions_admin_update on public.contact_submissions;
create policy contact_submissions_admin_update on public.contact_submissions
  for update to authenticated
  using (public.is_admin_staff())
  with check (public.is_admin_staff());

drop policy if exists contact_submission_replies_admin_select on public.contact_submission_replies;
create policy contact_submission_replies_admin_select on public.contact_submission_replies
  for select to authenticated
  using (public.is_admin_staff());

-- NOTE: there is deliberately NO INSERT or DELETE policy on either table, and
-- no customer-facing policy. Replies are written by contact-reply under
-- service_role, and customer-facing conversations belong to the separate
-- canonical email-thread system — these internal tables are never projected to
-- a customer just because their email matches.
