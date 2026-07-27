-- ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001 · Phase A/B
--
-- Additional Pet request domain + SERVER-AUTHORITATIVE pricing.
--
-- WHY THIS SHAPE:
--   • There is no pets table. Pets live in `orders.assessment_answers->'pets'`,
--     which is ALSO the array that proves what the customer originally bought.
--     Appending to it would destroy the pricing evidence, so this feature NEVER
--     writes to it. A new pet lives on its own request row, and the effective
--     pet count is `original + approved additional pets`.
--   • `$20` is a PACKAGE-TIER upgrade (single -> multi), NOT a per-pet fee. The
--     retired esa_additional_pet / esa_subscription_addon / $25-per-pet /
--     $20-per-pet-annual keys stay dead and are never referenced here.
--   • A customer who already holds a MULTI tier pays `$0` through 3 pets — this
--     deliberately includes the per-pet-2025 era rows whose purchased_pet_limit
--     is 2 ($135 ESA / $119 annual). Owner policy makes TIER, not limit, the
--     pricing dimension ("existing multi-pet entitlement, including 2 pets ->
--     3 pets: $0"). Their limit stays recorded as purchased; the POLICY grants
--     the third pet. 2 such orders exist on TEST.
--   • Annual/subscription and ambiguous legacy orders are manual review. No
--     amount is ever computed for them.
--
-- ADDITIVE ONLY. Touches no existing table, no existing row, no revenue path.

-- ── 0. Canonical constants ──────────────────────────────────────────────────
-- Kept as IMMUTABLE functions so the price exists in exactly ONE place and the
-- guards can assert against it.
create or replace function public.additional_pet_upgrade_cents()
returns integer language sql immutable set search_path to 'public' as
$$ select 2000 $$;   -- $20.00 package-tier upgrade

create or replace function public.additional_pet_max_total()
returns integer language sql immutable set search_path to 'public' as
$$ select 3 $$;      -- hard maximum pets per order

comment on function public.additional_pet_upgrade_cents is
  'ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001: the ONE definition of the $20 single->multi package-tier upgrade. Not a per-pet fee.';

-- ── 1. Request table ────────────────────────────────────────────────────────
create table if not exists public.order_additional_pet_requests (
  id                      uuid primary key default gen_random_uuid(),
  order_id                uuid not null references public.orders(id) on delete cascade,
  confirmation_id         text,
  customer_email          text,

  -- Entitlement evidence AT REQUEST TIME (immutable copies, never re-derived)
  entitlement_snapshot_id uuid references public.order_entitlement_snapshots(id),
  service_type            text not null check (service_type in ('esa','psd')),
  prior_pet_tier          text not null check (prior_pet_tier in ('single','multi','unknown')),
  prior_pet_count         integer not null check (prior_pet_count >= 0),
  target_pet_count        integer not null check (target_pet_count between 2 and 3),

  -- Immutable snapshot of the pet being ADDED (canonical shape).
  new_pet                 jsonb not null,

  -- Server pricing outcome. The browser never supplies any of this.
  pricing_outcome         text not null check (pricing_outcome in
                            ('paid_upgrade','included','manual_review')),
  amount_cents            integer not null default 0 check (amount_cents >= 0),
  currency                text not null default 'usd' check (currency = 'usd'),

  -- The amount is BOUND to the outcome at the DB level: a tampered or drifting
  -- amount cannot be stored at all.
  constraint ck_addpet_amount_matches_outcome check (
    (pricing_outcome = 'paid_upgrade' and amount_cents = 2000)
    or (pricing_outcome in ('included','manual_review') and amount_cents = 0)
  ),

  status                  text not null default 'draft' check (status in (
                            'draft','manual_review_required','payment_required',
                            'checkout_created','paid_pending_details',
                            'pending_provider_review','clarification_requested',
                            'resubmitted','approved_pending_document','completed',
                            'rejected','refund_pending','refunded','cancelled')),

  -- Payment (absent entirely on the $0 path — no zero-dollar Stripe object)
  paid_at                     timestamptz,
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  idempotency_key             text unique,

  -- Provider workflow (NO financial field is ever exposed to a provider)
  assigned_provider_user_id   uuid,
  provider_decision           text check (provider_decision in ('approved','rejected')),
  provider_decision_at        timestamptz,
  provider_decision_reason    text,

  -- Resulting revision (populated only after a successful generation)
  document_version_id     uuid references public.order_document_versions(id),
  letter_id               text,

  -- Refund (add-on ONLY — never the base order)
  refunded_at             timestamptz,
  stripe_refund_id        text,
  refund_amount_cents     integer,

  manual_review_reason    text,
  created_by              text not null default 'customer',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on table public.order_additional_pet_requests is
  'ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001: one Additional Pet request. The pet lives HERE, never appended to orders.assessment_answers->pets (that array is the entitlement evidence). Amount is bound to pricing_outcome by check constraint.';

create index if not exists idx_addpet_order      on public.order_additional_pet_requests (order_id);
create index if not exists idx_addpet_status     on public.order_additional_pet_requests (status);
create index if not exists idx_addpet_provider   on public.order_additional_pet_requests (assigned_provider_user_id);
create index if not exists idx_addpet_paid       on public.order_additional_pet_requests (paid_at) where paid_at is not null;

-- ONE active (non-terminal) request per order. Closes the TOCTOU window between
-- the eligibility SELECT and the INSERT, exactly as uq_addon_doc_active_per_order
-- does for the $50 add-on. Terminal rows never block a later, separate request
-- (a customer may add a 2nd pet, then a 3rd).
create unique index if not exists uq_addpet_one_active_per_order
  on public.order_additional_pet_requests (order_id)
  where status not in ('completed','rejected','refunded','cancelled');

-- ── 2. Append-only workflow events ──────────────────────────────────────────
create table if not exists public.order_additional_pet_request_events (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid not null references public.order_additional_pet_requests(id) on delete cascade,
  order_id     uuid not null,
  event_type   text not null,
  from_status  text,
  to_status    text,
  actor_role   text not null check (actor_role in ('customer','provider','admin','system')),
  actor_id     uuid,
  -- Safe, non-PII workflow detail only. Never amounts-as-input, never Stripe secrets.
  detail       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists idx_addpet_events_request
  on public.order_additional_pet_request_events (request_id, created_at);

comment on table public.order_additional_pet_request_events is
  'ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001: append-only workflow history (clarification, resubmission, decisions). UPDATE/DELETE are blocked by trigger.';

create or replace function public.tg_addpet_events_append_only()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  raise exception 'order_additional_pet_request_events is append-only'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_addpet_events_append_only on public.order_additional_pet_request_events;
create trigger trg_addpet_events_append_only
  before update or delete on public.order_additional_pet_request_events
  for each row execute function public.tg_addpet_events_append_only();

-- ── 3. Request immutability ─────────────────────────────────────────────────
-- Pricing facts are frozen at creation. The pet snapshot is editable ONLY while
-- the customer legitimately owns the form (draft / pre-payment / clarification);
-- once it is in front of a provider it is frozen.
create or replace function public.tg_addpet_immutable()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.order_id        is distinct from old.order_id
     or new.service_type    is distinct from old.service_type
     or new.pricing_outcome is distinct from old.pricing_outcome
     or new.amount_cents    is distinct from old.amount_cents
     or new.currency        is distinct from old.currency
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

  -- A paid request can never be silently un-paid.
  if old.paid_at is not null and new.paid_at is null then
    raise exception 'order_additional_pet_requests: paid_at cannot be cleared (request=%)', old.id
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_addpet_immutable on public.order_additional_pet_requests;
create trigger trg_addpet_immutable
  before update on public.order_additional_pet_requests
  for each row execute function public.tg_addpet_immutable();

-- ── 4. Effective pet state ──────────────────────────────────────────────────
-- The single definition of "how many pets does this order cover today" and
-- "which tier is in force". Both are derived WITHOUT mutating assessment data:
--   count = original registered pets + APPROVED additional pets
--   tier  = purchased tier, promoted to 'multi' once a paid upgrade completed
create or replace function public.additional_pet_effective_state(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_original   integer;
  v_added      integer;
  v_tier       text;
  v_snapshot   public.order_entitlement_snapshots;
  v_paid_up    boolean;
  v_pets       jsonb;
begin
  select * into v_snapshot from public.order_entitlement_snapshots
   where order_id = p_order_id;

  select case when jsonb_typeof(o.assessment_answers->'pets') = 'array'
              then o.assessment_answers->'pets' else '[]'::jsonb end
    into v_pets
    from public.orders o where o.id = p_order_id;

  -- Prefer the IMMUTABLE snapshot figure; fall back to the live array (which
  -- this feature never writes to, so the two agree by construction).
  v_original := coalesce(v_snapshot.original_purchased_pet_count,
                         jsonb_array_length(coalesce(v_pets, '[]'::jsonb)));

  select count(*) into v_added
    from public.order_additional_pet_requests r
   where r.order_id = p_order_id
     and r.provider_decision = 'approved';

  -- A completed PAID upgrade promotes the order to the multi tier, so a later
  -- 2->3 addition is correctly $0 rather than a second $20 charge.
  select exists (
    select 1 from public.order_additional_pet_requests r
     where r.order_id = p_order_id
       and r.pricing_outcome = 'paid_upgrade'
       and r.provider_decision = 'approved'
       and r.refunded_at is null
  ) into v_paid_up;

  v_tier := coalesce(v_snapshot.purchased_pet_tier, 'unknown');
  if v_paid_up then v_tier := 'multi'; end if;

  return jsonb_build_object(
    'original_pet_count',  v_original,
    'approved_added',      v_added,
    'effective_pet_count', v_original + v_added,
    'effective_tier',      v_tier,
    'max_total',           public.additional_pet_max_total(),
    'original_pets',       coalesce(v_pets, '[]'::jsonb)
  );
end;
$$;

-- ── 5. Server-authoritative pricing + eligibility ───────────────────────────
-- THE single decision point. Returns an outcome and an amount; the browser
-- supplies neither. Never computes an amount for a manual-review order.
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
begin
  select * into v_order from public.orders where id = p_order_id;
  if not found then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'order_not_found', 'amount_cents', 0);
  end if;

  -- ── Hard blocks (never priced) ────────────────────────────────────────────
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

  if lower(coalesce(v_order.letter_type,'')) not in ('esa','psd') then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'service_not_resolvable', 'amount_cents', 0);
  end if;

  -- One active request at a time.
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

  -- ── Entitlement ───────────────────────────────────────────────────────────
  select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;
  if not found then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'no_entitlement_snapshot', 'amount_cents', 0,
      'message', 'Adding another pet to this order requires a manual review.');
  end if;

  v_state := public.additional_pet_effective_state(p_order_id);
  v_count := (v_state->>'effective_pet_count')::integer;
  v_tier  := v_state->>'effective_tier';

  -- Max pets is checked BEFORE policy so a maxed-out order never shows a price.
  if v_count >= public.additional_pet_max_total() then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'max_pets_reached', 'amount_cents', 0,
      'current_pet_count', v_count, 'max_total', public.additional_pet_max_total(),
      'message', 'This order already covers the maximum of 3 pets.');
  end if;

  -- Annual / ambiguous / unsupported -> manual review, no amount.
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

  -- ── Priced outcomes ───────────────────────────────────────────────────────
  -- multi tier (incl. RA bundles and the 2-pet per-pet era) -> already covered.
  if v_tier = 'multi' then
    return jsonb_build_object('eligible', true, 'outcome', 'included',
      'code', 'already_covered', 'amount_cents', 0,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
      'entitlement_snapshot_id', v_snap.id,
      'includes_ra', coalesce(v_snap.includes_ra, false),
      'max_total', public.additional_pet_max_total());
  end if;

  -- single tier -> $20 package-tier upgrade (NOT a per-pet fee).
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
  'ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001: THE server-authoritative eligibility + pricing decision. $20 single->multi, $0 for an existing multi tier (incl. RA bundles and 2-pet per-pet-era rows), manual review for annual/ambiguous. Never prices a manual-review order.';

