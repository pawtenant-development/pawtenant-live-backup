-- Company OS — COS-046 Phase 2a — Attendance schema foundation.
--
-- Purpose
--   Additive 5-table data model for shifts + time-in/time-out. Storage in
--   UTC (timestamptz). Business logic in Asia/Karachi (PKT). Overnight
--   shifts first-class via generated columns. NO salary, NO payroll, NO
--   deductions, NO cron, NO UI in this phase.
--
-- Safety
--   * Pure additive. Five new tables + indexes + RLS policies + two
--     SECURITY DEFINER RPCs. NOTHING existing is altered: no change to
--     team_members / doctor_profiles / orders / chats / contacts /
--     audit_logs / RLS / Stripe / edge functions.
--   * Idempotent. Every CREATE/ALTER/INSERT uses IF NOT EXISTS or
--     OR REPLACE / DROP IF EXISTS. Re-running this migration is a no-op.
--   * Reversible. Single rollback migration drops only what this file
--     adds (see end-of-file rollback comment).
--
-- RLS posture (mirrors team_members)
--   * Authenticated employee → SELECT own rows only.
--   * Authenticated owner / admin_manager (via doctor_profiles) →
--     SELECT/INSERT/UPDATE/DELETE all rows.
--   * Anon → blocked (default deny).
--
-- Naming convention: <table>_<purpose>_idx for indexes;
-- attendance_<role>_<verb> for policies.

-- ── Extensions (idempotent) ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ═════════════════════════════════════════════════════════════════════════
-- 1. shift_templates
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.shift_templates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text        NOT NULL,
  description       text,
  timezone          text        NOT NULL DEFAULT 'Asia/Karachi',
  start_time        time        NOT NULL,
  end_time          time        NOT NULL,
  -- Generated: end_time <= start_time means the shift wraps midnight.
  crosses_midnight  boolean     GENERATED ALWAYS AS (end_time <= start_time) STORED,
  grace_minutes     int         NOT NULL DEFAULT 30 CHECK (grace_minutes >= 0),
  is_active         boolean     NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS shift_templates_is_active_idx
  ON public.shift_templates (is_active);

CREATE OR REPLACE FUNCTION public.shift_templates_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS shift_templates_updated_at ON public.shift_templates;
CREATE TRIGGER shift_templates_updated_at
BEFORE UPDATE ON public.shift_templates
FOR EACH ROW EXECUTE FUNCTION public.shift_templates_set_updated_at();

ALTER TABLE public.shift_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_templates_authenticated_read ON public.shift_templates;
CREATE POLICY shift_templates_authenticated_read
  ON public.shift_templates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS shift_templates_admin_write ON public.shift_templates;
