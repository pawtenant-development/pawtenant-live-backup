-- ADDITIONAL-PET-ADMIN-MORE-MENU-AND-COMPLETED-ORDER-GATING-002 (owner correction)
--
-- ROOT CAUSE (measured on TEST, 50 open / clinically-mutable paid orders):
--
--   outcome         code                      n
--   --------------- ------------------------- --
--   paid_upgrade    tier_upgrade_required     19
--   manual_review   unsupported_or_ambiguous  12
--   manual_review   annual_plan               10
--   included        already_covered            5
--   blocked         max_pets_reached           3
--   manual_review   no_entitlement_snapshot    1
--
-- 23 of 50 (46%) open orders were manual review. Manual review was acting as a
-- CATCH-ALL, not an exception. The completion lock was NOT the cause — every one
-- of those 23 returned locked=false. The two decisions the owner requires to be
-- separate (mutability vs entitlement) were already separate; the defect is
-- entirely inside ENTITLEMENT classification. Two distinct bugs:
--
--   BUG 1 — asymmetric pet-count inference (12 orders).
--     classify_order_entitlement resolves tier from the FROZEN registered pet
--     count in the `esa_standard` / `psd_standard` package_key branch
--     (confidence 'inferred_existing_package', policy 'supported'), but in the
--     null-package_key historical-price branch it demotes straight to
--     'ambiguous_manual_review' the moment the list price matches no hardcoded
--     era. Same evidence, opposite verdict. Observed unmatched list prices on
--     TEST: $57, $80, $82, $90, $100, $109, $110, $120, $159 — ordinary paid
--     one-pet ESA/PSD orders sitting in a dead end.
--     Registered pet count is INDEPENDENT, non-price evidence: checkout prices
--     BY pet count, the count is frozen in original_purchased_pet_count, and
--     this feature never writes to assessment_answers->'pets'. Inferring from it
--     errs revenue-POSITIVE (10 of the 12 become $20, not $0).
--
--   BUG 2 — plan_family fell to 'unknown' with no subscription evidence.
--     An order with billing_plan NULL, plan_type NULL and subscription_id NULL
--     was classified 'billing plan not resolvable' -> manual review. A
--     subscription order always carries a subscription_id, so the ABSENCE of one
--     is itself deterministic evidence of a one-off charge. (TEST: PT-MPEJXXXI,
--     $110 — which then matches the per_pet_2025 single era EXACTLY.)
--
-- OWNER DECISION 2026-07-28 (supersedes the 2026-07-27 "annual excluded from the
-- first release" scoping decision): annual/subscription orders are classified by
-- the SAME deterministic rules as one-time orders. A provable single tier is
-- $20, a provable multi tier is $0, at-limit is blocked. Annual is no longer a
-- manual-review reason by itself.
--
-- NOT CHANGED: the $20 amount, the max of 3 pets, the tier-not-limit pricing
-- dimension, provider earnings (still none), and — absolutely — the completed /
-- issued-document lock. additional_pet_order_locked() is untouched by this
-- migration and is still evaluated BEFORE anything that can return an amount,
-- and now also before any Admin override can be applied.

-- ── 1. New evidence-confidence value ────────────────────────────────────────
-- Pet-count inference in the null-package_key branch needs its own label so an
-- audit can tell it apart from price-derived evidence. Widening a CHECK is
-- non-destructive: every existing value stays legal.
alter table public.order_entitlement_snapshots
  drop constraint if exists order_entitlement_snapshots_evidence_confidence_check;
alter table public.order_entitlement_snapshots
  add constraint order_entitlement_snapshots_evidence_confidence_check
  check (evidence_confidence in (
    'exact_package_key',
    'exact_stripe_metadata',
    'exact_stripe_price',
    'deterministic_historical_price',
    'inferred_existing_package',
    'inferred_registered_pet_count',
    'ambiguous_manual_review'));

-- Machine-readable manual-review reason. The owner requires that NO manual
-- review is ever returned without a recorded code.
alter table public.order_entitlement_snapshots
  add column if not exists manual_review_code text;

comment on column public.order_entitlement_snapshots.manual_review_code is
  'GATING-002: machine-readable manual-review reason (legacy_package_unknown, conflicting_pet_count, service_not_resolvable, entitlement_snapshot_missing). NULL when upgrade_policy = supported.';

-- ── 2. Classifier ───────────────────────────────────────────────────────────
create or replace function public.classify_order_entitlement(
  p_package_key      text,
  p_billing_plan     text,
  p_letter_type      text,
  p_plan_type        text,
  p_price            integer,
  p_coupon_discount  integer,
  p_includes_ra      boolean,
  p_pet_count        integer,
  p_subscription_id  text
)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $$
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
begin
  -- Service ---------------------------------------------------------------
  v_service := lower(coalesce(p_letter_type,''));
  if v_service not in ('esa','psd') then v_service := 'unknown'; end if;

  -- Plan ------------------------------------------------------------------
  -- BUG 2 fix: a subscription order ALWAYS carries a subscription_id, so the
  -- absence of one (with no annual marker anywhere) is deterministic evidence
  -- of a one-off charge rather than an unresolvable plan.
  v_plan := case
    when p_billing_plan in ('one_time','annual') then p_billing_plan
    when p_plan_type ilike 'One-Time%'            then 'one_time'
    when p_plan_type ilike 'Subscription%'        then 'annual'
    when p_subscription_id is not null            then 'annual'
    else 'one_time'
  end;

  v_list := coalesce(p_price,0) + coalesce(p_coupon_discount,0);

  -- 1/2. Exact package key -------------------------------------------------
  if p_package_key in ('esa_ra_bundle','psd_ra_bundle') then
    v_family  := 'ra_bundle';
    v_tier    := 'multi';
    v_limit   := 3;                    -- combo is FLAT for 1-3, proven in pricingMatrix.ts
    v_version := 'combo_flat';
    v_source  := 'orders.package_key';
    v_conf    := 'exact_package_key';

  elsif p_package_key in ('esa_standard','psd_standard') then
    v_family  := 'standard';
    v_source  := 'orders.package_key';
    if v_plan = 'one_time' and v_list = 129 then
      v_tier := 'single'; v_limit := 1; v_version := 'current_2026_07';
      v_conf := 'exact_package_key';
    elsif v_plan = 'one_time' and v_list = 149 then
      v_tier := 'multi';  v_limit := 3; v_version := 'current_2026_07';
      v_conf := 'exact_package_key';
    elsif v_plan = 'annual' and v_list = 115 then
      v_tier := 'single'; v_limit := 1; v_version := 'phased_2026_07';
      v_conf := 'exact_package_key';
    elsif v_plan = 'annual' and v_list = 135 then
      v_tier := 'multi';  v_limit := 3; v_version := 'phased_2026_07';
      v_conf := 'exact_package_key';
    else
      -- Package certain, tier not. Registered pet count as supporting evidence.
      v_source  := 'orders.package_key + registered_pet_count';
      v_conf    := 'inferred_existing_package';
      v_version := 'unknown_price_era';
      if v_pets = 1 then
        v_tier := 'single'; v_limit := 1;
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
      -- Per-pet era: $110 base + $25 per extra pet (RETIRED 2026-07).
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
        v_tier := 'single'; v_limit := 1; v_version := 'current_2026_07';
      when v_list = 149 then
        v_tier := 'multi';  v_limit := 3; v_version := 'current_2026_07';
      when v_list = 179 then
        v_family := 'ra_bundle';
        v_tier := 'multi';  v_limit := 3; v_version := 'combo_flat';
      else
        -- BUG 1 fix. Price era unmatched -> fall back to the SAME registered
        -- pet-count evidence the package_key branch already trusts, instead of
        -- dead-ending the order. Ambiguous ONLY when the count is unusable.
        v_source  := 'registered_pet_count(one_time, price era unmatched)';
        v_conf    := 'inferred_registered_pet_count';
        v_version := 'unknown_price_era';
        if v_pets = 1 then
          v_tier := 'single'; v_limit := 1;
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
        -- BUG 1 fix, annual side.
        v_source  := 'registered_pet_count(annual, price era unmatched)';
        v_conf    := 'inferred_registered_pet_count';
        v_version := 'unknown_price_era';
        if v_pets = 1 then
          v_tier := 'single'; v_limit := 1;
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
    -- Only reachable when the SERVICE itself is not ESA/PSD. A letter type we
    -- cannot name is a genuine data defect, never an automatic price.
    v_conf   := 'ambiguous_manual_review';
    v_source := 'none';
    v_code   := 'service_not_resolvable';
    v_reason := 'service type not resolvable from orders.letter_type';
  end if;

  -- Contradiction guard ----------------------------------------------------
  -- A customer cannot already have more pets registered than they bought. If
  -- they do, the price reading is wrong — demote rather than publish a limit
  -- that would wrongly bill (or wrongly free) an upgrade. Unreachable on the
  -- pet-count-inferred paths by construction (limit >= count there).
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
  -- OWNER 2026-07-28: annual is NO LONGER a manual-review reason. Manual review
  -- is now reached ONLY through ambiguous_manual_review, i.e. a specific,
  -- coded data defect.
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
    'original_purchased_pet_count', p_pet_count,
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
      'registered_pet_count', p_pet_count)
  );