-- ── 6. Duplicate-pet detection ──────────────────────────────────────────────
create or replace function public.additional_pet_is_duplicate(
  p_order_id uuid, p_name text, p_type text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_norm_name text := lower(trim(coalesce(p_name,'')));
  v_norm_type text := lower(trim(coalesce(p_type,'')));
  v_hit       boolean;
begin
  if v_norm_name = '' then return false; end if;

  -- Against the ORIGINAL registered pets.
  select exists (
    select 1
      from public.orders o,
           lateral jsonb_array_elements(
             case when jsonb_typeof(o.assessment_answers->'pets') = 'array'
                  then o.assessment_answers->'pets' else '[]'::jsonb end) pet
     where o.id = p_order_id
       and lower(trim(coalesce(pet->>'name',''))) = v_norm_name
       and lower(trim(coalesce(pet->>'type',''))) = v_norm_type
  ) into v_hit;
  if v_hit then return true; end if;

  -- Against pets added by earlier requests that are not dead.
  select exists (
    select 1 from public.order_additional_pet_requests r
     where r.order_id = p_order_id
       and r.status not in ('rejected','refunded','cancelled')
       and lower(trim(coalesce(r.new_pet->>'name',''))) = v_norm_name
       and lower(trim(coalesce(r.new_pet->>'type',''))) = v_norm_type
  ) into v_hit;
  return coalesce(v_hit, false);
end;
$$;

-- ── 7. Provider-safe projection ─────────────────────────────────────────────
-- Providers must NEVER see price, Stripe identifiers, margin, payment method or
-- attribution. Rather than rely on row-level policies (which cannot hide a
-- COLUMN), the provider reads through this SECURITY DEFINER function, which
-- selects an explicit safe field list and authorises on order assignment.
create or replace function public.get_additional_pet_request_for_provider(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_req    public.order_additional_pet_requests;
  v_ok     boolean;
  v_events jsonb;
  v_pets   jsonb;
begin
  -- Fail closed: only the ASSIGNED provider (or admin staff) may read.
  select exists (
    select 1 from public.orders o
     where o.id = p_order_id
       and (o.doctor_user_id = auth.uid() or public.is_admin_staff())
  ) into v_ok;
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

  select coalesce(jsonb_agg(jsonb_build_object(
           'event_type', e.event_type, 'actor_role', e.actor_role,
           'detail', e.detail - 'amount_cents' - 'stripe_payment_intent_id'
                            - 'stripe_checkout_session_id' - 'pricing_outcome',
           'created_at', e.created_at) order by e.created_at), '[]'::jsonb)
    into v_events
    from public.order_additional_pet_request_events e
   where e.request_id = v_req.id
     and e.event_type in ('clarification_requested','resubmitted',
                          'submitted_for_review','provider_approved','provider_rejected');

  select (public.additional_pet_effective_state(p_order_id))->'original_pets' into v_pets;

  -- Explicit SAFE field list. No amount_cents, no pricing_outcome, no Stripe id,
  -- no refund field, no attribution.
  return jsonb_build_object(
    'found',            true,
    'request_id',       v_req.id,
    'status',           v_req.status,
    'service_type',     v_req.service_type,
    'new_pet',          v_req.new_pet,
    'original_pets',    coalesce(v_pets, '[]'::jsonb),
    'target_pet_count', v_req.target_pet_count,
    'provider_decision', v_req.provider_decision,
    'provider_decision_reason', v_req.provider_decision_reason,
    'clarification_history', v_events,
    'created_at',       v_req.created_at
  );
end;
$$;

comment on function public.get_additional_pet_request_for_provider is
  'ORDER-ADDITIONAL-PET-UPGRADE-PHASE-B-001: provider-facing projection. Explicit safe field list — never returns amount, pricing outcome, Stripe identifiers, refunds or attribution.';

-- ── 8. RLS + grants (fail closed) ───────────────────────────────────────────
alter table public.order_additional_pet_requests        enable row level security;
alter table public.order_additional_pet_requests        force  row level security;
alter table public.order_additional_pet_request_events  enable row level security;
alter table public.order_additional_pet_request_events  force  row level security;

drop policy if exists addpet_admin_select on public.order_additional_pet_requests;
create policy addpet_admin_select on public.order_additional_pet_requests
  for select to authenticated using (public.is_admin_staff());

-- The OWNING customer may read their own requests (portal status timeline).
drop policy if exists addpet_customer_select on public.order_additional_pet_requests;
create policy addpet_customer_select on public.order_additional_pet_requests
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_additional_pet_requests.order_id
       and (o.user_id = auth.uid()
            or lower(o.email) = lower(coalesce(auth.jwt()->>'email','')))
  ));

