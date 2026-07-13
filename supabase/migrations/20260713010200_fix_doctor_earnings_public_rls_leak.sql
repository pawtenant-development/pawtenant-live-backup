-- SECURITY (Slice 1): narrow doctor_earnings service-role policy from TO public
-- (over-broad — confirmed present on LIVE) to TO service_role. Provider/admin
-- reads use their own separate policies (unaffected). Idempotent.
drop policy if exists service_role_all_earnings on public.doctor_earnings;
create policy service_role_all_earnings on public.doctor_earnings
  for all to service_role using (true) with check (true);
