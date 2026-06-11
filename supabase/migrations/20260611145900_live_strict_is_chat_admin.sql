-- LIVE PREREQUISITE for Company OS department/RBAC foundation.
-- TEST already had a strict is_chat_admin(); LIVE does not. LIVE's check_is_admin()
-- only checks is_admin=true, which is TOO BROAD — it would let finance/support
-- admins write department/RBAC data. The Company OS write gates (RLS + helpers in
-- 20260611150000) depend on is_chat_admin(), so we create it here matching TEST's
-- exact strict semantics: is_admin AND is_active AND role IN ('owner','admin_manager').
-- Additive + idempotent. Does NOT replace or touch check_is_admin(). LIVE (cvwbozlbbmrjxznknouq).

create or replace function public.is_chat_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1
      from public.doctor_profiles dp
     where dp.user_id   = auth.uid()
       and dp.is_admin  = true
       and dp.is_active = true
       and dp.role      in ('owner', 'admin_manager')
  );
$function$;

grant execute on function public.is_chat_admin() to authenticated;
