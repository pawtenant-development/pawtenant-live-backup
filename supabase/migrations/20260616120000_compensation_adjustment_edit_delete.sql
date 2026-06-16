-- LIVE MIRROR of TEST 567c752 — compensation adjustment EDIT + DELETE support.
--
-- Mirrors the TEST feature surgically. LIVE already has the full compensation
-- infrastructure (employee_compensation_adjustments table, request/review/list
-- RPCs, salary RPCs) byte-compatible with TEST, and the same helper functions
-- (is_chat_admin = strict owner/admin_manager, is_accounts_admin, finance role,
-- team_member_department_roles.can_approve_bonus, company_os_actor_name/role).
-- So NO helper-name adaptation was required.
--
-- Adds soft-delete (deleted_at / deleted_by / delete_reason) + two SECURITY
-- DEFINER RPCs (update_compensation_adjustment, delete_compensation_adjustment),
-- and adds `and a.deleted_at is null` to every salary/accounts reader.
--
-- The 5 readers below are recreated from LIVE's CURRENT bodies (create or replace,
-- signatures unchanged → grants preserved) with ONLY the deleted_at filter added.
-- Additive + idempotent. LIVE (cvwbozlbbmrjxznknouq) only.

-- ── 1. soft-delete columns ───────────────────────────────────────────────────
alter table public.employee_compensation_adjustments
  add column if not exists deleted_at  timestamptz,
  add column if not exists deleted_by  uuid references public.team_members(id) on delete set null,
  add column if not exists delete_reason text;

create index if not exists eca_active_member_period_idx
  on public.employee_compensation_adjustments (team_member_id, period_month)
  where deleted_at is null;

-- ── 2. update_compensation_adjustment ────────────────────────────────────────
create or replace function public.update_compensation_adjustment(
  p_adjustment_id uuid,
  p_type text,
  p_amount_pkr numeric,
  p_period_month date,
  p_reason text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_tm uuid := public.current_team_member_id();
  v_is_admin boolean := public.is_chat_admin();
  v_is_finance boolean := false;
  v_can_approve boolean := false;
  v_adj public.employee_compensation_adjustments%rowtype;
  v_actor_name text := public.company_os_actor_name();
  v_actor_role text := public.company_os_actor_role();
  v_emp_name text;
  v_period date;
  v_reason text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_adj from public.employee_compensation_adjustments
   where id = p_adjustment_id for update;
  if v_adj.id is null then raise exception 'adjustment not found'; end if;
  if v_adj.deleted_at is not null then raise exception 'adjustment was deleted'; end if;
  if v_adj.status = 'rejected' then raise exception 'rejected adjustments cannot be edited'; end if;

  if p_type is null or p_type not in ('bonus','commission','adjustment','reimbursement','deduction') then
    raise exception 'invalid adjustment type';
  end if;
  if p_amount_pkr is null or p_amount_pkr = 0 then raise exception 'amount required'; end if;
  if p_type <> 'adjustment' and p_amount_pkr <= 0 then
    raise exception 'amount must be positive for %', p_type;
  end if;
  v_period := (date_trunc('month', coalesce(p_period_month, v_adj.period_month)))::date;
  v_reason := nullif(trim(coalesce(p_reason,'')), '');

  select exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = v_uid and dp.is_active = true and coalesce(dp.role,'') = 'finance'
  ) into v_is_finance;

  select exists (
    select 1
    from public.team_member_department_roles r_rev
    join public.team_member_department_roles r_tgt
      on r_tgt.department_id = r_rev.department_id
     and r_tgt.team_member_id = v_adj.team_member_id
     and r_tgt.is_active
     and (r_tgt.ends_at is null or r_tgt.ends_at >= current_date)
    where r_rev.team_member_id = v_caller_tm
      and r_rev.is_active
      and (r_rev.ends_at is null or r_rev.ends_at >= current_date)
      and r_rev.can_approve_bonus
  ) into v_can_approve;

  if not (v_is_admin or v_is_finance or v_can_approve) then
    raise exception 'not authorized to edit compensation adjustments for this employee';
  end if;

  if v_adj.requested_by is not distinct from v_caller_tm and not v_is_admin then
    raise exception 'you cannot edit your own request';
  end if;

  update public.employee_compensation_adjustments
     set type = p_type,
         amount_pkr = p_amount_pkr,
         period_month = v_period,
         reason = v_reason
   where id = p_adjustment_id;

  select display_name into v_emp_name from public.team_members where id = v_adj.team_member_id;

  if v_adj.status = 'pending' and v_adj.approval_request_id is not null then
    update public.approval_requests
       set action_label = initcap(p_type) || ' — ' || coalesce(v_emp_name, 'employee')
             || ' (' || to_char(v_period, 'Mon YYYY') || ')',
           action_payload = coalesce(action_payload, '{}'::jsonb) || jsonb_build_object(
             'compType', p_type, 'amountPkr', p_amount_pkr,
             'periodMonth', to_char(v_period, 'YYYY-MM-DD'), 'requester_note', v_reason)
     where id = v_adj.approval_request_id and status = 'pending';
  end if;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values, new_values)
  values (
    v_uid, v_actor_name, v_actor_role, 'compensation', v_adj.id::text, 'compensation_updated',
    'Edited ' || coalesce(v_emp_name, 'employee') || ' compensation (' || v_adj.status || ')',
    jsonb_build_object('type', v_adj.type, 'amount_pkr', v_adj.amount_pkr,
      'period_month', v_adj.period_month, 'reason', v_adj.reason, 'status', v_adj.status),
    jsonb_build_object('type', p_type, 'amount_pkr', p_amount_pkr,
      'period_month', v_period, 'reason', v_reason, 'status', v_adj.status)
  );

  return v_adj.status;
