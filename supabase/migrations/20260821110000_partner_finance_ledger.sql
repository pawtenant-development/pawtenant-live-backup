-- PARTNER-CLINICAL-FULFILLMENT-FOUNDATION-001 · Slice 7 · Part B
-- The partner finance ledger: billable events → manual invoices → payments.
--
-- THE BILLING TRIGGER (documented business rule, not invented here)
-- docs/partner-api/ARCHITECTURE-NOTE.md §7: "clinical_work_completed — the
-- billable + payable event", and a not-qualified outcome "is still billable to
-- the partner". Concretely: the order's completion transition
-- (doctor_status → 'patient_notified', which order_workflow_state classifies
-- as 'completed' and partner_clinical_state maps to 'clinical_work_completed').
-- Enforced by a DATABASE trigger on orders so every completion path — the
-- notify-patient-letter partner arm, admin actions, ad-hoc SQL — produces
-- exactly one billable event. Acceptance, assignment, approval and delivery
-- are explicitly NOT billing triggers.
--
-- THE WHOLESALE AMOUNT (documented divergence, deliberate)
-- The brief said "rate card effective at the billable timestamp"; the
-- committed Slice 1 architecture freezes economics AT ACCEPTANCE
-- ("editing the rate card later can never rewrite this order's economics" —
-- 20260818183659, partner_order_financials). The frozen acceptance snapshot
-- wins: the billable event carries partner_order_financials.wholesale_fee_cents
-- with its rate_card_id/version provenance. The amount always ORIGINATES from
-- the active database rate card (resolved at acceptance) — never a hardcoded
-- historical value — and a rate change between acceptance and completion can
-- never rewrite an accepted order's price. Flagged for the owner in the Slice 7
-- report; switching policies later is a one-line change in the trigger.
--
-- SEPARATION OF MONEY (unchanged invariants)
--   * receivable  = partner wholesale (this ledger)
--   * provider pay = doctor_earnings.doctor_amount from per_order_rate (untouched)
--   * margin       = receivable − provider snapshot (partner_order_financials)
--   * orders.price = NULL for partner orders and is never read here.
--
-- LEDGER DISCIPLINE
--   * Events are append-only: no UPDATE ever; DELETE only via the explicit
--     app.fixture_cleanup escape hatch (TEST hygiene).
--   * Exactly one CHARGE per order (partial unique index).
--   * Voids/credits are NEW rows (event_kind='credit', negative amount,
--     related_event_id) — the original event is never touched.
--   * Invoices: manual, admin-only. draft → issued → partially_paid → paid,
--     draft|issued|partially_paid → void. Financial fields freeze at issue.
--     Overdue is DERIVED in the aging view, never stored.
--   * Lines snapshot the event amount; an event may sit on at most one
--     non-void invoice (trigger-enforced so voiding an invoice releases its
--     events for re-billing).
--   * Payments are manual reconciliation entries, append-only; a negative
--     amount is an explicit correction entry.
--   * ESA and PSD stay separate per event (service column); additional
--     services would be separate event_types (none exist yet).
--
-- ACCESS: admins (is_chat_admin()) read; ALL writes go through SECURITY
-- DEFINER RPCs that re-check is_chat_admin(). Providers, customers and anon
-- have zero access. No automated charging of any kind.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Billable events
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.partner_billable_events (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references public.orders(id),
  partner_id        uuid not null references public.partner_organizations(id),
  service           text not null check (service in ('esa','psd')),
  event_kind        text not null check (event_kind in ('charge','credit')),
  event_type        text not null,
  related_event_id  uuid references public.partner_billable_events(id),
  occurred_at       timestamptz not null default now(),
  amount_cents      integer not null,
  currency          text not null default 'USD',
  rate_card_id      uuid not null,
  rate_card_version integer not null,
  reason            text,
  created_by        text not null,
  created_at        timestamptz not null default now(),
  constraint partner_billable_amount_sign check (
    (event_kind = 'charge' and amount_cents > 0)
    or (event_kind = 'credit' and amount_cents < 0)
  ),
  constraint partner_billable_credit_links check (
    event_kind = 'charge' or related_event_id is not null
  )
);

comment on table public.partner_billable_events is
  'Append-only partner receivable ledger. One charge per order at clinical '
  'completion (ARCHITECTURE-NOTE §7); amounts carry the acceptance-frozen rate '
  'card provenance. Credits are new rows referencing the original — nothing is '
  'ever mutated.';

create unique index if not exists partner_billable_one_charge_per_order
  on public.partner_billable_events (order_id)
  where event_kind = 'charge';

