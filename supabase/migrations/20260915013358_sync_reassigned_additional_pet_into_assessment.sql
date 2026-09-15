-- ADDITIONAL-PET-ASSESSMENT-PROJECTION-001
--
-- Keep orders.assessment_answers immutable as the customer's original intake
-- and entitlement evidence. Internal clinical views receive a read-time copy
-- whose pets array also contains every applicable Additional Pet request.
-- The projection returns assessment JSON only: no payment, assignment,
-- provider-decision, decline, reassignment, or event-history fields.

create or replace function public.get_internal_assessment_answers(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor          uuid := auth.uid();
  v_order_provider uuid;
  v_answers        jsonb;
  v_pets           jsonb;
  v_pet            jsonb;
  v_is_admin       boolean := public.is_admin_staff();
  v_is_assignee    boolean := false;
begin
  if v_actor is null then
    raise exception 'get_internal_assessment_answers: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select o.doctor_user_id, coalesce(o.assessment_answers, '{}'::jsonb)
    into v_order_provider, v_answers
    from public.orders o
   where o.id = p_order_id;

  if not found then
    raise exception 'get_internal_assessment_answers: order not found'
      using errcode = 'no_data_found';
  end if;

  select exists (
    select 1
      from public.order_additional_pet_requests r
     where r.order_id = p_order_id
       and r.assigned_provider_user_id = v_actor
       and r.status in ('needs_reassignment', 'pending_provider_review', 'clarification_requested',
                        'resubmitted', 'approved_pending_document', 'completed')
  ) into v_is_assignee;

  if not v_is_admin
     and v_order_provider is distinct from v_actor
     and not v_is_assignee then
    raise exception 'get_internal_assessment_answers: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  v_pets := case
    when jsonb_typeof(v_answers->'pets') = 'array' then v_answers->'pets'
    else '[]'::jsonb
  end;

  -- Completed additions belong to the ongoing clinical case. An in-flight
  -- addition is visible only to admins or its current reviewer. If it has no
  -- request-level reviewer yet, it remains visible to the base-order provider.
  for v_pet in
    select r.new_pet
      from public.order_additional_pet_requests r
     where r.order_id = p_order_id
       and r.status in ('pending_provider_review', 'clarification_requested',
                        'resubmitted', 'approved_pending_document', 'completed')
       and (r.paid_at is not null or r.pricing_outcome = 'included')
       and (
         v_is_admin
         or r.status = 'completed'
         or r.assigned_provider_user_id = v_actor
         or (r.assigned_provider_user_id is null and v_order_provider = v_actor)
       )
     order by r.created_at, r.id
  loop
    -- Exact JSON containment makes the projection idempotent if a historic pet
    -- was already copied into assessment_answers by an older/manual workflow.
    if not (v_pets @> jsonb_build_array(v_pet)) then
      v_pets := v_pets || jsonb_build_array(v_pet);
    end if;
  end loop;

  return jsonb_set(v_answers, '{pets}', v_pets, true);
end;
$function$;

revoke all on function public.get_internal_assessment_answers(uuid) from public;
revoke all on function public.get_internal_assessment_answers(uuid) from anon;
grant execute on function public.get_internal_assessment_answers(uuid) to authenticated;

comment on function public.get_internal_assessment_answers(uuid) is
  'ADDITIONAL-PET-ASSESSMENT-PROJECTION-001: authorised internal assessment JSON with applicable paid/included pet additions merged idempotently; never returns provider history or financial fields.';
