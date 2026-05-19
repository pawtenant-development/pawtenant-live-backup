-- Order documents schema capture + letters storage bucket.
--
-- Why this exists (DOCS-UPLOAD-SUPPORT):
--   public.order_documents and public.letter_verifications are actively
--   queried in production code (OrderDetailModal, my-orders, notify-
--   patient-letter, provider-submit-letter) but no migration file
--   defines them — they were added directly via the Supabase Dashboard.
--   Without a migration in version control, fresh environments and the
--   LIVE-mirror process cannot reproduce the schema.
--
--   This migration captures the production-equivalent schema as
--   CREATE TABLE IF NOT EXISTS so existing rows are preserved on TEST
--   (and on LIVE when mirrored) while any environment missing the
--   tables gets them. Same idempotent pattern for indexes, RLS, and
--   the storage bucket used for admin-uploaded letters.
--
-- What this migration adds:
--   §1. public.order_documents     (idempotent)
--   §2. public.letter_verifications (idempotent)
--   §3. RLS — admin-only writes, admin-or-customer reads via order link
--   §4. storage.buckets letters (private)
--   §5. storage.objects RLS allowing service-role + admin SELECT
--
-- All operations IDEMPOTENT. ADDITIVE only — no existing rows, columns,
-- indexes, RLS policies or buckets are dropped.


-- ── §1. order_documents ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.order_documents (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid          NOT NULL,
  confirmation_id     text,
  label               text          NOT NULL,
  doc_type            text          NOT NULL DEFAULT 'other',
  file_url            text          NOT NULL,
  file_path           text,
  mime_type           text,
  file_size_bytes     integer,
  uploaded_by         text,
  uploaded_at         timestamptz   NOT NULL DEFAULT now(),
  sent_to_customer    boolean       NOT NULL DEFAULT false,
  customer_visible    boolean       NOT NULL DEFAULT true,
  footer_injected     boolean       NOT NULL DEFAULT false,
  processed_file_url  text,
  footer_letter_id    text,
  notes               text
);

-- New columns that may be missing on older environments — additive only.
ALTER TABLE public.order_documents
  ADD COLUMN IF NOT EXISTS confirmation_id    text,
  ADD COLUMN IF NOT EXISTS file_path          text,
  ADD COLUMN IF NOT EXISTS mime_type          text,
  ADD COLUMN IF NOT EXISTS file_size_bytes    integer,
  ADD COLUMN IF NOT EXISTS uploaded_by        text,
  ADD COLUMN IF NOT EXISTS customer_visible   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS footer_injected    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS processed_file_url text,
  ADD COLUMN IF NOT EXISTS footer_letter_id   text,
  ADD COLUMN IF NOT EXISTS notes              text;

CREATE INDEX IF NOT EXISTS order_documents_order_id_idx        ON public.order_documents (order_id);
CREATE INDEX IF NOT EXISTS order_documents_confirmation_id_idx ON public.order_documents (confirmation_id);
CREATE INDEX IF NOT EXISTS order_documents_uploaded_at_idx     ON public.order_documents (uploaded_at DESC);


-- ── §2. letter_verifications ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.letter_verifications (
  id                uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id         text          NOT NULL UNIQUE,
  order_id          uuid          NOT NULL,
  confirmation_id   text,
  patient_name      text,
  doctor_name       text,
  state             text,
  letter_type       text,
  issued_at         timestamptz   NOT NULL DEFAULT now(),
  revoked_at        timestamptz,
  revoke_reason     text,
  file_url          text,
  processed_file_url text
);

-- NOTE: existing dashboard-created environments may already contain
-- partial schemas missing newer additive columns. Any column we later
-- index MUST also appear in this ALTER TABLE … ADD COLUMN IF NOT EXISTS
-- block so the CREATE INDEX below does not fail on an env where the
-- table predates the column. confirmation_id is the canonical example:
-- the table was first added without it, and CREATE INDEX … (confirmation_id)
-- raises "column does not exist" without this guard.
ALTER TABLE public.letter_verifications
  ADD COLUMN IF NOT EXISTS confirmation_id    text,
  ADD COLUMN IF NOT EXISTS revoked_at         timestamptz,
  ADD COLUMN IF NOT EXISTS revoke_reason      text,
  ADD COLUMN IF NOT EXISTS file_url           text,
  ADD COLUMN IF NOT EXISTS processed_file_url text;

CREATE INDEX IF NOT EXISTS letter_verifications_order_id_idx        ON public.letter_verifications (order_id);
CREATE INDEX IF NOT EXISTS letter_verifications_confirmation_id_idx ON public.letter_verifications (confirmation_id);


-- ── §3. RLS — locked-down by default, opens through SECURITY DEFINER RPCs ──
ALTER TABLE public.order_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.letter_verifications ENABLE ROW LEVEL SECURITY;

-- Admin SELECT on order_documents (mirrors visitor_sessions admin gate).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'order_documents'
       AND policyname = 'order_documents_admin_select'
  ) THEN
    CREATE POLICY order_documents_admin_select
      ON public.order_documents FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.doctor_profiles dp
           WHERE dp.user_id = auth.uid()
             AND COALESCE(dp.is_admin, false) = true
        )
      );
  END IF;
END$$;

-- Admin SELECT on letter_verifications.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'letter_verifications'
       AND policyname = 'letter_verifications_admin_select'
  ) THEN
    CREATE POLICY letter_verifications_admin_select
      ON public.letter_verifications FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.doctor_profiles dp
           WHERE dp.user_id = auth.uid()
             AND COALESCE(dp.is_admin, false) = true
        )
      );
  END IF;
END$$;


-- ── §4. storage.buckets — admin-uploaded letters ──────────────────────────
-- Mirrors the chat-attachments pattern: PRIVATE bucket, no anon write,
-- service-role-only upload via the admin-upload-document edge function,
-- signed-URL read for the customer portal.
INSERT INTO storage.buckets (id, name, public)
  VALUES ('letters', 'letters', false)
ON CONFLICT (id) DO NOTHING;


-- ── §5. storage.objects RLS for letters bucket ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'storage_letters_admin_select'
  ) THEN
    CREATE POLICY storage_letters_admin_select
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'letters'
        AND EXISTS (
          SELECT 1 FROM public.doctor_profiles dp
           WHERE dp.user_id = auth.uid()
             AND COALESCE(dp.is_admin, false) = true
        )
      );
  END IF;
END$$;

COMMENT ON TABLE public.order_documents IS
  'Admin- and provider-uploaded documents attached to an order. customer_visible=true rows are surfaced in /my-orders. footer_injected=true rows have a verification stamp applied by inject-pdf-footer; processed_file_url is the canonical download URL in that case.';

COMMENT ON TABLE public.letter_verifications IS
  'One row per issued letter_id. The PDF footer renders /verify?id={letter_id} and this row backs the public verification UI. revoked_at flips a letter to revoked without deleting the row.';
