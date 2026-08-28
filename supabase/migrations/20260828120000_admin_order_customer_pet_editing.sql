-- ADMIN-ORDER-CUSTOMER-PET-EDITING-001 · 2026-08-28 (TEST first)
--
-- Owner decision: an authorised admin must be able to correct the customer's
-- first name, last name, state and the order's pet rows from the Order Details
-- modal — on ANY order, completed ones included — because customers routinely
-- ask for spelling and state corrections and for pet changes.
--
-- What this migration is NOT
-- ──────────────────────────
--   * NOT a new billing system. The paid-entitlement gate consumes the EXISTING
--     custom-invoice flow (order_custom_payment_requests). No price is
--     hard-coded here; the admin sets the invoice amount.
--   * NOT a second pet-data format. The canonical pet row is
--     orders.assessment_answers.pets[i] exactly as
--     src/pages/assessment/components/step1/PetSection.ts defines it. Every
--     field written here comes from that contract and nothing else.
--   * NOT a competing status system. When an issued letter must be redone the
--     order goes through the ESTABLISHED transition, public.
--     reopen_order_under_review(), which already owns the notification and the
--     audit trail. No PDF is rewritten, superseded or deleted here — the
--     document-version workflow (provider-submit-letter) still owns that.
--   * NOT a licensing editor. Provider licence rows are read, never written.
--
-- Canonical sources this file reads (and must keep reading):
--   entitlement  → public.order_entitlement_snapshots.purchased_pet_limit
--                  (the purchased right under the pricing effective AT
--                  PURCHASE — never today's marketing price)
--   pet ceiling  → public.additional_pet_max_total()  (3)
--   already-added pets → public.additional_pet_effective_state().approved_added
--                  (approved add-ons live in order_additional_pet_requests and
--                  are NOT merged into assessment_answers — the ceiling must be
--                  applied to the EFFECTIVE total or an order with 2 originals
--                  plus 1 approved add-on could be edited up to 4 animals)
--   admin gate   → public.is_admin_staff()   (same gate reopen_order_under_review uses)
--   actor        → public.current_staff_actor()
--   reason rules → public.validate_reopen_reason()   (reused, not reinvented)
--
-- Everything here is idempotent: re-running the file is a no-op.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · US state normalisation (SQL side)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors src/lib/usStates.ts normalizeStateToCode(): 2-letter code, full name
-- (case-insensitive) or a Washington DC variant → canonical 2-letter code.
-- Returns NULL for anything else, so an unrecognised state can never be stored.

create or replace function public.normalize_us_state_code(p_raw text)
returns text
language plpgsql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $function$
declare
  v text := btrim(coalesce(p_raw, ''));
  v_up text;
  v_low text;
  v_dc text;
  v_codes constant text[] := array[
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
    'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
    'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
    'VT','VA','WA','WV','WI','WY'];
  v_names constant text[] := array[
    'alabama','alaska','arizona','arkansas','california','colorado','connecticut',
    'delaware','district of columbia','florida','georgia','hawaii','idaho',
    'illinois','indiana','iowa','kansas','kentucky','louisiana','maine',
    'maryland','massachusetts','michigan','minnesota','mississippi','missouri',
    'montana','nebraska','nevada','new hampshire','new jersey','new mexico',
    'new york','north carolina','north dakota','ohio','oklahoma','oregon',
    'pennsylvania','rhode island','south carolina','south dakota','tennessee',
    'texas','utah','vermont','virginia','washington','west virginia','wisconsin',
    'wyoming'];
  v_idx int;
begin
  if v = '' then return null; end if;

  v_up := upper(v);
  if v_up = any (v_codes) then return v_up; end if;

  v_low := lower(v);
  v_idx := array_position(v_names, v_low);
  if v_idx is not null then return v_codes[v_idx]; end if;

  -- DC variants: strip periods, collapse whitespace.
  v_dc := btrim(regexp_replace(replace(v_low, '.', ''), '\s+', ' ', 'g'));
  if v_dc in ('dc', 'd c', 'washington dc', 'washington d c', 'district of columbia') then
    return 'DC';
  end if;

  return null;
end;
$function$;

comment on function public.normalize_us_state_code(text) is
  'ADMIN-ORDER-CUSTOMER-PET-EDITING-001 — canonical 2-letter US state code, or NULL. Mirrors src/lib/usStates.ts normalizeStateToCode().';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · Provider ↔ state compatibility (read-only)
-- ═══════════════════════════════════════════════════════════════════════════
-- Mirrors src/pages/admin-orders/components/providerEligibility.ts
-- isProviderEligibleForState(): full-name match, abbreviation match, a stored
-- full name that maps to the abbreviation, or a state_license_numbers key.
-- Reads doctor_profiles / doctor_contacts. NEVER writes a licensing record.

create or replace function public.provider_licensed_in_state(
  p_provider_user_id uuid,
  p_state_code       text
) returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_code   text := public.normalize_us_state_code(p_state_code);
  v_states text[];
  v_lic    jsonb;
  v_email  text;
begin
  if p_provider_user_id is null then return false; end if;
  -- No usable state on the order: nothing to contradict, so nothing to warn about.
  if v_code is null then return true; end if;

  select dp.licensed_states, dp.state_license_numbers, dp.email
    into v_states, v_lic, v_email
    from public.doctor_profiles dp
   where dp.user_id = p_provider_user_id
   limit 1;

  if not found then return false; end if;

  -- doctor_contacts is the other half of the split licence store the admin
  -- Providers tab already reads; either half licensing the state is enough.
  if v_email is not null then
    select array(
      select distinct s
        from (
          select unnest(coalesce(v_states, '{}'::text[])) as s
          union all
          select unnest(coalesce(dc.licensed_states, '{}'::text[]))
            from public.doctor_contacts dc
           where lower(btrim(dc.email)) = lower(btrim(v_email))
        ) u
       where s is not null
    ) into v_states;
  end if;

  if exists (
    select 1 from unnest(coalesce(v_states, '{}'::text[])) s
     where public.normalize_us_state_code(s) = v_code
  ) then
    return true;
  end if;

  if v_lic is not null and jsonb_typeof(v_lic) = 'object' then
    if exists (
      select 1 from jsonb_object_keys(v_lic) k
       where public.normalize_us_state_code(k) = v_code
    ) then
      return true;
    end if;
  end if;

  return false;
end;
$function$;

comment on function public.provider_licensed_in_state(uuid, text) is
  'ADMIN-ORDER-CUSTOMER-PET-EDITING-001 — read-only provider/state compatibility. Mirrors providerEligibility.ts. Never writes a licence record.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · Before-state fingerprint (optimistic concurrency)
-- ═══════════════════════════════════════════════════════════════════════════
-- public.orders has no updated_at, so the stale-edit guard is a fingerprint of
-- exactly the fields this editor owns. Two admins editing the same order cannot
-- silently overwrite each other: the second save sees a changed fingerprint and
-- is refused rather than applied.

create or replace function public.order_customer_pet_fingerprint(
  p_first_name text, p_last_name text, p_state text, p_pets jsonb
) returns text
language sql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $function$
  select md5(
    coalesce(p_first_name, '') || '|' ||
    coalesce(p_last_name, '')  || '|' ||
    coalesce(p_state, '')      || '|' ||
    coalesce(p_pets, '[]'::jsonb)::text
  );
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · Durable correction record (idempotency + committed snapshot replay)
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.order_customer_pet_corrections (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id) on delete cascade,
  confirmation_id   text,
  idempotency_key   text not null,
  audit_id          uuid,
  reason            text not null,
  prior_pet_count   integer not null,
  new_pet_count     integer not null,
  name_changed      boolean not null default false,
  state_changed     boolean not null default false,
  provider_unassigned boolean not null default false,
  document_reissue_triggered boolean not null default false,
  result            jsonb not null,
  created_by        uuid,
  created_by_name   text,
  created_at        timestamptz not null default now(),
  constraint uq_order_customer_pet_corrections_idem unique (idempotency_key)
);

