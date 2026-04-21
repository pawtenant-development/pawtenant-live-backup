-- comms_unify_email: extend `communications` table to log email sends alongside SMS/calls.
-- Idempotent — safe for fresh DBs and live DBs where the table already exists.

-- The communications table is created outside of the migrations folder on the live DB
-- (see ghl-send-sms / twilio-* edge fns). Create defensively here for local/test envs.
CREATE TABLE IF NOT EXISTS communications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID,
  confirmation_id TEXT,
  type            TEXT NOT NULL,
  direction       TEXT,
  body            TEXT,
  phone_from      TEXT,
  phone_to        TEXT,
  status          TEXT,
  sent_by         TEXT,
  twilio_sid      TEXT,
  duration_seconds INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Email-side columns
ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS email_to        TEXT,
  ADD COLUMN IF NOT EXISTS email_from      TEXT,
  ADD COLUMN IF NOT EXISTS subject         TEXT,
  ADD COLUMN IF NOT EXISTS slug            TEXT,
  ADD COLUMN IF NOT EXISTS template_source TEXT;

CREATE INDEX IF NOT EXISTS communications_order_id_idx        ON communications (order_id);
CREATE INDEX IF NOT EXISTS communications_confirmation_id_idx ON communications (confirmation_id);
CREATE INDEX IF NOT EXISTS communications_type_idx            ON communications (type);
CREATE INDEX IF NOT EXISTS communications_slug_idx            ON communications (slug);
