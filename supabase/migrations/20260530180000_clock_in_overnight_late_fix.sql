-- COS-SHIFT-TIMING-EMPLOYEE-ATTENDANCE
-- Fix overnight late calculation in clock_in_for_current_user.
--
-- Problem: the expected shift start was always anchored to TODAY's date +
-- shift.start_time, and the "today" was hardcoded to Asia/Karachi. For an
-- overnight shift (e.g. 20:00–04:00, crosses_midnight=true) an early-morning
-- clock-in (00:00–04:00) belongs to the shift that STARTED THE PREVIOUS DAY,
-- but the old code anchored to today 20:00 (~16h in the future) → the diff went
-- negative → late_minutes was clamped to 0. So genuinely-late overnight arrivals
-- were always recorded as on-time.
--
-- Fix: compute "now" in the SHIFT's timezone, and for crosses_midnight shifts,
-- if the local time-of-day is before the shift end_time, anchor the expected
-- start to YESTERDAY. Non-overnight behaviour is unchanged. Idempotent open-
-- session handling and the assignment lookup are preserved exactly.

create or replace function public.clock_in_for_current_user()
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_uid             uuid := auth.uid();
  v_team_member_id  uuid;
  v_existing_id     uuid;
  v_assignment      public.employee_shift_assignments%ROWTYPE;
  v_shift           public.shift_templates%ROWTYPE;
  v_today_pkt       date := (now() AT TIME ZONE 'Asia/Karachi')::date;
  v_expected_start  timestamptz;
  v_threshold       timestamptz;
  v_late_min        int;
  v_was_late        boolean;
  v_new_id          uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'clock_in_for_current_user: not authenticated';
  END IF;

  SELECT id INTO v_team_member_id
    FROM public.team_members
   WHERE user_id = v_uid
   LIMIT 1;

  IF v_team_member_id IS NULL THEN
    RAISE EXCEPTION 'clock_in_for_current_user: no team_members row for caller';
  END IF;

  -- Idempotent: if there's an open session, return it.
  SELECT id INTO v_existing_id
    FROM public.time_clock_entries
   WHERE team_member_id = v_team_member_id
     AND clock_out_at IS NULL
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN v_existing_id;
  END IF;

  -- Resolve the active assignment for today PKT.
  SELECT * INTO v_assignment
    FROM public.employee_shift_assignments
   WHERE team_member_id = v_team_member_id
     AND effective_from <= v_today_pkt
     AND (effective_to IS NULL OR effective_to >= v_today_pkt)
   ORDER BY effective_from DESC
   LIMIT 1;

  IF v_assignment.id IS NOT NULL THEN
    SELECT * INTO v_shift
      FROM public.shift_templates
     WHERE id = v_assignment.shift_template_id
     LIMIT 1;

    IF v_shift.id IS NOT NULL AND v_shift.is_active THEN
      DECLARE
        v_tz        text      := COALESCE(v_shift.timezone, 'Asia/Karachi');
        v_now_local timestamp := (now() AT TIME ZONE v_tz);
        v_anchor    date      := v_now_local::date;
      BEGIN
        -- Overnight shift: an early-morning clock-in (local time-of-day before
        -- the shift end) belongs to the shift that started the PREVIOUS day.
        IF v_shift.crosses_midnight AND v_now_local::time < v_shift.end_time THEN
          v_anchor := v_anchor - 1;
        END IF;

        v_expected_start := ((v_anchor::timestamp + v_shift.start_time) AT TIME ZONE v_tz);
        v_threshold := v_expected_start + (COALESCE(v_shift.grace_minutes, 0) * INTERVAL '1 minute');
        v_late_min := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (now() - v_threshold)) / 60.0))::int;
        v_was_late := v_late_min > 0;
      END;
    END IF;
  END IF;

  INSERT INTO public.time_clock_entries (
    team_member_id, assignment_id, clock_in_at, source, was_late, late_minutes
  ) VALUES (
    v_team_member_id,
    v_assignment.id,
    now(),
    'web',
    v_was_late,
    v_late_min
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$function$;