create index if not exists partner_billable_partner_idx
  on public.partner_billable_events (partner_id, service, occurred_at);

create or replace function public.tg_partner_billable_append_only()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_billable_events: the ledger is append-only (event %)', old.id
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on'
  then
    raise exception 'partner_billable_events: finalized events are never deleted (event %)', old.id
      using errcode = '23514';
  end if;
  return old;
end;
$function$;

drop trigger if exists partner_billable_append_only on public.partner_billable_events;
create trigger partner_billable_append_only
  before update or delete on public.partner_billable_events
  for each row execute function public.tg_partner_billable_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The billing trigger on orders — completion mints the charge
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.tg_partner_billable_on_completion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_fin public.partner_order_financials%rowtype;
begin
  -- Only a partner order's transition INTO completed mints anything.
  if new.order_origin is distinct from 'partner' then return new; end if;
  if new.doctor_status is distinct from 'patient_notified' then return new; end if;
  if old.doctor_status is not distinct from new.doctor_status then return new; end if;

  -- Fail CLOSED on missing economics: an accepted partner order always has a
  -- financial snapshot; completing one without it would create unpriced work.
  select * into v_fin from public.partner_order_financials where order_id = new.id;
  if not found then
    raise exception 'partner order % has no financial snapshot — completion refused', new.id
      using errcode = '23514';
  end if;

  -- Idempotent: the partial unique index makes a re-completion (reopen →
  -- complete again) a no-op rather than a duplicate receivable.
  insert into public.partner_billable_events (
    order_id, partner_id, service, event_kind, event_type,
    occurred_at, amount_cents, currency, rate_card_id, rate_card_version, created_by
  ) values (
    new.id, new.partner_id, lower(coalesce(new.letter_type, 'esa')), 'charge', 'clinical_work_completed',
    now(), v_fin.wholesale_fee_cents, v_fin.currency, v_fin.rate_card_id, v_fin.rate_card_version,
    'orders_completion_trigger'
  )
  on conflict (order_id) where event_kind = 'charge' do nothing;

  -- Workflow columns only — the economics stay frozen (immutability trigger).
  update public.partner_order_financials
     set billable_status = 'billable',
         billable_reason = 'clinical work completed',
         clinical_completed_at = coalesce(clinical_completed_at, now()),
         invoice_eligible = true
   where order_id = new.id and billable_status = 'pending';

  new.partner_clinical_completed_at := coalesce(new.partner_clinical_completed_at, now());
  return new;
end;
$function$;

drop trigger if exists partner_billable_on_completion on public.orders;
create trigger partner_billable_on_completion
  before update on public.orders
  for each row execute function public.tg_partner_billable_on_completion();

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Invoices, lines, payments
-- ═══════════════════════════════════════════════════════════════════════════

create sequence if not exists public.partner_invoice_number_seq;

create table if not exists public.partner_invoices (
  id             uuid primary key default gen_random_uuid(),
  partner_id     uuid not null references public.partner_organizations(id),
  invoice_number text not null unique,
  status         text not null default 'draft'
                 check (status in ('draft','issued','partially_paid','paid','void')),
  currency       text not null default 'USD',
  total_cents    integer not null default 0,
  issued_at      timestamptz,
  due_at         timestamptz,
  voided_at      timestamptz,
  void_reason    text,
  created_by     text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.partner_invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.partner_invoices(id) on delete cascade,
  billable_event_id uuid not null references public.partner_billable_events(id),
  service           text not null,
  description       text not null,
  amount_cents      integer not null,
  created_at        timestamptz not null default now()
);

create index if not exists partner_invoice_lines_event_idx
  on public.partner_invoice_lines (billable_event_id);

create table if not exists public.partner_invoice_payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.partner_invoices(id) on delete cascade,
  amount_cents integer not null check (amount_cents <> 0),
  received_at  timestamptz not null default now(),
  method       text,
  reference    text,
  note         text,
  recorded_by  text not null,
  created_at   timestamptz not null default now()
);