end;
$$;

comment on function public.classify_order_entitlement is
  'ORDER-ENTITLEMENT-...-001 + GATING-002: deterministic, PURE entitlement classifier. Tier is resolved from package key, then canonical price era, then the FROZEN registered pet count. Manual review ONLY for a coded data defect (legacy_package_unknown, conflicting_pet_count, service_not_resolvable) — never for annual/subscription, never as a fallback.';

-- ── 3. Audited re-derivation of existing snapshots ──────────────────────────
-- Snapshots are immutable evidence: replacing the classifier does NOT change
-- rows already written, and resolve_additional_pet_pricing reads the STORED
-- upgrade_policy. Existing rows must therefore be re-derived through the
-- designed audited-repair path (new repair_reason -> trigger bumps revision and
-- stamps repaired_at). Idempotent: a row whose classification is unchanged is
-- not touched, so a second run is a no-op and cannot trip the immutability
-- trigger.
create or replace function public.repair_order_entitlement_snapshots(
  p_dry_run boolean default true,
  p_reason  text default 'GATING-002: re-derived under the corrected classifier (pet-count inference + annual auto-classification)')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_changed integer := 0;
  v_before  jsonb;
  v_after   jsonb;
begin
  -- Fail closed: service_role (auth.uid() IS NULL) or admin staff only.
  if auth.uid() is not null and not public.is_admin_staff() then
    raise exception 'repair_order_entitlement_snapshots: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_object_agg(k, n) into v_before from (
    select s.upgrade_policy || '/' || s.evidence_confidence as k, count(*) as n
    from public.order_entitlement_snapshots s group by 1) x;

  if not p_dry_run then
    with candidate as (
      select s.id, v.c
      from public.order_entitlement_snapshots s
      join public.order_entitlement_classification_v v on v.order_id = s.order_id
      where s.upgrade_policy            is distinct from v.c->>'upgrade_policy'
         or s.purchased_pet_tier        is distinct from v.c->>'purchased_pet_tier'
         or s.evidence_confidence       is distinct from v.c->>'evidence_confidence'
         or s.plan_family               is distinct from v.c->>'plan_family'
         or s.package_family            is distinct from v.c->>'package_family'
         or s.purchased_pet_limit       is distinct from nullif(v.c->>'purchased_pet_limit','')::integer
    ), upd as (
      update public.order_entitlement_snapshots s
         set service_type         = c.c->>'service_type',
             plan_family          = c.c->>'plan_family',
             package_family       = c.c->>'package_family',
             purchased_pet_tier   = c.c->>'purchased_pet_tier',
             purchased_pet_limit  = nullif(c.c->>'purchased_pet_limit','')::integer,
             includes_ra          = (c.c->>'includes_ra')::boolean,
             pricing_version      = c.c->>'pricing_version',
             evidence_source      = c.c->>'evidence_source',
             evidence_confidence  = c.c->>'evidence_confidence',
             evidence_detail      = c.c->'evidence_detail',
             upgrade_policy       = c.c->>'upgrade_policy',
             manual_review_reason = c.c->>'manual_review_reason',
             manual_review_code   = c.c->>'manual_review_code',
             repair_reason        = p_reason
        from candidate c
       where s.id = c.id
      returning 1
    )
    select count(*) into v_changed from upd;
  else
    -- The dry-run predicate MUST be byte-identical to the UPDATE's `candidate`
    -- predicate, or the rehearsal under-reports and the operator approves a
    -- bigger write than they were shown. (First cut counted 3 fields and the
    -- apply touched 6 — 41 vs 104 rows.)
    select count(*) into v_changed
      from public.order_entitlement_snapshots s
      join public.order_entitlement_classification_v v on v.order_id = s.order_id
     where s.upgrade_policy      is distinct from v.c->>'upgrade_policy'
        or s.purchased_pet_tier  is distinct from v.c->>'purchased_pet_tier'
        or s.evidence_confidence is distinct from v.c->>'evidence_confidence'
        or s.plan_family         is distinct from v.c->>'plan_family'
        or s.package_family      is distinct from v.c->>'package_family'
        or s.purchased_pet_limit is distinct from nullif(v.c->>'purchased_pet_limit','')::integer;
  end if;

  select jsonb_object_agg(k, n) into v_after from (
    select s.upgrade_policy || '/' || s.evidence_confidence as k, count(*) as n
    from public.order_entitlement_snapshots s group by 1) x;

  return jsonb_build_object(
    'dry_run', p_dry_run, 'repaired', v_changed,
    'before', coalesce(v_before,'{}'::jsonb), 'after', coalesce(v_after,'{}'::jsonb));
