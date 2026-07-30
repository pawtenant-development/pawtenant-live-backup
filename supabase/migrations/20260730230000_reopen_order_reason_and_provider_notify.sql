-- ADMIN-ORDER-PENDING-DELIVERY-WORKFLOW-LIVE-ROLLOUT-001 · Phase 4
-- MANUAL "RETURN TO UNDER REVIEW" WITH A REQUIRED REASON (LIVE)
-- =============================================================================
-- LIVE port of TEST 0eafbee (20260730140000).
--
-- >>> LIVE ADAPTATION 1 — PROJECT REF <<<
--   The TEST source hardcodes the TEST project ref in the notify URL
--   (opudhofjbydrljgleofq). On LIVE this MUST be cvwbozlbbmrjxznknouq, or a
--   production reopen would invoke the TEST edge function. Verified post-apply by
--   extracting the URL back out of pg_proc.prosrc.
--
-- >>> LIVE ADAPTATION 2 — CONTROL-CHARACTER REGEX <<<
--   The TEST migration FILE contains E'[\x00-...]' with SINGLE backslashes, which
--   Postgres rejects outright ("invalid byte sequence for encoding UTF8: 0x00")
--   because it puts a raw NUL byte in the string literal — that file as written
--   could never have applied. TEST's DEPLOYED function actually carries DOUBLE
--   backslashes, so the E'' literal collapses \\ to one backslash and the REGEX
--   engine receives \x00 as a hex escape. The working (deployed) form is used
--   here, and was confirmed to accept a legitimate "weight < 20 lbs".
--
-- >>> LIVE ADAPTATION 3 — search_path PINNED on validate_reopen_reason() <<<
--   TEST leaves it unpinned. Pinned here per the standing LIVE rule.
--
-- The 30-day AUTOMATED reissue rules are NOT touched. This adds a MANUAL path
-- that reuses the existing provider notifier with variant='manual_reopen'.
-- No historical 30-day backfill is performed, and the 23 historical California
-- orders are not reopened.
--
-- If a document on the order is still awaiting approval, this RPC refuses and
-- directs the employee to Needs Correction instead, so the two correction paths
-- can never produce contradictory state on one order.
--
-- Idempotent and non-destructive.
-- =============================================================================

begin;

alter table public.orders
  add column if not exists last_reopen_reason    text,
  add column if not exists last_reopen_reason_at timestamptz,
  add column if not exists last_reopen_reason_by uuid;

comment on column public.orders.last_reopen_reason is
  'Reason an employee manually returned this order to Under Review. Set by reopen_order_under_review(); shown to the assigned provider. Full history lives in audit_logs.';

create or replace function public.validate_reopen_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v text := btrim(coalesce(p_reason, ''));
begin
  if length(v) = 0 then
    raise exception 'A reason is required.' using errcode = 'check_violation';
  end if;
  if length(v) < 5 then
    raise exception 'Reason is too short - please write at least 5 characters.' using errcode = 'check_violation';
  end if;
  if length(v) > 1000 then
    raise exception 'Reason is too long - please keep it under 1000 characters.' using errcode = 'check_violation';
  end if;
  -- Reject rather than strip. The provider reads this verbatim in an email, so a
  -- silently-rewritten reason would misrepresent the employee. `<` plus a letter
  -- or `/` catches tags without rejecting legitimate "weight < 20 lbs".
  if v ~ '<[a-zA-Z/!]' then
    raise exception 'Reason cannot contain HTML or markup - please write plain text.' using errcode = 'check_violation';
  end if;
  -- Double-backslashed deliberately: the E'' literal collapses \\ to a single
  -- backslash, which is what the REGEX engine must receive in order to read
  -- \x00 as a hex character escape. A single backslash here would instead put a
  -- raw NUL byte in the string literal, which Postgres rejects outright.
  if v ~ E'[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]' then
    raise exception 'Reason contains invalid control characters.' using errcode = 'check_violation';
  end if;
  return v;
end;
$$;

revoke all on function public.validate_reopen_reason(text) from public, anon, authenticated;
grant execute on function public.validate_reopen_reason(text) to authenticated, service_role;

