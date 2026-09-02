-- PAID-INCOMPLETE-PSD-CONTINUATION-001
-- A paid PSD order stays payment-closed, but an incomplete clinical intake
-- remains answerable through the existing opaque continuation capability.

create or replace function public.ensure_assessment_continue_slug(
  p_order_id uuid,
  p_created_by text default 'system'
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_slug text;
  v_try text;
  v_i int := 0;
  v_order record;
  v_status jsonb;
begin
  select id, letter_type, paid_at, status into v_order
    from public.orders where id = p_order_id;

  if not found
     or lower(coalesce(v_order.letter_type, '')) <> 'psd'
     or coalesce(v_order.status, '') in ('completed','cancelled','canceled','refunded','archived') then
    return null;
  end if;

  v_status := public.psd_assessment_status(p_order_id);
  if v_order.paid_at is not null
     and coalesce((v_status ->> 'complete')::boolean, false) then
    return null;
  end if;

  select slug into v_slug from public.assessment_continue_links
   where order_id = p_order_id and revoked_at is null limit 1;
  if v_slug is not null then return v_slug; end if;

  loop
    v_i := v_i + 1;
    v_try := public.generate_checkout_slug();
    begin
      insert into public.assessment_continue_links (order_id, slug, created_by)
      values (p_order_id, v_try, coalesce(p_created_by, 'system'));
      return v_try;
    exception when unique_violation then
      select slug into v_slug from public.assessment_continue_links
       where order_id = p_order_id and revoked_at is null limit 1;
      if v_slug is not null then return v_slug; end if;
      if v_i >= 8 then return null; end if;
    end;
  end loop;
end;
$function$;

create or replace function public.resolve_assessment_continue_slug(
  p_slug text,
  p_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_link record;
  v_order record;
  v_status jsonb;
begin
  select * into v_link from public.assessment_continue_links
   where slug = p_slug and revoked_at is null;
  if not found then return null; end if;

  select * into v_order from public.orders where id = v_link.order_id;
  if not found
     or lower(coalesce(v_order.letter_type, '')) <> 'psd'
     or coalesce(v_order.status, '') in ('completed','cancelled','canceled','refunded','archived') then
    return null;
  end if;

  v_status := public.psd_assessment_status(v_link.order_id);
  if v_order.paid_at is not null
     and coalesce((v_status ->> 'complete')::boolean, false) then
    return null;
  end if;

  update public.assessment_continue_links
     set use_count = use_count + 1, last_used_at = now()
   where slug = p_slug;
  insert into public.assessment_sessions (token_hash, order_id, expires_at)
  values (p_token_hash, v_link.order_id, now() + interval '7 days');

  return jsonb_build_object(
    'order_id', v_order.id,
    'confirmation_id', v_order.confirmation_id,
    'first_name', v_order.first_name,
    'last_name', v_order.last_name,
    'email', v_order.email,
    'phone', v_order.phone,
    'state', v_order.state,
    'letter_type', v_order.letter_type,
    'package_key', v_order.package_key,
    'delivery_speed', v_order.delivery_speed,
    'pets', coalesce(v_order.assessment_answers -> 'pets', '[]'::jsonb),
    'dob', v_order.assessment_answers ->> 'dob',
    'already_paid', v_order.paid_at is not null,
    'status', v_status,
    'route', case when coalesce((v_status ->> 'complete')::boolean, false)
      then 'resume_checkout' else 'continue_assessment' end
  );
end;
$function$;

comment on function public.ensure_assessment_continue_slug(uuid,text) is
  'Creates/reuses an opaque PSD continuation slug for active incomplete orders, including paid incomplete PSD orders; never reopens payment.';
comment on function public.resolve_assessment_continue_slug(text,text) is
  'Resolves an opaque PSD continuation slug and mints an assessment token. Paid orders resolve only while incomplete and never route to checkout.';