create index if not exists idx_order_customer_pet_corrections_order
  on public.order_customer_pet_corrections (order_id, created_at desc);

comment on table public.order_customer_pet_corrections is
  'ADMIN-ORDER-CUSTOMER-PET-EDITING-001 — one row per COMMITTED admin correction. The unique idempotency_key makes a repeated request a replay, never a second write. Holds no payment credentials and no clinical answers.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · Single-use payment authorisation ledger
-- ═══════════════════════════════════════════════════════════════════════════
-- A paid, order-linked custom payment request tagged authorizes=additional_pet
-- may authorise exactly ONE added pet, ever. The UNIQUE constraint is what
-- enforces that — not caller discipline.

create table if not exists public.order_pet_correction_authorizations (
  id                        uuid primary key default gen_random_uuid(),
  order_id                  uuid not null references public.orders(id) on delete cascade,
  custom_payment_request_id uuid not null references public.order_custom_payment_requests(id),
  correction_id             uuid references public.order_customer_pet_corrections(id) on delete set null,
  pet_id                    text,
  amount_cents              integer,
  consumed_at               timestamptz not null default now(),
  consumed_by               uuid,
  constraint uq_pet_correction_auth_request unique (custom_payment_request_id)
);

create index if not exists idx_order_pet_correction_auth_order
  on public.order_pet_correction_authorizations (order_id);

