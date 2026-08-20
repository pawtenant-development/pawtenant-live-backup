-- Privacy-safe Admin Orders freshness signal.
-- Streams no customer order fields; authenticated admins receive only a
-- monotonic revision plus the changed order id/event needed for targeted UX.
create table if not exists public.admin_order_change_signal (
  id smallint primary key default 1 check (id = 1),
  revision bigint not null default 0,
  order_id uuid,
  event_type text not null default 'UPDATE'
    check (event_type in ('INSERT', 'UPDATE', 'DELETE')),
  became_paid boolean not null default false,
  changed_at timestamptz not null default clock_timestamp()
);

insert into public.admin_order_change_signal (id)
values (1)
on conflict (id) do nothing;

alter table public.admin_order_change_signal enable row level security;
alter table public.admin_order_change_signal force row level security;

revoke all on table public.admin_order_change_signal from public, anon, authenticated;
grant select on table public.admin_order_change_signal to authenticated;

drop policy if exists "Admins read order change signal" on public.admin_order_change_signal;
create policy "Admins read order change signal"
on public.admin_order_change_signal
for select
to authenticated
using (public.check_is_admin());

create or replace function public.bump_admin_order_change_signal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_order_id uuid;
  paid_transition boolean := false;
begin
  if tg_op = 'DELETE' then
    changed_order_id := old.id;
  else
    changed_order_id := new.id;
    paid_transition :=
      new.status = 'paid'
      and (tg_op = 'INSERT' or old.status is distinct from 'paid');
  end if;

  insert into public.admin_order_change_signal (
    id, revision, order_id, event_type, became_paid, changed_at
  )
  values (
    1, 1, changed_order_id, tg_op, paid_transition, clock_timestamp()
  )
  on conflict (id) do update
  set revision = public.admin_order_change_signal.revision + 1,
      order_id = excluded.order_id,
      event_type = excluded.event_type,
      became_paid = excluded.became_paid,
      changed_at = excluded.changed_at;

  return coalesce(new, old);
end;
$$;

revoke all on function public.bump_admin_order_change_signal() from public, anon, authenticated;

drop trigger if exists orders_admin_change_signal on public.orders;
create trigger orders_admin_change_signal
after insert or update or delete on public.orders
for each row execute function public.bump_admin_order_change_signal();

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'admin_order_change_signal'
  ) then
    alter publication supabase_realtime
      add table public.admin_order_change_signal;
  end if;
end
$$;
