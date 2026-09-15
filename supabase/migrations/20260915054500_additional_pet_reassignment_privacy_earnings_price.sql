-- ADDITIONAL-PET-REASSIGNMENT-PRIVACY-EARNINGS-PRICE-001
--
-- Owner decisions (2026-09-15):
--   * a replacement reviewer must not inherit the prior provider's decline
--     comments or review history;
--   * the original provider's completed-order earning remains untouched;
--   * the replacement provider earns one normal per-order-rate payout only
--     after the revised document completes the Additional Pet request;
--   * new POST-COMPLETION amendments cost $60. Existing request quotes remain
--     immutable/grandfathered, and pre-completion pricing is unchanged.

-- -------------------------------------------------------------------------
-- 1. Provider earning: a separate, request-keyed ledger row on completion.
-- -------------------------------------------------------------------------

alter table public.doctor_earnings
  add column if not exists additional_pet_request_id uuid
    references public.order_additional_pet_requests(id) on delete restrict;

create unique index if not exists doctor_earnings_additional_pet_request_uniq
  on public.doctor_earnings(additional_pet_request_id)
  where additional_pet_request_id is not null;

comment on column public.doctor_earnings.additional_pet_request_id is
  'Links the one replacement-provider payout for a completed Additional Pet '
  'review to its immutable request. Separate from the base-order earning.';

create or replace function public.record_additional_pet_provider_earning()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order   public.orders;
  v_profile public.doctor_profiles;
  v_patient text;
begin
  if new.status <> 'completed'
     or coalesce(old.status, '') = 'completed'
     or new.assigned_provider_user_id is null then
    return new;
  end if;

  select * into v_order
    from public.orders
   where id = new.order_id;
  if not found then
    return new;
  end if;

  select * into v_profile
    from public.doctor_profiles
   where user_id = new.assigned_provider_user_id;
  if not found then
    return new;
  end if;

  v_patient := nullif(trim(concat_ws(' ', v_order.first_name, v_order.last_name)), '');

  insert into public.doctor_earnings (
    doctor_user_id, doctor_name, doctor_email,
    order_id, confirmation_id, patient_name, patient_state,
    order_amount, doctor_amount, status, earning_type,
    additional_pet_request_id, notes,
    order_origin, partner_id
  ) values (
    new.assigned_provider_user_id, v_profile.full_name, v_profile.email,
    v_order.id, v_order.confirmation_id, v_patient, v_order.state,
    round(new.amount_cents / 100.0)::integer, v_profile.per_order_rate,
    'pending', 'additional_pet', new.id,
    case when v_profile.per_order_rate is null
      then 'Additional Pet completion payout — provider rate not set; resolve in Providers earnings panel'
      else 'Additional Pet completion payout (provider per-order rate)'
    end,
    coalesce(to_jsonb(v_order)->>'order_origin', 'direct'),
    nullif(to_jsonb(v_order)->>'partner_id', '')::uuid
  )
  on conflict (additional_pet_request_id)
    where additional_pet_request_id is not null
  do nothing;

  return new;
end;
$function$;

drop trigger if exists trg_additional_pet_provider_earning
  on public.order_additional_pet_requests;
create trigger trg_additional_pet_provider_earning
  after update of status on public.order_additional_pet_requests
  for each row
  when (new.status = 'completed' and old.status is distinct from new.status)
  execute function public.record_additional_pet_provider_earning();

revoke all on function public.record_additional_pet_provider_earning()
  from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- 2. Provider privacy: one reviewer cycle, with prior-provider events absent.
-- -------------------------------------------------------------------------