-- Covering index for the correction_id FK (Supabase performance advisor
-- `unindexed_foreign_keys`). Tiny table, but an uncovered FK also makes the
-- ON DELETE SET NULL scan the whole relation.
create index if not exists idx_order_pet_correction_auth_correction
  on public.order_pet_correction_authorizations (correction_id);

comment on table public.order_pet_correction_authorizations is
  'ADMIN-ORDER-CUSTOMER-PET-EDITING-001 — consumption ledger. UNIQUE(custom_payment_request_id) structurally prevents the same paid invoice authorising a second pet.';

alter table public.order_customer_pet_corrections      enable row level security;
alter table public.order_pet_correction_authorizations enable row level security;

-- No policies: these tables are reachable ONLY through the SECURITY DEFINER
-- functions below. Direct grants are revoked by name so a future default-grant
-- change cannot quietly open them.
revoke all on public.order_customer_pet_corrections      from public, anon, authenticated;
revoke all on public.order_pet_correction_authorizations from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · Admissible additional-pet payment evidence
-- ═══════════════════════════════════════════════════════════════════════════
-- ONLY an authoritative paid status qualifies. Explicitly NOT admissible:
--   draft / creating / open / void / expired / failed / partially_refunded /
--   refunded custom requests, and the mere existence of a Stripe
--   PaymentIntent — a PaymentIntent proves an attempt, never a settlement.
--
-- Deliberately NOT admissible either: an APPROVED order_additional_pet_requests
-- row. Its pet has already been delivered into the order and is already counted
-- by additional_pet_effective_state().approved_added, so letting it also
-- authorise a manual addition is exactly the payment-reuse this task forbids.

