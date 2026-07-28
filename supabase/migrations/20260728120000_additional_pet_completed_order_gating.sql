-- ADDITIONAL-PET-ADMIN-MORE-MENU-AND-COMPLETED-ORDER-GATING-002
--
-- ROOT CAUSE: resolve_additional_pet_pricing — the authoritative eligibility +
-- pricing engine that EVERY surface trusts (customer portal, edge function,
-- Stripe checkout creation, webhook fulfilment) — never checked whether the
-- order had already been completed or clinically locked. Its only blocks were
-- unpaid, refunded/cancelled, an already-active request, max pets, and
-- ambiguous/annual evidence.
--
-- Measured on TEST before this migration (142 paid orders):
--   • 3 orders that are completed / letter-issued returned 'paid_upgrade' —
--     a real $20 Stripe checkout could be created against a finalised
--     evaluation whose letter is already in the customer's hands;
--   • 2 more returned 'included' — a pet would be added to a finalised
--     evaluation for $0, with no provider re-review of the issued document.
--
-- WHY A SINGLE STATUS LABEL IS NOT SAFE: the completion signals dissociate.
-- On TEST there are orders with a MINTED VERIFICATION ID and a SIGNED LETTER
-- whose status is still 'under-review' (doctor_status 'in_review') or
-- 'processing' (doctor_status 'unassigned'). A predicate keyed only on
-- orders.status = 'completed' would leave those published letters mutable.
-- Conversely there are 'completed' orders carrying no document at all.
-- The lock is therefore the UNION of "clinical judgement rendered" and
-- "documentation issued".
--
-- This migration is ADDITIVE + one surgical replace. It changes no pricing, no
-- entitlement rule, creates no provider earning, and mutates no order,
-- document or verification row.

