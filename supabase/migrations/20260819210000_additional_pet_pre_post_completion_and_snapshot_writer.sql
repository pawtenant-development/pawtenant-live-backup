-- ADDITIONAL-PET-PRE-POST-COMPLETION-PRICING-001 · 2026-08-19 (P0)
--
-- Owner decisions implemented here:
--   * Pre-completion ESA one-time: today's $129 covers up to TWO pets, so
--     adding a 2nd pet is INCLUDED ($0) and adding the 3rd costs exactly the
--     tier delta $149-$129 = $20. Three pets is the ceiling.
--   * Pre-completion PSD standard one-time: the package covers up to THREE
--     dogs — additions are $0 until the ceiling.
--   * Annual plans keep their existing pricing behaviour (regression list:
--     "annual ESA / annual PSD unchanged").
--   * COMPLETED orders are no longer categorically blocked: below the ceiling
--     an Additional Pet AMENDMENT is offered at the existing $30 fee
--     (additional_pet_current_price(), v2_3000). Payment precedes clinical
--     work; the provider reviews; the revised letter ships as a NEW immutable
--     document version with its OWN verification ID through the existing
--     revision pipeline. The $30 is an amendment service fee, not a tier delta.
--   * Entitlement snapshots reflect PURCHASED rights under the pricing
--     effective AT PURCHASE: ESA $129 paid on/after 2026-08-18 21:37:11Z
--     (the two-pet rollout) entitles up to 2 pets; before that, 1. ESA $149
--     entitles 3. PSD standard entitles 3. The server-issued price quote
--     (order_price_quotes) outranks price+coupon arithmetic as list-price
--     evidence — PT-MT08TGT2 proved why: its recorded coupon was never applied
--     to the charge, so price+coupon reconstructs a $149 list the customer
--     never bought, while its quote says $129 / 2 pets.
--   * The automatic snapshot writer (TEST 20260730120000) ships to LIVE in the
--     same migration; on TEST this section is an idempotent re-apply.
--
-- Everything here is idempotent: re-running the file is a no-op.

-- ── 1. $20 ESA tier-delta price version ─────────────────────────────────────
-- Pair-validated by tg_addpet_price_version_valid (existence only). Both
-- timestamps sit in the past so additional_pet_current_price() NEVER selects
-- it — the current price (and the post-completion amendment fee) stays v2_3000.
insert into public.additional_pet_price_versions
  (pricing_version, amount_cents, currency, effective_from, superseded_at, note)
values
  ('esa_tier_delta_2000', 2000, 'usd',
   timestamptz '2026-08-19 00:00:00+00', timestamptz '2026-08-19 00:00:01+00',
   'ESA pre-completion tier delta ($149-$129): third pet on an up-to-two entitlement. Superseded at birth on purpose: the request trigger validates the (version, amount) pair only, and this row must never become the generic current price.')
on conflict (pricing_version) do nothing;

-- ── 2. Request phase ────────────────────────────────────────────────────────
-- Distinguishes a pre-completion upgrade from a post-completion amendment.
-- The stripe-webhook locked-order race branch keys on this: a payment landing
-- on a LOCKED parent is only suspicious for a pre_completion request — for an
-- amendment, locked is the expected state.
alter table public.order_additional_pet_requests
  add column if not exists phase text not null default 'pre_completion'
    constraint ck_addpet_phase check (phase in ('pre_completion','post_completion'));

-- ── 3. Era- and quote-aware classifier ──────────────────────────────────────
-- 12-arg primary. NO parameter defaults — defaults would make a 9-arg call
-- ambiguous against the legacy wrapper below.
create or replace function public.classify_order_entitlement(
  p_package_key text, p_billing_plan text, p_letter_type text, p_plan_type text,
  p_price integer, p_coupon_discount integer, p_includes_ra boolean,
  p_pet_count integer, p_subscription_id text,
  p_paid_at timestamptz, p_quoted_list_usd integer, p_quoted_pet_count integer
) returns jsonb
 language plpgsql immutable
 set search_path to 'public'
as $function$
declare
  v_service   text;
  v_plan      text;
  v_family    text := 'unknown';
  v_tier      text := 'unknown';
  v_limit     integer;
  v_version   text := 'unknown';
  v_source    text;
  v_conf      text;
  v_policy    text;
  v_reason    text;
  v_code      text;
  v_list      integer;
  v_pets      integer := coalesce(p_pet_count, 0);
  -- ESA-TWO-PET-129-PRICING-001 went live 2026-08-18 21:37:11Z. A NULL paid_at
  -- (a caller without payment context) is classified under CURRENT rules —
  -- every persisted snapshot path supplies the real timestamp via the view.
  v_two_pet_era boolean := (p_paid_at is null or p_paid_at >= timestamptz '2026-08-18 21:37:11+00');
