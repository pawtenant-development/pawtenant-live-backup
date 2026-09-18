-- Owner-approved correction, 2026-09-18.
--
-- My Pet ESA and SignMyESA are real production partners. Their organizations
-- were left in sandbox mode, which caused My Pet ESA's real ESA orders to
-- snapshot the obsolete $55 sandbox rate even though its production rate was
-- already $60. No affected order has been invoiced or reconciled.
--
-- This migration:
--   * makes both partners active/production;
--   * guarantees $60 open ESA and PSD rate cards in both environments;
--   * corrects every uninvoiced real My Pet ESA $55 snapshot to $60;
--   * corrects the corresponding uncredited/uninvoiced charge events;
--   * leaves provider earnings, other fulfillment costs, and Vitala untouched;
--   * records one durable admin audit entry.
--
-- The finance tables are deliberately immutable. The two trigger bypasses
-- below exist only inside this atomic DO statement. Any exception rolls the
-- whole statement back, including the trigger state.

do $migration$
declare
  v_now                    timestamptz := clock_timestamp();
  v_my_pet_id              uuid;
  v_signmyesa_id           uuid;
  v_partner                record;
  v_service                text;
  v_environment            text;
  v_open                   public.partner_rate_cards%rowtype;
  v_template               public.partner_rate_cards%rowtype;
  v_next_version           integer;
  v_production_rate        public.partner_rate_cards%rowtype;
  v_old_financial_count    integer := 0;
  v_old_billable_count     integer := 0;
  v_expected_billable      integer := 0;
  v_financials_updated     integer := 0;
  v_billables_updated      integer := 0;
  v_order_ids              uuid[] := '{}'::uuid[];
  v_vitala_before          jsonb;
  v_vitala_after           jsonb;
