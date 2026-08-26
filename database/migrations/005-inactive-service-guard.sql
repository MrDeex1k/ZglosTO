BEGIN;

CREATE OR REPLACE FUNCTION ensure_active_service_assignment()
RETURNS trigger AS $$
BEGIN
  IF NEW.service_key IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM service_types
    WHERE service_key = NEW.service_key
      AND enabled = TRUE
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
FOR EACH ROW
EXECUTE FUNCTION ensure_active_service_assignment();

DROP TRIGGER IF EXISTS uzytkownicy_require_active_service ON uzytkownicy;
CREATE TRIGGER uzytkownicy_require_active_service
BEFORE INSERT OR UPDATE OF service_key ON uzytkownicy
FOR EACH ROW
EXECUTE FUNCTION ensure_active_service_assignment();

COMMIT;
