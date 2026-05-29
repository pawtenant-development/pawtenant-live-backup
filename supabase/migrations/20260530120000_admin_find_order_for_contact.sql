-- COMMS-CUSTOMER-ORDER-AUTO-LINKING
-- Admin-only, read-only matching engine: given any contact identifier
-- (email / phone / visitor session_id / confirmation_id), return the single
-- BEST-matching order summary so chats / emails / contact submissions can
-- auto-display the linked customer/order context.
--
-- Safety:
--   • SECURITY DEFINER + inline admin gate (mirrors get_live_visitors).
--     Non-admins receive zero rows — never leaks order data publicly.
--   • Granted to `authenticated` ONLY (never anon).
--   • Pure read (no writes). Idempotent (create or replace).
--   • Deterministic priority — never fuzzy name matching:
--       1 = confirmation_id (exact)            -> high confidence
--       2 = visitor session (session_id link)  -> high confidence
--       3 = exact email (lower/trim)           -> high confidence
--       4 = normalized phone (last 10 digits)  -> medium confidence
--     Among same-basis matches: completed/under-review/paid rank above old
--     unpaid leads, then most recent first. match_count surfaces "N matches".

create or replace function public.admin_find_order_for_contact(
  p_email           text default null,
  p_phone           text default null,
  p_session_id      uuid default null,
  p_confirmation_id text default null
)
returns table (
  match_basis       text,
  confidence        text,
  match_count       integer,
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
  v_is_admin     boolean;
  v_email        text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_cid          text := nullif(trim(coalesce(p_confirmation_id, '')), '');
  v_phone_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  -- ── Admin gate ───────────────────────────────────────────────────────────
  select (dp.is_admin is true or dp.role in ('owner', 'admin_manager'))
    into v_is_admin
  from public.doctor_profiles dp
  where dp.user_id = auth.uid();

  if v_is_admin is not true then
    return;  -- non-admins get no rows
  end if;

  -- Require a full 10-digit phone before phone matching (avoid weak matches).
  if length(v_phone_digits) < 10 then
    v_phone_digits := null;
  end if;

  if v_email is null and v_cid is null and v_phone_digits is null and p_session_id is null then
    return;  -- nothing to match on
  end if;

  return query
  with matched as (
    select
      o.*,
      case
        when v_cid is not null and lower(o.confirmation_id) = lower(v_cid) then 1
        when p_session_id is not null and o.session_id = p_session_id::text then 2
        when p_session_id is not null and o.confirmation_id in (
               select vs.confirmation_id from public.visitor_sessions vs
               where vs.session_id = p_session_id and vs.confirmation_id is not null
             ) then 2
        when v_email is not null and lower(trim(coalesce(o.email, ''))) = v_email then 3
        when v_phone_digits is not null
             and right(regexp_replace(coalesce(o.phone, ''), '\D', '', 'g'), 10) = v_phone_digits then 4
        else null
      end as basis_rank
    from public.orders o
  ),
  hits as (
    select
      m.*,
      case
        when m.doctor_status = 'patient_notified' or m.status = 'completed' then 1
        when m.status in ('under-review', 'under_review', 'processing')     then 2
        when m.paid_at is not null or m.payment_intent_id is not null
             or m.status = 'Paid · Unassigned'                              then 3
        else 4  -- lead / unpaid / other
      end as relevance_rank
    from matched m
    where m.basis_rank is not null
  ),
  best as (
    select * from hits
    order by basis_rank asc, relevance_rank asc, created_at desc
    limit 1
  )
  select
    case b.basis_rank when 1 then 'confirmation_id' when 2 then 'session' when 3 then 'email' when 4 then 'phone' end,
    case b.basis_rank when 4 then 'medium' else 'high' end,
    (select count(*)::int from hits h where h.basis_rank = b.basis_rank),
    b.id, b.confirmation_id, b.first_name, b.last_name, b.email, b.phone, b.state,
    b.status, b.doctor_status, b.doctor_name, b.letter_type, b.plan_type,
    b.paid_at, b.payment_intent_id, b.created_at
  from best b;
end;
$$;

revoke all on function public.admin_find_order_for_contact(text, text, uuid, text) from public, anon;
grant execute on function public.admin_find_order_for_contact(text, text, uuid, text) to authenticated;
