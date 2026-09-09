-- ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001 (LIVE promotion)
-- =============================================================================
-- TWO owner decisions, one migration, because they meet on the same row.
--
-- FIX 1 — THE 30-DAY OFFICIAL-LETTER RULE IS ESA-ONLY
-- ---------------------------------------------------
-- ROOT CAUSE. Every gate in the 30-day workflow was written as
--
--     is_thirty_day_official_letter_state(state)
--       AND payment_intent_id IS NOT NULL
--       AND (doctor_user_id IS NOT NULL OR doctor_email IS NOT NULL)
--
-- i.e. the rule keyed on the CUSTOMER'S STATE and on nothing about the PRODUCT.
-- A PSD order in CA / AR / IA / LA / MT satisfied it exactly as an ESA order
-- does, so on its first completion it was enrolled, given a due date, reopened
-- on day 29, moved back to Under Review, flipped to doctor_status
-- 'thirty_day_reissue', and both the provider and the customer were emailed
-- about an "official 30-day letter" that PSD has no such rule for.
--
-- THE PREDICATE. classify_order_service_family() reads the AUTHORITATIVE product
-- fields — letter_type, package_key, package_display_name, plan_type — never the
-- confirmation_id. It is deliberately ASYMMETRIC:
--
--     any PSD evidence            -> 'psd'      (wins over any ESA evidence)
--     otherwise ESA evidence      -> 'esa'
--     otherwise                   -> 'unknown'
--
-- and only 'esa' is ever eligible. 'unknown' therefore fails CLOSED too. TEST
-- holds a real contradiction row (letter_type='psd' + package_key='esa_standard'
-- + package_display_name='ESA Letter'); the asymmetry classifies it 'psd', which
-- is the safe reading.
--
-- order_service_family() adds ONE fallback and only one: a row whose OWN four
-- fields say nothing at all inherits its parent order's family. That helps a
-- child/amended order in BOTH directions (a PSD parent excludes the child too).
--
-- FAIL CLOSED ON STALE STATE. A non-ESA order that already carries
-- official_letter_30_day_required = true or a non-null official_letter_due_at
-- can never be selected again: the cron predicate is recomputed from the product
-- fields, not read from those columns, and the completion trigger CLEARS them.
-- official_letter_reopened_at is preserved as history — it records something
-- that genuinely happened and is what repair_psd_official_letter_state() uses to
-- separate "merely scheduled" from "already reopened".
--
-- ESA BEHAVIOUR IS UNCHANGED. Day-29 scheduling, the reopen, the provider bell +
-- email, the customer notice, the once-per-cycle idempotency markers and the
-- daily 08:00 UTC cron are all carried over verbatim from
-- 20260710130000_official_letter_29_day_customer_notify_backfill.sql.
--
-- FIX 2 — ADMIN FORCE COMPLETE
-- ----------------------------
-- The admin "Mark Delivered" control was disabled whenever the provider had not
-- uploaded a letter, and "Mark as Completed" was rendered only for an order
-- already sitting in 'under-review'. An admin could therefore not complete an
-- unpaid lead, a paid/unassigned order, a payment-failed, cancelled or refunded
-- order, or an under-review order whose provider never uploaded anything.
--
-- admin_force_complete_order() is the authoritative server transition. It is
-- gated on the canonical is_admin_staff() predicate (doctor_profiles.is_admin
-- AND is_active) — never on editable user_metadata — requires a reason, refuses
-- a stale edit cleanly, is idempotent, and RECORDS rather than manufactures:
--
--   * it never creates a document row, document URL, signature, verification
--     record or provider submission;
--   * it never creates a provider earning. Provider earnings are created ONLY by
--     notify-patient-letter (de-duped on confirmation_id + earning_type='base'),
--     which this transition does not call. Existing earnings are untouched;
--   * when no customer-visible document exists it stamps
--     completed_without_customer_document = true, and notify-order-status
--     refuses to send the "your documents are ready" email for such an order.
--
-- SAFETY
--   * Additive columns only; every function is CREATE OR REPLACE; the repair is
--     idempotent and defaults to a DRY RUN.
--   * No price, package, payment, refund, document, verification, attribution or
--     provider-licensing column is written anywhere in this migration.
-- =============================================================================

