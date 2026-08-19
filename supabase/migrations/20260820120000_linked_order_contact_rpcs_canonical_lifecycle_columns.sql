-- CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001 §Item-2
-- Linked-order card (Communications → Emails) must classify with the CANONICAL
-- order lifecycle, not a second hand-rolled classifier.
--
-- THE DEFECT
-- src/lib/orderLink.ts::summarizeOrderStatus() classified purely off
-- `orders.status`, so `status = 'processing'` (the paid-but-not-yet-assigned
-- state) rendered the chip "Under Review" while the Provider row on the SAME
-- card read "Unassigned" — a self-contradicting card. Observed on PT-MSZGR2TS,
-- which sat in exactly that state from 15:11 to 16:18 UTC on 2026-08-19, and
-- still reproducing today on PT-MSVKRCZV.
--
-- WHY THIS MIGRATION IS NEEDED AT ALL
-- The canonical classifier (public.order_workflow_state() and its TypeScript
-- mirror orderWorkflowState() in src/lib/orderLifecycle.ts) decides `under_review`
-- vs `paid_unassigned` from PROVIDER ASSIGNMENT (`doctor_user_id` / `doctor_email`),
-- and resolves cancellation / refund / dispute / reopen states from columns the
-- linked-order RPCs never returned. The client literally could not classify
-- correctly with the payload it was given. This adds exactly those columns —
-- nothing else changes.
--
-- WHAT IS DELIBERATELY *NOT* CHANGED
-- The `relevance` / `relevance_rank` CTE inside each function contains the same
-- status-only ranking. That expression only decides WHICH order is the best match
-- when a contact matches several; it is never displayed. Re-ranking it would
-- change which order links to a contact, which is a behavioural change outside
-- this task's scope. Left byte-identical on purpose.
--
-- SAFETY
--  * RETURNS TABLE changes require DROP + CREATE (CREATE OR REPLACE cannot alter
--    an output signature), so each function is dropped by exact signature and
--    recreated. Idempotent: re-running produces the same definition.
--  * DROP resets the ACL to the default (EXECUTE to PUBLIC). The original ACL was
--    {postgres, authenticated, service_role} with anon REVOKED, so the grants are
--    restored explicitly below — "revoke from public" alone does NOT undo the
--    default grant, so anon/authenticated are revoked BY NAME first.
--  * SECURITY DEFINER + `set search_path = public` preserved exactly.
--  * The in-function admin gate is preserved verbatim: a non-admin still gets
--    zero rows, so the additional columns are not a new disclosure surface.
--  * Verified before writing: all 10 added columns exist with identical types on
--    BOTH the TEST and LIVE `public.orders` tables, and both functions were
--    byte-identical across the two environments (matching pg_get_functiondef md5).

begin;

-- ── 1) Single best-match lookup ─────────────────────────────────────────────

drop function if exists public.admin_find_order_for_contact(text, text, uuid, text);

create function public.admin_find_order_for_contact(
  p_email           text default null::text,
  p_phone           text default null::text,
  p_session_id      uuid default null::uuid,
  p_confirmation_id text default null::text
)
returns table(
  match_basis text, confidence text, match_count integer, id uuid,
  confirmation_id text, first_name text, last_name text, email text, phone text,
  state text, status text, doctor_status text, doctor_name text, letter_type text,
  plan_type text, paid_at timestamp with time zone, payment_intent_id text,
  created_at timestamp with time zone,
  -- ── added by CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001 §Item-2 ──
  -- Everything orderWorkflowState() / orderPaymentState() need to classify.
  doctor_email text, doctor_user_id uuid,
  refund_status text, refunded_at timestamp with time zone, refund_amount integer,
  dispute_id text,
  payment_failed_at timestamp with time zone, payment_failure_reason text,
  official_letter_reopened_at timestamp with time zone,
  official_letter_final_completed_at timestamp with time zone
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_is_admin     boolean;
  v_email        text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_cid          text := nullif(trim(coalesce(p_confirmation_id, '')), '');
  v_phone_digits text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 10);
begin
  select (dp.is_admin is true or dp.role in ('owner', 'admin_manager'))
    into v_is_admin
  from public.doctor_profiles dp
  where dp.user_id = auth.uid();

  if v_is_admin is not true then
    return;
  end if;

  if length(v_phone_digits) < 10 then
    v_phone_digits := null;
  end if;

  if v_email is null and v_cid is null and v_phone_digits is null and p_session_id is null then
    return;
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
      -- MATCH-PICKING ONLY — never displayed. Preserved byte-identical; see the
      -- header note on why this is deliberately not re-ranked.
      case
        when m.doctor_status = 'patient_notified' or m.status = 'completed' then 1
        when m.status in ('under-review', 'under_review', 'processing')     then 2
        when m.paid_at is not null or m.payment_intent_id is not null
             or m.status = 'Paid · Unassigned'                              then 3
        else 4
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
    b.paid_at, b.payment_intent_id, b.created_at,
    b.doctor_email, b.doctor_user_id,
    b.refund_status, b.refunded_at, b.refund_amount,
    b.dispute_id,
    b.payment_failed_at, b.payment_failure_reason,
    b.official_letter_reopened_at, b.official_letter_final_completed_at
  from best b;
