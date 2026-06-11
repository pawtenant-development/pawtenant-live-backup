-- TEST-COMPANY-OS-SAAS-ORG-STRUCTURE — Phase 3: compensation adjustment workflow.
--
-- employee_compensation_adjustments: monthly bonus / commission / adjustment /
-- reimbursement / deduction rows with a pending → approved/rejected lifecycle.
--   • Pending rows never affect salary. Approved rows feed the salary RPCs (Phase 4).
--   • Owner-targeted adjustments are blocked (owner compensation stays out of payroll).
--   • Writes flow through SECURITY DEFINER RPCs that enforce department-scoped rules:
--       - owner/admin_manager (is_chat_admin) and finance role: request + approve, may auto-approve
--       - department roles with can_request_bonus: request for employees sharing that department
--       - department roles with can_approve_bonus: approve for employees sharing that department
--       - nobody (except global admins) reviews their own request
--   • Pending requests mirror into approval_requests (action_type='compensation_adjustment')
--     so the existing Manager Approvals inbox + bell pick them up with zero new plumbing.
-- Additive + idempotent. TEST (opudhofjbydrljgleofq) only.

create table if not exists public.employee_compensation_adjustments (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  department_id uuid references public.company_departments(id) on delete set null,
  period_month date not null,
  type text not null,
  amount_pkr numeric(14,2) not null,
  reason text,
  status text not null default 'pending',
  requested_by uuid references public.team_members(id) on delete set null,
  requested_by_user uuid,
  approved_by uuid references public.team_members(id) on delete set null,
  reviewed_by_user uuid,
  review_note text,
  reviewed_at timestamptz,
  approval_request_id uuid references public.approval_requests(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  company_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eca_period_chk check (period_month = (date_trunc('month', period_month))::date),
  constraint eca_type_chk check (type in ('bonus','commission','adjustment','reimbursement','deduction')),
  constraint eca_status_chk check (status in ('pending','approved','rejected')),
  constraint eca_amount_chk check (amount_pkr <> 0 and (type = 'adjustment' or amount_pkr > 0))
);

create index if not exists eca_member_period_idx on public.employee_compensation_adjustments (team_member_id, period_month);
create index if not exists eca_status_idx on public.employee_compensation_adjustments (status);
create index if not exists eca_period_idx on public.employee_compensation_adjustments (period_month);

drop trigger if exists eca_updated_at on public.employee_compensation_adjustments;
create trigger eca_updated_at
  before update on public.employee_compensation_adjustments
  for each row execute function public.company_os_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Reads: accounts admins (owner/admin_manager/finance), the employee themself,
-- and the requester. Department-scoped reviewers read through the RPCs below.
-- Direct writes: owner/admin_manager only (normal path is the RPCs).
alter table public.employee_compensation_adjustments enable row level security;

drop policy if exists eca_select on public.employee_compensation_adjustments;
create policy eca_select on public.employee_compensation_adjustments
  for select to authenticated
  using (
    public.is_accounts_admin()
    or team_member_id = public.current_team_member_id()
    or requested_by = public.current_team_member_id()
  );

drop policy if exists eca_admin_write on public.employee_compensation_adjustments;
create policy eca_admin_write on public.employee_compensation_adjustments
  for all to authenticated
  using (public.is_chat_admin())
  with check (public.is_chat_admin());

-- ── helper: caller display name + role (for mirrors / audit) ─────────────────
create or replace function public.company_os_actor_name()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select tm.display_name from public.team_members tm where tm.user_id = auth.uid() limit 1),
    (select dp.full_name from public.doctor_profiles dp where dp.user_id = auth.uid() limit 1),
    (select dp.email from public.doctor_profiles dp where dp.user_id = auth.uid() limit 1),
    'Unknown');
$$;

create or replace function public.company_os_actor_role()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select dp.role from public.doctor_profiles dp where dp.user_id = auth.uid() limit 1),
    'team_member');
$$;