create or replace function public.get_additional_pet_request_for_provider(p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req         public.order_additional_pet_requests;
  v_events      jsonb;
  v_pets        jsonb;
  v_approved    jsonb;
  v_order       public.orders;
  v_reviewer    uuid;
  v_is_admin    boolean := public.is_admin_staff();
  v_cycle_start timestamptz;
begin
  select * into v_order from public.orders o where o.id = p_order_id;
  if not found or auth.uid() is null then
    raise exception 'get_additional_pet_request_for_provider: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  -- A provider receives only the request assigned to that provider. The base
  -- order's original provider is not allowed to follow a reassigned review.
  select * into v_req
    from public.order_additional_pet_requests r
   where r.order_id = p_order_id
     and r.status in ('pending_provider_review','clarification_requested',
                      'resubmitted','approved_pending_document','completed','rejected',
                      'refund_pending','refunded')
     and (
       v_is_admin
       or r.assigned_provider_user_id = auth.uid()
       or (r.assigned_provider_user_id is null
           and v_order.doctor_user_id = auth.uid()
           and r.status in ('pending_provider_review','clarification_requested','resubmitted'))
     )
   order by r.created_at desc
   limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  v_reviewer := coalesce(v_req.assigned_provider_user_id, v_order.doctor_user_id);

  -- The replacement reviewer sees only the current review cycle. The previous
  -- provider's decline/reassignment records remain append-only admin audit
  -- evidence and are deliberately absent from this provider projection.
  select coalesce(max(e.created_at), v_req.created_at)
    into v_cycle_start
    from public.order_additional_pet_request_events e
   where e.request_id = v_req.id
     and e.event_type = 'reassigned'
     and e.detail->>'provider_user_id' = v_reviewer::text;

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', e.event_type,
           'actor_role', e.actor_role,
           'detail', e.detail - 'amount_cents' - 'stripe_payment_intent_id'
                            - 'stripe_checkout_session_id' - 'pricing_outcome',
           'created_at', e.created_at) order by e.created_at), '[]'::jsonb)
    into v_events
    from public.order_additional_pet_request_events e
   where e.request_id = v_req.id
     and e.created_at >= v_cycle_start
     and e.event_type in ('clarification_requested','resubmitted',
                          'submitted_for_review','provider_approved');

  select (public.additional_pet_effective_state(p_order_id))->'original_pets'
    into v_pets;

  select coalesce(jsonb_agg(r.new_pet order by r.provider_decision_at), '[]'::jsonb)
    into v_approved
    from public.order_additional_pet_requests r
   where r.order_id = p_order_id
     and r.provider_decision = 'approved'
     and r.status in ('approved_pending_document','completed');

  return jsonb_build_object(
    'found', true,
    'request_id', v_req.id,
    'status', v_req.status,
    'service_type', v_req.service_type,
    'new_pet', v_req.new_pet,
    'original_pets', coalesce(v_pets, '[]'::jsonb),
    'approved_added_pets', v_approved,
    'target_pet_count', v_req.target_pet_count,
    'provider_decision', v_req.provider_decision,
    'provider_decision_reason', v_req.provider_decision_reason,
    'clarification_history', v_events,
    'created_at', v_req.created_at,
    'is_reviewer', (auth.uid() = v_reviewer),
    'confirmation_id', v_order.confirmation_id,
    'clinical_context', jsonb_build_object(
      'customer_first_name', v_order.first_name,
      'state', v_order.state,
      'letter_type', v_order.letter_type,
      'assessment_answers', v_order.assessment_answers)
  );
end;
$function$;

revoke all on function public.get_additional_pet_request_for_provider(uuid)
  from public, anon, authenticated;
grant execute on function public.get_additional_pet_request_for_provider(uuid)
  to authenticated;

-- The queue identifies replacement assignments as full multi-pet cases. It
-- exposes only the fields needed to open the clean clinical projection above.
create or replace function public.list_additional_pet_reviews_for_provider()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'list_additional_pet_reviews_for_provider: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'request_id', r.id,
           'order_id', r.order_id,
           'confirmation_id', o.confirmation_id,
           'status', r.status,
           'service_type', r.service_type,
           'pet_name', r.new_pet->>'name',
           'target_pet_count', r.target_pet_count,
           'customer_first_name', o.first_name,
           'state', o.state,
           'is_order_provider', (o.doctor_user_id = auth.uid()),
           'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
    into v
    from public.order_additional_pet_requests r
    join public.orders o on o.id = r.order_id
   where r.assigned_provider_user_id = auth.uid()
     and r.status in ('pending_provider_review','clarification_requested',
                      'resubmitted','approved_pending_document');

  return v;
end;
$function$;

revoke all on function public.list_additional_pet_reviews_for_provider()
  from public, anon, authenticated;
grant execute on function public.list_additional_pet_reviews_for_provider()
  to authenticated;

-- -------------------------------------------------------------------------
-- 3. $60 applies only to NEW post-completion amendments.
-- -------------------------------------------------------------------------

