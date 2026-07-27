-- ORDER-ENTITLEMENT-AND-DOCUMENT-VERSIONING-FOUNDATION-001 · Phase B
--
-- IMMUTABLE purchased-entitlement snapshot per order.
--
-- WHY: `orders` has NO pet-count column and NO pet tier column. The only place
-- pets live is `orders.assessment_answers->'pets'` — the SAME mutable array an
-- Additional Pet Upgrade would later append to. Deriving purchased entitlement
-- from it means the feature destroys its own pricing evidence on first use.
-- This table records what the customer PROVABLY BOUGHT, once, and never moves.
--
-- This migration is ADDITIVE ONLY. It does not touch orders.price, package_key,
-- paid_at, assessment_answers, provider earnings, Stripe, or any revenue path.
-- Entitlement snapshots are NOT revenue events.
--
-- Owner decisions encoded (2026-07-27):
--   • Standard single→multi upgrade is a package-tier delta ($20), NOT a per-pet
--     fee. The retired esa_additional_pet / esa_subscription_addon keys stay dead.
--   • RA bundles already cover up to 3 pets → no charge, review still required.
--   • Annual / subscription orders are EXCLUDED from the first release →
--     upgrade_policy = 'manual_review_required'. No charge is ever computed here.
--   • Ambiguous legacy orders stay manual review. Never invent a tier.

