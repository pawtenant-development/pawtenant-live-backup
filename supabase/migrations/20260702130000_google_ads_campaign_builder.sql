-- Google Ads Campaign Builder — draft storage + apply audit trail.
--
-- Drafts are written ONLY by the google-ads-campaign-builder edge function
-- (service role). Admin staff read via RLS (check_is_admin() on LIVE). No anon /
-- customer / provider access. Approval + apply are enforced in the edge
-- function (owner / admin_manager only); read-only staff can view but the
-- function refuses their writes.

-- ── Drafts ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.google_ads_campaign_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  draft_json jsonb NOT NULL,
  validation_status text NOT NULL DEFAULT 'pending',        -- pending | passed | passed_with_warnings | failed
  validation_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation_warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_by_name text,
  approved_by uuid,
  approved_by_name text,
  approved_at timestamptz,
  applied_at timestamptz,
  apply_status text NOT NULL DEFAULT 'not_applied',         -- not_applied | api_validated | applied_paused | apply_failed
  google_ads_customer_id text,
  google_ads_campaign_resource_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gads_campaign_drafts_created_at
  ON public.google_ads_campaign_drafts (created_at DESC);

-- ── Apply results (validate-only runs + real applies) ────────────────────────
CREATE TABLE IF NOT EXISTS public.google_ads_campaign_apply_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid REFERENCES public.google_ads_campaign_drafts(id) ON DELETE SET NULL,
  request_json_redacted jsonb,
  response_json_redacted jsonb,
  created_resource_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  mode text NOT NULL,                                       -- validate_only | apply_paused
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gads_apply_results_draft
  ON public.google_ads_campaign_apply_results (draft_id, created_at DESC);

-- ── RLS: admin staff read-only; all writes via edge function service role ────
ALTER TABLE public.google_ads_campaign_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_campaign_apply_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read campaign drafts" ON public.google_ads_campaign_drafts;
CREATE POLICY "Admins can read campaign drafts"
  ON public.google_ads_campaign_drafts
  FOR SELECT
  TO authenticated
  USING (public.check_is_admin());

DROP POLICY IF EXISTS "Admins can read campaign apply results" ON public.google_ads_campaign_apply_results;
CREATE POLICY "Admins can read campaign apply results"
  ON public.google_ads_campaign_apply_results
  FOR SELECT
  TO authenticated
  USING (public.check_is_admin());

-- No INSERT/UPDATE/DELETE policies on purpose: only the service-role edge
-- function mutates these tables. No anon grants.