create or replace function public.available_additional_pet_authorizations(
  p_order_id uuid
) returns table (
  id             uuid,
  amount_cents   integer,
  paid_at        timestamptz,
  stripe_invoice_id text,
  customer_description text
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select r.id, r.amount_cents, r.paid_at, r.stripe_invoice_id, r.customer_description
    from public.order_custom_payment_requests r
   where r.order_id = p_order_id
     and r.status  = 'paid'
     and r.paid_at is not null
     and coalesce(r.refunded_amount_cents, 0) = 0
     and r.metadata ->> 'authorizes' = 'additional_pet'
     and not exists (
       select 1 from public.order_pet_correction_authorizations a
        where a.custom_payment_request_id = r.id
     )
   order by r.paid_at asc;
$function$;

comment on function public.available_additional_pet_authorizations(uuid) is
  'ADMIN-ORDER-CUSTOMER-PET-EDITING-001 — unconsumed, authoritative-paid additional-pet invoices for an order. Paid status only; a PaymentIntent alone never qualifies.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7 · Canonical pet-row normaliser
-- ═══════════════════════════════════════════════════════════════════════════
-- Builds each stored pet EXCLUSIVELY from the canonical PetSection.ts keys, so
-- an admin edit can never introduce a second pet-data shape. Optional fields
-- present on the incoming row are preserved; absent ones stay absent (a
-- version-1 historical pet must round-trip unchanged apart from real edits).

create or replace function public.normalize_order_pet_row(p_pet jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog', 'pg_temp'
as $function$
declare
  v jsonb := '{}'::jsonb;
  v_name  text := btrim(coalesce(p_pet ->> 'name', ''));
  v_type  text := btrim(coalesce(p_pet ->> 'type', ''));
  v_breed text := btrim(coalesce(p_pet ->> 'breed', ''));
  v_age   text := btrim(coalesce(p_pet ->> 'age', ''));
  v_wt    text := btrim(coalesce(p_pet ->> 'weight', ''));
  v_pid   text := btrim(coalesce(p_pet ->> 'petId', ''));
  v_narr  text := btrim(coalesce(p_pet ->> 'supportNarrative', ''));
begin
  if p_pet is null or jsonb_typeof(p_pet) <> 'object' then
    raise exception 'pet row must be a JSON object' using errcode = 'check_violation';
  end if;
  if v_name = '' then
    raise exception 'Every pet needs a name.' using errcode = 'check_violation';
  end if;
  if v_type = '' then
    raise exception 'Every pet needs an animal type.' using errcode = 'check_violation';
  end if;
  if length(v_name) > 120 or length(v_type) > 60 or length(v_breed) > 120
     or length(v_age) > 40 or length(v_wt) > 40 then
    raise exception 'A pet field is too long.' using errcode = 'check_violation';
  end if;
  if length(v_narr) > 600 then
    raise exception 'A pet note is too long (600 characters maximum).' using errcode = 'check_violation';
  end if;

  -- Required-by-contract fields, always present.
  v := v || jsonb_build_object('name', v_name, 'type', v_type,
                               'breed', v_breed, 'age', v_age, 'weight', v_wt);

  -- Additive v2 fields — written back only when the row actually carries them.
  if v_pid <> '' then v := v || jsonb_build_object('petId', v_pid); end if;
  if p_pet ? 'vaccinated' then
    v := v || jsonb_build_object('vaccinated', coalesce((p_pet ->> 'vaccinated')::boolean, false));
  end if;
  if jsonb_typeof(p_pet -> 'supportFunctions') = 'array' then
    v := v || jsonb_build_object('supportFunctions', (
      select coalesce(jsonb_agg(e), '[]'::jsonb)
        from jsonb_array_elements(p_pet -> 'supportFunctions') e
       where jsonb_typeof(e) = 'string'
    ));
  end if;
  if v_narr <> '' then v := v || jsonb_build_object('supportNarrative', v_narr); end if;

  return v;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8 · Read model for the editor
-- ═══════════════════════════════════════════════════════════════════════════
-- One admin-gated read so the browser never selects the ledger tables directly
-- and never has to reconstruct the entitlement rule for itself.

create or replace function public.admin_order_customer_pet_edit_state(
  p_order_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order     public.orders;
  v_snap      public.order_entitlement_snapshots;
  v_pets      jsonb;
  v_eff       jsonb;
  v_added     integer;
  v_auths     jsonb;
  v_provider  jsonb;
  v_docs      jsonb;
  v_limit     integer;
begin
  if not public.is_admin_staff() then
    raise exception 'admin_order_customer_pet_edit_state: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'admin_order_customer_pet_edit_state: order % not found', p_order_id;
  end if;

  select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;

  v_pets := case when jsonb_typeof(v_order.assessment_answers -> 'pets') = 'array'
                 then v_order.assessment_answers -> 'pets' else '[]'::jsonb end;

  v_eff   := public.additional_pet_effective_state(p_order_id);
  v_added := coalesce((v_eff ->> 'approved_added')::int, 0);
  v_limit := v_snap.purchased_pet_limit;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'amount_cents', a.amount_cents, 'paid_at', a.paid_at,
           'stripe_invoice_id', a.stripe_invoice_id,
           'customer_description', a.customer_description)), '[]'::jsonb)
    into v_auths
    from public.available_additional_pet_authorizations(p_order_id) a;

  if v_order.doctor_user_id is not null then
    select jsonb_build_object(
             'user_id', dp.user_id, 'full_name', dp.full_name,
             'licensed_states', to_jsonb(coalesce(dp.licensed_states, '{}'::text[])),
             'licensed_in_current_state',
               public.provider_licensed_in_state(dp.user_id, v_order.state))
      into v_provider
      from public.doctor_profiles dp
     where dp.user_id = v_order.doctor_user_id
     limit 1;
  end if;

  -- An "issued" document: a main letter that has been approved or delivered and
  -- has not already been superseded. Additional Documentation and RA uploads are
  -- deliberately excluded — they are separate artefacts with their own lifecycle.
  select jsonb_build_object(
           'issued_main_letters', count(*),
           'latest_delivered_at', max(d.delivered_at))
    into v_docs
    from public.order_documents d
   where d.order_id = p_order_id
     and d.doc_type in ('esa_letter', 'psd_letter')
     and d.superseded_at is null
     and (d.delivered_at is not null or d.approved_at is not null
          or d.review_status = 'approved');

  return jsonb_build_object(
    'ok', true,
    'order_id', v_order.id,
    'confirmation_id', v_order.confirmation_id,
    'first_name', v_order.first_name,
    'last_name', v_order.last_name,
    'state', v_order.state,
    'state_code', public.normalize_us_state_code(v_order.state),
    'pets', v_pets,
    'pet_count', jsonb_array_length(v_pets),
    'approved_added_pets', v_added,
    'effective_pet_count', jsonb_array_length(v_pets) + v_added,
    'max_total_pets', public.additional_pet_max_total(),
    'purchased_pet_limit', v_limit,
    'purchased_pet_tier', v_snap.purchased_pet_tier,
    'entitlement_confidence', v_snap.evidence_confidence,
    'entitlement_known', (v_limit is not null),
    -- Never charge to KEEP what is already on the order: an order whose stored
    -- list historically exceeds the purchased limit stays correctable, it just
    -- cannot GROW without a paid authorisation.
    'covered_pet_count', greatest(coalesce(v_limit, 0), jsonb_array_length(v_pets)),
    'available_authorizations', v_auths,
    'assigned_provider', v_provider,
    'workflow_state', public.order_workflow_state(v_order),
    'documents', v_docs,
    'has_issued_document', coalesce((v_docs ->> 'issued_main_letters')::int, 0) > 0
                           or v_order.doctor_status = 'patient_notified',
    'fingerprint', public.order_customer_pet_fingerprint(
                     v_order.first_name, v_order.last_name, v_order.state, v_pets));
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9 · THE mutation
-- ═══════════════════════════════════════════════════════════════════════════
-- One authoritative admin path. Everything below happens inside a single
-- transaction on a row-locked order: authorise, re-read, validate, gate on paid
-- entitlement, apply, consume the authorisation, audit, return the COMMITTED
-- row. Any failure raises and rolls the whole thing back, so a failed attempt
-- can never leave a success audit event or a half-applied correction.

