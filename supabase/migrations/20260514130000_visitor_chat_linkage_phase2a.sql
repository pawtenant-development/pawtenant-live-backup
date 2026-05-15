-- Phase 2A — Visitor ↔ Chat session linkage foundation.
--
-- Adds chat_sessions.visitor_session_id (FK → visitor_sessions.session_id),
-- a backfill trigger that derives the link from external_metadata, a
-- one-time idempotent backfill, and two admin-only read RPCs that surface
-- the link.
--
-- All operations are ADDITIVE and IDEMPOTENT. No existing chat_sessions
-- columns or rows are mutated except the new visitor_session_id field, and
-- only when (a) it's currently NULL and (b) a matching visitor_sessions
-- row exists. No client code change required — captureChat.ts already
-- ships external_metadata.attribution.session_id with every message, and
-- the trigger picks it up automatically.
--
-- Safe to re-run.


-- ── 1. visitor_session_id column + FK + index ──────────────────────────────
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS visitor_session_id uuid;

-- FK with ON DELETE SET NULL. Added separately so we can guard against
-- re-runs without IF NOT EXISTS support on ADD CONSTRAINT.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'chat_sessions_visitor_session_fk'
  ) THEN
    ALTER TABLE public.chat_sessions
      ADD CONSTRAINT chat_sessions_visitor_session_fk
      FOREIGN KEY (visitor_session_id)
      REFERENCES public.visitor_sessions(session_id)
      ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS chat_sessions_visitor_session_idx
  ON public.chat_sessions (visitor_session_id);


-- ── 2. Trigger: auto-derive visitor_session_id from external_metadata ──────
-- captureChat.ts persists external_metadata.attribution.session_id on every
-- chat message via the capture-chat edge function. This trigger pulls that
-- value into the new typed column on INSERT or UPDATE, but ONLY when:
--   * visitor_session_id is still NULL (never overwrite an existing link)
--   * the metadata string parses as a UUID
--   * the referenced visitor_sessions row actually exists (so the FK
--     constraint never fires; a missing row simply leaves the column NULL
--     and the next chat-session UPDATE retries)
--
-- All side-effects are bounded to setting NEW.visitor_session_id. The
-- trigger swallows nothing — if the UUID cast fails, PostgreSQL just skips
-- the assignment via the explicit ~ regex guard.
CREATE OR REPLACE FUNCTION public.chat_sessions_link_visitor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_raw  text;
  v_uuid uuid;
BEGIN
  -- Never overwrite a previously-established link.
  IF NEW.visitor_session_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_raw := NEW.external_metadata #>> '{attribution,session_id}';
  IF v_raw IS NULL THEN
    RETURN NEW;
  END IF;

  -- Strict UUID shape check before casting. Cheaper than a CAST + EXCEPTION.
  IF v_raw !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN NEW;
  END IF;

  v_uuid := v_raw::uuid;

  -- Only link to rows that actually exist — keeps the FK happy and avoids
  -- linking to stale or invented session_ids.
  IF EXISTS (SELECT 1 FROM public.visitor_sessions vs WHERE vs.session_id = v_uuid) THEN
    NEW.visitor_session_id := v_uuid;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop and re-create the trigger to make the migration idempotent.
DROP TRIGGER IF EXISTS chat_sessions_link_visitor_trg ON public.chat_sessions;
CREATE TRIGGER chat_sessions_link_visitor_trg
BEFORE INSERT OR UPDATE OF external_metadata, visitor_session_id
ON public.chat_sessions
FOR EACH ROW
WHEN (NEW.visitor_session_id IS NULL)
EXECUTE FUNCTION public.chat_sessions_link_visitor();


