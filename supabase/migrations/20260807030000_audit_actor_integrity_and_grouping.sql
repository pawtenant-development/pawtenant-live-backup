-- ADMIN-AUDIT-ACTOR-ATTRIBUTION-AND-COMMS-COMPOSER-UX-001
--
-- Two things, both idempotent and non-destructive.
--
-- 1) ACTOR INTEGRITY (Task 1A)
--    Admin surfaces log audit rows straight from the browser via
--    src/lib/auditLogger.ts, which passes `actor_name` as a plain string. Any
--    signed-in session could therefore write an audit row naming someone else —
--    "who removed this provider?" was answerable only as far as the client was
--    honest. Edge functions already resolve the actor from the JWT via
--    supabase/functions/_shared/auditActor.ts, but a Deno helper cannot defend a
--    direct PostgREST insert.
--
--    So the DB itself becomes the boundary: a BEFORE INSERT trigger overwrites
--    the actor columns from auth.uid() for every non-service-role writer. The
--    request body simply stops mattering — no call site has to change, and a
--    forged actor_name cannot survive the insert.
--
--    The trigger is deliberately INVOKER (the default), NOT SECURITY DEFINER.
--    A SECURITY DEFINER trigger runs as the table owner, so `auth.role()` and
--    `current_user` would report the owner for every caller and the guard would
--    match nothing.
--
-- 2) GROUPING (Task 1B)
--    `group_id` / `parent_audit_id` let one human action carry its system
--    consequences without rewriting or merging any historical row. Both are
--    nullable; every existing row keeps NULL and renders exactly as it does now.

-- ── Grouping columns ────────────────────────────────────────────────────────
alter table public.audit_logs
  add column if not exists group_id uuid,
  add column if not exists parent_audit_id uuid;

comment on column public.audit_logs.group_id is
  'Correlation id shared by one human action and the system consequences it caused. NULL for standalone/legacy rows.';
comment on column public.audit_logs.parent_audit_id is
  'The primary (human) audit row this consequence belongs to. NULL on the primary row itself.';

create index if not exists audit_logs_group_id_idx
  on public.audit_logs (group_id) where group_id is not null;

-- ── Actor integrity trigger ─────────────────────────────────────────────────
create or replace function public.audit_logs_enforce_actor()
returns trigger
language plpgsql
-- INVOKER on purpose — see the header note.
security invoker
set search_path = public, auth
as $$
declare
  uid uuid;
  prof record;
begin
  -- Edge functions and cron run as service_role and have already resolved the
  -- actor properly (_shared/auditActor.ts). Their rows pass through untouched,
  -- which is what lets a function honestly record a SYSTEM consequence.
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  uid := auth.uid();

  if uid is null then
    -- Anonymous client telemetry (assessment-flow network/http error logging).
    -- Recorded honestly as a non-human actor; it can never claim to be staff.
    new.actor_id   := null;
    new.actor_name := 'Anonymous Client';
    new.actor_role := 'client';
    new.actor_type := 'system';
    return new;
  end if;

  select dp.user_id, dp.full_name, dp.role, dp.is_admin
    into prof
  from public.doctor_profiles dp
  where dp.user_id = uid
  limit 1;

  new.actor_id := uid;

  if prof.user_id is null then
    -- Authenticated but with no staff/provider profile → a customer.
    new.actor_name := coalesce(new.actor_name, 'Customer');
    new.actor_role := 'customer';
    new.actor_type := 'customer';
  else
    -- Snapshot the display name at action time, from the profile — NOT from
    -- whatever the client sent.
    new.actor_name := coalesce(nullif(btrim(prof.full_name), ''), 'Employee');
    new.actor_role := coalesce(nullif(btrim(prof.role), ''),
                               case when prof.is_admin then 'admin' else 'provider' end);
    new.actor_type := case when prof.is_admin then 'employee' else 'provider' end;
  end if;

  return new;
end;
$$;

drop trigger if exists audit_logs_enforce_actor_trg on public.audit_logs;
create trigger audit_logs_enforce_actor_trg
  before insert on public.audit_logs
  for each row execute function public.audit_logs_enforce_actor();

-- New function → revoke the default EXECUTE grant BY NAME. "from public" alone
-- does NOT undo the grant that authenticated/anon already hold.
revoke all on function public.audit_logs_enforce_actor() from public, anon, authenticated;