create or replace function public.admin_update_order_customer_and_pets(
  p_order_id             uuid,
  p_first_name           text,
  p_last_name            text,
  p_state                text,
  p_pets                 jsonb,
  p_reason               text,
  p_expected_fingerprint text,
  p_idempotency_key      text,
  p_confirm              jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order        public.orders;
  v_prior        public.orders;
  v_actor        uuid := auth.uid();
  v_name         text;
  v_role         text;
  v_reason       text;
  v_replay       public.order_customer_pet_corrections;
  v_pets_before  jsonb;
  v_pets_after   jsonb := '[]'::jsonb;
  v_pet          jsonb;
  v_count_before integer;
  v_count_after  integer;
  v_added        integer;
  v_max          integer := public.additional_pet_max_total();
  v_limit        integer;
  v_covered      integer;
  v_growth       integer;
  v_auth_ids     uuid[] := '{}';
  v_auth         record;
  v_first        text;
  v_last         text;
  v_state        text;
  v_state_changed boolean;
  v_name_changed  boolean;
  v_pets_changed  boolean;
  v_removed      integer;
  v_completed    boolean;
  v_issued       boolean;
  v_prov_ok      boolean := true;
  v_unassign     boolean := false;
  v_reissue      boolean := false;
  v_reopen       jsonb;
  v_rows         integer;
  v_audit_id     uuid;
  v_correction   uuid;
  v_fp_before    text;
  v_result       jsonb;
  -- array_append(), never `|| 'literal'`: text[] || text resolves to
  -- anyarray || anyarray, so the literal is parsed as an array and the
  -- operator sees "malformed array literal" instead of the real reason.
  v_needed       text[] := '{}';
  v_snap         public.order_entitlement_snapshots;
  v_confirm      jsonb := coalesce(p_confirm, '{}'::jsonb);
begin
  -- ── 9.1 Authorisation ────────────────────────────────────────────────────
  if not public.is_admin_staff() then
    raise exception 'admin_update_order_customer_and_pets: not authorised'
      using errcode = 'insufficient_privilege';
  end if;

  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then
    raise exception 'An idempotency key is required.' using errcode = 'check_violation';
  end if;

  -- ── 9.2 Idempotent replay ────────────────────────────────────────────────
  -- A repeated request returns the ORIGINAL committed snapshot. It never adds a
  -- second pet and never writes a second audit row.
  select * into v_replay from public.order_customer_pet_corrections
   where idempotency_key = btrim(p_idempotency_key);
  if found then
    return v_replay.result || jsonb_build_object('replayed', true);
  end if;

  -- Required correction reason. Reuses the EXISTING validator so the admin sees
  -- the same rules the reopen dialog already enforces.
  v_reason := public.validate_reopen_reason(p_reason);

  -- ── 9.3 Lock and re-read ─────────────────────────────────────────────────
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'admin_update_order_customer_and_pets: order % not found', p_order_id;
  end if;
  v_prior := v_order;

  v_pets_before := case when jsonb_typeof(v_order.assessment_answers -> 'pets') = 'array'
                        then v_order.assessment_answers -> 'pets' else '[]'::jsonb end;
  v_count_before := jsonb_array_length(v_pets_before);

  -- ── 9.4 Stale-edit guard ─────────────────────────────────────────────────
  v_fp_before := public.order_customer_pet_fingerprint(
                   v_order.first_name, v_order.last_name, v_order.state, v_pets_before);
  if p_expected_fingerprint is not null
     and btrim(p_expected_fingerprint) <> ''
     and btrim(p_expected_fingerprint) <> v_fp_before then
    -- check_violation, NEVER serialization_failure. SQLSTATE 40001 is class 40
    -- (transaction rollback), which the connection pooler treats as RETRYABLE:
    -- the refusal was silently re-executed instead of returned, the HTTP request
    -- never settled, and the operator sat on a permanent "Saving…". Nothing here
    -- is retryable — the same stale fingerprint fails identically every time.
    raise exception 'This order changed since you opened the editor. Reload the order and reapply your correction.'
      using errcode = 'check_violation';
  end if;

  -- ── 9.5 Validate the customer fields ─────────────────────────────────────
  v_first := nullif(btrim(regexp_replace(coalesce(p_first_name, ''), '\s+', ' ', 'g')), '');
  v_last  := nullif(btrim(regexp_replace(coalesce(p_last_name, ''),  '\s+', ' ', 'g')), '');
  if v_first is null or v_last is null then
    raise exception 'First and last name are both required.' using errcode = 'check_violation';
  end if;
  if length(v_first) > 100 or length(v_last) > 100 then
    raise exception 'A name is too long (100 characters maximum).' using errcode = 'check_violation';
  end if;
  if v_first like '%@%' or v_last like '%@%' then
    raise exception 'A name cannot contain an email address.' using errcode = 'check_violation';
  end if;

  if nullif(btrim(coalesce(p_state, '')), '') is null then
    v_state := null;
  else
    v_state := public.normalize_us_state_code(p_state);
    if v_state is null then
      raise exception 'Enter a valid US state.' using errcode = 'check_violation';
    end if;
  end if;

  -- ── 9.6 Validate the pet rows ────────────────────────────────────────────
  if p_pets is null or jsonb_typeof(p_pets) <> 'array' then
    raise exception 'Pets must be a list.' using errcode = 'check_violation';
  end if;
  v_count_after := jsonb_array_length(p_pets);
  if v_count_after < 1 then
    raise exception 'An order must keep at least one pet.' using errcode = 'check_violation';
  end if;
  if v_count_after > v_max then
    raise exception 'An order can cover at most % pets.', v_max using errcode = 'check_violation';
  end if;

  for v_pet in select value from jsonb_array_elements(p_pets) loop
    v_pets_after := v_pets_after || jsonb_build_array(public.normalize_order_pet_row(v_pet));
  end loop;

  -- ── 9.7 Ceiling on the EFFECTIVE total ───────────────────────────────────
  -- Approved add-on pets live in order_additional_pet_requests, never in
  -- assessment_answers, so the ceiling has to be applied to original + added.
  v_added := coalesce((public.additional_pet_effective_state(p_order_id) ->> 'approved_added')::int, 0);
  if v_count_after + v_added > v_max then
    raise exception 'This order already covers % approved additional pet(s), so % pet rows would exceed the %-pet maximum.',
      v_added, v_count_after, v_max using errcode = 'check_violation';
  end if;

  -- ── 9.8 Paid entitlement gate ────────────────────────────────────────────
  select * into v_snap from public.order_entitlement_snapshots where order_id = p_order_id;
  v_limit   := v_snap.purchased_pet_limit;   -- purchased right AT PURCHASE, not today's price
  v_covered := greatest(coalesce(v_limit, 0), v_count_before);
  v_growth  := greatest(0, v_count_after - v_covered);

  if v_growth > 0 then
    for v_auth in
      select * from public.available_additional_pet_authorizations(p_order_id)
       limit v_growth
    loop
      v_auth_ids := array_append(v_auth_ids, v_auth.id);
    end loop;

    if coalesce(array_length(v_auth_ids, 1), 0) < v_growth then
      raise exception 'Additional payment required. Send a custom Additional Pet invoice and wait for payment before adding this pet.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- ── 9.9 What changed, and what must be confirmed ─────────────────────────
  v_name_changed  := (v_first is distinct from v_order.first_name)
                     or (v_last is distinct from v_order.last_name);
  v_state_changed := (v_state is distinct from v_order.state);
  v_pets_changed  := (v_pets_after is distinct from v_pets_before);
  v_removed       := greatest(0, v_count_before - v_count_after);
  v_completed     := public.order_workflow_state(v_order) = 'completed';

  select (exists (
            select 1 from public.order_documents d
             where d.order_id = p_order_id
               and d.doc_type in ('esa_letter', 'psd_letter')
               and d.superseded_at is null
               and (d.delivered_at is not null or d.approved_at is not null
                    or d.review_status = 'approved'))
          or v_order.doctor_status = 'patient_notified')
    into v_issued;

  if not (v_name_changed or v_state_changed or v_pets_changed) then
    raise exception 'Nothing to change.' using errcode = 'check_violation';
  end if;

  if v_state_changed and coalesce((v_confirm ->> 'state')::boolean, false) is not true then
    v_needed := array_append(v_needed, 'state');
  end if;
  if v_removed > 0 and coalesce((v_confirm ->> 'pet_removal')::boolean, false) is not true then
    v_needed := array_append(v_needed, 'pet_removal');
  end if;
  if v_completed and coalesce((v_confirm ->> 'completed_order')::boolean, false) is not true then
    v_needed := array_append(v_needed, 'completed_order');
  end if;

  -- Provider compatibility. Licensing records are READ here, never written.
  if v_state_changed and v_order.doctor_user_id is not null then
    v_prov_ok := public.provider_licensed_in_state(v_order.doctor_user_id, v_state);
    if not v_prov_ok then
      v_unassign := true;
      if coalesce((v_confirm ->> 'provider_reassignment')::boolean, false) is not true then
        v_needed := array_append(v_needed, 'provider_reassignment');
      end if;
    end if;
  end if;

  -- Document reissue. The correction never rewrites, supersedes or deletes an
  -- existing PDF; it routes the order back through the established provider
  -- review so a NEW version can be issued by the normal pipeline.
  if v_issued and (v_name_changed or v_state_changed or v_pets_changed) then
    v_reissue := true;
    if coalesce((v_confirm ->> 'document_reissue')::boolean, false) is not true then
      v_needed := array_append(v_needed, 'document_reissue');
    end if;
  end if;

  if array_length(v_needed, 1) is not null then
    raise exception 'Confirmation required: %', array_to_string(v_needed, ', ')
      using errcode = 'check_violation';
  end if;

  -- ── 9.10 Apply, atomically ───────────────────────────────────────────────
  -- Attribution, payment amount, paid_at, confirmation_id, email and every
  -- acquisition field are deliberately absent from this SET list.
  update public.orders
     set first_name         = v_first,
         last_name          = v_last,
         state              = v_state,
         assessment_answers = jsonb_set(
                                coalesce(assessment_answers, '{}'::jsonb),
                                '{pets}', v_pets_after, true),
         doctor_user_id     = case when v_unassign then null else doctor_user_id end,
         doctor_email       = case when v_unassign then null else doctor_email end,
         doctor_name        = case when v_unassign then null else doctor_name end,
         selected_provider  = case when v_unassign then null else selected_provider end,
         doctor_status      = case when v_unassign then 'unassigned' else doctor_status end
   where id = p_order_id
  returning * into v_order;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 or v_order.id is null then
    raise exception 'admin_update_order_customer_and_pets: expected exactly 1 updated row, got %', v_rows
      using errcode = 'internal_error';
  end if;

  select display_name, role into v_name, v_role from public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  -- ── 9.11 Audit BEFORE/AFTER ──────────────────────────────────────────────
  -- No PHI beyond the corrected identity fields, no card data, no invoice URL.
  insert into public.audit_logs (
    actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, action, description,
    old_values, new_values, metadata)
  values (
    v_actor, v_name, v_role, 'employee', 'orders', 'admin_order_details',
    'order', v_order.confirmation_id, v_order.id,
    'order_customer_pets_corrected',
    format('%s corrected customer/pet details on order %s. Reason: %s',
           v_name, v_order.confirmation_id, v_reason),
    jsonb_build_object(
      'first_name', v_prior.first_name, 'last_name', v_prior.last_name,
      'state', v_prior.state, 'pets', v_pets_before, 'pet_count', v_count_before,
      'doctor_user_id', v_prior.doctor_user_id, 'doctor_status', v_prior.doctor_status),
    jsonb_build_object(
      'first_name', v_order.first_name, 'last_name', v_order.last_name,
      'state', v_order.state, 'pets', v_pets_after, 'pet_count', v_count_after,
      'doctor_user_id', v_order.doctor_user_id, 'doctor_status', v_order.doctor_status),
    jsonb_build_object(
      'source', 'Admin Order Details',
      'confirmation_id', v_order.confirmation_id,
      'order_id', v_order.id,
      'reason', v_reason,
      'name_changed', v_name_changed,
      'state_changed', v_state_changed,
      'state_before', v_prior.state,
      'state_after', v_order.state,
      'prior_pet_count', v_count_before,
      'new_pet_count', v_count_after,
      'pets_added', greatest(0, v_count_after - v_count_before),
      'pets_removed', v_removed,
      'approved_added_pets', v_added,
      'purchased_pet_limit', v_limit,
      'entitlement_covered_count', v_covered,
      'payment_authorizations_used', to_jsonb(v_auth_ids),
      'provider_reassignment_required', v_unassign,
      'document_reissue_required', v_reissue,
      'idempotency_key', btrim(p_idempotency_key)))
  returning id into v_audit_id;

  -- ── 9.12 Durable correction record (also the idempotency claim) ──────────
  insert into public.order_customer_pet_corrections (
    order_id, confirmation_id, idempotency_key, audit_id, reason,
    prior_pet_count, new_pet_count, name_changed, state_changed,
    provider_unassigned, document_reissue_triggered,
    result, created_by, created_by_name)
  values (
    v_order.id, v_order.confirmation_id, btrim(p_idempotency_key), v_audit_id, v_reason,
    v_count_before, v_count_after, v_name_changed, v_state_changed,
    v_unassign, v_reissue,
    '{}'::jsonb, v_actor, v_name)
  returning id into v_correction;

  -- ── 9.13 Consume the payment authorisations (single-use, enforced) ───────
  if coalesce(array_length(v_auth_ids, 1), 0) > 0 then
    insert into public.order_pet_correction_authorizations (
      order_id, custom_payment_request_id, correction_id, pet_id, amount_cents, consumed_by)
    select v_order.id, r.id, v_correction,
           v_pets_after -> (v_count_after - 1) ->> 'petId',
           r.amount_cents, v_actor
      from public.order_custom_payment_requests r
     where r.id = any (v_auth_ids);
  end if;

  -- ── 9.14 Established reissue transition ──────────────────────────────────
  -- reopen_order_under_review() is the ONE canonical transition for putting an
  -- issued letter back in front of the provider. It owns its own audit row and
  -- its own provider notification; the customer is NOT emailed by it.
  if v_reissue then
    v_reopen := public.reopen_order_under_review(
                  v_order.id,
                  left('Customer details corrected — updated documentation required. ' || v_reason, 1000));
    select * into v_order from public.orders where id = p_order_id;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'correction_id', v_correction,
    'audit_id', v_audit_id,
    'order_id', v_order.id,
    'confirmation_id', v_order.confirmation_id,
    'first_name', v_order.first_name,
    'last_name', v_order.last_name,
    'state', v_order.state,
    'pets', v_pets_after,
    'prior_pet_count', v_count_before,
    'new_pet_count', v_count_after,
    'approved_added_pets', v_added,
    'effective_pet_count', v_count_after + v_added,
    'purchased_pet_limit', v_limit,
    'payment_authorizations_used', to_jsonb(v_auth_ids),
    'provider_reassignment_required', v_unassign,
    'doctor_user_id', v_order.doctor_user_id,
    'doctor_status', v_order.doctor_status,
    'document_reissue_required', v_reissue,
    'reopen', coalesce(v_reopen, 'null'::jsonb),
    'workflow_state', public.order_workflow_state(v_order),
    'fingerprint', public.order_customer_pet_fingerprint(
                     v_order.first_name, v_order.last_name, v_order.state, v_pets_after));

  update public.order_customer_pet_corrections
     set result = v_result
   where id = v_correction;

  return v_result;
