-- Session-link forward stamp + one-shot backfill.
--
-- Why this exists:
--   The admin Order Attribution / Journey tab reads orders.session_id to
--   find the linked visitor session and hydrate Page Journey + Session
--   Link panels. Two gaps kept orders.session_id NULL on LIVE:
--
--   1. The /assessment client already POSTs sessionId to the
--      get-resume-order edge function, but until 2026-05-18 the edge
--      function dropped the key when building the upsert payload. That is
--      fixed in this commit on the function side.
--
--   2. The previous link_session_to_order RPC only wrote back from
--      orders → visitor_sessions (setting visitor_sessions.confirmation_id
--      on payment success). It did NOT write the inverse direction. So
--      even after a successful payment, orders.session_id stayed NULL for
--      every lead whose initial save predated the edge-function fix.
--
-- What this migration does:
--   §1. One-shot backfill of orders.session_id from the inverse linkage
--       already stored in visitor_sessions.confirmation_id. Restores
--       historical rows that were captured correctly on the
--       visitor_sessions side but never stamped on the order side.
--
--   §2. Replaces link_session_to_order so future payment-time conversions
--       ALSO stamp orders.session_id with COALESCE-style semantics —
--       never overwrites a value that was already set by the lead save.
--
-- All operations are idempotent. Safe to re-run. ADDITIVE only — no
-- existing rows, columns, indexes, RLS policies, or RPCs are dropped.


-- ── §1. One-shot backfill ───────────────────────────────────────────────────
-- For every order whose session_id is NULL but whose confirmation_id
-- already appears on a visitor_sessions row, copy the session_id over.
-- WHERE clause guarantees re-runs are no-ops.
UPDATE public.orders o
   SET session_id = vs.session_id
  FROM public.visitor_sessions vs
 WHERE o.confirmation_id = vs.confirmation_id
   AND o.session_id IS NULL
   AND vs.session_id IS NOT NULL;


-- ── §2. Bidirectional link_session_to_order ────────────────────────────────
-- Same signature, same grants, same exception model. The only addition is
-- the second UPDATE that forward-stamps orders.session_id when missing.
-- COALESCE-style WHERE clause means once a row has a session_id, this RPC
-- never overwrites it (matches the lead-save semantics).
CREATE OR REPLACE FUNCTION public.link_session_to_order(
  p_session_id      uuid,
  p_confirmation_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_session_id IS NULL OR p_confirmation_id IS NULL OR length(trim(p_confirmation_id)) = 0 THEN
    RETURN;
  END IF;

  -- Back-link visitor_sessions → order (preserved behavior from
  -- analytics_phase1 — sets confirmation_id + paid_at if missing).
  BEGIN
    UPDATE public.visitor_sessions
       SET confirmation_id = COALESCE(confirmation_id, p_confirmation_id),
           paid_at         = COALESCE(paid_at, now())
     WHERE session_id = p_session_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Forward-link order → session (new). Only fills when missing so a
  -- session_id stamped by the lead save is never clobbered by a later
  -- thank-you-page link call.
  BEGIN
    UPDATE public.orders
       SET session_id = p_session_id
     WHERE confirmation_id = p_confirmation_id
       AND session_id IS NULL;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.link_session_to_order(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_session_to_order(uuid, text)
  TO anon, authenticated;

COMMENT ON FUNCTION public.link_session_to_order(uuid, text) IS
  'Bidirectional link between visitor_sessions and orders. Sets visitor_sessions.confirmation_id + paid_at and orders.session_id, all via COALESCE so existing values are preserved. SECURITY DEFINER, anon-callable, never raises.';