create or replace function public.reopen_order_under_review(
  p_order_id uuid,
  p_reason   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order       public.orders;
  v_actor_id    uuid := auth.uid();
  v_name        text;
  v_role        text;
  v_reason      text;
  v_prev_status text;
  v_prev_doc    text;
  v_new_doc     text;
  v_pending     int;
  v_service_key text;
  v_notified    boolean := false;
  -- LIVE ADAPTATION: the TEST source hardcodes the TEST project ref
  -- (opudhofjbydrljgleofq). On LIVE this MUST be the LIVE ref.
  v_fn_url      text := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/notify-thirty-day-reissue';
begin
  if not public.is_admin_staff() then
    raise exception 'reopen_order_under_review: not authorised' using errcode = 'insufficient_privilege';
  end if;

  -- Validate BEFORE locking so a bad reason costs nothing.
  v_reason := public.validate_reopen_reason(p_reason);

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'reopen_order_under_review: order % not found', p_order_id;
  end if;

  -- Idempotency: already under review => no transition, no audit, no email.
  if v_order.status = 'under-review' then
    return jsonb_build_object('transitioned', false, 'reason', 'already_under_review',
      'order_id', v_order.id, 'confirmation_id', v_order.confirmation_id);
  end if;

  -- Defer to the document Needs Correction flow rather than creating two
  -- contradictory correction paths on the same order.
  select count(*) into v_pending
    from public.order_documents
   where order_id = v_order.id
     and review_status = 'pending_admin_approval';
  if v_pending > 0 then
    return jsonb_build_object('transitioned', false, 'reason', 'document_pending_approval',
      'order_id', v_order.id, 'confirmation_id', v_order.confirmation_id,
      'message', 'This order has a document awaiting your approval. Use Needs Correction on that document so the provider knows exactly what to fix.');
  end if;

  select display_name, role into v_name, v_role from public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  v_prev_status := v_order.status;
  v_prev_doc    := v_order.doctor_status;
  -- A delivered order must genuinely re-enter the provider queue. Any other
  -- doctor_status is left alone so we never invent provider progress.
  v_new_doc := case when v_order.doctor_status = 'patient_notified'
                    then 'in_review' else v_order.doctor_status end;

  update public.orders
     set status                = 'under-review',
         doctor_status         = v_new_doc,
         last_reopen_reason    = v_reason,
         last_reopen_reason_at = now(),
         last_reopen_reason_by = v_actor_id,
         last_reopened_at      = now()
   where id = v_order.id
  returning * into v_order;

  -- order_status_logs is written by the existing orders_status_change_trigger;
  -- only the richer context is added here, to avoid double-logging.
  insert into public.audit_logs (actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, action, description, old_values, new_values, metadata)
  values (v_actor_id, v_name, v_role, 'employee', 'orders', 'admin_portal',
    'order', v_order.confirmation_id, v_order.id, 'order_marked_under_review',
    format('%s returned order %s to Under Review. Reason: %s',
           v_name, v_order.confirmation_id, v_reason),
    jsonb_build_object('status', v_prev_status, 'doctor_status', v_prev_doc),
    jsonb_build_object('status', 'under-review', 'doctor_status', v_new_doc),
    jsonb_build_object('confirmation_id', v_order.confirmation_id, 'order_id', v_order.id,
      'reason', v_reason, 'prior_status', v_prev_status, 'prior_doctor_status', v_prev_doc,
      'provider_id', v_order.doctor_user_id, 'provider_name', v_order.doctor_name,
      'customer_emailed', false));

  -- Provider in-portal bell. doctor_notifications.doctor_user_id is NOT NULL, so
  -- this is only possible when the provider's user id is known.
  if v_order.doctor_user_id is not null then
    begin
      insert into public.doctor_notifications
        (doctor_user_id, title, message, type, confirmation_id, order_id)
      values (v_order.doctor_user_id,
        'Order Returned for Review',
        format('Order %s has been returned to your queue. Reason: %s',
               v_order.confirmation_id, v_reason),
        'reopened_for_review', v_order.confirmation_id, v_order.id);
      v_notified := true;
    exception when others then
      v_notified := false; -- best effort; never block the transition
    end;
  end if;

  -- Provider email through the EXISTING reopen sender.
  if v_order.doctor_email is not null then
    begin
      select decrypted_secret into v_service_key
        from vault.decrypted_secrets where name = 'payout_cron_service_key' limit 1;
      if v_service_key is not null and v_service_key <> '' then
        perform net.http_post(
          url     := v_fn_url,
          headers := jsonb_build_object('Content-Type','application/json',
                                        'Authorization','Bearer ' || v_service_key),
          body    := jsonb_build_object('confirmationId', v_order.confirmation_id,
                                        'reason', v_reason,
                                        'variant', 'manual_reopen'));
      end if;
    exception when others then
      null; -- email dispatch must never roll back the reopen
    end;
  end if;

  return jsonb_build_object(
    'transitioned', true,
    'order_id', v_order.id,
    'confirmation_id', v_order.confirmation_id,
    'status', 'under-review',
    'doctor_status', v_new_doc,
    'reason', v_reason,
    'reopened_by', v_actor_id,
    'reopened_by_name', v_name,
    -- The UI must be able to warn honestly when nobody was told.
    'provider_user_id', v_order.doctor_user_id,
    'provider_email', v_order.doctor_email,
    'provider_notified', v_notified,
    'provider_email_queued', v_order.doctor_email is not null,
    'has_provider', (v_order.doctor_user_id is not null or v_order.doctor_email is not null),
    'customer_emailed', false);
end;
$$;

revoke all on function public.reopen_order_under_review(uuid, text) from public, anon, authenticated;
grant execute on function public.reopen_order_under_review(uuid, text) to authenticated;

commit;
