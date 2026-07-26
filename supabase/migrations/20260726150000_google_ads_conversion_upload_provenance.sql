-- GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-READINESS-001
-- Immutable provenance for ORIGINAL Google Ads conversion uploads.
--
-- WHY: adjustments must be computed against the value that was ACTUALLY sent to
-- Google. Today that value is unrecoverable — `orders.price` is mutable, and the
-- uploader's audit insert targets a nonexistent `audit_logs.details` column
-- inside an empty catch (1 audit row for 404 uploads). Restatements therefore
-- cannot be trusted, and retractions cannot prove the identity they retract.
--
-- This table is APPEND-ONLY for successful uploads: once a row records a
-- successful upload it can never be updated or deleted (enforced by trigger),
-- so the value sent to Google becomes permanent evidence.
--
-- Additive + idempotent. No existing table altered. No cron. No Google call.

create table if not exists public.google_ads_conversion_uploads (
  id                        uuid primary key default gen_random_uuid(),

  -- identity
  order_id                  uuid        references public.orders(id) on delete restrict,
  order_transaction_id      text not null,          -- confirmation_id == Google order_id
  conversion_action_id      text not null,

  -- exactly what was sent
  uploaded_value            numeric(12,2),
  currency_code             text not null default 'USD',
  conversion_date_time      text,                   -- the literal string sent to Google
  attribution_method        text,                   -- gclid_only | gclid_plus_hashed_email | hashed_email_only
  google_ads_api_version    text,

  -- request/response provenance
  upload_attempt_id         uuid not null default gen_random_uuid(),
  google_job_id             text,
  google_request_id         text,
  uploaded_at               timestamptz,
  upload_status             text not null,          -- success | failed
  response_summary_safe     jsonb,                  -- NO PII, NO raw click IDs
  error_code_safe           text,

  idempotency_key           text not null,
  created_at                timestamptz not null default now(),

  constraint gac_uploads_status_chk check (upload_status in ('success','failed')),
  -- A successful upload must carry the evidence that makes it usable.
  constraint gac_uploads_success_evidence_chk check (
    upload_status <> 'success'
    or (uploaded_at is not null and uploaded_value is not null and conversion_date_time is not null)
  ),
  constraint gac_uploads_value_nonneg_chk check (uploaded_value is null or uploaded_value >= 0)
);

comment on table public.google_ads_conversion_uploads is
  'GOOGLE-ADS-REFUND-ADJUSTMENT-CANARY-READINESS-001. Immutable provenance of ORIGINAL Google Ads conversion uploads: the exact value/identity sent. Successful rows are append-only (update/delete blocked by trigger). Contains NO customer PII and NO raw click identifiers.';
comment on column public.google_ads_conversion_uploads.uploaded_value is
  'The exact conversionValue sent to Google. This — never the mutable orders.price — is the basis a RESTATEMENT may be computed from.';

-- One successful upload per (order, conversion action). Retries cannot create a
-- duplicate successful record.
create unique index if not exists gac_uploads_success_uidx
  on public.google_ads_conversion_uploads (order_transaction_id, conversion_action_id)
  where upload_status = 'success';

create unique index if not exists gac_uploads_idempotency_uidx
  on public.google_ads_conversion_uploads (idempotency_key);

create index if not exists gac_uploads_order_idx
  on public.google_ads_conversion_uploads (order_id);

-- ── Immutability: successful rows can never be changed or removed ────────────
create or replace function public.tg_gac_uploads_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'DELETE') then
    if old.upload_status = 'success' then
      raise exception 'google_ads_conversion_uploads: successful upload provenance is immutable (delete blocked)';
    end if;
    return old;
  end if;
  if old.upload_status = 'success' then
    raise exception 'google_ads_conversion_uploads: successful upload provenance is immutable (update blocked)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gac_uploads_immutable on public.google_ads_conversion_uploads;
create trigger trg_gac_uploads_immutable
  before update or delete on public.google_ads_conversion_uploads
  for each row execute function public.tg_gac_uploads_immutable();

revoke all on function public.tg_gac_uploads_immutable() from public, anon, authenticated;

-- ── RLS: fail closed ─────────────────────────────────────────────────────────
alter table public.google_ads_conversion_uploads enable row level security;
alter table public.google_ads_conversion_uploads force row level security;

drop policy if exists gac_uploads_admin_select on public.google_ads_conversion_uploads;
create policy gac_uploads_admin_select
  on public.google_ads_conversion_uploads
  for select to authenticated
  using (public.check_is_admin());

revoke all on public.google_ads_conversion_uploads from anon, authenticated;
grant select on public.google_ads_conversion_uploads to authenticated;
grant all    on public.google_ads_conversion_uploads to service_role;

-- ── Value provenance classification ──────────────────────────────────────────
-- Historical conversions are NEVER assigned a guessed uploaded value. Each order
-- is classified so callers can see exactly how much evidence exists:
--   proven        — an immutable successful upload row records the exact value
--   reconstructed — the conversion was uploaded (google_ads_uploaded_at) but the
--                   value is only inferable from the mutable orders.price
--   unknown       — no evidence the conversion was ever uploaded
create or replace function public.get_google_ads_upload_provenance(
  p_order_transaction_id text
)
returns table (
  order_transaction_id  text,
  provenance            text,
  uploaded_value        numeric,
  conversion_date_time  text,
  conversion_action_id  text,
  uploaded_at           timestamptz,
  identity_proven       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.confirmation_id,
    case
      when u.id is not null then 'proven'
      when o.google_ads_uploaded_at is not null then 'reconstructed'
      else 'unknown'
    end,
    u.uploaded_value,                       -- NULL unless proven: never guessed
    u.conversion_date_time,
    coalesce(u.conversion_action_id, null),
    coalesce(u.uploaded_at, o.google_ads_uploaded_at),
    (u.id is not null or o.google_ads_uploaded_at is not null)
  from public.orders o
  left join public.google_ads_conversion_uploads u
    on u.order_transaction_id = o.confirmation_id
   and u.upload_status = 'success'
  where o.confirmation_id = p_order_transaction_id;
$$;

revoke all on function public.get_google_ads_upload_provenance(text) from public, anon, authenticated;
grant execute on function public.get_google_ads_upload_provenance(text) to service_role;