create table if not exists public.additional_pet_post_completion_price_versions (
  pricing_version text primary key,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'usd' check (currency = 'usd'),
  effective_from timestamptz not null,
  superseded_at timestamptz,
  note text not null
);

alter table public.additional_pet_post_completion_price_versions enable row level security;
revoke all on table public.additional_pet_post_completion_price_versions
  from public, anon, authenticated;
grant select on table public.additional_pet_post_completion_price_versions
  to service_role;

do $block$
declare
  v_cutover timestamptz := clock_timestamp();
begin
  if not exists (
    select 1 from public.additional_pet_post_completion_price_versions
     where pricing_version = 'post_completion_v1_3000'
  ) then
    insert into public.additional_pet_post_completion_price_versions
      (pricing_version, amount_cents, currency, effective_from, superseded_at, note)
    values
      ('post_completion_v1_3000', 3000, 'usd',
       timestamptz '2026-08-19 00:00:00+00', v_cutover,
       'Historical post-completion amendment price before owner change on 2026-09-15.');
  end if;

  if not exists (
    select 1 from public.additional_pet_post_completion_price_versions
     where pricing_version = 'post_completion_v2_6000'
  ) then
    insert into public.additional_pet_post_completion_price_versions
      (pricing_version, amount_cents, currency, effective_from, superseded_at, note)
    values
      ('post_completion_v2_6000', 6000, 'usd', v_cutover, null,
       'Owner decision 2026-09-15: new post-completion Additional Pet amendments cost $60.');
  end if;
end;
$block$;

-- The payment verifier validates every frozen request quote against the
-- historical all-price catalog. Register $60 as a known, non-current generic
-- version; its one-second historical window ensures the generic pre-completion
-- price remains v2_3000.
insert into public.additional_pet_price_versions
  (pricing_version, amount_cents, currency, effective_from, superseded_at, note)
values
  ('post_completion_v2_6000', 6000, 'usd',
   timestamptz '2026-09-15 00:00:00+00',
   timestamptz '2026-09-15 00:00:01+00',
   'Known quote for post-completion amendments only; never the generic current price.')
on conflict (pricing_version) do nothing;

create or replace function public.additional_pet_post_completion_current_price()
returns jsonb
language sql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
           'pricing_version', v.pricing_version,
           'amount_cents', v.amount_cents,
           'currency', v.currency,
           'effective_from', v.effective_from)
    from public.additional_pet_post_completion_price_versions v
   where v.effective_from <= now()
     and (v.superseded_at is null or v.superseded_at > now())
   order by v.effective_from desc
   limit 1
$function$;

revoke all on function public.additional_pet_post_completion_current_price()
  from public, anon, authenticated;
grant execute on function public.additional_pet_post_completion_current_price()
  to service_role;

-- Preserve the complete proven eligibility/entitlement engine as an internal
-- base function, then overlay only a NEW post-completion paid quote. Existing
-- active requests return resume_payment with their frozen amount and bypass
-- the overlay.
do $block$
begin
  if to_regprocedure('public.resolve_additional_pet_pricing_base(uuid)') is null then
    alter function public.resolve_additional_pet_pricing(uuid)
      rename to resolve_additional_pet_pricing_base;
  end if;
end;
$block$;

revoke all on function public.resolve_additional_pet_pricing_base(uuid)
  from public, anon, authenticated;

create or replace function public.resolve_additional_pet_pricing(p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb := public.resolve_additional_pet_pricing_base(p_order_id);
  v_price  jsonb;
begin
  if v_result->>'phase' = 'post_completion'
     and v_result->>'outcome' = 'paid_upgrade'
     and v_result->>'code' in ('post_completion_amendment', 'admin_resolved_paid_upgrade') then
    v_price := public.additional_pet_post_completion_current_price();
    v_result := v_result || jsonb_build_object(
      'amount_cents', (v_price->>'amount_cents')::integer,
      'currency', v_price->>'currency',
      'pricing_version', v_price->>'pricing_version'
    );
  end if;
  return v_result;
end;
$function$;

revoke all on function public.resolve_additional_pet_pricing(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_additional_pet_pricing(uuid)
  to service_role;

comment on function public.resolve_additional_pet_pricing(uuid) is
  'Canonical Additional Pet eligibility and pricing. Existing requests retain '
  'their frozen quote; new post-completion amendments use the phase-specific '
  '$60 price; all pre-completion pricing remains delegated unchanged.';
