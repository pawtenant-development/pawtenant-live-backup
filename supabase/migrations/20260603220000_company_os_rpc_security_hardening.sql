-- =====================================================================
-- COMPANY OS RPC SECURITY HARDENING (TEST)
-- Task: COMPANY-OS-RPC-SEARCH-PATH-ANON-EXECUTE-HARDENING-TEST
-- Follows audit commit 4567e45 (COMPANY-OS-SECURITY-RLS-ACCESS-AUDIT-TEST)
--
-- Defense-in-depth only. NO behaviour change, NO body/signature change.
--   PART B: pin SET search_path = public on Company OS functions that lack it
--           (check_is_admin + Company OS trigger/helper functions).
--   PART C: revoke EXECUTE from PUBLIC/anon on callable Company OS RPCs
--           (all require auth.uid() and are never called pre-login),
--           preserve authenticated + service_role EXECUTE.
--
-- Idempotent: ALTER FUNCTION ... SET, and REVOKE/GRANT are all re-runnable.
-- Scope: Company OS only. Does NOT touch checkout/Stripe/orders/analytics/
--        comms/customer/provider functions or Edge Functions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- PART B — Pin search_path = public
-- ---------------------------------------------------------------------

-- SECURITY DEFINER helper used by Company OS (and elsewhere) — schema-qualified
-- internally, but pin search_path as defence-in-depth.
ALTER FUNCTION public.check_is_admin() SET search_path = public;

-- Company OS trigger / helper functions (SECURITY INVOKER) flagged by the
-- function_search_path_mutable advisor. Bodies only set updated_at / employee_code.
ALTER FUNCTION public.att_corr_set_updated_at()                 SET search_path = public;
ALTER FUNCTION public.employee_break_set_updated_at()           SET search_path = public;
ALTER FUNCTION public.employee_documents_set_updated_at()       SET search_path = public;
ALTER FUNCTION public.employee_hr_private_set_updated_at()      SET search_path = public;
ALTER FUNCTION public.employee_leave_set_updated_at()           SET search_path = public;
ALTER FUNCTION public.employee_shift_assignments_set_updated_at() SET search_path = public;
ALTER FUNCTION public.leave_adj_set_updated_at()                SET search_path = public;
ALTER FUNCTION public.leave_corr_set_updated_at()               SET search_path = public;
ALTER FUNCTION public.shift_templates_set_updated_at()          SET search_path = public;
ALTER FUNCTION public.team_members_set_employee_code()          SET search_path = public;
ALTER FUNCTION public.team_members_set_updated_at()             SET search_path = public;
ALTER FUNCTION public.time_clock_entries_set_updated_at()       SET search_path = public;
ALTER FUNCTION public.ts_adj_set_updated_at()                   SET search_path = public;

-- ---------------------------------------------------------------------
-- PART C — Revoke EXECUTE from PUBLIC/anon on callable Company OS RPCs
--          Preserve authenticated + service_role.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'acknowledge_my_document(uuid)',
    'apply_attendance_correction_to_timesheet(uuid, integer, integer)',
    'apply_leave_correction_amendment(uuid)',
    'cancel_my_attendance_correction_request(uuid, text)',
    'cancel_my_break(uuid)',
    'cancel_my_leave_request(uuid)',
    'clock_in_for_current_user()',
    'clock_out_for_current_user()',
    'end_my_break()',
    'get_admin_company_os_notifications()',
    'get_my_attendance_summary_range(date, date)',
    'get_my_today_attendance_summary()',
    'get_team_adjusted_timesheet_range(date, date)',
    'get_team_attendance_summary_for_date(date)',
    'get_team_presence()',
    'next_employee_code()',
    'reverse_leave_adjustment(uuid, text)',
    'reverse_timesheet_adjustment(uuid, text)',
    'review_attendance_correction_request(uuid, text, text)',
    'review_employee_leave_request(uuid, text, text)',
    'review_leave_correction_request(uuid, text, text)',
    'set_my_presence(text, text)',
    'set_my_profile_media(text, text)',
    'start_my_break(text, text)',
    'submit_my_attendance_correction_request(date, text, text, timestamptz, timestamptz, timestamptz, timestamptz, integer, text)',
    'submit_my_leave_correction_request(uuid, text, text, date, date, text, boolean, numeric)',
    'submit_my_leave_request(text, date, date, boolean, numeric, text, text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', fn);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;
