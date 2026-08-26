-- ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001
--
-- Owner decision (2026-08-26): a provider declining an Additional Pet request
-- must NEVER automatically refund it. The paid add-on becomes NEEDS
-- REASSIGNMENT and returns to the admin workload so another eligible provider
-- can review it. A provider decline records THAT PROVIDER's decision — it is
-- not a final rejection of the customer's paid request. Refunds move behind an
-- EXPLICIT authorized admin action.
--
-- LIVE PORT NOTE: every function replaced below was rewritten from THIS
-- database's own pg_get_functiondef output, not copied from the TEST repo, so
-- LIVE's existing formatting and semantics are preserved and only the intended
-- deltas are applied.
--
--   §1  status CHECK gains 'needs_reassignment'.
--   §2  waiver columns (waived_at / waived_by / waived_note) — the narrowest
--       auditable mechanism for honoring an add-on whose refund already
--       happened because of the old auto-refund defect. The refund record is
--       preserved untouched; the waiver states WHY the work continues anyway.
--   §3  tg_addpet_immutable — refund facts become one-way: refunded_at,
--       stripe_refund_id and waived_at can never be cleared or rewritten, so
--       remediation can never falsify a refund that actually occurred.
--   §4  get_additional_pet_request_for_provider — the reviewer is now the
--       REQUEST-level assignee (assigned_provider_user_id), falling back to
--       the order's provider for legacy rows. The projection additionally
--       carries the clinical context a REASSIGNED reviewer needs (original
--       assessment, currently approved pets, prior decline events) because a
--       reassigned reviewer does not have the base order in their portal.
--       Still no amount, pricing outcome, Stripe identifier or refund field.
--   §5  additional_pet_effective_state — approved pets are returned as an
--       array (approved_added_pets) so the document snapshot can include
--       EVERY approved pet exactly once; a waived-and-honored payment counts
--       as a paid upgrade for tier promotion.
--   §6  admin_reassign_additional_pet_request — the explicit admin action that
--       moves a needs_reassignment request back in front of a chosen provider.
--   §7  admin_waive_additional_pet_refund — the explicit admin action that
--       returns an already-refunded add-on to the review queue as
--       waived/honored (system-error remediation). Never reverses the refund.
--   §8  list_additional_pet_reviews_for_provider — the provider-portal queue
--       for reviews assigned at the REQUEST level.
--
-- The completed base order is never touched by any of this: no write here
-- reaches orders.doctor_*, doctor_earnings, order_documents or
-- order_document_versions.

-- ── §1 · status CHECK gains 'needs_reassignment' ────────────────────────────

alter table public.order_additional_pet_requests
  drop constraint if exists order_additional_pet_requests_status_check;

alter table public.order_additional_pet_requests
  add constraint order_additional_pet_requests_status_check
  check (status in (
    'draft','manual_review_required','payment_required','checkout_created',
    'paid_pending_details','pending_provider_review','clarification_requested',
    'resubmitted','needs_reassignment','approved_pending_document','completed',
    'rejected','refund_pending','refunded','cancelled'));

-- NOTE: uq_addpet_one_active_per_order (partial unique on order_id where
-- status not in ('completed','rejected','refunded','cancelled')) is untouched:
-- 'needs_reassignment' is an ACTIVE state, so a request awaiting reassignment
-- correctly blocks a duplicate request for the same order.

-- ── §2 · waiver columns ─────────────────────────────────────────────────────

alter table public.order_additional_pet_requests
  add column if not exists waived_at   timestamptz,
  add column if not exists waived_by   uuid,
  add column if not exists waived_note text;

comment on column public.order_additional_pet_requests.waived_at is
  'Set by admin_waive_additional_pet_refund when PawTenant honors this add-on '
  'despite a completed refund (system-error remediation). One-way: can never '
  'be cleared. The refund record (refunded_at / stripe_refund_id / '
  'refund_amount_cents) is preserved untouched and stays truthful.';

-- ── §3 · immutability: refund facts and waiver are one-way ─────────────────
-- Base body reproduced from LIVE's own definition; only the three new
-- one-way guards are added.