begin
  -- Service ---------------------------------------------------------------
  v_service := lower(coalesce(p_letter_type,''));
  if v_service not in ('esa','psd') then v_service := 'unknown'; end if;

  -- Plan ------------------------------------------------------------------
  v_plan := case
    when p_billing_plan in ('one_time','annual') then p_billing_plan
    when p_plan_type ilike 'One-Time%'            then 'one_time'
    when p_plan_type ilike 'Subscription%'        then 'annual'
    when p_subscription_id is not null            then 'annual'
    else 'one_time'
  end;

  -- List price: the SERVER-ISSUED quote outranks price+coupon arithmetic.
  -- orders.coupon_discount can record a discount the charge never contained
  -- (PT-MT08TGT2), which inflates the reconstructed list price by exactly the
  -- phantom discount. A trusted quote is the amount the server actually
  -- decided to charge before discounts — purchased-rights evidence, rank 2.
  v_list := coalesce(p_quoted_list_usd, coalesce(p_price,0) + coalesce(p_coupon_discount,0));

  -- 1/2. Exact package key -------------------------------------------------
  if p_package_key in ('esa_ra_bundle','psd_ra_bundle') then
    v_family  := 'ra_bundle';
    v_tier    := 'multi';
    v_limit   := 3;
    v_version := 'combo_flat';
    v_source  := 'orders.package_key';
    v_conf    := 'exact_package_key';

  elsif p_package_key in ('esa_standard','psd_standard') then
    v_family  := 'standard';
    v_source  := 'orders.package_key';
    if v_plan = 'one_time' and v_list = 129 then
      v_conf := 'exact_package_key';
      if v_service = 'psd' then
        -- OWNER 2026-08-19: PSD standard entitles up to three dogs.
        v_tier := 'single'; v_limit := 3; v_version := 'psd_upto3_2026_08';
      elsif v_two_pet_era then
        v_tier := 'single'; v_limit := 2; v_version := 'esa_two_pet_2026_08';
      else
        v_tier := 'single'; v_limit := 1; v_version := 'current_2026_07';
      end if;
    elsif v_plan = 'one_time' and v_list = 149 then
      v_conf := 'exact_package_key';
      if v_service = 'psd' then
        v_tier := 'multi'; v_limit := 3; v_version := 'psd_upto3_2026_08';
      else
        v_tier := 'multi'; v_limit := 3; v_version := 'current_2026_07';
      end if;
    elsif v_plan = 'annual' and v_list = 115 then
      v_tier := 'single'; v_limit := 1; v_version := 'phased_2026_07';
      v_conf := 'exact_package_key';
    elsif v_plan = 'annual' and v_list = 135 then
      v_tier := 'multi';  v_limit := 3; v_version := 'phased_2026_07';
      v_conf := 'exact_package_key';
    else
      v_source  := 'orders.package_key + registered_pet_count';
      v_conf    := 'inferred_existing_package';
      v_version := 'unknown_price_era';
      if v_pets = 1 then
        v_tier := 'single'; v_limit := case when v_service = 'psd' then 3 else 1 end;
      elsif v_pets between 2 and 3 then
        v_tier := 'multi';  v_limit := 3;
      else
        v_tier := 'unknown'; v_limit := null;
        v_conf := 'ambiguous_manual_review';
        v_code := 'conflicting_pet_count';
        v_reason := format(
          'known package but registered pet count (%s) is outside 1-3 and list price $%s matches no canonical tier',
          coalesce(p_pet_count::text,'none'), v_list);
      end if;
    end if;

  -- 3. Deterministic historical list price --------------------------------
  elsif p_package_key is null and v_service in ('esa','psd') and v_plan = 'one_time' then
    v_source := 'historical_list_price(one_time)';
    v_conf   := 'deterministic_historical_price';
    case
      when v_service = 'esa' and v_list = 110 then
        v_tier := 'single'; v_limit := 1; v_version := 'per_pet_2025';
      when v_service = 'esa' and v_list = 135 then
        v_tier := 'multi';  v_limit := 2; v_version := 'per_pet_2025';
      when v_service = 'esa' and v_list = 160 then
        v_tier := 'multi';  v_limit := 3; v_version := 'per_pet_2025';
      when v_list = 145 then
        v_tier := 'multi';  v_limit := 3; v_version := 'fixed_total_2026_07';
      when v_service = 'psd' and v_list = 139 then
        v_tier := 'multi';  v_limit := 3; v_version := 'psd_flat_2026_07';
      when v_list = 129 then
        if v_service = 'psd' then
          v_tier := 'single'; v_limit := 3; v_version := 'psd_upto3_2026_08';
        elsif v_two_pet_era then
          v_tier := 'single'; v_limit := 2; v_version := 'esa_two_pet_2026_08';
        else
          v_tier := 'single'; v_limit := 1; v_version := 'current_2026_07';
        end if;
      when v_list = 149 then
        v_tier := 'multi';  v_limit := 3; v_version := 'current_2026_07';
      when v_list = 179 then
        v_family := 'ra_bundle';
        v_tier := 'multi';  v_limit := 3; v_version := 'combo_flat';
      else
        v_source  := 'registered_pet_count(one_time, price era unmatched)';
        v_conf    := 'inferred_registered_pet_count';
        v_version := 'unknown_price_era';
        if v_pets = 1 then
          v_tier := 'single'; v_limit := case when v_service = 'psd' then 3 else 1 end;
        elsif v_pets between 2 and 3 then
          v_tier := 'multi';  v_limit := 3;
        else
          v_tier := 'unknown'; v_limit := null;
          v_conf := 'ambiguous_manual_review';
          v_code := 'legacy_package_unknown';
          v_reason := format(
            'one-time list price $%s matches no canonical era and no usable registered pet count (%s)',
            v_list, coalesce(p_pet_count::text,'none'));
        end if;
    end case;
    if v_family = 'unknown' and v_conf <> 'ambiguous_manual_review' then
      v_family := 'standard';
    end if;

  elsif p_package_key is null and v_service in ('esa','psd') and v_plan = 'annual' then
    v_source := 'historical_list_price(annual)';
    v_conf   := 'deterministic_historical_price';
    case
      when v_list = 99  then v_tier := 'single'; v_limit := 1; v_version := 'per_pet_2025_annual';
      when v_list = 119 then v_tier := 'multi';  v_limit := 2; v_version := 'per_pet_2025_annual';
      when v_list = 139 then v_tier := 'multi';  v_limit := 3; v_version := 'per_pet_2025_annual';
      when v_list = 115 then v_tier := 'single'; v_limit := 1; v_version := 'phased_2026_07';
      when v_list = 135 then v_tier := 'multi';  v_limit := 3; v_version := 'phased_2026_07';
      when v_list = 159 then
        v_family := 'ra_bundle';
        v_tier := 'multi'; v_limit := 3; v_version := 'combo_flat';
      else
        v_source  := 'registered_pet_count(annual, price era unmatched)';
        v_conf    := 'inferred_registered_pet_count';
        v_version := 'unknown_price_era';
        if v_pets = 1 then
          v_tier := 'single'; v_limit := case when v_service = 'psd' then 3 else 1 end;
        elsif v_pets between 2 and 3 then
          v_tier := 'multi';  v_limit := 3;
        else
          v_tier := 'unknown'; v_limit := null;
          v_conf := 'ambiguous_manual_review';
          v_code := 'legacy_package_unknown';
          v_reason := format(
            'annual list price $%s matches no canonical era and no usable registered pet count (%s)',
            v_list, coalesce(p_pet_count::text,'none'));
        end if;
    end case;
    if v_family = 'unknown' and v_conf <> 'ambiguous_manual_review' then
      v_family := 'standard';
    end if;

  else
    v_conf   := 'ambiguous_manual_review';
    v_source := 'none';
    v_code   := 'service_not_resolvable';
    v_reason := 'service type not resolvable from orders.letter_type';
  end if;

  -- Quote provenance is part of the evidence trail.
  if p_quoted_list_usd is not null and v_source is not null then
    v_source := v_source || ' + server_price_quote';
  end if;

  -- Contradiction guard ----------------------------------------------------
  if v_limit is not null and v_pets > v_limit then
    v_reason := format(
      'registered pet count %s exceeds derived limit %s (%s) — evidence contradicts itself',
      p_pet_count, v_limit, v_version);
    v_conf  := 'ambiguous_manual_review';
    v_code  := 'conflicting_pet_count';
    v_tier  := 'unknown';
    v_limit := null;
  end if;

  -- Upgrade policy ---------------------------------------------------------
  v_policy := case
    when v_conf = 'ambiguous_manual_review' then 'manual_review_required'
    else 'supported'
  end;
  if v_policy = 'manual_review_required' then
    v_code   := coalesce(v_code, 'legacy_package_unknown');
    v_reason := coalesce(v_reason, 'entitlement could not be reconstructed deterministically');
  else
    v_code   := null;
    v_reason := null;
  end if;

  return jsonb_build_object(
    'service_type',                 v_service,
    'plan_family',                  v_plan,
    'package_family',               v_family,
    'purchased_pet_tier',           v_tier,
    'purchased_pet_limit',          v_limit,
    'original_purchased_pet_count', coalesce(p_quoted_pet_count, p_pet_count),
    'includes_ra',                  coalesce(p_includes_ra, v_family = 'ra_bundle'),
    'pricing_version',              v_version,
    'evidence_source',              v_source,
    'evidence_confidence',          v_conf,
    'upgrade_policy',               v_policy,
    'manual_review_reason',         v_reason,
    'manual_review_code',           v_code,
    'evidence_detail', jsonb_build_object(
      'list_price_usd',      v_list,
      'charged_price_usd',   p_price,
      'coupon_discount_usd', coalesce(p_coupon_discount,0),
      'package_key',         p_package_key,
      'billing_plan',        p_billing_plan,
      'plan_type_legacy',    p_plan_type,
      'registered_pet_count', p_pet_count,
      'quoted_list_usd',     p_quoted_list_usd,
      'quoted_pet_count',    p_quoted_pet_count,
      'paid_at',             p_paid_at,
      'two_pet_era',         v_two_pet_era)
  );
