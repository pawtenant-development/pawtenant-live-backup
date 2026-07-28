-- ADDITIONAL-PET-...-GATING-002 · owner pricing change 2026-07-28
--
-- The paid Additional Pet package-tier upgrade moves from $20 to $30.
-- Requests already created under the $20 rule stay payable at $20.
--
-- WHY THIS NEEDED STRUCTURE RATHER THAN A CONSTANT EDIT:
--
--   1. `ck_addpet_amount_matches_outcome` hard-bound paid_upgrade to EXACTLY
--      2000. Two legal paid prices cannot coexist under it, so a $30 request
--      could not be inserted at all while a $20 request remained valid. This is
--      the single reason a one-line constant change is not sufficient.
--
--   2. `additional_pet_upgrade_cents()` was the ONE global price and every
--      surface read it live — including the RESUME path, which rebuilds an
--      expired Stripe session. Left alone, resuming a $20 request after the
--      price change would have silently re-created it at $30 and charged the
--      customer more than they were quoted. Grandfathering therefore cannot be
--      a UI concern; it has to come from the request row.
--
-- WHAT ALREADY WORKED AND IS REUSED (no redundant columns added):
--   • `order_additional_pet_requests.amount_cents` + `currency` are ALREADY the
--     per-request immutable price snapshot — `tg_addpet_immutable` raises if
--     either changes. That is the grandfather record. This migration adds the
--     VERSION LABEL that explains the amount, not a second copy of the amount.
--   • `created_at` already serves as quoted_at.
--   • `grandfathered` is deliberately DERIVED (request version <> current
--     version), never stored — a stored flag would drift out of agreement with
--     the amount it is supposed to describe.
--
-- Nothing here changes ESA/PSD/RA/annual/consultation pricing, provider
-- earnings (still none for Additional Pet), or the completed-order lock.

-- ── 1. Price versions — the ONE place a paid price is defined ───────────────
create table if not exists public.additional_pet_price_versions (
  pricing_version text primary key,
  amount_cents    integer not null check (amount_cents > 0),
  currency        text    not null default 'usd' check (currency = 'usd'),
  effective_from  timestamptz not null,
  superseded_at   timestamptz,
  note            text,
  created_at      timestamptz not null default now(),
  constraint ck_addpet_price_window check (superseded_at is null or superseded_at > effective_from)
);

comment on table public.additional_pet_price_versions is
  'GATING-002 pricing change 2026-07-28: every paid Additional Pet price that has ever been in force. A request stores the VERSION it was quoted under; the amount is read from here, never from a literal. Adding a future price is one INSERT — no DDL, no constraint edit.';

-- v1 = $20 (in force since the feature shipped), v2 = $30 (owner, 2026-07-28).
-- The v1 window is closed at exactly the moment v2 opens so the two never overlap.
insert into public.additional_pet_price_versions
  (pricing_version, amount_cents, currency, effective_from, superseded_at, note)
values
  ('v1_2000', 2000, 'usd', timestamptz '2026-07-27 00:00:00+00',
   timestamptz '2026-07-28 12:30:00+00',
   'Launch price. Requests quoted under this version remain payable at $20.'),
  ('v2_3000', 3000, 'usd', timestamptz '2026-07-28 12:30:00+00', null,
   'Owner decision 2026-07-28: paid Additional Pet upgrade is $30.')
on conflict (pricing_version) do nothing;

-- The single effective-timestamp accessor. No date comparison is written
-- anywhere else in the codebase.
create or replace function public.additional_pet_current_price()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
           'pricing_version', v.pricing_version,
           'amount_cents',    v.amount_cents,
           'currency',        v.currency,
           'effective_from',  v.effective_from)
    from public.additional_pet_price_versions v
   where v.effective_from <= now()
     and (v.superseded_at is null or v.superseded_at > now())
   order by v.effective_from desc
   limit 1
$$;

comment on function public.additional_pet_current_price is
  'GATING-002: THE current paid Additional Pet price + its version label. One row wins by effective window; there is no second definition of "today''s price".';

-- Kept for compatibility: every existing caller of additional_pet_upgrade_cents()
-- now transparently gets the CURRENT version's amount.
-- NOTE: this was IMMUTABLE and is now STABLE (it reads a table). CREATE OR
-- REPLACE re-grants EXECUTE to PUBLIC by default, so it is re-revoked below.
create or replace function public.additional_pet_upgrade_cents()
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$ select (public.additional_pet_current_price()->>'amount_cents')::integer $$;

comment on function public.additional_pet_upgrade_cents is
  'GATING-002: the CURRENT paid upgrade price in cents ($30 from 2026-07-28). For an EXISTING request always read the row''s own amount_cents instead — that is the quoted price and it is immutable.';

-- ── 2. Request-level version label + replacement linkage ────────────────────
alter table public.order_additional_pet_requests
  add column if not exists pricing_version     text,
  add column if not exists replaced_request_id uuid
    references public.order_additional_pet_requests(id);

comment on column public.order_additional_pet_requests.pricing_version is
  'GATING-002: the price version this request was QUOTED under. Immutable with amount_cents. NULL for $0 (included) and manual_review rows, which have no paid price.';