CREATE POLICY shift_templates_admin_write
  ON public.shift_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 2. employee_shift_assignments
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.employee_shift_assignments (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id     uuid        NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  shift_template_id  uuid        NOT NULL REFERENCES public.shift_templates(id) ON DELETE RESTRICT,
  weekly_off_days    int[]       NOT NULL DEFAULT ARRAY[]::int[],
  effective_from     date        NOT NULL,
  effective_to       date,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT esa_off_days_dow_chk
    CHECK (
      weekly_off_days <@ ARRAY[0,1,2,3,4,5,6]
      AND array_length(weekly_off_days, 1) IS DISTINCT FROM 0
        OR weekly_off_days = ARRAY[]::int[]
    ),
  CONSTRAINT esa_effective_range_chk
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS esa_team_member_effective_idx
  ON public.employee_shift_assignments (team_member_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS esa_shift_template_idx
  ON public.employee_shift_assignments (shift_template_id);

CREATE OR REPLACE FUNCTION public.employee_shift_assignments_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS esa_updated_at ON public.employee_shift_assignments;
CREATE TRIGGER esa_updated_at
BEFORE UPDATE ON public.employee_shift_assignments
FOR EACH ROW EXECUTE FUNCTION public.employee_shift_assignments_set_updated_at();

ALTER TABLE public.employee_shift_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS esa_self_read ON public.employee_shift_assignments;
CREATE POLICY esa_self_read
  ON public.employee_shift_assignments
  FOR SELECT
  TO authenticated
  USING (
    team_member_id IN (
      SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS esa_admin_all ON public.employee_shift_assignments;
CREATE POLICY esa_admin_all
  ON public.employee_shift_assignments
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 3. time_clock_entries
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.time_clock_entries (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id     uuid        NOT NULL REFERENCES public.team_members(id) ON DELETE RESTRICT,
  assignment_id      uuid        REFERENCES public.employee_shift_assignments(id) ON DELETE SET NULL,
  clock_in_at        timestamptz NOT NULL DEFAULT now(),
  clock_out_at       timestamptz,
  -- PKT calendar date the shift "belongs to". Used by daily summary so
  -- overnight shifts (e.g. 23:30 → 03:30) attach to one work_date.
  work_date          date        GENERATED ALWAYS AS
                                   ((clock_in_at AT TIME ZONE 'Asia/Karachi')::date) STORED,
  source             text        NOT NULL DEFAULT 'web',
  was_late           boolean,
  late_minutes       int,
  auto_closed_at     timestamptz,
  auto_close_reason  text,
  note               text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tce_clock_out_after_in_chk
    CHECK (clock_out_at IS NULL OR clock_out_at >= clock_in_at)
);

-- Authoritative single-open-session-per-employee guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS time_clock_entries_one_open_per_member_idx
  ON public.time_clock_entries (team_member_id)
  WHERE clock_out_at IS NULL;

CREATE INDEX IF NOT EXISTS tce_member_workdate_idx
  ON public.time_clock_entries (team_member_id, work_date DESC);

CREATE INDEX IF NOT EXISTS tce_workdate_idx
  ON public.time_clock_entries (work_date DESC);

CREATE OR REPLACE FUNCTION public.time_clock_entries_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS tce_updated_at ON public.time_clock_entries;
CREATE TRIGGER tce_updated_at
BEFORE UPDATE ON public.time_clock_entries
FOR EACH ROW EXECUTE FUNCTION public.time_clock_entries_set_updated_at();

ALTER TABLE public.time_clock_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tce_self_read ON public.time_clock_entries;
CREATE POLICY tce_self_read
  ON public.time_clock_entries
  FOR SELECT
  TO authenticated
  USING (
    team_member_id IN (
      SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tce_admin_all ON public.time_clock_entries;
CREATE POLICY tce_admin_all
  ON public.time_clock_entries
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 4. attendance_daily_summary  (empty in Phase 2a; computation = Phase 2c)
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.attendance_daily_summary (
  team_member_id        uuid        NOT NULL REFERENCES public.team_members(id) ON DELETE RESTRICT,
  work_date             date        NOT NULL,
  assignment_id         uuid        REFERENCES public.employee_shift_assignments(id) ON DELETE SET NULL,
  was_off_day           boolean     NOT NULL DEFAULT false,
  total_worked_minutes  int         NOT NULL DEFAULT 0,
  first_clock_in_at     timestamptz,
  last_clock_out_at     timestamptz,
  was_late              boolean     NOT NULL DEFAULT false,
  late_minutes          int         NOT NULL DEFAULT 0,
  was_absent            boolean     NOT NULL DEFAULT false,
  worked_on_off_day     boolean     NOT NULL DEFAULT false,
  computed_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_member_id, work_date)
);

CREATE INDEX IF NOT EXISTS ads_workdate_idx
  ON public.attendance_daily_summary (work_date DESC);

ALTER TABLE public.attendance_daily_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ads_self_read ON public.attendance_daily_summary;
CREATE POLICY ads_self_read
  ON public.attendance_daily_summary
  FOR SELECT
  TO authenticated
  USING (
    team_member_id IN (
      SELECT tm.id FROM public.team_members tm WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS ads_admin_all ON public.attendance_daily_summary;
CREATE POLICY ads_admin_all
  ON public.attendance_daily_summary
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  );

-- ═════════════════════════════════════════════════════════════════════════
-- 5. holidays
-- ═════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.holidays (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date  date        NOT NULL UNIQUE,
  name          text        NOT NULL,
  country       text        NOT NULL DEFAULT 'PK',
  is_paid       boolean     NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS holidays_country_date_idx
  ON public.holidays (country, holiday_date);

CREATE OR REPLACE FUNCTION public.holidays_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS holidays_updated_at ON public.holidays;
CREATE TRIGGER holidays_updated_at
BEFORE UPDATE ON public.holidays
FOR EACH ROW EXECUTE FUNCTION public.holidays_set_updated_at();

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holidays_authenticated_read ON public.holidays;
CREATE POLICY holidays_authenticated_read
  ON public.holidays
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS holidays_admin_write ON public.holidays;
CREATE POLICY holidays_admin_write
  ON public.holidays
  FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.doctor_profiles dp
             WHERE dp.user_id = auth.uid()
               AND dp.is_admin = true
               AND COALESCE(dp.role, '') IN ('owner','admin_manager'))
  );

-- ═════════════════════════════════════════════════════════════════════════
-- RPC: clock_in_for_current_user()
-- ═════════════════════════════════════════════════════════════════════════
-- Behaviour:
--   * Resolves caller's team_members row via auth.uid().
--   * Returns the existing OPEN session if one exists (idempotent — no
--     duplicate). Partial unique index is the second line of defence.
--   * Otherwise: looks up the active employee_shift_assignment for the
--     caller (effective range covers today PKT). Uses the linked
--     shift_template to compute was_late + late_minutes against
--     start_time + grace_minutes (PKT wall-clock).
--   * If no active assignment, allows clock-in with was_late = NULL.
--   * Inserts and returns the row id.
CREATE OR REPLACE FUNCTION public.clock_in_for_current_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      -- Expected start = today's PKT date + shift.start_time, in shift TZ.
      v_expected_start :=
        ((v_today_pkt::timestamp + v_shift.start_time) AT TIME ZONE COALESCE(v_shift.timezone, 'Asia/Karachi'));
      v_threshold := v_expected_start + (v_shift.grace_minutes * INTERVAL '1 minute');
      v_late_min := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (now() - v_threshold)) / 60.0))::int;
      v_was_late := v_late_min > 0;
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
$$;

REVOKE ALL ON FUNCTION public.clock_in_for_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clock_in_for_current_user() TO authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- RPC: clock_out_for_current_user()
-- ═════════════════════════════════════════════════════════════════════════
-- Behaviour:
--   * Resolves caller's team_members row via auth.uid().
--   * Sets clock_out_at = now() on the open session, if any.
--   * Returns the row id of the closed session, or NULL if no open
--     session existed (no-op, no error).
CREATE OR REPLACE FUNCTION public.clock_out_for_current_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid             uuid := auth.uid();
  v_team_member_id  uuid;
  v_closed_id       uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'clock_out_for_current_user: not authenticated';
  END IF;

  SELECT id INTO v_team_member_id
    FROM public.team_members
   WHERE user_id = v_uid
   LIMIT 1;

  IF v_team_member_id IS NULL THEN
    RAISE EXCEPTION 'clock_out_for_current_user: no team_members row for caller';
  END IF;

  UPDATE public.time_clock_entries
     SET clock_out_at = now()
   WHERE team_member_id = v_team_member_id
     AND clock_out_at IS NULL
   RETURNING id INTO v_closed_id;

  RETURN v_closed_id;
END;
$$;

REVOKE ALL ON FUNCTION public.clock_out_for_current_user() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clock_out_for_current_user() TO authenticated;

-- ── End-of-file rollback hint ──────────────────────────────────────────────
-- A rollback migration drops these objects in REVERSE order:
--   DROP FUNCTION clock_out_for_current_user;
--   DROP FUNCTION clock_in_for_current_user;
--   DROP TABLE holidays;
--   DROP TABLE attendance_daily_summary;
--   DROP TABLE time_clock_entries;
--   DROP TABLE employee_shift_assignments;
--   DROP TABLE shift_templates;
--   DROP FUNCTION holidays_set_updated_at;
--   DROP FUNCTION time_clock_entries_set_updated_at;
--   DROP FUNCTION employee_shift_assignments_set_updated_at;
--   DROP FUNCTION shift_templates_set_updated_at;
