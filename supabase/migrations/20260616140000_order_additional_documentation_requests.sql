-- Tracked add-on invoice for "Additional Documentation" ($40) tied to a parent order.
-- LIVE mirror of TEST migration (applied via MCP apply_migration on 2026-06-16).
-- RLS adapted for LIVE: uses check_is_admin() (LIVE has no is_admin_staff()).
create table if not exists public.order_additional_documentation_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  confirmation_id text,
  customer_email text not null,
  amount_cents integer not null default 4000,
  currency text not null default 'usd',
  status text not null default 'pending',
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  requested_by text not null default 'admin',           -- 'admin' | 'customer'
  requested_by_admin_id uuid,
  requested_by_admin_name text,
  customer_message text,
  admin_note text,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addon_doc_status_chk check (status in ('pending','paid','cancelled','expired'))
);

create index if not exists idx_addon_doc_order_id on public.order_additional_documentation_requests(order_id);
create index if not exists idx_addon_doc_status on public.order_additional_documentation_requests(status);
create index if not exists idx_addon_doc_session on public.order_additional_documentation_requests(stripe_checkout_session_id);
create index if not exists idx_addon_doc_pi on public.order_additional_documentation_requests(stripe_payment_intent_id);
create index if not exists idx_addon_doc_conf on public.order_additional_documentation_requests(confirmation_id);

alter table public.order_additional_documentation_requests enable row level security;

-- Admin staff: full manage (any admin). LIVE canonical admin gate = check_is_admin().
drop policy if exists addon_doc_admin_all on public.order_additional_documentation_requests;
create policy addon_doc_admin_all on public.order_additional_documentation_requests
  for all to authenticated
  using (check_is_admin())
  with check (check_is_admin());

-- Customer: read ONLY their own requests (portal status display).
drop policy if exists addon_doc_customer_select on public.order_additional_documentation_requests;
create policy addon_doc_customer_select on public.order_additional_documentation_requests
  for select to authenticated
  using (lower(customer_email) = lower(coalesce(auth.email(), '')));

-- updated_at maintenance
create or replace function public.set_addon_doc_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists trg_addon_doc_updated_at on public.order_additional_documentation_requests;
create trigger trg_addon_doc_updated_at
  before update on public.order_additional_documentation_requests
  for each row execute function public.set_addon_doc_updated_at();