-- ── 1. The shared, server-side mutability predicate ─────────────────────────
-- ONE definition used by the engine, the edge functions and the guards, so
-- Admin and Customer can never disagree about what "completed" means.
create or replace function public.additional_pet_order_locked(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_order    public.orders;
  v_has_lv   boolean;
  v_has_dv   boolean;
  v_signals  text[] := '{}';
  v_reason   text;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('locked', true, 'reason', 'order_not_found', 'signals', v_signals);
  end if;

  select exists (select 1 from public.letter_verifications lv where lv.order_id = p_order_id)
    into v_has_lv;
  select exists (select 1 from public.order_document_versions dv
                  where dv.order_id = p_order_id and dv.is_active)
    into v_has_dv;

  -- Clinical judgement rendered / order closed out.
  if v_order.status = 'completed'                then v_signals := v_signals || 'order_status_completed'::text; end if;
  if v_order.doctor_status = 'patient_notified'  then v_signals := v_signals || 'provider_decision_delivered'::text; end if;
  -- Documentation issued — each of these means a letter exists in the world.
  if v_order.letter_id is not null               then v_signals := v_signals || 'verification_id_issued'::text; end if;
  if v_order.signed_letter_url is not null       then v_signals := v_signals || 'signed_letter_issued'::text; end if;
  if v_has_lv                                    then v_signals := v_signals || 'letter_verification_row'::text; end if;
  if v_has_dv                                    then v_signals := v_signals || 'active_document_version'::text; end if;

  if array_length(v_signals, 1) is null then
    return jsonb_build_object('locked', false, 'reason', null, 'signals', '{}'::text[]);
  end if;

  v_reason := case
    when 'signed_letter_issued'   = any(v_signals)
      or 'verification_id_issued' = any(v_signals)
      or 'letter_verification_row'= any(v_signals)
      or 'active_document_version'= any(v_signals) then 'documents_issued'
    when 'provider_decision_delivered' = any(v_signals) then 'provider_decision_final'
    else 'order_completed'
  end;

  return jsonb_build_object('locked', true, 'reason', v_reason, 'signals', v_signals);
end;
$$;

comment on function public.additional_pet_order_locked is
  'ADDITIONAL-PET-...-GATING-002: THE single server-side predicate for Additional Pet mutability. Locked when clinical judgement is rendered (status completed / provider decision delivered) OR any document artefact has been issued (verification id, signed letter, letter_verifications row, active document version). Status alone is NOT sufficient — TEST holds issued letters on under-review/processing orders.';

-- ── 2. Engine: refuse to price a locked order ───────────────────────────────
-- SURGICAL replace of resolve_additional_pet_pricing. The entire existing gate
-- order and every pricing rule is preserved byte-for-byte; the ONLY change is
-- the completed/locked gate inserted immediately after the reversed check and
-- BEFORE anything that can return an actionable outcome or an amount.
create or replace function public.resolve_additional_pet_pricing(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_order     public.orders;
  v_snap      public.order_entitlement_snapshots;
  v_state     jsonb;
  v_count     integer;
  v_tier      text;
  v_active    public.order_additional_pet_requests;
  v_refunded  boolean;
  v_lock      jsonb;
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'order_not_found', 'amount_cents', 0);
  end if;

  if v_order.payment_intent_id is null and v_order.paid_at is null then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'base_order_unpaid', 'amount_cents', 0,
      'message', 'Adding another pet is unavailable until the original order is paid.');
  end if;

  v_refunded := v_order.status in ('refunded','cancelled')
                or (v_order.refunded_at is not null
                    and coalesce(v_order.refund_status,'') <> 'partial');
  if v_refunded then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'base_order_reversed', 'amount_cents', 0,
      'message', 'Adding another pet is unavailable for a refunded or cancelled order.');
  end if;

  -- ── ADDITIONAL-PET-...-GATING-002: completed / clinically locked ──────────
  -- Placed BEFORE every actionable outcome so a finalised evaluation can never
  -- be priced, charged or mutated. Never returns an amount.
  v_lock := public.additional_pet_order_locked(p_order_id);
  if (v_lock->>'locked')::boolean then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'order_completed', 'amount_cents', 0,
      'lock_reason', v_lock->>'reason',
      'lock_signals', v_lock->'signals',
      'message', 'Additional pets cannot be added after the evaluation is completed. The customer must start a new evaluation with all pets included.');
  end if;

  if lower(coalesce(v_order.letter_type,'')) not in ('esa','psd') then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'service_not_resolvable', 'amount_cents', 0);
  end if;

  select * into v_active from public.order_additional_pet_requests
   where order_id = p_order_id
     and status not in ('completed','rejected','refunded','cancelled')
   limit 1;
  if found then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'request_already_active', 'amount_cents', 0,
      'active_request_id', v_active.id, 'active_status', v_active.status,
      'message', 'A request to add another pet is already in progress for this order.');
  end if;

  select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;
  if not found then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'no_entitlement_snapshot', 'amount_cents', 0,
      'message', 'Adding another pet to this order requires a manual review.');
  end if;

  v_state := public.additional_pet_effective_state(p_order_id);
  v_count := (v_state->>'effective_pet_count')::integer;
  v_tier  := v_state->>'effective_tier';

  if v_count >= public.additional_pet_max_total() then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'max_pets_reached', 'amount_cents', 0,
      'current_pet_count', v_count, 'max_total', public.additional_pet_max_total(),
      'message', 'This order already covers the maximum of 3 pets.');
  end if;

  if v_snap.upgrade_policy <> 'supported' then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', case when v_snap.plan_family = 'annual' then 'annual_plan'
                   else 'unsupported_or_ambiguous' end,
      'amount_cents', 0,
      'current_pet_count', v_count,
      'manual_review_reason', v_snap.manual_review_reason,
      'message', 'Adding another pet to this order requires a manual review.');
  end if;

  if v_tier not in ('single','multi') then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'tier_not_provable', 'amount_cents', 0,
      'current_pet_count', v_count,
      'message', 'Adding another pet to this order requires a manual review.');
  end if;

  if v_tier = 'multi' then
    return jsonb_build_object('eligible', true, 'outcome', 'included',
      'code', 'already_covered', 'amount_cents', 0,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
      'entitlement_snapshot_id', v_snap.id,
      'includes_ra', coalesce(v_snap.includes_ra, false),
      'max_total', public.additional_pet_max_total());
  end if;

  return jsonb_build_object('eligible', true, 'outcome', 'paid_upgrade',
    'code', 'tier_upgrade_required',
    'amount_cents', public.additional_pet_upgrade_cents(),
    'current_pet_count', v_count, 'target_pet_count', v_count + 1,
    'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
    'entitlement_snapshot_id', v_snap.id,
    'includes_ra', coalesce(v_snap.includes_ra, false),
    'max_total', public.additional_pet_max_total());
end;
$$;

comment on function public.resolve_additional_pet_pricing is
  'ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 + GATING-002: THE server-authoritative eligibility + pricing decision. $20 single->multi, $0 for an existing multi tier, manual review for annual/ambiguous, BLOCKED for a completed or clinically locked order (code order_completed). Never prices a manual-review, blocked or completed order.';

-- ── 3. Grants (fail closed) ─────────────────────────────────────────────────
-- Revoke by name from every role: revoking "from public" does NOT undo
-- PostgreSQL's default EXECUTE grant.
revoke all on function public.additional_pet_order_locked(uuid)      from public, anon, authenticated;
revoke all on function public.resolve_additional_pet_pricing(uuid)   from public, anon, authenticated;
