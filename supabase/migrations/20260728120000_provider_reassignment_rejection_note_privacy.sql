-- PROVIDER-REASSIGNMENT-REJECTION-NOTE-PRIVACY-001
--
-- APPLIED TO LIVE (cvwbozlbbmrjxznknouq) VIA EXPLICIT MCP SQL on 2026-07-28.
-- NOT applied with `supabase db push` — the LIVE migration ledger does not align
-- with repo filenames. This file is the traceable record of what was executed.
--
-- Problem: `provider-reject-order` records the rejection reason in
-- shared_order_notes as an author_role='provider' note. The order is then
-- reassigned. The provider portal's Notes tab selected the raw table, so the NEW
-- provider read the previous provider's rejection reason, comments and identity —
-- which can bias their independent clinical judgement.
--
-- Additionally, the SELECT policy on shared_order_notes was
-- `USING (auth.role() = 'authenticated')`, i.e. ANY signed-in user (including
-- every customer and every unrelated provider) could read EVERY note on EVERY
-- order. That is closed here too.
--
-- No historical data is deleted, altered or reclassified. Admin/Owner visibility
-- is unchanged. Rollback SQL is at the bottom of this file.

-- ── 1. Provider-safe projection ────────────────────────────────────────────
-- Used by BOTH the real provider portal and the Admin "Provider View" preview,
-- so the preview is a server-enforced emulation rather than a visual hide.
create or replace function public.get_shared_order_notes_for_provider(
  p_order_id uuid,
  p_provider_user_id uuid default null
)
returns table (
  id uuid,
  order_id uuid,
  confirmation_id text,
  author_id uuid,
  author_name text,
  author_role text,
  note text,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_caller   uuid := auth.uid();
  v_is_admin boolean;
  v_provider uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(dp.is_admin, false) into v_is_admin
  from public.doctor_profiles dp
  where dp.user_id = v_caller;

  v_provider := coalesce(p_provider_user_id, v_caller);

  -- Only an admin may render another provider's view.
  if v_provider <> v_caller and coalesce(v_is_admin, false) = false then
    raise exception 'Not authorized to view another provider''s notes';
  end if;

  -- The viewer must be the CURRENTLY assigned provider. A provider who rejected
  -- and was unassigned gains nothing from having authored the rejection note.
  if not exists (
    select 1 from public.orders o
    where o.id = p_order_id and o.doctor_user_id = v_provider
  ) then
    return;
  end if;

  -- Provider-safe contract: admin notes + this provider's own notes ONLY.
  return query
    select n.id, n.order_id, n.confirmation_id, n.author_id,
           n.author_name, n.author_role, n.note, n.created_at
    from public.shared_order_notes n
    where n.order_id = p_order_id
      and (n.author_role = 'admin' or n.author_id = v_provider)
    order by n.created_at asc;
end;
$$;

-- Supabase default privileges grant EXECUTE on new public functions to anon and
-- authenticated as EXPLICIT role grants, and `revoke ... from public` does NOT
-- undo an explicit role grant — so anon is revoked by name.
revoke all on function public.get_shared_order_notes_for_provider(uuid, uuid) from public;
revoke all on function public.get_shared_order_notes_for_provider(uuid, uuid) from anon;
grant execute on function public.get_shared_order_notes_for_provider(uuid, uuid) to authenticated;

-- ── 2. shared_order_notes: replace the wide-open read policy ───────────────
drop policy if exists "authenticated_read_shared_notes" on public.shared_order_notes;

create policy "admins_read_shared_notes"
  on public.shared_order_notes for select to authenticated
  using (
    exists (select 1 from public.doctor_profiles dp
            where dp.user_id = auth.uid() and dp.is_admin = true)
  );

create policy "assigned_provider_reads_safe_shared_notes"
  on public.shared_order_notes for select to authenticated
  using (
    (author_role = 'admin' or author_id = auth.uid())
    and exists (select 1 from public.orders o
                where o.id = shared_order_notes.order_id
                  and o.doctor_user_id = auth.uid())
  );

-- INSERT and author-only DELETE policies are intentionally untouched.

-- ── 3. order_status_logs: hide the rejection event from providers ──────────
-- The rejection row carries changed_by = the rejecting provider's name next to
-- new_doctor_status='provider_rejected'. Not read by the provider UI, but a
-- direct PostgREST call exposed the rejecting provider's identity tied to the
-- rejection. Admin and customer policies are untouched.
drop policy if exists "providers_select_assigned_logs" on public.order_status_logs;

create policy "providers_select_assigned_logs"
  on public.order_status_logs for select to authenticated
  using (
    exists (select 1 from public.orders o
            where o.id = order_status_logs.order_id
              and o.doctor_user_id = auth.uid())
    and coalesce(new_doctor_status, '') <> 'provider_rejected'
    and coalesce(old_doctor_status, '') <> 'provider_rejected'
  );

-- ───────────────────────────────────────────────────────────────────────────
-- ROLLBACK (restores the exact pre-change state; no data is involved)
-- ───────────────────────────────────────────────────────────────────────────
-- drop policy if exists "admins_read_shared_notes" on public.shared_order_notes;
-- drop policy if exists "assigned_provider_reads_safe_shared_notes" on public.shared_order_notes;
-- create policy "authenticated_read_shared_notes"
--   on public.shared_order_notes for select
--   using (auth.role() = 'authenticated');
--
-- drop policy if exists "providers_select_assigned_logs" on public.order_status_logs;
-- create policy "providers_select_assigned_logs"
--   on public.order_status_logs for select
--   using (exists (select 1 from public.orders o
--                  where o.id = order_status_logs.order_id
--                    and o.doctor_user_id = auth.uid()));
--
-- drop function if exists public.get_shared_order_notes_for_provider(uuid, uuid);
