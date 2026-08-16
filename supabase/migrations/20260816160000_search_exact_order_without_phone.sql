-- COMMAND-CENTER-SEARCH-EXACT-ORDER-001
--
-- Bounded gap found during UNIFIED-EMAIL-ORDER-COMMS-001 QA: searching an exact
-- confirmation id in the Command Center returned "No conversation found" for an
-- order that has only email activity.
--
-- Why: BOTH existing arms are keyed on contact_e164. `convo` groups
-- public.communications by contact_e164, and `ident` is
--
--     from public.orders o where o.phone is not null
--                            and pt_normalize_e164(o.phone) is not null
--
-- so an order with no usable phone never enters either arm and is therefore
-- unreachable by ANY search term, including its own id.
--
-- This adds a third arm, `order_direct`, that resolves an EXACT confirmation id
-- (case/whitespace-insensitive) or an EXACT orders.id UUID straight from
-- public.orders, independent of phone.
--
-- Deliberately EXACT-only. A LIKE/prefix match here would let one typed
-- fragment pull in several unrelated orders, which is precisely the guessing
-- this system forbids. The existing fuzzy name/email/partial-phone behaviour is
-- untouched.
--
-- Ambiguity is PRESERVED and, on this path, strictly better: matching one exact
-- order means the customer is known by construction, so identity_state is
-- 'linked' with candidate_count 1. The phone-keyed arms keep their
-- count(distinct email) > 1 => 'ambiguous' rule unchanged; an order already
-- surfaced by those arms is excluded here rather than duplicated.
--
-- BODY-ONLY `create or replace`: the RETURNS TABLE signature is byte-identical,
-- so there is NO drop and therefore no re-added default `anon EXECUTE` grant.
-- contact_e164 is already `text` and simply carries NULL for a phone-less order,
-- which the client tolerates (ConversationHit.contactE164 is string | null and
-- useConversationThread targets on `!!key || !!orderId`).
--
-- Idempotent, non-destructive, read-only.

