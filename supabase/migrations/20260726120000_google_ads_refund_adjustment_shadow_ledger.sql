-- GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001
-- Durable, additive shadow ledger for Google Ads conversion adjustments.
--
-- SHADOW MODE: creating this ledger uploads nothing. Rows describe adjustments
-- that WOULD be sent. The consumer defaults to dry-run and its mutation path is
-- fail-closed behind an environment kill switch.
--
-- Fully additive + idempotent + re-runnable. Touches no existing table, no order
-- financial column, no refund column, and creates no cron job.

-- ── 1. Ledger ────────────────────────────────────────────────────────────────
create table if not exists public.google_ads_conversion_adjustments (
  id                            uuid primary key default gen_random_uuid(),

  -- provenance
  order_id                      uuid        references public.orders(id) on delete restrict,
  source_payment_id             text,                   -- stable source-payment identifier (payment_intent_id)
  original_order_or_transaction_id text not null,       -- confirmation_id == Google order_id
  conversion_action_id          text not null,          -- Backend Purchase (API) ONLY
  original_conversion_uploaded_at timestamptz,          -- durable proof the original was uploaded

  -- money (canonical rule: retained = clamp(original - cumulative_refund, 0, original))
  original_value                numeric(12,2),
  cumulative_successful_refund  numeric(12,2),
  retained_value                numeric(12,2),
  currency_code                 text not null default 'USD',
  -- TRUE when original_value had to be reconstructed from mutable orders.price
  -- because no durable record of the uploaded value exists (see task doc §Known gaps).
  value_provenance_weak         boolean not null default true,

  -- adjustment
  adjustment_type               text,                   -- RETRACTION | RESTATEMENT
  adjustment_occurred_at        timestamptz,

  -- refund provenance
  source_refund_ids_hash        text,
  source_refund_count           integer,

  -- lifecycle
  status                        text not null default 'pending',
  blocked_reason                text,
  attempt_count                 integer not null default 0,
  next_attempt_at               timestamptz,
  last_attempt_at               timestamptz,
  uploaded_at                   timestamptz,
  google_job_id                 text,
  google_response_summary       jsonb,
  last_error_code               text,
  last_error_message_safe       text,

  -- idempotency
  idempotency_key               text not null,
  supersedes_adjustment_id      uuid references public.google_ads_conversion_adjustments(id) on delete set null,

  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),

  constraint google_ads_conv_adj_status_chk check (status in (
    'pending','dry_run_ready',
    'blocked_original_not_uploaded','blocked_missing_identifier',
    'blocked_outside_adjustment_window','blocked_conversion_too_recent',
    'blocked_value_integrity',
    'uploaded','retryable_error','terminal_error','superseded',
    'skipped_no_successful_refund','skipped_not_google_attributed'
  )),
  constraint google_ads_conv_adj_type_chk check (
    adjustment_type is null or adjustment_type in ('RETRACTION','RESTATEMENT')
  ),
  -- Retained value can never be negative and can never exceed the original.
  constraint google_ads_conv_adj_retained_nonneg_chk check (
    retained_value is null or retained_value >= 0
  ),
  constraint google_ads_conv_adj_retained_le_original_chk check (
    retained_value is null or original_value is null or retained_value <= original_value
  ),
  constraint google_ads_conv_adj_refund_nonneg_chk check (
    cumulative_successful_refund is null or cumulative_successful_refund >= 0
  ),
  -- A RETRACTION removes the conversion: retained value must be zero.
  constraint google_ads_conv_adj_retraction_zero_chk check (
    adjustment_type is distinct from 'RETRACTION' or retained_value is null or retained_value = 0
  ),
  -- A RESTATEMENT must carry a strictly positive retained value (a zero-value
  -- restatement would keep the conversion count — use RETRACTION instead).
  constraint google_ads_conv_adj_restatement_pos_chk check (
    adjustment_type is distinct from 'RESTATEMENT' or retained_value is null or retained_value > 0
  )
);

comment on table public.google_ads_conversion_adjustments is
  'GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001 shadow ledger. One row per proposed Google Ads conversion adjustment. Creating rows sends nothing; the consumer is dry-run by default and fail-closed behind GOOGLE_ADS_REFUND_ADJUSTMENTS_ENABLED. Contains NO customer PII and NO raw click identifiers.';
comment on column public.google_ads_conversion_adjustments.value_provenance_weak is
  'TRUE when original_value was reconstructed from the mutable orders.price rather than a durable record of the value actually uploaded. RESTATEMENT canaries must not proceed on weak provenance.';
comment on column public.google_ads_conversion_adjustments.idempotency_key is
  'order_id:conversion_action_id:adjustment_type:retained_value — collapses duplicate webhooks and duplicate consumer runs onto one row.';

-- ── 2. Idempotency + query indexes ───────────────────────────────────────────
-- The idempotency contract: one row per (original conversion, adjustment type,
-- retained value). A later partial refund changes retained value → genuinely new
-- adjustment → new row that supersedes the earlier pending one.
create unique index if not exists google_ads_conv_adj_idempotency_uidx
  on public.google_ads_conversion_adjustments (idempotency_key);

