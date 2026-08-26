-- Migration 012: presigned image upload lifecycle.
BEGIN;

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

ALTER TABLE incident_images
	ADD COLUMN IF NOT EXISTS original_deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_image_uploads_pending_expiry
	ON image_uploads (expires_at)
	WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_incident_images_original_cleanup
	ON incident_images (updated_at)
	WHERE status = 'ready' AND original_deleted_at IS NULL;

COMMIT;
