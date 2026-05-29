-- Company OS — Phase 1: team_members table.
--
-- Purpose
--   Additive employee profile table for the new Employee Portal / Company Home.
--   This is the very first Company OS migration; everything else (attendance,
--   leave, salary, benefits, internal email, announcements, refund approval,
--   commissions, provider table split) is deferred to later phases.
--
-- Safety
--   * Does NOT modify doctor_profiles, orders, chats, contacts, payments, or
--     any other existing table.
--   * Idempotent: every statement is gated with IF NOT EXISTS / OR REPLACE /
--     DROP IF EXISTS / ON CONFLICT, so re-running this migration is a no-op.
--   * Reversible: a single rollback migration can drop the trigger, the
--     function, the policies, and the table — leaving the rest of the schema
--     untouched.

-- ── 0. Extensions ──────────────────────────────────────────────────────────
-- pgcrypto is normally already enabled in Supabase, but this is harmless if so.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 1. Table ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.team_members (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid        UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  legacy_doctor_profile_id uuid,
  display_name             text,
  display_picture_url      text,
  cover_photo_url          text,
  department               text,
  title                    text,
  authority_level          text,
  manager_id               uuid        REFERENCES public.team_members(id) ON DELETE SET NULL,
  workspace_email          text,
  is_active                boolean     NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_members_user_id_idx     ON public.team_members (user_id);
CREATE INDEX IF NOT EXISTS team_members_department_idx  ON public.team_members (department);
CREATE INDEX IF NOT EXISTS team_members_is_active_idx   ON public.team_members (is_active);
CREATE INDEX IF NOT EXISTS team_members_manager_id_idx  ON public.team_members (manager_id);

-- ── 2. updated_at trigger ─────────────────────────────────────────────────
-- Mirrors the project pattern (see chat_sessions, visitor_sessions).
CREATE OR REPLACE FUNCTION public.team_members_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS team_members_updated_at ON public.team_members;
CREATE TRIGGER team_members_updated_at
BEFORE UPDATE ON public.team_members
FOR EACH ROW EXECUTE FUNCTION public.team_members_set_updated_at();

-- ── 3. RLS ─────────────────────────────────────────────────────────────────
-- Default deny. Two access paths:
--   1. The signed-in user can read their own row.
--   2. Owner / admin_manager (looked up via doctor_profiles) can read +
--      manage all rows.
-- Note: this RLS only governs the team_members table itself. We do NOT
-- modify RLS on any other table.
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_members_self_read ON public.team_members;
CREATE POLICY team_members_self_read
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS team_members_admin_read ON public.team_members;
CREATE POLICY team_members_admin_read
  ON public.team_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.doctor_profiles dp
       WHERE dp.user_id = auth.uid()
         AND dp.is_admin = true
         AND COALESCE(dp.role, '') IN ('owner', 'admin_manager')
    )
  );

DROP POLICY IF EXISTS team_members_admin_insert ON public.team_members;
CREATE POLICY team_members_admin_insert
  ON public.team_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.doctor_profiles dp
       WHERE dp.user_id = auth.uid()
         AND dp.is_admin = true
         AND COALESCE(dp.role, '') IN ('owner', 'admin_manager')
    )
  );

DROP POLICY IF EXISTS team_members_admin_update ON public.team_members;
CREATE POLICY team_members_admin_update
  ON public.team_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.doctor_profiles dp
       WHERE dp.user_id = auth.uid()
         AND dp.is_admin = true
         AND COALESCE(dp.role, '') IN ('owner', 'admin_manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.doctor_profiles dp
       WHERE dp.user_id = auth.uid()
         AND dp.is_admin = true
         AND COALESCE(dp.role, '') IN ('owner', 'admin_manager')
    )
  );

DROP POLICY IF EXISTS team_members_admin_delete ON public.team_members;
CREATE POLICY team_members_admin_delete
  ON public.team_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.doctor_profiles dp
       WHERE dp.user_id = auth.uid()
         AND dp.is_admin = true
         AND COALESCE(dp.role, '') IN ('owner', 'admin_manager')
    )
  );

-- ── 4. Idempotent backfill from doctor_profiles ───────────────────────────
-- For every internal admin user (is_admin = true, user_id IS NOT NULL) that
-- does not yet have a team_members row, insert a stub carrying their existing
-- display name and title. ON CONFLICT (user_id) DO NOTHING makes this safe to
-- re-run.
INSERT INTO public.team_members (
  user_id,
  legacy_doctor_profile_id,
  display_name,
  title,
  is_active
)
SELECT
  dp.user_id,
  dp.id,
  COALESCE(NULLIF(TRIM(dp.full_name), ''), 'Team Member'),
  dp.title,
  COALESCE(dp.is_active, true)
FROM public.doctor_profiles dp
WHERE dp.is_admin = true
  AND dp.user_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
