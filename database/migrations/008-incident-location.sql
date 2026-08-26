BEGIN;

ALTER TABLE incydenty
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'incydenty'::regclass
      AND conname = 'incydenty_latitude_range_check'
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_latitude_range_check
      CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'incydenty'::regclass
      AND conname = 'incydenty_longitude_range_check'
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_longitude_range_check
      CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'incydenty'::regclass
      AND conname = 'incydenty_coordinates_pair_check'
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_coordinates_pair_check
      CHECK ((latitude IS NULL) = (longitude IS NULL));
  END IF;
END
$$;

COMMENT ON COLUMN incydenty.latitude IS
  'Optional WGS84 latitude supplied with the incident; never required for persistence.';
COMMENT ON COLUMN incydenty.longitude IS
  'Optional WGS84 longitude supplied with the incident; never required for persistence.';

COMMIT;
