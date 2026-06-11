-- TEST-COMPANY-OS — hardening follow-up: trigger/internal functions should not
-- be directly callable through the API. Triggers run with table-owner context
-- and do not need EXECUTE for api roles. Flagged by Supabase security advisor.
-- Idempotent. TEST (opudhofjbydrljgleofq) only.

revoke execute on function public.company_os_set_updated_at() from public, anon, authenticated;
revoke execute on function public.company_os_audit_actor() from public, anon, authenticated;
revoke execute on function public.company_os_audit_team_member() from public, anon, authenticated;
revoke execute on function public.company_os_audit_hr_private() from public, anon, authenticated;
revoke execute on function public.company_os_audit_department_role() from public, anon, authenticated;