-- Invoice state machine + freeze-at-issue. Payments/void flow through RPCs,
-- but the TRIGGER is the boundary: a direct UPDATE cannot bend the rules.
create or replace function public.tg_partner_invoice_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on' then
      raise exception 'partner_invoices: invoices are voided, never deleted (%)', old.invoice_number
        using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status is distinct from new.status then
    if not (
      (old.status = 'draft'          and new.status in ('issued','void'))
      or (old.status = 'issued'         and new.status in ('partially_paid','paid','void'))
      or (old.status = 'partially_paid' and new.status in ('paid','void'))
    ) then
      raise exception 'partner_invoices: illegal status transition % -> % (%)',
        old.status, new.status, old.invoice_number using errcode = '23514';
    end if;
    if new.status = 'void' and coalesce(new.void_reason, '') = '' then
      raise exception 'partner_invoices: voiding requires a reason (%)', old.invoice_number
        using errcode = '23514';
    end if;
  end if;

  -- Financial identity freezes the moment the invoice leaves draft.
  if old.status <> 'draft' then
    if new.total_cents    is distinct from old.total_cents
       or new.currency       is distinct from old.currency
       or new.partner_id     is distinct from old.partner_id
       or new.invoice_number is distinct from old.invoice_number
       or new.issued_at      is distinct from old.issued_at
       or new.due_at         is distinct from old.due_at
    then
      raise exception 'partner_invoices: issued invoices are immutable (%)', old.invoice_number
        using errcode = '23514';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

drop trigger if exists partner_invoice_guard on public.partner_invoices;
create trigger partner_invoice_guard
  before update or delete on public.partner_invoices
  for each row execute function public.tg_partner_invoice_guard();

-- Lines: never updated; only draft invoices may gain or lose lines; an event
-- may sit on at most ONE non-void invoice (voiding releases it for re-billing).
create or replace function public.tg_partner_invoice_line_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_invoice_lines: lines are immutable snapshots' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    if coalesce(current_setting('app.fixture_cleanup', true), '') = 'on' then return old; end if;
    select status into v_status from public.partner_invoices where id = old.invoice_id;
    -- Cascade from a fixture delete finds no parent; a live parent must be draft.
    if v_status is not null and v_status <> 'draft' then
      raise exception 'partner_invoice_lines: lines of a non-draft invoice are immutable'
        using errcode = '23514';
    end if;
    return old;
  end if;

  select status into v_status from public.partner_invoices where id = new.invoice_id;
  if v_status is distinct from 'draft' then
    raise exception 'partner_invoice_lines: lines may only be added to a draft invoice'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.partner_invoice_lines l
    join public.partner_invoices i on i.id = l.invoice_id
    where l.billable_event_id = new.billable_event_id and i.status <> 'void'
  ) then
    raise exception 'partner_invoice_lines: event % is already billed on a non-void invoice',
      new.billable_event_id using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists partner_invoice_line_guard on public.partner_invoice_lines;
create trigger partner_invoice_line_guard
  before insert or update or delete on public.partner_invoice_lines
  for each row execute function public.tg_partner_invoice_line_guard();

-- Payments: append-only reconciliation entries.
create or replace function public.tg_partner_invoice_payment_guard()
returns trigger
language plpgsql
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
begin
  if tg_op = 'UPDATE' then
    raise exception 'partner_invoice_payments: payments are append-only; record a correction entry'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE'
     and coalesce(current_setting('app.fixture_cleanup', true), '') <> 'on'
  then
    raise exception 'partner_invoice_payments: payments are never deleted' using errcode = '23514';
  end if;
  return old;
end;
$function$;

drop trigger if exists partner_invoice_payment_guard on public.partner_invoice_payments;
create trigger partner_invoice_payment_guard
  before update or delete on public.partner_invoice_payments
  for each row execute function public.tg_partner_invoice_payment_guard();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Admin RPCs — the only write path
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.partner_create_draft_invoice(
  p_partner_id uuid, p_event_ids uuid[], p_due_days integer default 30
)
returns public.partner_invoices
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_inv  public.partner_invoices%rowtype;
  v_ev   public.partner_billable_events%rowtype;
  v_id   uuid;
  v_total integer := 0;
  v_number text;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if p_event_ids is null or cardinality(p_event_ids) = 0 then
    raise exception 'at least one billable event is required' using errcode = '22023';
  end if;

  v_number := 'PTINV-' || to_char(now(), 'YYYY') || '-'
              || lpad(nextval('public.partner_invoice_number_seq')::text, 4, '0');

  insert into public.partner_invoices (partner_id, invoice_number, created_by, due_at)
  values (p_partner_id, v_number,
          coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', 'admin'),
          now() + make_interval(days => greatest(p_due_days, 1)))
  returning * into v_inv;

  foreach v_id in array p_event_ids loop
    select * into v_ev from public.partner_billable_events where id = v_id for update;
    if not found then
      raise exception 'billable event % not found', v_id using errcode = 'P0002';
    end if;
    -- Cross-partner isolation: an event can only ever be billed to its own org.
    if v_ev.partner_id <> p_partner_id then
      raise exception 'billable event % belongs to a different partner', v_id using errcode = '42501';
    end if;
    insert into public.partner_invoice_lines (invoice_id, billable_event_id, service, description, amount_cents)
    values (v_inv.id, v_ev.id, v_ev.service,
            initcap(v_ev.service) || ' clinical fulfillment — ' || v_ev.event_type
              || case when v_ev.event_kind = 'credit' then ' (credit)' else '' end,
            v_ev.amount_cents);
    v_total := v_total + v_ev.amount_cents;
  end loop;

  update public.partner_invoices set total_cents = v_total where id = v_inv.id;
  select * into v_inv from public.partner_invoices where id = v_inv.id;
  return v_inv;