end;
$function$;

revoke all on function public.classify_order_entitlement(text,text,text,text,integer,integer,boolean,integer,text,timestamptz,integer,integer)
  from public, anon, authenticated;
grant execute on function public.classify_order_entitlement(text,text,text,text,integer,integer,boolean,integer,text,timestamptz,integer,integer)
  to service_role;

-- Legacy 9-arg signature stays as a thin delegate so any existing caller keeps
-- working, classified under CURRENT rules (no payment context available).
create or replace function public.classify_order_entitlement(
  p_package_key text, p_billing_plan text, p_letter_type text, p_plan_type text,
  p_price integer, p_coupon_discount integer, p_includes_ra boolean,
  p_pet_count integer, p_subscription_id text
) returns jsonb
 language sql immutable
 set search_path to 'public'
as $function$
  select public.classify_order_entitlement(
    p_package_key, p_billing_plan, p_letter_type, p_plan_type, p_price,
    p_coupon_discount, p_includes_ra, p_pet_count, p_subscription_id,
    null::timestamptz, null::integer, null::integer)
$function$;

-- ── 4. Classification view: feed payment context + quote evidence ───────────
create or replace view public.order_entitlement_classification_v
  with (security_invoker = true) as
select o.id as order_id,
       o.payment_intent_id,
       public.classify_order_entitlement(
         o.package_key, o.billing_plan, o.letter_type, o.plan_type,
         o.price, o.coupon_discount, o.includes_reasonable_accommodation_letter,
         case when jsonb_typeof(o.assessment_answers->'pets') = 'array'
              then jsonb_array_length(o.assessment_answers->'pets') else null end,
         o.subscription_id,
         o.paid_at,
         q.list_usd,
         q.pet_count) as c
