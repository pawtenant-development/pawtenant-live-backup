-- PARTNER-PORTAL-MANUAL-ORDER-BILLING-AND-SIMPLE-ASSESSMENT-002 (part 5)
--
-- The weekly invoicing job runs without a user session, so its gate is a
-- shared secret verified INSIDE the database against the vault — the same
-- pattern the payout cron and the partner webhook dispatcher already use.
-- The secret value itself is never compared in application code and never
-- appears in a function argument default, a log line or an audit row.
create or replace function public.verify_partner_invoice_cron_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $fn$
  select coalesce(
    nullif(p_secret, '') = (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'partner_weekly_invoice_secret'
      limit 1
    ),
    false
  );
$fn$;

-- Callable by the service role only (which needs no grant). Nobody signed in
-- through the browser has any business testing this secret.
revoke all on function public.verify_partner_invoice_cron_secret(text) from public, anon, authenticated;
