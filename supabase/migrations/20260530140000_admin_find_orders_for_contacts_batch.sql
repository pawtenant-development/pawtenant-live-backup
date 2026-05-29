-- COMMS-CUSTOMER-ORDER-AUTO-LINKING (identity enrichment)
-- Batched sibling of admin_find_order_for_contact: resolves the best-matching
-- order for MANY contacts in one round-trip (avoids N+1 when enriching a list).
-- Returns the best order per email key and per phone key; the client picks
-- email (high) over phone (medium) per contact.
--
-- Safety: SECURITY DEFINER + inline admin gate, granted to `authenticated`
-- only (never anon). Pure read. Deterministic — no name matching.

create or replace function public.admin_find_orders_for_contacts(
  p_emails text[] default null,
  p_phones text[] default null
)
returns table (
  key_type          text,   -- 'email' | 'phone'
  match_key         text,   -- normalized email (lower/trim) OR phone last-10 digits
  match_count       integer,
  confidence        text,
  id                uuid,
  confirmation_id   text,
  first_name        text,
  last_name         text,
  email             text,
  phone             text,
  state             text,
  status            text,
  doctor_status     text,
  doctor_name       text,
  letter_type       text,
  plan_type         text,
  paid_at           timestamptz,
  payment_intent_id text,
  created_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_admin boolean;
begin
  select (dp.is_admin is true or dp.role in ('owner', 'admin_manager'))
    into v_is_admin
  from public.doctor_profiles dp
  where dp.user_id = auth.uid();

  if v_is_admin is not true then
    return;  -- non-admins get no rows
  end if;

  return query
  with
  ek as (
    select distinct nullif(lower(trim(e)), '') as k
    from unnest(coalesce(p_emails, '{}'::text[])) e
  ),
  pk as (
    select distinct k from (
      select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10) as k
      from unnest(coalesce(p_phones, '{}'::text[])) p
    ) z
    where length(z.k) = 10
  ),
  scored as (
    select
      o.*,
      case
        when o.doctor_status = 'patient_notified' or o.status = 'completed' then 1
        when o.status in ('under-review', 'under_review', 'processing')     then 2
        when o.paid_at is not null or o.payment_intent_id is not null
             or o.status = 'Paid · Unassigned'                             then 3
        else 4
      end as relevance
    from public.orders o
  ),
  email_best as (
    select distinct on (ek.k)
      'email'::text as key_type,
      ek.k          as match_key,
      (select count(*)::int from scored s2 where lower(trim(coalesce(s2.email, ''))) = ek.k) as match_count,
      'high'::text  as confidence,
      s.id, s.confirmation_id, s.first_name, s.last_name, s.email, s.phone, s.state,
      s.status, s.doctor_status, s.doctor_name, s.letter_type, s.plan_type,
      s.paid_at, s.payment_intent_id, s.created_at
    from ek
    join scored s on lower(trim(coalesce(s.email, ''))) = ek.k
    where ek.k is not null
    order by ek.k, s.relevance, s.created_at desc
  ),
  phone_best as (
    select distinct on (pk.k)
      'phone'::text  as key_type,
      pk.k           as match_key,
      (select count(*)::int from scored s2 where right(regexp_replace(coalesce(s2.phone, ''), '\D', '', 'g'), 10) = pk.k) as match_count,
      'medium'::text as confidence,
      s.id, s.confirmation_id, s.first_name, s.last_name, s.email, s.phone, s.state,
      s.status, s.doctor_status, s.doctor_name, s.letter_type, s.plan_type,
      s.paid_at, s.payment_intent_id, s.created_at
    from pk
    join scored s on right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 10) = pk.k
    order by pk.k, s.relevance, s.created_at desc
  )
  select * from email_best
  union all
  select * from phone_best;
end;
$$;

revoke all on function public.admin_find_orders_for_contacts(text[], text[]) from public, anon;
grant execute on function public.admin_find_orders_for_contacts(text[], text[]) to authenticated;