comment on column public.order_additional_pet_requests.replaced_request_id is
  'GATING-002: set when this request replaces an earlier non-resumable one (e.g. an expired $20 checkout regenerated at $30). The old row is preserved untouched at its own price.';

create index if not exists idx_addpet_pricing_version
  on public.order_additional_pet_requests (pricing_version);

-- Backfill: every existing paid request was quoted at $20 under v1.
update public.order_additional_pet_requests
   set pricing_version = 'v1_2000'
 where pricing_outcome = 'paid_upgrade'
   and amount_cents = 2000
   and pricing_version is null;

-- ── 3. Constraints: allow any KNOWN price, not one hardcoded number ─────────
-- The old CHECK named 2000 literally. Replaced by a shape check plus a trigger
-- that validates (pricing_version, amount_cents) against the versions table —
-- so a future price is an INSERT, never another constraint migration.
alter table public.order_additional_pet_requests
  drop constraint if exists ck_addpet_amount_matches_outcome;
alter table public.order_additional_pet_requests
  add constraint ck_addpet_amount_matches_outcome check (
    (pricing_outcome = 'paid_upgrade' and amount_cents > 0)
    or (pricing_outcome in ('included','manual_review') and amount_cents = 0));

create or replace function public.tg_addpet_price_version_valid()
returns trigger language plpgsql set search_path to 'public' as $$
declare v_expected integer;
begin
  if new.pricing_outcome <> 'paid_upgrade' then
    if new.pricing_version is not null then
      raise exception 'order_additional_pet_requests: a % request must not carry a paid pricing_version', new.pricing_outcome
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if new.pricing_version is null then
    raise exception 'order_additional_pet_requests: a paid_upgrade request must record the pricing_version it was quoted under'
      using errcode = 'check_violation';
  end if;

  select amount_cents into v_expected
    from public.additional_pet_price_versions
   where pricing_version = new.pricing_version;

  if v_expected is null then
    raise exception 'order_additional_pet_requests: unknown pricing_version %', new.pricing_version
      using errcode = 'check_violation';
  end if;
  if new.amount_cents <> v_expected then
    raise exception 'order_additional_pet_requests: amount % does not match pricing_version % (expected %)',
      new.amount_cents, new.pricing_version, v_expected
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_addpet_price_version_valid on public.order_additional_pet_requests;
create trigger trg_addpet_price_version_valid
  before insert or update on public.order_additional_pet_requests
  for each row execute function public.tg_addpet_price_version_valid();

-- pricing_version is part of the immutable pricing facts, exactly like the
-- amount it labels. Extend the existing immutability trigger.
create or replace function public.tg_addpet_immutable()
returns trigger language plpgsql set search_path to 'public' as $$
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

  new.updated_at := now();
  return new;
end;
$$;