end;
$$;

comment on function public.repair_order_entitlement_snapshots is
  'GATING-002: re-derives existing entitlement snapshots under the corrected classifier through the AUDITED repair path (revision bumped, repaired_at stamped). Idempotent — unchanged classifications are not touched.';

-- ── 4. Admin manual-review resolution ───────────────────────────────────────
-- Admin IS PawTenant Support. A genuine manual-review order must have a
-- server-validated, audited resolution — never a dead "contact support" row.
create table if not exists public.order_additional_pet_eligibility_overrides (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null unique references public.orders(id) on delete cascade,
  resolution            text not null check (resolution in ('paid_upgrade','included','blocked')),
  resolution_note       text,
  -- Evidence of what the ENGINE said at the moment the human overrode it.
  engine_outcome        text,
  engine_code           text,
  resolved_by           uuid,
  resolved_by_email     text,
  resolved_at           timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.order_additional_pet_eligibility_overrides is
  'GATING-002: Admin resolution of a genuine Additional Pet manual review. Consulted by resolve_additional_pet_pricing AFTER the completion lock, so an override can never unlock a completed or document-issued order. Amount is still server-computed — the resolution selects the PATH, never the price.';

create index if not exists idx_addpet_override_order
  on public.order_additional_pet_eligibility_overrides (order_id);

-- Append-only history of every resolution, including changes of mind.
create table if not exists public.order_additional_pet_eligibility_override_events (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null,
  from_resolution text,
  to_resolution  text not null,
  engine_outcome text,
  engine_code    text,
  note           text,
  actor_id       uuid,
  actor_email    text,
  created_at     timestamptz not null default now()
);

create index if not exists idx_addpet_override_events_order
  on public.order_additional_pet_eligibility_override_events (order_id, created_at);

create or replace function public.tg_addpet_override_events_append_only()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  raise exception 'order_additional_pet_eligibility_override_events is append-only'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_addpet_override_events_append_only
  on public.order_additional_pet_eligibility_override_events;
create trigger trg_addpet_override_events_append_only
  before update or delete on public.order_additional_pet_eligibility_override_events
  for each row execute function public.tg_addpet_override_events_append_only();

-- ── 5. Engine ───────────────────────────────────────────────────────────────
-- Authoritative sequence (owner §7):
--   1 load order  2 unpaid/reversed  3 COMPLETION LOCK  4 service
--   5 active request  6 pet-count ceiling  7 ADMIN OVERRIDE  8 entitlement
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
  v_ovr       public.order_additional_pet_eligibility_overrides;
  v_max       integer := public.additional_pet_max_total();
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

  -- ── COMPLETION LOCK ───────────────────────────────────────────────────────
  -- FIRST among the decisions that can produce an actionable outcome, and
  -- BEFORE the Admin override, so no human resolution can ever reopen a
  -- finalised evaluation. Never returns an amount.
  -- Provider assignment state (unassigned / pending_review / in_review) is
  -- deliberately NOT a lock signal and never reaches this branch.
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
      'code', 'service_not_resolvable', 'amount_cents', 0,
      'manual_review_code', 'service_not_resolvable',
      'manual_review_reason', 'The service type on this order is not ESA or PSD.',
      'message', 'We need to review this order before another pet can be added.');
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

  -- Effective pet state is computed WITHOUT the snapshot so the ceiling and the
  -- Admin override still work on an order whose snapshot is missing.
  v_state := public.additional_pet_effective_state(p_order_id);
  v_count := (v_state->>'effective_pet_count')::integer;
  v_tier  := v_state->>'effective_tier';

  if v_count >= v_max then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'max_pets_reached', 'amount_cents', 0,
      'current_pet_count', v_count, 'max_total', v_max,
      'message', format('This order already covers the maximum of %s pets.', v_max));
  end if;

  -- ── ADMIN OVERRIDE ────────────────────────────────────────────────────────
  -- Applies only to a mutable, under-ceiling order. The override selects the
  -- PATH; the amount is still computed here from additional_pet_upgrade_cents().
  select * into v_ovr from public.order_additional_pet_eligibility_overrides
   where order_id = p_order_id;
  if found then
    if v_ovr.resolution = 'blocked' then
      return jsonb_build_object('eligible', false, 'outcome', 'blocked',
        'code', 'admin_blocked', 'amount_cents', 0,
        'current_pet_count', v_count,
        'resolved_by_admin', true, 'resolved_at', v_ovr.resolved_at,
        'message', coalesce(nullif(v_ovr.resolution_note,''),
          'Adding another pet is not available for this order.'));
    end if;
    select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;
    return jsonb_build_object(
      'eligible', true,
      'outcome', v_ovr.resolution,
      'code', case when v_ovr.resolution = 'paid_upgrade'
                   then 'admin_resolved_paid_upgrade' else 'admin_resolved_included' end,
      'amount_cents', case when v_ovr.resolution = 'paid_upgrade'
                           then public.additional_pet_upgrade_cents() else 0 end,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
      'entitlement_snapshot_id', v_snap.id,
      'includes_ra', coalesce(v_snap.includes_ra, false),
      'max_total', v_max,
      'resolved_by_admin', true, 'resolved_at', v_ovr.resolved_at);
  end if;

  -- ── Entitlement ───────────────────────────────────────────────────────────
  select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;
  if not found then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'entitlement_snapshot_missing', 'amount_cents', 0,
      'current_pet_count', v_count,
      'manual_review_code', 'entitlement_snapshot_missing',
      'manual_review_reason', 'No purchased-entitlement snapshot exists for this order.',
      'message', 'We need to review this order before another pet can be added.');
  end if;

  if v_snap.upgrade_policy <> 'supported' then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', coalesce(v_snap.manual_review_code, 'legacy_package_unknown'),
      'amount_cents', 0,
      'current_pet_count', v_count,
      'manual_review_code', coalesce(v_snap.manual_review_code, 'legacy_package_unknown'),
      'manual_review_reason', v_snap.manual_review_reason,
      'message', 'We need to review this order before another pet can be added.');
  end if;

  if v_tier not in ('single','multi') then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'tier_not_provable', 'amount_cents', 0,
      'current_pet_count', v_count,
      'manual_review_code', 'tier_not_provable',
      'manual_review_reason', 'The purchased pet tier could not be proven for this order.',
      'message', 'We need to review this order before another pet can be added.');
  end if;

  if v_tier = 'multi' then
    return jsonb_build_object('eligible', true, 'outcome', 'included',
      'code', 'already_covered', 'amount_cents', 0,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
      'entitlement_snapshot_id', v_snap.id,
      'includes_ra', coalesce(v_snap.includes_ra, false),
      'max_total', v_max);
  end if;

  return jsonb_build_object('eligible', true, 'outcome', 'paid_upgrade',
    'code', 'tier_upgrade_required',
    'amount_cents', public.additional_pet_upgrade_cents(),
    'current_pet_count', v_count, 'target_pet_count', v_count + 1,
    'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
    'entitlement_snapshot_id', v_snap.id,
    'includes_ra', coalesce(v_snap.includes_ra, false),
    'max_total', v_max);
