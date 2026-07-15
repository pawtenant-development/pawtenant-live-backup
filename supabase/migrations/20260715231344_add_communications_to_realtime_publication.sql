-- LIVE-MISSED-CALL-REALTIME-NOTIFICATIONS-001
-- Add public.communications to the supabase_realtime publication so the admin
-- missed-call browser-notification listener (useAdminOpsNotifier) receives
-- INSERT/UPDATE events. RLS still applies to realtime: only admin JWTs
-- (doctor_profiles.is_admin = true) or service_role can SELECT communications
-- rows, so non-admin/anon/customer/provider subscribers receive nothing.
-- Ported from TEST migration 20260707090000_comms_realtime_notifications.sql
-- (communications arm only; orders/ai_support_notifications intentionally
-- excluded — ai_support_notifications is already published and orders is out
-- of scope for this task).
--
-- Additive + idempotent: no table / policy / grant / trigger / column / data
-- change; only publication membership.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'communications'
  ) then
    alter publication supabase_realtime add table public.communications;
  end if;
end $$;
