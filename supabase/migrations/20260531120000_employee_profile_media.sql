-- Employee profile/cover media: storage bucket + own-folder policies,
-- a self-only RPC to persist image URLs, and display_picture_url in presence.
-- Additive + idempotent. Employees only; providers use separate buckets.
-- Applied to TEST (opudhofjbydrljgleofq) via Supabase MCP on 2026-05-31.

-- 1) Public image bucket (headshots/covers are not sensitive HR docs; rendered via <img src>).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-profile-media','employee-profile-media', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) Storage policies: public read; authenticated may write only inside their own
--    {auth.uid()}/... folder.
drop policy if exists epm_public_read on storage.objects;
create policy epm_public_read on storage.objects
  for select to public
  using (bucket_id = 'employee-profile-media');

drop policy if exists epm_self_insert on storage.objects;
create policy epm_self_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'employee-profile-media'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists epm_self_update on storage.objects;
create policy epm_self_update on storage.objects
  for update to authenticated
  using (bucket_id = 'employee-profile-media'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'employee-profile-media'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists epm_self_delete on storage.objects;
create policy epm_self_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'employee-profile-media'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- 3) Self-only media update RPC. Updates ONLY the two image columns for the
--    caller's own team_members row (NULL = leave unchanged). This avoids granting
--    employees blanket UPDATE on team_members (title/department/authority stay locked).
create or replace function public.set_my_profile_media(
  p_display_picture_url text default null,
  p_cover_photo_url text default null
)
returns public.team_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.team_members;
begin
  update public.team_members
     set display_picture_url = coalesce(p_display_picture_url, display_picture_url),
         cover_photo_url     = coalesce(p_cover_photo_url, cover_photo_url),
         updated_at          = now()
   where user_id = auth.uid()
   returning * into v_row;

  if v_row.id is null then
    raise exception 'no team member for current user';
  end if;

  return v_row;
end;
$$;

grant execute on function public.set_my_profile_media(text, text) to authenticated;

-- 4) Extend get_team_presence to include display_picture_url (additive column).
drop function if exists public.get_team_presence();
create function public.get_team_presence()
returns table (
  team_member_id uuid,
  display_name text,
  employee_code text,
  display_picture_url text,
  is_clocked_in boolean,
  away_status text,
  away_reason text,
  presence text,
  status_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.team_members tm
    where tm.user_id = auth.uid() and tm.is_active is true
  ) and not exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = auth.uid()
      and (dp.is_admin is true or coalesce(dp.role,'') in ('owner','admin_manager'))
  ) then
    raise exception 'not authorized';
  end if;

  return query
  select
    tm.id,
    tm.display_name,
    tm.employee_code,
    tm.display_picture_url,
    (coalesce(oc.open_count,0) > 0) as is_clocked_in,
    coalesce(ep.status, 'available') as away_status,
    ep.away_reason,
    case
      when coalesce(oc.open_count,0) = 0 then 'red'
      when coalesce(ep.status,'available') <> 'available' then 'orange'
      else 'green'
    end as presence,
    ep.updated_at
  from public.team_members tm
  left join public.employee_presence ep on ep.team_member_id = tm.id
  left join lateral (
    select count(*) as open_count
    from public.time_clock_entries tce
    where tce.team_member_id = tm.id and tce.clock_out_at is null
  ) oc on true
  where tm.is_active is true
  order by
    case
      when coalesce(oc.open_count,0) = 0 then 2
      when coalesce(ep.status,'available') <> 'available' then 1
      else 0
    end,
    tm.display_name;
end;
$$;

grant execute on function public.get_team_presence() to authenticated;
