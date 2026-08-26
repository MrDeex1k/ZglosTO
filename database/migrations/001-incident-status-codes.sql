BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_incydentu_enum'
      AND e.enumlabel = 'ZGŁOSZONY'
  ) THEN
    ALTER TYPE status_incydentu_enum RENAME VALUE 'ZGŁOSZONY' TO 'reported';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_incydentu_enum'
      AND e.enumlabel = 'W TRAKCIE NAPRAWY'
  ) THEN
    ALTER TYPE status_incydentu_enum RENAME VALUE 'W TRAKCIE NAPRAWY' TO 'in_progress';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'status_incydentu_enum'
      AND e.enumlabel = 'NAPRAWIONY'
  ) THEN
    ALTER TYPE status_incydentu_enum RENAME VALUE 'NAPRAWIONY' TO 'resolved';
  END IF;
END
$$;

ALTER TABLE incydenty
  ALTER COLUMN status_incydentu SET DEFAULT 'reported';

DO $$
DECLARE
  status_values text[];
  status_default text;
BEGIN
  SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
  INTO status_values
  FROM pg_enum e
  JOIN pg_type t ON t.oid = e.enumtypid
  WHERE t.typname = 'status_incydentu_enum';

  IF status_values IS DISTINCT FROM ARRAY['reported', 'in_progress', 'resolved'] THEN
    RAISE EXCEPTION 'Unexpected incident statuses after migration: %', status_values;
  END IF;

  SELECT column_default
  INTO status_default
  FROM information_schema.columns
  WHERE table_name = 'incydenty'
    AND column_name = 'status_incydentu';

  IF status_default IS NULL OR status_default NOT LIKE '%reported%' THEN
    RAISE EXCEPTION 'Unexpected incident status default after migration: %', status_default;
  END IF;
END
$$;

COMMIT;
