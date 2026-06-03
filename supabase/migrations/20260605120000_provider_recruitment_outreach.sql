-- PAWTENANT-PROVIDER-RECRUITMENT-OUTREACH-EMAILS-TEST
-- Admin-side outreach log for emailing potential providers in states that
-- still need coverage. Writes happen only via the send-provider-recruitment-email
-- Edge Function (service role, bypasses RLS); admins read via RLS.

create table if not exists public.provider_recruitment_outreach (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  recipient_name text,
  target_states text[] not null default '{}',
  provider_type text,
  subject text not null,
  message_html text,
  message_text text,
  status text not null default 'sent',
  resend_message_id text,
  sent_by uuid,
  sent_by_name text,
  sent_at timestamptz,
  last_error text,
  source text not null default 'admin_provider_recruitment',
  is_test boolean not null default false,
  notes text,
  reply_status text default 'not_tracked',
  follow_up_at timestamptz,
  state_license_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pro_recruit_email on public.provider_recruitment_outreach (recipient_email);
create index if not exists idx_pro_recruit_created on public.provider_recruitment_outreach (created_at desc);
create index if not exists idx_pro_recruit_status on public.provider_recruitment_outreach (status);

alter table public.provider_recruitment_outreach enable row level security;

-- Admin-only read (doctor_profiles.is_admin via LIVE check_is_admin() helper —
-- LIVE equivalent of TEST's is_chat_admin(); same doctor_profiles is_admin gate
-- used by provider_applications.admins_all_applications).
-- No INSERT/UPDATE policy for authenticated users: all writes go through the
-- Edge Function with the service role key, which bypasses RLS.
drop policy if exists pro_recruit_select_admin on public.provider_recruitment_outreach;
create policy pro_recruit_select_admin on public.provider_recruitment_outreach
  for select to authenticated
  using (public.check_is_admin());

revoke all on public.provider_recruitment_outreach from anon;

-- updated_at maintenance
create or replace function public.set_provider_recruitment_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_provider_recruitment_updated_at() from anon, public;

drop trigger if exists trg_pro_recruit_updated_at on public.provider_recruitment_outreach;
create trigger trg_pro_recruit_updated_at
  before update on public.provider_recruitment_outreach
  for each row execute function public.set_provider_recruitment_updated_at();