create or replace function public.tg_addpet_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if new.order_id        is distinct from old.order_id
     or new.service_type    is distinct from old.service_type
     or new.pricing_outcome is distinct from old.pricing_outcome
     or new.amount_cents    is distinct from old.amount_cents
     or new.currency        is distinct from old.currency
     or new.pricing_version is distinct from old.pricing_version
     or new.prior_pet_tier  is distinct from old.prior_pet_tier
     or new.prior_pet_count is distinct from old.prior_pet_count
     or new.target_pet_count is distinct from old.target_pet_count
  then
    raise exception
      'order_additional_pet_requests: pricing and entitlement facts are immutable (request=%)', old.id
      using errcode = 'check_violation';
  end if;

  if new.new_pet is distinct from old.new_pet
     and old.status not in ('draft','payment_required','checkout_created',
                            'paid_pending_details','clarification_requested') then
    raise exception
      'order_additional_pet_requests: the pet snapshot is frozen once the request is under provider review (request=%, status=%)',
      old.id, old.status
      using errcode = 'check_violation';
  end if;

  if old.paid_at is not null and new.paid_at is null then
    raise exception 'order_additional_pet_requests: paid_at cannot be cleared (request=%)', old.id
      using errcode = 'check_violation';
  end if;

  -- ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001: a refund
  -- that actually happened can never be erased or repointed, and a granted
  -- waiver can never be silently withdrawn. Remediation works AROUND the
  -- refund record, never over it.
  if old.refunded_at is not null and new.refunded_at is distinct from old.refunded_at then
    raise exception 'order_additional_pet_requests: refunded_at is immutable once set (request=%)', old.id
      using errcode = 'check_violation';
  end if;

  if old.stripe_refund_id is not null and new.stripe_refund_id is distinct from old.stripe_refund_id then
    raise exception 'order_additional_pet_requests: stripe_refund_id is immutable once set (request=%)', old.id
      using errcode = 'check_violation';
  end if;

  if old.waived_at is not null and new.waived_at is null then
    raise exception 'order_additional_pet_requests: waived_at cannot be cleared (request=%)', old.id
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

-- ── §4 · provider projection: request-level reviewer + clinical context ─────
-- Base body reproduced from LIVE's own definition.

create or replace function public.get_additional_pet_request_for_provider(p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_req      public.order_additional_pet_requests;
  v_ok       boolean;
  v_events   jsonb;
  v_pets     jsonb;
  v_approved jsonb;
  v_order    public.orders;
  v_reviewer uuid;
begin
  select * into v_order from public.orders o where o.id = p_order_id;
  if not found then
    raise exception 'get_additional_pet_request_for_provider: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  -- Authorised viewers: the order's provider, the REQUEST-level assignee of
  -- any request on this order (a reassigned reviewer does not hold the order),
  -- and admin staff.
  select (v_order.doctor_user_id = auth.uid())
      or public.is_admin_staff()
      or exists (select 1 from public.order_additional_pet_requests r
                  where r.order_id = p_order_id
                    and r.assigned_provider_user_id = auth.uid())
    into v_ok;
  if not coalesce(v_ok, false) then
    raise exception 'get_additional_pet_request_for_provider: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_req from public.order_additional_pet_requests
   where order_id = p_order_id
     and status in ('pending_provider_review','clarification_requested',
                    'resubmitted','approved_pending_document','completed','rejected',
                    'refund_pending','refunded')
   order by created_at desc limit 1;
  if not found then return jsonb_build_object('found', false); end if;

  -- The reviewer of record: the request-level assignee, falling back to the
  -- order's provider for legacy rows created before request-level assignment.
  v_reviewer := coalesce(v_req.assigned_provider_user_id, v_order.doctor_user_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', e.event_type, 'actor_role', e.actor_role,
           'detail', e.detail - 'amount_cents' - 'stripe_payment_intent_id'
                            - 'stripe_checkout_session_id' - 'pricing_outcome',
           'created_at', e.created_at) order by e.created_at), '[]'::jsonb)
    into v_events
    from public.order_additional_pet_request_events e
   where e.request_id = v_req.id
     and e.event_type in ('clarification_requested','resubmitted',
                          'submitted_for_review','provider_approved','provider_rejected',
                          'provider_declined','reassigned','refund_waived_honored');

  select (public.additional_pet_effective_state(p_order_id))->'original_pets' into v_pets;

  select coalesce(jsonb_agg(r.new_pet order by r.provider_decision_at), '[]'::jsonb)
    into v_approved
    from public.order_additional_pet_requests r
   where r.order_id = p_order_id
     and r.provider_decision = 'approved'
     and r.status in ('approved_pending_document','completed');

  return jsonb_build_object(
    'found',            true,
    'request_id',       v_req.id,
    'status',           v_req.status,
    'service_type',     v_req.service_type,
    'new_pet',          v_req.new_pet,
    'original_pets',    coalesce(v_pets, '[]'::jsonb),
    'approved_added_pets', v_approved,
    'target_pet_count', v_req.target_pet_count,
    'provider_decision', v_req.provider_decision,
    'provider_decision_reason', v_req.provider_decision_reason,
    'clarification_history', v_events,
    'created_at',       v_req.created_at,
    'is_reviewer',      (auth.uid() is not null and auth.uid() = v_reviewer),
    'confirmation_id',  v_order.confirmation_id,
    -- Clinical context for a REASSIGNED reviewer, who cannot open the base
    -- order in their portal. First name + state + the assessment the customer
    -- submitted. No contact details, no payment fields, no attribution.
    'clinical_context', jsonb_build_object(
      'customer_first_name', v_order.first_name,
      'state', v_order.state,
      'letter_type', v_order.letter_type,
      'assessment_answers', v_order.assessment_answers)
  );