end;
$function$;

-- ── 2) Batched best-match lookup (list enrichment) ──────────────────────────

drop function if exists public.admin_find_orders_for_contacts(text[], text[]);

create function public.admin_find_orders_for_contacts(
  p_emails text[] default null::text[],
  p_phones text[] default null::text[]
)
returns table(
  key_type text, match_key text, match_count integer, confidence text, id uuid,
  confirmation_id text, first_name text, last_name text, email text, phone text,
  state text, status text, doctor_status text, doctor_name text, letter_type text,
  plan_type text, paid_at timestamp with time zone, payment_intent_id text,
  created_at timestamp with time zone,
  -- ── added by CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001 §Item-2 ──
  doctor_email text, doctor_user_id uuid,
  refund_status text, refunded_at timestamp with time zone, refund_amount integer,
  dispute_id text,
  payment_failed_at timestamp with time zone, payment_failure_reason text,
  official_letter_reopened_at timestamp with time zone,
  official_letter_final_completed_at timestamp with time zone
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
begin
  select (dp.is_admin is true or dp.role in ('owner', 'admin_manager'))
    into v_is_admin
  from public.doctor_profiles dp
  where dp.user_id = auth.uid();

  if v_is_admin is not true then
    return;
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
      -- MATCH-PICKING ONLY — never displayed. Preserved byte-identical.
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
      s.paid_at, s.payment_intent_id, s.created_at,
      s.doctor_email, s.doctor_user_id,
      s.refund_status, s.refunded_at, s.refund_amount,
      s.dispute_id,
      s.payment_failed_at, s.payment_failure_reason,
      s.official_letter_reopened_at, s.official_letter_final_completed_at
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
      s.paid_at, s.payment_intent_id, s.created_at,
      s.doctor_email, s.doctor_user_id,
      s.refund_status, s.refunded_at, s.refund_amount,
      s.dispute_id,
      s.payment_failed_at, s.payment_failure_reason,
      s.official_letter_reopened_at, s.official_letter_final_completed_at
    from pk
    join scored s on right(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), 10) = pk.k
    order by pk.k, s.relevance, s.created_at desc
  )
  select * from email_best
  union all
  select * from phone_best;
end;
$function$;

-- ── 3) Restore the exact pre-migration ACL ──────────────────────────────────
-- Original proacl on BOTH environments:
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- i.e. anon has NO execute. `revoke ... from public` does not remove the implicit
-- default grant for named roles, so anon and authenticated are revoked BY NAME
-- before the intended grants are re-issued.

revoke all on function public.admin_find_order_for_contact(text, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.admin_find_orders_for_contacts(text[], text[])
  from public, anon, authenticated;

grant execute on function public.admin_find_order_for_contact(text, text, uuid, text)
  to authenticated, service_role;
grant execute on function public.admin_find_orders_for_contacts(text[], text[])
  to authenticated, service_role;

-- ── 4) Shape guard — fail the migration rather than ship a silent mismatch ──
do $guard$
declare
  v_missing text;
begin
  select string_agg(x.fn || '.' || x.col, ', ')
    into v_missing
  from (
    select f.proname as fn, c.col
    from pg_proc f
    cross join (values
      ('doctor_email'), ('doctor_user_id'), ('refund_status'), ('refunded_at'),
      ('refund_amount'), ('dispute_id'), ('payment_failed_at'),
      ('payment_failure_reason'), ('official_letter_reopened_at'),
      ('official_letter_final_completed_at')
    ) as c(col)
    where f.proname in ('admin_find_order_for_contact', 'admin_find_orders_for_contacts')
      and f.pronamespace = 'public'::regnamespace
      and pg_get_function_result(f.oid) not like '%' || c.col || '%'
  ) x;

  if v_missing is not null then
    raise exception
      'CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001: linked-order RPC is missing canonical lifecycle column(s): %',
      v_missing;
  end if;

  if has_function_privilege('anon', 'public.admin_find_order_for_contact(text, text, uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.admin_find_orders_for_contacts(text[], text[])', 'EXECUTE') then
    raise exception
      'CUSTOMER-PORTAL-ALL-DOCUMENT-VISIBILITY-001: anon must NOT hold EXECUTE on the linked-order RPCs';
  end if;
end;
$guard$;

commit;
