-- Company OS role hierarchy level (additive, nullable). UI-labelled hierarchy:
-- owner = Boss/Owner/Super Admin, then domain_owner, sub_domain_owner,
-- team_coordinator, user. Does NOT replace doctor_profiles.role/is_admin (which
-- still drive permissions) or the free-text authority_level. Pure labeling field
-- for now — no access-control change. Idempotent.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-06-01.
alter table public.team_members add column if not exists domain_role text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'team_members_domain_role_chk') then
    alter table public.team_members add constraint team_members_domain_role_chk
      check (domain_role is null or domain_role in
             ('owner','domain_owner','sub_domain_owner','team_coordinator','user'));
  end if;
end $$;