end;
$function$;

-- ── §5 · effective state: approved pets as an array; waiver honors payment ──
-- Base body reproduced from LIVE's own definition.

create or replace function public.additional_pet_effective_state(p_order_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_original   integer;
  v_added      integer;
  v_tier       text;
  v_snapshot   public.order_entitlement_snapshots;
  v_paid_up    boolean;
  v_pets       jsonb;
  v_approved   jsonb;
begin
  select * into v_snapshot from public.order_entitlement_snapshots
   where order_id = p_order_id;

  select case when jsonb_typeof(o.assessment_answers->'pets') = 'array'
              then o.assessment_answers->'pets' else '[]'::jsonb end
    into v_pets
    from public.orders o where o.id = p_order_id;

  v_original := coalesce(v_snapshot.original_purchased_pet_count,
                         jsonb_array_length(coalesce(v_pets, '[]'::jsonb)));

  select count(*) into v_added
    from public.order_additional_pet_requests r
   where r.order_id = p_order_id
     and r.provider_decision = 'approved';

  -- A waived-and-honored add-on (refund already issued because of the retired
  -- auto-refund defect, then explicitly honored by admin) counts as paid: the
  -- customer's entitlement is the thing being honored.
  select exists (
    select 1 from public.order_additional_pet_requests r
     where r.order_id = p_order_id
       and r.pricing_outcome = 'paid_upgrade'
       and r.provider_decision = 'approved'
       and (r.refunded_at is null or r.waived_at is not null)
  ) into v_paid_up;

  -- Every clinically approved additional pet, oldest approval first. This is
  -- the array the document snapshot builder consumes so the revised letter
  -- covers EVERY approved pet exactly once — including additions approved in
  -- earlier revisions, which orders.assessment_answers never contains.
  select coalesce(jsonb_agg(r.new_pet order by r.provider_decision_at), '[]'::jsonb)
    into v_approved
    from public.order_additional_pet_requests r
   where r.order_id = p_order_id
     and r.provider_decision = 'approved'
     and r.status in ('approved_pending_document','completed');

  v_tier := coalesce(v_snapshot.purchased_pet_tier, 'unknown');
  if v_paid_up then v_tier := 'multi'; end if;

  return jsonb_build_object(
    'original_pet_count',  v_original,
    'approved_added',      v_added,
    'effective_pet_count', v_original + v_added,
    'effective_tier',      v_tier,
    'max_total',           public.additional_pet_max_total(),
    'original_pets',       coalesce(v_pets, '[]'::jsonb),
    'approved_added_pets', v_approved
  );
end;
$function$;

-- ── §6 · explicit admin reassignment ────────────────────────────────────────

create or replace function public.admin_reassign_additional_pet_request(
  p_request_id uuid, p_provider_user_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
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

  -- The REQUEST goes back in front of a provider. The completed base order is
  -- untouched: orders.doctor_* stay exactly as they are, no earning is
  -- created, no document changes. The prior decline stays on record in the
  -- append-only events table; only the CURRENT decision columns reset so the
  -- new reviewer can decide.
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
     format('Additional Pet review reassigned to %s. The completed base order, its provider history, payout and documents are unchanged.',
            v_provider.full_name),
     jsonb_build_object('request_id', v_req.id, 'order_id', v_req.order_id,
                        'provider_user_id', p_provider_user_id,
                        'note', nullif(trim(coalesce(p_note, '')), '')));

  insert into public.doctor_notifications
    (doctor_user_id, title, message, type, is_read, confirmation_id, order_id)
  values
    (p_provider_user_id, 'Additional Pet review assigned',
     format('An Additional Pet request on order %s is awaiting your clinical review. Open the Additional Pet Reviews section of your portal.',
            v_order.confirmation_id),
     'case_assigned', false, v_order.confirmation_id, v_order.id);

  return jsonb_build_object('ok', true, 'status', 'pending_provider_review',
                            'assigned_provider_user_id', p_provider_user_id);
end;
$function$;

comment on function public.admin_reassign_additional_pet_request(uuid, uuid, text) is
  'ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001: the explicit '
  'admin action that returns a needs_reassignment add-on to a chosen provider. '
  'Authorises on is_admin_staff(). Never touches the base order, earnings or documents.';

-- ── §7 · explicit admin waiver (system-error remediation) ───────────────────

create or replace function public.admin_waive_additional_pet_refund(
  p_request_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req public.order_additional_pet_requests;
  v_order public.orders;
  v_actor_name text;
begin
  if not public.is_admin_staff() then
    raise exception 'admin_waive_additional_pet_refund: admin only'
      using errcode = 'insufficient_privilege';
  end if;
  if nullif(trim(coalesce(p_note, '')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'note_required');
  end if;

  select * into v_req from public.order_additional_pet_requests
   where id = p_request_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'request_not_found');
  end if;
  if v_req.status <> 'refunded' or v_req.refunded_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_refunded',
                              'status', v_req.status);
  end if;
  if v_req.waived_at is not null then
    -- Idempotent: an already-waived request reports the standing waiver.
    return jsonb_build_object('ok', true, 'already_waived', true,
                              'status', v_req.status);
  end if;

  select * into v_order from public.orders where id = v_req.order_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'order_not_found');
  end if;

  -- The refund stays exactly as it happened (refunded_at / stripe_refund_id /
  -- refund_amount_cents are immutable by trigger). The waiver records that
  -- PawTenant honors the request anyway, and the review returns to the
  -- reassignment queue. No new payment is requested, ever.
  begin
    update public.order_additional_pet_requests
       set waived_at = now(), waived_by = auth.uid(),
           waived_note = trim(p_note),
           status = 'needs_reassignment',
           assigned_provider_user_id = null,
           provider_decision = null,
           provider_decision_at = null,
           provider_decision_reason = null
     where id = p_request_id and status = 'refunded' and waived_at is null;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'error', 'another_request_active');
  end;

  insert into public.order_additional_pet_request_events
    (request_id, order_id, event_type, from_status, to_status, actor_role, actor_id, detail)
  values
    (v_req.id, v_req.order_id, 'refund_waived_honored', 'refunded',
     'needs_reassignment', 'admin', auth.uid(),
     jsonb_build_object('note', trim(p_note)));

  select coalesce(
           (select dp.full_name from public.doctor_profiles dp where dp.user_id = auth.uid()),
           'PawTenant Admin')
    into v_actor_name;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, actor_type, action, object_type, object_id,
     description, metadata)
  values
    (auth.uid(), v_actor_name, 'admin', 'admin', 'additional_pet_refund_waived',
     'order', v_order.confirmation_id,
     'Additional Pet add-on honored by admin waiver despite its completed refund (PawTenant system error). The refund record is preserved and unchanged; no new payment is requested. The review returns to the reassignment queue.',
     jsonb_build_object('request_id', v_req.id, 'order_id', v_req.order_id,
                        'refunded_at', v_req.refunded_at,
                        'stripe_refund_id', v_req.stripe_refund_id,
                        'refund_amount_cents', v_req.refund_amount_cents,
                        'note', trim(p_note)));

  return jsonb_build_object('ok', true, 'status', 'needs_reassignment');
