-- PAWTENANT-LIVE-STAFF-AUTHORITY-HARDENING-001
-- Restores the disposable rbac-* LIVE fixtures to their declared baseline after
-- scripts/qa-admin-escalation-probe.mjs has exercised the escalation paths.
-- Bounded to the RFC 2606 `.invalid` fixture accounts; touches nothing else.
--
-- Writes go through admin_set_staff_access()'s transaction-local flag rather
-- than PATCHing the columns directly, because the privilege guard refuses a
-- privilege-column write that did not come from an authorised path. A direct
-- database connection is already privileged, so the flag is belt and braces.
begin;

select set_config('pawtenant.staff_authority_write', 'on', true);

update public.doctor_profiles d
   set is_admin = false, role = 'provider', custom_tab_access = null, bio = null, phone = null
  from auth.users u
 where u.id = d.user_id and u.email = 'rbac-provider-qa@pawtenant-live.invalid';

update public.doctor_profiles d
   set is_admin = true, role = 'support', custom_tab_access = null
  from auth.users u
 where u.id = d.user_id and u.email = 'rbac-staff-qa@pawtenant-live.invalid';

update public.doctor_profiles d
   set is_admin = true, role = 'admin_manager', custom_tab_access = null
  from auth.users u
 where u.id = d.user_id and u.email = 'rbac-admin-qa@pawtenant-live.invalid';

-- The profile-less fixture must have NO profile: that is the whole point of it.
delete from public.doctor_profiles d
 using auth.users u
 where u.id = d.user_id and u.email = 'rbac-customer-qa@pawtenant-live.invalid';

delete from private.staff_authority s
 using auth.users u
 where u.id = s.user_id and u.email = 'rbac-customer-qa@pawtenant-live.invalid';

select set_config('pawtenant.staff_authority_write', 'off', true);

commit;

select u.email, d.role, d.is_admin, d.custom_tab_access, (d.user_id is not null) as has_profile,
       s.access_role, s.is_active
  from auth.users u
  left join public.doctor_profiles d on d.user_id = u.id
  left join private.staff_authority s on s.user_id = u.id
 where u.email like 'rbac-%-qa@pawtenant-live.invalid' order by u.email;