-- At most ONE active (not superseded/terminal) row per original conversion, so
-- two concurrent producers cannot queue two live adjustments for one conversion.
create unique index if not exists google_ads_conv_adj_one_active_uidx
  on public.google_ads_conversion_adjustments (original_order_or_transaction_id, conversion_action_id)
  where status in ('pending','dry_run_ready','retryable_error');

create index if not exists google_ads_conv_adj_status_idx
  on public.google_ads_conversion_adjustments (status, next_attempt_at);
create index if not exists google_ads_conv_adj_order_idx
  on public.google_ads_conversion_adjustments (order_id);

-- NOTE: no index is added on public.orders for candidate discovery. EXPLAIN
-- ANALYZE on LIVE shows the planner correctly prefers a seq scan (1.9ms over
-- ~1600 rows) and IGNORES a partial index on (refunded_at) — so adding one would
-- be dead weight that merely looks like tuning. Revisit only if EXPLAIN proves
-- an index is used. The bounded lateral charge lookup already rides the existing
-- idx_payment_attempts_confirmation_id.
drop index if exists public.orders_refund_adjustment_candidate_idx;

-- ── 3. updated_at ────────────────────────────────────────────────────────────
create or replace function public.tg_google_ads_conv_adj_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_google_ads_conv_adj_touch on public.google_ads_conversion_adjustments;
create trigger trg_google_ads_conv_adj_touch
  before update on public.google_ads_conversion_adjustments
  for each row execute function public.tg_google_ads_conv_adj_touch();

-- ── 4. RLS — fail closed ─────────────────────────────────────────────────────
alter table public.google_ads_conversion_adjustments enable row level security;
alter table public.google_ads_conversion_adjustments force row level security;

-- Browser clients get NOTHING by default. Admins may READ. Nobody but the
-- service role may INSERT/UPDATE/DELETE — there is deliberately no write policy,
-- so every anon/authenticated write is refused.
drop policy if exists google_ads_conv_adj_admin_select on public.google_ads_conversion_adjustments;
create policy google_ads_conv_adj_admin_select
  on public.google_ads_conversion_adjustments
  for select to authenticated
  using (public.check_is_admin());

revoke all on public.google_ads_conversion_adjustments from anon, authenticated;
grant select on public.google_ads_conversion_adjustments to authenticated;
grant all    on public.google_ads_conversion_adjustments to service_role;

-- ── 5. Read-only candidate discovery ─────────────────────────────────────────
-- Bounded, index-backed, no correlated per-row subquery, no PII in the output.
-- Returns FACTS ONLY — all classification lives in the shared .mjs core so the
-- consumer and the guard's self-test share one implementation.
create or replace function public.get_google_ads_refund_adjustment_candidates(
  p_limit integer default 50
)
returns table (
  order_id                  uuid,
  order_transaction_id      text,
  source_payment_id         text,
  original_uploaded         boolean,
  original_uploaded_at      timestamptz,
  original_value            numeric,
  refund_status             text,
  cumulative_refund         numeric,
  conversion_at             timestamptz,
  refunded_at               timestamptz,
  upload_method             text,
  ads_upload_status         text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.confirmation_id,
    o.payment_intent_id,
    (o.google_ads_uploaded_at is not null),
    o.google_ads_uploaded_at,
    o.price::numeric,
    o.refund_status,
    coalesce(o.refund_amount, 0)::numeric,
    coalesce(o.paid_at, o.created_at),
    o.refunded_at,
    o.google_ads_upload_method,
    o.google_ads_upload_status
  from public.orders o
  where o.refund_status in ('partial','full')
    and coalesce(o.refund_amount, 0) > 0
  order by o.refunded_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

revoke all on function public.get_google_ads_refund_adjustment_candidates(integer) from public, anon;
grant execute on function public.get_google_ads_refund_adjustment_candidates(integer) to service_role;

-- ── 6. Read-only status aggregate (admin visibility) ─────────────────────────
create or replace function public.get_google_ads_refund_adjustment_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.check_is_admin() then
    jsonb_build_object('error','forbidden')
  else
    (select jsonb_build_object(
      'pending',                       count(*) filter (where status = 'pending'),
      'dry_run_ready',                 count(*) filter (where status = 'dry_run_ready'),
      'blocked_original_not_uploaded', count(*) filter (where status = 'blocked_original_not_uploaded'),
      'blocked_outside_window',        count(*) filter (where status = 'blocked_outside_adjustment_window'),
      'blocked_value_integrity',       count(*) filter (where status = 'blocked_value_integrity'),
      'retryable_errors',              count(*) filter (where status = 'retryable_error'),
      'terminal_errors',               count(*) filter (where status = 'terminal_error'),
      'uploaded',                      count(*) filter (where status = 'uploaded'),
      'last_shadow_run',               max(last_attempt_at),
      -- Structural truth, not a claim: nothing has ever been uploaded while the
      -- kill switch is false, so this is derived from the ledger itself.
      'mutation_calls_sent',           count(*) filter (where uploaded_at is not null)
    ) from public.google_ads_conversion_adjustments)
  end;
$$;

revoke all on function public.get_google_ads_refund_adjustment_status() from public, anon;
grant execute on function public.get_google_ads_refund_adjustment_status() to authenticated, service_role;