end;
$$;

comment on function public.resolve_additional_pet_pricing is
  'PHASE-B-001 + GATING-002: THE server-authoritative eligibility + pricing decision. Order: unpaid -> reversed -> COMPLETION LOCK -> service -> active request -> pet ceiling -> admin override -> entitlement. $20 single->multi, $0 for a multi tier, manual_review ONLY with a machine-readable code, blocked for completed/at-limit/admin-blocked. Provider assignment state never influences the outcome.';

-- ── 6. Admin review payload ─────────────────────────────────────────────────
-- Everything the Admin review UI must show, from ONE server-authorised read.
create or replace function public.get_additional_pet_eligibility_review(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_order  public.orders;
  v_snap   public.order_entitlement_snapshots;
  v_ovr    public.order_additional_pet_eligibility_overrides;
  v_reqs   jsonb;
  v_hist   jsonb;
begin
  if not public.is_admin_staff() then
    raise exception 'get_additional_pet_eligibility_review: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then return jsonb_build_object('found', false); end if;

  select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;
  select * into v_ovr  from public.order_additional_pet_eligibility_overrides where order_id = p_order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'status', r.status, 'pricing_outcome', r.pricing_outcome,
           'amount_cents', r.amount_cents, 'paid_at', r.paid_at,
           'provider_decision', r.provider_decision,
           'new_pet', r.new_pet, 'created_at', r.created_at)
         order by r.created_at desc), '[]'::jsonb)
    into v_reqs
    from public.order_additional_pet_requests r where r.order_id = p_order_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'from_resolution', e.from_resolution, 'to_resolution', e.to_resolution,
           'note', e.note, 'actor_email', e.actor_email, 'created_at', e.created_at)
         order by e.created_at desc), '[]'::jsonb)
    into v_hist
    from public.order_additional_pet_eligibility_override_events e where e.order_id = p_order_id;

  return jsonb_build_object(
    'found', true,
    'order', jsonb_build_object(
      'id', v_order.id, 'confirmation_id', v_order.confirmation_id,
      'status', v_order.status, 'doctor_status', v_order.doctor_status,
      'letter_type', v_order.letter_type, 'package_key', v_order.package_key,
      'billing_plan', v_order.billing_plan, 'plan_type', v_order.plan_type,
      'price', v_order.price, 'coupon_discount', v_order.coupon_discount,
      'paid_at', v_order.paid_at,
      'payment_state', case
        when v_order.paid_at is not null then 'paid'
        when v_order.payment_intent_id is not null then 'payment_intent_only'
        else 'unpaid' end,
      'refunded_at', v_order.refunded_at, 'refund_status', v_order.refund_status,
      'includes_ra', v_order.includes_reasonable_accommodation_letter),
    'lock',       public.additional_pet_order_locked(p_order_id),
    'pricing',    public.resolve_additional_pet_pricing(p_order_id),
    'state',      public.additional_pet_effective_state(p_order_id),
    'entitlement', case when v_snap.id is null then null else jsonb_build_object(
      'purchased_pet_tier', v_snap.purchased_pet_tier,
      'purchased_pet_limit', v_snap.purchased_pet_limit,
      'original_purchased_pet_count', v_snap.original_purchased_pet_count,
      'plan_family', v_snap.plan_family, 'package_family', v_snap.package_family,
      'pricing_version', v_snap.pricing_version,
      'evidence_source', v_snap.evidence_source,
      'evidence_confidence', v_snap.evidence_confidence,
      'evidence_detail', v_snap.evidence_detail,
      'upgrade_policy', v_snap.upgrade_policy,
      'manual_review_code', v_snap.manual_review_code,
      'manual_review_reason', v_snap.manual_review_reason,
      'revision', v_snap.revision) end,
    'requests',   v_reqs,
    'override',   case when v_ovr.id is null then null else jsonb_build_object(
      'resolution', v_ovr.resolution, 'note', v_ovr.resolution_note,
      'resolved_at', v_ovr.resolved_at, 'resolved_by_email', v_ovr.resolved_by_email,
      'engine_outcome', v_ovr.engine_outcome, 'engine_code', v_ovr.engine_code) end,
    'override_history', v_hist,
    'max_total', public.additional_pet_max_total());