-- ── 4. Engine: an active request resumes at ITS OWN price ──────────────────
-- Only the active-request branch changes. Everything else — the unpaid gate,
-- the reversed gate, the COMPLETION LOCK, service, ceiling, admin override and
-- the entitlement ladder — is preserved exactly as GATING-002 left it.
create or replace function public.resolve_additional_pet_pricing(p_order_id uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_order public.orders; v_snap public.order_entitlement_snapshots;
  v_state jsonb; v_count integer; v_tier text;
  v_active public.order_additional_pet_requests;
  v_refunded boolean; v_lock jsonb;
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

  -- COMPLETION LOCK — before every actionable outcome, before the admin
  -- override, and before any resume. A grandfathered $20 request gets no
  -- exemption: if the parent is finalised, it cannot be resumed either.
  v_lock := public.additional_pet_order_locked(p_order_id);
  if (v_lock->>'locked')::boolean then
    return jsonb_build_object('eligible', false, 'outcome', 'blocked',
      'code', 'order_completed', 'amount_cents', 0,
      'lock_reason', v_lock->>'reason', 'lock_signals', v_lock->'signals',
      'message', 'Additional pets cannot be added after the evaluation is completed. The customer must start a new evaluation with all pets included.');
  end if;

  if lower(coalesce(v_order.letter_type,'')) not in ('esa','psd') then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'service_not_resolvable', 'amount_cents', 0,
      'manual_review_code', 'service_not_resolvable',
      'manual_review_reason', 'The service type on this order is not ESA or PSD.',
      'message', 'We need to review this order before another pet can be added.');
  end if;

  -- ── ACTIVE REQUEST → RESUME AT ITS QUOTED PRICE ───────────────────────────
  -- The amount comes from the ROW, never from the current global price, so a
  -- request quoted at $20 stays $20 after the price moves to $30.
  -- eligible=false keeps `create` refused: one active request per order.
  select * into v_active from public.order_additional_pet_requests
   where order_id = p_order_id
     and status not in ('completed','rejected','refunded','cancelled')
   limit 1;
  if found then
    return jsonb_build_object(
      'eligible', false,
      'outcome', 'resume_payment',
      'code', 'resume_existing_request',
      'amount_cents', v_active.amount_cents,
      'currency', v_active.currency,
      'pricing_version', v_active.pricing_version,
      'grandfathered', (v_active.pricing_outcome = 'paid_upgrade'
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
      'code', 'max_pets_reached', 'amount_cents', 0,
      'current_pet_count', v_count, 'max_total', v_max,
      'message', format('This order already covers the maximum of %s pets.', v_max));
  end if;

  select * into v_ovr from public.order_additional_pet_eligibility_overrides
   where order_id = p_order_id;
  if found then
    if v_ovr.resolution = 'blocked' then
      return jsonb_build_object('eligible', false, 'outcome', 'blocked',
        'code', 'admin_blocked', 'amount_cents', 0, 'current_pet_count', v_count,
        'resolved_by_admin', true, 'resolved_at', v_ovr.resolved_at,
        'message', coalesce(nullif(v_ovr.resolution_note,''),
          'Adding another pet is not available for this order.'));
    end if;
    select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;
    return jsonb_build_object('eligible', true, 'outcome', v_ovr.resolution,
      'code', case when v_ovr.resolution = 'paid_upgrade'
                   then 'admin_resolved_paid_upgrade' else 'admin_resolved_included' end,
      'amount_cents', case when v_ovr.resolution = 'paid_upgrade'
                           then (v_price->>'amount_cents')::integer else 0 end,
      'currency', 'usd',
      'pricing_version', case when v_ovr.resolution = 'paid_upgrade'
                              then v_price->>'pricing_version' else null end,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
      'entitlement_snapshot_id', v_snap.id,
      'includes_ra', coalesce(v_snap.includes_ra, false), 'max_total', v_max,
      'resolved_by_admin', true, 'resolved_at', v_ovr.resolved_at);
  end if;

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
      'amount_cents', 0, 'current_pet_count', v_count,
      'manual_review_code', coalesce(v_snap.manual_review_code, 'legacy_package_unknown'),
      'manual_review_reason', v_snap.manual_review_reason,
      'message', 'We need to review this order before another pet can be added.');
  end if;

  if v_tier not in ('single','multi') then
    return jsonb_build_object('eligible', false, 'outcome', 'manual_review',
      'code', 'tier_not_provable', 'amount_cents', 0, 'current_pet_count', v_count,
      'manual_review_code', 'tier_not_provable',
      'manual_review_reason', 'The purchased pet tier could not be proven for this order.',
      'message', 'We need to review this order before another pet can be added.');
  end if;

  if v_tier = 'multi' then
    return jsonb_build_object('eligible', true, 'outcome', 'included',
      'code', 'already_covered', 'amount_cents', 0, 'currency', 'usd',
      'pricing_version', null,
      'current_pet_count', v_count, 'target_pet_count', v_count + 1,
      'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
      'entitlement_snapshot_id', v_snap.id,
      'includes_ra', coalesce(v_snap.includes_ra, false), 'max_total', v_max);
  end if;

  return jsonb_build_object('eligible', true, 'outcome', 'paid_upgrade',
    'code', 'tier_upgrade_required',
    'amount_cents', (v_price->>'amount_cents')::integer,
    'currency', v_price->>'currency',
    'pricing_version', v_price->>'pricing_version',
    'current_pet_count', v_count, 'target_pet_count', v_count + 1,
    'prior_pet_tier', v_tier, 'service_type', lower(v_order.letter_type),
    'entitlement_snapshot_id', v_snap.id,
    'includes_ra', coalesce(v_snap.includes_ra, false), 'max_total', v_max);
end;
$$;

comment on function public.resolve_additional_pet_pricing is
  'PHASE-B-001 + GATING-002 (+$30 pricing 2026-07-28): THE server-authoritative eligibility + pricing decision. Order: unpaid -> reversed -> COMPLETION LOCK -> service -> ACTIVE REQUEST (resume at the row''s own quoted price, never the current global price) -> pet ceiling -> admin override -> entitlement. New paid requests are quoted at the current version; existing $20 requests stay $20.';

-- ── 5. Grants (fail closed) ────────────────────────────────────────────────
-- CREATE OR REPLACE re-adds PostgreSQL's default EXECUTE grant to PUBLIC, so
-- every replaced function is re-revoked BY NAME here.
revoke all on public.additional_pet_price_versions from public, anon, authenticated;
grant select on public.additional_pet_price_versions to authenticated;
alter table public.additional_pet_price_versions enable row level security;
alter table public.additional_pet_price_versions force  row level security;
drop policy if exists addpet_price_versions_read on public.additional_pet_price_versions;
create policy addpet_price_versions_read on public.additional_pet_price_versions
  for select to authenticated using (public.is_admin_staff());

revoke all on function public.additional_pet_current_price()          from public, anon, authenticated;
revoke all on function public.additional_pet_upgrade_cents()          from public, anon, authenticated;
revoke all on function public.resolve_additional_pet_pricing(uuid)    from public, anon, authenticated;
revoke all on function public.tg_addpet_price_version_valid()         from public, anon, authenticated;
revoke all on function public.tg_addpet_immutable()                   from public, anon, authenticated;