grant execute on function public.company_os_actor_name() to authenticated;
grant execute on function public.company_os_actor_role() to authenticated;
revoke execute on function public.company_os_actor_name() from public, anon;
revoke execute on function public.company_os_actor_role() from public, anon;

-- ── request_compensation_adjustment ──────────────────────────────────────────
create or replace function public.request_compensation_adjustment(
  p_team_member_id uuid,
  p_period_month date,
  p_type text,
  p_amount_pkr numeric,
  p_reason text default null,
  p_auto_approve boolean default false
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_caller_tm uuid := public.current_team_member_id();
  v_is_admin boolean := public.is_chat_admin();
  v_is_finance boolean := false;
  v_can_request boolean := false;
  v_target public.team_members%rowtype;
  v_target_dp_role text := '';
  v_period date;
  v_status text;
  v_actor_name text := public.company_os_actor_name();
  v_actor_role text := public.company_os_actor_role();
  v_id uuid;
  v_req_id uuid;
  v_dept uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_team_member_id is null then raise exception 'employee required'; end if;
  if p_type is null or p_type not in ('bonus','commission','adjustment','reimbursement','deduction') then
    raise exception 'invalid adjustment type';
  end if;
  if p_amount_pkr is null or p_amount_pkr = 0 then raise exception 'amount required'; end if;
  if p_type <> 'adjustment' and p_amount_pkr <= 0 then
    raise exception 'amount must be positive for %', p_type;
  end if;

  v_period := (date_trunc('month', coalesce(p_period_month, (now() at time zone 'Asia/Karachi')::date)))::date;

  select * into v_target from public.team_members where id = p_team_member_id;
  if v_target.id is null then raise exception 'employee not found'; end if;
  select coalesce(dp.role,'') into v_target_dp_role
    from public.doctor_profiles dp where dp.user_id = v_target.user_id limit 1;
  if coalesce(v_target.domain_role,'') = 'owner' or coalesce(v_target_dp_role,'') = 'owner' then
    raise exception 'owner compensation is excluded from payroll';
  end if;

  select exists (
    select 1 from public.doctor_profiles dp
    where dp.user_id = v_uid and dp.is_active = true and coalesce(dp.role,'') = 'finance'
  ) into v_is_finance;

  -- Department-scoped requesters: an active can_request_bonus assignment in a
  -- department the target employee is also actively assigned to.
  select exists (
    select 1
    from public.team_member_department_roles r_req
    join public.team_member_department_roles r_tgt
      on r_tgt.department_id = r_req.department_id
     and r_tgt.team_member_id = p_team_member_id
     and r_tgt.is_active
     and (r_tgt.ends_at is null or r_tgt.ends_at >= current_date)
    where r_req.team_member_id = v_caller_tm
      and r_req.is_active
      and (r_req.ends_at is null or r_req.ends_at >= current_date)
      and r_req.can_request_bonus
  ) into v_can_request;

  if not (v_is_admin or v_is_finance or v_can_request) then
    raise exception 'not authorized to request compensation adjustments for this employee';
  end if;

  v_status := case when p_auto_approve and (v_is_admin or v_is_finance) then 'approved' else 'pending' end;

  -- Department context for scoping/display: prefer the target's primary department.
  select r_tgt.department_id into v_dept
  from public.team_member_department_roles r_tgt
  where r_tgt.team_member_id = p_team_member_id and r_tgt.is_active
  order by (r_tgt.department_id = v_target.primary_department_id) desc nulls last, r_tgt.created_at
  limit 1;

  insert into public.employee_compensation_adjustments
    (team_member_id, department_id, period_month, type, amount_pkr, reason, status,
     requested_by, requested_by_user, approved_by, reviewed_by_user, reviewed_at)
  values
    (p_team_member_id, v_dept, v_period, p_type, p_amount_pkr,
     nullif(trim(coalesce(p_reason,'')), ''), v_status,
     v_caller_tm, v_uid,
     case when v_status = 'approved' then v_caller_tm end,
     case when v_status = 'approved' then v_uid end,
     case when v_status = 'approved' then now() end)
  returning id into v_id;

  if v_status = 'pending' then
    insert into public.approval_requests
      (requester_id, requester_name, requester_role, action_type, action_label, action_payload)
    values (
      v_uid::text, v_actor_name, v_actor_role, 'compensation_adjustment',
      initcap(p_type) || ' — ' || coalesce(v_target.display_name, 'employee')
        || ' (' || to_char(v_period, 'Mon YYYY') || ')',
      jsonb_build_object(
        'adjustment_id', v_id,
        'team_member_id', p_team_member_id,
        'employeeName', v_target.display_name,
        'periodMonth', to_char(v_period, 'YYYY-MM-DD'),
        'compType', p_type,
        'amountPkr', p_amount_pkr,
        'requester_note', nullif(trim(coalesce(p_reason,'')), '')
      )
    ) returning id into v_req_id;

    update public.employee_compensation_adjustments
      set approval_request_id = v_req_id where id = v_id;
  end if;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, object_type, object_id, action, description, new_values)
  values (
    v_uid, v_actor_name, v_actor_role, 'compensation', v_id::text,
    case when v_status = 'approved' then 'compensation_added' else 'compensation_requested' end,
    initcap(p_type) || ' of PKR ' || p_amount_pkr || ' for '
      || coalesce(v_target.display_name, 'employee') || ' — '
      || to_char(v_period, 'Mon YYYY') || ' (' || v_status || ')',
    jsonb_build_object(
      'team_member_id', p_team_member_id, 'employee_name', v_target.display_name,
      'period_month', v_period, 'type', p_type, 'amount_pkr', p_amount_pkr,
      'status', v_status, 'reason', p_reason)
  );

  return v_id;