end;
$$;

comment on function public.get_additional_pet_eligibility_review is
  'GATING-002: admin-only evidence payload for the Additional Pet manual-review UI. Authorises on is_admin_staff().';

-- ── 7. Admin resolution action ──────────────────────────────────────────────
create or replace function public.admin_resolve_additional_pet_eligibility(
  p_order_id   uuid,
  p_resolution text,
  p_note       text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_lock    jsonb;
  v_before  jsonb;
  v_prev    text;
  v_uid     uuid := auth.uid();
  v_email   text := lower(coalesce(auth.jwt()->>'email',''));
  v_after   jsonb;
begin
  if not public.is_admin_staff() then
    raise exception 'admin_resolve_additional_pet_eligibility: not authorised'
      using errcode = 'insufficient_privilege';
  end if;
  if p_resolution not in ('paid_upgrade','included','blocked') then
    raise exception 'admin_resolve_additional_pet_eligibility: invalid resolution %', p_resolution
      using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'admin_resolve_additional_pet_eligibility: order not found'
      using errcode = 'no_data_found';
  end if;

  -- THE completion lock is absolute. Admin is Support, not an override of
  -- clinical finality: a completed or document-issued order can never be
  -- resolved into an eligible state.
  v_lock := public.additional_pet_order_locked(p_order_id);
  if (v_lock->>'locked')::boolean then
    raise exception
      'admin_resolve_additional_pet_eligibility: the evaluation is completed or a document has been issued (reason=%) — Additional Pet eligibility cannot be resolved',
      v_lock->>'reason'
      using errcode = 'check_violation';
  end if;

  v_before := public.resolve_additional_pet_pricing(p_order_id);

  select resolution into v_prev
    from public.order_additional_pet_eligibility_overrides where order_id = p_order_id;

  insert into public.order_additional_pet_eligibility_overrides
    (order_id, resolution, resolution_note, engine_outcome, engine_code,
     resolved_by, resolved_by_email)
  values (p_order_id, p_resolution, nullif(trim(coalesce(p_note,'')),''),
          v_before->>'outcome', v_before->>'code', v_uid, nullif(v_email,''))
  on conflict (order_id) do update
    set resolution        = excluded.resolution,
        resolution_note   = excluded.resolution_note,
        engine_outcome    = excluded.engine_outcome,
        engine_code       = excluded.engine_code,
        resolved_by       = excluded.resolved_by,
        resolved_by_email = excluded.resolved_by_email,
        resolved_at       = now(),
        updated_at        = now();

  insert into public.order_additional_pet_eligibility_override_events
    (order_id, from_resolution, to_resolution, engine_outcome, engine_code,
     note, actor_id, actor_email)
  values (p_order_id, v_prev, p_resolution, v_before->>'outcome', v_before->>'code',
          nullif(trim(coalesce(p_note,'')),''), v_uid, nullif(v_email,''));

  v_after := public.resolve_additional_pet_pricing(p_order_id);

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, object_type, object_id, action,
     description, old_values, new_values, metadata)
  select v_uid, coalesce(nullif(v_email,''),'admin'), 'admin', 'order',
         o.confirmation_id, 'additional_pet_eligibility_resolved',
         format('Additional Pet eligibility resolved to %s by admin (engine said %s/%s).',
                p_resolution, v_before->>'outcome', v_before->>'code'),
         jsonb_build_object('engine_outcome', v_before->>'outcome',
                            'engine_code', v_before->>'code',
                            'previous_resolution', v_prev),
         jsonb_build_object('resolution', p_resolution, 'note', p_note),
         jsonb_build_object('order_id', p_order_id,
                            'resolved_pricing', v_after)
    from public.orders o where o.id = p_order_id;

  return jsonb_build_object('ok', true, 'resolution', p_resolution,
                            'previous_resolution', v_prev, 'pricing', v_after);
