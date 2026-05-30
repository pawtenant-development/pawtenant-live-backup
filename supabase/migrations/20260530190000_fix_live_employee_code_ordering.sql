-- COMPANY-OS-LIVE-PARITY-EMPLOYEE-ID-FIX (LIVE only)
--
-- Problem
--   The Phase-1 team_members backfill assigned employee_code by
--   (created_at, id). On LIVE every row shares the same backfill timestamp,
--   so codes fell in arbitrary UUID order — Hamza Farid (owner) landed on
--   000006 instead of 000001.
--
-- Fix
--   Re-rank the 7 existing team_members so leadership comes first
--   (owner Hamza -> 000001, co-owner Omer -> 000002, manager Asim -> 000003),
--   and everyone else keeps their existing relative order (by current
--   employee_code) starting at 000004. Sequence is realigned so the next
--   allocation continues after the highest assigned code.
--
-- Safety
--   * employee_code is NOT a foreign key anywhere — employee_shift_assignments,
--     time_clock_entries, attendance_daily_summary and team_members.manager_id
--     all reference team_members.id (uuid). Remapping codes cannot break
--     existing assignments or attendance data.
--   * Two-phase update: rows are first parked at temporary 9000xx codes
--     (valid 6-digit, collision-free) then set to their final 0000xx values,
--     so the unique index team_members_employee_code_unique is never
--     transiently violated mid-statement.
--   * Deterministic + effectively idempotent: re-running produces the same
--     final mapping.
--   * Leadership matched by display_name (not by hardcoded generated UUIDs).
--   * No schema change, no RLS change, no provider/doctor_profiles change.

-- ── Phase 1: park every row at a temporary, collision-free code ────────────
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      ORDER BY
        CASE
          WHEN display_name = 'Hamza Farid' THEN 0   -- owner (primary)
          WHEN display_name = 'Omer'        THEN 1   -- co-owner
          WHEN display_name = 'Asim Iqbal'  THEN 2   -- manager / admin_manager
          ELSE 3
        END,
        employee_code                                -- preserve existing order for the rest
    ) AS rn
  FROM public.team_members
)
UPDATE public.team_members tm
   SET employee_code = LPAD((900000 + r.rn)::text, 6, '0')
  FROM ranked r
 WHERE tm.id = r.id;

-- ── Phase 2: shift parked 9000xx codes down to final 0000xx ────────────────
UPDATE public.team_members
   SET employee_code = LPAD((employee_code::int - 900000)::text, 6, '0')
 WHERE employee_code ~ '^9000[0-9][0-9]$';

-- ── Phase 3: realign the monotonic sequence to the new high-water mark ─────
DO $$
DECLARE
  v_max bigint;
BEGIN
  SELECT COALESCE(MAX(employee_code::bigint), 0)
    INTO v_max
    FROM public.team_members
   WHERE employee_code ~ '^[0-9]{6}$';

  IF v_max > 0 THEN
    PERFORM setval('public.team_members_employee_code_seq', v_max, true);
  END IF;
END $$;