end; $$;

-- ── 3. delete_compensation_adjustment (soft-delete) ──────────────────────────
create or replace function public.delete_compensation_adjustment(
  p_adjustment_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_tm uuid := public.current_team_member_id();
  v_is_admin boolean := public.is_chat_admin();
  v_is_finance boolean := false;
  v_can_approve boolean := false;
  v_adj public.employee_compensation_adjustments%rowtype;
  v_actor_name text := public.company_os_actor_name();
  v_actor_role text := public.company_os_actor_role();
  v_emp_name text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_adj from public.employee_compensation_adjustments
   where id = p_adjustment_id for update;
  if v_adj.id is null then raise exception 'adjustment not found'; end if;
  if v_adj.deleted_at is not null then return true; end if;

  select exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = v_uid and dp.is_active = true and coalesce(dp.role,'') = 'finance'
  ) into v_is_finance;

  select exists (
    select 1
    from public.team_member_department_roles r_rev
    join public.team_member_department_roles r_tgt
      on r_tgt.department_id = r_rev.department_id
     and r_tgt.team_member_id = v_adj.team_member_id
     and r_tgt.is_active
     and (r_tgt.ends_at is null or r_tgt.ends_at >= current_date)
    where r_rev.team_member_id = v_caller_tm
      and r_rev.is_active
      and (r_rev.ends_at is null or r_rev.ends_at >= current_date)
      and r_rev.can_approve_bonus
  ) into v_can_approve;

  if not (v_is_admin or v_is_finance or v_can_approve) then
    raise exception 'not authorized to delete compensation adjustments for this employee';
  end if;

  if v_adj.requested_by is not distinct from v_caller_tm and not v_is_admin then
    raise exception 'you cannot delete your own request';
  end if;

  update public.employee_compensation_adjustments
     set deleted_at = now(),
         deleted_by = v_caller_tm,
         delete_reason = nullif(trim(coalesce(p_reason,'')), '')
   where id = p_adjustment_id;

  if v_adj.status = 'pending' and v_adj.approval_request_id is not null then
    update public.approval_requests
       set status = 'rejected',
           reviewed_by = v_uid::text,
           reviewed_by_name = v_actor_name,
           review_note = 'Withdrawn — adjustment deleted',
           reviewed_at = now()
     where id = v_adj.approval_request_id and status = 'pending';
  end if;

  select display_name into v_emp_name from public.team_members where id = v_adj.team_member_id;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values, new_values)
  values (
    v_uid, v_actor_name, v_actor_role, 'compensation', v_adj.id::text, 'compensation_deleted',
    'Deleted ' || initcap(v_adj.type) || ' of PKR ' || v_adj.amount_pkr || ' for '
      || coalesce(v_emp_name, 'employee') || ' — ' || to_char(v_adj.period_month, 'Mon YYYY')
      || ' (was ' || v_adj.status || ')',
    jsonb_build_object('type', v_adj.type, 'amount_pkr', v_adj.amount_pkr,
      'period_month', v_adj.period_month, 'reason', v_adj.reason, 'status', v_adj.status),
    jsonb_build_object('deleted', true, 'delete_reason', nullif(trim(coalesce(p_reason,'')), ''))
  );

  return true;
