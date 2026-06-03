-- NEWSLETTER SUBSCRIBERS (replaces the Footer Readdy form POST)
-- ----------------------------------------------------------------------------
-- The site-wide footer newsletter form previously POSTed to readdy.ai, which
-- triggered a generic Readdy "form submission received" email branded for the
-- Readdy site. It now writes here via the newsletter-subscribe edge function
-- (service role only). No third-party submission, no Readdy email.
--
-- RLS is enabled with NO public policies → anon/auth clients cannot read or
-- write directly; only the service-role edge function can insert.
-- Idempotent + non-destructive.
-- ----------------------------------------------------------------------------

create table if not exists public.newsletter_subscribers (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  source      text,
  page_url    text,
  status      text not null default 'subscribed',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per email. The edge function always stores email lowercased, so a
-- plain unique index on the column is sufficient and lets PostgREST upsert with
-- onConflict: "email".
create unique index if not exists newsletter_subscribers_email_key
  on public.newsletter_subscribers (email);

alter table public.newsletter_subscribers enable row level security;

-- No GRANTs / policies for anon or authenticated → table is service-role only.
revoke all on public.newsletter_subscribers from anon;
revoke all on public.newsletter_subscribers from authenticated;