end;
$function$;

create or replace function public.partner_issue_invoice(p_invoice_id uuid)
returns public.partner_invoices
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare v_inv public.partner_invoices%rowtype;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  update public.partner_invoices
     set status = 'issued', issued_at = now(), due_at = coalesce(due_at, now() + interval '30 days')
   where id = p_invoice_id and status = 'draft'
  returning * into v_inv;
  if not found then
    raise exception 'invoice not found or not draft' using errcode = 'P0002';
  end if;
  return v_inv;
end;
$function$;

create or replace function public.partner_void_invoice(p_invoice_id uuid, p_reason text)
returns public.partner_invoices
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare v_inv public.partner_invoices%rowtype;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if coalesce(p_reason, '') = '' then
    raise exception 'a void reason is required' using errcode = '22023';
  end if;
  update public.partner_invoices
     set status = 'void', voided_at = now(), void_reason = p_reason
   where id = p_invoice_id and status in ('draft','issued','partially_paid')
  returning * into v_inv;
  if not found then
    raise exception 'invoice not found or not voidable' using errcode = 'P0002';
  end if;
  return v_inv;
end;
$function$;

create or replace function public.partner_record_invoice_payment(
  p_invoice_id uuid, p_amount_cents integer, p_method text default 'manual',
  p_reference text default null, p_received_at timestamptz default now(), p_note text default null
)
returns public.partner_invoices
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_inv  public.partner_invoices%rowtype;
  v_paid integer;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  select * into v_inv from public.partner_invoices where id = p_invoice_id for update;
  if not found then raise exception 'invoice not found' using errcode = 'P0002'; end if;
  if v_inv.status not in ('issued','partially_paid') then
    raise exception 'payments may only be recorded on issued invoices (%)', v_inv.status
      using errcode = '23514';
  end if;

  insert into public.partner_invoice_payments (invoice_id, amount_cents, method, reference, received_at, note, recorded_by)
  values (p_invoice_id, p_amount_cents, p_method, p_reference, p_received_at, p_note,
          coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', 'admin'));

  select coalesce(sum(amount_cents), 0) into v_paid
    from public.partner_invoice_payments where invoice_id = p_invoice_id;

  update public.partner_invoices
     set status = case when v_paid >= total_cents then 'paid' else 'partially_paid' end
   where id = p_invoice_id
     and status is distinct from (case when v_paid >= total_cents then 'paid' else 'partially_paid' end);

  select * into v_inv from public.partner_invoices where id = p_invoice_id;
  return v_inv;
end;
$function$;

create or replace function public.partner_credit_billable_event(p_event_id uuid, p_reason text)
returns public.partner_billable_events
language plpgsql
security definer
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $function$
declare
  v_ev public.partner_billable_events%rowtype;
  v_credit public.partner_billable_events%rowtype;
begin
  if not coalesce(public.is_chat_admin(), false) then
    raise exception 'admin access required' using errcode = '42501';
  end if;
  if coalesce(p_reason, '') = '' then
    raise exception 'a credit reason is required' using errcode = '22023';
  end if;
  select * into v_ev from public.partner_billable_events where id = p_event_id;
  if not found then raise exception 'billable event not found' using errcode = 'P0002'; end if;
  if v_ev.event_kind <> 'charge' then
    raise exception 'only charges can be credited' using errcode = '23514';
  end if;
  if exists (select 1 from public.partner_billable_events
              where related_event_id = p_event_id and event_kind = 'credit') then
    raise exception 'event % is already fully credited', p_event_id using errcode = '23514';
  end if;

  insert into public.partner_billable_events (
    order_id, partner_id, service, event_kind, event_type, related_event_id,
    occurred_at, amount_cents, currency, rate_card_id, rate_card_version, reason, created_by
  ) values (
    v_ev.order_id, v_ev.partner_id, v_ev.service, 'credit', 'void_credit', v_ev.id,
    now(), -v_ev.amount_cents, v_ev.currency, v_ev.rate_card_id, v_ev.rate_card_version, p_reason,
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'email', 'admin')
  ) returning * into v_credit;
  return v_credit;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Aging view (derived overdue — never stored)
