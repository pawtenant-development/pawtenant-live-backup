-- Company OS — Phase 1.1: team_members.employee_code
--
-- Adds a permanent, human-readable 6-digit Employee ID alongside the existing
-- UUID primary key.
--
-- TRUE MONOTONIC RULE
--   Codes are MONOTONIC and NEVER REUSED — even after a team_members row is
--   hard-deleted, archived, or reassigned. The allocator is backed by a
--   dedicated Postgres sequence (`team_members_employee_code_seq`) so the
--   counter only ever moves forward. Deleting the highest-numbered row does
--   NOT walk the counter back.
--
-- Safety
--   * Does NOT modify doctor_profiles, orders, chats, contacts, payments, or
--     any other table. Touches only public.team_members + helper objects.
--   * Idempotent: every statement is gated with IF NOT EXISTS / OR REPLACE /
--     DROP IF EXISTS / DO blocks, so re-running this migration is a no-op.
--   * Reversible: a single rollback migration can drop the trigger, the
--     functions, the sequence, the unique index, the CHECK, and the column.
--   * No data loss: column added as NULLABLE; CHECK is regex on the value
--     and accepts NULL during the brief window before the backfill runs.
--   * Backfill is itself idempotent — uses ROW_NUMBER() over the rows that
--     are still NULL and starts numbering after the existing sequence high
--     water mark, then advances the sequence to the new high water mark.
--   * employee_code is TEXT to preserve leading zeros (e.g. '000001').

-- ── 1. Column ──────────────────────────────────────────────────────────────
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS employee_code text;

-- ── 2. Format CHECK constraint (idempotent via DO block) ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'team_members_employee_code_format_chk'
       AND conrelid = 'public.team_members'::regclass
  ) THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_employee_code_format_chk
      CHECK (employee_code IS NULL OR employee_code ~ '^[0-9]{6}$');
  END IF;
END $$;

-- ── 3. Unique index ────────────────────────────────────────────────────────
-- Postgres allows multiple NULLs in a UNIQUE index by default, so this is
-- safe to add before the backfill completes.
CREATE UNIQUE INDEX IF NOT EXISTS team_members_employee_code_unique
  ON public.team_members (employee_code);

-- ── 4. Sequence — the source of truth for "never reused" ──────────────────
-- A dedicated sequence whose value only ever moves forward. Even if every
-- row in team_members is deleted, the next allocation is still last + 1.
-- Owned BY NONE so the sequence is NOT auto-dropped if the column is
-- dropped — rollback handles drops explicitly.
CREATE SEQUENCE IF NOT EXISTS public.team_members_employee_code_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 999999
  NO CYCLE
  OWNED BY NONE;

-- ── 5. Idempotent backfill of existing rows ───────────────────────────────
-- For every row that still has employee_code IS NULL, assign codes in
-- deterministic (created_at, id) order, starting at the existing high
-- water mark + 1. Re-running is safe: WHERE filters to NULLs only, and
-- the sequence is advanced afterwards to the new max.
WITH existing AS (
  SELECT COALESCE(MAX(employee_code::bigint), 0) AS max_code
    FROM public.team_members
   WHERE employee_code ~ '^[0-9]{6}$'
),
to_assign AS (
  SELECT
    id,
    ROW_NUMBER() OVER (ORDER BY created_at, id) AS rn
  FROM public.team_members
  WHERE employee_code IS NULL
)
UPDATE public.team_members tm
   SET employee_code = LPAD((existing.max_code + to_assign.rn)::text, 6, '0')
  FROM to_assign, existing
 WHERE tm.id = to_assign.id;

-- ── 6. Advance the sequence past the current max ──────────────────────────
-- setval(name, value, is_called=true) means "the next nextval() returns
-- value + 1". This guarantees future allocations begin AFTER the highest
-- existing code, regardless of how the rows arrived (backfill, manual
-- insert, etc.).
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

-- ── 7. Allocator function ──────────────────────────────────────────────────
-- Returns the next 6-digit employee_code as text. Backed by the sequence so
-- the value only ever moves forward — deleting the highest-numbered row
-- does NOT cause reuse, because nextval() advances regardless of table
-- contents.
CREATE OR REPLACE FUNCTION public.next_employee_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  v_next := nextval('public.team_members_employee_code_seq');

  IF v_next > 999999 THEN
    RAISE EXCEPTION 'employee_code exhausted at 999999 (six-digit ceiling)';
  END IF;

  RETURN LPAD(v_next::text, 6, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_employee_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_employee_code() TO authenticated, service_role;

-- The sequence itself: revoke broad write privileges; trigger function runs
-- as SECURITY DEFINER so authenticated callers don't need direct nextval
-- rights. service_role keeps full access for server-side admin scripts.
REVOKE ALL    ON SEQUENCE public.team_members_employee_code_seq FROM PUBLIC;
GRANT  USAGE  ON SEQUENCE public.team_members_employee_code_seq TO service_role;

-- ── 8. BEFORE INSERT trigger ──────────────────────────────────────────────
-- Auto-fills employee_code when inserter does not supply one. If the
-- inserter explicitly sets a (valid 6-digit) value, it is honoured.
CREATE OR REPLACE FUNCTION public.team_members_set_employee_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.employee_code IS NULL THEN
    NEW.employee_code := public.next_employee_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS team_members_employee_code_assign ON public.team_members;
CREATE TRIGGER team_members_employee_code_assign
BEFORE INSERT ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.team_members_set_employee_code();