begin
  -- Block partner acceptance/completion just for this short correction so no
  -- transaction can snapshot the obsolete rate between reads and writes.
  execute 'lock table public.partner_organizations in access exclusive mode';
  execute 'lock table public.partner_rate_cards in access exclusive mode';
  execute 'lock table public.partner_order_financials in access exclusive mode';
  execute 'lock table public.partner_billable_events in access exclusive mode';

  select id into v_my_pet_id
    from public.partner_organizations
   where slug = 'my-pet-esa';
  if v_my_pet_id is null then
    raise exception 'partner rate correction refused: My Pet ESA not found';
  end if;

  select id into v_signmyesa_id
    from public.partner_organizations
   where slug = 'signmyesa';
  if v_signmyesa_id is null then
    raise exception 'partner rate correction refused: SignMyESA not found';
  end if;

  if exists (
    select 1 from public.partner_organizations
     where id in (v_my_pet_id, v_signmyesa_id) and status = 'terminated'
  ) then
    raise exception 'partner rate correction refused: a target partner is terminated';
  end if;

  -- Snapshot Vitala so this migration proves it did not alter the separately
  -- agreed $40 sandbox configuration.
  select jsonb_build_object(
    'organization', to_jsonb(p),
    'rates', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.service, r.environment, r.version)
        from public.partner_rate_cards r
       where r.partner_id = p.id
    ), '[]'::jsonb)
  ) into v_vitala_before
    from public.partner_organizations p
   where p.slug = 'vitala-health';

  -- Guarantee one current $60 card for ESA and PSD in sandbox and production.
  -- Keeping sandbox at $60 prevents recurrence even if an operator temporarily
  -- switches an organization back while diagnosing an integration.
  for v_partner in
    select id, slug
      from public.partner_organizations
     where id in (v_my_pet_id, v_signmyesa_id)
     order by slug
  loop
    foreach v_service in array array['esa'::text, 'psd'::text]
    loop
      foreach v_environment in array array['sandbox'::text, 'production'::text]
      loop
        if (
          select count(*)
            from public.partner_rate_cards
           where partner_id = v_partner.id
             and service = v_service
             and environment = v_environment
             and effective_to is null
        ) > 1 then
          raise exception
            'partner rate correction refused: multiple open cards for %, %, %',
            v_partner.slug, v_service, v_environment;
        end if;

        select * into v_open
          from public.partner_rate_cards
         where partner_id = v_partner.id
           and service = v_service
           and environment = v_environment
           and effective_to is null
         order by version desc
         limit 1
         for update;

        if found and v_open.wholesale_unit_price_cents = 6000 then
          continue;
        end if;

        if found then
          update public.partner_rate_cards
             set effective_to = v_now
           where id = v_open.id;
          v_template := v_open;
        else
          select * into v_template
            from public.partner_rate_cards
           where partner_id = v_partner.id
             and service = v_service
           order by (environment = 'sandbox') desc, version desc
           limit 1;
          if not found then
            raise exception
              'partner rate correction refused: no template card for %, %',
              v_partner.slug, v_service;
          end if;
        end if;

        select coalesce(max(version), 0) + 1 into v_next_version
          from public.partner_rate_cards
         where partner_id = v_partner.id
           and service = v_service
           and environment = v_environment;

        insert into public.partner_rate_cards (
          partner_id, service, environment, version,
          wholesale_unit_price_cents, currency,
          provider_earning_rule, provider_earning_rule_version,
          effective_from, effective_to,
          additional_service_rules, cancellation_policy, notes, created_by
        ) values (
          v_partner.id, v_service, v_environment, v_next_version,
          6000, coalesce(v_template.currency, 'USD'),
          coalesce(v_template.provider_earning_rule, 'doctor_profiles.per_order_rate'),
          coalesce(v_template.provider_earning_rule_version, 1),
          v_now, null,
          coalesce(v_template.additional_service_rules, '{}'::jsonb),
          coalesce(v_template.cancellation_policy, '{}'::jsonb),
          'Owner-approved $60 production correction (2026-09-18)', null
        );
      end loop;
    end loop;
  end loop;

  update public.partner_organizations
     set status = 'active', production_enabled = true
   where id in (v_my_pet_id, v_signmyesa_id)
     and (status is distinct from 'active' or production_enabled is distinct from true);

  select * into v_production_rate
    from public.partner_rate_cards
   where partner_id = v_my_pet_id
     and service = 'esa'
     and environment = 'production'
     and effective_to is null
     and wholesale_unit_price_cents = 6000
   order by version desc
   limit 1;
  if not found then
    raise exception 'partner rate correction refused: My Pet ESA production ESA $60 card missing';
  end if;

  -- Refuse rather than rewrite any amount that has entered invoice,
  -- reconciliation, credit, test, or non-ESA history.
  if exists (
    select 1
      from public.partner_order_financials f
      join public.orders o on o.id = f.order_id
     where f.partner_id = v_my_pet_id
       and f.wholesale_fee_cents = 5500
       and (
         o.order_origin is distinct from 'partner'
         or coalesce(o.is_test, false)
         or lower(coalesce(o.letter_type, '')) <> 'esa'
         or f.invoice_status is distinct from 'uninvoiced'
         or f.invoice_id is not null
       )
  ) then
    raise exception 'partner rate correction refused: an affected financial row is not safe to correct';
  end if;

  if exists (
    select 1
      from public.partner_invoice_lines l
      join public.partner_billable_events e on e.id = l.billable_event_id
     where e.partner_id = v_my_pet_id and e.amount_cents = 5500
  ) then
    raise exception 'partner rate correction refused: an affected charge is already invoiced';
  end if;

  if exists (
    select 1
      from public.partner_billable_events credit
      join public.partner_billable_events charge on charge.id = credit.related_event_id
     where charge.partner_id = v_my_pet_id
       and charge.event_kind = 'charge'
       and charge.amount_cents = 5500
       and credit.event_kind = 'credit'
  ) then
    raise exception 'partner rate correction refused: an affected charge has a credit';
  end if;

  if exists (
    select 1
      from public.partner_order_reconciliations r
      join public.partner_order_financials f on f.order_id = r.order_id
     where f.partner_id = v_my_pet_id and f.wholesale_fee_cents = 5500
  ) then
    raise exception 'partner rate correction refused: an affected order is reconciled';
  end if;

  select count(*),
         coalesce(array_agg(f.order_id order by f.order_id), '{}'::uuid[]),
         count(*) filter (where f.billable_status = 'billable')
    into v_old_financial_count, v_order_ids, v_expected_billable
    from public.partner_order_financials f
    join public.orders o on o.id = f.order_id
   where f.partner_id = v_my_pet_id
     and f.wholesale_fee_cents = 5500
     and o.order_origin = 'partner'
     and not coalesce(o.is_test, false)
     and lower(coalesce(o.letter_type, '')) = 'esa'
     and f.invoice_status = 'uninvoiced'
     and f.invoice_id is null;

  select count(*) into v_old_billable_count
    from public.partner_billable_events e
   where e.partner_id = v_my_pet_id
     and e.event_kind = 'charge'
     and e.event_type = 'clinical_work_completed'
     and e.amount_cents = 5500;

  if v_old_billable_count <> v_expected_billable then
    raise exception
      'partner rate correction refused: $55 billable snapshots (%) do not match $55 charge events (%)',
      v_expected_billable, v_old_billable_count;
  end if;

  if v_old_financial_count > 0 then
    if not exists (
      select 1 from pg_trigger
       where tgrelid = 'public.partner_order_financials'::regclass
         and tgname = 'partner_financials_immutable' and tgenabled = 'O'
    ) or not exists (
      select 1 from pg_trigger
       where tgrelid = 'public.partner_billable_events'::regclass
         and tgname = 'partner_billable_append_only' and tgenabled = 'O'
    ) then
      raise exception 'partner rate correction refused: an immutability trigger was not enabled before correction';
    end if;

    -- Atomic, tightly scoped owner-approved correction. If anything below
    -- fails, PostgreSQL rolls back both data and trigger state.
    execute 'alter table public.partner_order_financials disable trigger partner_financials_immutable';
    execute 'alter table public.partner_billable_events disable trigger partner_billable_append_only';

    update public.partner_order_financials f
       set wholesale_fee_cents = 6000,
           rate_card_id = v_production_rate.id,
           rate_card_version = v_production_rate.version,
           updated_at = v_now
      from public.orders o
     where o.id = f.order_id
       and f.partner_id = v_my_pet_id
       and f.wholesale_fee_cents = 5500
       and o.order_origin = 'partner'
       and not coalesce(o.is_test, false)
       and lower(coalesce(o.letter_type, '')) = 'esa'
       and f.invoice_status = 'uninvoiced'
       and f.invoice_id is null;
    get diagnostics v_financials_updated = row_count;

    update public.partner_billable_events e
       set amount_cents = 6000,
           rate_card_id = v_production_rate.id,
           rate_card_version = v_production_rate.version,
           reason = concat_ws('; ', nullif(e.reason, ''),
             'Owner-approved correction from $55 to $60 before invoicing (2026-09-18)')
     where e.partner_id = v_my_pet_id
       and e.event_kind = 'charge'
       and e.event_type = 'clinical_work_completed'
       and e.amount_cents = 5500;
    get diagnostics v_billables_updated = row_count;

    execute 'alter table public.partner_order_financials enable trigger partner_financials_immutable';
    execute 'alter table public.partner_billable_events enable trigger partner_billable_append_only';

    if v_financials_updated <> v_old_financial_count then
      raise exception
        'partner rate correction failed: expected % financial rows, updated %',
        v_old_financial_count, v_financials_updated;
    end if;
    if v_billables_updated <> v_old_billable_count then
      raise exception
        'partner rate correction failed: expected % charge rows, updated %',
        v_old_billable_count, v_billables_updated;
    end if;
  end if;

  -- Durable postconditions.
  if exists (
    select 1
      from public.partner_order_financials f
      join public.orders o on o.id = f.order_id
     where f.partner_id = v_my_pet_id
       and o.order_origin = 'partner'
       and not coalesce(o.is_test, false)
       and f.wholesale_fee_cents <> 6000
  ) then
    raise exception 'partner rate correction failed: a real My Pet ESA order is not $60';
  end if;

  if exists (
    select 1 from public.partner_billable_events
     where partner_id = v_my_pet_id
       and event_kind = 'charge'
       and amount_cents <> 6000
  ) then
    raise exception 'partner rate correction failed: a My Pet ESA charge is not $60';
  end if;

  if exists (
    select 1
      from public.partner_organizations
     where id in (v_my_pet_id, v_signmyesa_id)
       and (status <> 'active' or not production_enabled)
  ) then
    raise exception 'partner rate correction failed: a target partner is not production-enabled';
  end if;

  if (
    select count(*)
      from public.partner_rate_cards r
     where r.partner_id in (v_my_pet_id, v_signmyesa_id)
       and r.service in ('esa', 'psd')
       and r.environment in ('sandbox', 'production')
       and r.effective_to is null
       and r.wholesale_unit_price_cents = 6000
  ) <> 8 then
    raise exception 'partner rate correction failed: expected eight open $60 cards';
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.partner_order_financials'::regclass
       and tgname = 'partner_financials_immutable' and tgenabled = 'O'
  ) or not exists (
    select 1 from pg_trigger
     where tgrelid = 'public.partner_billable_events'::regclass
       and tgname = 'partner_billable_append_only' and tgenabled = 'O'
  ) then
    raise exception 'partner rate correction failed: an immutability trigger is not enabled';
  end if;

  select jsonb_build_object(
    'organization', to_jsonb(p),
    'rates', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.service, r.environment, r.version)
        from public.partner_rate_cards r
       where r.partner_id = p.id
    ), '[]'::jsonb)
  ) into v_vitala_after
    from public.partner_organizations p
   where p.slug = 'vitala-health';
  if v_vitala_after is distinct from v_vitala_before then
    raise exception 'partner rate correction failed: Vitala changed';
  end if;

  if (v_old_financial_count > 0 or v_old_billable_count > 0) and not exists (
    select 1 from public.audit_logs
     where action = 'partner_rate_historical_correction'
       and entity_type = 'partner_organization'
       and entity_id = 'my-pet-esa'
       and metadata->>'migration' = '20260918175350'
  ) then
    perform private.partner_admin_audit(
      'partner_rate_historical_correction',
      'partner_organization',
      'my-pet-esa',
      jsonb_build_object(
        'migration', '20260918175350',
        'owner_approved', true,
        'reason', 'Real production orders incorrectly snapshotted the sandbox $55 wholesale rate',
        'from_cents', 5500,
        'to_cents', 6000,
        'financial_rows_corrected', v_financials_updated,
        'billable_events_corrected', v_billables_updated,
        'affected_order_ids', to_jsonb(v_order_ids),
        'invoiced_rows', 0,
        'reconciled_rows', 0,
        'credited_rows', 0,
        'provider_earnings_changed', false,
        'vitala_changed', false
      )
    );
  end if;
end;
$migration$;