-- NO provider policy on the base table by design: a row policy cannot hide the
-- amount column. Providers read through
-- get_additional_pet_request_for_provider() only.

drop policy if exists addpet_events_admin_select on public.order_additional_pet_request_events;
create policy addpet_events_admin_select on public.order_additional_pet_request_events
  for select to authenticated using (public.is_admin_staff());

drop policy if exists addpet_events_customer_select on public.order_additional_pet_request_events;
create policy addpet_events_customer_select on public.order_additional_pet_request_events
  for select to authenticated
  using (exists (
    select 1 from public.orders o
     where o.id = order_additional_pet_request_events.order_id
       and (o.user_id = auth.uid()
            or lower(o.email) = lower(coalesce(auth.jwt()->>'email','')))
  ));

-- NOBODY with a JWT may write either table. All writes are service-role only
-- (which bypasses RLS) through the edge functions.
revoke all on public.order_additional_pet_requests
  from public, anon, authenticated;
revoke all on public.order_additional_pet_request_events
  from public, anon, authenticated;
grant select on public.order_additional_pet_requests       to authenticated;
grant select on public.order_additional_pet_request_events to authenticated;

-- Functions: revoke from EVERY role BY NAME — revoking "from public" does not
-- undo PostgreSQL's default EXECUTE grant.
revoke all on function public.additional_pet_upgrade_cents()            from public, anon, authenticated;
revoke all on function public.additional_pet_max_total()                from public, anon, authenticated;
revoke all on function public.additional_pet_effective_state(uuid)      from public, anon, authenticated;
revoke all on function public.resolve_additional_pet_pricing(uuid)      from public, anon, authenticated;
revoke all on function public.additional_pet_is_duplicate(uuid,text,text) from public, anon, authenticated;
revoke all on function public.get_additional_pet_request_for_provider(uuid) from public, anon, authenticated;
revoke all on function public.tg_addpet_immutable()                     from public, anon, authenticated;
revoke all on function public.tg_addpet_events_append_only()            from public, anon, authenticated;

-- The provider projection is the ONLY one an end-user role may call, and it
-- authorises internally on order assignment.
grant execute on function public.get_additional_pet_request_for_provider(uuid) to authenticated;