create or replace function public.admin_search_conversations(p_query text, p_limit integer DEFAULT 25)
 RETURNS TABLE(contact_e164 text, display_name text, email text, order_id uuid, confirmation_id text, match_kind text, identity_state text, candidate_count integer, last_at timestamp with time zone, last_channel text, last_preview text, message_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_q       text := btrim(coalesce(p_query, ''));
  v_digits  text := regexp_replace(coalesce(p_query, ''), '[^0-9]', '', 'g');
  v_e164    text := public.pt_normalize_e164(p_query);
  v_like    text;
  v_limit   integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  -- Exact-id inputs. Both are compared with `=`, never LIKE.
  v_uuid    uuid;
begin
  if not public.check_is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if length(v_q) < 2 then
    return;
  end if;

  v_like := '%' || replace(replace(v_q, '%', '\%'), '_', '\_') || '%';

  begin
    v_uuid := v_q::uuid;
  exception when others then
    v_uuid := null;
  end;

  return query
  with
  convo as (
    select c.contact_e164 as ce,
           max(c.created_at) as c_last_at,
           count(*)          as n,
           (array_agg(c.order_id order by c.created_at desc)
              filter (where c.order_id is not null))[1]        as linked_order,
           (array_agg(c.confirmation_id order by c.created_at desc)
              filter (where c.confirmation_id is not null))[1] as linked_conf
      from public.communications c
     where c.contact_e164 is not null
     group by c.contact_e164
  ),
  convo_last as (
    select distinct on (c.contact_e164)
           c.contact_e164 as ce, c.type as last_type, c.body as last_body
      from public.communications c
     where c.contact_e164 is not null
     order by c.contact_e164, c.created_at desc
  ),
  ident as (
    select public.pt_normalize_e164(o.phone) as ce,
           count(distinct lower(o.email))    as people,
           (array_agg(o.id order by o.created_at desc))[1]              as any_order,
           (array_agg(o.confirmation_id order by o.created_at desc))[1] as any_conf,
           (array_agg(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, ''))
                      order by o.created_at desc))[1]                   as any_name,
           (array_agg(o.email order by o.created_at desc))[1]           as any_email
      from public.orders o
     where o.phone is not null
       and public.pt_normalize_e164(o.phone) is not null
     group by 1
  ),
  hits as (
    select cv.ce,
           -- `mk`, not `match_kind`: the OUT parameter of that name would make
           -- every unqualified reference below ambiguous.
           case
             when v_e164 is not null and cv.ce = v_e164                 then 'phone'
             when length(v_digits) >= 4 and cv.ce like '%' || v_digits   then 'phone'
             when v_q ilike 'PT-%' and (cv.linked_conf ilike v_like)     then 'order'
             when id.any_email ilike v_like                             then 'email'
             when id.any_name  ilike v_like                             then 'name'
             when cv.linked_conf ilike v_like                           then 'order'
             else null
           end as mk,
           cv.c_last_at, cv.n, cv.linked_order, cv.linked_conf,
           id.people, id.any_order, id.any_conf, id.any_name, id.any_email
      from convo cv
      left join ident id on id.ce = cv.ce
  ),
  order_only as (
    select id.ce,
           case
             when v_e164 is not null and id.ce = v_e164                 then 'phone'
             when length(v_digits) >= 4 and id.ce like '%' || v_digits   then 'phone'
             when id.any_conf  ilike v_like                             then 'order'
             when id.any_email ilike v_like                             then 'email'
             when id.any_name  ilike v_like                             then 'name'
             else null
           end as mk,
           null::timestamptz as c_last_at, 0::bigint as n,
           null::uuid as linked_order, null::text as linked_conf,
           id.people, id.any_order, id.any_conf, id.any_name, id.any_email
      from ident id
     where not exists (select 1 from convo cv where cv.ce = id.ce)
  ),
  merged as (
    select * from hits       where hits.mk is not null
    union all
    select * from order_only where order_only.mk is not null
  ),
  -- COMMAND-CENTER-SEARCH-EXACT-ORDER-001 — the phone-independent arm.
  order_direct as (
    select public.pt_normalize_e164(o.phone) as ce,
           'order'::text as mk,
           null::timestamptz as c_last_at, 0::bigint as n,
           o.id as linked_order, o.confirmation_id as linked_conf,
           -- One EXACT order is one known customer. This is not the shared-phone
           -- case: we did not infer the person from a number, we were handed
           -- their order id.
           1::bigint as people,
           o.id as any_order, o.confirmation_id as any_conf,
           nullif(btrim(coalesce(o.first_name, '') || ' ' || coalesce(o.last_name, '')), '') as any_name,
           o.email as any_email
      from public.orders o
     where (
             (o.confirmation_id is not null and upper(btrim(o.confirmation_id)) = upper(v_q))
             or (v_uuid is not null and o.id = v_uuid)
           )
       -- Never duplicate an order the phone-keyed arms already returned.
       and not exists (
         select 1 from merged m
          where m.any_order = o.id
             or (m.linked_order is not null and m.linked_order = o.id)
       )
  ),
  merged2 as (
    select * from merged
    union all
    select * from order_direct
  ),
  resolved as (
    select m.*,
           case
             when coalesce(m.people, 0) > 1  then 'ambiguous'
             when m.people = 1               then 'linked'
             when m.linked_order is not null then 'linked'
             else 'unknown'
           end as istate
      from merged2 m
  )
  select
    r.ce,
    case when r.istate = 'linked' then nullif(btrim(coalesce(r.any_name, '')), '') end,
    case when r.istate = 'linked' then r.any_email end,
    case when r.istate = 'linked' then coalesce(r.linked_order, r.any_order) end,
    case when r.istate = 'linked' then coalesce(r.linked_conf,  r.any_conf)  end,
    r.mk,
    r.istate,
    coalesce(r.people, 0)::integer,
    r.c_last_at,
    cl.last_type,
    left(regexp_replace(coalesce(cl.last_body, ''), '\s+', ' ', 'g'), 140),
    r.n
  from resolved r
  left join convo_last cl on cl.ce = r.ce
  order by r.c_last_at desc nulls last, r.ce
  limit v_limit;
end;
$function$;

-- No DROP above, so no grant was reset. Asserted anyway.
revoke all on function public.admin_search_conversations(text, integer) from public;
revoke all on function public.admin_search_conversations(text, integer) from anon;
grant execute on function public.admin_search_conversations(text, integer) to authenticated;
grant execute on function public.admin_search_conversations(text, integer) to service_role;