-- ═══════════════════════════════════════════════════════════════════════════

create or replace view public.partner_invoice_aging
with (security_invoker = true) as
select i.id, i.partner_id, o.display_name as partner_name, i.invoice_number, i.status,
       i.currency, i.total_cents,
       coalesce(p.paid_cents, 0) as paid_cents,
       i.total_cents - coalesce(p.paid_cents, 0) as balance_cents,
       i.issued_at, i.due_at,
       (i.status in ('issued','partially_paid') and i.due_at is not null and i.due_at < now()) as is_overdue,
       case when i.status in ('issued','partially_paid') and i.due_at is not null and i.due_at < now()
            then extract(day from now() - i.due_at)::integer else 0 end as days_overdue
from public.partner_invoices i
join public.partner_organizations o on o.id = i.partner_id
left join (
  select invoice_id, sum(amount_cents) as paid_cents
  from public.partner_invoice_payments group by invoice_id
) p on p.invoice_id = i.id;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Access — admins read, RPCs write, everyone else gets nothing
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.partner_billable_events  enable row level security;
alter table public.partner_billable_events  force row level security;
alter table public.partner_invoices         enable row level security;
alter table public.partner_invoices         force row level security;
alter table public.partner_invoice_lines    enable row level security;
alter table public.partner_invoice_lines    force row level security;
alter table public.partner_invoice_payments enable row level security;
alter table public.partner_invoice_payments force row level security;

revoke all on public.partner_billable_events  from public, anon, authenticated;
revoke all on public.partner_invoices         from public, anon, authenticated;
revoke all on public.partner_invoice_lines    from public, anon, authenticated;
revoke all on public.partner_invoice_payments from public, anon, authenticated;
revoke all on public.partner_invoice_aging    from public, anon, authenticated;

grant select on public.partner_billable_events  to authenticated;
grant select on public.partner_invoices         to authenticated;
grant select on public.partner_invoice_lines    to authenticated;
grant select on public.partner_invoice_payments to authenticated;
grant select on public.partner_invoice_aging    to authenticated;
grant all on public.partner_billable_events  to service_role;
grant all on public.partner_invoices         to service_role;
grant all on public.partner_invoice_lines    to service_role;
grant all on public.partner_invoice_payments to service_role;
grant select on public.partner_invoice_aging to service_role;
grant usage on sequence public.partner_invoice_number_seq to service_role, authenticated;

drop policy if exists partner_billable_admin_read on public.partner_billable_events;
create policy partner_billable_admin_read on public.partner_billable_events
  for select to authenticated using (public.is_chat_admin());
drop policy if exists partner_invoices_admin_read on public.partner_invoices;
create policy partner_invoices_admin_read on public.partner_invoices
  for select to authenticated using (public.is_chat_admin());
drop policy if exists partner_invoice_lines_admin_read on public.partner_invoice_lines;
create policy partner_invoice_lines_admin_read on public.partner_invoice_lines
  for select to authenticated using (public.is_chat_admin());
drop policy if exists partner_invoice_payments_admin_read on public.partner_invoice_payments;
create policy partner_invoice_payments_admin_read on public.partner_invoice_payments
  for select to authenticated using (public.is_chat_admin());

revoke all on function public.partner_create_draft_invoice(uuid, uuid[], integer) from public, anon;
revoke all on function public.partner_issue_invoice(uuid) from public, anon;
revoke all on function public.partner_void_invoice(uuid, text) from public, anon;
revoke all on function public.partner_record_invoice_payment(uuid, integer, text, text, timestamptz, text) from public, anon;
revoke all on function public.partner_credit_billable_event(uuid, text) from public, anon;
grant execute on function public.partner_create_draft_invoice(uuid, uuid[], integer) to authenticated, service_role;
grant execute on function public.partner_issue_invoice(uuid) to authenticated, service_role;
grant execute on function public.partner_void_invoice(uuid, text) to authenticated, service_role;
grant execute on function public.partner_record_invoice_payment(uuid, integer, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.partner_credit_billable_event(uuid, text) to authenticated, service_role;