end;
$$;

comment on function public.admin_resolve_additional_pet_eligibility is
  'GATING-002: server-validated, audited Admin resolution of a genuine Additional Pet manual review. Refuses outright on a completed / document-locked order — the completion lock can never be overridden. The resolution selects the PATH; the $20 amount stays server-computed.';

-- ── 8. RLS + grants (fail closed) ───────────────────────────────────────────
alter table public.order_additional_pet_eligibility_overrides        enable row level security;
alter table public.order_additional_pet_eligibility_overrides        force  row level security;
alter table public.order_additional_pet_eligibility_override_events  enable row level security;
alter table public.order_additional_pet_eligibility_override_events  force  row level security;

drop policy if exists addpet_ovr_admin_select on public.order_additional_pet_eligibility_overrides;
create policy addpet_ovr_admin_select on public.order_additional_pet_eligibility_overrides
  for select to authenticated using (public.is_admin_staff());

drop policy if exists addpet_ovr_events_admin_select on public.order_additional_pet_eligibility_override_events;
create policy addpet_ovr_events_admin_select on public.order_additional_pet_eligibility_override_events
  for select to authenticated using (public.is_admin_staff());

-- No JWT role may WRITE either table. All writes go through the SECURITY
-- DEFINER resolution function, which authorises and audits.
revoke all on public.order_additional_pet_eligibility_overrides
  from public, anon, authenticated;