end;
$function$;

comment on function public.admin_waive_additional_pet_refund(uuid, text) is
  'ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001: honors an '
  'already-refunded add-on (system-error remediation). Preserves the refund '
  'record untouched, requires an auditable note, returns the review to the '
  'reassignment queue. Never requests a new payment.';

-- ── §8 · provider-portal queue for request-level assignments ────────────────

create or replace function public.list_additional_pet_reviews_for_provider()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'list_additional_pet_reviews_for_provider: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  -- Safe projection only: no amount, no pricing outcome, no Stripe identifier,
  -- no refund field, no customer contact details.
  select coalesce(jsonb_agg(jsonb_build_object(
           'request_id', r.id,
           'order_id', r.order_id,
           'confirmation_id', o.confirmation_id,
           'status', r.status,
           'service_type', r.service_type,
           'pet_name', r.new_pet->>'name',
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

comment on function public.list_additional_pet_reviews_for_provider() is
  'ADDITIONAL-PET-REJECTION-REASSIGNMENT-AND-DOCUMENT-REVISION-001: the '
  'provider-portal queue of Additional Pet reviews assigned at the REQUEST '
  'level (a reassigned reviewer does not hold the base order). Safe fields only.';

-- ── Grants ──────────────────────────────────────────────────────────────────
-- New functions: revoke from every role BY NAME (revoking "from public" does
-- not touch role grants), then grant execute to authenticated only — each
-- authorises internally (is_admin_staff() / auth.uid()).

revoke all on function public.admin_reassign_additional_pet_request(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_waive_additional_pet_refund(uuid, text)           from public, anon, authenticated;
revoke all on function public.list_additional_pet_reviews_for_provider()              from public, anon, authenticated;

grant execute on function public.admin_reassign_additional_pet_request(uuid, uuid, text) to authenticated;
grant execute on function public.admin_waive_additional_pet_refund(uuid, text)           to authenticated;
grant execute on function public.list_additional_pet_reviews_for_provider()              to authenticated;
