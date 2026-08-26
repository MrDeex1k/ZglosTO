BEGIN;

-- The installation contains only disposable test data from the previous bytea model. The
-- guard keeps this destructive one-time transition idempotent for the repository migration runner.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.columns
		WHERE table_schema = 'public'
			AND table_name = 'incydenty'
			AND column_name IN ('zdjecie_incydentu_zglaszanego', 'zdjecie_incydentu_rozwiazanego')
	) THEN
		TRUNCATE TABLE incydenty CASCADE;
	END IF;
END$$;

ALTER TABLE incydenty
	DROP COLUMN IF EXISTS zdjecie_incydentu_zglaszanego,
	DROP COLUMN IF EXISTS zdjecie_incydentu_rozwiazanego;

DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_image_kind') THEN
		CREATE TYPE incident_image_kind AS ENUM ('report', 'resolution');
	END IF;
	IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_image_status') THEN
		CREATE TYPE incident_image_status AS ENUM ('pending', 'processing', 'ready', 'failed');
	END IF;
END$$;

CREATE TABLE IF NOT EXISTS incident_images (
	id uuid PRIMARY KEY DEFAULT uuidv7(),
	incident_id uuid NOT NULL REFERENCES incydenty(id_zgloszenia) ON DELETE CASCADE,
	kind incident_image_kind NOT NULL,
	status incident_image_status NOT NULL DEFAULT 'pending',
	original_object_key text NOT NULL UNIQUE,
	original_mime_type varchar(64) NOT NULL CHECK (original_mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
	original_size_bytes integer NOT NULL CHECK (original_size_bytes > 0 AND original_size_bytes <= 5242880),
	original_checksum_sha256 char(64) NOT NULL CHECK (original_checksum_sha256 ~ '^[0-9a-f]{64}$'),
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

CREATE INDEX IF NOT EXISTS idx_incident_images_incident_id ON incident_images (incident_id);

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

COMMIT;