end;
$function$;

comment on function public.admin_update_order_customer_and_pets(uuid, text, text, text, jsonb, text, text, text, jsonb) is
  'ADMIN-ORDER-CUSTOMER-PET-EDITING-001 — THE authoritative admin correction path for customer name/state and the canonical pet rows. Admin-gated, row-locked, atomic, idempotent, audited. Never touches attribution, payment amount, paid_at, confirmation_id, email or any issued PDF.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 10 · Privileges
-- ═══════════════════════════════════════════════════════════════════════════
-- Revoke the default PUBLIC EXECUTE by name, then grant only what the admin
-- browser session needs. `authenticated` is named explicitly (a bare
-- "from public" leaves an inherited grant in place).

revoke all on function public.normalize_us_state_code(text)                       from public, anon, authenticated;
revoke all on function public.provider_licensed_in_state(uuid, text)              from public, anon, authenticated;
revoke all on function public.order_customer_pet_fingerprint(text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.normalize_order_pet_row(jsonb)                      from public, anon, authenticated;
revoke all on function public.available_additional_pet_authorizations(uuid)       from public, anon, authenticated;
revoke all on function public.admin_order_customer_pet_edit_state(uuid)           from public, anon, authenticated;
revoke all on function public.admin_update_order_customer_and_pets(uuid, text, text, text, jsonb, text, text, text, jsonb)
  from public, anon, authenticated;

-- Only the two admin entry points are callable from a browser session, and both
-- verify public.is_admin_staff() INSIDE the function body — the grant is not the
-- authorisation, the identity check is.
grant execute on function public.admin_order_customer_pet_edit_state(uuid) to authenticated;
grant execute on function public.admin_update_order_customer_and_pets(uuid, text, text, text, jsonb, text, text, text, jsonb) to authenticated;
