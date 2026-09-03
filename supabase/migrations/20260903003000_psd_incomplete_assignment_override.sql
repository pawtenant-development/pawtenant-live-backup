-- PSD-INCOMPLETE-ASSIGNMENT-OVERRIDE-001
-- A narrowly scoped owner/admin exception may hand an incomplete paid PSD case
-- to a provider for follow-up, without pretending the clinical intake is complete.

create table if not exists public.psd_incomplete_assignment_overrides (
  order_id uuid primary key references public.orders(id) on delete cascade,
  reason text not null check (length(btrim(reason)) between 10 and 1000),
  approved_by text not null,
  approved_at timestamptz not null default now(),
  revoked_at timestamptz null
);

alter table public.psd_incomplete_assignment_overrides enable row level security;
revoke all on table public.psd_incomplete_assignment_overrides from public, anon, authenticated;

comment on table public.psd_incomplete_assignment_overrides is
  'Service-role-only, audited exceptions allowing assignment of a paid incomplete PSD case for provider follow-up. Never marks answers complete.';