end; $$;

-- ── review_compensation_adjustment ───────────────────────────────────────────
create or replace function public.review_compensation_adjustment(
  p_adjustment_id uuid,
  p_decision text,
  p_note text default null
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
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'decision must be approved or rejected';
  end if;

  select * into v_adj from public.employee_compensation_adjustments
   where id = p_adjustment_id for update;
  if v_adj.id is null then raise exception 'adjustment not found'; end if;
  if v_adj.status <> 'pending' then
    if v_adj.status = p_decision then return v_adj.status; end if; -- idempotent re-review
    raise exception 'adjustment already % — cannot change to %', v_adj.status, p_decision;
  end if;

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
    raise exception 'not authorized to review compensation adjustments for this employee';
  end if;

  -- Self-review fence: only global admins (owner/admin_manager) may decide their own request.
  if v_adj.requested_by is not distinct from v_caller_tm and not v_is_admin then
    raise exception 'you cannot review your own request';
  end if;

  update public.employee_compensation_adjustments
     set status = p_decision,
         approved_by = v_caller_tm,
         reviewed_by_user = v_uid,
         reviewed_at = now(),
         review_note = nullif(trim(coalesce(p_note,'')), '')
   where id = p_adjustment_id;

  -- Keep the Manager Approvals mirror in sync (no-op when already decided there).
  if v_adj.approval_request_id is not null then
    update public.approval_requests
       set status = p_decision,
           reviewed_by = v_uid::text,
           reviewed_by_name = v_actor_name,
           review_note = nullif(trim(coalesce(p_note,'')), ''),
           reviewed_at = now()
     where id = v_adj.approval_request_id and status = 'pending';
  end if;

  select display_name into v_emp_name from public.team_members where id = v_adj.team_member_id;

  insert into public.audit_logs
    (actor_id, actor_name, actor_role, object_type, object_id, action, description, old_values, new_values)
  values (
    v_uid, v_actor_name, v_actor_role, 'compensation', v_adj.id::text,
    case when p_decision = 'approved' then 'compensation_approved' else 'compensation_rejected' end,
    initcap(v_adj.type) || ' of PKR ' || v_adj.amount_pkr || ' for '
      || coalesce(v_emp_name, 'employee') || ' — '
      || to_char(v_adj.period_month, 'Mon YYYY') || ' ' || p_decision,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', p_decision, 'team_member_id', v_adj.team_member_id,
      'employee_name', v_emp_name, 'period_month', v_adj.period_month,
      'type', v_adj.type, 'amount_pkr', v_adj.amount_pkr, 'note', p_note)
  );

  return p_decision;