end; $$;

grant execute on function public.update_compensation_adjustment(uuid, text, numeric, date, text) to authenticated;
grant execute on function public.delete_compensation_adjustment(uuid, text) to authenticated;
revoke execute on function public.update_compensation_adjustment(uuid, text, numeric, date, text) from public, anon;
revoke execute on function public.delete_compensation_adjustment(uuid, text) from public, anon;

-- ── 4. readers ignore soft-deleted rows (LIVE bodies + deleted_at filter) ─────

-- list (Accounts panel)
create or replace function public.get_compensation_adjustments(p_from date, p_to date)
returns table (
  id uuid, team_member_id uuid, display_name text, employee_code text, department_name text,
  period_month date, comp_type text, amount_pkr numeric, reason text, status text,
  requested_by_name text, reviewed_by_name text, review_note text, reviewed_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_caller_tm uuid := public.current_team_member_id();
  v_full boolean := public.is_accounts_admin();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  return query
  select a.id, a.team_member_id, tm.display_name, tm.employee_code,
         d.name, a.period_month, a.type, a.amount_pkr, a.reason, a.status,
         req.display_name, rev.display_name, a.review_note, a.reviewed_at, a.created_at
  from public.employee_compensation_adjustments a
  join public.team_members tm on tm.id = a.team_member_id
  left join public.company_departments d on d.id = a.department_id
  left join public.team_members req on req.id = a.requested_by
  left join public.team_members rev on rev.id = a.approved_by
  where a.deleted_at is null
    and a.period_month >= (date_trunc('month', p_from))::date
    and a.period_month <= p_to
    and (
      v_full
      or a.requested_by = v_caller_tm
      or exists (
        select 1
        from public.team_member_department_roles r_me
        join public.team_member_department_roles r_tgt
          on r_tgt.department_id = r_me.department_id
         and r_tgt.team_member_id = a.team_member_id
         and r_tgt.is_active
        where r_me.team_member_id = v_caller_tm
          and r_me.is_active
          and (r_me.ends_at is null or r_me.ends_at >= current_date)
          and (r_me.can_request_bonus or r_me.can_approve_bonus or r_me.can_view_salary)
      )
    )
  order by a.created_at desc;
end; $$;

-- self list (/company)
create or replace function public.get_my_compensation_adjustments()
returns table (
  id uuid, period_month date, comp_type text, amount_pkr numeric, reason text,
  status text, reviewed_at timestamptz, created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.period_month, a.type, a.amount_pkr, a.reason, a.status, a.reviewed_at, a.created_at
  from public.employee_compensation_adjustments a
  where a.team_member_id = public.current_team_member_id()
    and a.deleted_at is null
  order by a.period_month desc, a.created_at desc;
$$;

-- ── 5. salary RPCs ignore soft-deleted rows (LIVE bodies + deleted_at filter) ─
create or replace function public.get_salary_expense_detail(p_from date, p_to date)
returns table (
  team_member_id uuid, display_name text, employee_code text, base_salary numeric,
  salary_currency text, employment_status text, is_active boolean, prorated_amount numeric,
  included boolean, exclude_reason text, working_days integer, half_day_late_days integer,
  late_deduction_amount numeric, bonus_amount numeric, commission_amount numeric,
  other_additions numeric, other_deductions numeric, additions_total numeric, payable_amount numeric
)
language plpgsql security definer set search_path = public
as $$
declare v_days integer; v_workdays integer;
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid()
                 and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))) then
    raise exception 'not authorized';
  end if;
  v_days := greatest(1, (p_to - p_from) + 1);
  select count(*)::int into v_workdays
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  v_workdays := greatest(1, v_workdays);
  return query
  with late_days as (
    select l.team_member_id as tm, count(*)::int as cnt
    from public.get_half_day_late_attendance(p_from, p_to) l group by 1
  ),
  adj as (
    select a.team_member_id as tm,
      sum(case when a.type = 'bonus' then a.amount_pkr else 0 end) as bonus,
      sum(case when a.type = 'commission' then a.amount_pkr else 0 end) as commission,
      sum(case when a.type in ('adjustment','reimbursement') and a.amount_pkr > 0 then a.amount_pkr else 0 end) as other_add,
      sum(case when a.type = 'deduction' then a.amount_pkr
               when a.type = 'adjustment' and a.amount_pkr < 0 then -a.amount_pkr else 0 end) as other_ded
    from public.employee_compensation_adjustments a
    where a.status = 'approved'
      and a.deleted_at is null
      and a.period_month >= (date_trunc('month', p_from))::date and a.period_month <= p_to
    group by 1
  ),
  base as (
    select tm.id as tmid, tm.display_name as dname, tm.employee_code as ecode,
      coalesce(h.base_salary, 0)::numeric as bsal, coalesce(h.salary_currency, 'PKR') as cur,
      coalesce(tm.employment_status, 'active') as estatus, coalesce(tm.is_active, true) as eactive,
      (coalesce(tm.is_active, true) = true
        and coalesce(tm.employment_status, 'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
        and coalesce(h.base_salary, 0) > 0
        and coalesce(tm.domain_role, '') <> 'owner' and coalesce(dp.role, '') <> 'owner') as incl,
      case
        when coalesce(tm.domain_role, '') = 'owner' or coalesce(dp.role, '') = 'owner' then 'owner_compensation_excluded'
        when coalesce(h.base_salary, 0) <= 0 then 'no salary set'
        when coalesce(tm.is_active, true) = false then 'inactive'
        when coalesce(tm.employment_status, 'active') in ('terminated','resigned','inactive','suspended','offboarded','deleted')
          then 'status: ' || tm.employment_status
        else null end as reason,
      coalesce(ld.cnt, 0) as late_cnt, coalesce(aj.bonus, 0) as bonus, coalesce(aj.commission, 0) as commission,
      coalesce(aj.other_add, 0) as other_add, coalesce(aj.other_ded, 0) as other_ded
    from public.employee_hr_private h
    join public.team_members tm on tm.id = h.team_member_id
    left join public.doctor_profiles dp on dp.user_id = tm.user_id
    left join late_days ld on ld.tm = tm.id
    left join adj aj on aj.tm = tm.id
  )
  select b.tmid, b.dname, b.ecode, b.bsal, b.cur, b.estatus, b.eactive,
    round(b.bsal * (v_days::numeric / 30.0), 2),
    b.incl, b.reason, v_workdays,
    (case when b.incl then b.late_cnt else 0 end)::integer,
    case when b.incl then round(round(b.bsal / v_workdays / 2.0, 2) * b.late_cnt, 2) else 0 end,
    case when b.incl then b.bonus else 0 end,
    case when b.incl then b.commission else 0 end,
    case when b.incl then b.other_add else 0 end,
    case when b.incl then b.other_ded else 0 end,
    case when b.incl then b.bonus + b.commission + b.other_add - b.other_ded else 0 end,
    greatest(round(b.bsal * (v_days::numeric / 30.0)
      - case when b.incl then round(b.bsal / v_workdays / 2.0, 2) * b.late_cnt else 0 end
      + case when b.incl then b.bonus + b.commission + b.other_add - b.other_ded else 0 end, 2), 0)
  from base b order by b.bsal desc;
end; $$;

create or replace function public.get_salary_expense_summary(p_from date, p_to date)
returns table (
  currency text, monthly_total numeric, prorated_total numeric, employee_count integer,
  range_days integer, working_days integer, half_day_late_count integer, late_deduction_total numeric,
  payable_total numeric, bonus_total numeric, commission_total numeric,
  other_additions_total numeric, other_deductions_total numeric, additions_total numeric
)
language plpgsql security definer set search_path = public
as $$
declare v_days integer; v_workdays integer;
begin
  if not exists (select 1 from public.doctor_profiles dp where dp.user_id = auth.uid()
                 and (dp.is_admin = true or coalesce(dp.role,'') = any (array['owner','admin_manager','finance']))) then
    raise exception 'not authorized';
  end if;
  v_days := greatest(1, (p_to - p_from) + 1);
  select count(*)::int into v_workdays
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  v_workdays := greatest(1, v_workdays);
  return query
  with late_days as (
    select l.team_member_id as tm, count(*)::int as cnt
    from public.get_half_day_late_attendance(p_from, p_to) l group by 1
  ),
  adj as (
    select a.team_member_id as tm,
      sum(case when a.type = 'bonus' then a.amount_pkr else 0 end) as bonus,
      sum(case when a.type = 'commission' then a.amount_pkr else 0 end) as commission,
      sum(case when a.type in ('adjustment','reimbursement') and a.amount_pkr > 0 then a.amount_pkr else 0 end) as other_add,
      sum(case when a.type = 'deduction' then a.amount_pkr
               when a.type = 'adjustment' and a.amount_pkr < 0 then -a.amount_pkr else 0 end) as other_ded
    from public.employee_compensation_adjustments a
    where a.status = 'approved'
      and a.deleted_at is null
      and a.period_month >= (date_trunc('month', p_from))::date and a.period_month <= p_to
    group by 1
  )
  select coalesce(h.salary_currency, 'PKR'),
    sum(coalesce(h.base_salary, 0))::numeric,
    round(sum(coalesce(h.base_salary, 0)) * (v_days::numeric / 30.0), 2),
    count(*)::integer, v_days, v_workdays,
    coalesce(sum(ld.cnt), 0)::integer,
    round(sum(round(coalesce(h.base_salary, 0)::numeric / v_workdays / 2.0, 2) * coalesce(ld.cnt, 0)), 2),
    greatest(round(sum(coalesce(h.base_salary, 0)) * (v_days::numeric / 30.0)
      - sum(round(coalesce(h.base_salary, 0)::numeric / v_workdays / 2.0, 2) * coalesce(ld.cnt, 0))
      + sum(coalesce(aj.bonus, 0) + coalesce(aj.commission, 0) + coalesce(aj.other_add, 0) - coalesce(aj.other_ded, 0)), 2), 0),
    round(sum(coalesce(aj.bonus, 0)), 2),
    round(sum(coalesce(aj.commission, 0)), 2),
    round(sum(coalesce(aj.other_add, 0)), 2),
    round(sum(coalesce(aj.other_ded, 0)), 2),
    round(sum(coalesce(aj.bonus, 0) + coalesce(aj.commission, 0) + coalesce(aj.other_add, 0) - coalesce(aj.other_ded, 0)), 2)
  from public.employee_hr_private h
  join public.team_members tm on tm.id = h.team_member_id
  left join public.doctor_profiles dp on dp.user_id = tm.user_id
  left join late_days ld on ld.tm = tm.id
  left join adj aj on aj.tm = tm.id
  where coalesce(tm.is_active, true) = true
    and coalesce(tm.employment_status, 'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
    and coalesce(h.base_salary, 0) > 0
    and coalesce(tm.domain_role, '') <> 'owner' and coalesce(dp.role, '') <> 'owner'
  group by coalesce(h.salary_currency, 'PKR');
end; $$;

-- self snapshot (/company) — LIVE body WITH attendance-correction overlay preserved
create or replace function public.get_my_salary_snapshot()
returns table (
  period_start date, period_end date, base_salary numeric, salary_currency text,
  working_days integer, half_day_late_days integer, late_deduction_amount numeric,
  bonus_amount numeric, commission_amount numeric, other_additions numeric,
  other_deductions numeric, additions_total numeric, payable_amount numeric,
  included boolean, exclude_reason text
)
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tm public.team_members%rowtype;
  v_from date; v_to date; v_scan_from date; v_workdays integer;
  v_base numeric := 0; v_currency text := 'PKR'; v_dp_role text := '';
  v_late_days integer := 0; v_ded numeric := 0;
  v_bonus numeric := 0; v_comm numeric := 0; v_oadd numeric := 0; v_oded numeric := 0;
  v_included boolean; v_reason text;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_tm from public.team_members where user_id = v_uid limit 1;
  if v_tm.id is null then return; end if;

  v_from := date_trunc('month', (now() at time zone 'Asia/Karachi'))::date;
  v_to   := (date_trunc('month', (now() at time zone 'Asia/Karachi')) + interval '1 month - 1 day')::date;
  v_scan_from := greatest(v_from, public.late_deduction_policy_start_date());

  select count(*)::int into v_workdays
    from generate_series(v_from::timestamp, v_to::timestamp, interval '1 day') d
   where extract(isodow from d) between 1 and 5;
  v_workdays := greatest(1, v_workdays);

  select coalesce(h.base_salary, 0), coalesce(h.salary_currency, 'PKR')
    into v_base, v_currency from public.employee_hr_private h
   where h.team_member_id = v_tm.id limit 1;
  v_base := coalesce(v_base, 0); v_currency := coalesce(v_currency, 'PKR');

  select coalesce(dp.role, '') into v_dp_role
    from public.doctor_profiles dp where dp.user_id = v_uid limit 1;
  v_dp_role := coalesce(v_dp_role, '');

  v_included := coalesce(v_tm.is_active, true) = true
    and coalesce(v_tm.employment_status, 'active') not in ('terminated','resigned','inactive','suspended','offboarded','deleted')
    and v_base > 0 and coalesce(v_tm.domain_role, '') <> 'owner' and v_dp_role <> 'owner';

  v_reason := case
    when coalesce(v_tm.domain_role, '') = 'owner' or v_dp_role = 'owner' then 'owner_compensation_excluded'
    when v_base <= 0 then 'no salary set'
    when coalesce(v_tm.is_active, true) = false then 'inactive'
    when coalesce(v_tm.employment_status, 'active') in ('terminated','resigned','inactive','suspended','offboarded','deleted')
      then 'status: ' || v_tm.employment_status
    else null end;

  if v_included then
    select count(*)::int into v_late_days
    from (
      with first_in_raw as (
        select t.work_date as wd, min(t.clock_in_at) as cin
          from public.time_clock_entries t
         where t.team_member_id = v_tm.id and t.work_date between v_scan_from and v_to
         group by 1
      ),
      approved_corr as (
        select distinct on (c.correction_date) c.correction_date as wd, c.requested_clock_in as cin
          from public.employee_attendance_correction_requests c
         where c.team_member_id = v_tm.id and c.status = 'approved'
           and c.requested_clock_in is not null
           and c.correction_date between v_scan_from and v_to
         order by c.correction_date, c.reviewed_at desc nulls last, c.updated_at desc
      ),
      first_in as (
        select coalesce(r.wd, a.wd) as wd, coalesce(a.cin, r.cin) as cin
          from first_in_raw r full outer join approved_corr a on a.wd = r.wd
      )
      select f.wd, f.cin from first_in f
    ) f
    join lateral (
      select a.shift_template_id from public.employee_shift_assignments a
       where a.team_member_id = v_tm.id and a.effective_from <= f.wd
         and (a.effective_to is null or a.effective_to >= f.wd)
       order by a.effective_from desc limit 1
    ) asn on true
    join public.shift_templates st on st.id = asn.shift_template_id and st.is_active = true
    where floor(extract(epoch from (f.cin - (
      ((case when st.crosses_midnight
              and ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::time < st.end_time)
         then ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::date - 1)
         else ((f.cin at time zone coalesce(st.timezone, 'Asia/Karachi'))::date)
        end)::timestamp + st.start_time) at time zone coalesce(st.timezone, 'Asia/Karachi')
    ))) / 60.0)::int >= greatest(coalesce(st.grace_minutes, 30), 30);

    v_late_days := coalesce(v_late_days, 0);
    v_ded := round(round(v_base / v_workdays / 2.0, 2) * v_late_days, 2);

    select
      coalesce(sum(case when a.type = 'bonus' then a.amount_pkr else 0 end), 0),
      coalesce(sum(case when a.type = 'commission' then a.amount_pkr else 0 end), 0),
      coalesce(sum(case when a.type in ('adjustment','reimbursement') and a.amount_pkr > 0 then a.amount_pkr else 0 end), 0),
      coalesce(sum(case when a.type = 'deduction' then a.amount_pkr
                        when a.type = 'adjustment' and a.amount_pkr < 0 then -a.amount_pkr
                        else 0 end), 0)
      into v_bonus, v_comm, v_oadd, v_oded
    from public.employee_compensation_adjustments a
    where a.team_member_id = v_tm.id and a.status = 'approved'
      and a.deleted_at is null
      and a.period_month = v_from;
  end if;

  return query select
    v_from, v_to, v_base, v_currency, v_workdays,
    v_late_days, v_ded,
    v_bonus, v_comm, v_oadd, v_oded,
    v_bonus + v_comm + v_oadd - v_oded,
    greatest(v_base - v_ded + v_bonus + v_comm + v_oadd - v_oded, 0),
    v_included, v_reason;
end; $$;
