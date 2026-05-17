-- ──────────────────────────────────────────────────────────────────────────
-- CONSULTATION REQUESTS — unpaid lead recovery funnel V1
--
-- Lightweight table that captures a customer's request for a preferred
-- consultation / callback window. This is NOT a real provider calendar —
-- it's a soft-touch operational request used by the care team to follow
-- up with unpaid / high-intent leads before they ghost.
--
-- Linkage strategy (any subset may be present):
--   - order_id                  → uuid, references orders(id) when known
--   - confirmation_number       → text, mirrors orders.confirmation_id
--   - customer_email            → always captured
--   - linked_visitor_session_id → text, mirrors attributionStore.session_id
--
-- RLS posture mirrors contact_submissions:
--   - anon INSERT  → allowed but locked down via WITH CHECK so admin-only
--                    fields can't be poisoned by a public submit
--   - anon SELECT  → allowed (admin portal reads via anon client today)
--   - anon UPDATE  → allowed (admin portal status updates)
--   - DELETE       → no policy (service role only)
--
-- Idempotent + non-destructive. Safe to re-run.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.consultation_requests (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  -- Linkage (all optional; at least one of order_id / confirmation_number /
  -- customer_email is expected — enforced at the application layer to keep
  -- this DDL portable).
  order_id                    uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  confirmation_number         text,
  customer_email              text NOT NULL,
  customer_phone              text,
  customer_name               text,

  -- Customer request fields
  preferred_day               text,
  preferred_time_window       text,
  timezone                    text,
  preferred_contact_method    text,
  notes                       text,

  -- Operational
  source_context              text NOT NULL DEFAULT 'direct_link',
  status                      text NOT NULL DEFAULT 'new',
  assigned_to                 uuid,
  linked_visitor_session_id   text,
  converted_order_paid_at     timestamptz,
  internal_notes              text
);

-- ── Constraints (idempotent) ──────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_requests_status_check') THEN
    ALTER TABLE public.consultation_requests
      ADD CONSTRAINT consultation_requests_status_check
      CHECK (status IN (
        'new',
        'attempted_contact',
        'scheduled',
        'spoke_with_customer',
        'converted_paid',
        'no_answer',
        'closed'
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_requests_source_check') THEN
    ALTER TABLE public.consultation_requests
      ADD CONSTRAINT consultation_requests_source_check
      CHECK (source_context IN (
        'email_recovery',
        'checkout_prompt',
        'assessment_prompt',
        'manual',
        'direct_link'
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'consultation_requests_contact_method_check') THEN
    ALTER TABLE public.consultation_requests
      ADD CONSTRAINT consultation_requests_contact_method_check
      CHECK (preferred_contact_method IS NULL OR preferred_contact_method IN (
        'phone',
        'sms',
        'email'
      ));
  END IF;
END$$;

-- ── Indexes ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS consultation_requests_created_at_desc_idx
  ON public.consultation_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS consultation_requests_status_idx
  ON public.consultation_requests (status);

CREATE INDEX IF NOT EXISTS consultation_requests_email_idx
  ON public.consultation_requests (customer_email);

CREATE INDEX IF NOT EXISTS consultation_requests_order_idx
  ON public.consultation_requests (order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultation_requests_confirmation_idx
  ON public.consultation_requests (confirmation_number)
  WHERE confirmation_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultation_requests_session_idx
  ON public.consultation_requests (linked_visitor_session_id)
  WHERE linked_visitor_session_id IS NOT NULL;

-- ── updated_at trigger ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consultation_requests_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'consultation_requests_set_updated_at_trg'
  ) THEN
    CREATE TRIGGER consultation_requests_set_updated_at_trg
      BEFORE UPDATE ON public.consultation_requests
      FOR EACH ROW
      EXECUTE FUNCTION public.consultation_requests_set_updated_at();
  END IF;
END$$;

-- ── RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.consultation_requests ENABLE ROW LEVEL SECURITY;

-- Anon (public site) may INSERT a new request, but ONLY with the safe
-- subset of fields populated. Admin-only fields must be NULL or default
-- on insert; the status must be 'new'. This blocks abuse of the public
-- write path to seed fake "converted" rows or hijack an admin assignment.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='consultation_requests'
       AND policyname='consultation_requests_insert_anon'
  ) THEN
    CREATE POLICY "consultation_requests_insert_anon"
      ON public.consultation_requests
      FOR INSERT
      WITH CHECK (
        status = 'new'
        AND assigned_to IS NULL
        AND converted_order_paid_at IS NULL
        AND internal_notes IS NULL
        AND customer_email IS NOT NULL
        AND length(customer_email) <= 320
        AND (customer_phone IS NULL OR length(customer_phone) <= 50)
        AND (notes IS NULL OR length(notes) <= 2000)
      );
  END IF;
END$$;

-- Admin portal reads via anon client (same posture as contact_submissions
-- and chats). Admin role gating happens at the UI / sidebar level.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='consultation_requests'
       AND policyname='consultation_requests_read_all'
  ) THEN
    CREATE POLICY "consultation_requests_read_all"
      ON public.consultation_requests
      FOR SELECT
      USING (true);
  END IF;
END$$;

-- Admin portal updates (status flips, internal notes, assignment) via anon
-- client. Same posture as contact_submissions_update_all.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='consultation_requests'
       AND policyname='consultation_requests_update_all'
  ) THEN
    CREATE POLICY "consultation_requests_update_all"
      ON public.consultation_requests
      FOR UPDATE
      USING (true)
      WITH CHECK (true);
  END IF;
END$$;

-- No DELETE policy — destructive deletes go through service role only.

-- Realtime publication so the admin tab can auto-refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime'
      AND schemaname='public'
      AND tablename='consultation_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consultation_requests;
  END IF;
END$$;

-- ──────────────────────────────────────────────────────────────────────────
-- EMAIL TEMPLATE — Consultation Window Offer (unpaid lead recovery)
--
-- Seeded into the existing email_templates table so admins can edit it in
-- Settings → Templates. Sending is NOT automated by this migration — admins
-- can use it manually from the order detail / customer view today. Future
-- automation will be wired in a follow-up after operations validate the
-- copy and the in-bound consultation request volume.
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO email_templates (id, label, "group", subject, body, cta_label, cta_url, channel, slug)
VALUES (
  'consultation_window_offer',
  'Consultation Window Offer',
  'Lead Recovery',
  'Confirm your preferred consultation window',
  E'Hi {name},\n\nThanks for starting your {letter_type} application with PawTenant. We noticed you didn''t finish, and we wanted to make it easier — not harder — to get the documentation guidance you need.\n\nIf it would help, our care team can call or message you at a time that works for you. We''ll walk through the ESA documentation process, answer any questions, and help you decide what''s right for your situation.\n\nESA documentation is only issued after provider review, based on clinical appropriateness, and following completed payment — this consultation window is a no-pressure conversation, not an evaluation.\n\nPick a time that works for you and our team will reach out.',
  'Request Consultation Window',
  '{consultation_request_url}',
  'email',
  'consultation_window_offer'
)
ON CONFLICT (id) DO NOTHING;
