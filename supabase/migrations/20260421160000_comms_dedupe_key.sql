-- comms_dedupe_key: add deterministic dedupe key + unique index to communications
-- so outbound email sends can be reserved atomically BEFORE hitting Resend.
-- Idempotent — safe on fresh and live DBs.

ALTER TABLE communications
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

-- Partial UNIQUE index: only enforced where dedupe_key IS NOT NULL so existing
-- rows without a key (legacy SMS/call logs) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS communications_dedupe_key_uniq
  ON communications (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS communications_status_idx
  ON communications (status);
