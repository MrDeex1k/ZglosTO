BEGIN;

CREATE TABLE IF NOT EXISTS service_types (
  service_key varchar(64) PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT TRUE,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (service_key ~ '^[a-z][a-z0-9_]*$')
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

ALTER TABLE incydenty ADD COLUMN IF NOT EXISTS service_key varchar(64);
ALTER TABLE uzytkownicy ADD COLUMN IF NOT EXISTS service_key varchar(64);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'incydenty' AND column_name = 'typ_sluzby'
  ) THEN
    UPDATE incydenty AS incident
    SET service_key = service.service_key
    FROM (VALUES
      ('district_heating', 'Miejskie Przedsiębiorstwo Energetyki Cieplnej'),
      ('public_transit', 'Miejskie Przedsiębiorstwo Komunikacyjne'),
      ('municipal_services', 'Zakład Gospodarki Komunalnej'),
      ('sewer_emergency', 'Pogotowie Kanalizacyjne'),
      ('roads', 'Zarząd Dróg'),
      ('other', 'Inne')
    ) AS service(service_key, legacy_database_value)
    WHERE incident.service_key IS NULL
      AND incident.typ_sluzby::text = service.legacy_database_value;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uzytkownicy' AND column_name = 'typ_uprawnien'
  ) THEN
    UPDATE uzytkownicy AS app_user
    SET service_key = service.service_key
    FROM (VALUES
      ('district_heating', 'Miejskie Przedsiębiorstwo Energetyki Cieplnej'),
      ('public_transit', 'Miejskie Przedsiębiorstwo Komunikacyjne'),
      ('municipal_services', 'Zakład Gospodarki Komunalnej'),
      ('sewer_emergency', 'Pogotowie Kanalizacyjne'),
      ('roads', 'Zarząd Dróg'),
      ('other', 'Inne')
    ) AS service(service_key, legacy_database_value)
    WHERE app_user.service_key IS NULL
      AND app_user.typ_uprawnien::text = service.legacy_database_value;
  END IF;
END
$$;

DO $$
DECLARE
  unmapped_incidents bigint;
  unmapped_users bigint;
BEGIN
  SELECT COUNT(*) INTO unmapped_incidents
  FROM incydenty
  WHERE service_key IS NULL;

  SELECT COUNT(*) INTO unmapped_users
  FROM uzytkownicy
  WHERE uprawnienia = 'sluzby' AND service_key IS NULL;

  IF unmapped_incidents > 0 THEN
    RAISE EXCEPTION 'Cannot migrate % incidents without a known serviceKey', unmapped_incidents;
  END IF;
  IF unmapped_users > 0 THEN
    RAISE EXCEPTION 'Cannot migrate % service users without a known serviceKey', unmapped_users;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incydenty_service_key_fkey'
      AND conrelid = 'incydenty'::regclass
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_service_key_fkey
      FOREIGN KEY (service_key) REFERENCES service_types(service_key) ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uzytkownicy_service_key_fkey'
      AND conrelid = 'uzytkownicy'::regclass
  ) THEN
    ALTER TABLE uzytkownicy
      ADD CONSTRAINT uzytkownicy_service_key_fkey
      FOREIGN KEY (service_key) REFERENCES service_types(service_key) ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uzytkownicy_service_assignment_valid'
      AND conrelid = 'uzytkownicy'::regclass
  ) THEN
    ALTER TABLE uzytkownicy
      ADD CONSTRAINT uzytkownicy_service_assignment_valid
      CHECK (uprawnienia = 'sluzby' OR service_key IS NULL);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_incydenty_service_key ON incydenty (service_key);
CREATE INDEX IF NOT EXISTS idx_uzytkownicy_service_key ON uzytkownicy (service_key);

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'uzytkownicy'::regclass
      AND pg_get_constraintdef(oid) LIKE '%typ_uprawnien%'
  LOOP
    EXECUTE format('ALTER TABLE uzytkownicy DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END
$$;

DROP INDEX IF EXISTS idx_incydenty_typ_sluzby;
ALTER TABLE incydenty DROP COLUMN IF EXISTS typ_sluzby;
ALTER TABLE uzytkownicy DROP COLUMN IF EXISTS typ_uprawnien;
DROP TYPE IF EXISTS typ_sluzby_enum;
ALTER TABLE service_types DROP COLUMN IF EXISTS legacy_database_value;

COMMIT;
