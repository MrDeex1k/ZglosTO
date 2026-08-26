DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'status_incydentu_enum') THEN
		CREATE TYPE status_incydentu_enum AS ENUM ('reported', 'in_progress', 'resolved');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'uprawnienia_enum') THEN
		CREATE TYPE uprawnienia_enum AS ENUM ('mieszkaniec', 'sluzby', 'admin');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_image_kind') THEN
		CREATE TYPE incident_image_kind AS ENUM ('report', 'resolution');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_image_status') THEN
		CREATE TYPE incident_image_status AS ENUM ('pending', 'processing', 'ready', 'failed');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'media_processing_job_status') THEN
		CREATE TYPE media_processing_job_status AS ENUM ('pending', 'published', 'processing', 'succeeded', 'failed', 'dead_lettered', 'superseded');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outbox_event_status') THEN
		CREATE TYPE outbox_event_status AS ENUM ('pending', 'publishing', 'published', 'failed', 'discarded');
	END IF;
END$$;

CREATE TABLE IF NOT EXISTS service_types (
	service_key varchar(64) PRIMARY KEY CHECK (service_key ~ '^[a-z][a-z0-9_]*$'),
	enabled boolean NOT NULL DEFAULT TRUE,
	sort_order integer NOT NULL CHECK (sort_order >= 0),
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO service_types (service_key, enabled, sort_order)
VALUES
	('district_heating', TRUE, 10),
	('public_transit', TRUE, 20),
	('municipal_services', TRUE, 30),
	('sewer_emergency', TRUE, 40),
	('roads', TRUE, 50),
	('other', TRUE, 60)
ON CONFLICT (service_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS incydenty (
	id_zgloszenia uuid PRIMARY KEY DEFAULT uuidv7(),
	opis_zgloszenia varchar(255) NOT NULL,
	mail_zglaszajacego varchar(254) NOT NULL CHECK (mail_zglaszajacego = LOWER(BTRIM(mail_zglaszajacego))),
	reporter_user_id text REFERENCES "user"(id) ON DELETE SET NULL,
	adres_zgloszenia varchar(50) NOT NULL,
	latitude double precision,
	longitude double precision,
	sprawdzenie_incydentu boolean NOT NULL DEFAULT FALSE,
	status_incydentu status_incydentu_enum NOT NULL DEFAULT 'reported',
	revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
	service_key varchar(64) NOT NULL REFERENCES service_types(service_key) ON UPDATE CASCADE,
	LLM_odpowiedz text,
	llm_classification text NOT NULL DEFAULT 'unknown' CHECK (llm_classification IN ('municipal', 'emergency', 'unknown')),
	llm_model_available boolean NOT NULL DEFAULT FALSE,
	llm_source text NOT NULL DEFAULT 'fallback' CHECK (llm_source IN ('model', 'fallback')),
	llm_reason text DEFAULT 'unavailable' CHECK (llm_reason IS NULL OR llm_reason IN ('timeout', 'disabled', 'unavailable', 'invalid_response')),
	data_zgloszenia date DEFAULT now(),
	godzina_zgloszenia time DEFAULT now(),
	data_rozwiazania date DEFAULT NULL,
	godzina_rozwiazania time DEFAULT NULL,
	CHECK (
		(llm_source = 'model' AND llm_model_available = TRUE AND llm_reason IS NULL AND llm_classification <> 'unknown')
		OR
		(llm_source = 'fallback' AND llm_model_available = FALSE AND llm_reason IS NOT NULL AND llm_classification = 'unknown')
	),
	CONSTRAINT incydenty_latitude_range_check CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
	CONSTRAINT incydenty_longitude_range_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
	CONSTRAINT incydenty_coordinates_pair_check CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE TABLE IF NOT EXISTS incident_images (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	incident_id uuid NOT NULL REFERENCES incydenty(id_zgloszenia) ON DELETE CASCADE,
	kind incident_image_kind NOT NULL,
	revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
	status incident_image_status NOT NULL DEFAULT 'pending',
	original_object_key text NOT NULL UNIQUE,
	original_mime_type varchar(64) NOT NULL CHECK (original_mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
	original_size_bytes integer NOT NULL CHECK (original_size_bytes > 0 AND original_size_bytes <= 5242880),
	original_checksum_sha256 char(64) NOT NULL CHECK (original_checksum_sha256 ~ '^[0-9a-f]{64}$'),
	original_deleted_at timestamptz,
	processed_object_key text UNIQUE,
	processed_mime_type varchar(64) CHECK (processed_mime_type IS NULL OR processed_mime_type = 'image/webp'),
	processed_size_bytes integer CHECK (processed_size_bytes IS NULL OR processed_size_bytes > 0),
	processed_checksum_sha256 char(64) CHECK (processed_checksum_sha256 IS NULL OR processed_checksum_sha256 ~ '^[0-9a-f]{64}$'),
	width integer CHECK (width IS NULL OR width > 0),
	height integer CHECK (height IS NULL OR height > 0),
	failure_code varchar(64),
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (incident_id, kind),
	CHECK (
		(status IN ('pending', 'processing') AND processed_object_key IS NULL AND processed_mime_type IS NULL AND processed_size_bytes IS NULL AND processed_checksum_sha256 IS NULL AND failure_code IS NULL)
		OR (status = 'ready' AND processed_object_key IS NOT NULL AND processed_mime_type = 'image/webp' AND processed_size_bytes IS NOT NULL AND processed_checksum_sha256 IS NOT NULL AND failure_code IS NULL)
		OR (status = 'failed' AND failure_code IS NOT NULL)
	)
);

CREATE TABLE IF NOT EXISTS image_uploads (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	kind incident_image_kind NOT NULL,
	incident_id uuid REFERENCES incydenty(id_zgloszenia) ON DELETE CASCADE,
	object_key text NOT NULL UNIQUE,
	mime_type varchar(64) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
	size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
	checksum_sha256 char(64) NOT NULL CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
	status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed')),
	expires_at timestamptz NOT NULL,
	consumed_at timestamptz,
	created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CHECK ((kind = 'report' AND incident_id IS NULL) OR (kind = 'resolution' AND incident_id IS NOT NULL)),
	CHECK ((status = 'consumed' AND consumed_at IS NOT NULL) OR (status = 'pending' AND consumed_at IS NULL))
);

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

CREATE OR REPLACE VIEW incident_image_api_refs AS
SELECT
	incident_id,
	kind,
	jsonb_build_object(
		'id', id::text,
		'kind', kind::text,
		'status', status::text,
		'original', jsonb_build_object(
			'objectKey', original_object_key,
			'mimeType', original_mime_type,
			'sizeBytes', original_size_bytes,
			'checksumSha256', original_checksum_sha256
		),
		'processed', CASE WHEN processed_object_key IS NULL THEN NULL ELSE jsonb_build_object(
			'objectKey', processed_object_key,
			'mimeType', processed_mime_type,
			'sizeBytes', processed_size_bytes,
			'checksumSha256', processed_checksum_sha256
		) END,
		'width', width,
		'height', height,
		'failureCode', failure_code,
		'url', '/api/images/' || id::text
	) AS image_ref
FROM incident_images;

CREATE TABLE IF NOT EXISTS uzytkownicy (
	id_uzytkownika text PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
	uprawnienia uprawnienia_enum NOT NULL DEFAULT 'mieszkaniec',
	service_key varchar(64) DEFAULT NULL REFERENCES service_types(service_key) ON UPDATE CASCADE,
	CHECK (uprawnienia = 'sluzby' OR service_key IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_incydenty_mail_zglaszajacego ON incydenty (mail_zglaszajacego);
CREATE INDEX IF NOT EXISTS idx_incydenty_reporter_user_id ON incydenty (reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_incydenty_status ON incydenty (status_incydentu);
CREATE INDEX IF NOT EXISTS idx_incydenty_service_key ON incydenty (service_key);
CREATE INDEX IF NOT EXISTS idx_incydenty_public_resolved_order
	ON incydenty (
		data_rozwiazania DESC NULLS LAST,
		godzina_rozwiazania DESC NULLS LAST,
		id_zgloszenia DESC
	)
	WHERE status_incydentu = 'resolved';
CREATE INDEX IF NOT EXISTS idx_incident_images_incident_id ON incident_images (incident_id);
CREATE INDEX IF NOT EXISTS idx_incident_images_original_cleanup
	ON incident_images (updated_at)
	WHERE status = 'ready' AND original_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_image_uploads_pending_expiry
	ON image_uploads (expires_at)
	WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_media_processing_jobs_dispatch ON media_processing_jobs (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_media_processing_jobs_incident_id ON media_processing_jobs (incident_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_dispatch ON outbox_events (status, available_at, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_events_job_id ON outbox_events (job_id);
CREATE INDEX IF NOT EXISTS idx_outbox_events_recovery ON outbox_events (status, locked_at) WHERE status = 'publishing';
CREATE INDEX IF NOT EXISTS idx_uzytkownicy_service_key ON uzytkownicy (service_key);

CREATE OR REPLACE FUNCTION ensure_active_service_assignment()
RETURNS trigger AS $$
BEGIN
	IF NEW.service_key IS NULL THEN
		RETURN NEW;
	END IF;

	IF NOT EXISTS (
		SELECT 1 FROM service_types
		WHERE service_key = NEW.service_key AND enabled = TRUE
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23514',
			MESSAGE = format('serviceKey %s is inactive or unknown', NEW.service_key);
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incydenty_require_active_service ON incydenty;
CREATE TRIGGER incydenty_require_active_service
BEFORE INSERT OR UPDATE OF service_key ON incydenty
FOR EACH ROW EXECUTE FUNCTION ensure_active_service_assignment();

DROP TRIGGER IF EXISTS uzytkownicy_require_active_service ON uzytkownicy;
CREATE TRIGGER uzytkownicy_require_active_service
BEFORE INSERT OR UPDATE OF service_key ON uzytkownicy
FOR EACH ROW EXECUTE FUNCTION ensure_active_service_assignment();