-- ── 3. One-shot safe backfill ─────────────────────────────────────────────
-- Idempotent. Only touches rows that:
--   * have no link yet (visitor_session_id IS NULL)
--   * carry a UUID-shaped attribution.session_id in external_metadata
--   * point to a visitor_sessions row that actually exists
-- Re-running the migration won't update anything that has already been
-- linked, and won't link to vanished sessions.
WITH candidates AS (
  SELECT cs.id,
         (cs.external_metadata #>> '{attribution,session_id}')::uuid AS vsid
    FROM public.chat_sessions cs
   WHERE cs.visitor_session_id IS NULL
     AND cs.external_metadata #>> '{attribution,session_id}'
         ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
UPDATE public.chat_sessions cs
   SET visitor_session_id = c.vsid
  FROM candidates c
  JOIN public.visitor_sessions vs ON vs.session_id = c.vsid
 WHERE cs.id = c.id
   AND cs.visitor_session_id IS NULL;


-- ── 4. get_visitor_journey — admin-only event timeline for one session ─────
-- Returns the chronologically ordered events table rows for a single
-- visitor session, together with the milestone timestamps stored on the
-- visitor_sessions row itself. The caller is expected to render the
-- timeline; this function only assembles the data.
--
-- Admin gate is enforced inline using the same model as get_live_visitors:
-- caller must own a doctor_profiles row with is_admin = true. Anon and
-- non-admin callers receive an empty result set.
CREATE OR REPLACE FUNCTION public.get_visitor_journey(
  p_session_id uuid,
  p_limit      integer DEFAULT 200
) RETURNS TABLE (
  event_id    uuid,
  session_id  uuid,
  event_name  text,
  page_url    text,
  props       jsonb,
  created_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  IF p_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT e.id          AS event_id,
           e.session_id  AS session_id,
           e.event_name,
           e.page_url,
           e.props,
           e.created_at
      FROM public.events e
     WHERE e.session_id = p_session_id
     ORDER BY e.created_at ASC
     LIMIT GREATEST(LEAST(COALESCE(p_limit, 200), 1000), 1);
END;
$$;

REVOKE ALL ON FUNCTION public.get_visitor_journey(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_visitor_journey(uuid, integer)
  TO authenticated;

COMMENT ON FUNCTION public.get_visitor_journey(uuid, integer) IS
  'Admin-only journey timeline for one visitor session. Reuses events + visitor_sessions; no new tracking. Empty result for non-admins.';


-- ── 5. get_chat_pre_chat_context — admin-only pre-chat context ─────────────
-- For a given chat_session id, returns:
--   * the chat session row (id, status, visitor identity, milestone times)
--   * the linked visitor_sessions snapshot (channel, attribution, geo,
--     device, current_page, page_count, milestone times)
--   * the count of events recorded BEFORE the chat opened — useful for
--     a "this visitor browsed N pages before chatting" headline
--
-- Returns a single row (or zero rows for non-admins / missing chat session).
-- Admin gate is inline, identical to the other read RPCs.
CREATE OR REPLACE FUNCTION public.get_chat_pre_chat_context(
  p_chat_session_id uuid
) RETURNS TABLE (
  chat_session_id        uuid,
  chat_status            text,
  chat_created_at        timestamptz,
  chat_visitor_name      text,
  chat_visitor_email     text,
  chat_matched_order_id  uuid,

  visitor_session_id     uuid,
  visitor_channel        text,
  visitor_utm_source     text,
  visitor_utm_medium     text,
  visitor_utm_campaign   text,
  visitor_gclid          text,
  visitor_fbclid         text,
  visitor_ref            text,
  visitor_landing_url    text,
  visitor_referrer       text,
  visitor_device         text,
  visitor_geo            jsonb,
  visitor_current_page   text,
  visitor_page_count     integer,
  visitor_first_seen_at  timestamptz,
  visitor_last_seen_at   timestamptz,
  assessment_started_at  timestamptz,
  paid_at                timestamptz,

  pre_chat_event_count   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  IF p_chat_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(BOOL_OR(dp.is_admin), false)
    INTO v_is_admin
    FROM public.doctor_profiles dp
   WHERE dp.user_id = auth.uid();

  IF NOT v_is_admin THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT cs.id                          AS chat_session_id,
           cs.status                      AS chat_status,
           cs.created_at                  AS chat_created_at,
           cs.visitor_name                AS chat_visitor_name,
           cs.visitor_email               AS chat_visitor_email,
           cs.matched_order_id            AS chat_matched_order_id,

           vs.session_id                  AS visitor_session_id,
           vs.channel                     AS visitor_channel,
           vs.utm_source                  AS visitor_utm_source,
           vs.utm_medium                  AS visitor_utm_medium,
           vs.utm_campaign                AS visitor_utm_campaign,
           vs.gclid                       AS visitor_gclid,
           vs.fbclid                      AS visitor_fbclid,
           vs.ref                         AS visitor_ref,
           vs.landing_url                 AS visitor_landing_url,
           vs.referrer                    AS visitor_referrer,
           vs.device                      AS visitor_device,
           vs.geo                         AS visitor_geo,
           vs.current_page                AS visitor_current_page,
           COALESCE(vs.page_count, 0)     AS visitor_page_count,
           vs.created_at                  AS visitor_first_seen_at,
           vs.last_seen_at                AS visitor_last_seen_at,
           vs.assessment_started_at       AS assessment_started_at,
           vs.paid_at                     AS paid_at,

           COALESCE((
             SELECT COUNT(*)::integer
               FROM public.events e
              WHERE e.session_id = vs.session_id
                AND e.created_at < cs.created_at
           ), 0)                          AS pre_chat_event_count
      FROM public.chat_sessions cs
      LEFT JOIN public.visitor_sessions vs
             ON vs.session_id = cs.visitor_session_id
     WHERE cs.id = p_chat_session_id
     LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_chat_pre_chat_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_chat_pre_chat_context(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_chat_pre_chat_context(uuid) IS
  'Admin-only pre-chat context for one chat session. Joins chat_sessions ↔ visitor_sessions via visitor_session_id and counts pre-chat events. Empty for non-admins.';
