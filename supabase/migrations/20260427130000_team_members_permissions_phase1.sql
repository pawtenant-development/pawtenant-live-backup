-- Company OS — Phase 1.1 — COS-045: team_members permission bundle columns.
--
-- Purpose
--   Foundation only. Adds three nullable columns to public.team_members so
--   the Company OS capability layer (src/lib/permissions.ts) has a place
--   to live. Phase 1 ships zero behaviour change for admin access — these
--   columns are NOT read by getVisibleTabs, AdminSidebar, TeamTab, RLS, or
--   any edge function. A later phase wires them in site by site.
--
-- Safety
--   * Pure additive. No table is rewritten. No constraint, RLS, policy,
--     trigger, sequence, or function is modified.
--   * No CHECK / enum on permission_bundle (kept text + nullable so we can
--     evolve the bundle vocabulary without a migration).
--   * No DEFAULT — every row is created NULL until backfilled.
--   * Idempotent. Each statement uses IF NOT EXISTS. Re-running this
--     migration is a no-op.
--   * Reversible — single rollback migration drops three columns.
--   * doctor_profiles.role / is_admin (operational RBAC) are NOT touched.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS permission_bundle text;

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS permission_addons text[];

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS permission_removed text[];