-- ── 1. Canonical ESA / PSD service family ───────────────────────────────────

-- PURE. Four authoritative product fields in, one family out. Deliberately does
-- NOT look at confirmation_id: an id prefix is a display reference, not a
-- product record, and legacy ids do not carry one reliably.
CREATE OR REPLACE FUNCTION public.classify_order_service_family(
  p_letter_type           text,
  p_package_key           text,
  p_package_display_name  text,
  p_plan_type             text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH s AS (
    SELECT lower(btrim(coalesce(p_letter_type, '')))          AS lt,
           lower(btrim(coalesce(p_package_key, '')))          AS pk,
           lower(btrim(coalesce(p_package_display_name, ''))) AS pdn,
           lower(btrim(coalesce(p_plan_type, '')))            AS pt
  )
  SELECT CASE
    -- PSD evidence ALWAYS wins. Covers 'psd', 'psd-consultation', 'psd_standard',
    -- 'psd_ra_bundle', 'PSD Documentation', 'PSD + Reasonable Accommodation
    -- Letter', 'PSD Consultation' and any future psd-prefixed value.
    WHEN (SELECT lt ~ '^psd' OR pk ~ '^psd' OR pdn ~ '^psd' OR pt ~ '^psd'
                 OR pdn ~ 'psychiatric service dog' OR pt ~ 'psychiatric service dog'
            FROM s) THEN 'psd'
    -- ESA evidence, only once PSD has been ruled out.
    WHEN (SELECT lt ~ '^esa' OR pk ~ '^esa' OR pdn ~ '^esa'
                 OR pdn ~ 'emotional support animal' OR pt ~ 'emotional support animal'
            FROM s) THEN 'esa'
    ELSE 'unknown'
  END;
$$;

COMMENT ON FUNCTION public.classify_order_service_family(text, text, text, text) IS
  'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001: canonical ESA/PSD product family from the authoritative order fields. PSD evidence wins; anything unprovable is unknown. Never reads confirmation_id.';

-- Row-aware wrapper. Scalar arguments only — never the whole `orders` row — so
-- it is safe to call from a WHERE clause without forcing a TOAST expansion.
CREATE OR REPLACE FUNCTION public.order_service_family(
  p_letter_type           text,
  p_package_key           text,
  p_package_display_name  text,
  p_plan_type             text,
  p_parent_order_id       uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v text;
BEGIN
  v := public.classify_order_service_family(
         p_letter_type, p_package_key, p_package_display_name, p_plan_type);

  -- The ONLY fallback: a row whose own fields prove nothing inherits its parent.
  -- Applies in both directions, so a PSD parent excludes an otherwise-blank child.
  IF v <> 'unknown' OR p_parent_order_id IS NULL THEN
    RETURN v;
  END IF;

  SELECT public.classify_order_service_family(
           o.letter_type, o.package_key, o.package_display_name, o.plan_type)
    INTO v
    FROM public.orders o
   WHERE o.id = p_parent_order_id;

  RETURN coalesce(v, 'unknown');
END;
$$;

COMMENT ON FUNCTION public.order_service_family(text, text, text, text, uuid) IS
  'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001: order service family with a single parent-order fallback for rows whose own product fields are entirely absent.';

-- THE eligibility gate. ESA + a 30-day relationship state. Everything else — PSD
-- and unknown alike — is excluded.
CREATE OR REPLACE FUNCTION public.is_official_letter_30_day_eligible(
  p_letter_type           text,
  p_package_key           text,
  p_package_display_name  text,
  p_plan_type             text,
  p_parent_order_id       uuid,
  p_state                 text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.is_thirty_day_official_letter_state(p_state)
     AND public.order_service_family(
           p_letter_type, p_package_key, p_package_display_name, p_plan_type,
           p_parent_order_id) = 'esa';
$$;

COMMENT ON FUNCTION public.is_official_letter_30_day_eligible(text, text, text, text, uuid, text) IS
  'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001: the ONE server-side predicate for 30-day official-letter eligibility. ESA only; PSD and unknown always excluded.';

-- ── 2. Completion trigger — ESA gate + stale-state clearing ─────────────────
CREATE OR REPLACE FUNCTION public.handle_official_letter_completion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_family text;
BEGIN
  v_family := public.order_service_family(
                NEW.letter_type, NEW.package_key, NEW.package_display_name,
                NEW.plan_type, NEW.parent_order_id);

  -- ESA-ONLY (ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001). Anything not
  -- provably ESA is excluded, and any stale scheduling it is carrying is cleared
  -- in this same write so no later cron run, projection or notification can act
  -- on it. official_letter_reopened_at is left alone: it is history, and the
  -- repair function needs it to tell "scheduled" from "already reopened".
  IF v_family <> 'esa' THEN
    IF NEW.official_letter_30_day_required OR NEW.official_letter_due_at IS NOT NULL THEN
      NEW.official_letter_30_day_required := false;
      NEW.official_letter_due_at          := null;
    END IF;
    RETURN NEW;
  END IF;

  -- Only paid 30-day-state orders that have a provider are ever enrolled.
  IF NOT (
    public.is_thirty_day_official_letter_state(NEW.state)
    AND NEW.payment_intent_id IS NOT NULL
    AND (NEW.doctor_user_id IS NOT NULL OR NEW.doctor_email IS NOT NULL)
  ) THEN
    RETURN NEW;
  END IF;

  -- Cycle already finished -> never touch again.
  IF NEW.official_letter_cycle_complete THEN
    RETURN NEW;
  END IF;

  IF NEW.official_letter_first_completed_at IS NULL THEN
    -- FIRST completion: enroll and schedule the DAY-29 reopen.
    NEW.official_letter_30_day_required    := true;
    NEW.official_letter_first_completed_at := now();
    NEW.official_letter_due_at             := now() + interval '29 days';

  ELSIF NEW.official_letter_reopened_at IS NOT NULL
        AND NEW.official_letter_final_completed_at IS NULL THEN
    -- SECOND completion, AFTER the automated reopen: official/final letter done.
    NEW.official_letter_final_completed_at := now();
    NEW.official_letter_cycle_complete     := true;
  END IF;
  -- Any other re-completion (manual correction BEFORE the auto reopen) leaves
  -- enrollment intact so the day-29 reopen still fires at due_at.

  RETURN NEW;
END;
$$;

-- ── 3. Cron selector — ESA gate on the SELECTION itself ────────────────────
-- Body carried over verbatim from the day-29 migration; the ONLY change is the
-- first WHERE arm, which now recomputes eligibility from the product fields
-- instead of trusting the state column alone.
CREATE OR REPLACE FUNCTION public.reopen_due_official_letter_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r              RECORD;
  cnt            integer := 0;
  v_service_key  text;
  v_provider_url text := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/notify-thirty-day-reissue';
  v_customer_url text := 'https://cvwbozlbbmrjxznknouq.supabase.co/functions/v1/notify-thirty-day-customer';
BEGIN
  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'payout_cron_service_key'
  LIMIT 1;

  FOR r IN
    SELECT id, confirmation_id, state, doctor_status, doctor_user_id, doctor_email,
           official_letter_customer_notified_at, official_letter_due_at
    FROM public.orders
    WHERE public.is_official_letter_30_day_eligible(
            letter_type, package_key, package_display_name, plan_type,
            parent_order_id, state)                     -- ESA-ONLY (see header)
      AND payment_intent_id IS NOT NULL
      AND status = 'completed'
      AND (doctor_user_id IS NOT NULL OR doctor_email IS NOT NULL)
      AND official_letter_first_completed_at IS NOT NULL
      AND official_letter_due_at IS NOT NULL
      AND official_letter_due_at::date <= now()::date   -- DAY 29 (date-based)
      AND official_letter_final_completed_at IS NULL
      AND official_letter_cycle_complete = false
      AND official_letter_reopened_at IS NULL
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE public.orders
    SET status                      = 'under-review',
        doctor_status               = 'thirty_day_reissue',
        official_letter_reopened_at = now()
    WHERE id = r.id;

    -- order_status_logs is written automatically by the existing
    -- orders_status_change_trigger. Add the 30-day-specific audit context only.
    BEGIN
      INSERT INTO public.audit_logs
        (action, object_type, object_id, actor_name, actor_role,
         description, old_values, new_values, metadata)
      VALUES
        ('official_letter_30_day_reopen', 'order', r.confirmation_id,
         'System - 30-Day Official Letter', 'system',
         'Order automatically moved back to Under Review on day 29 for the official/final letter '
           || '(30-day relationship rule, ' || coalesce(r.state, '') || '). '
           || 'Same provider preserved. Provider + customer notified.',
         jsonb_build_object('status', 'completed', 'doctor_status', r.doctor_status),
         jsonb_build_object('status', 'under-review', 'doctor_status', 'thirty_day_reissue'),
         jsonb_build_object('confirmation_id', r.confirmation_id, 'order_id', r.id,
                            'reason', 'thirty_day_official_letter', 'trigger_day', 29,
                            'service_family', 'esa'));
    EXCEPTION WHEN OTHERS THEN
      NULL; -- logging must never block the reopen
    END;

    -- Provider in-portal bell record (only when the assigned provider's user id
    -- is known; doctor_notifications.doctor_user_id is NOT NULL / FK to users).
    BEGIN
      IF r.doctor_user_id IS NOT NULL THEN
        INSERT INTO public.doctor_notifications
          (doctor_user_id, title, message, type, confirmation_id, order_id)
        VALUES
          (r.doctor_user_id,
           'Official 30-Day Letter Needed',
           'Order ' || r.confirmation_id || ' has returned to your queue for the '
             || 'official/final 30-day letter. Please review the case and submit '
             || 'the official letter.',
           'thirty_day_reissue', r.confirmation_id, r.id);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- bell record is best-effort
    END;

    -- Provider email via the existing notify-thirty-day-reissue edge function.
    BEGIN
      IF r.doctor_email IS NOT NULL
         AND v_service_key IS NOT NULL AND v_service_key <> '' THEN
        PERFORM net.http_post(
          url     := v_provider_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body    := jsonb_build_object('confirmationId', r.confirmation_id)
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- provider email dispatch must never block the reopen
    END;

    -- Customer email via notify-thirty-day-customer.
    BEGIN
      IF r.official_letter_customer_notified_at IS NULL
         AND r.official_letter_due_at >= now() - interval '20 days'
         AND v_service_key IS NOT NULL AND v_service_key <> '' THEN
        PERFORM net.http_post(
          url     := v_customer_url,
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body    := jsonb_build_object('confirmationId', r.confirmation_id)
        );
        UPDATE public.orders
        SET official_letter_customer_notified_at = now()
        WHERE id = r.id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- customer email dispatch must never block the reopen
    END;

    cnt := cnt + 1;
  END LOOP;

  RETURN cnt;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM anon;
REVOKE ALL ON FUNCTION public.reopen_due_official_letter_orders() FROM authenticated;

-- ── 4. Historical PSD repair (idempotent, dry-run by default) ───────────────
CREATE OR REPLACE FUNCTION public.repair_psd_official_letter_state(p_dry_run boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_scheduled jsonb := '[]'::jsonb;
  v_reopened  jsonb := '[]'::jsonb;
  v_repaired  integer := 0;
  r           RECORD;
BEGIN
  -- Non-ESA orders that the state-only rule enrolled but that have NOT yet been
  -- reopened. Safe to repair: clear the flag and the future due date, touch
  -- nothing else.
  FOR r IN
    SELECT id, confirmation_id, official_letter_due_at, official_letter_30_day_required,
           public.order_service_family(letter_type, package_key, package_display_name,
                                       plan_type, parent_order_id) AS family
      FROM public.orders
     WHERE public.order_service_family(letter_type, package_key, package_display_name,
                                       plan_type, parent_order_id) <> 'esa'
       AND official_letter_reopened_at IS NULL
       AND (official_letter_30_day_required = true OR official_letter_due_at IS NOT NULL)
     ORDER BY confirmation_id
  LOOP
    v_scheduled := v_scheduled || jsonb_build_object(
      'confirmation_id', r.confirmation_id,
      'service_family',  r.family,
      'was_required',    r.official_letter_30_day_required,
      'was_due_at',      r.official_letter_due_at);

    IF NOT p_dry_run THEN
      UPDATE public.orders
         SET official_letter_30_day_required = false,
             official_letter_due_at          = null
       WHERE id = r.id;

      INSERT INTO public.audit_logs
        (action, object_type, object_id, actor_name, actor_role,
         description, old_values, new_values, metadata)
      VALUES
        ('official_letter_30_day_psd_scope_repair', 'order', r.confirmation_id,
         'System - ESA-only 30-day scope repair', 'system',
         'Order is not an ESA order, so the 30-day official-letter rule does not apply. '
           || 'The scheduled reopen was removed. Payment, documents, provider assignment, '
           || 'completion state and earnings were not touched.',
         jsonb_build_object('official_letter_30_day_required', r.official_letter_30_day_required,
                            'official_letter_due_at', r.official_letter_due_at),
         jsonb_build_object('official_letter_30_day_required', false,
                            'official_letter_due_at', null),
         jsonb_build_object('confirmation_id', r.confirmation_id, 'order_id', r.id,
                            'service_family', r.family,
                            'task', 'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001'));
      v_repaired := v_repaired + 1;
    END IF;
  END LOOP;

  -- Non-ESA orders the rule ALREADY reopened. Deliberately NOT repaired: their
  -- correct prior lifecycle state has to be read out of audit history, and
  -- guessing it would rewrite a real order. Reported for owner review instead.
  FOR r IN
    SELECT id, confirmation_id, status, doctor_status,
           official_letter_reopened_at, official_letter_customer_notified_at,
           public.order_service_family(letter_type, package_key, package_display_name,
                                       plan_type, parent_order_id) AS family
      FROM public.orders
     WHERE public.order_service_family(letter_type, package_key, package_display_name,
                                       plan_type, parent_order_id) <> 'esa'
       AND official_letter_reopened_at IS NOT NULL
     ORDER BY confirmation_id
  LOOP
    v_reopened := v_reopened || jsonb_build_object(
      'confirmation_id',      r.confirmation_id,
      'service_family',       r.family,
      'status',               r.status,
      'doctor_status',        r.doctor_status,
      'reopened_at',          r.official_letter_reopened_at,
      'customer_notified_at', r.official_letter_customer_notified_at);
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',                                  p_dry_run,
    'scheduled_not_reopened_count',             jsonb_array_length(v_scheduled),
    'scheduled_not_reopened',                   v_scheduled,
    'already_reopened_needs_owner_review_count', jsonb_array_length(v_reopened),
    'already_reopened_needs_owner_review',      v_reopened,
    'repaired',                                 v_repaired);
END;
$$;

COMMENT ON FUNCTION public.repair_psd_official_letter_state(boolean) IS
  'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001: idempotent inventory + repair of non-ESA orders carrying 30-day ESA state. Clears only official_letter_30_day_required / official_letter_due_at on orders not yet reopened; already-reopened orders are reported for owner review, never guessed back.';

REVOKE ALL ON FUNCTION public.repair_psd_official_letter_state(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_psd_official_letter_state(boolean) FROM anon;
REVOKE ALL ON FUNCTION public.repair_psd_official_letter_state(boolean) FROM authenticated;

-- ── 5. Admin force-complete: columns ───────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS admin_force_completed_at            timestamptz,
  ADD COLUMN IF NOT EXISTS admin_force_completed_by            uuid,
  ADD COLUMN IF NOT EXISTS admin_force_complete_reason         text,
  ADD COLUMN IF NOT EXISTS completed_without_customer_document boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orders.admin_force_completed_at IS
  'When an admin used the Force Complete override on this order. Set on every successful override.';
COMMENT ON COLUMN public.orders.admin_force_completed_by IS
  'auth.uid() of the admin who used the Force Complete override.';
COMMENT ON COLUMN public.orders.admin_force_complete_reason IS
  'The reason the admin gave for the Force Complete override.';
COMMENT ON COLUMN public.orders.completed_without_customer_document IS
  'TRUE when the order was completed while no customer-visible document existed. Suppresses the "your documents are ready" email and the delivered claims in the customer portal.';

-- ── 6. Customer-visible document existence (server-side mirror of the client
--       resolver in src/lib/customerDocuments.ts) ────────────────────────────
CREATE OR REPLACE FUNCTION public.order_has_customer_visible_document(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.order_documents d
            WHERE d.order_id = p_order_id
              AND d.customer_visible = true
              AND d.superseded_by_document_id IS NULL
              AND lower(coalesce(d.review_status, 'not_applicable'))
                    IN ('approved', 'not_applicable'))
      OR EXISTS (
           SELECT 1 FROM public.orders o
            WHERE o.id = p_order_id
              AND nullif(btrim(coalesce(o.signed_letter_url, '')), '') IS NOT NULL);
$$;

COMMENT ON FUNCTION public.order_has_customer_visible_document(uuid) IS
  'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001: does the customer have anything to open? Mirrors resolveCustomerDocuments(): a live, lineage-terminal, release-approved customer_visible row, or the legacy signed_letter_url fallback.';

-- ── 7. Force-complete preview (what the confirmation dialog must show) ─────
CREATE OR REPLACE FUNCTION public.admin_force_complete_preview(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order    public.orders;
  v_has_doc  boolean;
  v_provider boolean;
  v_earnings integer;
BEGIN
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'admin_force_complete_preview: not authorised' USING errcode = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_force_complete_preview: order % not found', p_order_id;
  END IF;

  v_has_doc  := public.order_has_customer_visible_document(v_order.id);
  v_provider := (v_order.doctor_user_id IS NOT NULL OR v_order.doctor_email IS NOT NULL);

  SELECT count(*) INTO v_earnings
    FROM public.doctor_earnings
   WHERE confirmation_id = v_order.confirmation_id
     AND status <> 'cancelled';

  RETURN jsonb_build_object(
    'order_id',                   v_order.id,
    'confirmation_id',            v_order.confirmation_id,
    'current_status',             v_order.status,
    'current_doctor_status',      v_order.doctor_status,
    'resulting_status',           'completed',
    'resulting_doctor_status',    'patient_notified',
    'already_completed',          (v_order.status = 'completed'
                                   AND v_order.doctor_status = 'patient_notified'),
    'has_provider',               v_provider,
    'provider_name',              v_order.doctor_name,
    'has_customer_document',      v_has_doc,
    -- The customer is emailed ONLY when there is genuinely something to open.
    'will_notify_customer',       v_has_doc,
    -- This transition creates no earning on any path. notify-patient-letter is
    -- the only writer of a base provider earning and it is not called here.
    'provider_earning_action',    CASE WHEN v_provider THEN 'preserved_none_created'
                                       ELSE 'none_no_provider' END,
    'existing_provider_earnings', v_earnings,
    'service_family',             public.order_service_family(
                                    v_order.letter_type, v_order.package_key,
                                    v_order.package_display_name, v_order.plan_type,
                                    v_order.parent_order_id),
    'thirty_day_eligible',        public.is_official_letter_30_day_eligible(
                                    v_order.letter_type, v_order.package_key,
                                    v_order.package_display_name, v_order.plan_type,
                                    v_order.parent_order_id, v_order.state));
END;
$$;

COMMENT ON FUNCTION public.admin_force_complete_preview(uuid) IS
  'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001: admin-only read that feeds the force-complete confirmation dialog. Writes nothing.';

-- ── 8. Admin force complete — the authoritative transition ─────────────────
CREATE OR REPLACE FUNCTION public.admin_force_complete_order(
  p_order_id               uuid,
  p_reason                 text,
  p_expected_status        text DEFAULT NULL,
  p_expected_doctor_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_order    public.orders;
  v_actor_id uuid := auth.uid();
  v_name     text;
  v_role     text;
  v_reason   text;
  v_prev_s   text;
  v_prev_ds  text;
  v_has_doc  boolean;
  v_provider boolean;
BEGIN
  -- AUTHORIZATION. The canonical predicate, and nothing else. UI visibility is
  -- not security: a provider, a customer, an authenticated non-admin, the anon
  -- key and a forged JWT all land here and all fail.
  IF NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'admin_force_complete_order: not authorised' USING errcode = 'insufficient_privilege';
  END IF;

  v_reason := public.validate_reopen_reason(p_reason);   -- shared reason contract

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'admin_force_complete_order: order % not found', p_order_id;
  END IF;

  -- STALE / CONCURRENT EDIT. A clean, final refusal — not an exception the UI
  -- would retry, and not a partial write. `orders` has no updated_at by design
  -- (see src/lib/orderLifecycle.ts), so the optimistic token is the pair of
  -- lifecycle values the admin was actually looking at.
  IF p_expected_status IS NOT NULL
     AND (v_order.status IS DISTINCT FROM p_expected_status
          OR coalesce(v_order.doctor_status, '') IS DISTINCT FROM coalesce(p_expected_doctor_status, '')) THEN
    RETURN jsonb_build_object(
      'transitioned', false, 'reason', 'stale_order', 'retryable', false,
      'order_id', v_order.id, 'confirmation_id', v_order.confirmation_id,
      'status', v_order.status, 'doctor_status', v_order.doctor_status,
      'message', 'This order changed while the dialog was open. Close it, reopen the order and try again.');
  END IF;

  v_has_doc  := public.order_has_customer_visible_document(v_order.id);
  v_provider := (v_order.doctor_user_id IS NOT NULL OR v_order.doctor_email IS NOT NULL);

  -- IDEMPOTENT. A repeated submission writes nothing: no second order write, no
  -- second audit row, no second lifecycle event, no second email, no earning.
  IF v_order.status = 'completed' AND v_order.doctor_status = 'patient_notified' THEN
    RETURN jsonb_build_object(
      'transitioned', false, 'reason', 'already_completed', 'idempotent', true,
      'order_id', v_order.id, 'confirmation_id', v_order.confirmation_id,
      'status', v_order.status, 'doctor_status', v_order.doctor_status,
      'has_customer_document', v_has_doc, 'has_provider', v_provider,
      'notify_customer', false,
      'completed_without_customer_document', v_order.completed_without_customer_document,
      'provider_earning_created', false,
      'message', 'This order is already Completed. Nothing was changed.');
  END IF;

  SELECT display_name, role INTO v_name, v_role FROM public.current_staff_actor();
  v_name := coalesce(v_name, 'Employee');
  v_role := coalesce(v_role, 'admin');

  v_prev_s  := v_order.status;
  v_prev_ds := v_order.doctor_status;

  -- The transition RECORDS a decision. It manufactures nothing: no document row,
  -- no document URL, no signature, no verification record, no provider
  -- submission, no provider earning, no provider assignment.
  UPDATE public.orders
     SET status                              = 'completed',
         doctor_status                       = 'patient_notified',
         admin_force_completed_at            = now(),
         admin_force_completed_by            = v_actor_id,
         admin_force_complete_reason         = v_reason,
         completed_without_customer_document = NOT v_has_doc
   WHERE id = v_order.id
  RETURNING * INTO v_order;

  INSERT INTO public.audit_logs (
    actor_id, actor_name, actor_role, actor_type, category, source,
    object_type, object_id, order_id, entity_type, entity_id,
    action, description, old_values, new_values, metadata
  ) VALUES (
    v_actor_id, v_name, v_role, 'employee', 'status', 'admin_portal',
    'order', v_order.confirmation_id, v_order.id, 'order', v_order.id::text,
    'order_admin_force_completed',
    format('%s force-completed order %s (was %s / %s)%s. Reason: %s',
           v_name, v_order.confirmation_id,
           coalesce(v_prev_s, '-'), coalesce(v_prev_ds, '-'),
           CASE WHEN v_has_doc THEN '' ELSE ' with NO customer-visible document' END,
           v_reason),
    jsonb_build_object('status', v_prev_s, 'doctor_status', v_prev_ds),
    jsonb_build_object('status', v_order.status, 'doctor_status', v_order.doctor_status),
    jsonb_build_object(
      'confirmation_id',                    v_order.confirmation_id,
      'order_id',                           v_order.id,
      'override_type',                      'admin_force_complete',
      'reason',                             v_reason,
      'document_present',                   v_has_doc,
      'provider_present',                   v_provider,
      'provider_user_id',                   v_order.doctor_user_id,
      'completed_without_customer_document', NOT v_has_doc,
      'customer_notification_allowed',      v_has_doc,
      'provider_earning_created',           false,
      'task',                               'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001'));

  RETURN jsonb_build_object(
    'transitioned', true,
    'order_id', v_order.id,
    'confirmation_id', v_order.confirmation_id,
    'previous_status', v_prev_s,
    'previous_doctor_status', v_prev_ds,
    'status', v_order.status,
    'doctor_status', v_order.doctor_status,
    'reason', v_reason,
    'actor_name', v_name,
    'has_provider', v_provider,
    'has_customer_document', v_has_doc,
    -- The client sends the completion email ONLY when this is true.
    -- notify-order-status independently refuses the send when it is not.
    'notify_customer', v_has_doc,
    'completed_without_customer_document', NOT v_has_doc,
    'provider_earning_created', false);
END;
$$;

COMMENT ON FUNCTION public.admin_force_complete_order(uuid, text, text, text) IS
  'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001: admin-only override that moves ANY order to the canonical Completed state. is_admin_staff() gated, reason-required, stale-safe, idempotent. Creates no document and no provider earning.';

-- ── 9. LIVE workflow projection — preserve LIVE's branch order exactly and
--       gate only the 30-day reopen marker on an ESA product.
CREATE OR REPLACE FUNCTION public.order_workflow_state(o public.orders)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN o.status = 'cancelled'                                      THEN 'cancelled'
    WHEN o.payment_intent_id IS NULL OR o.status = 'lead'            THEN 'lead'
    WHEN o.doctor_status = 'patient_notified'                        THEN 'completed'
    WHEN o.doctor_status = 'pending_admin_approval'                  THEN 'pending_delivery'
    WHEN public.classify_order_service_family(
           o.letter_type, o.package_key, o.package_display_name, o.plan_type) = 'esa'
         AND o.official_letter_reopened_at IS NOT NULL
         AND o.official_letter_final_completed_at IS NULL            THEN 'reopened'
    WHEN o.doctor_user_id IS NOT NULL OR o.doctor_email IS NOT NULL  THEN 'under_review'
    ELSE 'paid_unassigned'
  END;
$$;

COMMENT ON FUNCTION public.order_workflow_state(public.orders) IS
  'ESA-30-DAY-SCOPE-AND-ADMIN-FORCE-COMPLETE-001 LIVE: canonical workflow projection; the official-letter reopen marker applies only to ESA orders.';

-- ── 10. Grants — revoke by name, then grant only what the admin UI needs ────
REVOKE ALL ON FUNCTION public.classify_order_service_family(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_service_family(text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_official_letter_30_day_eligible(text, text, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.order_has_customer_visible_document(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_force_complete_preview(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_force_complete_order(uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- The two admin RPCs are reached from an authenticated admin session and
-- self-authorize with is_admin_staff(). Nothing else here is exposed to a client.
GRANT EXECUTE ON FUNCTION public.admin_force_complete_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_complete_order(uuid, text, text, text) TO authenticated;
