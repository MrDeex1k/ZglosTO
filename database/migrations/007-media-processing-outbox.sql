BEGIN;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_processing_job_status') THEN
		CREATE TYPE media_processing_job_status AS ENUM ('pending', 'published', 'processing', 'succeeded', 'failed', 'dead_lettered', 'superseded');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_event_status') THEN
		CREATE TYPE outbox_event_status AS ENUM ('pending', 'publishing', 'published', 'failed', 'discarded');
	END IF;
END$$;

ALTER TABLE incident_images
	ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1 CHECK (revision > 0);

CREATE TABLE IF NOT EXISTS media_processing_jobs (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	image_id uuid NOT NULL REFERENCES incident_images(id) ON DELETE CASCADE,
	image_revision integer NOT NULL CHECK (image_revision > 0),
	incident_id uuid NOT NULL REFERENCES incydenty(id_zgloszenia) ON DELETE CASCADE,
	contract_version smallint NOT NULL DEFAULT 1 CHECK (contract_version = 1),
	status media_processing_job_status NOT NULL DEFAULT 'pending',
	original_object_key text NOT NULL,
	attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
	max_attempts smallint NOT NULL DEFAULT 4 CHECK (max_attempts > 0),
	next_attempt_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	last_failure_code varchar(64),
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (image_id, image_revision),
	CHECK (attempt_count <= max_attempts),
	CHECK (status NOT IN ('failed', 'dead_lettered') OR last_failure_code IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS outbox_events (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	job_id uuid NOT NULL REFERENCES media_processing_jobs(id) ON DELETE CASCADE,
	event_type varchar(128) NOT NULL CHECK (event_type = 'media.image.process.requested'),
	aggregate_type varchar(64) NOT NULL CHECK (aggregate_type = 'incident_image'),
	aggregate_id uuid NOT NULL,
	aggregate_revision integer NOT NULL CHECK (aggregate_revision > 0),
	contract_version smallint NOT NULL DEFAULT 1 CHECK (contract_version = 1),
	correlation_id uuid NOT NULL,
	causation_id uuid NOT NULL,
	traceparent varchar(55) CHECK (traceparent IS NULL OR traceparent ~ '^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$'),
	payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
	status outbox_event_status NOT NULL DEFAULT 'pending',
	publish_attempts smallint NOT NULL DEFAULT 0 CHECK (publish_attempts >= 0),
	available_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	locked_at timestamptz,
	published_at timestamptz,
	last_error_code varchar(64),
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (event_type, aggregate_id, aggregate_revision),
	CHECK (payload->>'contractVersion' = contract_version::text),
	CHECK (payload->>'eventType' = event_type),
	CHECK (payload->>'eventId' = id::text),
	CHECK (payload->>'jobId' = job_id::text),
	CHECK (payload->>'imageId' = aggregate_id::text),
	CHECK ((payload->>'imageRevision')::integer = aggregate_revision),
	CHECK (NOT (payload ?| ARRAY['body', 'bytes', 'base64', 'imageBase64'])),
	CHECK ((status = 'published' AND published_at IS NOT NULL) OR status <> 'published')
);

CREATE TABLE IF NOT EXISTS consumed_messages (
	consumer_name varchar(128) NOT NULL,
	message_id uuid NOT NULL,
	message_type varchar(128) NOT NULL,
	consumed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (consumer_name, message_id)
);

CREATE INDEX IF NOT EXISTS idx_media_processing_jobs_dispatch
	ON media_processing_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_media_processing_jobs_incident_id
	ON media_processing_jobs (incident_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_dispatch
	ON outbox_events (status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_job_id
	ON outbox_events (job_id);

COMMIT;
