-- Migration 009: RabbitMQ message envelope metadata.
BEGIN;

ALTER TABLE outbox_events
	ADD COLUMN IF NOT EXISTS correlation_id uuid,
	ADD COLUMN IF NOT EXISTS causation_id uuid,
	ADD COLUMN IF NOT EXISTS traceparent varchar(55);

UPDATE outbox_events
SET correlation_id = COALESCE(correlation_id, id),
	causation_id = COALESCE(causation_id, id)
WHERE correlation_id IS NULL OR causation_id IS NULL;

ALTER TABLE outbox_events
	ALTER COLUMN correlation_id SET NOT NULL,
	ALTER COLUMN causation_id SET NOT NULL;

DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'outbox_events_traceparent_check'
			AND conrelid = 'outbox_events'::regclass
	) THEN
		ALTER TABLE outbox_events
			ADD CONSTRAINT outbox_events_traceparent_check
			CHECK (traceparent IS NULL OR traceparent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$');
	END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_outbox_events_recovery
	ON outbox_events (status, locked_at)
	WHERE status = 'publishing';

COMMIT;
