-- REOPEN-ASSIGNMENT-CURRENT-PROVIDER-001
-- A reassigned, paid post-completion case has one current operational owner.
-- Historical documents and earnings stay append-only; the order row reflects
-- the provider who owns the active review.

create or replace function public.admin_reassign_additional_pet_request(
  p_request_id uuid,
  p_provider_user_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_req public.order_additional_pet_requests;
  v_order public.orders;
  v_provider public.doctor_profiles;
  v_actor_name text;
begin
  if not public.is_admin_staff() then
    raise exception 'admin_reassign_additional_pet_request: admin only'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_req
    from public.order_additional_pet_requests
   where id = p_request_id
   for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'request_not_found');
  end if;
  if v_req.status <> 'needs_reassignment' then
    return jsonb_build_object('ok', false, 'error', 'not_awaiting_reassignment',
                              'status', v_req.status);
  end if;

  select * into v_order from public.orders where id = v_req.order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  select * into v_provider from public.doctor_profiles
   where user_id = p_provider_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'provider_not_found');
  end if;
  if v_provider.is_active is false then
    return jsonb_build_object('ok', false, 'error', 'provider_inactive');
  end if;
  if v_provider.availability_status = 'at_capacity' then
    return jsonb_build_object('ok', false, 'error', 'provider_at_capacity');
  end if;
  if v_order.state is not null
     and not (upper(v_order.state) = any(coalesce(v_provider.licensed_states, array[]::text[]))) then
    return jsonb_build_object('ok', false, 'error', 'provider_not_licensed_for_state');
  end if;

  update public.order_additional_pet_requests
     set assigned_provider_user_id = p_provider_user_id,
         status = 'pending_provider_review',
         provider_decision = null,
         provider_decision_at = null,
         provider_decision_reason = null
   where id = p_request_id and status = 'needs_reassignment';

  -- This is the operational truth for Admin Orders and the provider's ordinary
  -- My Cases queue. Deliberately do not alter letter/document or earning fields.
  update public.orders
     set doctor_user_id = p_provider_user_id,
         doctor_name = v_provider.full_name,
         doctor_email = v_provider.email,
         doctor_status = 'pending_review',
         status = 'under-review',
         last_reopened_at = clock_timestamp(),
         last_reopen_reason = 'provider_reassignment',
         last_reopen_reason_at = clock_timestamp(),
         last_reopen_reason_by = auth.uid(),
         last_under_review_entered_at = clock_timestamp(),
         last_meaningful_activity_at = clock_timestamp(),
         last_meaningful_activity_type = 'provider_reassigned'
   where id = v_req.order_id;

  insert into public.order_additional_pet_request_events
    (request_id, order_id, event_type, from_status, to_status, actor_role, actor_id, detail)
  values
    (v_req.id, v_req.order_id, 'reassigned', 'needs_reassignment',
     'pending_provider_review', 'admin', auth.uid(),
     jsonb_build_object('provider_user_id', p_provider_user_id,
                        'provider_name', v_provider.full_name,
                        'note', nullif(trim(coalesce(p_note, '')), '')));

  select coalesce(
           (select dp.full_name from public.doctor_profiles dp where dp.user_id = auth.uid()),
           'PawTenant Admin')
    into v_actor_name;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, actor_type, action, object_type, object_id,
     description, metadata)
  values
    (auth.uid(), v_actor_name, 'admin', 'admin', 'additional_pet_reassigned',
     'order', v_order.confirmation_id,
     format('Active case assigned to %s and returned to Under Review. Historical documents and provider earnings were preserved.',
            v_provider.full_name),
     jsonb_build_object('request_id', v_req.id, 'order_id', v_req.order_id,
                        'provider_user_id', p_provider_user_id,
                        'target_pet_count', v_req.target_pet_count,
                        'previous_provider_user_id', v_order.doctor_user_id,
                        'note', nullif(trim(coalesce(p_note, '')), '')));

  insert into public.doctor_notifications
    (doctor_user_id, title, message, type, is_read, confirmation_id, order_id)
  values
    (p_provider_user_id, 'New Case Assigned',
     format('A new case has been assigned to you: %s from %s (Order: %s). Please review it in your dashboard.',
            coalesce(nullif(trim(concat_ws(' ', v_order.first_name, v_order.last_name)), ''), 'Patient'),
            coalesce(v_order.state, 'Unknown State'), v_order.confirmation_id),
     'case_assigned', false, v_order.confirmation_id, v_order.id);

  return jsonb_build_object('ok', true,
                            'status', 'pending_provider_review',
                            'order_status', 'under-review',
                            'order_doctor_status', 'pending_review',
                            'assigned_provider_user_id', p_provider_user_id,
                            'target_pet_count', v_req.target_pet_count,
                            'assignment_kind', 'case');
end;
$function$;

revoke all on function public.admin_reassign_additional_pet_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_reassign_additional_pet_request(uuid, uuid, text)
  to authenticated;

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

  -- Request-level assignments appear here only when the provider does not own
  -- the order row. Once promoted to the current order provider, the ordinary
  -- My Cases queue is the single provider-facing surface.
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
           'is_order_provider', false,
           'created_at', r.created_at) order by r.created_at desc), '[]'::jsonb)
    into v
    from public.order_additional_pet_requests r
    join public.orders o on o.id = r.order_id
   where r.assigned_provider_user_id = auth.uid()
     and o.doctor_user_id is distinct from auth.uid()
     and r.status in ('pending_provider_review','clarification_requested',
                      'resubmitted','approved_pending_document');

  return v;
end;
$function$;

revoke all on function public.list_additional_pet_reviews_for_provider()
  from public, anon, authenticated;
grant execute on function public.list_additional_pet_reviews_for_provider()
  to authenticated;

comment on function public.admin_reassign_additional_pet_request(uuid, uuid, text) is
  'Admin-only reassignment. Makes the new provider the current operational order owner while preserving historical documents and prior earning rows.';