end; $$;

-- ── read RPCs ─────────────────────────────────────────────────────────────────
-- Admin/finance (full) or department-scoped (only employees sharing a department
-- where the caller holds a bonus/salary flag) listing with display names joined.
create or replace function public.get_compensation_adjustments(p_from date, p_to date)
returns table (
  id uuid,
  team_member_id uuid,
  display_name text,
  employee_code text,
  department_name text,
  period_month date,
  comp_type text,
  amount_pkr numeric,
  reason text,
  status text,
  requested_by_name text,
  reviewed_by_name text,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz
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
  where a.period_month >= (date_trunc('month', p_from))::date
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

-- Self-service: the calling employee's own adjustments (for /company).
create or replace function public.get_my_compensation_adjustments()
returns table (
  id uuid,
  period_month date,
  comp_type text,
  amount_pkr numeric,
  reason text,
  status text,
  reviewed_at timestamptz,
  created_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.period_month, a.type, a.amount_pkr, a.reason, a.status, a.reviewed_at, a.created_at
  from public.employee_compensation_adjustments a
  where a.team_member_id = public.current_team_member_id()
  order by a.period_month desc, a.created_at desc;
$$;

-- Coordinator helper: members of departments where the caller can request bonuses
-- (or is a domain/sub-domain owner / coordinator). Global admins see all active members.
create or replace function public.get_my_department_members()
returns table (
  team_member_id uuid,
  display_name text,
  employee_code text,
  department_id uuid,
  department_name text,
  role_level text
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_caller_tm uuid := public.current_team_member_id();
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  if public.is_chat_admin() then
    return query
    select tm.id, tm.display_name, tm.employee_code,
           d.id, d.name, coalesce(r.role_level, 'user')
    from public.team_members tm
    left join public.team_member_department_roles r
      on r.team_member_id = tm.id and r.is_active
    left join public.company_departments d on d.id = r.department_id
    where coalesce(tm.is_active, true)
    order by tm.display_name;
    return;
  end if;

  return query
  select tm.id, tm.display_name, tm.employee_code, d.id, d.name, r_tgt.role_level
  from public.team_member_department_roles r_me
  join public.team_member_department_roles r_tgt
    on r_tgt.department_id = r_me.department_id and r_tgt.is_active
  join public.team_members tm on tm.id = r_tgt.team_member_id and coalesce(tm.is_active, true)
  join public.company_departments d on d.id = r_me.department_id
  where r_me.team_member_id = v_caller_tm
    and r_me.is_active
    and (r_me.ends_at is null or r_me.ends_at >= current_date)
    and (r_me.can_request_bonus
         or r_me.role_level in ('domain_owner','sub_domain_owner','team_coordinator'))
  order by d.name, tm.display_name;
end; $$;

grant execute on function public.request_compensation_adjustment(uuid, date, text, numeric, text, boolean) to authenticated;
grant execute on function public.review_compensation_adjustment(uuid, text, text) to authenticated;
grant execute on function public.get_compensation_adjustments(date, date) to authenticated;
grant execute on function public.get_my_compensation_adjustments() to authenticated;
grant execute on function public.get_my_department_members() to authenticated;
revoke execute on function public.request_compensation_adjustment(uuid, date, text, numeric, text, boolean) from public, anon;
revoke execute on function public.review_compensation_adjustment(uuid, text, text) from public, anon;
revoke execute on function public.get_compensation_adjustments(date, date) from public, anon;
revoke execute on function public.get_my_compensation_adjustments() from public, anon;
revoke execute on function public.get_my_department_members() from public, anon;
