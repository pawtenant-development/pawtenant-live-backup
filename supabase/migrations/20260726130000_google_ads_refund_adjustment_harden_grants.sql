-- GOOGLE-ADS-REFUND-ADJUSTMENT-CONSUMER-001 (security hardening)
--
-- Caught by the Supabase security advisor after the initial rollout.
--
-- Supabase default privileges GRANT EXECUTE on newly created public functions to
-- `anon` and `authenticated` as explicit role grants. `REVOKE ... FROM public`
-- does NOT remove an explicit role grant, so despite the revoke in the creating
-- migration, `get_google_ads_refund_adjustment_candidates` was still callable by
-- ANY signed-in user — exposing refunded-order confirmation IDs and Stripe
-- payment-intent IDs.
--
-- Lesson: on this project, always revoke from `authenticated` EXPLICITLY, and
-- verify with has_function_privilege() rather than assuming the revoke worked.

revoke all on function public.get_google_ads_refund_adjustment_candidates(integer)
  from public, anon, authenticated;
grant execute on function public.get_google_ads_refund_adjustment_candidates(integer)
  to service_role;

-- Trigger function: pin search_path (advisor: role-mutable search_path) and keep
-- it off the public API surface.
alter function public.tg_google_ads_conv_adj_touch() set search_path = public;
revoke all on function public.tg_google_ads_conv_adj_touch()
  from public, anon, authenticated;

-- get_google_ads_refund_adjustment_status() intentionally REMAINS callable by
-- `authenticated`: it is the admin read surface, gates itself internally with
-- check_is_admin() (returning {"error":"forbidden"} to non-admins), and exposes
-- only aggregate counts — no identifiers, no PII.
--
-- Verified on LIVE with the role actually enforced (set local role authenticated):
--   auth_can_call_candidates = false
--   auth_can_call_status     = true
--   auth insert/update/delete= false
--   anon select              = false
--   rows visible to non-admin= 0