from public.orders o
left join lateral (
  -- The last server-issued quote at/before payment is the base the server
  -- actually decided to charge (pre-discount) — list-price evidence rank 2.
  select (q0.amount_cents / 100)::integer as list_usd, q0.pet_count
    from public.order_price_quotes q0
   where q0.order_id = o.id
     and q0.issued_at <= coalesce(o.paid_at, now())
   order by q0.issued_at desc
   limit 1
) q on true
where o.paid_at is not null;

-- ── 5. Resolver: pre/post-completion pricing ────────────────────────────────
create or replace function public.resolve_additional_pet_pricing(p_order_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_order public.orders; v_snap public.order_entitlement_snapshots;
  v_state jsonb; v_count integer; v_tier text;
  v_active public.order_additional_pet_requests;
  v_refunded boolean; v_lock jsonb; v_locked boolean;
  v_phase text;
  v_entitled integer;
  v_service text; v_plan text;
  v_ovr public.order_additional_pet_eligibility_overrides;
  v_max integer := public.additional_pet_max_total();
  v_price jsonb := public.additional_pet_current_price();
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

  -- A PARTIAL refund leaves the order active and is deliberately NOT a block.
  v_refunded := v_order.status in ('refunded','cancelled')
                or (v_order.refunded_at is not null
                    and coalesce(v_order.refund_status,'') <> 'partial');
  if v_refunded then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'base_order_reversed', 'amount_cents', 0,
      'message', 'Adding another pet is unavailable for a refunded or cancelled order.');
  end if;

  -- An open dispute freezes amendments until it settles in our favour.
  if v_order.dispute_id is not null
     and coalesce(v_order.dispute_status,'') in
         ('needs_response','warning_needs_response','under_review','lost') then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'base_order_disputed', 'amount_cents', 0,
      'message', 'Adding another pet is unavailable while a payment dispute is open on this order.');
  end if;

  -- PARTNER SEGREGATION: partner-origin orders never enter the retail
  -- Additional Pet workflow (their documents are partner-neutral and must not
  -- acquire PawTenant retail amendments, pricing or QR artefacts). Read via
  -- to_jsonb so environments whose orders table predates order_origin resolve
  -- to NULL -> 'direct' instead of failing to compile.
  if coalesce(to_jsonb(v_order)->>'order_origin', 'direct') <> 'direct' then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'partner_origin_not_supported', 'amount_cents', 0,
      'message', 'Additional Pet changes for partner orders are handled through the partner, not the retail workflow.');
  end if;

  -- COMPLETION IS A PHASE, NOT A WALL (owner decision 2026-08-19). A finalised
  -- order below the pet ceiling takes the paid AMENDMENT path: the existing
  -- $30 amendment fee, payment before clinical work, provider review, and a
  -- REVISED letter as a new immutable document version with its own
  -- verification ID. The original letter is never modified.
  v_lock := public.additional_pet_order_locked(p_order_id);
  v_locked := coalesce((v_lock->>'locked')::boolean, false);
  v_phase := case when v_locked then 'post_completion' else 'pre_completion' end;

  if lower(coalesce(v_order.letter_type,'')) not in ('esa','psd') then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'service_not_resolvable', 'amount_cents', 0, 'phase', v_phase,
      'manual_review_code', 'service_not_resolvable',
      'manual_review_reason', 'The service type on this order is not ESA or PSD.',
      'message', 'We need to review this order before another pet can be added.');
  end if;
  v_service := lower(v_order.letter_type);

  -- ── ACTIVE REQUEST → RESUME AT ITS QUOTED PRICE ───────────────────────────
  select * into v_active from public.order_additional_pet_requests
   where order_id = p_order_id
     and status not in ('completed','rejected','refunded','cancelled')
   limit 1;
  if found then
    return jsonb_build_object(
      'eligible', false,
      'outcome', 'resume_payment',
      'code', 'resume_existing_request',
      'phase', coalesce(v_active.phase, v_phase),
      'amount_cents', v_active.amount_cents,
      'currency', v_active.currency,
      'pricing_version', v_active.pricing_version,
      'grandfathered', (v_active.pricing_outcome = 'paid_upgrade'
                        and v_active.pricing_version not in ('esa_tier_delta_2000')
                        and v_active.pricing_version is distinct from (v_price->>'pricing_version')),
      'current_price_cents', (v_price->>'amount_cents')::integer,
      'active_request_id', v_active.id,
      'active_status', v_active.status,
      'active_outcome', v_active.pricing_outcome,
      'awaiting_payment', (v_active.pricing_outcome = 'paid_upgrade' and v_active.paid_at is null),
      'message', 'A request to add another pet is already in progress for this order.');
  end if;

  v_state := public.additional_pet_effective_state(p_order_id);
  v_count := (v_state->>'effective_pet_count')::integer;
  v_tier  := v_state->>'effective_tier';

  if v_count >= v_max then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'max_pets_reached', 'amount_cents', 0, 'phase', v_phase,
      'current_pet_count', v_count, 'max_total', v_max,
      'message', format('This order already covers the maximum of %s pets.', v_max));
  end if;

  select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;

  select * into v_ovr from public.order_additional_pet_eligibility_overrides
   where order_id = p_order_id;
  if found then
    if v_ovr.resolution = 'blocked' then
      return jsonb_build_object('eligible', false, 'outcome', 'blocked',
        'code', 'admin_blocked', 'amount_cents', 0, 'phase', v_phase,
        'current_pet_count', v_count,
        'resolved_by_admin', true, 'resolved_at', v_ovr.resolved_at,
        'message', coalesce(nullif(v_ovr.resolution_note,''),
          'Adding another pet is not available for this order.'));
    end if;
    return jsonb_build_object('eligible', true, 'outcome', v_ovr.resolution,
      'code', case when v_ovr.resolution = 'paid_upgrade'
                   then 'admin_resolved_paid_upgrade' else 'admin_resolved_included' end,
      'amount_cents', case when v_ovr.resolution = 'paid_upgrade'
                           then (v_price->>'amount_cents')::integer else 0 end,
      'currency', 'usd', 'phase', v_phase,
      'pricing_version', case when v_ovr.resolution = 'paid_upgrade'
                              then v_price->>'pricing_version' else null end,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', v_service,
      'entitlement_snapshot_id', v_snap.id,
      'purchased_pet_limit', v_snap.purchased_pet_limit,
      'evidence_source', v_snap.evidence_source,
      'includes_ra', coalesce(v_snap.includes_ra, false), 'max_total', v_max,
      'resolved_by_admin', true, 'resolved_at', v_ovr.resolved_at);
  end if;

  -- ── POST-COMPLETION AMENDMENT ─────────────────────────────────────────────
  -- Flat $30 service fee below the ceiling. Entitlement math is deliberately
  -- NOT consulted: the fee covers re-review and a revised document, not a
  -- package-tier difference, so a missing snapshot never dead-ends the path.
  if v_phase = 'post_completion' then
    return jsonb_build_object('eligible', true, 'outcome', 'paid_upgrade',
      'code', 'post_completion_amendment', 'amendment', true,
      'amount_cents', (v_price->>'amount_cents')::integer,
      'currency', v_price->>'currency',
      'pricing_version', v_price->>'pricing_version',
      'phase', v_phase,
      'lock_reason', v_lock->>'reason', 'lock_signals', v_lock->'signals',
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', v_service,
      'entitlement_snapshot_id', v_snap.id,
      'purchased_pet_limit', v_snap.purchased_pet_limit,
      'evidence_source', coalesce(v_snap.evidence_source, 'amendment_fee_flat'),
      'includes_ra', coalesce(v_snap.includes_ra, false), 'max_total', v_max,
      'message', 'The evaluation is already completed. Another pet can be added as a paid amendment: after payment and provider approval, a revised letter is issued as a new version. The original letter is preserved.');
  end if;

  -- ── PRE-COMPLETION ────────────────────────────────────────────────────────
  if v_snap.id is null then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'entitlement_snapshot_missing', 'amount_cents', 0, 'phase', v_phase,
      'current_pet_count', v_count,
      'manual_review_code', 'entitlement_snapshot_missing',
      'manual_review_reason', 'No purchased-entitlement snapshot exists for this order.',
      'message', 'We need to review this order before another pet can be added.');
  end if;

  if v_snap.upgrade_policy <> 'supported' then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', coalesce(v_snap.manual_review_code, 'legacy_package_unknown'),
      'amount_cents', 0, 'phase', v_phase, 'current_pet_count', v_count,
      'manual_review_code', coalesce(v_snap.manual_review_code, 'legacy_package_unknown'),
      'manual_review_reason', v_snap.manual_review_reason,
      'message', 'We need to review this order before another pet can be added.');
  end if;

  if v_snap.purchased_pet_limit is null or v_tier not in ('single','multi') then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'tier_not_provable', 'amount_cents', 0, 'phase', v_phase,
      'current_pet_count', v_count,
      'manual_review_code', 'tier_not_provable',
      'manual_review_reason', 'The purchased pet tier could not be proven for this order.',
      'message', 'We need to review this order before another pet can be added.');
  end if;

  -- What the purchase covers TODAY:
  --   ESA one-time — today's $129 spans 1-2 pets, so every standard purchase
  --     covers at least two; $149/multi covers three.
  --   PSD one-time — up to three dogs (owner decision).
  --   Annual plans — unchanged: single covers its limit, multi covers the max.
  v_plan := coalesce(v_snap.plan_family, 'one_time');
  if v_service = 'esa' and v_plan = 'one_time' then
    v_entitled := greatest(v_snap.purchased_pet_limit, 2);
  elsif v_service = 'psd' and v_plan = 'one_time' then
    v_entitled := v_max;
  elsif v_tier = 'multi' then
    v_entitled := v_max;
  else
    v_entitled := v_snap.purchased_pet_limit;
  end if;
  v_entitled := least(v_entitled, v_max);

  if v_count + 1 <= v_entitled then
    return jsonb_build_object('eligible', true, 'outcome', 'included',
      'code', 'within_entitlement', 'amount_cents', 0, 'currency', 'usd',
      'pricing_version', null, 'phase', v_phase,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', v_service,
      'entitlement_snapshot_id', v_snap.id,
      'purchased_pet_limit', v_snap.purchased_pet_limit,
      'entitled_pet_limit', v_entitled,
      'evidence_source', v_snap.evidence_source,
      'includes_ra', coalesce(v_snap.includes_ra, false), 'max_total', v_max);
  end if;

  -- Beyond the entitlement, before completion: ESA one-time pays the exact
  -- tier delta ($149-$129 = $20). Everything else keeps the current price.
  if v_service = 'esa' and v_plan = 'one_time' then
    return jsonb_build_object('eligible', true, 'outcome', 'paid_upgrade',
      'code', 'tier_upgrade_required',
      'amount_cents', 2000, 'currency', 'usd',
      'pricing_version', 'esa_tier_delta_2000', 'phase', v_phase,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', v_service,
      'entitlement_snapshot_id', v_snap.id,
      'purchased_pet_limit', v_snap.purchased_pet_limit,
      'entitled_pet_limit', v_entitled,
      'evidence_source', v_snap.evidence_source,
      'includes_ra', coalesce(v_snap.includes_ra, false), 'max_total', v_max);
  end if;

  return jsonb_build_object('eligible', true, 'outcome', 'paid_upgrade',
    'code', 'tier_upgrade_required',
    'amount_cents', (v_price->>'amount_cents')::integer,
    'currency', v_price->>'currency',
    'pricing_version', v_price->>'pricing_version', 'phase', v_phase,
    'current_pet_count', v_count, 'target_pet_count', v_count + 1,
    'prior_pet_tier', v_tier, 'service_type', v_service,
    'entitlement_snapshot_id', v_snap.id,
    'purchased_pet_limit', v_snap.purchased_pet_limit,
    'entitled_pet_limit', v_entitled,
    'evidence_source', v_snap.evidence_source,
    'includes_ra', coalesce(v_snap.includes_ra, false), 'max_total', v_max);
