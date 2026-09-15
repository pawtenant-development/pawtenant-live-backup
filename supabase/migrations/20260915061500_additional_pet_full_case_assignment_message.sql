-- ADDITIONAL-PET-NEUTRAL-CASE-ASSIGNMENT-MESSAGE-001
-- The request-level assignee receives the same provider-facing language as a
-- normal newly assigned multi-pet case. Historical handoff details stay in
-- admin-only audit records.

create or replace function public.admin_reassign_additional_pet_request(
  p_request_id uuid, p_provider_user_id uuid, p_note text default null)
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

  select * into v_req from public.order_additional_pet_requests
   where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'request_not_found');
  end if;
  if v_req.status <> 'needs_reassignment' then
    return jsonb_build_object('ok', false, 'error', 'not_awaiting_reassignment',
                              'status', v_req.status);
  end if;

  select * into v_order from public.orders where id = v_req.order_id;
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
     format('Complete %s-pet case assigned to %s. The completed base order, original provider payout and historical document remain unchanged.',
            v_req.target_pet_count, v_provider.full_name),
     jsonb_build_object('request_id', v_req.id, 'order_id', v_req.order_id,
                        'provider_user_id', p_provider_user_id,
                        'target_pet_count', v_req.target_pet_count,
                        'note', nullif(trim(coalesce(p_note, '')), '')));

  insert into public.doctor_notifications
    (doctor_user_id, title, message, type, is_read, confirmation_id, order_id)
  values
    (p_provider_user_id, 'New case assigned',
     format('A new %s-pet %s case is awaiting your review. Review the assessment and all pets, then submit one letter covering all pets.',
            v_req.target_pet_count, upper(v_req.service_type)),
     'case_assigned', false, v_order.confirmation_id, v_order.id);

  return jsonb_build_object('ok', true, 'status', 'pending_provider_review',
                            'assigned_provider_user_id', p_provider_user_id,
                            'target_pet_count', v_req.target_pet_count,
                            'assignment_kind', 'case');
end;
$function$;

revoke all on function public.admin_reassign_additional_pet_request(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_reassign_additional_pet_request(uuid, uuid, text)
  to authenticated;

comment on function public.admin_reassign_additional_pet_request(uuid, uuid, text) is
  'Assigns a needs-reassignment request with neutral new-case provider messaging. '
  'Preserves the base provider, earning and documents.';