revoke all on public.order_additional_pet_eligibility_override_events
  from public, anon, authenticated;
grant select on public.order_additional_pet_eligibility_overrides       to authenticated;
grant select on public.order_additional_pet_eligibility_override_events to authenticated;

-- Functions: revoke from EVERY role BY NAME — revoking "from public" does NOT
-- undo PostgreSQL's default EXECUTE grant.
revoke all on function public.classify_order_entitlement(
  text,text,text,text,integer,integer,boolean,integer,text) from public, anon, authenticated;
revoke all on function public.resolve_additional_pet_pricing(uuid)              from public, anon, authenticated;
revoke all on function public.repair_order_entitlement_snapshots(boolean,text)  from public, anon, authenticated;
revoke all on function public.tg_addpet_override_events_append_only()           from public, anon, authenticated;
revoke all on function public.get_additional_pet_eligibility_review(uuid)       from public, anon, authenticated;
revoke all on function public.admin_resolve_additional_pet_eligibility(uuid,text,text)
  from public, anon, authenticated;

-- The two admin surfaces are the ONLY ones an end-user role may call, and each
-- authorises internally on is_admin_staff().
grant execute on function public.get_additional_pet_eligibility_review(uuid)    to authenticated;
grant execute on function public.admin_resolve_additional_pet_eligibility(uuid,text,text) to authenticated;