end;
$function$;

revoke all on function public.resolve_additional_pet_pricing(uuid)
  from public, anon, authenticated;
grant execute on function public.resolve_additional_pet_pricing(uuid) to service_role;

-- ── 6. Automatic snapshot writer (port of TEST 20260730120000) ──────────────
-- Byte-for-byte the TEST writer; idempotent on TEST, first install on LIVE.
create or replace function public.ensure_order_entitlement_snapshot(
  p_order_id       uuid,
  p_snapshot_source text default 'payment_transition',
  p_event_ref      text default null
) returns jsonb
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_order    record;
  v_c        jsonb;
  v_snap_id  uuid;
  v_existing record;
  v_policy   text;
  v_source   text := coalesce(nullif(trim(p_snapshot_source), ''), 'payment_transition');
begin
  if p_order_id is null then
    return jsonb_build_object('result', 'error', 'code', 'order_id_required');
  end if;

  select id, confirmation_id, paid_at, payment_intent_id, refunded_at
    into v_order
    from public.orders
   where id = p_order_id;

  if not found then
    return jsonb_build_object('result', 'error', 'code', 'order_not_found',
                              'order_id', p_order_id);
  end if;

  if v_order.paid_at is null then
    return jsonb_build_object('result', 'skipped', 'code', 'order_not_paid',
                              'order_id', p_order_id);
  end if;

  select * into v_existing
    from public.order_entitlement_snapshots
   where order_id = p_order_id;
  if found then
    return jsonb_build_object(
      'result', 'existing', 'order_id', p_order_id,
      'snapshot_id', v_existing.id, 'upgrade_policy', v_existing.upgrade_policy,
      'revision', v_existing.revision, 'snapshot_source', v_existing.snapshot_source);
  end if;

  select c into v_c
    from public.order_entitlement_classification_v
   where order_id = p_order_id;

  if v_c is null then
    return jsonb_build_object('result', 'error', 'code', 'classification_unavailable',
                              'order_id', p_order_id);
  end if;

  v_policy := v_c->>'upgrade_policy';

  insert into public.order_entitlement_snapshots (
    order_id, service_type, plan_family, package_family,
    purchased_pet_tier, purchased_pet_limit, original_purchased_pet_count,
    includes_ra, pricing_version, evidence_source, evidence_confidence,
    evidence_detail, stripe_payment_intent_id,
    upgrade_policy, manual_review_reason, manual_review_code, snapshot_source
  ) values (
    p_order_id,
    v_c->>'service_type', v_c->>'plan_family', v_c->>'package_family',
    v_c->>'purchased_pet_tier',
    nullif(v_c->>'purchased_pet_limit', '')::integer,
    nullif(v_c->>'original_purchased_pet_count', '')::integer,
    (v_c->>'includes_ra')::boolean,
    v_c->>'pricing_version', v_c->>'evidence_source', v_c->>'evidence_confidence',
    coalesce(v_c->'evidence_detail', '{}'::jsonb), v_order.payment_intent_id,
    v_policy, v_c->>'manual_review_reason', v_c->>'manual_review_code', v_source
  )
  on conflict (order_id) do nothing
  returning id into v_snap_id;

  if v_snap_id is null then
    select * into v_existing
      from public.order_entitlement_snapshots
     where order_id = p_order_id;
    return jsonb_build_object(
      'result', 'existing', 'code', 'concurrent_insert', 'order_id', p_order_id,
      'snapshot_id', v_existing.id, 'upgrade_policy', v_existing.upgrade_policy,
      'revision', v_existing.revision, 'snapshot_source', v_existing.snapshot_source);
  end if;

  insert into public.audit_logs (
    action, object_type, object_id, order_id, actor_name, actor_type,
    category, source, description, metadata
  ) values (
    'order_entitlement_snapshot_created', 'order', v_order.confirmation_id, p_order_id,
    'PawTenant System', 'system', 'entitlement', v_source,
    format('Entitlement snapshot created automatically at the paid-order transition (%s)',
           v_policy),
    jsonb_build_object(
      'snapshot_id', v_snap_id,
      'confirmation_id', v_order.confirmation_id,
      'service_type', v_c->>'service_type',
      'plan_family', v_c->>'plan_family',
      'package_family', v_c->>'package_family',
      'purchased_pet_tier', v_c->>'purchased_pet_tier',
      'purchased_pet_limit', v_c->>'purchased_pet_limit',
      'upgrade_policy', v_policy,
      'evidence_source', v_c->>'evidence_source',
      'evidence_confidence', v_c->>'evidence_confidence',
      'manual_review_code', v_c->>'manual_review_code',
      'pricing_version', v_c->>'pricing_version',
      'snapshot_source', v_source,
      'payment_event_ref', p_event_ref,
      'created_at', now())
  );

  return jsonb_build_object(
    'result', case when v_policy = 'supported' then 'created'
                   else 'manual_review_required' end,
    'created', true, 'order_id', p_order_id, 'snapshot_id', v_snap_id,
    'upgrade_policy', v_policy,
    'evidence_confidence', v_c->>'evidence_confidence',
    'manual_review_code', v_c->>'manual_review_code',
    'snapshot_source', v_source);

