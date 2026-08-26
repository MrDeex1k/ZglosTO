BEGIN;

ALTER TABLE incydenty
  ALTER COLUMN mail_zglaszajacego TYPE varchar(254);

UPDATE incydenty
SET mail_zglaszajacego = LOWER(BTRIM(mail_zglaszajacego));

ALTER TABLE incydenty
  ADD COLUMN IF NOT EXISTS reporter_user_id text REFERENCES "user"(id) ON DELETE SET NULL;

WITH unique_verified_users AS (
  SELECT (ARRAY_AGG(id ORDER BY id))[1] AS id, LOWER(BTRIM(email)) AS normalized_email
  FROM "user"
  WHERE email_verified = TRUE
  GROUP BY LOWER(BTRIM(email))
  HAVING COUNT(*) = 1
)
UPDATE incydenty AS incident
SET reporter_user_id = verified_user.id
FROM unique_verified_users AS verified_user
WHERE incident.reporter_user_id IS NULL
  AND incident.mail_zglaszajacego = verified_user.normalized_email;

CREATE INDEX IF NOT EXISTS idx_incydenty_reporter_user_id
  ON incydenty (reporter_user_id);

DROP INDEX IF EXISTS idx_incydenty_mail_zglaszajacego;
CREATE INDEX idx_incydenty_mail_zglaszajacego
  ON incydenty (mail_zglaszajacego);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'incydenty_reporter_email_normalized'
      AND conrelid = 'incydenty'::regclass
  ) THEN
    ALTER TABLE incydenty
      ADD CONSTRAINT incydenty_reporter_email_normalized
      CHECK (mail_zglaszajacego = LOWER(BTRIM(mail_zglaszajacego)));
  END IF;
END
$$;

COMMIT;
