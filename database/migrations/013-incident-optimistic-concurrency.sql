-- Migration 013: optimistic concurrency for incident updates.
ALTER TABLE incydenty
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'incydenty_revision_positive_check'
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_revision_positive_check CHECK (revision > 0);
  END IF;
END$$;