-- ── 1. Table ────────────────────────────────────────────────────────────────
create table if not exists public.order_entitlement_snapshots (
  id                          uuid primary key default gen_random_uuid(),
  order_id                    uuid not null unique
                                references public.orders(id) on delete cascade,

  -- What was bought
  service_type                text not null
                                check (service_type in ('esa','psd','unknown')),
  plan_family                 text not null
                                check (plan_family in ('one_time','annual','unknown')),
  package_family              text not null
                                check (package_family in ('standard','ra_bundle','unknown')),
  purchased_pet_tier          text not null
                                check (purchased_pet_tier in ('single','multi','unknown')),
  -- NULL means "not provable" — never guess a number here.
  purchased_pet_limit         integer check (purchased_pet_limit between 1 and 3),
  original_purchased_pet_count integer check (original_purchased_pet_count >= 0),
  includes_ra                 boolean,

  -- How we know
  pricing_version             text not null,
  evidence_source             text not null,
  evidence_confidence         text not null check (evidence_confidence in (
                                'exact_package_key',
                                'exact_stripe_metadata',
                                'exact_stripe_price',
                                'deterministic_historical_price',
                                'inferred_existing_package',
                                'ambiguous_manual_review')),
  -- Safe, non-PII reconciliation detail only (amounts / keys / eras).
  evidence_detail             jsonb not null default '{}'::jsonb,
  stripe_price_id             text,
  stripe_payment_intent_id    text,

  -- Downstream policy — this table never computes a charge.
  upgrade_policy              text not null check (upgrade_policy in (
                                'supported','manual_review_required','unsupported')),
  manual_review_reason        text,

  -- Immutability / audited repair
  revision                    integer not null default 1,
  repair_reason               text,
  repaired_at                 timestamptz,
  repaired_by                 uuid,

  snapshot_at                 timestamptz not null default now(),
  snapshot_source             text not null default 'backfill',
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.order_entitlement_snapshots is
  'ORDER-ENTITLEMENT-...-001: immutable record of the pet entitlement an order PROVABLY purchased. Never derived from the mutable assessment_answers->pets array alone. purchased_pet_limit NULL = not provable.';

create index if not exists idx_entitlement_order_id
  on public.order_entitlement_snapshots (order_id);
create index if not exists idx_entitlement_confidence
  on public.order_entitlement_snapshots (evidence_confidence);
create index if not exists idx_entitlement_upgrade_policy
  on public.order_entitlement_snapshots (upgrade_policy);
create index if not exists idx_entitlement_manual_review
  on public.order_entitlement_snapshots (order_id)
  where evidence_confidence = 'ambiguous_manual_review';

-- ── 2. Immutability trigger ─────────────────────────────────────────────────
-- Core entitlement facts may only change through an AUDITED repair: the caller
-- must supply a NEW repair_reason in the same statement. Anything else raises.
create or replace function public.tg_order_entitlement_immutable()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_core_changed boolean;
begin
  v_core_changed :=
       new.order_id                    is distinct from old.order_id
    or new.service_type                is distinct from old.service_type
    or new.plan_family                 is distinct from old.plan_family
    or new.package_family              is distinct from old.package_family
    or new.purchased_pet_tier          is distinct from old.purchased_pet_tier
    or new.purchased_pet_limit         is distinct from old.purchased_pet_limit
    or new.original_purchased_pet_count is distinct from old.original_purchased_pet_count
    or new.includes_ra                 is distinct from old.includes_ra
    or new.pricing_version             is distinct from old.pricing_version
    or new.evidence_source             is distinct from old.evidence_source
    or new.evidence_confidence         is distinct from old.evidence_confidence
    or new.upgrade_policy              is distinct from old.upgrade_policy;

  if v_core_changed then
    if new.repair_reason is null
       or new.repair_reason is not distinct from old.repair_reason then
      raise exception
        'order_entitlement_snapshots is immutable: a core entitlement change requires a new repair_reason (order_id=%)',
        old.order_id
        using errcode = 'check_violation';
    end if;
    new.revision    := old.revision + 1;
    new.repaired_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_order_entitlement_immutable
  on public.order_entitlement_snapshots;
create trigger trg_order_entitlement_immutable
  before update on public.order_entitlement_snapshots
  for each row execute function public.tg_order_entitlement_immutable();

-- ── 3. Deterministic classifier ─────────────────────────────────────────────
-- ONE implementation shared by the dry run and the backfill, so a dry-run
-- classification and the row it later writes can never disagree.
--
-- Evidence precedence (highest first):
--   1. orders.package_key (+ billing_plan)          → exact_package_key
--   2. canonical current price for that package     → exact_package_key
--   3. deterministic historical list price + plan   → deterministic_historical_price
--   4. package known but tier only inferable        → inferred_existing_package
--   5. anything else                                → ambiguous_manual_review
--
-- Stripe Checkout Session / PaymentIntent metadata and Price identity rank
-- between 2 and 3 in the documented precedence, but are NOT consulted here:
-- stripe_gross_charged_cents is NULL on 75 of 76 paid TEST orders and no Stripe
-- metadata is mirrored into the database, so there is nothing to read without a
-- live Stripe API call. Slots are reserved (stripe_price_id,
-- stripe_payment_intent_id, confidences exact_stripe_metadata /
-- exact_stripe_price) so a later admin-only reconciliation can UPGRADE a row's
-- confidence through the audited-repair path without a schema change.
--
-- List price is reconstructed as price + coupon_discount so a coupon can never
-- change the entitlement a customer bought.
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
  v_list      integer;
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
    else 'unknown'
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
    -- package_key alone does NOT carry the tier; resolve it from the canonical
    -- current price for this plan.
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
      -- Package is certain, tier is not. Fall back to the registered pet count
      -- as SUPPORTING evidence only, and label the row inferred — never exact.
      v_source := 'orders.package_key + registered_pet_count';
      v_conf   := 'inferred_existing_package';
      v_version := 'unknown_price_era';
      if coalesce(p_pet_count,0) = 1 then
        v_tier := 'single'; v_limit := 1;
      elsif coalesce(p_pet_count,0) between 2 and 3 then
        v_tier := 'multi';  v_limit := 3;
      else
        v_tier := 'unknown'; v_limit := null;
        v_conf := 'ambiguous_manual_review';
        v_reason := 'known package but pet count outside 1-3 and price matches no canonical tier';
      end if;
    end if;

  -- 3. Deterministic historical list price --------------------------------
  elsif p_package_key is null and v_service in ('esa','psd') and v_plan = 'one_time' then
    v_source := 'historical_list_price(one_time)';
    v_conf   := 'deterministic_historical_price';
    case
      -- Per-pet era: $110 base + $25 per extra pet (RETIRED 2026-07). The price
      -- encodes the EXACT number of pets purchased, so the limit is that count.
      when v_service = 'esa' and v_list = 110 then
        v_tier := 'single'; v_limit := 1; v_version := 'per_pet_2025';
      when v_service = 'esa' and v_list = 135 then
        v_tier := 'multi';  v_limit := 2; v_version := 'per_pet_2025';
      when v_service = 'esa' and v_list = 160 then
        v_tier := 'multi';  v_limit := 3; v_version := 'per_pet_2025';
      -- 2026-07 fixed multi-pet total
      when v_list = 145 then
        v_tier := 'multi';  v_limit := 3; v_version := 'fixed_total_2026_07';
      -- PSD $139 flat "up to 3 dogs" era
      when v_service = 'psd' and v_list = 139 then
        v_tier := 'multi';  v_limit := 3; v_version := 'psd_flat_2026_07';
      -- Current tiered matrix
      when v_list = 129 then
        v_tier := 'single'; v_limit := 1; v_version := 'current_2026_07';
      when v_list = 149 then
        v_tier := 'multi';  v_limit := 3; v_version := 'current_2026_07';
      -- Combo one-time
      when v_list = 179 then
        v_family := 'ra_bundle';
        v_tier := 'multi';  v_limit := 3; v_version := 'combo_flat';
      else
        v_tier := 'unknown'; v_limit := null;
        v_conf := 'ambiguous_manual_review';
        v_reason := format('one-time list price $%s matches no canonical era', v_list);
    end case;
    if v_family = 'unknown' and v_conf <> 'ambiguous_manual_review' then
      v_family := 'standard';
    end if;

  elsif p_package_key is null and v_service in ('esa','psd') and v_plan = 'annual' then
    v_source := 'historical_list_price(annual)';
    v_conf   := 'deterministic_historical_price';
    case
      -- Per-pet annual era: $99 base + $20 per extra pet (RETIRED)
      when v_list = 99  then v_tier := 'single'; v_limit := 1; v_version := 'per_pet_2025_annual';
      when v_list = 119 then v_tier := 'multi';  v_limit := 2; v_version := 'per_pet_2025_annual';
      when v_list = 139 then v_tier := 'multi';  v_limit := 3; v_version := 'per_pet_2025_annual';
      -- Phased subscription first-year matrix
      when v_list = 115 then v_tier := 'single'; v_limit := 1; v_version := 'phased_2026_07';
      when v_list = 135 then v_tier := 'multi';  v_limit := 3; v_version := 'phased_2026_07';
      -- Combo annual
      when v_list = 159 then
        v_family := 'ra_bundle';
        v_tier := 'multi'; v_limit := 3; v_version := 'combo_flat';
      else
        v_tier := 'unknown'; v_limit := null;
        v_conf := 'ambiguous_manual_review';
        v_reason := format('annual list price $%s matches no canonical era', v_list);
    end case;
    if v_family = 'unknown' and v_conf <> 'ambiguous_manual_review' then
      v_family := 'standard';
    end if;

  else
    v_conf   := 'ambiguous_manual_review';
    v_source := 'none';
    v_reason := case
      when v_service = 'unknown' then 'service type not resolvable'
      when v_plan    = 'unknown' then 'billing plan not resolvable'
      else 'unrecognised package key'
    end;
  end if;

  -- Contradiction guard ----------------------------------------------------
  -- A customer cannot already have more pets registered than they bought. If
  -- they do, our price reading is wrong — demote to manual review rather than
  -- publish a limit that would wrongly bill (or wrongly free) an upgrade.
  if v_limit is not null and coalesce(p_pet_count,0) > v_limit then
    v_reason := format(
      'registered pet count %s exceeds derived limit %s (%s) — evidence contradicts itself',
      p_pet_count, v_limit, v_version);
    v_conf  := 'ambiguous_manual_review';
    v_tier  := 'unknown';
    v_limit := null;
  end if;

  -- Upgrade policy ---------------------------------------------------------
  -- Owner: annual/subscription is EXCLUDED from the first release. Ambiguous
  -- rows never get an automated path. Nothing here computes a charge.
  v_policy := case
    when v_conf = 'ambiguous_manual_review' then 'manual_review_required'
    when v_plan = 'annual'                  then 'manual_review_required'
    when v_plan = 'one_time'                then 'supported'
    else 'manual_review_required'
  end;
  if v_policy = 'manual_review_required' and v_reason is null then
    v_reason := case
      when v_plan = 'annual'
        then 'annual/subscription upgrades excluded pending a separate owner-approved policy'
      else 'plan family not resolvable'
    end;
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
  'ORDER-ENTITLEMENT-...-001: deterministic, PURE entitlement classifier. Shared by dry run and backfill so they can never disagree. Returns purchased_pet_limit NULL for anything not provable.';

-- ── 3b. Classification view ─────────────────────────────────────────────────
-- The single set the dry run AND the backfill both read, so a reported
-- classification and the row later written are the same computation.
-- security_invoker: the caller's own RLS on `orders` applies, so this view can
-- never widen access to order data.
create or replace view public.order_entitlement_classification_v
with (security_invoker = true) as
select
  o.id                as order_id,
  o.payment_intent_id,
  public.classify_order_entitlement(
    o.package_key,
    o.billing_plan,
    o.letter_type,
    o.plan_type,
    o.price,
    o.coupon_discount,
    o.includes_reasonable_accommodation_letter,
    case
      when jsonb_typeof(o.assessment_answers->'pets') = 'array'
        then jsonb_array_length(o.assessment_answers->'pets')
      else null
    end,
    o.subscription_id
  ) as c
from public.orders o
where o.paid_at is not null;

comment on view public.order_entitlement_classification_v is
  'ORDER-ENTITLEMENT-...-001: deterministic entitlement classification for every PAID order. Read by both the dry run and the backfill. security_invoker — caller RLS on orders applies.';

revoke all on public.order_entitlement_classification_v from public, anon, authenticated;
grant select on public.order_entitlement_classification_v to authenticated;

-- ── 4. Dry run + backfill ───────────────────────────────────────────────────
-- Both read the SAME classifier. p_dry_run = true writes nothing.
create or replace function public.backfill_order_entitlements(p_dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_started   timestamptz := clock_timestamp();
  v_inserted  integer := 0;
  v_skipped   integer := 0;
  v_summary   jsonb;
begin
  -- Fail closed: service_role only (auth.uid() IS NULL under the service key).
  if auth.uid() is not null and not public.is_admin_staff() then
    raise exception 'backfill_order_entitlements: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select jsonb_object_agg(k, n) into v_summary from (
    select c->>'evidence_confidence' as k, count(*) as n
    from public.order_entitlement_classification_v group by 1
  ) s;

  if not p_dry_run then
    with ins as (
      insert into public.order_entitlement_snapshots (
        order_id, service_type, plan_family, package_family,
        purchased_pet_tier, purchased_pet_limit, original_purchased_pet_count,
        includes_ra, pricing_version, evidence_source, evidence_confidence,
        evidence_detail, stripe_payment_intent_id,
        upgrade_policy, manual_review_reason, snapshot_source)
      select
        r.order_id,
        r.c->>'service_type',
        r.c->>'plan_family',
        r.c->>'package_family',
        r.c->>'purchased_pet_tier',
        nullif(r.c->>'purchased_pet_limit','')::integer,
        nullif(r.c->>'original_purchased_pet_count','')::integer,
        (r.c->>'includes_ra')::boolean,
        r.c->>'pricing_version',
        r.c->>'evidence_source',
        r.c->>'evidence_confidence',
        r.c->'evidence_detail',
        r.payment_intent_id,
        r.c->>'upgrade_policy',
        r.c->>'manual_review_reason',
        'backfill'
      from public.order_entitlement_classification_v r
      -- Idempotent: an existing snapshot is NEVER re-derived or overwritten.
      on conflict (order_id) do nothing
      returning 1
    )
    select count(*) into v_inserted from ins;
  end if;

  select count(*) into v_skipped
  from public.order_entitlement_classification_v r
  join public.order_entitlement_snapshots s on s.order_id = r.order_id;

  return jsonb_build_object(
    'dry_run',       p_dry_run,
    'candidates',    (select count(*) from public.order_entitlement_classification_v),
    'inserted',      v_inserted,
    'already_present', v_skipped,
    'by_confidence', coalesce(v_summary, '{}'::jsonb),
    'duration_ms',   round(extract(milliseconds from clock_timestamp() - v_started))
  );
end;
$$;

comment on function public.backfill_order_entitlements is
  'ORDER-ENTITLEMENT-...-001: idempotent entitlement backfill. p_dry_run=true classifies without writing. Existing snapshots are never overwritten.';

-- ── 5. RLS + grants (fail closed) ───────────────────────────────────────────
alter table public.order_entitlement_snapshots enable row level security;
alter table public.order_entitlement_snapshots force row level security;

-- Admin staff may READ (financial evidence). Nobody with a JWT may write —
-- writes are service-role only, which bypasses RLS.
drop policy if exists ent_admin_select on public.order_entitlement_snapshots;
create policy ent_admin_select on public.order_entitlement_snapshots
  for select to authenticated
  using (public.is_admin_staff());

revoke all on public.order_entitlement_snapshots from public, anon, authenticated;
grant select on public.order_entitlement_snapshots to authenticated;

-- Functions: revoke from each role BY NAME. Revoking "from public" does NOT
-- undo the default EXECUTE grant that PostgreSQL creates.
revoke all on function public.classify_order_entitlement(
  text,text,text,text,integer,integer,boolean,integer,text) from public, anon, authenticated;
revoke all on function public.backfill_order_entitlements(boolean)
  from public, anon, authenticated;
revoke all on function public.tg_order_entitlement_immutable() from public, anon, authenticated;