exception when others then
  begin
    insert into public.audit_logs (
      action, object_type, object_id, order_id, actor_name, actor_type,
      category, source, description, metadata
    ) values (
      'order_entitlement_snapshot_failed', 'order', v_order.confirmation_id, p_order_id,
      'PawTenant System', 'system', 'entitlement', v_source,
      'Automatic entitlement snapshot creation FAILED — order remains paid and unclassified',
      jsonb_build_object(
        'confirmation_id', v_order.confirmation_id,
        'payment_intent_id', v_order.payment_intent_id,
        'classifier_result', v_c,
        'failure_sqlstate', sqlstate,
        'failure_reason', sqlerrm,
        'snapshot_source', v_source,
        'payment_event_ref', p_event_ref,
        'failed_at', now()));
  exception when others then null;
  end;
  return jsonb_build_object('result', 'error', 'code', 'snapshot_write_failed',
                            'order_id', p_order_id, 'sqlstate', sqlstate);
end;
$function$;

revoke all on function public.ensure_order_entitlement_snapshot(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.ensure_order_entitlement_snapshot(uuid, text, text)
  to service_role;

create or replace function public.tg_orders_entitlement_snapshot()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_res jsonb;
begin
  begin
    v_res := public.ensure_order_entitlement_snapshot(
               new.id, 'payment_transition', 'orders.paid_at');
    if coalesce(v_res->>'result', 'error') = 'error' then
      raise warning '[entitlement-snapshot] order % paid but snapshot not created: %',
        new.id, v_res;
    end if;
  exception when others then
    raise warning '[entitlement-snapshot] order % paid but snapshot writer raised %: %',
      new.id, sqlstate, sqlerrm;
  end;
  return null;
end;
$function$;

revoke all on function public.tg_orders_entitlement_snapshot()
  from public, anon, authenticated;

drop trigger if exists orders_entitlement_snapshot_on_paid on public.orders;
create trigger orders_entitlement_snapshot_on_paid
  after update on public.orders
  for each row
  when (old.paid_at is null and new.paid_at is not null)
  execute function public.tg_orders_entitlement_snapshot();
